# Auro Privacy and Chrome Permission Disclosure

## Data handled

The universal web-input guard inspects supported text-entry candidates inside the browser. It does
not send those candidates to Auro, store them, or include raw values in its notice.

When an enrolled user attempts a Gmail send, the extension sends draft subject, body, recipients,
sender metadata, and supported attachments to the configured Auro API. The service uses them only
to calculate a DLP decision. It persists masked entity categories, hashes, decision metadata,
recipient context, and audit records. It does not persist the raw message body.

Large or image attachments may be stored temporarily in a private S3-compatible bucket. Objects
are deleted by the worker before a terminal scan result is published. A short lifecycle rule is
an independent cleanup mechanism.

## Credentials

The extension stores an organization routing code and a revocable installation token in Chrome
extension storage. Websites cannot read extension storage. The raw installation token is shown
only when an administrator creates it; the backend stores only its digest.

The dashboard stores its access token in memory. Its rotating refresh token is an httpOnly cookie
and is not readable by dashboard JavaScript.

## Chrome permissions

`storage` stores extension enrollment and cached organization policy. `alarms` refreshes policy
periodically while respecting Manifest V3 service-worker suspension.

All-site HTTP(S) content-script and host access is required because the requested LLM DLP feature
must protect text entry across browser-based AI tools and other websites, including embedded
frames. The extension uses that access to observe supported editable controls and prevent patient
data insertion. It does not sell browsing data, build browsing histories, inject advertising, or
send ordinary web-input content to Auro.

The separate Gmail content script uses page access to intercept drafts before native send and to
collect the draft only after the user initiates sending.

## Retention

- Web-input candidate: page memory only; no Auro retention.
- Gmail subject/body: request memory only; no raw database retention.
- Inline attachment temporary file: deleted after the extraction attempt.
- Queued attachment object: deleted after processing; lifecycle expiry defaults to one day.
- Masked scan/audit metadata: retained according to the organization's production policy.
- Revoked/expired credential metadata: retained according to security audit policy.

## Owner values required before publication

The owner must provide a legal entity name, privacy contact, privacy-policy public URL, support
URL, jurisdiction-specific retention period, deletion-request process, and final hosting vendors.
This engineering disclosure is not a substitute for legal review.
