"""CPU-only, fixed-threshold evaluation of head-image-v1 JSON against YOLO labels.

The label directory must cover exactly the prediction images. Matching is greedy:
descending prediction confidence, then highest IoU among unmatched ground truths.
Ties retain prediction/label order. These are validation metrics, not AP or a final test.
"""

import argparse
import hashlib
import json
import math
import os
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

IOU_THRESHOLD = 0.5


def require(condition, message):
    if not condition:
        raise ValueError(message)


def number(value, context):
    require(type(value) in (int, float) and math.isfinite(value), f"Nonfinite/nonnumeric {context}")
    return float(value)


def normalize_name(value):
    require(isinstance(value, str) and value not in ("", ".", ".."), "Invalid image filename")
    require("/" not in value and "\\" not in value and "\x00" not in value, f"Expected a basename: {value!r}")
    return unicodedata.normalize("NFC", value)


def read_ground_truth(path, width, height):
    boxes, seen = [], set()
    for index, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split()
        context = f"{path.name}:{index}"
        require(len(fields) == 5 and fields[0] == "0", f"Expected YOLO 0 xc yc w h: {context}")
        values = tuple(float(value) for value in fields[1:])
        require(all(math.isfinite(value) for value in values), f"Nonfinite ground truth: {context}")
        x, y, w, h = values
        require(0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1,
                f"Invalid normalized ground truth: {context}")
        x1, y1, x2, y2 = x - w / 2, y - h / 2, x + w / 2, y + h / 2
        # Permit only tiny boundary rounding errors from normalized YOLO exports.
        require(min(x1, y1) >= -1e-6 and max(x2, y2) <= 1 + 1e-6,
                f"Ground truth extends outside the image: {context}")
        box = (max(0, x1) * width, max(0, y1) * height, min(1, x2) * width, min(1, y2) * height)
        require(box[2] > box[0] and box[3] > box[1], f"Ground truth collapses at image precision: {context}")
        require(box not in seen, f"Duplicate ground truth box: {context}")
        seen.add(box)
        boxes.append(box)
    return boxes


def intersection_over_union(left, right):
    intersection = max(0, min(left[2], right[2]) - max(left[0], right[0])) * max(
        0, min(left[3], right[3]) - max(left[1], right[1])
    )
    union = ((left[2] - left[0]) * (left[3] - left[1]) +
             (right[2] - right[0]) * (right[3] - right[1]) - intersection)
    return intersection / union


def match_predictions(predictions, ground_truth):
    unmatched, matches = set(range(len(ground_truth))), []
    for pred_index in sorted(range(len(predictions)), key=lambda index: (-predictions[index]["confidence"], index)):
        if not unmatched:
            break
        score, gt_index = max(
            ((intersection_over_union(predictions[pred_index]["box"], ground_truth[index]), index) for index in unmatched),
            key=lambda pair: (pair[0], -pair[1]),
        )
        if score >= IOU_THRESHOLD:
            unmatched.remove(gt_index)
            matches.append({"prediction_index": pred_index, "ground_truth_index": gt_index, "iou": score})
    return matches


def detection_metrics(tp, fp, fn):
    return {"tp": tp, "fp": fp, "fn": fn,
            "precision": tp / (tp + fp) if tp + fp else None,
            "recall": tp / (tp + fn) if tp + fn else None,
            "f1": 2 * tp / (2 * tp + fp + fn) if 2 * tp + fp + fn else None}


