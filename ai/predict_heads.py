"""Predict heads in local images and preserve detailed JSON; no seat inference."""

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def tile_starts(length, size, overlap):
    """Cover each axis fully, anchoring the final tile at the far image edge."""
    last = max(length - size, 0)
    positions = list(range(0, last + 1, max(1, int(size * (1 - overlap)))))
    return positions if positions[-1] == last else positions + [last]


def predict_tiled(detector, image, tile_size, overlap, options):
    from ultralytics.utils.patches import imread

    original = imread(str(image))  # Same decoder/orientation handling as normal file prediction.
    return predict_tiled_frame(detector, original, str(image), tile_size, overlap, options)


def predict_tiled_frame(detector, original, image_name, tile_size, overlap, options):
    """Offset tile detections to the decoded image, then suppress duplicates on CPU."""
    import torch
    from torchvision.ops import nms
    from ultralytics.engine.results import Results
    if original is None or original.ndim != 3 or min(original.shape[:2]) <= 0:
        raise RuntimeError(f"Image decoding failed; not a zero-head result: {image_name}")
    height, width = original.shape[:2]
    detections = []
    for top in tile_starts(height, tile_size, overlap):
        for left in tile_starts(width, tile_size, overlap):
            patch = original[top:top + tile_size, left:left + tile_size].copy()
            results = detector.predict(source=patch, **options)
            if len(results) != 1 or results[0].boxes is None or results[0].boxes.is_track:
                raise RuntimeError(f"Tile prediction failed at ({left}, {top}): {image_name}")
            boxes = results[0].boxes.data.detach().cpu().clone()
            if boxes.shape[1] != 6 or not torch.isfinite(boxes).all() or (boxes[:, 5] != 0).any():
                raise RuntimeError(f"Invalid single-class tile detections: {image_name}")
            boxes[:, [0, 2]] = (boxes[:, [0, 2]] + left).clamp(0, width)
            boxes[:, [1, 3]] = (boxes[:, [1, 3]] + top).clamp(0, height)
            boxes = boxes[(boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])]
            detections.append(boxes)
    merged = torch.cat(detections, dim=0)
    if len(merged):
        merged = merged[nms(merged[:, :4], merged[:, 4], options["iou"])[:options["max_det"]]]
    return Results(original, path=image_name, names=detector.names, boxes=merged)


def summarize_result(result, image_name):
    """Keep the native per-detection fields and add a count for one decoded image."""
    if result.boxes is None or result.boxes.is_track:
        raise RuntimeError(f"Expected untracked detection boxes: {image_name}")
    detections = result.summary(normalize=False)
    if len(detections) != len(result.boxes) or any(
        set(row) != {"name", "class", "confidence", "box"} or row["name"] != "head" or row["class"] != 0
        or set(row["box"]) != {"x1", "y1", "x2", "y2"} for row in detections
    ):
        raise RuntimeError(f"Unexpected native detection schema: {image_name}")
    height, width = result.orig_shape
    if min(height, width) <= 0:
        raise RuntimeError(f"Invalid decoded image dimensions: {image_name}")
    return {"image_name": image_name, "image_width": width, "image_height": height,
            "head_count": len(detections), "detections": detections}


