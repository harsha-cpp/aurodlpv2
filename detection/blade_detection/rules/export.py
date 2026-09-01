from __future__ import annotations

import json
from typing import Any, Final

from blade_detection.rules.pack import BUILTIN_RULE_PACK
from blade_detection.rules.schema import Rule, RulePack
from blade_detection.scoring.weights import (
    REPEAT_DAMPING,
    RISK_CURVE_K,
    SENSITIVITY_WEIGHTS,
    SEVERITY_BUCKETS,
)

_INLINE_FLAG: Final[str] = "(?i:"


def _expand_case_insensitive_group(body: str) -> str:
    out: list[str] = []
    index = 0
    while index < len(body):
        character = body[index]
        if character == "\\":
            out.append(body[index : index + 2])
            index += 2
            continue
        if character == "[":
            raise ValueError(
                "character classes inside (?i:...) are not supported by the JavaScript translation"
            )
        if character.isalpha() and character.isascii():
            out.append(f"[{character.lower()}{character.upper()}]")
        else:
            out.append(character)
        index += 1
    return "".join(out)


def to_javascript_pattern(pattern: str) -> str:
    result: list[str] = []
    index = 0
    while index < len(pattern):
        start = pattern.find(_INLINE_FLAG, index)
        if start < 0:
            result.append(pattern[index:])
            break
        result.append(pattern[index:start])

        depth = 1
        cursor = start + len(_INLINE_FLAG)
        body_start = cursor
        while cursor < len(pattern) and depth:
            char = pattern[cursor]
            if char == "\\":
                cursor += 2
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0:
                    break
            cursor += 1
        if depth:
            raise ValueError(f"unbalanced (?i: group in pattern: {pattern!r}")

        result.append("(?:" + _expand_case_insensitive_group(pattern[body_start:cursor]) + ")")
        index = cursor + 1
    return "".join(result)


def rule_to_dict(rule: Rule) -> dict[str, Any]:
    return {
        "entityType": rule.entity_type,
        "name": rule.name,
        "pattern": to_javascript_pattern(rule.pattern),
        "baseConfidence": rule.base_confidence,
        "validator": rule.validator,
        "contextTerms": rule.context_terms,
        "negativeTerms": rule.negative_terms,
        "requiresContext": rule.requires_context,
        "contextWindow": rule.context_window,
        "contextBoost": rule.context_boost,
        "negativePenalty": rule.negative_penalty,
        "priority": rule.priority,
        "valueGroup": rule.value_group,
        "caseSensitive": rule.case_sensitive,
        "continuation": (to_javascript_pattern(rule.continuation) if rule.continuation else None),
    }


def icd10_categories() -> list[str]:
    import simple_icd_10_cm as icd

    return sorted(
        code for code in icd.get_all_codes(with_dots=False) if len(code) == 3 and code[0].isalpha()
    )


def export_pack(pack: RulePack | None = None) -> dict[str, Any]:
    resolved = pack or BUILTIN_RULE_PACK
    return {
        "version": resolved.version,
        "rules": [rule_to_dict(rule) for rule in resolved.rules],
        "icd10Categories": icd10_categories(),
        "scoring": {
            "weights": SENSITIVITY_WEIGHTS,
            "riskCurveK": RISK_CURVE_K,
            "repeatDamping": REPEAT_DAMPING,
            "severityBuckets": [
                {"below": None if cutoff == float("inf") else cutoff, "severity": severity}
                for cutoff, severity in SEVERITY_BUCKETS
            ],
        },
    }


def export_json(pack: RulePack | None = None, *, indent: int = 2) -> str:
    return json.dumps(export_pack(pack), indent=indent, sort_keys=False) + "\n"
