"""Prepare a small, provisional AIHub 71368 head dataset; never train a model.

Fixed scene split: cafe 95 -> train, theatre 4 -> val. Outdoor 100 is audited
but excluded because visual sampling found possibly unlabelled bystanders.
Selection: numeric frame order, zero-based indices 0, stride, ... and last.
This is a three-scene source audit, not an independent test dataset.
"""

import argparse
import json
import math
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml
from PIL import Image

if __package__:
    from .prepare_head_dataset import read_labels, sha256
else:
    from prepare_head_dataset import read_labels, sha256

SCENES = {"북촌까페095": (95, "train"), "북촌공연장004": (4, "val"), "북촌포구100": (100, None)}
EXCLUSION = "possible_unlabelled_bystanders"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nfc(value):
    return unicodedata.normalize("NFC", value)


def basename(value):
    require(isinstance(value, str) and value not in ("", ".", ".."), "Invalid image name")
    require("/" not in value and "\\" not in value, f"External image reference: {value}")
    return nfc(value)


def inventory(raw):
    root = raw.expanduser().absolute()
    require(not any(p.is_symlink() for p in (root, *root.parents)), f"Symlink input: {root}")
    require(root.is_dir(), f"Input directory missing: {root}")
    root = root.resolve()
    paths = list(root.rglob("*"))
    require(not any(p.is_symlink() for p in paths), f"Symlink inside input: {root}")
    return root.resolve(), [p for p in paths if p.is_file()]


def check_image(path, expected=None):
    with Image.open(path) as im:
        require(im.format == "JPEG", f"Not a JPEG: {path}")
        require(im.getexif().get(274, 1) == 1, f"Image is not EXIF-upright: {path}")
        require(expected is None or im.size == expected, f"Image size mismatch: {path}: {im.size}")
        im.verify()


