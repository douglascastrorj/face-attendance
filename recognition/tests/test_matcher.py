import numpy as np
import pytest

from app.matcher import GalleryItem, l2_normalize, match


def unit(*values):
    v = np.zeros(4, dtype=np.float32)
    v[: len(values)] = values
    return v


def test_empty_gallery_is_rejected():
    r = match(unit(1), [], 0.5, 0.05)
    assert not r.matched and r.reason == "empty_gallery"


def test_best_candidate_above_threshold_matches():
    gallery = [GalleryItem(1, unit(1, 0)), GalleryItem(2, unit(0, 1))]
    r = match(unit(1, 0.1), gallery, 0.5, 0.05)
    assert r.matched and r.employee_id == 1 and r.similarity > 0.99
    assert r.candidates[0][0] == 1


def test_below_threshold_is_no_match():
    r = match(unit(0, 0, 1), [GalleryItem(1, unit(1, 0))], 0.5, 0.05)
    assert not r.matched and r.reason == "no_match" and r.employee_id is None


def test_two_close_candidates_above_threshold_is_ambiguous():
    gallery = [GalleryItem(1, unit(1, 0.02)), GalleryItem(2, unit(1, -0.02))]
    r = match(unit(1, 0), gallery, 0.5, 0.05)
    assert not r.matched and r.reason == "ambiguous"


def test_multiple_samples_of_same_employee_are_not_ambiguous():
    gallery = [GalleryItem(1, unit(1, 0.02)), GalleryItem(1, unit(1, -0.02))]
    r = match(unit(1, 0), gallery, 0.5, 0.05)
    assert r.matched and r.employee_id == 1 and r.second_best_similarity is None


def test_scale_invariance():
    r = match(unit(10, 0), [GalleryItem(1, unit(0.1, 0))], 0.9, 0.05)
    assert r.matched and r.similarity == pytest.approx(1.0)


def test_zero_vector_raises():
    with pytest.raises(ValueError):
        l2_normalize(np.zeros(4, dtype=np.float32))
