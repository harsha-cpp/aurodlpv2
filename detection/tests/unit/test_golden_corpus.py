from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import TypedDict, cast

import pytest

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import EmailPayload


class GoldenEmail(TypedDict):
    name: str
    subject: str
    body: str
    expected: dict[str, int]


def _load_golden_emails() -> list[GoldenEmail]:
    fixture_path = Path(__file__).parents[1] / "fixtures" / "golden_emails.json"
    raw_items = cast(list[object], json.loads(fixture_path.read_text()))
    cases: list[GoldenEmail] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        item_map = cast(dict[object, object], item)
        expected_obj = item_map.get("expected")
        if not isinstance(expected_obj, dict):
            continue
        expected_map = cast(dict[object, object], expected_obj)
        expected: dict[str, int] = {}
        for key, value in expected_map.items():
            if isinstance(value, int):
                expected[str(key)] = value
            elif isinstance(value, str):
                expected[str(key)] = int(value)
        cases.append(
            {
                "name": str(item_map.get("name", "")),
                "subject": str(item_map.get("subject", "")),
                "body": str(item_map.get("body", "")),
                "expected": expected,
            }
        )
    return cases


@pytest.mark.parametrize("case", _load_golden_emails(), ids=lambda case: case["name"])
def test_golden_email_entity_counts(case: GoldenEmail) -> None:
    result = detect_email(EmailPayload(subject=case["subject"], body=case["body"]))
    counts = Counter(entity.type for entity in result.entities)

    assert dict(counts) == case["expected"]
