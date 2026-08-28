"""Accuracy regression gate.

The committed baseline is a ratchet: a change may raise any metric but must not
lower one. Without this, "detection feels better" is unfalsifiable.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from aurodlpv2_detection.evaluation import (
    EvaluationReport,
    compare,
    evaluate_corpus,
    load_baseline,
    load_corpus,
    render,
)

CORPUS_DIR = Path(__file__).parents[1] / "corpus"
BASELINE_PATH = Path(__file__).parents[1] / "accuracy_baseline.json"


@pytest.fixture(scope="module")
def report() -> EvaluationReport:
    return evaluate_corpus(CORPUS_DIR)


def test_corpus_loads_and_every_label_resolves() -> None:
    """load_corpus raises if a labelled value is absent from the text."""
    samples = load_corpus(CORPUS_DIR)
    assert len(samples) >= 100, "corpus has shrunk below a usable size"
    assert any(not sample.expect_phi for sample in samples), "no negative samples"
    assert any(sample.expect_phi for sample in samples), "no positive samples"


def test_no_accuracy_regression(report: EvaluationReport) -> None:
    regressions = compare(report, load_baseline(BASELINE_PATH))
    assert not regressions, "accuracy regressed:\n" + "\n".join(
        f"  {regression}" for regression in regressions
    ) + "\n\n" + render(report)
