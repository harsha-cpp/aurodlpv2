"""Text analysis: rule pack + NER, resolved into non-overlapping entities."""

from __future__ import annotations

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.masking import mask_value
from aurodlpv2_detection.models import Entity, EntitySource
from aurodlpv2_detection.recognition.ner import (
    NER_CONFIDENCE,
    NER_PRIORITY,
    NlpModelUnavailableError,
    person_spans,
)
from aurodlpv2_detection.recognition.patterns import RawMatch, apply_rules
from aurodlpv2_detection.recognition.resolution import group_by_value, resolve_overlaps
from aurodlpv2_detection.rules import BUILTIN_RULE_PACK
from aurodlpv2_detection.rules.schema import Rule, RulePack

__all__ = [
    "NlpModelUnavailableError",
    "RawMatch",
    "analyze",
    "group_by_value",
    "resolve_matches",
]


def _enabled_types(config: DetectionConfig) -> frozenset[str] | None:
    toggles = config.recognizers
    disabled: set[str] = set()
    if not toggles.enable_aadhaar:
        disabled.add("IN_AADHAAR")
    if not toggles.enable_pan:
        disabled.add("IN_PAN")
    if not toggles.enable_abha:
        disabled.update({"ABHA_NUMBER", "ABHA_ADDRESS"})
    if not toggles.enable_mrn:
        disabled.update({"MRN", "PATIENT_VISIT_ID"})
    if not toggles.enable_icd10:
        disabled.add("ICD10")
    if not disabled:
        return None
    return frozenset(
        rule.entity_type for rule in BUILTIN_RULE_PACK.rules if rule.entity_type not in disabled
    )


def _custom_mrn_rules(config: DetectionConfig) -> list[Rule]:
    """Per-tenant MRN shapes, so one hospital's format is a setting not a fork."""
    return [
        Rule(
            entity_type="MRN",
            name=f"mrn-tenant-{index}",
            pattern=pattern,
            base_confidence=0.75,
            priority=55,
        )
        for index, pattern in enumerate(config.recognizers.custom_mrn_patterns, start=1)
        if 0 < len(pattern) <= 200
    ]


def resolve_matches(matches: list[RawMatch]) -> list[RawMatch]:
    return resolve_overlaps(matches)


def analyze(
    text: str,
    source: EntitySource,
    config: DetectionConfig,
    *,
    attachment_id: str | None = None,
    rule_pack: RulePack | None = None,
) -> list[Entity]:
    """Detect entities in one field of text."""
    if not text.strip():
        return []

    pack = rule_pack or BUILTIN_RULE_PACK
    rules = pack.for_types(_enabled_types(config)) + _custom_mrn_rules(config)
    matches = apply_rules(rules, text)

    if config.nlp.use_ner:
        matches.extend(
            RawMatch(
                entity_type="PERSON",
                rule_name="spacy-ner",
                value=span.text,
                start=span.start,
                end=span.end,
                confidence=NER_CONFIDENCE,
                priority=NER_PRIORITY,
                had_context=False,
            )
            for span in person_spans(text, config.nlp.spacy_model)
        )

    return [
        Entity(
            type=match.entity_type,
            masked_value=mask_value(match.value),
            confidence=match.confidence,
            source=source,
            attachment_id=attachment_id,
            start=match.start,
            end=match.end,
        )
        for match in resolve_overlaps(matches)
    ]
