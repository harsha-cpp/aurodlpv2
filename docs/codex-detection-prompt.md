# Codex — Detection Engine Build Brief

You are implementing the MedShield detection engine — a pure Python package at `detection/medshield_detection/`. Scaffold with models, config, and weights is in place; fill in the stubs.

## Authoritative spec

`docs/plans/detection-engine.md` is the source of truth. Cross-refs: `docs/prd.md` (product requirements), `docs/plans/backend.md` (backend imports this package via `from medshield_detection.api import detect_email`).

## Ground rules

- **Stack is locked**: Python 3.12, Presidio (analyzer + anonymizer), python-stdnum, spaCy `en_core_web_lg`, simple-icd-10-cm, PyMuPDF, python-docx, openpyxl, Pillow, python-magic, pytesseract, paddleocr. Do not add new deps without asking.
- **Strict**: `ruff check`, `pyright` (strict), `pytest -q` green before any PR. CI in `.github/workflows/ci.yml`.
- **Pure library** — no FastAPI, no async, no network calls. The backend wraps this in `asyncio.to_thread`.
- **No PHI in logs.** Use `mask_value()` helper (last 4 chars visible). Structlog only.
- **No unnecessary comments.** Explain regex, checksum math, confidence formulas only.

## Existing code you must preserve

- `models.py` — `Severity`, `Attachment`, `EmailPayload`, `Entity`, `ScanResult` (Pydantic v2). Do not change field names; backend depends on them.
- `config.py` — `DetectionConfig` with all tuning knobs (OCR thresholds, enabled recognizers, spaCy model name, context boost multiplier). Read these; never hard-code values.
- `scoring/weights.py` — `SENSITIVITY_WEIGHTS`, `CHECKSUM_VALIDATED_BOOST`, `SEVERITY_BUCKETS`, `bucket()`. Already implemented. Use as-is.

## Work order (phased)

### Phase 1 — Text-only detection path

1. **`recognizers/abha.py`** — Presidio `PatternRecognizer`. Pattern: `\b[1-9]\d-\d{4}-\d{4}-\d{4}\b` (high conf 0.85) + raw 14-digit `\b[1-9]\d{13}\b` (medium conf 0.5). Context words: `["ABHA", "health ID", "Ayushman", "NHA"]`. No checksum exists for ABHA.
2. **`recognizers/mrn.py`** — `PatternRecognizer`. Default pattern `[A-Z]{2,4}-\d{4}-\d{4,6}` (conf 0.7). Context: `["MRN", "UHID", "patient ID", "registration"]`. Must accept tenant-override patterns from `DetectionConfig.mrn_patterns`.
3. **`recognizers/icd10.py`** — Regex candidates `[A-TV-Z]\d{2}(?:\.\d{1,4})?`, then validate each via `simple_icd_10_cm.is_valid_item(code)`. Score valid=0.9, regex-only=0.4. Context: `["diagnosis", "ICD", "condition"]`.
4. **`nlp/__init__.py`** — Build Presidio `AnalyzerEngine` with: built-in `IN_AADHAAR` + `IN_PAN` recognizers (already in Presidio), plus your 3 custom ones above. Load spaCy model from `config.spacy_model`. If `config.medical_ner_context_boost` is True, add context multiplier (plan §9).
5. **`api.py`** (`detect_email`) — Orchestrate: concatenate subject+body → run analyzer → build `Entity` list with `masked_value` (use `mask_value`) → run `scoring` → return `ScanResult`. No attachment handling yet.

### Phase 2 — File extractors

6. **`extractors/pdf.py`** — PyMuPDF (`fitz`). Extract text per page. If page has images and text confidence is low (< 50 chars on a page with images), flag for OCR. Return `list[str]` (one string per page).
7. **`extractors/docx.py`** — python-docx. Extract paragraphs + table cells. Return single concatenated string.
8. **`extractors/xlsx.py`** — openpyxl read-only mode. Concatenate all cell values across sheets. Return string.
9. **`extractors/image.py`** — Pillow open + validate. Return PIL Image for OCR pipeline. Reject if dimensions > 10000x10000.
10. **`extractors/__init__.py`** — Dispatcher: map MIME type → extractor. Use python-magic on bytes, not filename. Support: `application/pdf`, `application/vnd.openxmlformats-officedocument.*`, `image/*`.

### Phase 3 — OCR router

11. **`ocr/tesseract_backend.py`** — pytesseract on PIL Image. Return `(text, confidence)`. Timeout per page = `config.ocr_page_timeout_s` (default 4s). Use `image_to_data` for per-word confidence, average it.
12. **`ocr/paddle_backend.py`** — PaddleOCR. Same interface `(text, confidence)`. Only imported if `paddleocr` is installed (optional dep group `[ocr]`).
13. **`ocr/__init__.py`** — Router algorithm: try Tesseract first. If confidence < `config.ocr_fallback_threshold` (0.55) OR script detected as Indic, retry with PaddleOCR. Total doc timeout = `config.ocr_doc_timeout_s` (60s). Return combined text.

### Phase 4 — Scoring integration

14. **`scoring/__init__.py`** — `score(entities: list[Entity], config: DetectionConfig) -> tuple[float, Severity]`. Formula: `doc_score = log1p(sum(entity_contributions))` where each `entity_contribution = SENSITIVITY_WEIGHTS[type] * confidence * (CHECKSUM_VALIDATED_BOOST if checksum_valid else 1.0)`. Apply context multiplier if medical NER co-occurs. Return `(doc_score, bucket(doc_score))`.

### Phase 5 — Wire attachments into api.py

15. Update `detect_email` to process `EmailPayload.attachments`: extract text → OCR if needed → detect entities in extracted text → merge into result. Respect `config.ocr_doc_timeout_s` total budget across all attachments.

## Key invariants

- `Entity.masked_value` NEVER contains raw PHI. Only last 4 chars visible.
- Confidence scores are 0.0–1.0 float.
- `ScanResult.severity` must match `bucket(score)` exactly.
- Extractors must handle corrupt files gracefully — catch exceptions, log warning, return empty string, continue.
- OCR backends are optional deps — import inside function body with try/except ImportError.

## Testing expectations

- Unit tests in `tests/unit/` for each recognizer (known positives + negatives + edge cases).
- Golden corpus test: create `tests/fixtures/golden_emails.json` with 10+ sample payloads and expected entity types/counts.
- `tests/unit/test_scoring.py` already has bucket tests — extend with full score() tests.
- Benchmark: `detect_email` on a 500-word body with 3 entities must complete in <500ms on CI (no OCR).

## Definition of done per phase

- [ ] `ruff check` + `pyright` (strict) + `pytest -q` green
- [ ] No `type: ignore`, no `Any` leakage
- [ ] No raw PHI in log output
- [ ] Each recognizer has ≥5 unit tests (true pos + true neg + boundary)
- [ ] Docstring only on module-level and complex algorithms

Ask before: adding dependencies, changing model field names, altering scoring formula, or modifying config defaults.
