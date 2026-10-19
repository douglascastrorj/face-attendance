"""API HTTP local do serviço de reconhecimento facial.

Este serviço NÃO acessa o banco de dados e NÃO registra pontos: apenas detecta, extrai e compara.
Imagens e embeddings nunca são registrados em log nem gravados em disco.
"""

import logging
import threading
from collections.abc import Callable
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .detector import YuNetDetector
from .embedder import SFaceEmbedder
from .engine import FaceEngine, ModelInfo
from .errors import Rejection, RequestValidationFailure
from .image_io import decode_base64_image
from .matcher import GalleryItem, match
from .models_registry import ModelFilesError, load_manifest, resolve_model_file
from .schemas import (
    Candidate,
    EnrollRequest,
    EnrollResponse,
    HealthResponse,
    IdentifyRequest,
    IdentifyResponse,
    QualityOut,
)

log = logging.getLogger("recognition")


def build_engine(settings: Settings) -> FaceEngine:
    specs = load_manifest(settings.manifest_file)
    det_spec, rec_spec = specs["detector"], specs["recognizer"]
    det_path = resolve_model_file(settings.models_dir, det_spec, settings.verify_checksums)
    rec_path = resolve_model_file(settings.models_dir, rec_spec, settings.verify_checksums)
    if not rec_spec.embedding_dim:
        raise ModelFilesError("Manifesto não define embedding_dim do reconhecedor")
    info = ModelInfo(
        model_name=rec_spec.name,
        model_version=rec_spec.version,
        embedding_dim=rec_spec.embedding_dim,
        detector_name=det_spec.name,
        detector_version=det_spec.version,
    )
    return FaceEngine(
        YuNetDetector(det_path, settings.detection_score_threshold),
        SFaceEmbedder(rec_path, rec_spec.embedding_dim),
        info,
        settings,
    )


class BodySizeLimitMiddleware:
    """Rejeita corpos maiores que o limite, mesmo sem Content-Length confiável."""

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        for name, value in scope.get("headers", []):
            if name == b"content-length" and value.isdigit() and int(value) > self.max_bytes:
                return await _send_json(send, 413, {"error": "payload_too_large", "detail": "Requisição excede o limite"})

        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise _PayloadTooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _PayloadTooLarge:
            await _send_json(send, 413, {"error": "payload_too_large", "detail": "Requisição excede o limite"})


class _PayloadTooLarge(Exception):
    pass


async def _send_json(send, status: int, body: dict):
    import json

    payload = json.dumps(body).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(payload)).encode())]})
    await send({"type": "http.response.body", "body": payload})


