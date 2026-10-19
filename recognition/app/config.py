"""Configuração do serviço de reconhecimento (variáveis de ambiente com prefixo RECOGNITION_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RECOGNITION_", extra="ignore")

    # Escuta somente em loopback por padrão. Expor na rede exige configuração explícita.
    host: str = "127.0.0.1"
    port: int = 8001

    models_dir: Path = SERVICE_ROOT / "models"
    manifest_file: Path = SERVICE_ROOT / "models" / "manifest.json"
    # Verifica SHA-256 dos modelos na inicialização (≈40 MB, leva ~100 ms).
    verify_checksums: bool = True

    # Limites de entrada
    max_request_bytes: int = 8 * 1024 * 1024
    max_image_bytes: int = 4 * 1024 * 1024
    min_image_side: int = 160
    max_image_side: int = 4096
    max_gallery_size: int = 10_000

    # Detecção / qualidade
    detection_score_threshold: float = 0.8
    min_face_size: int = 64
    min_sharpness: float = 25.0

    # Limiar inicial SOMENTE para desenvolvimento (valor sugerido pela OpenCV para SFace + cosseno).
    # O backend normalmente envia o próprio limiar; este é apenas o padrão do serviço.
    default_threshold: float = 0.363
    default_ambiguity_margin: float = 0.05


@lru_cache
def get_settings() -> Settings:
    # Em execução normal lê também o .env da raiz do repositório (somente variáveis RECOGNITION_*).
    return Settings(_env_file=SERVICE_ROOT.parent / ".env", _env_file_encoding="utf-8")
