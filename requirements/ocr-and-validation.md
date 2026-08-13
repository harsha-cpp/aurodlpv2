# OCR and Accuracy Validation Inputs

## OCR launch scope

- [ ] Image attachments enabled at launch:
- [ ] Scanned PDF OCR enabled at launch:
- [ ] Required printed languages:
- [ ] Handwriting explicitly in or out of scope:
- [ ] Tesseract, PaddleOCR, or another reviewed runtime selected:
- [ ] CPU/GPU runtime selected:
- [ ] Per-page and per-document time budgets accepted:

Without a deployed OCR runtime, unreadable image/scanned content must remain blocked rather than
reported clean.

## De-identified evaluation data

- [ ] De-identified sample count per document type:
- [ ] Labeled Aadhaar cases:
- [ ] Labeled PAN cases:
- [ ] Labeled ABHA cases:
- [ ] Labeled MRN/UHID cases:
- [ ] Labeled ICD-10 cases:
- [ ] Labeled patient demographic cases:
- [ ] Hard negative and near-miss cases:
- [ ] Clinical reviewer:
- [ ] Required precision/recall by entity:

Do not add real patient documents to Git. Provide de-identified fixtures through an approved,
access-controlled evaluation channel.
