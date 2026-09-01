from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

import structlog

from blade_detection.recognition.validators import get_validator
from blade_detection.rules.schema import Rule

logger = structlog.get_logger(__name__)

MIN_CONFIDENCE = 0.5


@dataclass(frozen=True, slots=True)
class RawMatch:
    entity_type: str
    rule_name: str
    value: str
    start: int
    end: int
    confidence: float
    priority: int
    had_context: bool


@lru_cache(maxsize=512)
def _compiled(pattern: str, case_sensitive: bool) -> re.Pattern[str]:
    flags = 0 if case_sensitive else re.IGNORECASE
    return re.compile(pattern, flags)


@lru_cache(maxsize=512)
def _term_pattern(terms: tuple[str, ...]) -> re.Pattern[str] | None:
    if not terms:
        return None
    escaped = sorted((re.escape(term) for term in terms), key=len, reverse=True)
    return re.compile(r"(?<!\w)(?:" + "|".join(escaped) + r")(?!\w)", re.IGNORECASE)


def _window(text: str, start: int, end: int, radius: int) -> str:
    return text[max(0, start - radius) : min(len(text), end + radius)]


def _score(rule: Rule, text: str, start: int, end: int) -> tuple[float, bool] | None:
    window = _window(text, start, end, rule.context_window)

    positive = _term_pattern(tuple(rule.context_terms))
    has_context = bool(positive.search(window)) if positive else False
    if rule.requires_context and not has_context:
        return None

    negative = _term_pattern(tuple(rule.negative_terms))
    has_negative = bool(negative.search(window)) if negative else False

    confidence = rule.base_confidence
    if has_context:
        confidence += rule.context_boost
    if has_negative:
        confidence -= rule.negative_penalty

    confidence = max(0.0, min(1.0, confidence))
    if confidence < MIN_CONFIDENCE:
        return None
    return confidence, has_context


def _emit(
    rule: Rule,
    text: str,
    value: str,
    start: int,
    end: int,
) -> RawMatch | None:
    if not value.strip():
        return None
    if not get_validator(rule.validator)(value):
        return None
    scored = _score(rule, text, start, end)
    if scored is None:
        return None
    confidence, had_context = scored
    return RawMatch(
        entity_type=rule.entity_type,
        rule_name=rule.name,
        value=value,
        start=start,
        end=end,
        confidence=confidence,
        priority=rule.priority,
        had_context=had_context,
    )


def _continuations(rule: Rule, text: str, cursor: int) -> list[RawMatch]:
    if rule.continuation is None:
        return []
    pattern = _compiled(rule.continuation, rule.case_sensitive)
    found: list[RawMatch] = []
    position = cursor
    while True:
        match = pattern.match(text, position)
        if match is None:
            return found
        start, end = match.span(1)
        emitted = _emit(rule, text, match.group(1), start, end)
        if emitted is None:
            return found
        found.append(emitted)
        position = match.end()


def apply_rule(rule: Rule, text: str) -> list[RawMatch]:
    try:
        pattern = _compiled(rule.pattern, rule.case_sensitive)
    except re.error:
        logger.warning("invalid rule pattern", rule=rule.name)
        return []

    matches: list[RawMatch] = []
    for match in pattern.finditer(text):
        group = rule.value_group
        if group and group > (match.re.groups or 0):
            continue
        span = match.span(group)
        if span[0] < 0:
            continue
        emitted = _emit(rule, text, match.group(group), span[0], span[1])
        if emitted is not None:
            matches.append(emitted)
            matches.extend(_continuations(rule, text, match.end()))
    return matches


def apply_rules(rules: list[Rule], text: str) -> list[RawMatch]:
    found: list[RawMatch] = []
    for rule in rules:
        found.extend(apply_rule(rule, text))
    return found
