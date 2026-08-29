# Demo email bodies

Copy-paste into a Gmail compose. Each block names the entity types it exercises
and the verdict to expect. All identifiers are synthetic but structurally valid -
the Aadhaar numbers pass the Verhoeff checksum, the PAN passes holder-type
validation, the GSTIN passes its mod-36 check digit.

---

## A. Government identifiers

```
Aadhaar 7534 7930 7460 and PAN HKPPS5875Q on file.
Passport K4471982 for the visa medical.
Driving licence KA0520110044821 used as ID proof.
Voter ID ABC1234567 accepted as an alternative.
```
IN_AADHAAR - IN_PAN - IN_PASSPORT - IN_DRIVING_LICENSE - IN_VOTER_ID

## B. Health identifiers

```
Patient: Meera Sundaram
UHID 0019488
IP No: 2026/04512
ABHA 14-7236-8829-2226
Health locker address meera.sundaram@abdm
Accession: LAB-2026-0091185
Diagnosis: unspecified asthma (J45.909)
Post COVID-19 condition U09.9
Reported by Dr K Subramanian, Reg No. 45123
```
MRN - PATIENT_VISIT_ID - ABHA_NUMBER - ABHA_ADDRESS - LAB_ACCESSION - ICD10 - MEDICAL_LICENSE - PERSON

## C. Financial identifiers

```
Refund to account 50100234567891, IFSC NBEF0A9M3FI.
UPI ID meera.sundaram@okhdfcbank if they prefer.
Policy number: P/181234/12/2026/004567
Employer GSTIN 29ILVPC5151I1ZI for the corporate bill.
```
BANK_ACCOUNT - IN_IFSC - IN_UPI - INSURANCE_POLICY - IN_GSTIN

## D. Personal details

```
Patient Ramesh Kumar Iyer, DOB 14/08/1971.
Mobile 9845123456, email ramesh.iyer88@gmail.com.
```
PERSON - DATE_OF_BIRTH - IN_PHONE - EMAIL_ADDRESS

## E. Clinical narrative - a known limitation, show it deliberately

```
Overnight the patient in bed 7 became oliguric, creatinine climbed to 3.1 and
potassium to 6.2 with peaked T waves. Dialysis line inserted at 0400.
Family counselled about the poor prognosis.
```
**Scores 0.0 and is allowed.** This is clinical information about a real patient
and the engine does not catch it, because detection is span-based: there is no
identifier to anchor on. Show this one rather than hiding it - it is the honest
edge of what the product does today, and the case that would need a classifier
rather than a rule pack.

---

## Negative controls - these must NOT trigger

```
Clinical meeting moved to room A12 on the second floor.
Ward B12 needs vitamin B12 stock delivered.
Monitor model E11 quotation from the vendor is attached.
Known issue K21 in the tracker is deferred to v2.15.
Order HSP-2026-0012 for stationery has been delivered.
Vendor invoice 12345678901234 is ready for payment.
Capital budget 9845000000 rupees against a revised estimate.
Test data 2345 6789 0123 fails checksum validation.
```
Every token here *looks* like an identifier and none of them are. If any of this
flags, that is the bug to report.
