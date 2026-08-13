# Auro Production Inputs

Complete the checklists in this directory before production deployment. Do not place passwords,
API keys, database URLs with credentials, raw patient data, or private certificates in these
files. Supply secrets through the deployment platform's secret manager and share only secret
names or confirmation here.

Files:

- `production-infrastructure.md`: public origins, providers, regions, and operations.
- `security-and-policy.md`: tenant policy, retention, roles, and response decisions.
- `chrome-web-store.md`: extension publication and managed deployment inputs.
- `ocr-and-validation.md`: OCR scope and de-identified accuracy evaluation.
- `status.md`: one-page completion tracker.

You can fill these files manually. A checked box means the decision and non-secret value are
final; it does not mean a secret has been committed.

No Neon MCP or hosted credential is needed for local development or review. Provide access only
after the staging provider, region, project, and least-privilege scope are approved.
