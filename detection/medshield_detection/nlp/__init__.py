"""Presidio AnalyzerEngine factory.

Loads spaCy model, registers built-in IN_AADHAAR + IN_PAN, then appends
our custom ABHA / MRN / ICD-10 recognizers. Cached singleton.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from functools import lru_cache
from typing import Protocol, cast

import spacy
import structlog
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.context_aware_enhancers import LemmaContextAwareEnhancer
from presidio_analyzer.nlp_engine import NlpArtifacts, NlpEngine
from presidio_analyzer.predefined_recognizers import InAadhaarRecognizer, InPanRecognizer
from spacy.language import Language

from medshield_detection.config import DetectionConfig
from medshield_detection.recognizers import AbhaRecognizer, Icd10Recognizer, MrnRecognizer

logger = structlog.get_logger(__name__)


class _SpacyLoader(Protocol):
    def __call__(self, name: str) -> Language: ...


class _TokenizerOnlyNlpEngine(NlpEngine):
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._nlp: Language | None = None

    def load(self) -> None:
        if self._nlp is not None:
            return
        loader = cast(_SpacyLoader, spacy.load)
        try:
            self._nlp = loader(self._model_name)
        except OSError:
            logger.warning("spaCy model unavailable; using blank tokenizer", model=self._model_name)
            self._nlp = spacy.blank("en")

    def is_loaded(self) -> bool:
        return self._nlp is not None

    def process_text(self, text: str, language: str) -> NlpArtifacts:
        del language
        self.load()
        nlp = self._nlp
        if nlp is None:
            raise RuntimeError("NLP engine failed to load")
        doc = nlp(text)
        entities = list(doc.ents)
        return NlpArtifacts(
            entities=entities,
            tokens=doc,
            tokens_indices=[token.idx for token in doc],
            lemmas=[token.lemma_ if token.lemma_ else token.text.lower() for token in doc],
            nlp_engine=self,
            language="en",
            scores=[0.85] * len(entities),
        )

    def process_batch(
        self,
        texts: Iterable[str],
        language: str,
        batch_size: int = 1,
        n_process: int = 1,
        **kwargs: object,
    ) -> Iterator[tuple[str, NlpArtifacts]]:
        del batch_size, n_process, kwargs
        for text in texts:
            yield text, self.process_text(text, language)

    def is_stopword(self, word: str, language: str) -> bool:
        del language
        self.load()
        nlp = self._nlp
        return bool(nlp and nlp.vocab[word].is_stop)

    def is_punct(self, word: str, language: str) -> bool:
        del language
        self.load()
        nlp = self._nlp
        return bool(nlp and nlp.vocab[word].is_punct)

    def get_supported_entities(self) -> list[str]:
        return ["PERSON", "DATE_TIME", "LOCATION", "ORGANIZATION"]

    def get_supported_languages(self) -> list[str]:
        return ["en"]


@lru_cache(maxsize=16)
def _cached_analyzer(
    spacy_model: str,
    enable_aadhaar: bool,
    enable_pan: bool,
    enable_abha: bool,
    enable_mrn: bool,
    enable_icd10: bool,
    custom_mrn_patterns: tuple[str, ...],
    context_boost_multiplier: float,
) -> AnalyzerEngine:
    registry = RecognizerRegistry(supported_languages=["en"])
    if enable_aadhaar:
        registry.add_recognizer(InAadhaarRecognizer())
    if enable_pan:
        registry.add_recognizer(InPanRecognizer())
    if enable_abha:
        registry.add_recognizer(AbhaRecognizer())
    if enable_mrn:
        registry.add_recognizer(MrnRecognizer(custom_mrn_patterns))
    if enable_icd10:
        registry.add_recognizer(Icd10Recognizer())

    nlp_engine = _TokenizerOnlyNlpEngine(spacy_model)
    enhancer = LemmaContextAwareEnhancer(
        context_similarity_factor=max(0.0, context_boost_multiplier - 1.0),
        min_score_with_context_similarity=0.35,
    )
    return AnalyzerEngine(
        registry=registry,
        nlp_engine=nlp_engine,
        supported_languages=["en"],
        context_aware_enhancer=enhancer,
    )


def build_analyzer(config: DetectionConfig) -> AnalyzerEngine:
    return _cached_analyzer(
        config.nlp.spacy_model,
        config.recognizers.enable_aadhaar,
        config.recognizers.enable_pan,
        config.recognizers.enable_abha,
        config.recognizers.enable_mrn,
        config.recognizers.enable_icd10,
        tuple(config.recognizers.custom_mrn_patterns),
        config.nlp.context_boost_multiplier,
    )
