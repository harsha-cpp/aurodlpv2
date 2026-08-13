import re
from pathlib import Path

import pytest


@pytest.mark.unit
def test_ci_enforces_release_security_contract() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    workflow = (repository_root / ".github" / "workflows" / "ci.yml").read_text()
    dockerfile = (repository_root / "backend" / "Dockerfile").read_text()
    gitleaks_config = (repository_root / ".gitleaks.toml").read_text()

    assert "permissions:\n  contents: read" in workflow
    assert "backend-integration:" in workflow
    assert 'AURODLPV2_INTEGRATION: "1"' in workflow
    assert "alembic upgrade head" in workflow
    assert "minio/minio@sha256:" in workflow
    assert "pnpm audit --prod --audit-level high" in workflow
    assert "pip-audit --local" in workflow
    assert "security:" in workflow
    assert "gitleaks:v8.18.4@sha256:" in workflow
    assert "--config=/repo/.gitleaks.toml" in workflow
    assert "actionlint_1.7.12_linux_amd64.tar.gz" in workflow
    assert "8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8" in workflow
    assert "semgrep:1.172.0@sha256:" in workflow
    assert (
        "trivy:0.73.0@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c"
        in workflow
    )
    assert "--ignore-unfixed" in workflow
    assert "cyclonedx" in workflow
    assert "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" in workflow
    assert "needs: [backend, detection, security]" in workflow
    assert "timeout-minutes:" in workflow
    assert "continue-on-error" not in workflow
    assert not re.search(r"uses:\s+[^\s]+@v\d", workflow)
    unpinned_from = r"^FROM\s+\S+(?<!@sha256:[0-9a-f]{64})(?:\s+AS\s+\w+)?$"
    assert not re.search(unpinned_from, dockerfile, re.MULTILINE)
    assert "COPY --from=ghcr.io/astral-sh/uv:0.9.27@sha256:" in dockerfile
    assert "AS builder" in dockerfile
    assert "AS runtime" in dockerfile
    assert "RUN --mount=type=cache,target=/root/.cache/uv" in dockerfile
    assert "COPY --from=builder --chown=aurodlp:aurodlp" in dockerfile
    assert 'CMD ["uvicorn"' in dockerfile
    assert "useDefault = true" in gitleaks_config
    assert "^evt-123456789$" in gitleaks_config
    assert "^aurodlpv2-secret$" in gitleaks_config
