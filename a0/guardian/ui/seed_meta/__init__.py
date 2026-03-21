"""seed_meta — circles for the executive layer (Meta-13)."""
from ..circles import Circle

EXECUTIVE_CIRCLE  = Circle(name="executive",  label="Executive",  seed="seed_meta")
FAST_PATH_CIRCLE  = Circle(name="fast_path",  label="Fast Path",  seed="seed_meta")
SLOW_PATH_CIRCLE  = Circle(name="slow_path",  label="Slow Path",  seed="seed_meta")

CIRCLES = [EXECUTIVE_CIRCLE, FAST_PATH_CIRCLE, SLOW_PATH_CIRCLE]