def audit_source(root, files):
    images, groups, referenced, clips = {}, {}, set(), []
    for path in files:
        if path.suffix.lower() in (".jpg", ".jpeg"):
            key = basename(path.name)
            require(key not in images, f"Duplicate NFC image basename: {key}")
            images[key] = path
    cctv_jsons = cctv_points = 0
    for path in sorted(p for p in files if p.suffix.lower() == ".json"):
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        parts = [nfc(part) for part in path.relative_to(root).parts]
        if "1.CCTV" in parts:
            frame = data.get("image")
            require(isinstance(frame, dict), f"Unexpected CCTV metadata: {path}")
            key = basename(frame.get("imagename"))
            require(key in images, f"Missing CCTV image: {key}")
            objects = frame.get("crowdinfo", {}).get("objects")
            require(isinstance(objects, list) and all("bbox" not in obj and len(obj.get("directionindex", [])) == 2 for obj in objects),
                    f"Expected excluded point-only CCTV labels: {path}")
            referenced.add(key)
            cctv_jsons += 1
            cctv_points += len(objects)
            continue  # Point labels are never converted into invented head boxes.
        require("2.시나리오" in parts, f"Unsupported annotation directory: {path}")
        name = nfc(data.get("videoname", ""))
        require(name in SCENES and name not in groups, f"Unknown/duplicate scenario: {name}")
        require(data.get("size") == {"width": 1920, "height": 1080}, f"Unexpected size: {path}")
        frames = data.get("image")
        require(isinstance(frames, list) and frames, f"Expected nonempty scenario image list: {path}")
        group_id, split = SCENES[name]
        expected_type = 2 if group_id == 100 else 1
        require(data.get("header", {}).get("type") == expected_type, f"Indoor/outdoor metadata mismatch: {path}")
        group = {"group_id": group_id, "name": name, "split": split, "source_json": str(path),
                 "source_json_sha256": sha256(path), "frames": [], "box_count": 0}
        ids = set()
        for frame in frames:
            key = basename(frame.get("imagename"))
            match = re.search(r"_(\d+)\.jpe?g$", key, re.IGNORECASE)
            require(match is not None, f"Missing numeric frame ID: {key}")
            frame_id = int(match.group(1))
            require(frame_id not in ids and key not in referenced, f"Duplicate frame: {key}")
            require(key in images, f"Missing scenario image: {key}")
            ids.add(frame_id)
            referenced.add(key)
            check_image(images[key], (1920, 1080))
            crowd = frame.get("crowdinfo", {})
            objects = crowd.get("objects")
            require(isinstance(objects, list), f"Missing objects: {key}")
            require(crowd.get("counting") == len(objects), f"Object count mismatch: {key}")
            labels, uids, boxes = [], set(), set()
            for obj in objects:
                uid, box = obj.get("UID"), obj.get("bbox")
                require(isinstance(uid, int) and not isinstance(uid, bool) and uid not in uids,
                        f"Missing/duplicate UID: {key}: {uid}")
                uids.add(uid)
                require(not any(k in obj for k in ("headpoint", "head_point", "point", "points")),
                        f"Mixed point/bbox annotation: {key}: {uid}")
                require(isinstance(box, list) and len(box) == 4, f"Missing head bbox: {key}: {uid}")
                require(all(type(v) in (int, float) and math.isfinite(v) for v in box),
                        f"Nonfinite/nonnumeric bbox: {key}: {uid}")
                x, y, width, height = box
                require(width > 0 and height > 0, f"Nonpositive bbox: {key}: {uid}")
                original = (x, y, x + width, y + height)
                clipped = (max(0, x), max(0, y), min(1920, x + width), min(1080, y + height))
                left, top, right, bottom = clipped
                require(right > left and bottom > top, f"Empty clipped bbox: {key}: {uid}")
                require(clipped not in boxes, f"Duplicate bbox: {key}: {uid}")
                boxes.add(clipped)
                if clipped != original:
                    clips.append({"group_id": group_id, "frame_id": frame_id, "image": key,
                                  "UID": uid, "original_xywh": box, "clipped_xyxy": clipped})
                values = ((left + right) / 3840, (top + bottom) / 2160,
                          (right - left) / 1920, (bottom - top) / 1080)
                row = "0 " + " ".join(f"{v:.10f}" for v in values)
                require(all(float(v) > 0 for v in row.split()[3:]), f"Rounded empty bbox: {key}")
                labels.append(row)
            require(len(labels) == len(set(labels)), f"Duplicate rounded labels: {key}")
            group["box_count"] += len(labels)
            group["frames"].append({"frame_id": frame_id, "source_image": str(images[key]),
                                    "box_count": len(labels), "_labels": "\n".join(labels) + ("\n" if labels else "")})
        group["frames"].sort(key=lambda entry: entry["frame_id"])
        groups[name] = group
    require(set(groups) == set(SCENES), "Expected exactly the three known scenario JSON files")
    excluded = {"cctv_point_jsons": cctv_jsons, "cctv_point_objects": cctv_points,
                "cctv_exclusion_reason": "head_points_only_not_head_bboxes; unlabeled CCTV images are not negatives",
                "unreferenced_images": len(set(images) - referenced), "all_source_images": len(images)}
    return groups, clips, excluded


def local_records(root, files):
    config = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8-sig"))
    require(config.get("names") in ({0: "head"}, {"0": "head"}, ["head"]), "Local names must be only head")
    records = []
    for split in ("train", "val"):
        require(config.get(split) == f"images/{split}", f"Unexpected local {split} path")
        imgs = sorted(p for p in files if p.parent == root / "images" / split and p.suffix.lower() in (".jpg", ".jpeg"))
        labs = {p.stem: p for p in files if p.parent == root / "labels" / split and p.suffix == ".txt"}
        require(imgs and len({p.stem for p in imgs}) == len(imgs), f"Missing/duplicate local images: {split}")
        require(set(labs) == {p.stem for p in imgs}, f"Local image/label mismatch: {split}")
        for index, path in enumerate(imgs, 1):
            check_image(path)
            label = labs[path.stem]
            _, count = read_labels(label)
            records.append({"origin": "local_cafeteria", "split": split, "source_image": str(path),
                            "source_label": str(label), "box_count": count, "stem": f"local_{split}_{index:04d}"})
    return records


