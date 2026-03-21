"""seed_guardian — circles for the Guardian microkernel shell."""
from ..circles import Circle

SENTINELS_CIRCLE = Circle(name="sentinels", label="Sentinels", seed="seed_guardian")
RECOVERY_CIRCLE  = Circle(name="recovery",  label="Recovery",  seed="seed_guardian")
APPROVAL_CIRCLE  = Circle(name="approval",  label="Approval",  seed="seed_guardian")
AUDIT_CIRCLE     = Circle(name="audit",     label="Audit",     seed="seed_guardian")
EMIT_CIRCLE      = Circle(name="emit",      label="Emit",      seed="seed_guardian")

CIRCLES = [SENTINELS_CIRCLE, RECOVERY_CIRCLE, APPROVAL_CIRCLE, AUDIT_CIRCLE, EMIT_CIRCLE]
