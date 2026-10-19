# 210:48
"""Dormant, offline validation for the website's a0 #113 skill envelope.

Usage: validate_skill_request(envelope, approved_registry_commit=pin,
registry_bytes=raw_registry, skill_bodies=pinned_files, target_heads=heads).
The caller must obtain all source bytes from trusted SAME-COMMIT retrieval
and target_heads from a fresh, authorized repository observation. These are
server-owned inputs, never fields accepted from the browser. This module does
not fetch, authenticate, authorize, register MCP tools, or execute anything.
Its result is validated source material, NOT permission or a completion receipt.
"""

# === MODULE_BUILD ===
# id: webmcp_validation
#   module_name: webmcp_validation
#   module_kind: service
#   summary: Pure validation of the existing website skill envelope against server-owned source evidence.
#   owner: Erin Spencer
#   public_surface: validate_skill_request, ValidatedSkillRequest, SkillValidationError
#   internal_surface: bounded JSON, canonical records, dependency closure
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: tests/test_webmcp_validation.py
#   rollout: dormant; no route or executor imports this module
#   rollback: remove this unreferenced module and its tests
#   unresolved: trusted retrieval, caller authorization, queue binding, execution receipts, deployment
# === END MODULE_BUILD ===
# === CONTRACTS ===
# id: webmcp_source_identity
#   given: browser envelope and separately trusted pinned source bytes
#   then: reject source substitution, raw registry digest mismatch, fallback, and altered skill closure
#   class: security
# id: webmcp_target_freshness
#   given: browser target and independently authorized current target heads
#   then: reject unlisted repositories, noncanonical URLs, and stale heads
#   class: security
# id: webmcp_validation_is_not_execution
#   given: valid canonical source material
#   then: return immutable full skill bodies and byte digests without executing, fetching, or granting permission
#   class: safety
# === END CONTRACTS ===

from dataclasses import dataclass
import hashlib
import json
import re
from typing import Mapping

SOURCE_REPOSITORY = "The-Interdependency/skill-lib"
MAX_ENVELOPE_BYTES = 262_144
MAX_REGISTRY_BYTES = 1_048_576
MAX_BODY_BYTES = 262_144
MAX_TOTAL_BODY_BYTES = 2_097_152
MAX_SKILLS = 256
_SHA = re.compile(r"[0-9a-f]{40}\Z")
_SLUG = re.compile(r"[a-z][a-z0-9-]{0,99}\Z")
_REPO = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\Z")


