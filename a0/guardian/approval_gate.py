# 55:35
"""Guardian external-effect approval gate.

The following require explicit approval beyond ordinary functional capability:
- publish
- post
- send
- push
- create external artifact
- spend funds
- enable paid services
- modify secrets
- modify permissions
- modify trust boundaries
- initiate outreach to humans
- execute monetization actions

Undoable internal work may proceed without separate external approval only when:
- no external write occurs
- rollback remains available
- provenance remains complete
- safety policy remains unchanged

Law 8: Capability does not equal authority.
Law 12: External execution requires approval beyond rendering capability.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from ..invariants import InvalidStateError


class ExternalEffectType(Enum):
    PUBLISH = "publish"
    POST = "post"
    SEND = "send"
    PUSH = "push"
    CREATE_EXTERNAL_ARTIFACT = "create_external_artifact"
    SPEND_FUNDS = "spend_funds"
    ENABLE_PAID_SERVICES = "enable_paid_services"
    MODIFY_SECRETS = "modify_secrets"
    MODIFY_PERMISSIONS = "modify_permissions"
    MODIFY_TRUST_BOUNDARIES = "modify_trust_boundaries"
    INITIATE_OUTREACH = "initiate_outreach"
    EXECUTE_MONETIZATION = "execute_monetization"


EXTERNAL_EFFECT_TYPES = {e.value for e in ExternalEffectType}


@dataclass
class ApprovalToken:
    effect_type: str
    approved_by: str
    scope: str
    token: str


class ExternalEffectBlockedError(InvalidStateError):
    """Raised when an external effect is attempted without approval.

    Law 12: External execution requires approval beyond rendering capability.
    Law 8: Capability does not equal authority.
    """


def require_approval(
    effect_type: str,
    approval_token: Optional[ApprovalToken] = None,
    payload: Any = None,
) -> None:
    """Enforce the external-effect approval gate.

    If effect_type is a known external effect and no approval_token is
    provided, raises ExternalEffectBlockedError (fail closed).

    Rendering capability alone does not constitute authorization.
    """
    if effect_type not in EXTERNAL_EFFECT_TYPES:
        return

    if approval_token is None:
        raise ExternalEffectBlockedError(
            f"External effect '{effect_type}' requires explicit approval. "
            f"Rendering capability does not equal authority (Law 8, Law 12)."
        )

    if approval_token.effect_type != effect_type:
        raise ExternalEffectBlockedError(
            f"Approval token is for '{approval_token.effect_type}', "
            f"not '{effect_type}' — gate blocked."
        )


def is_undoable_internal(
    no_external_write: bool,
    rollback_available: bool,
    provenance_complete: bool,
    safety_policy_unchanged: bool,
) -> bool:
    """Check whether work qualifies as undoable internal (no gate required).

    All four conditions must hold for internal work to proceed without
    external-effect approval.
    """
    return (
        no_external_write
        and rollback_available
        and provenance_complete
        and safety_policy_unchanged
    )
# 55:35
