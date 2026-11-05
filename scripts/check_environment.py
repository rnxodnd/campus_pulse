"""Check the shared environment without downloading models or training."""

import argparse
import importlib.metadata
import platform
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("auto", "cpu", "mps"), default="auto")
    args = parser.parse_args()

    print(f"Python: {platform.python_version()}")
    print(f"Platform: {platform.system()} / {platform.machine()}")
    if sys.version_info[:2] != (3, 12):
        print("ERROR: This project requires Python 3.12.", file=sys.stderr)
        return 1

    try:
        import cv2
        import numpy as np
        import torch
        import torchvision
        from ultralytics import YOLO

        for name in ("numpy", "opencv-python", "torch", "torchvision", "ultralytics"):
            print(f"{name}: {importlib.metadata.version(name)}")
        if not callable(YOLO):
            raise RuntimeError("Ultralytics YOLO could not be imported correctly.")

        mps_available = torch.backends.mps.is_available()
        print(f"MPS available: {mps_available}")
        device = args.device
        if device == "auto":
            device = "mps" if mps_available else "cpu"
        if device == "mps" and not mps_available:
            print("ERROR: MPS was requested but is unavailable.", file=sys.stderr)
            return 1

        # Exercise GPU/CPU execution and NumPy interoperability.
        values = torch.ones((2, 2), device=device)
        product = (values @ values).cpu().numpy()
        if not np.array_equal(product, np.full((2, 2), 2.0)):
            raise RuntimeError("PyTorch calculation returned an unexpected result.")

        # Confirm the compiled torchvision operators match the torch wheel.
        boxes = torch.tensor([[0.0, 0.0, 10.0, 10.0], [1.0, 1.0, 9.0, 9.0]])
        scores = torch.tensor([0.9, 0.8])
        if torchvision.ops.nms(boxes, scores, 0.5).tolist() != [0]:
            raise RuntimeError("torchvision NMS returned an unexpected result.")

        frame = np.zeros((16, 16, 3), dtype=np.uint8)
        if cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).shape != (16, 16):
            raise RuntimeError("OpenCV image conversion failed.")
    except (ImportError, RuntimeError, OSError, importlib.metadata.PackageNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"PASS: Environment checks succeeded on {device}.")
    print("This checks the runtime only, not model accuracy or training performance.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
