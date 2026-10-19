"""Comparação 1:N por similaridade de cosseno (busca linear — adequada para galerias pequenas)."""

from dataclasses import dataclass, field

import numpy as np


@dataclass(frozen=True)
class GalleryItem:
    employee_id: int
    embedding: np.ndarray


@dataclass
class MatchResult:
    matched: bool
    employee_id: int | None
    similarity: float | None
    second_best_similarity: float | None
    reason: str | None
    candidates: list[tuple[int, float]] = field(default_factory=list)


def l2_normalize(v: np.ndarray) -> np.ndarray:
    norm = float(np.linalg.norm(v))
    if not np.isfinite(norm) or norm == 0.0:
        raise ValueError("vetor com norma nula ou inválida")
    return v / norm


def match(
    probe: np.ndarray,
    gallery: list[GalleryItem],
    threshold: float,
    ambiguity_margin: float,
    top_k: int = 3,
) -> MatchResult:
    if not gallery:
        return MatchResult(False, None, None, None, "empty_gallery")

    p = l2_normalize(probe.astype(np.float32))
    matrix = np.stack([l2_normalize(g.embedding.astype(np.float32)) for g in gallery])
    sims = matrix @ p

    # Um funcionário pode ter várias amostras: vale a melhor pontuação dele.
    best_per_employee: dict[int, float] = {}
    for item, s in zip(gallery, sims):
        s = float(s)
        if s > best_per_employee.get(item.employee_id, -2.0):
            best_per_employee[item.employee_id] = s
    ranked = sorted(best_per_employee.items(), key=lambda kv: kv[1], reverse=True)
    candidates = [(eid, round(s, 6)) for eid, s in ranked[:top_k]]

    best_id, best = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else None

    if best < threshold:
        return MatchResult(False, None, best, second, "no_match", candidates)
    # Ambiguidade: outro funcionário também acima do limiar e muito próximo do melhor.
    if second is not None and second >= threshold and (best - second) < ambiguity_margin:
        return MatchResult(False, None, best, second, "ambiguous", candidates)
    return MatchResult(True, best_id, best, second, None, candidates)
