"""seed_jury — circles for the adjudication layer."""
from ..circles import Circle

ADJUDICATION_CIRCLE = Circle(name="adjudication", label="Adjudication", seed="seed_jury")
CONFLICTS_CIRCLE    = Circle(name="conflicts",    label="Conflicts",    seed="seed_jury")
STANDARDS_CIRCLE    = Circle(name="standards",    label="Standards",    seed="seed_jury")

CIRCLES = [ADJUDICATION_CIRCLE, CONFLICTS_CIRCLE, STANDARDS_CIRCLE]
