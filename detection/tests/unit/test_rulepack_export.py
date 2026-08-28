"""The exported rule pack must stay in step with the committed client copy.

The extension and the engine drifted once already: different entity names,
different confidences, different policy, and a verdict that depended on whether
the backend answered. This test is what stops it happening twice.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from aurodlpv2_detection.rules import export_json, export_pack, to_javascript_pattern

CLIENT_PACK = (
    Path(__file__).parents[3]
    / "frontend"
    / "packages"
    / "shared"
    / "src"
    / "detection"
    / "rulepack.json"
)


def test_committed_client_pack_matches_the_python_export() -> None:
    if not CLIENT_PACK.exists():  # pragma: no cover - frontend not checked out
        pytest.skip(f"client rule pack not present at {CLIENT_PACK}")

    committed = CLIENT_PACK.read_text(encoding="utf-8")
    assert committed == export_json(), (
        "the committed client rule pack is stale. Regenerate it with:\n"
        "  make rulepack"
    )


@pytest.mark.parametrize(
    ("pattern", "expected"),
    [
        (r"(?i:ab)", r"(?:[aA][bB])"),
        (r"x(?i:no|number)?y", r"x(?:[nN][oO]|[nN][uU][mM][bB][eE][rR])?y"),
        (r"\b[A-Z]{5}\b", r"\b[A-Z]{5}\b"),
        (r"(?i:a)(?i:b)", r"(?:[aA])(?:[bB])"),
        # Escape sequences pass through: expanding the s in \s would turn a
        # whitespace class into a literal.
        (r"(?i:no\.?\s*\d{2})", r"(?:[nN][oO]\.?\s*\d{2})"),
    ],
)
def test_inline_flag_translation(pattern: str, expected: str) -> None:
    """JavaScript has no scoped inline flags, so (?i:...) is expanded."""
    assert to_javascript_pattern(pattern) == expected


def test_unbalanced_inline_group_is_rejected() -> None:
    with pytest.raises(ValueError, match="unbalanced"):
        to_javascript_pattern(r"(?i:abc")


def test_character_class_inside_inline_group_is_rejected() -> None:
    """Better to fail the build than emit a silently wrong regex."""
    with pytest.raises(ValueError, match="character classes"):
        to_javascript_pattern(r"(?i:[a-z]+)")


def test_exported_patterns_carry_no_python_only_syntax() -> None:
    for rule in export_pack()["rules"]:
        for field in ("pattern", "continuation"):
            value = rule[field]
            if value:
                assert "(?i:" not in value, f"{rule['name']}.{field} still has a scoped flag"


def test_export_is_valid_json_and_carries_scoring_constants() -> None:
    payload = json.loads(export_json())
    assert payload["rules"]
    assert payload["icd10Categories"]
    assert payload["scoring"]["riskCurveK"] > 0
    assert payload["scoring"]["severityBuckets"][-1]["below"] is None
