"""Testes com os modelos ONNX reais (marcados com `models`).

Usam apenas imagens de domínio público distribuídas com o scikit-image:
- `astronaut`: retrato oficial da NASA (Eileen Collins), domínio público.
- `camera`: "cameraman", imagem clássica de teste, usada como segunda identidade.
Não são avaliação de acurácia — ver docs/evaluation.md para o procedimento com amostras autorizadas.
"""

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models_registry import load_manifest

from .conftest import encode_jpeg

pytestmark = pytest.mark.models

settings = Settings()
_missing = [s.file for s in load_manifest(settings.manifest_file).values()
            if not (settings.models_dir / s.file).is_file()]
if _missing:
    pytest.skip(f"modelos ausentes ({_missing}); execute `npm run models:download`", allow_module_level=True)

skimage_data = pytest.importorskip("skimage.data")


def astronaut():
    return cv2.cvtColor(skimage_data.astronaut(), cv2.COLOR_RGB2BGR)


def cameraman():
    img = cv2.cvtColor(skimage_data.camera(), cv2.COLOR_GRAY2BGR)
    return cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app(settings)) as c:
        yield c


def enroll(client, img):
    return client.post("/faces/enroll", json={"image_base64": encode_jpeg(img)}).json()


def test_health_reports_loaded_models(client):
    body = client.get("/health").json()
    assert body["models_loaded"] and body["model_name"] == "sface" and body["embedding_dim"] == 128


def test_real_enroll_produces_128d_embedding(client):
    body = enroll(client, astronaut())
    assert body["accepted"], body
    emb = np.asarray(body["embedding"])
    assert emb.shape == (128,) and np.all(np.isfinite(emb))


def test_real_no_face(client):
    assert enroll(client, np.full((480, 640, 3), 128, np.uint8))["reason"] == "no_face"


def test_real_multiple_faces(client):
    assert enroll(client, np.hstack([astronaut(), astronaut()]))["reason"] == "multiple_faces"


def test_real_blurry(client):
    assert enroll(client, cv2.GaussianBlur(astronaut(), (31, 31), 0))["reason"] == "blurry"


def test_real_same_person_with_variations_matches(client):
    ref = enroll(client, astronaut())
    other = enroll(client, cameraman())
    assert other["accepted"], other
    gallery = [
        {"employee_id": 1, "embedding": ref["embedding"], "model_name": "sface", "model_version": "2021dec"},
        {"employee_id": 2, "embedding": other["embedding"], "model_name": "sface", "model_version": "2021dec"},
    ]
    variants = [cv2.flip(astronaut(), 1), cv2.convertScaleAbs(astronaut(), alpha=0.75, beta=-15)]
    for img in variants:
        body = client.post("/faces/identify", json={"image_base64": encode_jpeg(img), "gallery": gallery}).json()
        assert body["matched"] and body["employee_id"] == 1, body


def test_real_unknown_person_rejected(client):
    ref = enroll(client, astronaut())
    gallery = [{"employee_id": 1, "embedding": ref["embedding"], "model_name": "sface", "model_version": "2021dec"}]
    body = client.post("/faces/identify", json={"image_base64": encode_jpeg(cameraman()), "gallery": gallery}).json()
    assert not body["matched"] and body["reason"] == "no_match", body
    assert body["similarity"] < 0.363
