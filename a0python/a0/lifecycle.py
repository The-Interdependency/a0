"""a0 lifecycle — spawn, clone, merge, diversify.

The four fundamental operations for a multi-agent a0 ecosystem:

    spawn      — create a child instance seeded from parent memory
    clone      — exact copy (new identity, same state)
    merge      — combine two instances via Jury adjudication (Law 5)
    diversify  — create N variants with different configurations

Each instance has an isolated home directory:

    {home}/state/memory.json      encrypted cognitive state
    {home}/state/a0_state.json    last_model tracking
    {home}/logs/                  event logs
    {home}/instance.json          instance descriptor (metadata)

Usage::

    from a0.lifecycle import spawn, clone, merge, diversify, root_instance

    parent = root_instance()                          # the default a0 instance
    child  = spawn(parent, name="worker-1")           # fresh child, empty memory
    backup = clone(parent, name="backup-before-exp")  # full copy
    merged = merge(parent, child)                     # pull child learnings back
    fleet  = diversify(parent, [                      # N variants
        {"A0_MODEL": "anthropic-api"},
        {"A0_MODEL": "local-llama"},
        {"A0_MODEL": "local-echo"},
    ])

To run a live agent from any descriptor::

    from a0.agent import AgentZero
    az = AgentZero(home=child.home, instance_id=child.instance_id)
    resp = az.run("hello")
"""
from __future__ import annotations

import json
import shutil
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from a0.jury import AdjudicationVerdict, Jury
from a0.memory import Memory, MemoryEntry

# ---------------------------------------------------------------------------
# Instance directory layout
# ---------------------------------------------------------------------------

_INSTANCES_ROOT = Path(__file__).resolve().parent / "state" / "instances"


def _new_home(instance_id: str) -> Path:
    home = _INSTANCES_ROOT / instance_id
    (home / "state").mkdir(parents=True, exist_ok=True)
    (home / "logs").mkdir(parents=True, exist_ok=True)
    return home


# ---------------------------------------------------------------------------
# InstanceDescriptor
# ---------------------------------------------------------------------------

@dataclass
class InstanceDescriptor:
    """Lightweight handle for a spawned/cloned/merged a0 instance.

    Pass home + instance_id to AgentZero to run a live agent:
        AgentZero(home=desc.home, instance_id=desc.instance_id)
    """
    instance_id: str
    name: str
    home: Path
    parent_id: Optional[str] = None
    config: Dict[str, str] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Conflict IDs preserved from a merge operation (Law 5)
    conflicts: List[str] = field(default_factory=list)

    @property
    def memory_path(self) -> Path:
        return self.home / "state" / "memory.json"

    @property
    def log_dir(self) -> Path:
        return self.home / "logs"

    def save(self) -> None:
        """Persist descriptor to {home}/instance.json."""
        data = {
            "instance_id": self.instance_id,
            "name": self.name,
            "home": str(self.home),
            "parent_id": self.parent_id,
            "config": self.config,
            "created_at": self.created_at,
            "conflicts": self.conflicts,
        }
        (self.home / "instance.json").write_text(
            json.dumps(data, indent=2), encoding="utf-8"
        )

    @classmethod
    def load(cls, home: Path) -> "InstanceDescriptor":
        data = json.loads((home / "instance.json").read_text(encoding="utf-8"))
        return cls(
            instance_id=data["instance_id"],
            name=data["name"],
            home=Path(data["home"]),
            parent_id=data.get("parent_id"),
            config=data.get("config", {}),
            created_at=data.get("created_at", ""),
            conflicts=data.get("conflicts", []),
        )


# ---------------------------------------------------------------------------
# Root instance helper
# ---------------------------------------------------------------------------

def root_instance() -> InstanceDescriptor:
    """Return a descriptor for the default (root) a0 instance.

    The root instance uses the package-default paths (not an instances/
    subdirectory). This is what AgentZero() uses when home=None.
    """
    _pkg = Path(__file__).resolve().parent
    return InstanceDescriptor(
        instance_id="root",
        name="root",
        home=_pkg,
        parent_id=None,
        config={},
    )


