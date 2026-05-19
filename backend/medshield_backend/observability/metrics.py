"""Prometheus metrics registry.

Golden signals (``docs/plans/backend.md`` §13):
    scan_latency_seconds, scan_decisions_total, ocr_pages_total,
    quarantine_queue_depth, audit_chain_verify_failures_total.
"""

from __future__ import annotations

from prometheus_client import Counter, Gauge, Histogram

scan_latency_seconds = Histogram(
    "scan_latency_seconds",
    "End-to-end scan latency",
    labelnames=("path",),  # email | attachment | deep
    buckets=(0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0),
)

scan_decisions_total = Counter(
    "scan_decisions_total",
    "Scan verdicts by action",
    labelnames=("action", "severity"),
)

ocr_pages_total = Counter(
    "ocr_pages_total",
    "OCR pages processed",
    labelnames=("engine",),  # tesseract | paddle
)

quarantine_queue_depth = Gauge(
    "quarantine_queue_depth",
    "Pending quarantine reviews",
)

audit_chain_verify_failures_total = Counter(
    "audit_chain_verify_failures_total",
    "Audit hash-chain verification failures",
)
