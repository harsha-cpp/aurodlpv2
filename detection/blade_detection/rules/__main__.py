from __future__ import annotations

import argparse
import sys
from pathlib import Path

from blade_detection.rules.export import export_json


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="blade_detection.rules")
    parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="write the pack here instead of stdout",
    )
    args = parser.parse_args(argv)
    payload = export_json()
    if args.out is None:
        sys.stdout.write(payload)
    else:
        args.out.write_text(payload, encoding="utf-8")
        sys.stderr.write(f"rule pack written to {args.out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