# ---------------------------------------------------------------------------
# spawn
# ---------------------------------------------------------------------------

def spawn(
    parent: InstanceDescriptor,
    name: str,
    seed_keys: Optional[List[str]] = None,
    config: Optional[Dict[str, str]] = None,
) -> InstanceDescriptor:
    """Create a child instance optionally seeded with parent memory.

    Args:
        parent:    The spawning instance.
        name:      Human-readable label for the child.
        seed_keys: List of memory keys to copy from parent.
                   Pass None for an empty memory (fresh start).
                   Pass [] explicitly for the same (empty).
                   Pass a list of keys to seed specific knowledge.
        config:    Env overrides for the child (e.g. {"A0_MODEL": "local-echo"}).

    Returns:
        InstanceDescriptor for the new child.
    """
    child_id = uuid.uuid4().hex
    home = _new_home(child_id)

    # Seed memory from parent
    if seed_keys is not None and parent.memory_path.exists():
        parent_mem = Memory(path=parent.memory_path)
        child_mem = Memory(path=home / "state" / "memory.json")
        jury = Jury()
        for key in seed_keys:
            value = parent_mem.recall(key)
            if value is not None:
                result = jury.adjudicate(value)
                if result.jury_token:
                    child_mem.commit(key, value, result.jury_token)

    desc = InstanceDescriptor(
        instance_id=child_id,
        name=name,
        home=home,
        parent_id=parent.instance_id,
        config=config or {},
    )
    desc.save()
    return desc


# ---------------------------------------------------------------------------
# clone
# ---------------------------------------------------------------------------

def clone(source: InstanceDescriptor, name: str) -> InstanceDescriptor:
    """Create an exact copy of source (new identity, same state).

    The clone's memory and logs are independent from this point forward —
    changes to source do not affect the clone and vice versa.

    Args:
        source: The instance to clone.
        name:   Human-readable label for the clone.

    Returns:
        InstanceDescriptor for the clone.
    """
    clone_id = uuid.uuid4().hex
    home = _new_home(clone_id)

    # Copy memory if it exists
    if source.memory_path.exists():
        shutil.copy2(source.memory_path, home / "state" / "memory.json")

    # Copy state file if it exists
    src_state = source.home / "state" / "a0_state.json"
    if src_state.exists():
        shutil.copy2(src_state, home / "state" / "a0_state.json")

    desc = InstanceDescriptor(
        instance_id=clone_id,
        name=name,
        home=home,
        parent_id=source.instance_id,
        config=dict(source.config),
    )
    desc.save()
    return desc


# ---------------------------------------------------------------------------
# merge
# ---------------------------------------------------------------------------