def prepare(args):
    require(args.stride > 0, "--stride must be positive")
    output = args.output.expanduser().absolute()
    require(not output.exists() and not output.is_symlink(), f"Output already exists: {output}")
    output = output.resolve()
    require(output.parent.is_dir(), "Output parent must already exist")
    source, files = inventory(args.source)
    require(not output.is_relative_to(source), "Output cannot be inside source")
    local = inventory(args.cafeteria_data) if args.cafeteria_data else None
    require(local is None or not output.is_relative_to(local[0]), "Output cannot be inside local data")
    groups, clips, excluded = audit_source(source, files)
    records, scene_stats = [], []
    for group in groups.values():
        frames = group["frames"]
        indices = sorted(set(range(0, len(frames), args.stride)) | {len(frames) - 1}) if group["split"] else []
        chosen = [frames[index] for index in indices]
        stat = {k: v for k, v in group.items() if k != "frames"}
        stat.update(full_source_frames=len(frames), selected_frames=len(chosen),
                    selected_boxes=sum(row["box_count"] for row in chosen))
        if group["split"] is None:
            stat["exclusion_reason"] = EXCLUSION
        scene_stats.append(stat)
        for row in chosen:
            records.append(dict(row, origin="aihub_71368", split=group["split"], group_id=group["group_id"],
                                stem=f"aihub_s{group['group_id']:03d}_f{row['frame_id']:06d}"))
    if local:
        records.extend(local_records(*local))
    manifest = {"created_at": datetime.now(timezone.utc).isoformat(), "source": str(source), "indoor_only": True,
                "cafeteria_data": str(local[0]) if local else None, "selection_stride": args.stride,
                "selection_rule": "sorted numeric frame IDs; zero-based indices 0, stride, ... plus last",
                "full_source_audit": {"scenario_frames": sum(len(g["frames"]) for g in groups.values()),
                                      "scenario_boxes": sum(g["box_count"] for g in groups.values()), **excluded},
                "scenes": scene_stats, "clipped_boxes_full_source": clips, "selected_output": {}, "images": [],
                "limitations": ["Small first-training dataset; no independent test set.",
                                "Partial visual sample QC; not all boxes/omissions reviewed.",
                                "Outdoor scene excluded for possible unlabelled bystanders.",
                                "Local train/val scene independence is unverified; validation is provisional."],
                "warnings": [f"Clipped {len(clips)} out-of-bounds boxes across the full source."]}
    output.mkdir()  # Exclusive creation: cleanup only a directory created by this call.
    try:
        seen_hashes = {}
        for split in ("train", "val"):
            (output / "images" / split).mkdir(parents=True)
            (output / "labels" / split).mkdir(parents=True)
            manifest["selected_output"][split] = {"images": 0, "boxes": 0}
        for record in records:
            image_rel = f"images/{record['split']}/{record['stem']}.jpg"
            label_rel = f"labels/{record['split']}/{record['stem']}.txt"
            source_image = Path(record["source_image"])
            record["source_image_sha256"] = sha256(source_image)
            digest = record["source_image_sha256"]
            require(digest not in seen_hashes, f"Duplicate selected image content: {source_image} / {seen_hashes.get(digest)}")
            seen_hashes[digest] = str(source_image)
            shutil.copyfile(source_image, output / image_rel)
            require(sha256(output / image_rel) == record["source_image_sha256"], "Image copy hash mismatch")
            if "source_label" in record:
                record["source_label_sha256"] = sha256(Path(record["source_label"]))
                shutil.copyfile(record["source_label"], output / label_rel)
                require(sha256(output / label_rel) == record["source_label_sha256"], "Label copy hash mismatch")
            else:
                (output / label_rel).write_text(record["_labels"], encoding="utf-8")
            read_labels(output / label_rel)
            lines = (output / label_rel).read_text(encoding="utf-8-sig").splitlines()
            require(sum(bool(line.strip()) for line in lines) == record["box_count"], "Output label count mismatch")
            manifest["images"].append({**{k: v for k, v in record.items() if not k.startswith("_")},
                                       "image": image_rel, "label": label_rel})
            manifest["selected_output"][record["split"]]["images"] += 1
            manifest["selected_output"][record["split"]]["boxes"] += record["box_count"]
        config = {"path": str(output), "train": "images/train", "val": "images/val", "names": {0: "head"}}
        (output / "data.yaml").write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False), encoding="utf-8")
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except BaseException:
        shutil.rmtree(output)
        raise
    print(json.dumps({"output": str(output), "selected_output": manifest["selected_output"],
                      "full_source_audit": manifest["full_source_audit"], "warnings": manifest["warnings"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--cafeteria-data", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--stride", type=int, default=10)
    prepare(parser.parse_args())
