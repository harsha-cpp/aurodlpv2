# Auro Healthcare DLP — Product Requirements Document (PRD)

## 1. Product Overview

### Product Name

**Auro Healthcare DLP**

### Product Type

Healthcare-focused Data Loss Prevention (DLP) system for Gmail on Google Workspace.

### Product Summary

Auro Healthcare DLP is a Chrome Extension + Backend DLP platform that prevents accidental leakage of sensitive healthcare information through Gmail in hospital environments.

The system scans:

* email subject
* email body
* recipients
* attachments

before an email is sent.

It detects:

* Aadhaar
* PAN
* ABHA IDs
* MRN/UHID
* ICD-10 codes
* patient-sensitive information
* healthcare reports

and applies configurable hospital policies to:

* allow
* warn
* block
* quarantine
* escalate emails.

---

# 2. Problem Statement

Hospitals heavily rely on Gmail and Google Workspace for daily operations.

Doctors and staff frequently send:

* prescriptions
* discharge summaries
* lab reports
* insurance documents
* patient records

through email.

Existing enterprise DLP systems:

* are generic
* lack Indian healthcare identifier support
* do not understand medical workflows
* create workflow friction

This leads to:

* accidental PHI leakage
* privacy violations
* regulatory risks
* reputational damage

Hospitals cannot block Gmail entirely because it is operationally critical.

---

# 3. Product Vision

To create a healthcare-native Gmail DLP platform that prevents accidental PHI/PII exfiltration while preserving clinical workflow efficiency.

---

# 4. Goals

## Primary Goals

* Prevent sensitive healthcare data leakage through Gmail
* Detect Indian healthcare identifiers
* Support attachment scanning
* Minimize workflow disruption for doctors

## Secondary Goals

* Provide audit visibility
* Enable hospital policy enforcement
* Reduce accidental misdelivery
* Improve compliance posture

---

# 5. Target Users

## Primary Users

* Doctors
* Nurses
* Billing staff
* Lab personnel
* Insurance teams
* Hospital administrators

## Secondary Users

* Security teams
* Compliance officers
* IT administrators

---

# 6. Core Features

## 6.1 Gmail Compose Monitoring

The extension shall monitor Gmail compose windows in real time.

Capabilities:

* detect compose events
* monitor send actions
* scan subject/body
* monitor recipient domains

---

## 6.2 Sensitive Data Detection

### Supported Identifiers

| Identifier | Example           |
| ---------- | ----------------- |
| Aadhaar    | 1234 5678 9012    |
| PAN        | ABCDE1234F        |
| ABHA       | 12-3456-7890-1234 |
| MRN/UHID   | HSP-2026-0012     |
| ICD-10     | E11.9             |

---

## 6.3 Recipient Classification

The system shall classify recipients as:

| Type                  | Example                                                   |
| --------------------- | --------------------------------------------------------- |
| Internal Workspace    | [doctor@hospital.in](mailto:doctor@hospital.in)           |
| Approved Partner      | [lab@partnerlab.in](mailto:lab@partnerlab.in)             |
| External Organization | [doctor@otherhospital.in](mailto:doctor@otherhospital.in) |
| Public Email          | [patient@gmail.com](mailto:patient@gmail.com)             |
| Unknown Domain        | [abc@randomdomain.com](mailto:abc@randomdomain.com)       |

---

## 6.4 Attachment Scanning

Supported files:

* PDF
* DOCX
* XLSX
* Images
* Scanned documents

Capabilities:

* text extraction
* OCR
* PHI detection
* risk scoring

---

## 6.5 OCR Engine

The system shall perform OCR on:

* scanned PDFs
* image attachments
* prescriptions
* handwritten reports (future scope)

---

## 6.6 Risk Scoring Engine

The system shall calculate risk scores based on:

* detected entities
* recipient type
* attachment type
* quantity of sensitive identifiers
* context

---

## 6.7 Policy Engine

The policy engine shall:

* allow emails
* warn users
* block sending
* request justification
* quarantine emails
* escalate to admin

---

## 6.8 User Warning Modal

The extension shall display warning dialogs before sending risky emails.

Example:

* medium-risk warning
* high-risk block notice
* admin escalation prompt

---

## 6.9 Admin Dashboard

Dashboard capabilities:

* blocked email logs
* risk reports
* top violations
* user activity
* domain management
* policy configuration

---

## 6.10 Audit Logging

All DLP events shall be logged.

Logs include:

* sender
* recipients
* detected entities
* action taken
* timestamp
* attachment metadata

---

# 7. Functional Requirements

## FR-1 Gmail Integration

The extension shall integrate with Gmail compose windows.

## FR-2 Email Content Scanning

The system shall scan:

* subject
* body
* recipients

before email transmission.

## FR-3 Attachment Parsing

The backend shall parse:

* PDFs
* DOCX
* XLSX
* images

## FR-4 OCR Support

The system shall perform OCR on scanned files.

## FR-5 Identifier Detection

The system shall detect:

* Aadhaar
* PAN
* ABHA
* MRN
* ICD

## FR-6 Risk Classification

The system shall classify emails into:

* low
* medium
* high
* critical

## FR-7 Policy Enforcement

The system shall enforce configurable DLP policies.

## FR-8 Audit Logging

The system shall store immutable audit logs.

## FR-9 Dashboard Access

Admins shall view reports and logs.

## FR-10 Approved Domain Support

Admins shall configure:

* internal domains
* approved partners
* blocked domains

---

# 8. Non-Functional Requirements

## Performance

* Scan latency < 2 seconds for normal emails
* Attachment processing < 10 seconds for 10MB PDF

## Scalability

* Support concurrent hospital users

## Security

* TLS encryption
* secure authentication
* encrypted temporary file handling

## Reliability

* 99% detection availability

## Usability

* minimal doctor workflow disruption

---

# 9. Technology Stack

## Frontend

* React
* Tailwind CSS
* TypeScript
* Chrome Extension Manifest V3

## Backend

* Python FastAPI
* Celery
* Redis

## Database

* PostgreSQL

## OCR

* Tesseract OCR
* PaddleOCR

## File Processing

* PyMuPDF
* python-docx
* openpyxl

## NLP

* spaCy
* Presidio

---

# 10. User Flow

## Safe Email

User sends email normally.

## Medium Risk

User receives warning and confirmation prompt.

## High Risk

Email is blocked or escalated.

---

# 11. Future Scope

* LLM-based PHI understanding
* multilingual OCR
* handwriting recognition
* Google Drive scanning
* secure link replacement
* email encryption
* SIEM integration
* HIPAA/DPDP reporting

---

# 12. Success Metrics

| Metric                | Target |
| --------------------- | ------ |
| PHI leakage reduction | >90%   |
| False positive rate   | <10%   |
| Scan latency          | <2 sec |
| User adoption         | >80%   |
| Detection accuracy    | >95%   |

---

# 13. Risks

| Risk                    | Mitigation         |
| ----------------------- | ------------------ |
| False positives         | adaptive policies  |
| OCR inaccuracies        | confidence scoring |
| User bypass attempts    | admin enforcement  |
| Large attachment delays | async processing   |

---

# 14. Conclusion

Auro Healthcare DLP aims to provide a healthcare-native security layer for Google Workspace that prevents accidental leakage of patient-sensitive information while preserving operational efficiency in hospitals.
