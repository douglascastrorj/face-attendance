"""Alinhamento e extração de embeddings com SFace (cv2.FaceRecognizerSF)."""

from pathlib import Path
from typing import Protocol

import cv2
import numpy as np

from .detector import DetectedFace


class Embedder(Protocol):
    embedding_dim: int

    def align(self, image: np.ndarray, face: DetectedFace) -> np.ndarray: ...

    def embed(self, aligned_face: np.ndarray) -> np.ndarray: ...


class SFaceEmbedder:
    def __init__(self, model_path: Path, embedding_dim: int):
        self._net = cv2.FaceRecognizerSF.create(str(model_path), "")
        self.embedding_dim = embedding_dim

    def align(self, image: np.ndarray, face: DetectedFace) -> np.ndarray:
        # Usa os 5 landmarks do YuNet para gerar o recorte 112x112 alinhado esperado pelo SFace.
        return self._net.alignCrop(image, face.raw)

    def embed(self, aligned_face: np.ndarray) -> np.ndarray:
        feat = self._net.feature(aligned_face)
        return np.asarray(feat, dtype=np.float32).reshape(-1)


def sharpness(aligned_face: np.ndarray) -> float:
    """Variância do Laplaciano no recorte alinhado (112x112): valores baixos indicam imagem borrada."""
    gray = cv2.cvtColor(aligned_face, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())
