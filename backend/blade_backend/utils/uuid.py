from __future__ import annotations

import secrets
import time
from uuid import UUID


def uuid7() -> UUID:
    unix_ts_ms = (time.time_ns() // 1_000_000) & ((1 << 48) - 1)
    rand_a = secrets.randbits(12)
    rand_b = secrets.randbits(62)
    value = (unix_ts_ms << 80) | (0x7 << 76) | (rand_a << 64) | (0b10 << 62) | rand_b
    return UUID(int=value)
