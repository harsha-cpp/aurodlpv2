"""Policy persistence + cache.

TODO(backend.md §7): CRUD over ``policies`` table + Redis cache keyed by
``(workspace_id, version)`` invalidated on write.
"""

from __future__ import annotations
