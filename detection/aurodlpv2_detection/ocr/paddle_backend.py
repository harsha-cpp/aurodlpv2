"""PaddleOCR backend. Lazy-imported (heavy)."""

from __future__ import annotations

from collections.abc import Sequence
from importlib import import_module
from typing import Protocol, cast

import structlog
from PIL import Image

from aurodlpv2_detection.config import DetectionConfig

logger = structlog.get_logger(__name__)


class _PaddleEngine(Protocol):
    def ocr(self, img: object, *, cls: bool) -> object: ...


class _NumpyModule(Protocol):
    def array(self, image: Image.Image) -> object: ...


class _PaddleFactory(Protocol):
    def __call__(self, *, use_angle_cls: bool, lang: str, show_log: bool) -> _PaddleEngine: ...


def run(image: Image.Image, config: DetectionConfig) -> tuple[str, float]:
    try:
        paddle_factory = cast(
            _PaddleFactory,
            import_module("paddleocr").PaddleOCR,
        )
        numpy_module = cast(_NumpyModule, import_module("numpy"))
    except ImportError:
        logger.warning("paddleocr is not installed")
        return "", 0.0

    try:
        engine = paddle_factory(
            use_angle_cls=True,
            lang=_paddle_language(config),
            show_log=False,
        )
        raw_results = engine.ocr(numpy_module.array(image), cls=True)
    except Exception:
        logger.warning("paddle OCR failed")
        return "", 0.0

    return _parse_results(raw_results)


def _paddle_language(config: DetectionConfig) -> str:
    languages = {language.lower() for language in config.ocr.languages}
    if languages & {"hin", "hi"}:
        return "hi"
    if languages & {"tam", "ta"}:
        return "ta"
    return "en"


def _parse_results(raw_results: object) -> tuple[str, float]:
    texts: list[str] = []
    confidences: list[float] = []
    if not isinstance(raw_results, list):
        return "", 0.0
    for page_result in cast(list[object], raw_results):
        if not isinstance(page_result, list):
            continue
        for line in cast(list[object], page_result):
            parsed = _parse_line(line)
            if parsed is None:
                continue
            text, confidence = parsed
            texts.append(text)
            confidences.append(confidence)
    mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return " ".join(texts), round(mean_confidence, 3)


def _parse_line(line: object) -> tuple[str, float] | None:
    if not isinstance(line, list | tuple):
        return None
    line_items = cast(Sequence[object], line)
    if len(line_items) < 2:
        return None
    payload = line_items[1]
    if not isinstance(payload, list | tuple):
        return None
    payload_items = cast(Sequence[object], payload)
    if len(payload_items) < 2:
        return None
    text, confidence = payload_items[0], payload_items[1]
    if not isinstance(text, str):
        return None
    if not isinstance(confidence, int | float | str):
        return None
    try:
        return text, float(confidence)
    except (TypeError, ValueError):
        return None
