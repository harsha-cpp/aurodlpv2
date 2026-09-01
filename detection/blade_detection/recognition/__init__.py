from __future__ import annotations

from blade_detection.config import DetectionConfig
from blade_detection.masking import mask_value
from blade_detection.models import Entity, EntitySource
from blade_detection.recognition.ner import (
    NER_CONFIDENCE,
    NER_PRIORITY,
    NlpModelUnavailableError,
    person_spans,
)
from blade_detection.recognition.patterns import RawMatch, apply_rules
from blade_detection.recognition.resolution import group_by_value, resolve_overlaps
from blade_detection.rules import BUILTIN_RULE_PACK
from blade_detection.rules.schema import Rule, RulePack

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
