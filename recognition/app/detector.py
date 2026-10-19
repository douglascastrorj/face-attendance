"""Detecção facial com YuNet (cv2.FaceDetectorYN)."""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

# YuNet foi treinado para rostos de ~10 a ~300 px. Reduzimos a imagem para detecção e
# reescalamos as coordenadas, o que também acelera a inferência na CPU.
_DETECTION_MAX_SIDE = 640


@dataclass(frozen=True)
class DetectedFace:
    # Linha no formato do YuNet: x, y, w, h, 5 landmarks (x,y), score — em coordenadas da imagem original.
    raw: np.ndarray

    @property
    def score(self) -> float:
        return float(self.raw[14])

    @property
    def width(self) -> float:
        return float(self.raw[2])

    @property
    def height(self) -> float:
        return float(self.raw[3])


class Detector(Protocol):
    def detect(self, image: np.ndarray) -> list[DetectedFace]: ...


class YuNetDetector:
    def __init__(self, model_path: Path, score_threshold: float):
        self._net = cv2.FaceDetectorYN.create(
            str(model_path), "", (320, 320), score_threshold, 0.3, 5000
        )

    def detect(self, image: np.ndarray) -> list[DetectedFace]:
        h, w = image.shape[:2]
        scale = min(1.0, _DETECTION_MAX_SIDE / max(h, w))
        work = image if scale == 1.0 else cv2.resize(image, (round(w * scale), round(h * scale)))
        wh, ww = work.shape[:2]
        self._net.setInputSize((ww, wh))
        _, faces = self._net.detect(work)
        if faces is None:
            return []
        result = []
        for row in faces:
            row = row.astype(np.float32).copy()
            row[:14] /= scale
            result.append(DetectedFace(raw=row))
        return result
