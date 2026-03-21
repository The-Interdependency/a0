"""seed_memory — circles for the continuity substrate."""
from ..circles import Circle

CONTINUITY_CIRCLE = Circle(name="continuity", label="Continuity", seed="seed_memory")
RECALL_CIRCLE     = Circle(name="recall",     label="Recall",     seed="seed_memory")

CIRCLES = [CONTINUITY_CIRCLE, RECALL_CIRCLE]
