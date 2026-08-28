# aurodlpv2-detection

Pure-Python PHI/PII detection engine for the Auro Healthcare DLP platform.

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
├── evaluation/       # labelled-corpus accuracy harness + baseline ratchet
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

## Measuring accuracy

Detection quality is measured against a labelled corpus, not asserted. Run it:

```bash
make accuracy                 # from the repo root
uv run python -m aurodlpv2_detection.evaluation --failures
```

The report gives per-entity precision / recall / F1, a document-level score, the
false-alarm rate on documents containing no PHI, and a duplicate-inflation
figure (detections per distinct value).

### The corpus

`tests/corpus/*.json` — each file is an array of labelled samples:

```json
{
  "id": "clinical-discharge-002",
  "category": "discharge_summary",
  "subject": "Discharge - bed 412",
  "body": ["Summary attached for Ramesh Kumar Iyer, MRN: 445123."],
  "expect_phi": true,
  "entities": [
    { "type": "PERSON", "value": "Ramesh Kumar Iyer" },
    { "type": "MRN", "value": "445123" }
  ],
  "ignore_types": [],
  "notes": "MRN in colon form"
}
```

- `body` is a string or an array of lines, joined with newlines.
- `entities` lists every span that must be detected. Values are located in the
  text by the loader, so a labelled value that is not present raises at load
  time — the corpus cannot silently rot.
- `expect_phi` is the document-level label. It may be true with no listed
  entities, for clinical narrative carrying no crisp identifier.
- `ignore_types` marks types as don't-care for that sample: neither credited
  nor penalised. Use it for a staff name in a duty roster, or a PAN detected
  inside a GSTIN.
- Types must come from `evaluation/taxonomy.py`, which is the target
  vocabulary — including types the engine cannot detect yet, so the gaps show
  up as recall misses rather than disappearing.

Files are grouped by intent: `clinical`, `administrative`, `identifiers`
(format variations), `negative` (ordinary hospital business mail that must stay
clean), and `adversarial` (deliberate false-positive traps).

### The baseline ratchet

`tests/accuracy_baseline.json` records every metric as a floor. CI fails if any
of them drops. After a deliberate improvement:

```bash
make accuracy-update          # re-record, then commit the new baseline
```

Never re-record to make a red build green — that is the one thing the ratchet
exists to prevent.

## Status

Phased build plan: [`docs/plans/detection-engine.md`](../docs/plans/detection-engine.md) §13.
