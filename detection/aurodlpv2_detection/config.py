"""Detection engine configuration.

See ``docs/plans/detection-engine.md`` §11. Pydantic settings allow per-tenant
overrides (e.g. hospital-specific MRN patterns, OCR language sets).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OcrConfig(BaseModel):
    enabled: bool = True
    languages: list[str] = Field(default_factory=lambda: ["eng"])
    fallback_confidence_threshold: float = 0.55
    page_timeout_seconds: float = 4.0
    document_timeout_seconds: float = 60.0
    use_paddle_for_indic: bool = True


class RecognizerConfig(BaseModel):
    enable_aadhaar: bool = True
    enable_pan: bool = True
    enable_abha: bool = True
    enable_mrn: bool = True
    enable_icd10: bool = True
    custom_mrn_patterns: list[str] = Field(default_factory=list)


class NlpConfig(BaseModel):
    # en_core_web_sm ships as a declared dependency. en_core_web_lg is a drop-in
    # upgrade for tenants who install it and want better name recall.
    spacy_model: str = "en_core_web_sm"
    use_ner: bool = True
    medical_ner_context_boost: bool = False
    context_boost_multiplier: float = 1.15


class DetectionConfig(BaseModel):
    ocr: OcrConfig = Field(default_factory=OcrConfig)
    recognizers: RecognizerConfig = Field(default_factory=RecognizerConfig)
    nlp: NlpConfig = Field(default_factory=NlpConfig)