def create_app(
    settings: Settings | None = None,
    engine_factory: Callable[[Settings], FaceEngine] = build_engine,
) -> FastAPI:
    settings = settings or get_settings()
    state: dict = {"engine": None, "error": None}
    # As redes DNN do OpenCV não são seguras para inferência concorrente na mesma instância.
    lock = threading.Lock()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        try:
            state["engine"] = engine_factory(settings)
            log.info("Modelos carregados: %s", state["engine"].info)
        except ModelFilesError as exc:
            state["error"] = str(exc)
            log.error("Falha ao carregar modelos: %s", exc)
        except Exception as exc:  # noqa: BLE001 — qualquer falha de carga deixa o serviço em modo degradado
            state["error"] = f"Falha ao carregar modelos: {type(exc).__name__}"
            log.exception("Falha inesperada ao carregar modelos")
        yield
        state["engine"] = None

    app = FastAPI(
        title="face-attendance recognition",
        version="0.1.0",
        description="Detecção (YuNet) e reconhecimento (SFace) facial local. Não persiste dados.",
        lifespan=lifespan,
    )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_request_bytes)

    @app.exception_handler(RequestValidationFailure)
    async def _validation_failure(_req: Request, exc: RequestValidationFailure):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.code, "detail": exc.detail})

    @app.exception_handler(RequestValidationError)
    async def _schema_error(_req: Request, exc: RequestValidationError):
        # Não ecoa o corpo (pode conter imagem ou embeddings); só a localização dos erros.
        fields = [".".join(str(p) for p in e.get("loc", [])) for e in exc.errors()][:10]
        return JSONResponse(status_code=422, content={"error": "invalid_request", "detail": f"Campos inválidos: {fields}"})

    @app.exception_handler(Exception)
    async def _unexpected(_req: Request, exc: Exception):
        log.error("Erro interno: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"error": "internal_error", "detail": "Erro interno no serviço de reconhecimento"})

    def require_engine() -> FaceEngine:
        engine = state["engine"]
        if engine is None:
            raise RequestValidationFailure("models_unavailable", state["error"] or "Modelos não carregados", 503)
        return engine

    def model_fields(engine: FaceEngine) -> dict:
        return {"model_name": engine.info.model_name, "model_version": engine.info.model_version,
                "embedding_dim": engine.info.embedding_dim}

    def quality_out(q) -> QualityOut:
        return QualityOut(detection_score=round(q.detection_score, 4), face_width=round(q.face_width, 1),
                          face_height=round(q.face_height, 1), sharpness=round(q.sharpness, 2))

    @app.get("/health", response_model=HealthResponse)
    def health():
        engine = state["engine"]
        if engine is None:
            return JSONResponse(status_code=503, content=HealthResponse(
                status="degraded", models_loaded=False, error=state["error"] or "Modelos não carregados").model_dump())
        i = engine.info
        return HealthResponse(status="ok", models_loaded=True, model_name=i.model_name, model_version=i.model_version,
                              embedding_dim=i.embedding_dim, detector=f"{i.detector_name}-{i.detector_version}")

    @app.post("/faces/enroll", response_model=EnrollResponse, response_model_exclude_none=True)
    def enroll(req: EnrollRequest):
        engine = require_engine()
        try:
            img = decode_base64_image(req.image_base64, settings.max_image_bytes,
                                      settings.min_image_side, settings.max_image_side)
            with lock:
                emb, quality = engine.extract(img)
        except Rejection as r:
            return EnrollResponse(accepted=False, reason=r.reason, detail=r.detail, **model_fields(engine))
        return EnrollResponse(accepted=True, embedding=[float(x) for x in emb], quality=quality_out(quality),
                              **model_fields(engine))

    @app.post("/faces/identify", response_model=IdentifyResponse)
    def identify(req: IdentifyRequest):
        engine = require_engine()
        info = engine.info
        if len(req.gallery) > settings.max_gallery_size:
            raise RequestValidationFailure("gallery_too_large", "Galeria excede o tamanho máximo")
        gallery: list[GalleryItem] = []
        for idx, g in enumerate(req.gallery):
            if g.model_name != info.model_name or g.model_version != info.model_version:
                raise RequestValidationFailure(
                    "model_mismatch",
                    f"Embedding da galeria [{idx}] é de {g.model_name}/{g.model_version}; "
                    f"o serviço usa {info.model_name}/{info.model_version}. Regere os embeddings.", 409)
            if len(g.embedding) != info.embedding_dim:
                raise RequestValidationFailure(
                    "invalid_embedding_dimension",
                    f"Embedding da galeria [{idx}] tem dimensão {len(g.embedding)}; esperado {info.embedding_dim}")
            vec = np.asarray(g.embedding, dtype=np.float32)
            if not np.all(np.isfinite(vec)) or not np.any(vec):
                raise RequestValidationFailure("invalid_embedding", f"Embedding da galeria [{idx}] inválido")
            gallery.append(GalleryItem(g.employee_id, vec))

        threshold = req.threshold if req.threshold is not None else settings.default_threshold
        margin = req.ambiguity_margin if req.ambiguity_margin is not None else settings.default_ambiguity_margin
        base = {**model_fields(engine), "threshold": threshold, "ambiguity_margin": margin}

        try:
            img = decode_base64_image(req.image_base64, settings.max_image_bytes,
                                      settings.min_image_side, settings.max_image_side)
            with lock:
                probe, quality = engine.extract(img)
        except Rejection as r:
            return IdentifyResponse(matched=False, reason=r.reason, detail=r.detail, **base)

        result = match(probe, gallery, threshold, margin)
        return IdentifyResponse(
            matched=result.matched,
            employee_id=result.employee_id,
            similarity=None if result.similarity is None else round(result.similarity, 6),
            second_best_similarity=None if result.second_best_similarity is None else round(result.second_best_similarity, 6),
            reason=result.reason,
            candidates=[Candidate(employee_id=e, similarity=s) for e, s in result.candidates],
            quality=quality_out(quality),
            **base,
        )

    return app


def run() -> None:
    import uvicorn

    s = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [recognition] %(message)s")
    if s.host not in ("127.0.0.1", "localhost", "::1"):
        log.warning("Serviço exposto em %s — garanta que a rede é confiável (dados biométricos).", s.host)
    uvicorn.run(create_app(s), host=s.host, port=s.port, log_level="info")


if __name__ == "__main__":
    run()
