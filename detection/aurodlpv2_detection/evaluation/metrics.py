from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

from aurodlpv2_detection.evaluation.corpus import ExpectedSpan, Sample
from aurodlpv2_detection.evaluation.taxonomy import canonicalize
from aurodlpv2_detection.models import Entity

DocOutcome = Literal["true_positive", "false_positive", "true_negative", "false_negative"]


@dataclass(frozen=True, slots=True)
class Score:
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0

    @property
    def support(self) -> int:
        return self.true_positives + self.false_negatives

    @property
    def precision(self) -> float:
        predicted = self.true_positives + self.false_positives
        return self.true_positives / predicted if predicted else 0.0

    @property
    def recall(self) -> float:
        return self.true_positives / self.support if self.support else 0.0

    @property
    def f1(self) -> float:
        denominator = self.precision + self.recall
        if denominator == 0.0:
            return 0.0
        return 2 * self.precision * self.recall / denominator


@dataclass(slots=True)
class _Tally:
    true_positives: int = 0
    false_positives: int = 0
    false_negatives: int = 0

    def freeze(self) -> Score:
        return Score(self.true_positives, self.false_positives, self.false_negatives)


@dataclass(frozen=True, slots=True)
class MatchResult:
    matched: tuple[ExpectedSpan, ...]
    missed: tuple[ExpectedSpan, ...]
    spurious: tuple[Entity, ...]


@dataclass(frozen=True, slots=True)
class SampleResult:
    sample_id: str
    category: str
    outcome: DocOutcome
    missed: tuple[str, ...]
    spurious: tuple[str, ...]


@dataclass(slots=True)
class EvaluationReport:
    per_type: dict[str, Score] = field(default_factory=dict[str, Score])
    entity_total: Score = Score()
    document: Score = Score()
    documents_evaluated: int = 0
    clean_documents: int = 0
    clean_documents_flagged: int = 0
    detections_emitted: int = 0
    distinct_detections: int = 0
    samples: list[SampleResult] = field(default_factory=list[SampleResult])

    @property
    def clean_false_alarm_rate(self) -> float:
        if not self.clean_documents:
            return 0.0
        return self.clean_documents_flagged / self.clean_documents

    @property
    def duplicate_inflation(self) -> float:
        if not self.distinct_detections:
            return 1.0
        return self.detections_emitted / self.distinct_detections


def _overlaps(left_start: int, left_end: int, right_start: int, right_end: int) -> bool:
    return left_start < right_end and right_start < left_end


def match_spans(expected: tuple[ExpectedSpan, ...], detected: list[Entity]) -> MatchResult:
    remaining = list(detected)
    matched: list[ExpectedSpan] = []
    missed: list[ExpectedSpan] = []

    for label in expected:
        hit: Entity | None = None
        for candidate in remaining:
            if candidate.start is None or candidate.end is None:
                continue
            if canonicalize(candidate.type) != label.type:
                continue
            if candidate.source != label.field:
                continue
            if not _overlaps(label.start, label.end, candidate.start, candidate.end):
                continue
            hit = candidate
            break
        if hit is None:
            missed.append(label)
        else:
            remaining.remove(hit)
            matched.append(label)

    return MatchResult(tuple(matched), tuple(missed), tuple(remaining))


def evaluate(scored: list[tuple[Sample, list[Entity]]]) -> EvaluationReport:
    tallies: dict[str, _Tally] = defaultdict(_Tally)
    document = _Tally()
    report = EvaluationReport()
    distinct: set[tuple[str, str, str]] = set()

    for sample, raw_detections in scored:
        detections = [
            entity
            for entity in raw_detections
            if canonicalize(entity.type) not in sample.ignore_types
        ]

        report.documents_evaluated += 1
        report.detections_emitted += len(detections)
        for entity in detections:
            distinct.add(
                (sample.id, canonicalize(entity.type), entity.masked_value.strip().upper())
            )

        result = match_spans(sample.spans, detections)
        for label in result.matched:
            tallies[label.type].true_positives += 1
        for label in result.missed:
            tallies[label.type].false_negatives += 1
        for entity in result.spurious:
            tallies[canonicalize(entity.type)].false_positives += 1

        flagged = bool(detections)
        if sample.expect_phi and flagged:
            document.true_positives += 1
            outcome: DocOutcome = "true_positive"
        elif sample.expect_phi:
            document.false_negatives += 1
            outcome = "false_negative"
        elif flagged:
            document.false_positives += 1
            outcome = "false_positive"
        else:
            outcome = "true_negative"

        if not sample.expect_phi:
            report.clean_documents += 1
            if flagged:
                report.clean_documents_flagged += 1

        report.samples.append(
            SampleResult(
                sample_id=sample.id,
                category=sample.category,
                outcome=outcome,
                missed=tuple(sorted({span.type for span in result.missed})),
                spurious=tuple(sorted({canonicalize(item.type) for item in result.spurious})),
            )
        )

    report.per_type = {name: tally.freeze() for name, tally in sorted(tallies.items())}
    report.entity_total = Score(
        true_positives=sum(tally.true_positives for tally in tallies.values()),
        false_positives=sum(tally.false_positives for tally in tallies.values()),
        false_negatives=sum(tally.false_negatives for tally in tallies.values()),
    )
    report.document = document.freeze()
    report.distinct_detections = len(distinct)
    return report