def merge(
    base: InstanceDescriptor,
    other: InstanceDescriptor,
    into: Optional[InstanceDescriptor] = None,
) -> InstanceDescriptor:
    """Combine other's memory into base via Jury adjudication.

    Law 5: Conflicts are preserved, never silently discarded.

    For each key in other's memory:
    - If base does not have it: commit it directly (new knowledge).
    - If base has the same value: skip (no change).
    - If base has a different value: Jury adjudicates.
      - COMMITTED → other's value wins (more recent knowledge).
      - CONFLICT  → preserved as ConflictRecord; both values retained.

    Args:
        base:  The receiving instance (its memory is the starting point).
        other: The contributing instance (its memory is merged in).
        into:  Optional target — if provided, merge result is written there
               instead of modifying base in place. Useful for safe merges.

    Returns:
        Updated InstanceDescriptor (base or into) with conflicts list populated.
    """
    target = into or base
    base_mem = Memory(path=base.memory_path) if base.memory_path.exists() else Memory(path=base.home / "state" / "memory.json")
    other_mem = Memory(path=other.memory_path) if other.memory_path.exists() else Memory(path=other.home / "state" / "memory.json")
    target_mem = Memory(path=target.home / "state" / "memory.json")

    jury = Jury()
    conflict_ids: List[str] = []

    for key in other_mem.all_keys():
        other_val = other_mem.recall(key)
        base_val = base_mem.recall(key)

        if base_val is None:
            # New key — commit directly
            result = jury.adjudicate(other_val)
            if result.jury_token:
                target_mem.commit(key, other_val, result.jury_token)

        elif base_val == other_val:
            # Same value — no change needed; re-commit to target if merging into new descriptor
            if into is not None:
                result = jury.adjudicate(base_val)
                if result.jury_token:
                    target_mem.commit(key, base_val, result.jury_token)

        else:
            # Diverged values — adjudicate
            result = jury.adjudicate(other_val, prior={"_conflict_with": id(base_val)})
            if result.verdict == AdjudicationVerdict.COMMITTED and result.jury_token:
                target_mem.commit(key, other_val, result.jury_token)
            elif result.conflict:
                # Law 5: preserve conflict — store both under distinct keys
                conflict_ids.append(result.conflict.conflict_id)
                tok_a = jury.establish_standard(f"{key}_base", {"value": base_val})
                tok_b = jury.establish_standard(f"{key}_other", {"value": other_val})
                target_mem.commit(f"{key}__base", base_val, tok_a)
                target_mem.commit(f"{key}__other", other_val, tok_b)
                target_mem.commit(
                    f"{key}__conflict",
                    {
                        "conflict_id": result.conflict.conflict_id,
                        "reason": result.conflict.reason,
                        "keys": [f"{key}__base", f"{key}__other"],
                    },
                    jury.establish_standard(f"{key}_conflict", {}),
                )

    # If merging into base (not a new target), preserve existing keys not in other
    if into is not None:
        for key in base_mem.all_keys():
            if other_mem.recall(key) is None:
                val = base_mem.recall(key)
                result = jury.adjudicate(val)
                if result.jury_token:
                    target_mem.commit(key, val, result.jury_token)

    # Update target descriptor with conflict list
    updated = InstanceDescriptor(
        instance_id=target.instance_id,
        name=target.name,
        home=target.home,
        parent_id=target.parent_id,
        config=target.config,
        created_at=target.created_at,
        conflicts=target.conflicts + conflict_ids,
    )
    updated.save()
    return updated


# ---------------------------------------------------------------------------
# diversify
# ---------------------------------------------------------------------------

def diversify(
    parent: InstanceDescriptor,
    configs: List[Dict[str, str]],
    seed_keys: Optional[List[str]] = None,
) -> List[InstanceDescriptor]:
    """Create N variant instances from one parent with different configurations.

    Each variant gets its own isolated home directory. The configs list
    drives what makes each variant distinct — typically different A0_MODEL
    values, but any env override is valid.

    Args:
        parent:    The source instance.
        configs:   List of config dicts, one per variant.
                   e.g. [{"A0_MODEL": "anthropic-api"}, {"A0_MODEL": "local-llama"}]
        seed_keys: Memory keys to seed into each variant from parent.
                   None = empty memory (default). Pass a list to share knowledge.

    Returns:
        List of InstanceDescriptors, one per config entry.
    """
    variants: List[InstanceDescriptor] = []
    for i, cfg in enumerate(configs):
        name = f"{parent.name}-variant-{i+1}"
        if "A0_MODEL" in cfg:
            name = f"{parent.name}-{cfg['A0_MODEL']}"
        desc = spawn(parent, name=name, seed_keys=seed_keys, config=cfg)
        variants.append(desc)
    return variants


# ---------------------------------------------------------------------------
# Discovery helpers
# ---------------------------------------------------------------------------

def list_instances() -> List[InstanceDescriptor]:
    """Return all known instances from the instances root directory."""
    if not _INSTANCES_ROOT.exists():
        return []
    result = []
    for home in sorted(_INSTANCES_ROOT.iterdir()):
        descriptor_file = home / "instance.json"
        if descriptor_file.exists():
            try:
                result.append(InstanceDescriptor.load(home))
            except Exception:
                pass
    return result
