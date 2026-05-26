# 13:14 0:0 0:6
"""Guardian — the microkernel operating shell.

Guardian is constitutive to the architecture, not a wrapper.

Owns:
- CLI
- UI / OS integration
- outward human-readable emission
- outward status, warnings, errors
- runtime logs in the Guardian domain
- audit boundary for outbound and event-backed operation
- recovery shell
- quarantine shell
- enforcement shell
"""
from .emitter import emit
from .audit import audit_event
from .sentinels import SentinelSuite
from .approval_gate import require_approval, ExternalEffectBlockedError
from .ui import Circle, Seed, SeedLayout, default_layout
from .user_db import UserDB, UserRecord, AffiliationLevel, UserDBError, UserNotFoundError, UsernameTakenError, BadPassphraseError

__all__ = [
    "emit", "audit_event", "SentinelSuite",
    "require_approval", "ExternalEffectBlockedError",
    "Circle", "Seed", "SeedLayout", "default_layout",
    # user registry (secondary — not yet wired into routing/jury)
    "UserDB", "UserRecord", "AffiliationLevel",
    "UserDBError", "UserNotFoundError", "UsernameTakenError", "BadPassphraseError",
]
# 13:14 0:0 0:6
