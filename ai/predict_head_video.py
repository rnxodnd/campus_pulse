"""Analyze a local recorded video every 5 video seconds; write detailed JSON.

No camera, upload endpoint, network transfer, or real-time replay is implemented.
Each sampled frame keeps the image-result fields, including head_count/detections.
"""

import argparse
import json
import math
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

if __package__:
    from .predict_heads import load_head_detector, predict_tiled_frame, summarize_result
else:
    from predict_heads import load_head_detector, predict_tiled_frame, summarize_result


def sample_frames(capture, interval, stats):
    """Decode sequentially and select the first frame at/after each time boundary."""
    import cv2

    if not math.isfinite(interval) or interval <= 0:
        raise ValueError("Sampling interval must be positive and finite.")
    declared = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    stats["reported_frame_count"] = round(declared) if math.isfinite(declared) and declared > 0 else None
    stats["decoded_frame_count"] = 0
    first_time, previous_time, next_sample = None, None, 0.0
    while True:
        ok, frame = capture.read()
        if not ok:
            if not stats["decoded_frame_count"]:
                raise RuntimeError("No video frames could be decoded; not a zero-head result.")
            expected = stats["reported_frame_count"]
            decoded = stats["decoded_frame_count"]
            if expected is not None and decoded < expected:
                raise RuntimeError(f"Video ended early: decoded {decoded} of {expected} reported frames. "
                                   "Check the file/codec; no complete result was published.")
            # OpenCV read=False alone cannot distinguish EOF from every decoder failure.
            stats["decode_check"] = "frame_count_matched" if decoded == expected else "end_not_verified_by_frame_count"
            return
        if frame is None or frame.ndim != 3 or frame.size == 0:
            raise RuntimeError("Invalid decoded video frame; not a zero-head result.")
        timestamp = capture.get(cv2.CAP_PROP_POS_MSEC) / 1000.0
        if not math.isfinite(timestamp) or timestamp < 0 or (previous_time is not None and timestamp <= previous_time):
            raise RuntimeError("Video timestamps are missing/repeated/backward. Re-export a playable video; "
                               "frame_index/FPS is not substituted for variable-frame-rate timestamps.")
        if first_time is None:
            first_time = timestamp
        previous_time = timestamp
        video_time = timestamp - first_time
        index = stats["decoded_frame_count"]
        stats["decoded_frame_count"] += 1
        stats["last_decoded_video_time_seconds"] = round(video_time, 6)
        if video_time + 1e-6 >= next_sample:
            yield index, video_time, frame
            next_sample = (math.floor((video_time + 1e-6) / interval) + 1) * interval


def write_results(output, metadata, records, finish_metadata):
    """Stream records to a temporary file and publish only a complete, new JSON."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output.parent,
                                         prefix=f".{output.stem}-", suffix=".partial", delete=False) as handle:
            temporary = Path(handle.name)
            header = json.dumps(metadata, ensure_ascii=False, allow_nan=False)
            handle.write(header[:-1] + ',\n"images": [\n')
            count = 0
            for record in records:
                if count:
                    handle.write(',\n')
                handle.write(json.dumps(record, ensure_ascii=False, allow_nan=False))
                count += 1
            footer = dict(finish_metadata())
            footer.update(analyzed_frame_count=count, analyzed_at=datetime.now(timezone.utc).isoformat())
            handle.write('\n],\n' + json.dumps(footer, ensure_ascii=False, allow_nan=False)[1:] + '\n')
        # Same-directory hard link publishes atomically and refuses an existing output.
        os.link(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", required=True, type=Path, help="Existing local head-only .pt checkpoint")
    parser.add_argument("--source", required=True, type=Path, help="Local MP4/MOV/M4V/AVI/MKV video")
    parser.add_argument("--output", required=True, type=Path, help="New JSON file; parent must exist")
    parser.add_argument("--interval", type=float, default=5.0, help="Video seconds between samples (default: 5)")
    parser.add_argument("--device", choices=("mps", "cpu"), default="mps")
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--max-det", type=int, default=300)
    parser.add_argument("--tile-size", type=int, default=0, help="Decoded-frame tile side; 0 disables tiling")
    parser.add_argument("--tile-overlap", type=float, default=0.2)
    args = parser.parse_args()
    if not math.isfinite(args.interval) or args.interval <= 0:
        parser.error("--interval must be positive and finite.")
    if min(args.imgsz, args.max_det) <= 0 or not 0 <= args.conf <= 1 or not 0 <= args.iou <= 1:
        parser.error("Use positive imgsz/max-det and conf/iou within [0, 1].")
    if args.tile_size < 0 or not 0 <= args.tile_overlap < 1:
        parser.error("Use tile-size >= 0 and tile-overlap within [0, 1).")
    model, source, output = (p.expanduser().absolute() for p in (args.model, args.source, args.output))
    if model.is_symlink() or not model.is_file() or model.suffix.lower() != ".pt":
        parser.error("--model must be an existing local .pt file, not a symlink.")
    if source.is_symlink() or not source.is_file() or source.suffix.lower() not in {".mp4", ".mov", ".m4v", ".avi", ".mkv"}:
        parser.error("--source must be an existing local video file, not a camera/URL/symlink.")
    if output.exists() or output.is_symlink() or output.suffix.lower() != ".json" or not output.parent.is_dir():
        parser.error("--output must be a new .json path with an existing parent directory.")
    model, source, output = model.resolve(), source.resolve(), output.resolve()
    import cv2

    capture = cv2.VideoCapture(str(source), cv2.CAP_FFMPEG)
    try:
        if not capture.isOpened():
            raise RuntimeError("Video could not be opened by FFmpeg. Check the file and its video codec.")
        capture.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)  # Boxes use the decoded, orientation-corrected frame.
        stats = {}
        samples = sample_frames(capture, args.interval, stats)
        first = next(samples)  # Detect empty/undecodable input before loading the model.
        detector, predictor = load_head_detector(model, args.device)
        options = dict(device=args.device, imgsz=args.imgsz, conf=args.conf, iou=args.iou,
                       max_det=args.max_det, batch=1, workers=0, save=False, save_txt=False,
                       save_conf=False, show=False, stream=False, verbose=False, predictor=predictor)
        fps = capture.get(cv2.CAP_PROP_FPS)
        metadata = {
            "schema_version": "head-video-v1", "input_type": "recorded_video", "video_name": source.name,
            "model_file": str(model), "coordinate_format": "xyxy_pixels", "confidence_threshold": args.conf,
            "sample_interval_seconds": args.interval,
            "timestamp_source": "decoder_relative_to_first_frame",
            "reported_fps": fps if math.isfinite(fps) and fps > 0 else None,
        }

        def records():
            from itertools import chain

            for index, seconds, frame in chain((first,), samples):
                frame_name = f"{source.name}#frame={index}"
                if args.tile_size:
                    result = predict_tiled_frame(detector, frame, frame_name, args.tile_size, args.tile_overlap, options)
                else:
                    predictions = detector.predict(source=frame, **options)
                    if len(predictions) != 1:
                        raise RuntimeError(f"Expected one prediction for {frame_name}")
                    result = predictions[0]
                record = summarize_result(result, frame_name)
                record.update(frame_index=index, video_time_seconds=round(seconds, 6))
                yield record
                print(f"frame={index} video_s={seconds:.3f} head_count={record['head_count']}", flush=True)

        write_results(output, metadata, records(), lambda: stats)
    finally:
        capture.release()
    print(json.dumps({"output": str(output), "sample_interval_seconds": args.interval,
                      "decoded_frame_count": stats["decoded_frame_count"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
