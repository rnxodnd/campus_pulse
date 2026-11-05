"""Preview one explicitly selected Mac camera; no inference, saving, or transmission.

Only the display is downscaled, using one fixed scale chosen from the first frame.
Camera-side effects such as Continuity Camera Center Stage are controlled in macOS.
Duration limits are checked between reads; they cannot interrupt a blocked native read.
"""

import argparse
import math
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--camera", type=int, required=True, help="Explicit AVFoundation camera index")
    parser.add_argument("--width", type=int, default=1920, help="Requested capture width; device may choose another")
    parser.add_argument("--height", type=int, default=1080, help="Requested capture height; device may choose another")
    parser.add_argument("--duration", type=float, default=0, help="Seconds after opening; 0 runs until stopped")
    parser.add_argument("--no-preview", action="store_true", help="Receive frames without a window; Ctrl+C stops")
    args = parser.parse_args()
    if args.camera < 0 or min(args.width, args.height) < 1:
        parser.error("Use a nonnegative camera index and positive width/height.")
    if not math.isfinite(args.duration) or args.duration < 0:
        parser.error("--duration must be a finite, nonnegative number.")

    import cv2

    capture = cv2.VideoCapture()
    window = "Camera input — q / Esc to stop"
    window_created = False
    frames, started, first_shape, preview_size = 0, None, None, None
    reason, exit_code = "duration", 0
    try:
        print(f"Opening AVFoundation camera {args.camera}; no automatic camera selection.", flush=True)
        if not capture.open(args.camera, cv2.CAP_AVFOUNDATION):
            raise RuntimeError("Camera open failed. Check the selected index, connection, and macOS camera permission.")
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, args.width)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, args.height)
        started = time.monotonic()
        while True:
            if frames and args.duration and time.monotonic() - started >= args.duration:
                break
            ok, frame = capture.read()
            if not ok or frame is None or frame.size == 0:
                raise RuntimeError("Camera read failed or returned an empty frame.")
            frames += 1
            height, width = frame.shape[:2]
            if first_shape is None:
                first_shape = (height, width)
                scale = min(1.0, 1280 / width, 720 / height)
                preview_size = (max(1, round(width * scale)), max(1, round(height * scale)))
                print(f"first_frame=ok camera={args.camera} actual={width}x{height} "
                      f"requested={args.width}x{args.height} backend={capture.getBackendName()}", flush=True)
                if args.no_preview:
                    print("Receiving frames without a window. Ctrl+C stops.", flush=True)
                else:
                    cv2.namedWindow(window, cv2.WINDOW_AUTOSIZE)
                    window_created = True
                    print(f"preview={preview_size[0]}x{preview_size[1]} fixed_scale={scale:.4f}; "
                          "no software crop/zoom. Press q, Esc, or close the window to stop.", flush=True)
            elif (height, width) != first_shape:
                raise RuntimeError(f"Capture dimensions changed to {width}x{height}; restart to choose a fixed preview scale.")
            if not args.no_preview:
                preview = frame if preview_size == (width, height) else cv2.resize(
                    frame, preview_size, interpolation=cv2.INTER_AREA
                )
                cv2.imshow(window, preview)
                if cv2.waitKey(1) & 0xFF in (ord("q"), ord("Q"), 27):
                    reason = "key"
                    break
                try:
                    visible = cv2.getWindowProperty(window, cv2.WND_PROP_VISIBLE)
                except cv2.error:
                    visible = 0  # Some backends remove the window as soon as it is closed.
                if visible < 1:
                    reason = "window_closed"
                    break
    except KeyboardInterrupt:
        reason = "interrupt"
    except (RuntimeError, cv2.error) as error:
        reason, exit_code = "error", 1
        print(f"ERROR: {error}", file=sys.stderr, flush=True)
    finally:
        elapsed = time.monotonic() - started if started is not None else 0.0
        capture.release()
        if window_created:
            try:
                cv2.destroyWindow(window)
            except cv2.error:
                pass
        fps = frames / elapsed if elapsed > 0 else 0.0
        print(f"stopped={reason} frames={frames} elapsed_s={elapsed:.3f} received_fps={fps:.2f} "
              "(received frames per second; no AI inference)", flush=True)
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
