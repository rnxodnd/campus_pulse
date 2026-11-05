"""Mine GT-free 1280px training crops from existing predictions; never run a model.

Safety depends on complete source training annotations. A crop containing any
annotated head, including a partial head, is rejected. Visually review outputs.
"""

import argparse
import copy
import hashlib
import io
import json
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import yaml
from PIL import Image

if __package__:
    from .evaluate_head_predictions import evaluate, normalize_name, read_ground_truth, require
    from .prepare_head_dataset import read_labels, sha256
else:
    from evaluate_head_predictions import evaluate, normalize_name, read_ground_truth, require
    from prepare_head_dataset import read_labels, sha256

SIZE, MAX_PER_IMAGE = 1280, 2


def inside(root, relative):
    path = (root / relative).resolve()
    require(path.is_relative_to(root) and path.is_file(), f"Invalid dataset file: {relative}")
    return path


def config_for(root):
    data = yaml.safe_load((root / "data.yaml").read_text())
    require(data.get("names") in ({0: "head"}, {"0": "head"}, ["head"]), "Expected only class 0=head")
    require(all(data.get(s) == f"images/{s}" for s in ("train", "val")), "Expected prepared split directories")
    return data


def overlaps(a, b):
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])


def prepare(args):
    base, source, predictions = (p.expanduser().resolve() for p in
                                 (args.base_dataset, args.source_dataset, args.predictions))
    output = args.output.expanduser().absolute()
    require(not output.exists() and not output.is_symlink(), f"Output exists: {output}")
    output = output.resolve()
    require(not output.is_relative_to(base) and not output.is_relative_to(source), "Output overlaps input dataset")
    config = config_for(base)
    config_for(source)
    manifest = copy.deepcopy(json.loads((base / "manifest.json").read_text()))
    base_records = manifest["images"]
    base_hashes, val_hashes, train_hashes, origins, inventory = set(), set(), set(), set(), {}
    for record in base_records:
        require(record["split"] in ("train", "val"), "Unexpected base split")
        for field, folder in (("image", "images"), ("label", "labels")):
            path = inside(base, record[field])
            require(path.parent == base / folder / record["split"], f"Unexpected split path: {path}")
            require(record[field] not in inventory, f"Duplicate base record: {record[field]}")
            inventory[record[field]] = sha256(path)
        _, count = read_labels(base / record["label"])
        require(count == record["box_count"], "Base manifest label count mismatch")
        digest = inventory[record["image"]]
        base_hashes.add(digest)
        (train_hashes if record["split"] == "train" else val_hashes).add(digest)
        if "crop_xywh" in record:
            origins.add((record["source_image_sha256"], tuple(record["crop_xywh"])))
    require(not train_hashes.intersection(val_hashes), "Base dataset has train/val byte duplicates")
    expected = set(inventory)
    actual = {p.relative_to(base).as_posix() for folder in ("images", "labels")
              for p in (base / folder).glob("*/*") if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".txt")}
    require(expected == actual, "Base manifest does not cover the dataset files exactly")

    # This validates classes, finite coordinates, confidence, and exact label coverage on train only.
    checked = evaluate(predictions, source / "labels/train")
    document = json.loads(predictions.read_text(encoding="utf-8-sig"))
    require(sha256(predictions) == checked["predictions_sha256"], "Predictions changed during validation")
    source_images = {}
    for path in (source / "images/train").iterdir():
        if path.suffix.lower() in (".jpg", ".jpeg"):
            name = normalize_name(path.name)
            require(name not in source_images and not path.is_symlink(), f"Duplicate/symlink source: {path}")
            source_images[name] = path
    rows = {normalize_name(row["image_name"]): row for row in document["images"]}
    require(set(rows) == set(source_images), "Predictions must match all and only source training images")
    plans, audit, totals = [], [], Counter()
    for image_index, name in enumerate(sorted(rows), 1):
        path, row = source_images[name], rows[name]
        source_hash = sha256(path)
        require(source_hash in train_hashes and source_hash not in val_hashes, f"Source is not exclusively base train: {name}")
        label = inside(source, f"labels/train/{path.stem}.txt")
        label_hash, selected = sha256(label), 0
        with Image.open(path) as im:
            W, H = im.size
            require((W, H) == (row["image_width"], row["image_height"]), f"Prediction size mismatch: {name}")
            require(im.getexif().get(274, 1) == 1 and min(W, H) >= SIZE, f"Expected upright image >=1280px: {name}")
            truth = read_ground_truth(label, W, H)
            ordered = sorted(enumerate(row["detections"]), key=lambda item: (-item[1]["confidence"], item[0]))
            for index, detection in ordered:
                b = detection["box"]
                x = max(0, min(W-SIZE, round((b["x1"]+b["x2"]-SIZE)/2)))
                y = max(0, min(H-SIZE, round((b["y1"]+b["y2"]-SIZE)/2)))
                crop_box, origin = (x, y, x+SIZE, y+SIZE), (source_hash, (x, y, SIZE, SIZE))
                event = {"source_image": str(path), "prediction_index": index,
                         "confidence": detection["confidence"], "crop_xywh": [x, y, SIZE, SIZE]}
                if selected == MAX_PER_IMAGE:
                    reason = "per_image_limit"
                elif any(overlaps(crop_box, gt) for gt in truth):
                    reason = "contains_full_or_partial_gt"
                elif origin in origins:
                    reason = "duplicate_crop_origin"
                else:
                    crop = im.crop(crop_box).convert("RGB")
                    crop.info.clear()
                    buffer = io.BytesIO()
                    crop.save(buffer, format="JPEG", quality=95, subsampling=0, exif=b"")
                    encoded = buffer.getvalue()
                    digest = hashlib.sha256(encoded).hexdigest()
                    reason = "duplicate_encoded_bytes" if digest in base_hashes else "selected"
                    if reason == "selected":
                        selected += 1
                        stem = f"hardneg_train_{image_index:04d}_{selected:02d}"
                        plans.append({"origin": "local_cafeteria_hard_negative", "split": "train", "box_count": 0,
                                      "source_image": str(path), "source_label": str(label), "source_size": [W, H],
                                      "source_image_sha256": source_hash, "source_label_sha256": label_hash,
                                      "prediction_index": index, "anchor_detection": detection, "crop_xywh": list(origin[1]),
                                      "image": f"images/train/{stem}.jpg", "label": f"labels/train/{stem}.txt",
                                      "output_image_sha256": digest, "_encoded": encoded})
                        origins.add(origin)
                        base_hashes.add(digest)
                totals[reason] += 1
                audit.append({**event, "result": reason})
        require(sha256(path) == source_hash and sha256(label) == label_hash, f"Source changed: {name}")
    require(plans, f"No safe new hard negatives: {dict(totals)}")

    parent_name = "hard_negative_parent_manifest.json"
    require(not (base / parent_name).exists(), "Use the original tile dataset, not an already mined dataset")
    manifest.update(created_at=datetime.now(timezone.utc).isoformat(),
                    hard_negative_parent_dataset=str(base), hard_negative_parent_manifest=parent_name,
                    hard_negative_parent_manifest_sha256=sha256(base / "manifest.json"),
                    hard_negative_source_dataset=str(source), hard_negative_predictions_file=str(predictions),
                    hard_negative_predictions_sha256=checked["predictions_sha256"],
                    hard_negative_settings={"size": SIZE, "max_per_source": MAX_PER_IMAGE,
                                            "selection": "confidence descending, then stored detection order",
                                            "gt_intersection_policy": "reject any positive-area intersection",
                                            "source_annotations_assumed_complete": True},
                    hard_negative_audit=audit, hard_negative_totals=dict(totals))
    manifest["limitations"].append("Hard negatives assume complete source train GT; visually review before training. No validation crops used.")
    output.mkdir(parents=True)
    try:
        for relative, digest in inventory.items():
            require(sha256(base / relative) == digest, f"Base changed: {relative}")
            destination = output / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(base / relative, destination)
            require(sha256(destination) == digest, f"Copy mismatch: {relative}")
        for metadata in base.glob("*.json"):
            destination = output / (parent_name if metadata.name == "manifest.json" else metadata.name)
            shutil.copyfile(metadata, destination)
            require(sha256(metadata) == sha256(destination), "Metadata copy mismatch")
        for plan in plans:
            destination = output / plan["image"]
            require(not destination.exists() and not (output / plan["label"]).exists(),
                    f"Output image/label name collision: {destination}")
            destination.write_bytes(plan.pop("_encoded"))
            (output / plan["label"]).write_text("", encoding="utf-8")
            require(sha256(destination) == plan["output_image_sha256"], "Crop write mismatch")
            plan["output_label_sha256"] = sha256(output / plan["label"])
        manifest["images"] = base_records + plans
        manifest["selected_output"] = {s: {"images": 0, "boxes": 0} for s in ("train", "val")}
        for record in manifest["images"]:
            _, count = read_labels(output / record["label"])
            require(count == record["box_count"], "Output label count mismatch")
            manifest["selected_output"][record["split"]]["images"] += 1
            manifest["selected_output"][record["split"]]["boxes"] += count
        require(manifest["selected_output"]["val"] == json.loads((base / "manifest.json").read_text())["selected_output"]["val"],
                "Validation split changed")
        config.update(path=str(output))
        (output / "data.yaml").write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False)+"\n", encoding="utf-8")
    except BaseException:
        shutil.rmtree(output)
        raise
    print(json.dumps({"output": str(output), "counts": manifest["selected_output"], "mining": dict(totals)}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("base-dataset", "source-dataset", "predictions", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    prepare(parser.parse_args())
