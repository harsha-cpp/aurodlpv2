from __future__ import annotations

import inspect
from collections.abc import Sequence
from functools import lru_cache
from importlib import import_module
from typing import Any, Protocol, cast

import structlog
from PIL import Image

from aurodlpv2_detection.config import DetectionConfig

logger = structlog.get_logger(__name__)

_PADDLE_LANGUAGES: dict[str, str] = {
    "hin": "hi",
    "mar": "mr",
    "nep": "ne",
    "san": "sa",
    "tam": "ta",
    "tel": "te",
    "kan": "kn",
    "ben": "bn",
    "guj": "gu",
    "pan": "pa",
    "ori": "or",
    "mal": "ml",
    "urd": "ur",
    "eng": "en",
}


class _PaddleEngine(Protocol):
    def ocr(self, img: object, **kwargs: object) -> object: ...


def paddle_language(config: DetectionConfig) -> str:
    for language in config.ocr.languages:
        mapped = _PADDLE_LANGUAGES.get(language.lower())
        if mapped and mapped != "en":
            return mapped
    return "en"


@lru_cache(maxsize=4)
def _engine(language: str) -> _PaddleEngine | None:
    try:
        factory: Any = import_module("paddleocr").PaddleOCR
    except ImportError:
        logger.warning("paddleocr is not installed")
        return None

    kwargs: dict[str, object] = {"lang": language}
    try:
        accepted = set(inspect.signature(factory).parameters)
        if "use_angle_cls" in accepted:
            kwargs["use_angle_cls"] = True
        elif "use_textline_orientation" in accepted:
            kwargs["use_textline_orientation"] = True
        if "show_log" in accepted:
            kwargs["show_log"] = False
    except (TypeError, ValueError):
        pass

    try:
        return cast(_PaddleEngine, factory(**kwargs))
    except Exception:
        logger.warning("paddle OCR engine construction failed", language=language)
        return None


def run(image: Image.Image, config: DetectionConfig) -> tuple[str, float]:
    engine = _engine(paddle_language(config))
    if engine is None:
        return "", 0.0

    try:
        numpy_module = cast(Any, import_module("numpy"))
    except ImportError:
        logger.warning("numpy is not installed")
        return "", 0.0

    array = numpy_module.array(image.convert("RGB"))
    for kwargs in ({"cls": True}, {}):
        try:
            return _parse_results(engine.ocr(array, **kwargs))
        except TypeError:
            continue
        except Exception:
            logger.warning("paddle OCR failed")
            return "", 0.0
    return "", 0.0


def _parse_results(raw_results: object) -> tuple[str, float]:
    texts: list[str] = []
    confidences: list[float] = []
    if not isinstance(raw_results, list):
        return "", 0.0
    for page_result in cast(list[object], raw_results):
        if isinstance(page_result, dict):
            _collect_from_dict(cast(dict[str, object], page_result), texts, confidences)
            continue
        if not isinstance(page_result, list):
            continue
        for line in cast(list[object], page_result):
            parsed = _parse_line(line)
            if parsed is not None:
                texts.append(parsed[0])
                confidences.append(parsed[1])
    mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return " ".join(texts), round(mean_confidence, 3)


def _collect_from_dict(
    payload: dict[str, object],
    texts: list[str],
    confidences: list[float],
) -> None:
    raw_texts = payload.get("rec_texts")
    raw_scores = payload.get("rec_scores")
    if isinstance(raw_texts, list):
        texts.extend(str(item) for item in cast(list[object], raw_texts))
    if isinstance(raw_scores, list):
        for item in cast(list[object], raw_scores):
            if isinstance(item, int | float):
                confidences.append(float(item))


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
