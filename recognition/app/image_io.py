"""Decodificação e validação de imagens recebidas. Tudo em memória: nenhum arquivo temporário é criado."""

import base64
import binascii

import cv2
import numpy as np

from .errors import Rejection

_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def decode_base64_image(data: str, max_bytes: int, min_side: int, max_side: int) -> np.ndarray:
    # Aceita data URL ("data:image/jpeg;base64,...") ou base64 puro.
    if data.startswith("data:"):
        _, _, data = data.partition(",")
    # Tamanho decodificado ≈ 3/4 do texto; rejeita antes de alocar.
    if len(data) * 3 // 4 > max_bytes:
        raise Rejection("image_too_large", "Imagem excede o tamanho máximo permitido")
    try:
        raw = base64.b64decode(data, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise Rejection("invalid_image", "Conteúdo base64 inválido") from exc
    if len(raw) > max_bytes:
        raise Rejection("image_too_large", "Imagem excede o tamanho máximo permitido")
    if not (raw.startswith(_JPEG_MAGIC) or raw.startswith(_PNG_MAGIC)):
        raise Rejection("invalid_image", "Formato não suportado (use JPEG ou PNG)")

    img = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    del raw
    if img is None:
        raise Rejection("invalid_image", "Não foi possível decodificar a imagem")
    h, w = img.shape[:2]
    if min(h, w) < min_side:
        raise Rejection("image_too_small", f"Resolução mínima: {min_side}px no menor lado")
    if max(h, w) > max_side:
        raise Rejection("image_too_large", f"Resolução máxima: {max_side}px no maior lado")
    return img
