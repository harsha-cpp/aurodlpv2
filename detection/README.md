# aurodlpv2-detection

Pure-Python PHI/PII detection engine used by the Auro DLP v2 backend.

Authoritative build spec: [`docs/plans/detection-engine.md`](../docs/plans/detection-engine.md).

## What it does

- Extracts text from PDF / DOCX / XLSX / images.
- Runs Presidio + custom recognizers for Aadhaar, PAN, ABHA, MRN, ICD-10.
- Hybrid OCR router: Tesseract first, PaddleOCR fallback for low-conf / Indic / handwritten pages.
- Returns scored `ScanResult` with masked entity values - never the raw PHI.

## Layout

```
aurodlpv2_detection/
├── api.py            # public entry: detect_email(EmailPayload) -> ScanResult
├── models.py         # EmailPayload, Attachment, Entity, ScanResult
├── recognizers/      # Aadhaar (built-in), PAN, ABHA (custom), MRN, ICD-10
├── extractors/       # pdf, docx, xlsx, image
├── ocr/              # router + tesseract + paddle backends
├── nlp/              # spaCy + Presidio analyzer factory
├── scoring/          # SENSITIVITY_WEIGHTS + severity buckets
└── config.py         # DetectionConfig (per-tenant tuning)
```

## Install

Heavy OCR deps are optional:

```bash
uv pip install -e .                   # core
uv pip install -e ".[ocr]"            # + tesseract/paddle
uv pip install -e ".[medical-ner]"    # + transformers context booster
uv pip install -e ".[dev]"            # + test toolchain
```

System packages (host or Docker):

- `tesseract-ocr` + `tesseract-ocr-hin` + `tesseract-ocr-mar` ...
- `libmagic1`, `poppler-utils`

## Status

Scaffold only. Implement per phases in [`docs/plans/detection-engine.md`](../docs/plans/detection-engine.md) §13.
