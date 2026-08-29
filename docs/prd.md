# Auro Healthcare DLP - Product Requirements Document (PRD)

## 1. Product Overview

### Product Name

**Auro Healthcare DLP**

### Product Type

Healthcare-focused Data Loss Prevention (DLP) system for the browser. It began as a Gmail-only product and now covers two enforcement paths.

### Product Summary

Auro Healthcare DLP is a Chrome extension plus a backend that prevents accidental leakage of sensitive healthcare information from a hospital browser.

Path 1, Gmail. The extension intercepts a send, the backend scans the draft and its attachments, and the organization's policy decides the verdict.

Path 2, universal web input. The extension blocks patient data being pasted or typed into any editable field on any other website, including browser-based AI tools. That decision is made locally, with no network call, and the block is reported to the backend for audit.

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

The same staff now paste clinical text into browser-based AI tools to summarise a
discharge note or draft a letter. That text leaves the hospital the moment it is
submitted, and no email control sees it. A Gmail-only product covers a shrinking
share of the actual exfiltration surface.

---

# 3. Product Vision

To create a healthcare-native Gmail DLP platform that prevents accidental PHI/PII exfiltration while preserving clinical workflow efficiency.

---

# 4. Goals

## Primary Goals

* Prevent sensitive healthcare data leakage through Gmail
* Prevent sensitive healthcare data being pasted or typed into browser-based AI
  tools and other websites
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
* scanned volume split by channel, email against web
* the sites where data was blocked, ranked
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

## 6.11 Universal Web Input Protection

The extension shall prevent patient data being entered into text boxes on
websites other than Gmail, including browser-based AI tools such as ChatGPT and
Gemini, support forms and ticketing systems.

Capabilities:

* intercept paste, keystroke, drop, autofill, form submit and send-button click
* decide locally and synchronously, with no network call in the keystroke path
* never inspect password fields
* block on any standalone identifier; count email address, phone, person name and
  date of birth only in clinical context
* show an on-page notice naming the identifier types, never the value

---

## 6.12 Web Block Reporting

A block on a website shall be reported to the backend for audit, through the
extension's service worker. An allow reports nothing.

The report carries entity types, masked values, a risk score, a severity and the
site hostname. It does not carry the typed or pasted text, the page URL, the page
title or the field name. Repeats of the same finding on the same site are
collapsed to one report per 60 seconds.

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

## FR-11 Web Input Blocking

The extension shall block insertion of healthcare identifiers into editable
fields on any HTTP or HTTPS site other than Gmail, in all frames, deciding
locally.

## FR-12 Web Block Audit

The system shall record each web-input block as a scan event and an append-only
audit row, carrying the channel, the site hostname, the entity types, the risk
score and the severity.

## FR-13 Channel Reporting

The dashboard shall report scanned volume split by channel and rank the sites
where data was blocked.

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

* spaCy, for person-name recognition
* a declarative rule pack, exported to the extension as JSON

Presidio was evaluated and removed. Its pattern layer produced unusable matches
(its PAN recognizer matched the bare string `-7236-8829`), and it is not a
dependency of `detection/pyproject.toml`.

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
