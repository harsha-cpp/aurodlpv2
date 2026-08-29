from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from aurodlpv2_detection.evaluation.runner import (
    compare,
    evaluate_corpus,
    load_baseline,
    render,
    render_failures,
    to_baseline,
)

DEFAULT_CORPUS = Path(__file__).resolve().parents[2] / "tests" / "corpus"
DEFAULT_BASELINE = Path(__file__).resolve().parents[2] / "tests" / "accuracy_baseline.json"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="aurodlpv2_detection.evaluation")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit non-zero if any metric fell below the recorded baseline",
    )
    parser.add_argument(
        "--update-baseline",
        action="store_true",
        help="overwrite the baseline with the current run",
    )
    parser.add_argument(
        "--failures",
        action="store_true",
        help="also list the documents the engine got wrong",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    report = evaluate_corpus(Path(args.corpus))

    print(render(report))
    if args.failures:
        print()
        print(render_failures(report))

    baseline_path = Path(args.baseline)

    if args.update_baseline:
        baseline_path.write_text(
            json.dumps(to_baseline(report), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"\nbaseline written to {baseline_path}")
        return 0

    if args.check:
        if not baseline_path.exists():
            print(f"\nno baseline at {baseline_path}; run --update-baseline first")
            return 1
        regressions = compare(report, load_baseline(baseline_path))
        if regressions:
            print(f"\n{len(regressions)} metric(s) regressed:")
            for regression in regressions:
                print(f"  {regression}")
            return 1
        print("\nno regressions against baseline")

    return 0


if __name__ == "__main__":
    sys.exit(main())
