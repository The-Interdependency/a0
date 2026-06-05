# 33:39 0:0 5:1
# === MODULE_BUILD ===
# id: a0_service_editable_registry
#   module_name: editable_registry
#   module_kind: service
#   summary: In-memory registry of mutable backend fields (EditableField records) exposed to the WSEM editing surface, describing each field's key, label, control type, and metadata.
#   owner: Erin Spencer
#   public_surface: EditableField
#   internal_surface: _EditableRegistry
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; the registry of editable fields is rebuilt in-memory on boot.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===
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
# 33:39 0:0 5:1
