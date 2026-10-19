"""Contratos HTTP do serviço de reconhecimento."""

from pydantic import BaseModel, Field


class QualityOut(BaseModel):
    detection_score: float
    face_width: float
    face_height: float
    sharpness: float


class ModelOut(BaseModel):
    model_name: str
    model_version: str
    embedding_dim: int


class EnrollRequest(BaseModel):
    image_base64: str = Field(min_length=1, description="JPEG/PNG em base64 ou data URL")


class EnrollResponse(ModelOut):
    accepted: bool
    reason: str | None = None
    detail: str | None = None
    embedding: list[float] | None = None
    quality: QualityOut | None = None


class GalleryEntry(BaseModel):
    employee_id: int = Field(gt=0)
    embedding: list[float]
    model_name: str
    model_version: str


class IdentifyRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    gallery: list[GalleryEntry]
    threshold: float | None = Field(default=None, ge=-1.0, le=1.0)
    ambiguity_margin: float | None = Field(default=None, ge=0.0, le=1.0)


class Candidate(BaseModel):
    employee_id: int
    similarity: float


class IdentifyResponse(ModelOut):
    matched: bool
    employee_id: int | None = None
    similarity: float | None = None
    second_best_similarity: float | None = None
    threshold: float
    ambiguity_margin: float
    reason: str | None = None
    detail: str | None = None
    candidates: list[Candidate] = []
    quality: QualityOut | None = None


class HealthResponse(BaseModel):
    status: str
    models_loaded: bool
    model_name: str | None = None
    model_version: str | None = None
    embedding_dim: int | None = None
    detector: str | None = None
    error: str | None = None


class ErrorResponse(BaseModel):
    error: str
    detail: str
