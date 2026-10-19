"""Pipeline facial: detecção → verificação de qualidade → alinhamento → embedding."""

from dataclasses import dataclass

import numpy as np

from .config import Settings
from .detector import Detector
from .embedder import Embedder, sharpness
from .errors import Rejection


@dataclass(frozen=True)
class ModelInfo:
    model_name: str
    model_version: str
    embedding_dim: int
    detector_name: str
    detector_version: str


@dataclass(frozen=True)
class Quality:
    detection_score: float
    face_width: float
    face_height: float
    sharpness: float


class FaceEngine:
    def __init__(self, detector: Detector, embedder: Embedder, info: ModelInfo, settings: Settings):
        self.detector = detector
        self.embedder = embedder
        self.info = info
        self.settings = settings

    def extract(self, image: np.ndarray) -> tuple[np.ndarray, Quality]:
        faces = self.detector.detect(image)
        if not faces:
            raise Rejection("no_face", "Nenhum rosto detectado")
        if len(faces) > 1:
            raise Rejection("multiple_faces", f"{len(faces)} rostos detectados; é necessário exatamente um")
        face = faces[0]
        if face.score < self.settings.detection_score_threshold:
            raise Rejection("low_detection_confidence", "Confiança de detecção insuficiente")
        if min(face.width, face.height) < self.settings.min_face_size:
            raise Rejection("face_too_small", "Rosto muito pequeno; aproxime-se da câmera")

        aligned = self.embedder.align(image, face)
        sharp = sharpness(aligned)
        if sharp < self.settings.min_sharpness:
            raise Rejection("blurry", "Imagem sem nitidez suficiente")

        emb = self.embedder.embed(aligned)
        if emb.shape != (self.info.embedding_dim,) or not np.all(np.isfinite(emb)) or not np.any(emb):
            # Falha interna do modelo, não do usuário.
            raise RuntimeError("Embedding gerado com dimensão ou conteúdo inválido")
        return emb, Quality(face.score, face.width, face.height, sharp)
