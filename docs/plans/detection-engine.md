# Auro Healthcare DLP Detection Engine - Build Plan

> Scope: Python detection pipeline that ingests email content + attachments and emits a structured `ScanResult` (entities, confidences, severity, decision-input score). This plan covers identifier detection, OCR, NER, scoring, and packaging. Auth, queuing, audit logs, dashboard APIs live in `backend.md`.

---

## 1. Design Goals (from PRD)

| PRD requirement | Detection-engine implication |
|---|---|
| Detect Aadhaar, PAN, ABHA, MRN/UHID, ICD-10, patient info, healthcare reports | Layered detection: regex+checksum -> NER -> dictionary -> clinical-NER context |
| Scan subject, body, recipients, attachments (PDF, DOCX, XLSX, images, scans) | Unified `Document` abstraction; per-MIME extractor; OCR fallback |
| Latency budget: <2s for normal emails, <10s for 10MB PDFs | Sync fast path (regex/NER) + async deep path (OCR + heavy parsing) |
| FP rate <10%, accuracy >95% | Verhoeff/structural validators, context windows, confidence tuning |
| Recipient-class-aware risk | Engine exposes raw entity scores; backend's policy layer combines with recipient class |
| Future: multilingual OCR, handwriting, LLM PHI | Pluggable recognizer registry + swappable OCR backend |

---

## 2. Architectural Overview

```
                          ┌────────────────────────────────────────────┐
   email payload  ───►    │            Detection Engine                │   ───► ScanResult
   (subject, body,        │                                            │        {entities, score,
    recipients,           │  ┌──────────┐   ┌──────────┐   ┌────────┐  │         severity, evidence}
    attachments[])        │  │ Extract  │──►│  Detect  │──►│ Score  │  │
                          │  └──────────┘   └──────────┘   └────────┘  │
                          └────────────────────────────────────────────┘
```

### 2.1 Module layout (Python package `aurodlpv2_detection`)
```
aurodlpv2_detection/
├── __init__.py
├── api.py                    # Public entrypoint: scan_email(EmailPayload) -> ScanResult
├── models.py                 # Pydantic: EmailPayload, Attachment, Entity, ScanResult
├── extractors/
│   ├── base.py               # Extractor protocol
│   ├── text.py               # plain/HTML
│   ├── pdf.py                # PyMuPDF
│   ├── docx.py               # python-docx
│   ├── xlsx.py               # openpyxl
│   └── image.py              # routes to OCR
├── ocr/
│   ├── base.py               # OCREngine protocol
│   ├── tesseract.py          # primary (CPU)
│   ├── paddle.py             # fallback (GPU / handwriting / Indic)
│   └── router.py             # hybrid dispatcher with confidence + language heuristics
├── recognizers/
│   ├── registry.py           # builds Presidio AnalyzerEngine
│   ├── india_abha.py
│   ├── india_mrn.py
│   ├── icd10.py
│   └── medical_context.py    # boosts confidence when clinical NER fires
├── nlp/
│   ├── spacy_engine.py       # en_core_web_lg (default) / trf (optional)
│   └── medical_ner.py        # Presidio MedicalNERRecognizer (transformers extra)
├── scoring/
│   ├── weights.py            # entity weights, multipliers
│   └── scorer.py             # entity score + severity bucketing
├── config.py                 # thresholds, weights, feature flags
└── tests/
```

---

## 3. Data Contracts

```python
# aurodlpv2_detection/models.py
class Attachment(BaseModel):
    filename: str
    content_type: str
    size_bytes: int
    storage_uri: str           # backend-supplied path (S3 / local temp)
    sha256: str

class EmailPayload(BaseModel):
    message_id: str
    subject: str
    body_text: str
    body_html: str | None
    sender: str
    recipients: list[str]
    attachments: list[Attachment]

class Entity(BaseModel):
    type: str                  # 'IN_AADHAAR', 'IN_PAN', 'ABHA', 'MRN', 'ICD10', 'PERSON', ...
    value_masked: str          # never store raw PHI; mask middle chars
    confidence: float          # 0.0 - 1.0
    source: str                # 'subject' | 'body' | f'attachment:{filename}#page-2'
    has_checksum: bool
    span: tuple[int, int]

class ScanResult(BaseModel):
    message_id: str
    entities: list[Entity]
    entity_score: float
    severity: Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    duration_ms: int
    extraction_warnings: list[str]
    requires_deep_scan: bool   # true if engine punted OCR/large PDF to async
```

