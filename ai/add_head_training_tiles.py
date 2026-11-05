"""Copy a prepared dataset and add deterministic, fully labelled local training tiles."""

import argparse
import copy
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml
from PIL import Image, ImageStat

if __package__:
    from .prepare_head_dataset import read_labels, sha256
else:
    from prepare_head_dataset import read_labels, sha256

TILE, OVERLAP, MAX_POSITIVE = 1280, 0.2, 4


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inside(root, relative):
    path = (root / relative).resolve()
    require(path.is_relative_to(root) and path.is_file(), f"Invalid input file: {relative}")
    return path


def plan_tiles(root, record):
    source, label = inside(root, record["image"]), inside(root, record["label"])
    text, count = read_labels(label)
    with Image.open(source) as image:
        require(image.getexif().get(274, 1) == 1, f"Expected upright image: {source}")
        W, H = image.size
        tw, th = min(TILE, W), min(TILE, H)
        boxes = []
        for row in text.splitlines():
            if row.strip():
                _, cx, cy, w, h = map(float, row.split())
                boxes.append(((cx-w/2)*W, (cy-h/2)*H, (cx+w/2)*W, (cy+h/2)*H))
        require(count == record["box_count"], f"Manifest box mismatch: {source}")
        axes = lambda length, size: sorted(set(range(0, length-size+1, round(TILE*(1-OVERLAP)))) | {length-size})
        candidates = {(x, y) for x in axes(W, tw) for y in axes(H, th)}
        # Head-centred alternatives prevent a grid boundary from losing a head.
        candidates |= {(max(0, min(W-tw, round((l+r-tw)/2))),
                        max(0, min(H-th, round((t+b-th)/2)))) for l, t, r, b in boxes}
        positive, negative, rejected = [], [], 0
        for x, y in sorted(candidates, key=lambda xy: (xy[1], xy[0])):
            visible = {i for i, (l, t, r, b) in enumerate(boxes)
                       if max(l, x) < min(r, x+tw) and max(t, y) < min(b, y+th)}
            complete = {i for i in visible if boxes[i][0] >= x and boxes[i][1] >= y
                        and boxes[i][2] <= x+tw and boxes[i][3] <= y+th}
            if visible != complete:
                rejected += 1
                continue
            (positive if complete else negative).append((x, y, complete))
        chosen, covered = [], set()
        while positive and len(chosen) < MAX_POSITIVE:
            best = max(positive, key=lambda c: (len(c[2]-covered), len(c[2]), -c[1], -c[0]))
            chosen.append(best)
            covered |= best[2]
            positive.remove(best)
        require(covered == set(range(len(boxes))), f"Not all heads fit in <=4 safe tiles: {source}")
        if negative:
            lowest = max(c[1] for c in negative)
            options = [c for c in negative if c[1] == lowest]
            score = lambda c: ImageStat.Stat(image.crop((c[0], c[1], c[0]+tw, c[1]+th))
                                             .convert("L").resize((64, 64))).stddev[0]
            chosen.append(max(options, key=lambda c: (score(c), -abs(c[0]+tw/2-W/2), -c[0])))
    plans = []
    for number, (x, y, indices) in enumerate(chosen, 1):
        rows = []
        for i in sorted(indices):
            l, t, r, b = boxes[i]
            values = ((l+r-2*x)/(2*tw), (t+b-2*y)/(2*th), (r-l)/tw, (b-t)/th)
            rows.append("0 " + " ".join(f"{v:.10f}" for v in values))
        plans.append({"stem": f"source_{Path(record['image']).stem}_tile{number:02d}",
                      "origin": "local_cafeteria_tile", "split": "train", "source_image": str(source),
                      "source_label": str(label), "source_image_sha256": sha256(source),
                      "source_label_sha256": sha256(label), "crop_xywh": [x, y, tw, th],
                      "source_size": [W, H], "source_gt_indices": sorted(indices),
                      "tile_kind": "positive" if indices else "negative", "box_count": len(rows),
                      "_labels": "\n".join(rows) + ("\n" if rows else "")})
    return plans, {"source_image": str(source), "candidate_tiles": len(candidates),
                   "rejected_partial_tiles": rejected, "positive_tiles": sum(bool(c[2]) for c in chosen),
                   "negative_tiles": int(bool(negative)), "covered_heads": len(covered), "source_heads": len(boxes)}