class SkillValidationError(ValueError):
    """Stable reason code; never include submitted content or credentials."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


@dataclass(frozen=True)
class ValidatedSkill:
    name: str
    canonical_path: str
    canonical_url: str
    body: str
    sha256: str


@dataclass(frozen=True)
class ValidatedSkillRequest:
    target_repository: str
    target_head_sha: str
    registry_commit: str
    registry_sha256: str
    selected_skill: str
    required_skills: tuple[ValidatedSkill, ...]
    human_request: str


def _reject(code: str):
    raise SkillValidationError(code)


def _object(value, code):
    if not isinstance(value, dict):
        _reject(code)
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            _reject("registry_duplicate_key")
        result[key] = value
    return result


def _bounded_structure(value):
    pending = [(value, 0)]
    while pending:
        item, depth = pending.pop()
        if depth > 16:
            _reject("input_nesting")
        if isinstance(item, dict):
            pending.extend((child, depth + 1) for child in item.values())
        elif isinstance(item, list):
            pending.extend((child, depth + 1) for child in item)


def _registry(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_REGISTRY_BYTES:
        _reject("registry_size")
    try:
        result = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                            parse_constant=lambda _: _reject("registry_invalid"))
    except SkillValidationError:
        raise
    except (ValueError, RecursionError):
        _reject("registry_invalid")
    result = _object(result, "registry_invalid")
    _bounded_structure(result)
    if type(result.get("version")) is not int or result["version"] != 1:
        _reject("registry_version")
    if result.get("repo") != SOURCE_REPOSITORY:
        _reject("registry_source")
    entries = result.get("skills")
    if not isinstance(entries, list) or not 0 < len(entries) <= MAX_SKILLS:
        _reject("registry_skills")
    by_name = {}
    for entry in entries:
        entry = _object(entry, "registry_skill")
        name = entry.get("name")
        if not isinstance(name, str) or not _SLUG.fullmatch(name):
            _reject("registry_skill_name")
        if name in by_name:
            _reject("registry_duplicate_skill")
        if entry.get("path") != f"{name}/SKILL.md":
            _reject("registry_skill_path")
        dependencies = entry.get("depends_on", [])
        if (not isinstance(dependencies, list)
                or any(not isinstance(dep, str) for dep in dependencies)
                or len(set(dependencies)) != len(dependencies)):
            _reject("registry_dependencies")
        if not isinstance(entry.get("kind"), str) or entry["kind"] not in {"procedural", "metadata-block"}:
            _reject("registry_skill_kind")
        if not isinstance(entry.get("description"), str):
            _reject("registry_skill_description")
        by_name[name] = entry
    for entry in entries:
        if any(dep not in by_name for dep in entry.get("depends_on", [])):
            _reject("missing_dependency")
    return by_name


def _closure(by_name, selected):
    visited, visiting, ordered = set(), set(), []

    def visit(name):
        if name in visited:
            return
        if name in visiting:
            _reject("dependency_cycle")
        visiting.add(name)
        for dependency in by_name[name].get("depends_on", []):
            visit(dependency)
        visiting.remove(name)
        visited.add(name)
        ordered.append(name)

    visit(selected)
    return ordered


def _check_record(record, entry, commit):
    record = _object(record, "skill_identity")
    expected = {
        "name": entry["name"], "kind": entry["kind"],
        "description": entry["description"].strip(),
        "depends_on": entry.get("depends_on", []),
        "canonical_path": entry["path"],
        "canonical_url": f"https://github.com/{SOURCE_REPOSITORY}/blob/{commit}/{entry['path']}",
    }
    if any(record.get(key) != value for key, value in expected.items()):
        _reject("skill_identity")
    description = entry["description"].strip()
    title = description.split(" — ", 1)[0] if " — " in description else description.split(". ", 1)[0]
    if record.get("human_title") != title.strip():
        _reject("skill_identity")


def validate_skill_request(envelope: dict, *, approved_registry_commit: str,
                           registry_bytes: bytes, skill_bodies: Mapping[str, bytes],
                           target_heads: Mapping[str, str]) -> ValidatedSkillRequest:
    """Validate without side effects; caller-owned inputs are mandatory.

    target_heads keys are full repository identities, e.g. The-Interdependency/a0.
    The website sends the SHORT repository name. Body digests bind the returned
    bytes but do not authenticate them; trusted pinned retrieval remains required.
    Recheck freshness and authorization at eventual dispatch, not just here.
    """
    envelope = _object(envelope, "envelope_invalid")
    if set(envelope) != {"target_repository", "skill", "required_skills", "skill_registry", "human_request"}:
        _reject("envelope_fields")
    try:
        size = len(json.dumps(envelope, allow_nan=False).encode("utf-8"))
    except (TypeError, ValueError, RecursionError, UnicodeError):
        _reject("envelope_invalid")
    if size > MAX_ENVELOPE_BYTES:
        _reject("envelope_size")
    _bounded_structure(envelope)
    if not isinstance(approved_registry_commit, str) or not _SHA.fullmatch(approved_registry_commit):
        _reject("server_registry_pin")
    metadata = _object(envelope.get("skill_registry"), "registry_metadata")
    source = _object(metadata.get("source"), "registry_source")
    if (source.get("repository") != SOURCE_REPOSITORY
            or source.get("path") != "skills.json"
            or source.get("commit") != approved_registry_commit):
        _reject("registry_source")
    if metadata.get("fallback") is not False:
        _reject("registry_fallback")
    by_name = _registry(registry_bytes)
    digest = hashlib.sha256(registry_bytes).hexdigest()
    if source.get("sha256") != digest:
        _reject("registry_digest")
    for key, expected in (("registry_version", 1), ("skill_count", len(by_name)),
                          ("source_skill_count", len(by_name))):
        if type(metadata.get(key)) is not int or metadata[key] != expected:
            _reject("registry_metadata")
    if metadata.get("public_scope") != "all registered skill-lib skills":
        _reject("registry_metadata")
    target = _object(envelope.get("target_repository"), "target_invalid")
    name = target.get("name")
    if not isinstance(name, str) or not _REPO.fullmatch(name):
        _reject("target_invalid")
    full_name = f"The-Interdependency/{name}"
    if full_name not in target_heads:
        _reject("target_not_allowed")
    head = target_heads[full_name]
    if not isinstance(head, str) or not _SHA.fullmatch(head):
        _reject("target_head_unavailable")
    if target.get("canonical_url") != f"https://github.com/{full_name}":
        _reject("target_identity")
    if target.get("observed_head_sha") != head:
        _reject("stale_target_head")
    selected = _object(envelope.get("skill"), "skill_identity").get("name")
    if not isinstance(selected, str) or selected not in by_name:
        _reject("missing_skill")
    _check_record(envelope["skill"], by_name[selected], approved_registry_commit)
    ordered = _closure(by_name, selected)
    records = envelope.get("required_skills")
    if not isinstance(records, list) or len(records) != len(ordered):
        _reject("skill_closure")
    for record, skill_name in zip(records, ordered):
        _check_record(record, by_name[skill_name], approved_registry_commit)
    request = envelope.get("human_request")
    if not isinstance(request, str) or not request.strip() or len(request) > 4_000 or "\x00" in request:
        _reject("human_request")
    result, total = [], 0
    for skill_name in ordered:
        path = by_name[skill_name]["path"]
        body = skill_bodies.get(path)
        if not isinstance(body, bytes) or not 0 < len(body) <= MAX_BODY_BYTES:
            _reject("skill_body_unavailable")
        total += len(body)
        if total > MAX_TOTAL_BODY_BYTES:
            _reject("skill_body_total_size")
        try:
            decoded = body.decode("utf-8")
        except UnicodeError:
            _reject("skill_body_invalid")
        if not decoded.strip() or "\x00" in decoded:
            _reject("skill_body_invalid")
        result.append(ValidatedSkill(skill_name, path,
            f"https://github.com/{SOURCE_REPOSITORY}/blob/{approved_registry_commit}/{path}",
            decoded, hashlib.sha256(body).hexdigest()))
    return ValidatedSkillRequest(full_name, head, approved_registry_commit, digest,
                                 selected, tuple(result), request)
# 210:48
