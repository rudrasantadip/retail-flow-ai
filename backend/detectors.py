"""
Detection models used by the RetailFlow CV pipeline.

* PersonDetector - Ultralytics YOLO restricted to the COCO "person" class, so shelves,
  racks, grocery items, baskets, etc. are never returned (and never drawn in the UI).
* FaceDetector   - MTCNN from the `facenet-pytorch` package (the face detector that
  ships with Google's FaceNet implementation). It is run only on the head region of
  each YOLO person box, which keeps it fast and avoids false positives on posters,
  mannequins and product packaging.
* blur_regions   - strong, elliptical Gaussian blur applied to the padded face boxes.

Models are loaded lazily, once per process, and are safe to use from Flask threads.
"""
import threading
from typing import List, Tuple

import cv2
import numpy as np

import config

_lock = threading.Lock()          # guards lazy model loading
_mtcnn_lock = threading.Lock()    # a single shared MTCNN is not thread-safe
_person_detector = None
_face_detector = None


# --------------------------------------------------------------------------- #
# Person detection (YOLO, person class only)
# --------------------------------------------------------------------------- #
class PersonDetector:
    def __init__(self):
        try:
            from ultralytics import YOLO
        except ImportError as e:  # pragma: no cover
            raise RuntimeError(
                "ultralytics is not installed. Run: pip install -r backend/requirements.txt"
            ) from e

        try:
            self.model = YOLO(config.YOLO_MODEL)
            self.model_name = config.YOLO_MODEL
        except Exception as e:
            print(f"[detectors] Could not load {config.YOLO_MODEL} ({e}); "
                  f"falling back to {config.YOLO_FALLBACK_MODEL}")
            self.model = YOLO(config.YOLO_FALLBACK_MODEL)
            self.model_name = config.YOLO_FALLBACK_MODEL

    def detect(self, frame: np.ndarray) -> List[dict]:
        """Return person detections as [{'bbox': [x, y, w, h], 'confidence': float}]."""
        h, w = frame.shape[:2]
        results = self.model.predict(
            frame,
            classes=[config.PERSON_CLASS_ID],   # <- persons only
            conf=config.YOLO_CONF,
            iou=config.YOLO_IOU,
            imgsz=config.YOLO_IMGSZ,
            verbose=False,
        )
        detections = []
        if not results:
            return detections
        boxes = results[0].boxes
        if boxes is None:
            return detections
        for xyxy, conf, cls in zip(boxes.xyxy.cpu().numpy(),
                                   boxes.conf.cpu().numpy(),
                                   boxes.cls.cpu().numpy()):
            if int(cls) != config.PERSON_CLASS_ID:
                continue
            x1, y1, x2, y2 = [float(v) for v in xyxy]
            x1, y1 = max(0.0, x1), max(0.0, y1)
            x2, y2 = min(float(w), x2), min(float(h), y2)
            bw, bh = x2 - x1, y2 - y1
            if bw < 8 or bh < 16:
                continue
            detections.append({
                "bbox": [int(round(x1)), int(round(y1)), int(round(bw)), int(round(bh))],
                "confidence": round(float(conf), 2),
            })
        return detections


# --------------------------------------------------------------------------- #
# Face detection (FaceNet family: MTCNN from facenet-pytorch)
# --------------------------------------------------------------------------- #
class FaceDetector:
    def __init__(self):
        try:
            import torch
            from facenet_pytorch import MTCNN
        except ImportError as e:
            raise RuntimeError(
                "facenet-pytorch is not installed, so faces cannot be blurred.\n"
                "Install it WITHOUT its (outdated) dependency pins:\n"
                "    pip install --no-deps facenet-pytorch\n"
                "or disable blurring with RETAILFLOW_FACE_BLUR=0."
            ) from e

        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.device = device
        self.mtcnn = MTCNN(
            keep_all=True,
            min_face_size=config.FACE_MIN_SIZE,
            thresholds=[0.6, 0.7, 0.7],
            post_process=False,
            device=device,
        )

    def detect_in_person(self, frame: np.ndarray, person_bbox: List[int]) -> List[List[float]]:
        """
        Find faces in the head region of one person box.
        Returns face boxes as [x1, y1, x2, y2] in full-frame pixel coordinates.
        """
        fh, fw = frame.shape[:2]
        x, y, w, h = person_bbox

        # Head region: top part of the person box with a little horizontal slack
        pad_x = int(w * 0.15)
        rx1 = max(0, x - pad_x)
        rx2 = min(fw, x + w + pad_x)
        ry1 = max(0, y - int(h * 0.05))
        ry2 = min(fh, y + int(h * config.FACE_HEAD_FRACTION))
        if rx2 - rx1 < 8 or ry2 - ry1 < 8:
            return []

        crop = frame[ry1:ry2, rx1:rx2]
        scale = 1.0
        # MTCNN struggles on tiny crops; upscale so the head is at least ~160px wide
        short_side = min(crop.shape[:2])
        if short_side < 160:
            scale = 160.0 / max(1, short_side)
            scale = min(scale, 4.0)
            crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        with _mtcnn_lock:
            boxes, probs = self.mtcnn.detect(rgb)
        if boxes is None:
            return []

        faces = []
        head_bottom = y + h * config.FACE_HEAD_FRACTION
        for (bx1, by1, bx2, by2), p in zip(boxes, probs):
            if p is None or p < config.FACE_MIN_CONF:
                continue
            fx1, fy1 = float(rx1 + bx1 / scale), float(ry1 + by1 / scale)
            fx2, fy2 = float(rx1 + bx2 / scale), float(ry1 + by2 / scale)
            # A real face has its centre inside the person's box, in the head region.
            # (Rejects bags, arms, posters etc. picked up by the horizontal search margin.)
            cx, cy = (fx1 + fx2) / 2.0, (fy1 + fy2) / 2.0
            if not (x <= cx <= x + w and y <= cy <= head_bottom):
                continue
            faces.append([fx1, fy1, fx2, fy2])
        return faces