def prepare(args):
    root, output = args.data.expanduser().resolve(), args.output.expanduser().absolute()
    require(not output.exists() and not output.is_symlink(), f"Output exists: {output}")
    output = output.resolve()
    require(not output.is_relative_to(root), "Output must be outside the source dataset")
    config = yaml.safe_load((root / "data.yaml").read_text())
    require(config.get("names") in ({0: "head"}, {"0": "head"}, ["head"]), "Expected class 0=head")
    parent = root / "manifest.json"
    manifest = copy.deepcopy(json.loads(parent.read_text()))
    originals = manifest["images"]
    local = [r for r in originals if r["origin"] == "local_cafeteria" and r["split"] == "train"]
    require(len(local) == 16, "Expected exactly 16 original local training images")
    plans, stats = [], []
    for record in local:
        batch, stat = plan_tiles(root, record)
        plans.extend(batch)
        stats.append(stat)
    manifest.update(created_at=datetime.now(timezone.utc).isoformat(), parent_dataset=str(root),
                    parent_manifest="parent_manifest.json", parent_manifest_sha256=sha256(parent),
                    tile_settings={"size": TILE, "overlap": OVERLAP, "max_positive_per_source": MAX_POSITIVE,
                                   "positive_selection": "greedy uncovered-head coverage, then box count, then y/x",
                                   "negative_selection": "one from lowest safe row; highest grayscale stddev at 64x64",
                                   "partial_head_policy": "reject entire tile", "head_centered_candidates": True},
                    tile_source_stats=stats)
    manifest["limitations"].append("Training tiles share source images; they are not independent scenes. Validation is unchanged.")
    output.mkdir(parents=True)
    try:
        shutil.copyfile(parent, output / "parent_manifest.json")
        require(sha256(output / "parent_manifest.json") == manifest["parent_manifest_sha256"], "Manifest copy mismatch")
        for record in originals:
            for field in ("image", "label"):
                source = inside(root, record[field])
                destination = output / source.relative_to(root)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
                require(sha256(source) == sha256(destination), f"Copy mismatch: {source}")
        for record in plans:
            x, y, w, h = record["crop_xywh"]
            record.update(image=f"images/train/{record['stem']}.jpg", label=f"labels/train/{record['stem']}.txt")
            require(sha256(Path(record["source_image"])) == record["source_image_sha256"], "Source changed")
            with Image.open(record["source_image"]) as image:
                crop = image.crop((x, y, x+w, y+h)).convert("RGB")
                crop.info.clear()
                crop.save(output / record["image"], quality=95, subsampling=0, exif=b"")
            (output / record["label"]).write_text(record.pop("_labels"), encoding="utf-8")
            record["output_image_sha256"] = sha256(output / record["image"])
            record["output_label_sha256"] = sha256(output / record["label"])
        manifest["images"] = originals + plans
        manifest["selected_output"] = {split: {"images": 0, "boxes": 0} for split in ("train", "val")}
        for record in manifest["images"]:
            _, count = read_labels(output / record["label"])
            require(count == record["box_count"], "Output label count mismatch")
            summary = manifest["selected_output"][record["split"]]
            summary["images"] += 1
            summary["boxes"] += count
        config.update(path=str(output), train="images/train", val="images/val")
        (output / "data.yaml").write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    except BaseException:
        shutil.rmtree(output)
        raise
    print(json.dumps({"output": str(output), "counts": manifest["selected_output"], "added_tiles": len(plans),
                      "covered_source_heads": sum(s["covered_heads"] for s in stats),
                      "rejected_partial_tiles": sum(s["rejected_partial_tiles"] for s in stats)}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    prepare(parser.parse_args())
