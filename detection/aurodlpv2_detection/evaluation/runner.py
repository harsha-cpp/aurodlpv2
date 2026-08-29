from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import cast

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.evaluation.corpus import Sample, load_corpus
from aurodlpv2_detection.evaluation.metrics import EvaluationReport, Score, evaluate
from aurodlpv2_detection.models import EmailPayload, Entity

TOLERANCE = 0.005


@dataclass(frozen=True, slots=True)
class Regression:
    metric: str
    baseline: float
    current: float

    def __str__(self) -> str:
        drop = self.baseline - self.current
        return f"{self.metric}: {self.current:.3f} < baseline {self.baseline:.3f} (-{drop:.3f})"


def run_corpus(
    samples: list[Sample],
    config: DetectionConfig | None = None,
) -> EvaluationReport:
    scored: list[tuple[Sample, list[Entity]]] = []
    for sample in samples:
        result = detect_email(
            EmailPayload(subject=sample.subject, body=sample.body),
            config,
        )
        scored.append((sample, result.entities))
    return evaluate(scored)


def _score_dict(score: Score) -> dict[str, float]:
    return {
        "precision": round(score.precision, 4),
        "recall": round(score.recall, 4),
        "f1": round(score.f1, 4),
        "support": float(score.support),
    }


def to_baseline(report: EvaluationReport) -> dict[str, object]:
    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "documents": report.documents_evaluated,
        "document": _score_dict(report.document),
        "entity_total": _score_dict(report.entity_total),
        "clean_false_alarm_rate": round(report.clean_false_alarm_rate, 4),
        "duplicate_inflation": round(report.duplicate_inflation, 4),
        "per_type": {name: _score_dict(score) for name, score in report.per_type.items()},
    }


def load_baseline(path: Path) -> dict[str, object]:
    return cast(dict[str, object], json.loads(path.read_text(encoding="utf-8")))


def _nested_float(source: dict[str, object], outer: str, inner: str) -> float | None:
    block = source.get(outer)
    if not isinstance(block, dict):
        return None
    value = cast(dict[str, object], block).get(inner)
    return float(value) if isinstance(value, int | float) else None


def compare(report: EvaluationReport, baseline: dict[str, object]) -> list[Regression]:
    regressions: list[Regression] = []

    def check_higher_is_better(metric: str, recorded: float | None, current: float) -> None:
        if recorded is None:
            return
        if current < recorded - TOLERANCE:
            regressions.append(Regression(metric, recorded, current))

    for group, score in (("document", report.document), ("entity_total", report.entity_total)):
        for name in ("precision", "recall", "f1"):
            check_higher_is_better(
                f"{group}.{name}",
                _nested_float(baseline, group, name),
                getattr(score, name),
            )

    per_type_raw = baseline.get("per_type")
    if isinstance(per_type_raw, dict):
        for entity_type, recorded in cast(dict[str, object], per_type_raw).items():
            if not isinstance(recorded, dict):
                continue
            recorded_block = cast(dict[str, object], recorded)
            current = report.per_type.get(entity_type)
            for name in ("precision", "recall", "f1"):
                floor = recorded_block.get(name)
                if not isinstance(floor, int | float):
                    continue
                check_higher_is_better(
                    f"{entity_type}.{name}",
                    float(floor),
                    getattr(current, name) if current else 0.0,
                )

    recorded_alarm = baseline.get("clean_false_alarm_rate")
    if isinstance(recorded_alarm, int | float):
        ceiling = float(recorded_alarm)
        if report.clean_false_alarm_rate > ceiling + TOLERANCE:
            regressions.append(
                Regression(
                    "clean_false_alarm_rate (lower is better)",
                    ceiling,
                    report.clean_false_alarm_rate,
                )
            )

    return regressions


def _row(label: str, score: Score) -> str:
    return (
        f"{label:<20} {score.support:>5} {score.true_positives:>5} "
        f"{score.false_positives:>5} {score.false_negatives:>5} "
        f"{score.precision:>9.3f} {score.recall:>8.3f} {score.f1:>7.3f}"
    )


def render(report: EvaluationReport) -> str:
    header = (
        f"{'ENTITY TYPE':<20} {'SUPP':>5} {'TP':>5} {'FP':>5} {'FN':>5} "
        f"{'PRECISION':>9} {'RECALL':>8} {'F1':>7}"
    )
    lines = [header, "-" * len(header)]
    lines.extend(_row(name, score) for name, score in report.per_type.items())
    lines.append("-" * len(header))
    lines.append(_row("ALL ENTITIES", report.entity_total))
    lines.append("")
    lines.append(f"{'DOCUMENT LEVEL':<20} {'':>5} {'':>5} {'':>5} {'':>5}")
    lines.append(_row("documents", report.document))
    lines.append("")
    lines.append(f"documents evaluated      {report.documents_evaluated}")
    lines.append(
        f"clean docs flagged       {report.clean_documents_flagged}/{report.clean_documents} "
        f"({report.clean_false_alarm_rate:.1%} false-alarm rate)"
    )
    lines.append(
        f"duplicate inflation      {report.duplicate_inflation:.2f}x "
        f"({report.detections_emitted} detections / {report.distinct_detections} distinct)"
    )
    return "\n".join(lines)


def render_failures(report: EvaluationReport, limit: int = 25) -> str:
    interesting = [
        sample
        for sample in report.samples
        if sample.outcome != "true_negative" and (sample.missed or sample.spurious)
    ]
    if not interesting:
        return "no per-document failures"

    lines = [f"{'SAMPLE':<28} {'OUTCOME':<15} {'MISSED':<34} SPURIOUS"]
    lines.append("-" * 108)
    for sample in interesting[:limit]:
        lines.append(
            f"{sample.sample_id:<28} {sample.outcome:<15} "
            f"{', '.join(sample.missed) or '-':<34} {', '.join(sample.spurious) or '-'}"
        )
    if len(interesting) > limit:
        lines.append(f"... and {len(interesting) - limit} more")
    return "\n".join(lines)


def evaluate_corpus(corpus_dir: Path, config: DetectionConfig | None = None) -> EvaluationReport:
    return run_corpus(load_corpus(corpus_dir), config)