# --------------------------------------------------------------------------- #
# Blurring
# --------------------------------------------------------------------------- #
def _odd(n: int) -> int:
    n = max(3, int(n))
    return n if n % 2 == 1 else n + 1


def pad_box(box: List[float], frame_w: int, frame_h: int,
            padding: float = None) -> Tuple[int, int, int, int]:
    padding = config.FACE_BOX_PADDING if padding is None else padding
    x1, y1, x2, y2 = box
    bw, bh = x2 - x1, y2 - y1
    x1 -= bw * padding
    x2 += bw * padding
    y1 -= bh * padding
    y2 += bh * padding
    return (max(0, int(x1)), max(0, int(y1)),
            min(frame_w, int(np.ceil(x2))), min(frame_h, int(np.ceil(y2))))


def blur_regions(frame: np.ndarray, boxes: List[List[float]]) -> np.ndarray:
    """Blur each [x1, y1, x2, y2] box in-place with a feathered elliptical mask."""
    fh, fw = frame.shape[:2]
    for box in boxes:
        x1, y1, x2, y2 = pad_box(box, fw, fh)
        rw, rh = x2 - x1, y2 - y1
        if rw < 4 or rh < 4:
            continue
        roi = frame[y1:y2, x1:x2]
        # Downscale-then-blur makes the result irreversible even for large boxes
        small = cv2.resize(roi, (max(2, rw // 6), max(2, rh // 6)), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (_odd(min(small.shape[:2]) // 2),) * 2, 0)
        blurred = cv2.resize(small, (rw, rh), interpolation=cv2.INTER_LINEAR)
        blurred = cv2.GaussianBlur(blurred, (_odd(max(rw, rh) // 3),) * 2, 0)

        mask = np.zeros((rh, rw), dtype=np.uint8)
        cv2.ellipse(mask, (rw // 2, rh // 2), (max(1, rw // 2), max(1, rh // 2)), 0, 0, 360, 255, -1)
        mask = cv2.GaussianBlur(mask, (_odd(max(3, min(rw, rh) // 6)),) * 2, 0)
        alpha = (mask.astype(np.float32) / 255.0)[..., None]
        frame[y1:y2, x1:x2] = (blurred * alpha + roi * (1.0 - alpha)).astype(np.uint8)
    return frame


# --------------------------------------------------------------------------- #
# Singletons
# --------------------------------------------------------------------------- #
def get_person_detector() -> PersonDetector:
    global _person_detector
    with _lock:
        if _person_detector is None:
            _person_detector = PersonDetector()
        return _person_detector


def get_face_detector() -> FaceDetector:
    global _face_detector
    with _lock:
        if _face_detector is None:
            _face_detector = FaceDetector()
        return _face_detector


def anonymize_frame(frame: np.ndarray) -> np.ndarray:
    """Detect people + faces in a single frame and blur the faces (used for thumbnails)."""
    out = frame.copy()
    if not config.FACE_BLUR_ENABLED:
        return out
    persons = get_person_detector().detect(out)
    fd = get_face_detector()
    boxes = []
    for det in persons:
        boxes.extend(fd.detect_in_person(frame, det["bbox"]))
    return blur_regions(out, boxes)
