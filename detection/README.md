# blade-detection

Pure-Python PHI/PII detection engine for the Auro Healthcare DLP platform.

This is a library, not a service. The backend imports it in-process through a
path dependency; nothing deploys it on its own.

Authoritative build spec: [`docs/plans/detection-engine.md`](../docs/plans/detection-engine.md).

## What it does

- Extracts text from PDF, DOCX, XLSX and legacy XLS, CSV, PPTX, RTF, EML, ZIP
  and images, classified by content signature rather than by file extension.
- Runs a declarative rule pack of 21 entity types, with checksum validators where
  one exists, context gating, and overlap resolution.
- Runs spaCy for person names.
- Hybrid OCR router: Tesseract first, PaddleOCR fallback for low-confidence,
  Indic and handwritten pages.
- Returns a scored `ScanResult` with masked entity values, never the raw PHI.

Presidio was removed. Its pattern layer produced unusable matches, and it is not
a dependency. The rule pack in `rules/` replaced it, and
`python -m blade_detection.rules` exports the same pack to the extension as
JSON so the browser and the server cannot drift apart.

## Layout

```
blade_detection/
  api.py            public entry: detect_email(EmailPayload) -> ScanResult
  models.py         EmailPayload, Attachment, Entity, ScanResult
  rules/            the declarative rule pack, its schema, and the JSON exporter
  recognition/      pattern matching, validators, spaCy NER, overlap resolution
  extractors/       text, pdf, docx, xlsx, tabular, pptx, image
  ocr/              preprocessing, tesseract and paddle backends
  masking.py        masked entity values
  scoring/          entity weights and severity buckets
  evaluation/       labelled-corpus accuracy harness and baseline ratchet
  config.py         DetectionConfig, per-tenant tuning
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
uv run python -m blade_detection.evaluation --failures
```

The report gives per-entity precision / recall / F1, a document-level score, the
false-alarm rate on documents containing no PHI, and a duplicate-inflation
figure (detections per distinct value).

### The corpus

`tests/corpus/*.json` - each file is an array of labelled samples:

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
  time - the corpus cannot silently rot.
- `expect_phi` is the document-level label. It may be true with no listed
  entities, for clinical narrative carrying no crisp identifier.
- `ignore_types` marks types as don't-care for that sample: neither credited
  nor penalised. Use it for a staff name in a duty roster, or a PAN detected
  inside a GSTIN.
- Types must come from `evaluation/taxonomy.py`, which is the target
  vocabulary - including types the engine cannot detect yet, so the gaps show
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

Never re-record to make a red build green - that is the one thing the ratchet
exists to prevent.

## Status

Current baseline, recorded 2026-08-28 against 119 documents and 175 labelled
entity spans: entity F1 0.9826, document F1 0.9936, false-alarm rate 0.0 on the
40 clean samples.

Phased build plan:
[`docs/plans/detection-engine.md`](../docs/plans/detection-engine.md), section
13. Production hardening:
[`docs/plans/hardening.md`](../docs/plans/hardening.md).