def load_head_detector(model_path, device):
    """Load an existing local checkpoint with offline settings and the MPS adapter."""
    os.environ.update(YOLO_OFFLINE="true", YOLO_AUTOINSTALL="false", PYTORCH_ENABLE_MPS_FALLBACK="0",
                      YOLO_CONFIG_DIR=str(ROOT / "runs/.ultralytics"), MPLCONFIGDIR=str(ROOT / "runs/.matplotlib"))
    os.environ.pop("ULTRALYTICS_API_KEY", None)
    for key in ("YOLO_CONFIG_DIR", "MPLCONFIGDIR"):
        Path(os.environ[key]).mkdir(parents=True, exist_ok=True)
    import torch
    import ultralytics
    from ultralytics import YOLO
    if __package__:
        from .mps_head_runtime import MPSHeadPredictor
    else:
        from mps_head_runtime import MPSHeadPredictor

    ultralytics.settings.update({
        "sync": False, "hub": False, "api_key": "", "clearml": False, "comet": False,
        "dvc": False, "mlflow": False, "neptune": False, "raytune": False,
        "tensorboard": False, "wandb": False,
    })
    if device == "mps" and not torch.backends.mps.is_available():
        raise RuntimeError("MPS is unavailable in this process; request --device cpu explicitly to use CPU.")
    detector = YOLO(str(model_path), task="detect")
    if detector.task != "detect" or detector.names != {0: "head"}:
        raise ValueError(f"Expected a detection checkpoint with exactly 0=head; got {detector.task}: {detector.names}")
    return detector, MPSHeadPredictor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, help="Existing local head-only .pt checkpoint")
    parser.add_argument("--source", required=True, help="Local image or directory; nonrecursive")
    parser.add_argument("--output", type=Path, required=True, help="New JSON file; parent must exist")
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--max-det", type=int, default=300)
    parser.add_argument("--tile-size", type=int, default=0, help="Tile side in decoded pixels; 0 disables tiling")
    parser.add_argument("--tile-overlap", type=float, default=0.2, help="Overlap fraction within [0, 1)")
    args = parser.parse_args()
    if min(args.imgsz, args.max_det) < 1 or not 0 <= args.conf <= 1 or not 0 <= args.iou <= 1:
        parser.error("Use positive imgsz/max-det and conf/iou within [0, 1].")
    if args.tile_size < 0 or not 0 <= args.tile_overlap < 1:
        parser.error("Use tile-size >= 0 and tile-overlap within [0, 1).")
    if any("://" in value for value in (args.model, args.source)):
        parser.error("Only existing local files/directories are accepted; URLs/cameras are unsupported.")
    model_path, source = (Path(value).expanduser().absolute() for value in (args.model, args.source))
    if model_path.is_symlink() or not model_path.is_file() or model_path.suffix.lower() != ".pt":
        parser.error("--model must be an existing local .pt file, not a symlink.")
    if source.is_symlink() or not (source.is_file() or source.is_dir()):
        parser.error("--source must be an existing image/directory, not a symlink or glob.")
    model_path, source = model_path.resolve(), source.resolve()
    if source.is_dir():
        images = sorted(path for path in source.iterdir() if path.suffix.lower() in EXTENSIONS)
        if any(path.is_symlink() for path in images):
            parser.error("Symlink images are unsupported; files must stay inside the source directory.")
        images = [path for path in images if path.is_file()]
    else:
        images = [source] if source.suffix.lower() in EXTENSIONS else []
    if not images:
        parser.error("No supported images found: jpg/jpeg/png/webp/bmp; subdirectories are not scanned.")
    output = args.output.expanduser().absolute()
    if output.exists() or output.is_symlink() or output.suffix.lower() != ".json":
        parser.error("--output must be a new .json path; existing files are never overwritten.")
    output = output.resolve()
    if not output.parent.is_dir():
        parser.error("Create the output parent directory first.")

    detector, MPSHeadPredictor = load_head_detector(model_path, args.device)
    options = dict(device=args.device, imgsz=args.imgsz, conf=args.conf, iou=args.iou,
                   max_det=args.max_det, batch=1, workers=0, save=False, save_txt=False,
                   save_conf=False, show=False, stream=False, verbose=False, predictor=MPSHeadPredictor)
    records = []
    for image in images:
        if args.tile_size:
            result = predict_tiled(detector, image, args.tile_size, args.tile_overlap, options)
        else:
            results = detector.predict(source=str(image), **options)
            if len(results) != 1 or results[0].boxes is None:
                raise RuntimeError(f"Image decoding/prediction failed; not a zero-head result: {image}")
            result = results[0]
        records.append(summarize_result(result, image.relative_to(source).as_posix() if source.is_dir() else image.name))
    payload = {"schema_version": "head-image-v1", "model_file": str(model_path),
               "analyzed_at": datetime.now(timezone.utc).isoformat(), "coordinate_format": "xyxy_pixels",
               "confidence_threshold": args.conf, "images": records}
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    with output.open("x", encoding="utf-8") as handle:
        try:
            handle.write(serialized)
        except BaseException:
            output.unlink(missing_ok=True)
            raise
    print(json.dumps({"output": str(output), "image_count": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
