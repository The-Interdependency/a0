# 33:19
from dataclasses import dataclass, field


@dataclass
class EditableField:
    """Describes one mutable backend field exposed to WSEM."""
    key: str
    label: str
    description: str
    # text | select | textarea | toggle
    control_type: str
    module: str
    get_endpoint: str
    patch_endpoint: str
    query_key: str
    options: list[str] = field(default_factory=list)


class _EditableRegistry:
    """Central registry of all mutable backend fields.

    Each route module registers its editable fields at import time:

        from ..services.editable_registry import editable_registry, EditableField
        editable_registry.register(EditableField(
            key="my_field",
            label="My Field",
            description="What it controls.",
            control_type="text",
            module="my_module",
            get_endpoint="/api/v1/my/endpoint",
            patch_endpoint="/api/v1/my/endpoint",
            query_key="/api/v1/my/endpoint",
        ))

    WSEM fetches all registered fields via GET /api/v1/editable-schema/index.
    """

    def __init__(self) -> None:
        self._fields: list[EditableField] = []

    def register(self, f: EditableField) -> None:
        """Add a field declaration. Called at module import time."""
        self._fields.append(f)

    def get_all(self) -> list[dict]:
        """Return all registered fields serialised for the index endpoint."""
        return [
            {
                "key": f.key,
                "label": f.label,
                "description": f.description,
                "control_type": f.control_type,
                "module": f.module,
                "get_endpoint": f.get_endpoint,
                "patch_endpoint": f.patch_endpoint,
                "query_key": f.query_key,
                "options": f.options,
            }
            for f in self._fields
        ]


editable_registry = _EditableRegistry()
# 33:19
