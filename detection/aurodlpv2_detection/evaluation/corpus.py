from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from aurodlpv2_detection.evaluation.taxonomy import CANONICAL_TYPES

FieldName = Literal["subject", "body"]


class CorpusError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class ExpectedSpan:
    type: str
    value: str
    field: FieldName
    start: int
    end: int


@dataclass(frozen=True, slots=True)
class Sample:
    id: str
    category: str
    subject: str
    body: str
    expect_phi: bool
    spans: tuple[ExpectedSpan, ...]
    ignore_types: frozenset[str]
    notes: str

    def text(self, field: FieldName) -> str:
        return self.subject if field == "subject" else self.body


def _occurrences(haystack: str, needle: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    if not needle:
        return spans
    cursor = 0
    while True:
        found = haystack.find(needle, cursor)
        if found < 0:
            return spans
        spans.append((found, found + len(needle)))
        cursor = found + len(needle)


def _resolve_spans(
    sample_id: str,
    subject: str,
    body: str,
    labelled: list[tuple[str, str]],
) -> tuple[ExpectedSpan, ...]:
    spans: list[ExpectedSpan] = []
    for entity_type, value in labelled:
        if entity_type not in CANONICAL_TYPES:
            raise CorpusError(
                f"{sample_id}: entity type {entity_type!r} is not in the canonical taxonomy"
            )
        found_any = False
        for field, text in (("subject", subject), ("body", body)):
            for start, end in _occurrences(text, value):
                found_any = True
                spans.append(
                    ExpectedSpan(
                        type=entity_type,
                        value=value,
                        field=cast(FieldName, field),
                        start=start,
                        end=end,
                    )
                )
        if not found_any:
            raise CorpusError(
                f"{sample_id}: labelled value {value!r} ({entity_type}) "
                "does not appear in the subject or body"
            )
    return tuple(spans)


def _join_body(raw: object, sample_id: str) -> str:
    if isinstance(raw, str):
        return raw
    if isinstance(raw, list):
        lines: list[str] = []
        for line in cast(list[object], raw):
            if not isinstance(line, str):
                raise CorpusError(f"{sample_id}: every 'body' line must be a string")
            lines.append(line)
        return "\n".join(lines)
    raise CorpusError(f"{sample_id}: 'body' must be a string or an array of strings")


def _parse_sample(raw: object, source: Path, index: int) -> Sample:
    where = f"{source.name}[{index}]"
    if not isinstance(raw, dict):
        raise CorpusError(f"{where}: expected a JSON object")
    record = cast(dict[str, object], raw)

    def _str(key: str, *, default: str | None = None) -> str:
        value = record.get(key, default)
        if not isinstance(value, str):
            raise CorpusError(f"{where}: {key!r} must be a string")
        return value

    sample_id = _str("id")
    subject = _str("subject", default="")
    body = _join_body(record.get("body", ""), sample_id)

    expect_phi_raw = record.get("expect_phi")
    if not isinstance(expect_phi_raw, bool):
        raise CorpusError(f"{sample_id}: 'expect_phi' must be a boolean")

    entities_raw = record.get("entities", [])
    if not isinstance(entities_raw, list):
        raise CorpusError(f"{sample_id}: 'entities' must be a list")

    labelled: list[tuple[str, str]] = []
    for item in cast(list[object], entities_raw):
        if not isinstance(item, dict):
            raise CorpusError(f"{sample_id}: each entity must be an object")
        entity = cast(dict[str, object], item)
        entity_type = entity.get("type")
        value = entity.get("value")
        if not isinstance(entity_type, str) or not isinstance(value, str):
            raise CorpusError(f"{sample_id}: entity needs string 'type' and 'value'")
        labelled.append((entity_type, value))

    if labelled and not expect_phi_raw:
        raise CorpusError(f"{sample_id}: labelled entities but 'expect_phi' is false")

    ignore_raw = record.get("ignore_types", [])
    if not isinstance(ignore_raw, list):
        raise CorpusError(f"{sample_id}: 'ignore_types' must be a list")
    ignore_types: set[str] = set()
    for item in cast(list[object], ignore_raw):
        if not isinstance(item, str):
            raise CorpusError(f"{sample_id}: 'ignore_types' entries must be strings")
        if item not in CANONICAL_TYPES:
            raise CorpusError(f"{sample_id}: ignored type {item!r} is not in the taxonomy")
        ignore_types.add(item)

    overlap = ignore_types & {entity_type for entity_type, _ in labelled}
    if overlap:
        raise CorpusError(f"{sample_id}: {sorted(overlap)} are both labelled and ignored")

    return Sample(
        id=sample_id,
        category=_str("category", default="uncategorised"),
        subject=subject,
        body=body,
        expect_phi=expect_phi_raw,
        spans=_resolve_spans(sample_id, subject, body, labelled),
        ignore_types=frozenset(ignore_types),
        notes=_str("notes", default=""),
    )


def load_corpus(directory: Path) -> list[Sample]:
    if not directory.is_dir():
        raise CorpusError(f"corpus directory not found: {directory}")

    samples: list[Sample] = []
    seen: set[str] = set()
    for path in sorted(directory.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise CorpusError(f"{path.name}: expected a JSON array of samples")
        for index, raw in enumerate(cast(list[object], payload)):
            sample = _parse_sample(raw, path, index)
            if sample.id in seen:
                raise CorpusError(f"duplicate sample id: {sample.id}")
            seen.add(sample.id)
            samples.append(sample)

    if not samples:
        raise CorpusError(f"no samples found in {directory}")
    return samples
