# Detection Engine Revamp Plan and Implemented Architecture

## Contract

`aurodlpv2_detection.detect_email()` accepts subject, body, and local attachment references and
returns masked entities, bounded risk score, severity, OCR count, extraction errors, duration,
and completion time. It does not make recipient or organization policy decisions.

## Detection layers

| Entity | Primary validation | False-positive control |
| --- | --- | --- |
| Aadhaar | Presidio/Verhoeff checksum | Invalid checksum rejected |
| PAN | Indian PAN structure | Common fake/test values rejected |
| ABHA | Formatted or 14-digit structure | Unformatted values require healthcare context |
| MRN/UHID | Configurable hospital patterns | Generic digits require nearby patient context |
| ICD-10 | Candidate pattern including U codes | Dictionary membership and clinical context |
| Patient name | Context-bound pattern | Requires patient/clinical label |
| Patient DOB | Date pattern | Requires DOB/patient context |
| Patient email | Email pattern | Requires patient context |
| Patient phone | Indian phone structure | Requires patient context |

Ambiguous global Presidio entities are not automatically enabled as patient data. Context-bound
recognizers return the value span, not the label text surrounding it.

## Extraction and OCR

- PDF: PyMuPDF text extraction and rendered pages for OCR when needed.
- DOCX: paragraphs, tables, headers, and footers through `python-docx`.
- XLSX: read-only cell extraction with formulas treated as content metadata, not executed.
- Images: OCR routing when an OCR backend is installed.

Extraction errors are part of the result and cause the backend to fail closed. OCR has page and
document deadlines. Incomplete, empty, below-confidence, or timed-out OCR is an error rather than
a clean scan.

The default package keeps OCR engines optional to control image size. Production must install and
verify the selected Tesseract or Paddle profile before enabling image workflows.

## Scoring

Each entity contributes a sensitivity weight adjusted by confidence. Repeated findings use
logarithmic dampening so one repeated identifier cannot grow linearly without bound. The raw
signal is normalized with:

`risk = 100 × (1 - exp(-raw / 3))`

The value is finite and clamped to 0–100. Severity is:

| Score | Severity |
| --- | --- |
| 0 | none |
| >0 and <25 | low |
| 25–<50 | medium |
| 50–<75 | high |
| 75–100 | critical |

Recipient class can elevate the final action in the backend but cannot reduce the detector's
evidence.

## Privacy

Raw matches exist only while the call is in memory. Entity output contains a masked value,
confidence, source, attachment ID when relevant, and text span. Structured logs must not receive
payload text or raw values.

## Verification strategy

The golden corpus contains positives and intentional near misses:

- valid and invalid Aadhaar;
- formatted and unformatted ABHA with and without medical context;
- labeled and unlabeled MRN-like version numbers;
- valid U07.1 and invalid ICD candidates;
- patient name, DOB, email, and Indian phone in explicit patient context;
- random 14-digit numbers and ordinary contact data outside patient context.

Recognizer, extractor, scoring, timeout, and public-API tests are blocking with Ruff and strict
Pyright. New production false positives or false negatives must become minimized corpus cases
before a detector change is accepted.

## Calibration work after pilot data

No synthetic corpus can prove clinical production accuracy. A pilot requires de-identified,
representative documents labeled by the owner or clinical partner. Measure precision and recall
per entity and document type, select thresholds from the error cost, and version every corpus and
configuration change. Raw patient documents must not enter the repository.
