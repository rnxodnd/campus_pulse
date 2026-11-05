"""Validate two CVAT YOLO exports and create an upright, local head dataset."""

import argparse
import hashlib
import json
import math
import shutil
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import yaml
from PIL import Image, ImageOps


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def inside(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f"Path escapes input directory: {relative}")
    return path


def read_labels(path):
    content = path.read_text(encoding="utf-8-sig")
    boxes = set()
    for number, line in enumerate(content.splitlines(), 1):
        if not line.strip():
            continue  # Empty labels are valid negative examples.
        fields = line.split()
        if len(fields) != 5 or fields[0] != "0":
            raise ValueError(f"{path}:{number}: expected class 0 and four coordinates")
        box = tuple(float(value) for value in fields[1:])
        x, y, width, height = box
        if not all(math.isfinite(value) for value in box):
            raise ValueError(f"{path}:{number}: non-finite coordinate")
        if not (0 <= x <= 1 and 0 <= y <= 1 and 0 < width <= 1 and 0 < height <= 1):
            raise ValueError(f"{path}:{number}: coordinates are not normalized")
        if min(x - width / 2, y - height / 2) < -1e-9 or max(x + width / 2, y + height / 2) > 1 + 1e-9:
            raise ValueError(f"{path}:{number}: box extends beyond image")
        if box in boxes:
            raise ValueError(f"{path}:{number}: duplicate box")
        boxes.add(box)
    return content, len(boxes)


def inspect_image(path):
    with Image.open(path) as image:
        orientation = image.getexif().get(274, 1)
        if orientation not in range(1, 9):
            raise ValueError(f"Unsupported EXIF orientation {orientation}: {path}")
        upright = ImageOps.exif_transpose(image).convert("RGB")
        pixels = hashlib.sha256(str(upright.size).encode() + upright.tobytes()).hexdigest()
        return {
            "source_size": list(image.size), "display_size": list(upright.size),
            "source_exif_orientation": orientation,
            "exif_transform_applied": orientation != 1,
            "upright_pixels_sha256": pixels,
        }


def read_export(export, images_dir, split):
    config_path = export / "data.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8-sig"))
    if not isinstance(config, dict) or config.get("names") not in ({0: "head"}, {"0": "head"}, ["head"]):
        raise ValueError(f"{config_path}: expected only class 0 = head")
    manifests = [value for key, value in config.items() if str(key).lower() in ("train", "val", "test")]
    if len(manifests) != 1 or not isinstance(manifests[0], str):
        raise ValueError(f"{config_path}: expected one source split manifest")
    manifest = inside(export, manifests[0])
    entries = [line.strip() for line in manifest.read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if not entries:
        raise ValueError(f"Empty image manifest: {manifest}")
    records, used_images, used_labels = [], set(), set()
    for index, entry in enumerate(entries, 1):
        parts = PurePosixPath(entry.replace("\\", "/")).parts
        if ".." in parts or parts.count("images") != 1:
            raise ValueError(f"Expected images/<split>/<filename> path: {entry}")
        tail = parts[parts.index("images") + 1:]
        if len(tail) != 2:
            raise ValueError(f"Expected images/<split>/<filename> path: {entry}")
        source = inside(images_dir, tail[-1])
        label = inside(export, Path("labels", *tail).with_suffix(".txt"))
        if not source.is_file() or not label.is_file():
            raise ValueError(f"Missing image or label: {source} / {label}")
        if source in used_images or label in used_labels:
            raise ValueError(f"Image/label is listed more than once: {entry}")
        used_images.add(source)
        used_labels.add(label)
        label_text, count = read_labels(label)
        stem = f"{split}_{index:03d}"
        records.append({
            "split": split, "source_manifest_entry": entry,
            "source_image": str(source), "source_label": str(label),
            "source_image_sha256": sha256(source), "source_label_sha256": sha256(label),
            "output_image": f"images/{split}/{stem}.jpg", "output_label": f"labels/{split}/{stem}.txt",
            "box_count": count, "_label_text": label_text, **inspect_image(source),
        })
    actual_labels = {path.resolve() for path in (export / "labels").rglob("*.txt")}
    if actual_labels != used_labels:
        raise ValueError(f"Labels and manifest are not one-to-one in {export}; unlisted labels: {sorted(map(str, actual_labels - used_labels))}")
    return records, {"export": str(export), "source_manifest": str(manifest), "manifest_sha256": sha256(manifest), "config_sha256": sha256(config_path)}


def prepare(args):
    output = args.output.expanduser().absolute()
    if output.exists() or output.is_symlink():
        raise ValueError(f"Output already exists; refusing to overwrite: {output}")
    output = output.resolve()
    images_dir = args.images_dir.expanduser().resolve()
    records, inputs, seen = [], {}, {}
    for split, value in (("train", args.train_export), ("val", args.val_export)):
        batch, inputs[split] = read_export(value.expanduser().resolve(), images_dir, split)
        for record in batch:
            for field in ("source_image_sha256", "upright_pixels_sha256"):
                key = (field, record[field])
                if key in seen:
                    raise ValueError(f"Duplicate image content: {seen[key]} / {record['source_image']}")
                seen[key] = record["source_image"]
        records.extend(batch)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.mkdir()  # Exclusive creation; never reuse an existing output directory.
    try:
        for record in records:
            source, label = Path(record["source_image"]), Path(record["source_label"])
            if sha256(source) != record["source_image_sha256"] or sha256(label) != record["source_label_sha256"]:
                raise ValueError(f"Input changed during preparation: {source}")
            destination = output / record["output_image"]
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as image:
                upright = ImageOps.exif_transpose(image).convert("RGB")
                upright.info.clear()
                upright.save(destination, format="JPEG", quality=95, subsampling=0, exif=b"")
            label_destination = output / record["output_label"]
            label_destination.parent.mkdir(parents=True, exist_ok=True)
            label_destination.write_text(record.pop("_label_text"), encoding="utf-8")
            record["output_image_sha256"] = sha256(destination)
            record["output_label_sha256"] = sha256(label_destination)
        (output / "data.yaml").write_text(yaml.safe_dump({
            "path": str(output), "train": "images/train", "val": "images/val", "names": {0: "head"},
        }, sort_keys=False, allow_unicode=True), encoding="utf-8")
        manifest = {
            "created_at": datetime.now(timezone.utc).isoformat(), "images_dir": str(images_dir),
            "output": str(output), "label_orientation": args.label_orientation,
            "image_processing": "EXIF transpose once; RGB JPEG quality=95/subsampling=0; metadata removed; normalized labels unchanged",
            "split_rationale": "Explicit export-level split: --train-export supplies training; --val-export supplies validation. No random frame split. Scene/time independence still requires human review.",
            "inputs": inputs, "summary": {
                split: {"images": sum(r["split"] == split for r in records),
                        "boxes": sum(r["box_count"] for r in records if r["split"] == split)}
                for split in ("train", "val")
            }, "records": records,
        }
        (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except BaseException:
        shutil.rmtree(output)
        raise
    print(json.dumps({"output": str(output), "summary": manifest["summary"]}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("train-export", "val-export", "images-dir", "output"):
        parser.add_argument(f"--{option}", type=Path, required=True)
    parser.add_argument("--label-orientation", choices=["display"], required=True,
                        help="Confirm labels use the EXIF-upright displayed image, not stored pixels.")
    args = parser.parse_args()
    try:
        prepare(args)
    except (OSError, ValueError, yaml.YAMLError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")


if __name__ == "__main__":
    main()