def evaluate(predictions_file, labels_dir):
    raw = predictions_file.read_bytes()
    document = json.loads(raw.decode("utf-8-sig"))
    require(isinstance(document, dict) and document.get("schema_version") == "head-image-v1",
            "Expected detailed head-image-v1 JSON, not count-only or video JSON")
    require(document.get("coordinate_format") == "xyxy_pixels", "Expected xyxy_pixels coordinates")
    threshold = number(document.get("confidence_threshold"), "confidence_threshold")
    require(0 <= threshold <= 1, "confidence_threshold must be within [0, 1]")
    images = document.get("images")
    require(isinstance(images, list) and images, "Predictions must contain at least one image")
    labels = {}
    for path in labels_dir.iterdir():
        if path.suffix.lower() != ".txt":
            continue
        require(path.is_file() and not path.is_symlink(), f"Expected a local label file: {path}")
        key = unicodedata.normalize("NFC", path.stem)
        require(key not in labels, f"Duplicate normalized label filename: {key}")
        labels[key] = path
    rows, seen_images, used_labels = [], set(), set()
    for image in images:
        require(isinstance(image, dict), "Invalid image result")
        name = normalize_name(image.get("image_name"))
        key = Path(name).stem
        require(name not in seen_images and key not in used_labels, f"Duplicate image/label mapping: {name}")
        require(key in labels, f"Missing ground truth label for {name}")
        seen_images.add(name)
        used_labels.add(key)
        width, height = image.get("image_width"), image.get("image_height")
        require(type(width) is int and type(height) is int and min(width, height) > 0,
                f"Expected positive integer image dimensions: {name}")
        detections, count = image.get("detections"), image.get("head_count")
        require(isinstance(detections, list) and type(count) is int and count >= 0 and count == len(detections),
                f"head_count must match detections: {name}")
        predictions = []
        for index, detection in enumerate(detections):
            context = f"{name}, detection {index}"
            require(isinstance(detection, dict) and detection.get("name") == "head" and
                    type(detection.get("class")) is int and detection["class"] == 0, f"Expected 0=head: {context}")
            confidence = number(detection.get("confidence"), f"confidence: {context}")
            # Native summary rounds confidence to five decimals; do not re-filter its detections.
            require(0 <= confidence <= 1 and confidence >= threshold - 5.1e-6,
                    f"Confidence contradicts the recorded threshold: {context}")
            box = detection.get("box")
            require(isinstance(box, dict) and set(box) == {"x1", "y1", "x2", "y2"}, f"Invalid box: {context}")
            coords = tuple(number(box[k], f"{k}: {context}") for k in ("x1", "y1", "x2", "y2"))
            x1, y1, x2, y2 = coords
            require(0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height, f"Box outside image/empty: {context}")
            predictions.append({"confidence": confidence, "box": coords})
        ground_truth = read_ground_truth(labels[key], width, height)
        matches = match_predictions(predictions, ground_truth)
        tp = len(matches)
        rows.append({"image_name": name, "ground_truth_heads": len(ground_truth), "predicted_heads": count,
                     "count_error": count - len(ground_truth), "absolute_count_error": abs(count - len(ground_truth)),
                     **detection_metrics(tp, count - tp, len(ground_truth) - tp), "matches": matches,
                     "label_sha256": hashlib.sha256(labels[key].read_bytes()).hexdigest()})
    require(set(labels) == used_labels,
            f"Prediction images do not cover the label directory; {len(set(labels) - used_labels)} labels are unused")
    aggregate = detection_metrics(*(sum(row[key] for row in rows) for key in ("tp", "fp", "fn")))
    aggregate.update(images=len(rows), ground_truth_instances=sum(row["ground_truth_heads"] for row in rows),
                     predicted_instances=sum(row["predicted_heads"] for row in rows),
                     count_mae=sum(row["absolute_count_error"] for row in rows) / len(rows))
    return {"schema_version": "head-evaluation-v1", "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "predictions_file": str(predictions_file), "predictions_sha256": hashlib.sha256(raw).hexdigest(),
            "labels_dir": str(labels_dir), "model_file": document.get("model_file"),
            "prediction_confidence_threshold": threshold, "matching_iou_threshold": IOU_THRESHOLD,
            "matching_method": "Confidence-descending greedy one-to-one maximum IoU; ties use stored order; continuous pixel area",
            "aggregate": aggregate, "images": rows,
            "undefined_metrics": "Zero denominators produce null; empty GT and empty predictions have count error 0 and null precision/recall/F1.",
            "limitations": ["Validation data used for tuning; not an independent final test.",
                            "Fixed-confidence precision/recall/F1; these are not AP or mAP.",
                            "Compare models on the same images, labels, confidence threshold, and inference settings.",
                            "Instance totals across images are evaluation totals, not unique visitors or current occupancy."]}


def write_new_json(output, report):
    serialized = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=f".{output.stem}-", suffix=".partial", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(serialized)
        os.link(temporary, output)  # Atomic publication without replacing an existing file.
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--labels", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    predictions, labels, output = (path.expanduser().absolute() for path in (args.predictions, args.labels, args.output))
    if not predictions.is_file() or not labels.is_dir() or labels.is_symlink():
        parser.error("Provide an existing prediction JSON and local label directory.")
    if output.exists() or output.is_symlink() or output.suffix.lower() != ".json" or not output.parent.is_dir():
        parser.error("--output must be a new .json file with an existing parent directory.")
    report = evaluate(predictions.resolve(), labels.resolve())
    write_new_json(output.resolve(), report)
    print(json.dumps({"output": str(output.resolve()), "aggregate": report["aggregate"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
