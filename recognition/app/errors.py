"""Exceções de domínio do serviço de reconhecimento."""


class Rejection(Exception):
    """Rejeição técnica da imagem (sem rosto, múltiplos rostos, baixa qualidade...).

    Não é erro do servidor: é devolvida ao chamador como resultado com `reason`.
    """

    def __init__(self, reason: str, detail: str):
        super().__init__(detail)
        self.reason = reason
        self.detail = detail


class RequestValidationFailure(Exception):
    """Requisição estruturalmente inválida (galeria incompatível, dimensão errada...). Vira HTTP 4xx."""

    def __init__(self, code: str, detail: str, status_code: int = 422):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status_code = status_code
