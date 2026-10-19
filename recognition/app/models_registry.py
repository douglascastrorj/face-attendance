"""Leitura do manifesto dos modelos e verificação de integridade dos arquivos ONNX."""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path


class ModelFilesError(RuntimeError):
    """Modelo ausente, corrompido ou manifesto inválido."""


@dataclass(frozen=True)
class ModelSpec:
    role: str
    name: str
    version: str
    file: str
    sha256: str
    embedding_dim: int | None = None


def load_manifest(manifest_file: Path) -> dict[str, ModelSpec]:
    try:
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ModelFilesError(f"Manifesto de modelos não encontrado: {manifest_file}") from exc
    specs: dict[str, ModelSpec] = {}
    for m in data.get("models", []):
        specs[m["role"]] = ModelSpec(
            role=m["role"],
            name=m["name"],
            version=m["version"],
            file=m["file"],
            sha256=m["sha256"],
            embedding_dim=m.get("embedding_dim"),
        )
    for role in ("detector", "recognizer"):
        if role not in specs:
            raise ModelFilesError(f"Manifesto sem modelo para o papel '{role}'")
    return specs


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve_model_file(models_dir: Path, spec: ModelSpec, verify: bool) -> Path:
    path = models_dir / spec.file
    if not path.is_file():
        raise ModelFilesError(
            f"Arquivo do modelo '{spec.name}' ausente em {path}. Execute `npm run models:download`."
        )
    if verify and sha256_of(path) != spec.sha256:
        raise ModelFilesError(
            f"Checksum inválido para {path}. Apague o arquivo e execute `npm run models:download`."
        )
    return path
