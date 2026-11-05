"""Ultralytics 8.3.253 detection adapters: keep the model on MPS, run NMS on CPU.

Configure Ultralytics offline/settings before importing this module. Use
YOLO.train(trainer=MPSHeadTrainer), YOLO.val(validator=MPSHeadValidator), or
YOLO.predict(predictor=MPSHeadPredictor) on a fresh YOLO instance. Prediction
objects cache their predictor, so passing a new class after prediction is too late.
CPU inputs retain the upstream implementation. MPS NMS is called once per image:
the upstream time limit therefore cannot skip later images in the same batch.
"""

from copy import copy

import torch
import torchvision  # Load the compiled CPU NMS path before any NMS timer starts.
import ultralytics
from ultralytics.models.yolo.detect import DetectionPredictor, DetectionTrainer, DetectionValidator
from ultralytics.utils import nms, ops

if ultralytics.__version__ != "8.3.253":
    raise RuntimeError("mps_head_runtime targets Ultralytics 8.3.253; review upstream APIs before upgrading.")


def _inference_tensor(preds):
    """YOLOv8 may return (inference_tensor, auxiliary_features); NMS uses only the first."""
    value = preds[0] if isinstance(preds, (tuple, list)) and preds else preds
    if not isinstance(value, torch.Tensor) or value.ndim != 3 or value.shape[0] < 1:
        raise ValueError("Expected a nonempty batched detection tensor, optionally first in a tuple/list.")
    return value


def _per_image(predictions, postprocess):
    """Preserve all batch entries, including valid empty detections; never alter NMS thresholds."""
    outputs = []
    for image in predictions.split(1, dim=0):
        result = postprocess(image)
        if len(result) != 1:
            raise RuntimeError("Single-image postprocessing must return exactly one image result.")
        outputs.extend(result)
    return outputs


class MPSHeadValidator(DetectionValidator):
    """Validate on MPS while performing only detection postprocessing on CPU."""

    def postprocess(self, preds):
        prediction = _inference_tensor(preds)
        if prediction.device.type != "mps":
            return super().postprocess(preds)
        device = prediction.device
        outputs = _per_image(prediction.detach().cpu(), super().postprocess)
        return [{key: value.to(device) if isinstance(value, torch.Tensor) else value
                 for key, value in output.items()} for output in outputs]


class MPSHeadTrainer(DetectionTrainer):
    """Use the CPU-NMS validator without changing training, loss, optimizer, or model device."""

    def get_validator(self):
        # Same construction as DetectionTrainer.get_validator in 8.3.253, with our subclass.
        self.loss_names = "box_loss", "cls_loss", "dfl_loss"
        return MPSHeadValidator(self.test_loader, save_dir=self.save_dir,
                                args=copy(self.args), _callbacks=self.callbacks)


class MPSHeadPredictor(DetectionPredictor):
    """Plain detection only; keep upstream image scaling, image paths, and Results metadata."""

    def postprocess(self, preds, img, orig_imgs, **kwargs):
        prediction = _inference_tensor(preds)
        if prediction.device.type != "mps":
            return super().postprocess(preds, img, orig_imgs, **kwargs)
        if self.args.task != "detect" or getattr(self, "_feats", None) is not None:
            raise ValueError("MPSHeadPredictor supports plain detection, without feature extraction.")
        device = prediction.device

        def cpu_nms(image):
            return nms.non_max_suppression(
                image, self.args.conf, self.args.iou, self.args.classes, self.args.agnostic_nms,
                max_det=self.args.max_det, nc=0, end2end=getattr(self.model, "end2end", False),
                rotated=False, return_idxs=False,
            )

        outputs = _per_image(prediction.detach().cpu(), cpu_nms)
        if not isinstance(orig_imgs, list):
            orig_imgs = ops.convert_torch2numpy_batch(orig_imgs)[..., ::-1]
        results = self.construct_results(outputs, img, orig_imgs, **kwargs)
        if len(results) != prediction.shape[0]:
            raise RuntimeError("Image/path metadata and prediction batch lengths differ.")
        return [result.to(device) for result in results]
