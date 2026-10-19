"""Testes de contrato/negócio da API com motor falso (não carregam os modelos reais)."""

import base64

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.models_registry import ModelFilesError

from .conftest import DIM, person_vector, synthetic_image


def gallery_entry(employee_id, person, **overrides):
    entry = {"employee_id": employee_id, "embedding": person_vector(person).tolist(),
             "model_name": "sface", "model_version": "2021dec"}
    entry.update(overrides)
    return entry


def test_health_ok(fake_client):
    r = fake_client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["models_loaded"] and body["model_name"] == "sface" and body["embedding_dim"] == DIM


def test_enroll_valid_returns_embedding(fake_client):
    r = fake_client.post("/faces/enroll", json={"image_base64": synthetic_image(1, person=7)})
    body = r.json()
    assert r.status_code == 200 and body["accepted"]
    assert len(body["embedding"]) == DIM
    assert body["model_name"] == "sface" and body["model_version"] == "2021dec"


def test_enroll_accepts_data_url(fake_client):
    r = fake_client.post("/faces/enroll", json={"image_base64": "data:image/png;base64," + synthetic_image()})
    assert r.json()["accepted"]


def test_enroll_without_face(fake_client):
    body = fake_client.post("/faces/enroll", json={"image_base64": synthetic_image(0)}).json()
    assert not body["accepted"] and body["reason"] == "no_face" and "embedding" not in body


def test_enroll_multiple_faces(fake_client):
    body = fake_client.post("/faces/enroll", json={"image_base64": synthetic_image(2)}).json()
    assert not body["accepted"] and body["reason"] == "multiple_faces"


def test_enroll_small_face(fake_client):
    body = fake_client.post("/faces/enroll", json={"image_base64": synthetic_image(3)}).json()
    assert body["reason"] == "face_too_small"


def test_invalid_base64(fake_client):
    body = fake_client.post("/faces/enroll", json={"image_base64": "não é base64!!"}).json()
    assert body["reason"] == "invalid_image"


def test_non_image_content(fake_client):
    payload = base64.b64encode(b"%PDF-1.4 not an image" * 10).decode()
    body = fake_client.post("/faces/enroll", json={"image_base64": payload}).json()
    assert body["reason"] == "invalid_image"


def test_truncated_jpeg(fake_client):
    payload = base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 100).decode()
    assert fake_client.post("/faces/enroll", json={"image_base64": payload}).json()["reason"] == "invalid_image"


def test_request_too_large(settings):
    from .conftest import FakeDetector, FakeEmbedder, INFO
    from app.engine import FaceEngine

    small = Settings(verify_checksums=False, max_request_bytes=1000)
    app = create_app(small, engine_factory=lambda s: FaceEngine(FakeDetector(), FakeEmbedder(), INFO, s))
    with TestClient(app) as c:
        r = c.post("/faces/enroll", json={"image_base64": "A" * 5000})
    assert r.status_code == 413


def test_missing_field_does_not_echo_body(fake_client):
    r = fake_client.post("/faces/enroll", json={"foo": "SECRET"})
    assert r.status_code == 422 and "SECRET" not in r.text


def test_identify_positive(fake_client):
    req = {"image_base64": synthetic_image(1, person=7),
           "gallery": [gallery_entry(10, 7), gallery_entry(11, 8)], "threshold": 0.363}
    body = fake_client.post("/faces/identify", json=req).json()
    assert body["matched"] and body["employee_id"] == 10 and body["similarity"] > 0.99
    assert body["model_name"] == "sface"


def test_identify_unknown_person(fake_client):
    req = {"image_base64": synthetic_image(1, person=99), "gallery": [gallery_entry(10, 7), gallery_entry(11, 8)]}
    body = fake_client.post("/faces/identify", json=req).json()
    assert not body["matched"] and body["reason"] == "no_match" and body["employee_id"] is None


def test_identify_ambiguous(fake_client):
    req = {"image_base64": synthetic_image(1, person=7), "gallery": [gallery_entry(10, 7), gallery_entry(11, 7)]}
    body = fake_client.post("/faces/identify", json=req).json()
    assert not body["matched"] and body["reason"] == "ambiguous"


def test_identify_empty_gallery(fake_client):
    body = fake_client.post("/faces/identify", json={"image_base64": synthetic_image(), "gallery": []}).json()
    assert body["reason"] == "empty_gallery"


def test_identify_no_face(fake_client):
    req = {"image_base64": synthetic_image(0), "gallery": [gallery_entry(10, 7)]}
    assert fake_client.post("/faces/identify", json=req).json()["reason"] == "no_face"


def test_identify_wrong_dimension(fake_client):
    req = {"image_base64": synthetic_image(), "gallery": [gallery_entry(10, 7, embedding=[0.1] * 64)]}
    r = fake_client.post("/faces/identify", json=req)
    assert r.status_code == 422 and r.json()["error"] == "invalid_embedding_dimension"


def test_identify_model_version_mismatch(fake_client):
    req = {"image_base64": synthetic_image(), "gallery": [gallery_entry(10, 7, model_version="2099jan")]}
    r = fake_client.post("/faces/identify", json=req)
    assert r.status_code == 409 and r.json()["error"] == "model_mismatch"


def test_identify_zero_embedding(fake_client):
    req = {"image_base64": synthetic_image(), "gallery": [gallery_entry(10, 7, embedding=[0.0] * DIM)]}
    assert fake_client.post("/faces/identify", json=req).json()["error"] == "invalid_embedding"


def test_models_missing_degrades_service(settings):
    def failing(_s):
        raise ModelFilesError("Arquivo do modelo 'sface' ausente")

    with TestClient(create_app(settings, engine_factory=failing)) as c:
        h = c.get("/health")
        assert h.status_code == 503 and not h.json()["models_loaded"]
        r = c.post("/faces/enroll", json={"image_base64": synthetic_image()})
        assert r.status_code == 503 and r.json()["error"] == "models_unavailable"


def test_missing_model_files_detected(tmp_path):
    from app.main import build_engine

    s = Settings(models_dir=tmp_path)
    try:
        build_engine(s)
    except ModelFilesError as exc:
        assert "ausente" in str(exc)
    else:
        raise AssertionError("esperava ModelFilesError")


def test_corrupted_model_detected(tmp_path):
    from app.main import build_engine
    from app.models_registry import load_manifest

    s = Settings(models_dir=tmp_path)
    for spec in load_manifest(s.manifest_file).values():
        (tmp_path / spec.file).write_bytes(b"corrompido")
    try:
        build_engine(s)
    except ModelFilesError as exc:
        assert "Checksum" in str(exc)
    else:
        raise AssertionError("esperava ModelFilesError")