Mask example: `Aadhaar 1234 5678 9012` -> `XXXX XXXX 9012` for storage; raw value lives in memory only during the request and is never logged.

---

## 4. Identifier Detection

### 4.1 Use Presidio built-ins (do not reinvent)

Presidio already ships production-grade recognizers we get for free:

| Entity | Recognizer | Validator |
|---|---|---|
| `IN_AADHAAR` | [`InAadhaarRecognizer`](https://github.com/microsoft/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/india/in_aadhaar_recognizer.py) | Verhoeff + first-digit ≥2 + palindrome reject |
| `IN_PAN` | [`InPanRecognizer`](https://github.com/microsoft/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/india/in_pan_recognizer.py) | Structural regex only (CBDT checksum is undocumented) |
| `PERSON`, `EMAIL_ADDRESS`, `PHONE_NUMBER`, `URL`, `IP_ADDRESS`, `LOCATION` | Presidio built-ins via spaCy `en_core_web_lg` | NER + regex |

We register these via `AnalyzerEngine` and tune their confidence thresholds in `config.py`.

### 4.2 Custom recognizers we must write

#### ABHA (Ayushman Bharat Health Account)
- Format: 14 digits, displayed as `XX-XXXX-XXXX-XXXX`. First digit 1-9.
- No public checksum algorithm exists ([ABDM official docs](https://docs.coronasafe.network/abdm-documentation/implementers-guide/abha-mobile-phr-application)). Validation is structural + context-based.

```python
class AbhaRecognizer(PatternRecognizer):
    PATTERNS = [
        Pattern("ABHA (High)",   r"\b[1-9]\d{1}-\d{4}-\d{4}-\d{4}\b", 0.6),
        Pattern("ABHA (Medium)", r"\b[1-9]\d{13}\b",                  0.35),
    ]
    CONTEXT = ["abha", "ayushman", "abdm", "health id", "phr"]
```

#### MRN / UHID (Medical Record Number)
Hospital-prefixed; PRD example `HSP-2026-0012`. Highly variable across hospitals -> we use a config-driven pattern list seeded with common templates plus a per-tenant override loaded from DB.

```python
class MrnRecognizer(PatternRecognizer):
    PATTERNS = [
        Pattern("MRN HSP-YYYY-NNNN", r"\b[A-Z]{2,5}-20\d{2}-\d{3,6}\b", 0.5),
        Pattern("MRN UHID 8-12 digit", r"\b(?:UHID|MRN|HID)[:\s-]*\d{6,12}\b", 0.7),
    ]
    CONTEXT = ["mrn", "uhid", "patient id", "medical record", "hospital id"]
```

Per-tenant patterns are loaded by the backend at startup and injected as additional `Pattern` entries. This keeps the engine stateless about who the customer is.

#### ICD-10 (dictionary-validated, not NER)
- Regex `\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b` is too permissive; many false positives (e.g. `A12`, `J20.0` look real but may not be).
- Use [`simple_icd_10_cm`](https://github.com/StefanoTrv/simple_icd_10_CM) (MIT, April 2026 data) to validate the code exists.

```python
import simple_icd_10_cm as icd

class Icd10Recognizer(PatternRecognizer):
    PATTERNS = [Pattern("ICD10 candidate", r"\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b", 0.4)]
    CONTEXT = ["icd", "diagnosis", "dx", "icd-10", "icd10"]

    def validate_result(self, text: str) -> bool:
        return icd.is_valid_item(text)
```

Validated codes get confidence boost to ~0.9.

### 4.3 Verhoeff source of truth

Either:
- (A) Use [`python-stdnum`](https://github.com/arthurdejong/python-stdnum) (LGPL-2.1) - also handles other ID standards we may need later. Recommended.
- (B) Embed Presidio's in-line Verhoeff tables (zero extra dep).

Decision: **use python-stdnum** - gives us the canonical `stdnum.in_.aadhaar` and also gives us PAN structural validation and PAN masking helpers, plus future-proof for other identifier types.

---

## 5. NLP / NER Stack

### 5.1 General NER - for PERSON, ORG, GPE, DATE
- **Default**: `en_core_web_lg` (~750MB, ships F1 ~0.86, CPU-only friendly)
- **Optional opt-in for higher accuracy**: `en_core_web_trf` (transformer, ~430MB + torch, slower) - gated by config flag, used when tenant requests "high accuracy mode"

### 5.2 Clinical NER - for context boost only

We don't use medical NER as a primary PHI detector (Med7 / scispaCy detect drugs, diseases, procedures - not patient identifiers). Instead we use them as a **context booster**:

If `MedicalNERRecognizer` (using [`blaze999/Medical-NER`](https://huggingface.co/blaze999/Medical-NER) via Presidio's transformers extra) fires `MEDICAL_DISEASE_DISORDER` or `MEDICAL_MEDICATION` in the same document as a PERSON/MRN/ABHA, we boost the entity confidence - because the combination is far more likely to be real PHI than either signal alone.

Implementation:
```python
def boost_with_medical_context(entities: list[Entity], doc_text: str) -> list[Entity]:
    has_clinical_terms = medical_ner.has_match(doc_text)
    if not has_clinical_terms:
        return entities
    for e in entities:
        if e.type in {'PERSON', 'MRN', 'ABHA', 'IN_AADHAAR'}:
            e.confidence = min(1.0, e.confidence * 1.15)
    return entities
```

Med7 (`en_core_med7_lg`) is **not** added to the default stack - F1 0.957 on medication NER is great but it doesn't help us detect patient identifiers in emails. We add it later as a tenant-opt-in if we ever need DRUG/DOSAGE specifically.

---

## 6. File Extraction

| MIME | Extractor | Library | Notes |
|---|---|---|---|
| `application/pdf` | `pdf.py` | [`PyMuPDF`](https://pymupdf.readthedocs.io/) | Text PDFs in <100ms; if `page.get_text()` returns empty/low char count -> route page to OCR |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `docx.py` | `python-docx` | Walk paragraphs + tables + headers/footers |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `xlsx.py` | `openpyxl` (read-only mode) | Iterate cell values, skip formulas |
| `image/png`, `image/jpeg`, `image/tiff` | `image.py` -> OCR | - | Always OCR |
| `application/msword`, `application/vnd.ms-excel` | Convert via `libreoffice --headless` (Celery task) | - | Async deep path only |

All extractors return a `Document` dataclass with `pages: list[PageText]` where each page tracks (text, ocr_confidence, language_hint).

---

## 7. OCR Strategy - Hybrid Router

Research finding (2026 benchmarks):
- Tesseract 5: 95-99% on clean print, 1.5-3.5s/page CPU, **<10%** on cursive handwriting, CER **18.2%** on Gujarati script.
- PaddleOCR: 85% on handwritten prescriptions, **CER 4.5%** on Gujarati, ~0.8-1.2s/page on GPU but heavier dependencies.
- EasyOCR: best for handwriting (~88%) but largest binary footprint.

### 7.1 Router algorithm
```python
def extract_text(page_image) -> PageText:
    out = tesseract.run(page_image)
    if out.confidence >= 0.75 and detect_script(out.text) in {'Latin'}:
        return out

    if out.confidence < 0.55 or detect_script(out.text) in INDIC_SCRIPTS:
        return paddle.run(page_image)   # GPU if available, else CPU PaddleOCR

    return out
```

### 7.2 Latency budget enforcement
- Per-page OCR timeout: 4s (kill subprocess, mark page `ocr_failed`)
- Per-document OCR cap: 60s in deep-scan mode
- If sync request and document needs OCR -> engine returns `requires_deep_scan=True` with whatever entities were detected from text-only extraction; backend queues a Celery follow-up

### 7.3 Packaging
- Tesseract: system binary + `pytesseract`. Dockerfile installs `tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin` etc.
- PaddleOCR: optional extra (`pip install aurodlpv2-detection[paddle]`). The router degrades gracefully if PaddleOCR is not importable - logs a warning and skips fallback. This keeps the lean Tesseract-only image small for tenants who don't need Indic/handwriting.

---

## 8. Risk Scoring

The detection engine produces a **raw entity score** (0-100). The backend's policy engine combines this with recipient class, attachment count, and approved-domain status to produce the final severity and action.

### 8.1 Entity weights (`scoring/weights.py`)

```python
SENSITIVITY_WEIGHTS = {
    'IN_AADHAAR':              10.0,
    'ABHA':                     9.0,
    'IN_PAN':                   8.0,
    'MRN':                      7.0,
    'PERSON':                   5.0,
    'PHONE_NUMBER':             4.0,
    'EMAIL_ADDRESS':            3.0,
    'ICD10':                    2.0,
    'MEDICAL_DISEASE_DISORDER': 1.5,
    'MEDICAL_MEDICATION':       1.0,
}
```

### 8.2 Per-entity contribution

```python
def entity_contribution(e: Entity) -> float:
    base       = SENSITIVITY_WEIGHTS.get(e.type, 1.0)
    conf_mult  = 0.5 + e.confidence              # 0.65 -> 1.15; 0.90 -> 1.40
    chk_mult   = 1.3 if e.has_checksum else 1.0
    return base * conf_mult * chk_mult
```

### 8.3 Aggregation with diminishing returns

10 occurrences of one Aadhaar should not score 10× a single one. Apply log dampening per type:

```python
def aggregate(entities: list[Entity]) -> float:
    by_type: dict[str, list[Entity]] = group_by(entities, key=lambda e: e.type)
    score = 0.0
    for _type, items in by_type.items():
        contribs = sorted([entity_contribution(e) for e in items], reverse=True)
        # full weight for first, 0.5 for second, 0.33 for third, ...
        score += sum(c / (i + 1) for i, c in enumerate(contribs))
    return min(100.0, score)
```

### 8.4 Severity bucketing (engine-side hint, backend can override)

| Entity score | Severity |
|---|---|
| 0 | `NONE` |
| 1-9 | `LOW` |
| 10-29 | `MEDIUM` |
| 30-59 | `HIGH` |
| ≥60 | `CRITICAL` |

Reasoning: a single validated Aadhaar (10 × 1.4 × 1.3 = 18.2) lands in `MEDIUM` on its own; combined with a PERSON + MRN it crosses into `HIGH`, which feels right.

---

## 9. Performance Targets and Plan

| Path | Target | How |
|---|---|---|
| Text-only email, no attachments | <500ms p95 | Presidio + spaCy in-process; pre-loaded models |
| Email with 1 small PDF (<1MB, text-extractable) | <2s p95 | Inline PyMuPDF, no OCR |
| Email with 10MB scanned PDF | <10s p95 | Celery deep-scan, partial result returned sync |
| Cold start | <30s | Pre-load spaCy + Presidio at process start (`@app.on_event("startup")` in backend) |

Concrete optimizations:
- Compile all `re` patterns at recognizer construction.
- Use Aho-Corasick (via `pyahocorasick`) for the per-tenant MRN keyword list once it exceeds ~50 patterns.
- Reuse a single `AnalyzerEngine` per process (thread-safe for our usage).
- `en_core_web_lg` loaded once, shared via `nlp.pipe()` for batch where possible.

---

## 10. Configuration & Tenancy

`config.py` exposes:

```python
class DetectionConfig(BaseSettings):
    enabled_entities: set[str] = {...}           # tenant can disable e.g. PAN
    entity_thresholds: dict[str, float] = {...}  # min confidence per entity
    custom_mrn_patterns: list[str] = []          # injected at registry build time
    ocr_languages: list[str] = ['eng']           # 'hin', 'tam', etc.
    paddle_enabled: bool = False
    spacy_model: str = 'en_core_web_lg'          # or 'en_core_web_trf'
    medical_context_boost: bool = True
```

Backend loads tenant config from PostgreSQL and constructs a `DetectionEngine(config)` per tenant (cached). Engine itself is stateless across requests.

---

## 11. Build Phases

### Phase 0 - Scaffolding (Day 1)
- `aurodlpv2_detection` package, `pyproject.toml`, ruff + mypy + pytest baseline.
- Pydantic models, public `scan_email` stub.
- Pin: `presidio-analyzer`, `spacy`, `pydantic`, `pymupdf`, `python-docx`, `openpyxl`, `python-stdnum`, `simple_icd_10_cm`.

### Phase 1 - Text path (Days 2-3)
- AnalyzerEngine wired with Presidio built-ins + spaCy `en_core_web_lg`.
- Subject + body scanning.
- Custom recognizers: ABHA, MRN, ICD-10.
- Scoring + severity bucketing.
- Golden-set tests with 50+ hand-crafted emails covering Aadhaar variants, PAN, ABHA, MRN, ICD-10, false-positive bait (random 12-digit numbers, non-existent ICD codes).

### Phase 2 - Attachment text extraction (Days 4-5)
- PDF (PyMuPDF), DOCX, XLSX extractors.
- Sync inline scan if total text <50KB and PDF has extractable text.
- Otherwise mark `requires_deep_scan=True`.

### Phase 3 - OCR (Days 6-8)
- Tesseract extractor with confidence threshold gating.
- PaddleOCR optional extra + router.
- Page-level timeouts and partial-result handling.
- Indic-language test corpus (Hindi, Tamil, Telugu printed text + handwritten prescriptions).

### Phase 4 - Medical context (Day 9)
- Wire Presidio `MedicalNERRecognizer`.
- Implement confidence boost for co-occurrence with PHI identifiers.
- Tenant flag to disable (adds latency + ~500MB model).

### Phase 5 - Tuning (Days 10-12)
- Collect FP/FN samples from internal pilot.
- Adjust confidence thresholds per tenant.
- Add allowlists (e.g. test data, internal mock patient IDs).
- Bench against PRD targets; profile with `py-spy`.

### Phase 6 - Hardening
- Memory caps per scan (kill child OCR procs if >2GB RSS).
- Fuzz extractors (malformed PDF, password-protected DOCX) - expect graceful `extraction_warnings`, never a crash.
- Snapshot tests with `syrupy` for stable golden outputs.

---

## 12. Test Strategy

- **Unit**: each recognizer (positive + negative cases). Verhoeff validator with known valid/invalid Aadhaar samples.
- **Golden corpus**: `tests/corpus/*.json` - email + expected entities. Tracked in git.
- **Property-based** (`hypothesis`): generate random strings, ensure they don't match high-confidence patterns.
- **Benchmark**: `pytest-benchmark` per recognizer; CI gate at ±20% drift.
- **OCR**: scanned-document fixtures with hand-labeled ground truth, CER reported per OCR engine.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Presidio's `IN_AADHAAR` raw 12-digit pattern is "Very Weak" (0.01) - generates noise | Rely on Verhoeff + context boost; suppress entities under tenant `entity_thresholds` |
| OCR misreads `MRN-HSP-2024-0012` as `MRN-HSP-2O24-OO12` | Add post-OCR digit/letter confusables fix-up (O↔0, l↔1) before pattern matching |
| `simple_icd_10_cm` updates change valid codes between versions | Pin version; expose `icd_version` in config; re-test golden corpus on bump |
| Med7 / blaze999 models inject 500MB+ memory per worker | Lazy-load only when `medical_context_boost=True`; share singleton across requests |
| Per-tenant MRN patterns are user-provided -> injection of catastrophic regex | Compile patterns with `re2` (linear time) or pre-validate complexity bound; reject runtime patterns >200 chars |

---

## 14. Open Questions for SRS

1. Do we need Hindi/regional-language PHI detection in v1, or English only?
2. Are MRN patterns hospital-specific or standardised within Aurodlp's customer base? (Drives whether per-tenant config is essential or optional.)
3. Are we ever allowed to log unmasked PHI for debugging, even transiently? (Affects how aggressive we mask in `Entity.value_masked`.)
4. Is the OCR GPU budget available in production deployment, or CPU-only?

---

## 15. References

1. Presidio IN_AADHAAR - https://github.com/microsoft/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/india/in_aadhaar_recognizer.py
2. Presidio IN_PAN - https://github.com/microsoft/presidio/blob/main/presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/india/in_pan_recognizer.py
3. python-stdnum (Verhoeff, Aadhaar, PAN) - https://github.com/arthurdejong/python-stdnum
4. simple_icd_10_cm - https://github.com/StefanoTrv/simple_icd_10_CM
5. ABDM ABHA spec - https://docs.coronasafe.network/abdm-documentation/implementers-guide/abha-mobile-phr-application
6. Tesseract vs PaddleOCR 2026 benchmark - https://tildalice.io/ocr-tesseract-easyocr-paddleocr-benchmark/
7. PaddleOCR Gujarati study - https://ijrpr.com/uploads/V6ISSUE10/IJRPR53627.pdf
8. Presidio MedicalNERRecognizer - https://github.com/microsoft/presidio/blob/main/docs/supported_entities.md
9. Med7 - https://github.com/kormilitzin/med7
10. phi-redactor (architecture reference) - https://github.com/DilawarShafiq/phi-redactor
11. Phileas (Java, 30+ entity types, policy-driven) - https://github.com/philterd/phileas
12. Indpy (Indian ID generators for tests) - https://github.com/harshgupta2125/Indpy
