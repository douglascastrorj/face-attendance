import base64

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.detector import DetectedFace
from app.engine import FaceEngine, ModelInfo
from app.main import create_app

DIM = 128


def encode_jpeg(img: np.ndarray) -> str:
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 92])
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


def face_row(x=100, y=100, w=120, h=150, score=0.95) -> np.ndarray:
    row = np.zeros(15, dtype=np.float32)
    row[:4] = [x, y, w, h]
    row[14] = score
    return row


class FakeDetector:
    """Detector controlado pela cor do pixel (0,0): 0=sem rosto, 1=um rosto, 2=dois, 3=rosto pequeno."""

    def detect(self, image):
        marker = int(image[0, 0, 0])
        if marker == 0:
            return []
        if marker == 2:
            return [DetectedFace(face_row()), DetectedFace(face_row(x=300))]
        if marker == 3:
            return [DetectedFace(face_row(w=20, h=25))]
        return [DetectedFace(face_row())]


class FakeEmbedder:
    """Embedding determinístico derivado do pixel (0,1): mesma "pessoa" → mesmo vetor."""

    embedding_dim = DIM

    def align(self, image, face):
        # Recorte texturizado (nítido) com a "identidade" no canal verde.
        rng = np.random.default_rng(0)
        crop = rng.integers(0, 255, (112, 112, 3), dtype=np.uint8)
        crop[0, 0, 1] = image[0, 1, 1]
        return crop

    def embed(self, aligned):
        return person_vector(int(aligned[0, 0, 1]))


def person_vector(person: int) -> np.ndarray:
    return np.random.default_rng(1000 + person).standard_normal(DIM).astype(np.float32)


def synthetic_image(marker: int = 1, person: int = 7) -> str:
    img = np.full((240, 320, 3), 90, dtype=np.uint8)
    # PNG é sem perdas: preserva exatamente os marcadores.
    img[0, 0, 0] = marker
    img[0, 1, 1] = person
    ok, buf = cv2.imencode(".png", img)
    assert ok
    return base64.b64encode(buf.tobytes()).decode()


INFO = ModelInfo("sface", "2021dec", DIM, "yunet", "2023mar")


@pytest.fixture
def settings():
    return Settings(verify_checksums=False)


@pytest.fixture
def fake_client(settings):
    app = create_app(settings, engine_factory=lambda s: FaceEngine(FakeDetector(), FakeEmbedder(), INFO, s))
    with TestClient(app) as c:
        yield c
