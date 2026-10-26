# 5:7 0:0 4:3
# Combiner — do not add methods here. Add them to the appropriate mixin:
#   transcripts.py  — uploads, sources, reports, messages, explanations, credits
#   memory.py       — seeds, projection, tensor snapshots, EDCM metrics
#   system.py       — heartbeat, toggles, deals, activity, credentials, secrets, scopes

from .transcripts import TranscriptMixin
from .memory import MemoryMixin
from .system import SystemMixin, check_scope_grant_tier  # noqa: F401 — re-exported for callers


class DatabaseStorage(TranscriptMixin, MemoryMixin, SystemMixin):
    """Unified storage object. Inherits all methods from the three domain mixins.

    MRO: DatabaseStorage → TranscriptMixin → MemoryMixin → SystemMixin → _CoreStorage
    """


storage = DatabaseStorage()
# 5:7 0:0 4:3
