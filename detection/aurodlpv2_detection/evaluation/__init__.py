"""Detection accuracy evaluation.

Nothing about detection quality can be improved deliberately until it can be
measured, so this package is the instrument: a labelled corpus, entity- and
document-level precision/recall, and a committed baseline that CI ratchets.
"""

from aurodlpv2_detection.evaluation.corpus import CorpusError, Sample, load_corpus
from aurodlpv2_detection.evaluation.metrics import EvaluationReport, Score, evaluate
from aurodlpv2_detection.evaluation.runner import (
    compare,
    evaluate_corpus,
    load_baseline,
    render,
    render_failures,
    run_corpus,
    to_baseline,
)

__all__ = [
    "CorpusError",
    "EvaluationReport",
    "Sample",
    "Score",
    "compare",
    "evaluate",
    "evaluate_corpus",
    "load_baseline",
    "load_corpus",
    "render",
    "render_failures",
    "run_corpus",
    "to_baseline",
]
