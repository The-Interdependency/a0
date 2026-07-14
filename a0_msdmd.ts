import { defineMsdmdCollection } from "./.agents/skills/msdmd/collection";

export default defineMsdmdCollection({
  "declarations": [
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "memory_core",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "MemoryCore",
        "requires": "none",
        "rollback": "Revert this file; memory rings are rebuilt in-memory and restored from PCNA checkpoint.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "MemoryCore \u2014 parameterized memory ring (long-term N=19 / short-term N=17) with round-robin write, content-addressed query, and reward-gated flush short\u2192long.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/memory_core.py",
      "id": "a0_engine_memory_core"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_fed_avg, _blend_core",
        "module_kind": "engine",
        "module_name": "merge",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "InstanceMerge",
        "requires": "a0_engine_theta, a0_engine_ptca_core, a0_engine_pcna",
        "rollback": "Revert this file; merge operators are pure functions over in-memory engine state.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "InstanceMerge \u2014 stateless absorb/fork/converge operators for the multi-instance PCNA mesh, blending PTCACore/MemoryCore/ThetaTensor state via federated averaging.",
        "tests": "hmmm",
        "unresolved": "fork() time-seeds its RNG so rapid successive calls may collide.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/merge.py",
      "id": "a0_engine_merge"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_compute, _parse_blocks, _validate, _infer_kind, _has_doc_cover, _iter_source_files",
        "module_kind": "instrument",
        "module_name": "module_graph",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "scan, WORKSPACE_ROOT",
        "requires": "none",
        "rollback": "remove this engine and the module_graph route",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "read-only scanner that walks the workspace and emits the MODULE_BUILD/DOC coverage module-graph",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/module_graph.py",
      "id": "a0_engine_module_graph"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_tensor_to_b64, _b64_to_tensor",
        "module_kind": "engine",
        "module_name": "pcna",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "PCNAEngine",
        "requires": "a0_engine_ptca_core, a0_engine_memory_core, a0_engine_theta",
        "rollback": "Revert this file; engine is reconstructed from checkpoint on next boot.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Six-ring PCNA inference pipeline (Phi/Psi/Omega/Theta/Memory-L/Memory-S) running Project\u2192Inject\u2192Propagate\u2192PTCA-seed\u2192PCTA-circle\u2192Coherence plus reward backprop.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/engine/pcna.py",
      "id": "a0_engine_pcna"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_t2b64, _b64t",
        "module_kind": "engine",
        "module_name": "prime_seeds",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "PrimeSeedLayer, get_prime_seeds",
        "requires": "a0_engine_ptca_core, a0_engine_pcna",
        "rollback": "Revert this file; long-term seed is restored from checkpoint, short-term reseeds on next tick.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "PrimeSeedLayer \u2014 seven PTCACore instances (primes 3..19) seeded from sigma tensor slices, propagated each heartbeat tick and merged/promoted into pcna memory rings.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/prime_seeds.py",
      "id": "a0_engine_prime_seeds"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_adj_distances",
        "module_kind": "engine",
        "module_name": "ptca_core",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "PTCACore",
        "requires": "none",
        "rollback": "Revert this file; pure-compute tensor primitive, rebuilt in-memory.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "PTCACore \u2014 parameterized prime-ring tensor base with heptagram propagation and coherence scoring; the substrate for the Phi/Psi/Omega rings.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ptca_core.py",
      "id": "a0_engine_ptca_core"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_is_prime, _nearest_prime, _name_angle, _scan_entries, _encode_entries, _file_hash",
        "module_kind": "engine",
        "module_name": "sigma",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SigmaCore, get_sigma",
        "requires": "none",
        "rollback": "Revert this file; Sigma is an optional observer and degrades gracefully when absent.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "SigmaCore \u2014 variable-size prime-node ring that encodes the workspace filesystem as hyperdimensional vectors; companion observer to the Psi ring with its own checkpoint.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/sigma.py",
      "id": "a0_engine_sigma"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_pack_payload_to_seeds, _unpack_seeds_to_payload, _quantize_tensor_to_seeds, _seeds_to_bytes, _bytes_to_seeds, _gen_instance_id, _compute_blueprint_hash, _shard_blueprint",
        "module_kind": "engine",
        "module_name": "theta",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "ThetaTensor",
        "requires": "none",
        "rollback": "Revert this file; Theta is reconstructed in-memory on PCNA engine init.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "ThetaTensor (\u0398) \u2014 N=29 prime-node microkernel ring that runs PCEA encryption over external payloads using its own tensor state as the cryptographic key.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/theta.py",
      "id": "a0_engine_theta"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "audit",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "AuditRecord, UCNSAuditLog",
        "requires": "none",
        "rollback": "Revert this file; audit log is in-memory only in v0.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "UCNSAuditLog \u2014 in-memory append-only audit log keyed by UCNSObject identity, with an S9-sentinel-compatible AuditRecord format.",
        "tests": "hmmm",
        "unresolved": "In-memory only in v0; no persistence.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/audit.py",
      "id": "a0_engine_ucns_kit_audit"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_is_prime, _is_squarefree, _prime_factors, _build_up_to",
        "module_kind": "engine",
        "module_name": "coherence_primes",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "is_coherence_prime, sequence_up_to, nth",
        "requires": "none",
        "rollback": "Revert this file; pure deterministic sequence generator.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Coherence-prime sequence generator \u2014 pinned definition (base {3,5,7}; p\u22611 mod 4 with squarefree kernel whose factors are already coherence primes) with membership and nth lookups.",
        "tests": "python/tests/test_coherence_primes.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/coherence_primes.py",
      "id": "a0_engine_ucns_kit_coherence_primes"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "disk_flip",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "disk_flip",
        "requires": "none",
        "rollback": "Revert this file; provisional dual op with no persistent effect.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "disk_flip \u2014 provisional dual operation on a UCNSObject that swaps n_dec and n_min (open-mark/close-mark duality), pending verification against ucns_v04.multiply.",
        "tests": "hmmm",
        "unresolved": "Spec law disk_flip(open-mark)=close-mark not yet verified against ucns_v04.multiply; provisional status propagates to consumers.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/disk_flip.py",
      "id": "a0_engine_ucns_kit_disk_flip"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_tokenize, _entry_to_ucns",
        "module_kind": "engine",
        "module_name": "encoder",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "text_to_ucns",
        "requires": "none",
        "rollback": "Revert this file; encoder raises RuntimeError at call time until edcmbone import is resolved, so no live consumers depend on it.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "text_to_ucns \u2014 tokenizes text and maps closed-class tokens to UCNSObjects (open-class tokens emit None); currently blocked on edcmbone import resolution.",
        "tests": "hmmm",
        "unresolved": "edcmbone import path unresolved (pip-install vs vendored); blocked on edcmbone issue #46 (ucns_v04 on sys.path); raises RuntimeError at call time until resolved.",
        "user_data_boundary": "read"
      },
      "file": "python/engine/ucns_kit/encoder.py",
      "id": "a0_engine_ucns_kit_encoder"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_check_compatibility",
        "module_kind": "engine",
        "module_name": "orchestrator",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "Orchestrator",
        "requires": "a0_engine_ucns_kit_pool",
        "rollback": "Revert this file; pipeline operates on protocol interfaces with no persistent state.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Orchestrator \u2014 six-step UCNS-kit pipeline (encode \u2192 pool/intern \u2192 inject \u2192 propagate \u2192 measure \u2192 reward) operating over frame-independent Category 2 protocol interfaces.",
        "tests": "hmmm",
        "unresolved": "frame/reward type detection not implemented; _check_compatibility is nominal until Frame and Reward implementations land.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/orchestrator.py",
      "id": "a0_engine_ucns_kit_orchestrator"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "pool",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "UCNSPool",
        "requires": "none",
        "rollback": "Revert this file; intern table is in-memory only.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "UCNSPool \u2014 intern table for UCNSObjects (encode-once-refer-many); identical objects by canonical key share a single instance.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/pool.py",
      "id": "a0_engine_ucns_kit_pool"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "protocols",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "RingState, PropagationRule, CoherenceMeasure, RewardMechanism, Serializer",
        "requires": "none",
        "rollback": "Revert this file; pure typing.Protocol contracts with no runtime behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "UCNS-kit protocol interfaces \u2014 frame-independent contracts (RingState, PropagationRule, CoherenceMeasure, RewardMechanism, Serializer) with no implementations.",
        "tests": "hmmm",
        "unresolved": "Frame choice (A/B/C node semantics) is upstream of these interfaces and not yet pinned.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/protocols.py",
      "id": "a0_engine_ucns_kit_protocols"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "hmmm",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "theta_gate",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "gate",
        "requires": "none",
        "rollback": "Revert this file; gate is a pure view filter with no persistent effect.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "theta_gate \u2014 returns a capability-gated view of a UCNSObject; granted capability yields the full object, ungranted yields a class-only view with anchors/faces cleared.",
        "tests": "hmmm",
        "unresolved": "capability taxonomy not yet defined; allowlist is empty so all capabilities are ungrouped by default until pinned.",
        "user_data_boundary": "none"
      },
      "file": "python/engine/ucns_kit/theta_gate.py",
      "id": "a0_engine_ucns_kit_theta_gate"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "engine",
        "module_name": "zeta",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "ZetaEngine",
        "requires": "a0_engine_pcna, a0_service_edcm",
        "rollback": "Revert this file; Zeta runs non-blocking after responses and can be disabled without affecting inference.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "ZetaEngine (ZFAE) \u2014 passively scores every assistant response via EDCM (no LLM) and drives PCNA phi/psi/omega reward backprop, with per-directory observation resolution.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/engine/zeta.py",
      "id": "a0_engine_zeta"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.module_doctrine.test_route_doc_blocks_are_complete",
        "class": "correctness",
        "given": "every python/routes/*.py file (excluding __init__.py)",
        "then": "it declares # DOC module/label/description/tier/role exactly"
      },
      "file": "python/routes/__init__.py",
      "id": "routes_doc_blocks_complete"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.module_doctrine.test_route_files_are_annotated",
        "class": "correctness",
        "given": "every python/routes/*.py file (excluding __init__.py)",
        "then": "its first and last non-blank lines are # N:M annotation comments"
      },
      "file": "python/routes/__init__.py",
      "id": "routes_files_annotated"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.module_doctrine.test_router_defining_files_are_registered",
        "class": "correctness",
        "given": "every python/routes/*.py file that defines a module-level router",
        "then": "it is imported and added to ALL_ROUTERS in __init__.py"
      },
      "file": "python/routes/__init__.py",
      "id": "routes_routers_registered"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.route_gating.test_every_write_route_is_gated",
        "class": "security",
        "given": "every @router.{post,patch,delete,put} handler in",
        "then": "the handler body must reference at least one gating sentinel"
      },
      "file": "python/routes/__init__.py",
      "id": "routes_write_endpoints_gated"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.billing.test_webhook_replay_is_idempotent",
        "class": "idempotency",
        "given": "same Stripe event id POSTed twice to the webhook (via the",
        "then": "first call returns {received: True}; replay returns"
      },
      "file": "python/routes/billing.py",
      "id": "billing_webhook_replay_idempotent"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.chat.test_delete_other_owner_404",
        "class": "security",
        "given": "DELETE /api/v1/conversations/{id} with x-user-id != row.user_id",
        "then": "404; the row remains intact for the real owner"
      },
      "file": "python/routes/chat.py",
      "id": "chat_delete_other_owner_404"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.chat.test_get_other_owner_404",
        "class": "security",
        "given": "GET /api/v1/conversations/{id} with x-user-id != row.user_id",
        "then": "404 (existence non-disclosure, never 403 or 200)"
      },
      "file": "python/routes/chat.py",
      "id": "chat_get_other_owner_404"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.chat.test_unknown_body_model_400",
        "class": "correctness",
        "given": "POST /api/v1/conversations/{id}/messages with body.model that",
        "then": "400 with a detail naming the unknown id (no silent fallback to"
      },
      "file": "python/routes/chat.py",
      "id": "chat_unknown_body_model_400"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "agent_instance",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "AgentInstance",
        "requires": "a0_service_call_fn, a0_service_model_catalog",
        "rollback": "Revert this file; AgentInstance is a thin adapter over call_fn with no persistent state.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "AgentInstance \u2014 runtime handle for \"the thing that calls a model\", unifying Forge agents, spawned subagents, and pinned/ad-hoc model use behind one send-history-get-(content,usage) operation over the canonical CallFn.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/agent_instance.py",
      "id": "a0_service_agent_instance"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_count_live_for_parent_filters",
        "class": "correctness",
        "given": "two registry entries under different parent_run_ids",
        "then": "count_live_for_parent returns 1 for each parent and 0 for an"
      },
      "file": "python/services/agent_lifecycle.py",
      "id": "agent_lifecycle_count_live_for_parent_filters"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_registry_is_singleton",
        "class": "correctness",
        "given": "a fresh process boot",
        "then": "routes.agents._sub_agents is the SAME object as"
      },
      "file": "python/services/agent_lifecycle.py",
      "id": "agent_lifecycle_registry_is_singleton"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "agent_lifecycle",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "spawn_sub_agent, merge_sub_agent, list_sub_agents, get_sub_agent_engine, count_live_for_parent, registry_snapshot",
        "requires": "a0_engine_pcna, a0_engine_merge",
        "rollback": "Revert this file; registry is in-memory only and rebuilt on process boot.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Canonical in-memory sub-agent registry \u2014 owns the single _sub_agents dict (name \u2192 PCNAEngine + meta) and the lock-guarded spawn/merge/list/count helpers shared by routes/agents.py and the spawn executor.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/agent_lifecycle.py",
      "id": "a0_service_agent_lifecycle"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_bucket_id, _client, _storage_key, _find_by_sha, _insert_row, _public_url, _fetch_row",
        "module_kind": "service",
        "module_name": "artifacts",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "archive_artifact, get_artifact_bytes, get_artifact_signed_url, list_artifacts, distinct_tool_names, set_public",
        "requires": "none",
        "rollback": "Revert this file; existing artifact rows and object-storage blobs remain readable.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Unified artifacts archive backed by Replit Object Storage \u2014 every byte stream a0 produces is dedup-uploaded (by sha256) and indexed in the DB with kind/date-partitioned storage keys and signed-URL retrieval.",
        "tests": "tests/test_artifacts.py",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/artifacts.py",
      "id": "a0_service_artifacts"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_resolve_attachment_path, _read_attachment_b64, _extract_pdf_text, _extract_text_file, _extract_document_text, _att_kind",
        "module_kind": "service",
        "module_name": "attachments",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "build_provider_messages",
        "requires": "none",
        "rollback": "Revert this file; only affects multimodal/document turns \u2014 text-only turns are unaffected.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Attachment resolution, text/document extraction, and provider-specific multimodal message building (OpenAI image_url, Claude image blocks, Gemini inline_data); extracted from inference.py and active only when a message carries attachments.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/attachments.py",
      "id": "a0_service_attachments"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_on_done",
        "module_kind": "service",
        "module_name": "bg_tasks",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "spawn, cancel_all, active_count",
        "requires": "none",
        "rollback": "Revert this file; background tasks would revert to bare asyncio.create_task.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Managed background-task registry wrapping asyncio.create_task \u2014 tracks fire-and-forget coroutines to prevent premature GC, logs exceptions instead of swallowing them, and exposes cancel_all for shutdown.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/bg_tasks.py",
      "id": "a0_service_bg_tasks"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_check_tier",
        "module_kind": "service",
        "module_name": "call_fn",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call_model, make_call_fn_full, make_call_fn",
        "requires": "a0_service_inference, a0_service_model_catalog",
        "rollback": "Revert this file; callers would fall back to direct call_provider invocations.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Canonical CallFn adapter (aimmh_lib.make_call_fn pattern) \u2014 the single seam every higher-level construct crosses to invoke a model, with internal provider routing, tier checks, and (content, usage) return.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/call_fn.py",
      "id": "a0_service_call_fn"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_tool_name, _tool_side_effects",
        "module_kind": "service",
        "module_name": "cut_modes",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "tools_for_cut_mode, get_user_default_cut_mode, names_in",
        "requires": "none",
        "rollback": "Revert this file; defaults to exposing every enabled tool.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Cut-mode tool filter \u2014 gates which tools the model sees per turn (off=all, soft=read-only, hard=spawn/merge only) over the canonical chat-shape tool list, plus per-user default lookup.",
        "tests": "tests/test_cut_modes.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/cut_modes.py",
      "id": "a0_service_cut_modes"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_clamp, _build_transcript, _round_text",
        "module_kind": "service",
        "module_name": "edcm",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "compute_metrics, check_directives, delta_between, edcmbone_round, compute_transcript_full, METRIC_NAMES, DIRECTIVES",
        "requires": "none",
        "rollback": "Revert this file; raises rather than falling back, so callers see real failures.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "EDCM behavioral-directive scoring service \u2014 delegates measurement math to edcmbone while keeping the stable contract (compute_metrics / check_directives / delta_between) that routes, snapshots, and the edcm_score tool depend on.",
        "tests": "tests/test_edcm_uses_package.py",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/edcm.py",
      "id": "a0_service_edcm"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_no_credits_returns_none",
        "class": "pricing",
        "given": "a user with free_remaining=0, paid_remaining=0",
        "then": "consume_explanation_credit returns None (route layer converts"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_402_when_no_credits"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary",
        "class": "correctness",
        "given": "an explainer_call event is emitted by the explainer service",
        "then": "it persists with event='explainer_call' (not silently rewritten"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_call_surfaces_in_learning_summary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid",
        "class": "pricing",
        "given": "a user with free_remaining=1, paid_remaining=3",
        "then": "consume_explanation_credit returns 'free' and free_remaining"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_decrements_free_first"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge",
        "class": "idempotency",
        "given": "an explanation already exists for (report_id, user_id)",
        "then": "a second explain_report() call returns the cached row, does NOT"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_explanation_is_idempotent"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_refund_after_failure",
        "class": "failure_recovery",
        "given": "a credit was consumed (bucket='paid'), then the model failed",
        "then": "refund_explanation_credit('paid') restores paid_remaining to"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_refund_restores_balance"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations",
        "class": "correctness",
        "given": "model output contains citations whose quoted spans do not",
        "then": "_parse_explainer_output drops the fabricated quotes and, if"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "explainer_rejects_fabricated_citations"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "resource ownership \u2014 raises PermissionError when report_id is not owned by user_id",
        "internal_surface": "_format_round, _build_user_prompt, _strip_json_fences, _normalize_for_match, _quote_appears_in_transcript, _parse_explainer_output, _compute_cost_cents, _record_cost_metric, _emit_provider_log, _credits_view",
        "module_kind": "service",
        "module_name": "edcmbone_explainer",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "explain_report, InsufficientCredits, PromptTooLarge",
        "requires": "a0_service_energy_registry",
        "rollback": "Revert this file; existing cached explanations remain readable, no new ones generated.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Turns an EDCMbone scoring report into a 200-400 word human explanation with cited transcript spans via an LLM \u2014 owner-gated, idempotent per report, strict-JSON, with credit metering and refund-on-failure.",
        "tests": "python/tests/contracts/transcripts_explainer.py",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/edcmbone_explainer.py",
      "id": "a0_service_edcmbone_explainer"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_EditableRegistry",
        "module_kind": "service",
        "module_name": "editable_registry",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "EditableField",
        "requires": "none",
        "rollback": "Revert this file; the registry of editable fields is rebuilt in-memory on boot.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "In-memory registry of mutable backend fields (EditableField records) exposed to the WSEM editing surface, describing each field's key, label, control type, and metadata.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/editable_registry.py",
      "id": "a0_service_editable_registry"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_load_pricing_doc",
        "module_kind": "service",
        "module_name": "energy_registry",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "BUILTIN_PROVIDERS, get_pricing_models, get_model_pricing, reload_pricing_doc, default_provider, active_provider, cheap_provider, estimate_cost, cache_breakdown, reset_per_call_usage",
        "requires": "none",
        "rollback": "Revert this file; provider catalog and pricing revert to prior JSON-backed definitions.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Energy-provider catalog and pricing/cost layer \u2014 loads provider+pricing JSON data, resolves active/default/cheap providers, and estimates per-call cost and cache breakdown from usage.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/energy_registry.py",
      "id": "a0_service_energy_registry"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.gating.test_allowlist_entries_correspond_to_real_routes",
        "class": "security",
        "given": "every entry in OWNER_OR_PUBLIC_WRITES",
        "then": "the (file, method, path) corresponds to a real"
      },
      "file": "python/services/gating.py",
      "id": "gating_allowlist_entries_are_real_routes"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.gating.test_every_write_route_is_gated_or_allowlisted",
        "class": "security",
        "given": "every @router.{post,patch,put,delete} in python/routes/",
        "then": "the handler body within ~80 lines either calls a recognized"
      },
      "file": "python/services/gating.py",
      "id": "gating_every_write_route_is_admin_or_allowlisted"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.gating.test_instrument_mutation_files_have_all_writes_gated",
        "class": "security",
        "given": "every @router.{post,patch,put,delete} inside a",
        "then": "the handler body visibly calls require_admin (or another"
      },
      "file": "python/services/gating.py",
      "id": "gating_instrument_files_all_writes_gated"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.gating.test_instrument_mutation_files_are_never_allowlisted",
        "class": "security",
        "given": "FORBIDDEN_ALLOWLIST_FILES (agents.py, bandits.py, edcm.py,",
        "then": "no entry in OWNER_OR_PUBLIC_WRITES references any of these files"
      },
      "file": "python/services/gating.py",
      "id": "gating_instrument_files_never_allowlisted"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "defines the owner/admin gate \u2014 require_admin raises 403 for non-admin callers; require_owner_of enforces per-resource ownership",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "gating",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "is_admin, caller_uid, require_admin, require_owner_of",
        "requires": "none",
        "rollback": "Revert this file; this is the sole owner/admin gate so reverting changes the access model platform-wide.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Canonical access-control helpers \u2014 the single definition of \"owner/admin\" at the HTTP-header level (is_admin / require_admin / require_owner_of / caller_uid) for the two-tier write-access model.",
        "tests": "python/tests/contracts/gating.py",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/gating.py",
      "id": "a0_service_gating"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "declares which write routes are exempt from the admin gate \u2014 changes here directly affect the write-access enforcement boundary",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "gating_allowlist",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "AllowEntry, is_allowlisted, allowlist_summary",
        "requires": "none",
        "rollback": "Revert this file; restores the prior set of admin-gate exemptions (CI gating contract enforces correctness).",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Explicit allowlist of write routes that legitimately do NOT require the admin gate (per-user CRUD, HMAC-authenticated webhooks, public entrypoints); consumed by the gating contract test.",
        "tests": "python/tests/contracts/gating.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/gating_allowlist.py",
      "id": "a0_service_gating_allowlist"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_client, _effort_to_thinking_budget, _chat_tools_to_gemini, _split_system, _messages_to_contents, _accumulate_usage",
        "module_kind": "adapter",
        "module_name": "gemini_native",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call_gemini_native",
        "requires": "a0_service_tool_executor",
        "rollback": "Revert this file; Gemini calls fall back to the OpenAI-compat HTTP path.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Native google-genai SDK adapter for Gemini 2.5/3 \u2014 replaces the OpenAI-compat HTTP path, unlocking thinking_config, implicit-cache usage surfacing, and a native FunctionDeclaration tool loop.",
        "tests": "hmmm",
        "unresolved": "Streaming and Google Search grounding deliberately out of scope for v1.",
        "user_data_boundary": "write"
      },
      "file": "python/services/gemini_native.py",
      "id": "a0_service_gemini_native"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "DEFAULT_TASKS",
        "module_kind": "service",
        "module_name": "heartbeat",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "HeartbeatService",
        "requires": "a0_engine_pcna",
        "rollback": "Revert this file; stop the heartbeat task to disable periodic ticks.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "HeartbeatService \u2014 periodic tick scheduler running audit snapshots, memory checkpoints, PCNA propagation, prime-seed ticks, and sub-agent cleanup.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/heartbeat.py",
      "id": "a0_service_heartbeat"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_instance_memory_block, _slot_instance_block, _slot_routing_info, _sanitize_provider_error, _canonical_tool_calls, _gate_to_effort, _effort_to_thinking_budget, _call_openai_routed, _call_anthropic",
        "module_kind": "service",
        "module_name": "inference",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call_provider",
        "requires": "a0_service_tool_executor, a0_service_prompt_assembly, a0_service_attachments, a0_service_energy_registry",
        "rollback": "Revert this file; inference is the live model-call path and has no migration state.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Orchestrates LLM calls across registered energy providers (Grok/Gemini/Claude/OpenAI-style) \u2014 resolves role, normalizes reasoning effort, runs the tool loop, and injects tier-specific prompt_context.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/inference.py",
      "id": "a0_service_inference"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_flatten_user_text, _emit_provider_response, _serialize_results, _attach_per_voice_usage, _aggregate_voice_usage, _summarize_results",
        "module_kind": "service",
        "module_name": "inference_modes",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "run_inference_with_mode",
        "requires": "a0_service_run_logger, a0_service_cut_modes, a0_service_energy_registry, a0_service_orch_progress",
        "rollback": "Revert this file; multi-model modes revert to prior behavior while single-mode inference is unaffected.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "run_inference_with_mode \u2014 orchestration entry point that fans aimmh-lib's multi-model primitives (single/fan_out/council/daisy_chain/room_all/room_synthesized) over the energy-provider call path, with per-voice usage aggregation.",
        "tests": "tests/test_inference_modes_usage.py",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/inference_modes.py",
      "id": "a0_service_inference_modes"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_first_installed_dist_name",
        "module_kind": "service",
        "module_name": "interdependent_bootstrap",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "check_interdependent_core, require_interdependent_core_ready",
        "requires": "none",
        "rollback": "Revert this file; startup proceeds without the interdependent-core readiness check.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Startup checks that verify the interdependent-core/interdependent-lib distribution and its sibling modules are installed and importable before a0 boots.",
        "tests": "tests/test_interdependent_bootstrap.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/interdependent_bootstrap.py",
      "id": "a0_service_interdependent_bootstrap"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_tier_ok, _resolve_static, _user_tier",
        "module_kind": "service",
        "module_name": "model_catalog",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "resolve_model_id, is_provider_enabled, list_models_for_user",
        "requires": "a0_service_energy_registry",
        "rollback": "Revert this file; model availability resolution reverts to prior per-surface logic.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Single source of truth for \"what models can this user invoke\" \u2014 unifies Forge dropdown, chat chips, and subagent spawn into one tier-gated, provenance-annotated model list plus model_id resolution.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/model_catalog.py",
      "id": "a0_service_model_catalog"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_build_keyword_index, _action_matched, _check_approval_required",
        "module_kind": "service",
        "module_name": "openai_router",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "resolve_role, resolve_model, resolve_role_config, make_route_decision, make_call_config, get_triggered_actions, make_approval_packet",
        "requires": "none",
        "rollback": "Revert this file; routing reverts to prior policy-resolution behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Policy-driven routing layer \u2014 resolves a task's role/model/config from the policy config, detects approval-gated actions, and builds route decisions and approval packets.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/openai_router.py",
      "id": "a0_service_openai_router"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "owner_matches verifies the subscribing user_id owns the client_run_id before streaming progress",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "orch_progress",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "register_subscriber, unregister_subscriber, publish, has_subscribers, register_owner, unregister_owner, owner_matches",
        "requires": "none",
        "rollback": "Revert this file; live progress meters stop publishing but orchestration is unaffected.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Out-of-band, in-memory progress bus for live multi-model orchestration meters \u2014 publish/subscribe keyed by client_run_id with per-request ContextVar isolation and owner matching.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/orch_progress.py",
      "id": "a0_service_orch_progress"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_load_doctrine, _prime_seed_context_lines, _prepend_doctrine, _get_context_value",
        "module_kind": "service",
        "module_name": "prompt_assembly",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "build_system_prompt, build_prompt_sections",
        "requires": "a0_engine_prime_seeds",
        "rollback": "Revert this file; prompt assembly reverts to prior prefix/suffix composition.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Canonical system-prompt construction for all chat turns \u2014 composes the cacheable stable prefix (doctrine + skill manifest + LT prime-seed) and the volatile suffix (memory seeds + ST prime-seed + context boost).",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/prompt_assembly.py",
      "id": "a0_service_prompt_assembly"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_PROVIDER_ENV_PREFIX",
        "module_kind": "service",
        "module_name": "_resolver",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "resolve_model_for_role",
        "requires": "a0_service_energy_registry",
        "rollback": "Revert this file; provider model resolution reverts to prior env/spec precedence.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "resolve_model_for_role \u2014 the single answer to \"given a role, which concrete model id should this provider send?\", resolving env-var override first then the provider spec primary from providers.json.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/providers/_resolver.py",
      "id": "a0_service_providers_resolver"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "claude_provider",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call",
        "requires": "a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference",
        "rollback": "Revert this file; Claude calls revert to the prior inline _call_anthropic implementation.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Anthropic Messages API provider adapter \u2014 exposes the standard async call(messages, role=..., ...) -> (content, usage) with system blocks, prompt-cache breakpoints, extended thinking, and a repeat-detecting tool loop.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/providers/claude_provider.py",
      "id": "a0_service_providers_claude"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "gemini_provider",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call",
        "requires": "a0_service_providers_resolver, a0_service_gemini_native",
        "rollback": "Revert this file; Gemini provider dispatch reverts to prior wrapper behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Gemini provider adapter \u2014 a thin contract-conforming wrapper that gives gemini_native.call_gemini_native the standard providers.call(messages, role=..., ...) shape so the inference dispatcher delegates uniformly.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/providers/gemini_provider.py",
      "id": "a0_service_providers_gemini"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_call_responses",
        "module_kind": "adapter",
        "module_name": "openai_provider",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call",
        "requires": "a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference",
        "rollback": "Revert this file; OpenAI calls revert to the prior httpx-based implementation.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "OpenAI GPT-5-family provider adapter using the Responses API via the openai SDK \u2014 exposes the standard async call(...) -> (content, usage) with the shared tool-loop contract.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/providers/openai_provider.py",
      "id": "a0_service_providers_openai"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_effort_enum, _get_max_tool_rounds_xai, _to_xai_messages, _to_xai_tools, _usage_from_response, _fingerprint_tool_calls, _call_with_search",
        "module_kind": "adapter",
        "module_name": "xai_provider",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "call",
        "requires": "a0_service_providers_resolver, a0_service_tool_executor, a0_service_tool_distill, a0_service_inference, a0_service_energy_registry, a0_service_run_context",
        "rollback": "Revert this file; Grok calls revert to the prior httpx-based implementation.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "xAI Grok provider adapter over the official xai-sdk (gRPC) \u2014 exposes the standard async call(...) -> (content, usage) with a live-search path, a repeat-safe tool-loop path, and streaming.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/providers/xai_provider.py",
      "id": "a0_service_providers_xai"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "research",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "RESEARCH_SOURCES, score_relevance, create_draft, deduplicate_drafts",
        "requires": "none",
        "rollback": "Revert this file; research draft helpers revert to prior behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Research-draft helpers \u2014 declares the RESEARCH_SOURCES catalog and provides relevance scoring, draft creation, and dedupe utilities over candidate results.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/research.py",
      "id": "a0_service_research"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "holds the approval-scope user id that tools read to scope pre-approved actions",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "run_context",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "get_current_run_id, set_approval_scope_user_id, get_approval_scope_user_id, get_current_depth, get_current_root_run_id, get_current_parent_run_id, bind_run, reset_run, snapshot",
        "requires": "none",
        "rollback": "Revert this file; recursion tracking reverts to prior ContextVar surface.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Run-scoped ContextVars for ZFAE recursion tracking \u2014 run id, depth, root/parent run id, and approval-scope user id, inherited by async tool/inference calls and rebound on sub-agent spawn.",
        "tests": "tests/test_run_context.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/run_context.py",
      "id": "a0_service_run_context"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_periodic_flush_loop",
        "module_kind": "service",
        "module_name": "run_logger",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "RunLogger, get_run_logger, flush, start_flusher, dump_run_jsonl, queued_count",
        "requires": "a0_service_run_context",
        "rollback": "Revert this file; logging reverts to prior buffered-writer behavior; agent_logs rows remain.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Per-run buffered structured logger backed by the agent_logs table \u2014 queues emit() calls, drains via a background flusher, and exposes dump_run_jsonl for sub-agent merge archival.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/run_logger.py",
      "id": "a0_service_run_logger"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "slot_locks",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "conduct_turn_enter, conduct_turn_exit, conduct_is_active",
        "requires": "none",
        "rollback": "Revert this file; conduct-slot in-flight guarding reverts to prior behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Per-slot in-flight turn counter \u2014 tracks how many main-chat turns are routed through the conduct slot so instance reassignment can return 409 Conflict while a turn is in flight.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/slot_locks.py",
      "id": "a0_service_slot_locks"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_load_tier_overrides, _count_concurrent_live",
        "module_kind": "service",
        "module_name": "spawn_caps",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SpawnCapExceeded, get_caps_for_tier, sibling_count, check_can_spawn, caps_description_tail",
        "requires": "none",
        "rollback": "Revert this file; spawn caps revert to prior tier defaults and env precedence.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Recursion-cap enforcement for sub_agent_spawn \u2014 resolves per-tier depth/fanout/concurrent-live caps from settings overrides then env defaults, and raises SpawnCapExceeded on violation.",
        "tests": "tests/test_spawn_caps.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/spawn_caps.py",
      "id": "a0_service_spawn_caps"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_is_transient_exception, _claim_one_pending, _heartbeat_loop, _persist_resolved_provider, _mark_terminal, _maybe_schedule_retry",
        "module_kind": "service",
        "module_name": "spawn_db",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "none",
        "requires": "none",
        "rollback": "Revert this file; spawn-row DB operations revert to prior claim/retry behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Raw database operations for the spawn executor \u2014 atomic claim, heartbeat loop, provider persistence, terminal marking, and retry scheduling with a transient-exception classifier.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/spawn_db.py",
      "id": "a0_service_spawn_db"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_claim_atomic",
        "class": "idempotency",
        "given": "a single 'running' agent_runs row exists",
        "then": "two concurrent _claim_one_pending() calls succeed once and"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_claim_atomic"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_concurrent_live_cap",
        "class": "security",
        "given": "20 live registry entries under a single parent_run_id",
        "then": "check_can_spawn raises SpawnCapExceeded with cap='concurrent_live'"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_concurrent_live_cap"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_heartbeat_advances",
        "class": "correctness",
        "given": "an 'executing' agent_runs row and the _heartbeat_loop running",
        "then": "last_heartbeat_at strictly advances after a few interval ticks"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_heartbeat_advances"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_marks_failed_on_exception",
        "class": "correctness",
        "given": "a claimed row whose providers list resolves to an unknown id",
        "then": "_execute_one raises no exception, the row's final status is"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_marks_failed_on_exception"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna",
        "class": "correctness",
        "given": "a missing primary PCNA (cold-start or test bootstrap)",
        "then": "_try_get_primary_pcna returns None and _retire_fork_quietly"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_merge_helpers_tolerate_no_pcna"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_no_orphan_invariant",
        "class": "correctness",
        "given": "a registry entry whose run_id has no DB row, AND a DB",
        "then": "check_no_orphan_invariant flags both as orphans and reports ok=False"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_no_orphan_invariant"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty",
        "class": "correctness",
        "given": "an empty list or malformed providers value",
        "then": "_resolve_provider raises ValueError (no silent default-to-active)"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_resolve_provider_rejects_empty"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_retry_default_none",
        "class": "correctness",
        "given": "retry_policy='none' OR a non-transient exception under",
        "then": "_maybe_schedule_retry returns False"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_retry_default_none"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_retry_once_on_transient",
        "class": "correctness",
        "given": "a row with retry_policy='once_on_transient', retry_count=0,",
        "then": "_maybe_schedule_retry returns True, row goes back to 'running'"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_retry_once_on_transient"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_skips_non_running",
        "class": "correctness",
        "given": "an agent_runs row with status='completed' (or 'failed', 'merged')",
        "then": "_claim_one_pending() does not return it"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_skips_non_running"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_snapshot_pcna_shape",
        "class": "correctness",
        "given": "a primary-shaped PCNAEngine instance",
        "then": "_snapshot_pcna returns the four delta-tracked floats/ints"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_snapshot_pcna_shape"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost",
        "class": "correctness",
        "given": "an 'executing' row with last_heartbeat_at older than 2\u00d7 the",
        "then": "_reap_stale_claims marks ONLY the stale row; fresh row untouched"
      },
      "file": "python/services/spawn_executor.py",
      "id": "spawn_executor_stale_sweep_marks_worker_lost"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_execute_one, _on_inflight_done, _poll_loop",
        "module_kind": "service",
        "module_name": "spawn_executor",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "inflight_count",
        "requires": "a0_service_spawn_db, a0_service_spawn_pcna, a0_service_spawn_sweep, a0_service_agent_instance, a0_service_run_logger, a0_service_run_context",
        "rollback": "Revert this file; pending spawn rows remain unclaimed until executor is restored.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Executes the agent_runs rows sub_agent_spawn writes \u2014 atomically claims rows, binds run-scoped ContextVars, runs one AgentInstance inference turn, and writes results back through run_logger into the agent_logs stream.",
        "tests": "python/tests/contracts/spawn_executor.py",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/spawn_executor.py",
      "id": "a0_service_spawn_executor"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_resolve_provider, _snapshot_pcna, _try_get_primary_pcna, _retire_fork_quietly",
        "module_kind": "service",
        "module_name": "spawn_pcna",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "none",
        "requires": "a0_service_energy_registry",
        "rollback": "Revert this file; spawn provider/PCNA helpers revert to prior behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Provider-resolution and PCNA helpers for the spawn executor \u2014 resolve_provider (active/explicit), snapshot_pcna, try_get_primary_pcna, and retire_fork_quietly; all pure helpers with no DB writes.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/spawn_pcna.py",
      "id": "a0_service_spawn_pcna"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_reap_stale_claims, _emit_worker_lost_event, _stale_sweep_loop",
        "module_kind": "service",
        "module_name": "spawn_sweep",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "check_no_orphan_invariant",
        "requires": "none",
        "rollback": "Revert this file; stale-claim reaping stops but spawn rows remain consistent on restart.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Stale-claim reaper and no-orphan invariant checker for the spawn executor \u2014 sweeps timed-out claims, emits worker-lost events, and reconciles in-memory registry against agent_runs rows.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/spawn_sweep.py",
      "id": "a0_service_spawn_sweep"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "stripe_service",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "STRIPE_SECRET_KEY, ensure_stripe_products, get_tier_context_name",
        "requires": "none",
        "rollback": "Revert this file; Stripe config shim reverts to prior constants/mapping.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Stripe configuration shim \u2014 canonical home for STRIPE_SECRET_KEY and the tier\u2192prompt-context mapping; donations-only after Task #110 so no static product bootstrap is required.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/stripe_service.py",
      "id": "a0_service_stripe_service"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_extract_json, _validate_batch_response",
        "module_kind": "service",
        "module_name": "swarm",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SchemaCallError, SwarmRow, call_with_schema, swarm",
        "requires": "none",
        "rollback": "Revert this file; structured fan-out reverts to prior sidecar behavior. Model I/O is via the injected CallFn, not this module.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Schema-validated parallel fan-out with confidence-gated escalation \u2014 call_with_schema (validated JSON CallFn invocation with retries) and swarm (batched fan-out routing low-confidence rows to an optional critic); aimmh-CallFn-shaped sidecar.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/swarm.py",
      "id": "a0_service_swarm"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_try_parse_json_array, _filter_valid_claims",
        "module_kind": "service",
        "module_name": "tool_distill",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "set_caller_provider, get_caller_provider, reset_caller_provider, flat_truncate, maybe_summarize",
        "requires": "a0_service_energy_registry, a0_service_inference",
        "rollback": "Revert this file; oversized tool outputs fall back to flat truncation without a model pass.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Tool-result distillation runner \u2014 wraps oversized tool outputs in a soft (paraphrase) or hard (verbatim+citation) summarization pass through the active energy provider, with caller-provider ContextVar plumbing.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/tool_distill.py",
      "id": "a0_service_tool_distill"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_parse_frontmatter, _discover_distiller_specs, _pick_distiller, _get_distiller_spec, _discover_a0_skills, _score_skill_match, _skill_recommend, _skill_load",
        "module_kind": "service",
        "module_name": "tool_executor",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "set_allowed_tools, reset_allowed_tools, get_active_chat_schemas, get_active_responses_schemas, get_a0_skill_manifest, get_a0_skill_body, TOOL_SCHEMAS_CHAT, TOOL_SCHEMAS_RESPONSES, execute_tool",
        "requires": "a0_service_tool_distill",
        "rollback": "Revert this file; falls back to the tools registry dispatcher directly.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "Thin shim over the per-tool registry \u2014 re-exports stable TOOL_SCHEMAS lists, wraps the dispatcher with call_id persistence and distiller summarization, and owns the distiller/a0 skill loaders and approval-scope ContextVar.",
        "tests": "tests/test_tools_registry.py",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/tool_executor.py",
      "id": "a0_service_tool_executor"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_validate_item",
        "module_kind": "service",
        "module_name": "_archive_wrap",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "none",
        "requires": "a0_service_artifacts",
        "rollback": "Revert this file; producing tools would return raw bytes without auto-archival.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Auto-archive wrapper for tools that declare a `produces` SCHEMA key \u2014 validates the {data,filename,mime,provenance} shape and routes the byte stream into the artifacts archive; underscore-named so the tool scanner skips it.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/_archive_wrap.py",
      "id": "a0_service_tools_archive_wrap"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "requires the active user to have granted the code_self_modify approval scope (admin tier); refuses to execute otherwise",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "bash_run",
        "network_boundary": "hmmm",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_run_context",
        "rollback": "Revert this file; shell-command self-modification capability is removed.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "bash_run tool \u2014 runs a shell command; the foundation for ZFAE self-modification, gated behind an explicit user grant of the code_self_modify approval scope and refusing otherwise.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/bash_run.py",
      "id": "a0_service_tools_bash_run"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "edcm_score",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_edcm, a0_engine_pcna",
        "rollback": "Revert this file; removes the edcm_score tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "edcm_score tool \u2014 returns the current EDCM ring coherence metrics (edcmbone-backed) for the active PCNA engine.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/edcm_score.py",
      "id": "a0_service_tools_edcm_score"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "gated behind the github_write approval scope",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "github_api",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the github_api tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "github_api tool \u2014 performs an authenticated GitHub REST call (method + endpoint + body) using the GITHUB_PAT, gated behind the github_write approval scope.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/github_api.py",
      "id": "a0_service_tools_github_api"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin tier, gated behind the code_self_modify approval scope",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "github_write_file",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_tools_github_api",
        "rollback": "Revert this file; removes the github_write_file tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "github_write_file tool \u2014 commits a single file to a repo via the GitHub Contents API; admin tier, gated behind the code_self_modify approval scope.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/github_write_file.py",
      "id": "a0_service_tools_github_write_file"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "image_generate",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the image_generate tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "image_generate tool \u2014 generates an image via Google Imagen and returns a produces-shaped payload so the archive wrapper persists it through the artifacts pipeline.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/image_generate.py",
      "id": "a0_service_tools_image_generate"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "scoped to the active approval-scope user id; mutates that user's granted scopes",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "manage_approval_scope",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_tool_executor",
        "rollback": "Revert this file; removes the manage_approval_scope tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "manage_approval_scope tool \u2014 grants, revokes, or lists pre-approved action scopes for the active user, persisting them so future gated tools can run without re-prompting.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/manage_approval_scope.py",
      "id": "a0_service_tools_manage_approval_scope"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "memory_flush",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_engine_pcna",
        "rollback": "Revert this file; removes the memory_flush tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "memory_flush tool \u2014 persists the active PCNA memory seeds to checkpoint on demand.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/memory_flush.py",
      "id": "a0_service_tools_memory_flush"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "pcna_infer",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_engine_pcna",
        "rollback": "Revert this file; removes the pcna_infer tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "pcna_infer tool \u2014 runs a scalar signal through the active PCNA tensor engine and returns the inference result (winner + coherence).",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/pcna_infer.py",
      "id": "a0_service_tools_pcna_infer"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "pcna_reward",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_engine_pcna",
        "rollback": "Revert this file; removes the pcna_reward tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "pcna_reward tool \u2014 applies a reward signal (score + reason) to the active PCNA engine's reward backprop, targeting the primary core or a sub-agent's forked core.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/pcna_reward.py",
      "id": "a0_service_tools_pcna_reward"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "gated behind the publish approval scope",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "post_tweet",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the post_tweet tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "post_tweet tool \u2014 posts a tweet (optionally a reply) to X via OAuth 1.0a-signed requests; gated behind the publish approval scope.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/post_tweet.py",
      "id": "a0_service_tools_post_tweet"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin tier required to set another user's tier",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "set_user_tier",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the set_user_tier tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "set_user_tier tool \u2014 admin-only override that writes a user's tier (free/supporter/ws/admin) directly to the DB.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/set_user_tier.py",
      "id": "a0_service_tools_set_user_tier"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "sub_agent_merge",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_run_logger, a0_service_artifacts",
        "rollback": "Revert this file; removes the sub_agent_merge tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "sub_agent_merge tool \u2014 merges a sub-agent's PCNA ring state back into the parent, archives its run log stream as a JSONL artifact, and marks the agent_runs row merged.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/sub_agent_merge.py",
      "id": "a0_service_tools_sub_agent_merge"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "sub_agent_spawn",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_run_context, a0_service_run_logger, a0_service_spawn_caps",
        "rollback": "Revert this file; removes the sub_agent_spawn tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "sub_agent_spawn tool \u2014 forks a ZFAE sub-agent for a parallel task, enforcing depth/fanout caps and writing a fresh agent_runs row (with inherited run scope) that the spawn executor later picks up.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/sub_agent_spawn.py",
      "id": "a0_service_tools_sub_agent_spawn"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_make_call_fn",
        "module_kind": "service",
        "module_name": "swarm_classify",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "a0_service_swarm, a0_service_inference",
        "rollback": "Revert this file; removes the swarm_classify tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "swarm_classify tool \u2014 wraps the swarm sidecar into a self-declaring tool for schema-validated parallel fan-out over many items (sort/tag/extract/route) with cheap producers and an optional critic.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/tools/swarm_classify.py",
      "id": "a0_service_tools_swarm_classify"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "service",
        "module_name": "tool_result_fetch",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the tool_result_fetch tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "read",
        "summary": "tool_result_fetch tool \u2014 reads a chunk (by call_id + offset) of a previously persisted oversized tool result from storage.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "read"
      },
      "file": "python/services/tools/tool_result_fetch.py",
      "id": "a0_service_tools_tool_result_fetch"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "none",
        "module_kind": "adapter",
        "module_name": "web_search",
        "network_boundary": "external",
        "owner": "Erin Spencer",
        "public_surface": "SCHEMA, handle",
        "requires": "none",
        "rollback": "Revert this file; removes the web_search tool from the registry.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "web_search tool \u2014 performs a DuckDuckGo instant-answer lookup for a query and returns the result text.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/tools/web_search.py",
      "id": "a0_service_tools_web_search"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_slugify, _strip_html, _pdf_to_text, _json_to_transcript, _ingest_zip",
        "module_kind": "service",
        "module_name": "transcript_ingest",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "extract_text, ingest_upload",
        "requires": "a0_service_edcm",
        "rollback": "Revert this file; transcript ingestion reverts to prior parser/persistence behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "write",
        "summary": "Transcript ingestion driver \u2014 auto-detects upload format, normalizes to SPEAKER:text, scores via compute_transcript_full, and persists report/messages/source/upload rows; raises (and marks upload error) on any failure.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "write"
      },
      "file": "python/services/transcript_ingest.py",
      "id": "a0_service_transcript_ingest"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_classify",
        "module_kind": "service",
        "module_name": "zeta_observe",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "observe_coherence, observe_sentinel_seeds",
        "requires": "none",
        "rollback": "Revert this file; zeta observation summaries revert to prior behavior.",
        "rollout": "default_enabled",
        "since": "2026-06-02",
        "storage_boundary": "none",
        "summary": "Zeta observation helpers \u2014 derive coherence and sentinel-seed observation summaries from a PCNA state dict / engine and classify coherence into bands.",
        "tests": "hmmm",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/services/zeta_observe.py",
      "id": "a0_service_zeta_observe"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.chat.test_create_anonymous_owner_null",
        "class": "security",
        "given": "POST /api/v1/conversations with no x-user-id header",
        "then": "row lands with user_id=NULL (owner_user_id kwarg defaults to"
      },
      "file": "python/storage/core.py",
      "id": "storage_anonymous_owner_null"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "call": "python.tests.contracts.chat.test_create_owner_isolation",
        "class": "security",
        "given": "create_conversation called via POST /api/v1/conversations with",
        "then": "stored row.user_id == \"legit\"; smuggled value is dropped by"
      },
      "file": "python/storage/core.py",
      "id": "storage_create_owner_isolation"
    }
  ],
  "edges": [
    {
      "from": "agent_lifecycle_count_live_for_parent_filters",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "agent_lifecycle_count_live_for_parent_filters",
      "to": "python.tests.contracts.spawn_executor.test_count_live_for_parent_filters"
    },
    {
      "from": "agent_lifecycle_registry_is_singleton",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "agent_lifecycle_registry_is_singleton",
      "to": "python.tests.contracts.spawn_executor.test_registry_is_singleton"
    },
    {
      "from": "billing_webhook_replay_idempotent",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "billing_webhook_replay_idempotent",
      "to": "python.tests.contracts.billing.test_webhook_replay_is_idempotent"
    },
    {
      "from": "chat_delete_other_owner_404",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "chat_delete_other_owner_404",
      "to": "python.tests.contracts.chat.test_delete_other_owner_404"
    },
    {
      "from": "chat_get_other_owner_404",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "chat_get_other_owner_404",
      "to": "python.tests.contracts.chat.test_get_other_owner_404"
    },
    {
      "from": "chat_unknown_body_model_400",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "chat_unknown_body_model_400",
      "to": "python.tests.contracts.chat.test_unknown_body_model_400"
    },
    {
      "from": "explainer_402_when_no_credits",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_402_when_no_credits",
      "to": "python.tests.contracts.transcripts_explainer.test_no_credits_returns_none"
    },
    {
      "from": "explainer_call_surfaces_in_learning_summary",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_call_surfaces_in_learning_summary",
      "to": "python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary"
    },
    {
      "from": "explainer_decrements_free_first",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_decrements_free_first",
      "to": "python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid"
    },
    {
      "from": "explainer_explanation_is_idempotent",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_explanation_is_idempotent",
      "to": "python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge"
    },
    {
      "from": "explainer_refund_restores_balance",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_refund_restores_balance",
      "to": "python.tests.contracts.transcripts_explainer.test_refund_after_failure"
    },
    {
      "from": "explainer_rejects_fabricated_citations",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "explainer_rejects_fabricated_citations",
      "to": "python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations"
    },
    {
      "from": "gating_allowlist_entries_are_real_routes",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "gating_allowlist_entries_are_real_routes",
      "to": "python.tests.contracts.gating.test_allowlist_entries_correspond_to_real_routes"
    },
    {
      "from": "gating_every_write_route_is_admin_or_allowlisted",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "gating_every_write_route_is_admin_or_allowlisted",
      "to": "python.tests.contracts.gating.test_every_write_route_is_gated_or_allowlisted"
    },
    {
      "from": "gating_instrument_files_all_writes_gated",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "gating_instrument_files_all_writes_gated",
      "to": "python.tests.contracts.gating.test_instrument_mutation_files_have_all_writes_gated"
    },
    {
      "from": "gating_instrument_files_never_allowlisted",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "gating_instrument_files_never_allowlisted",
      "to": "python.tests.contracts.gating.test_instrument_mutation_files_are_never_allowlisted"
    },
    {
      "from": "routes_doc_blocks_complete",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "routes_doc_blocks_complete",
      "to": "python.tests.contracts.module_doctrine.test_route_doc_blocks_are_complete"
    },
    {
      "from": "routes_files_annotated",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "routes_files_annotated",
      "to": "python.tests.contracts.module_doctrine.test_route_files_are_annotated"
    },
    {
      "from": "routes_routers_registered",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "routes_routers_registered",
      "to": "python.tests.contracts.module_doctrine.test_router_defining_files_are_registered"
    },
    {
      "from": "routes_write_endpoints_gated",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "routes_write_endpoints_gated",
      "to": "python.tests.contracts.route_gating.test_every_write_route_is_gated"
    },
    {
      "from": "spawn_executor_claim_atomic",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_claim_atomic",
      "to": "python.tests.contracts.spawn_executor.test_claim_atomic"
    },
    {
      "from": "spawn_executor_concurrent_live_cap",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_concurrent_live_cap",
      "to": "python.tests.contracts.spawn_executor.test_concurrent_live_cap"
    },
    {
      "from": "spawn_executor_heartbeat_advances",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_heartbeat_advances",
      "to": "python.tests.contracts.spawn_executor.test_heartbeat_advances"
    },
    {
      "from": "spawn_executor_marks_failed_on_exception",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_marks_failed_on_exception",
      "to": "python.tests.contracts.spawn_executor.test_marks_failed_on_exception"
    },
    {
      "from": "spawn_executor_merge_helpers_tolerate_no_pcna",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_merge_helpers_tolerate_no_pcna",
      "to": "python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna"
    },
    {
      "from": "spawn_executor_no_orphan_invariant",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_no_orphan_invariant",
      "to": "python.tests.contracts.spawn_executor.test_no_orphan_invariant"
    },
    {
      "from": "spawn_executor_resolve_provider_rejects_empty",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_resolve_provider_rejects_empty",
      "to": "python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty"
    },
    {
      "from": "spawn_executor_retry_default_none",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_retry_default_none",
      "to": "python.tests.contracts.spawn_executor.test_retry_default_none"
    },
    {
      "from": "spawn_executor_retry_once_on_transient",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_retry_once_on_transient",
      "to": "python.tests.contracts.spawn_executor.test_retry_once_on_transient"
    },
    {
      "from": "spawn_executor_skips_non_running",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_skips_non_running",
      "to": "python.tests.contracts.spawn_executor.test_skips_non_running"
    },
    {
      "from": "spawn_executor_snapshot_pcna_shape",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_snapshot_pcna_shape",
      "to": "python.tests.contracts.spawn_executor.test_snapshot_pcna_shape"
    },
    {
      "from": "spawn_executor_stale_sweep_marks_worker_lost",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "spawn_executor_stale_sweep_marks_worker_lost",
      "to": "python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost"
    },
    {
      "from": "storage_anonymous_owner_null",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "storage_anonymous_owner_null",
      "to": "python.tests.contracts.chat.test_create_anonymous_owner_null"
    },
    {
      "from": "storage_create_owner_isolation",
      "kind": "calls",
      "source_block": "CONTRACTS",
      "source_id": "storage_create_owner_isolation",
      "to": "python.tests.contracts.chat.test_create_owner_isolation"
    },
    {
      "from": "a0_engine_memory_core",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_memory_core",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_memory_core",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_memory_core",
      "to": "none"
    },
    {
      "from": "a0_engine_merge",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_merge",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_merge",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_merge",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_engine_merge",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_merge",
      "to": "a0_engine_ptca_core"
    },
    {
      "from": "a0_engine_merge",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_merge",
      "to": "a0_engine_theta"
    },
    {
      "from": "a0_engine_module_graph",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_module_graph",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_module_graph",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_module_graph",
      "to": "none"
    },
    {
      "from": "a0_engine_pcna",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_pcna",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_pcna",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_pcna",
      "to": "a0_engine_memory_core"
    },
    {
      "from": "a0_engine_pcna",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_pcna",
      "to": "a0_engine_ptca_core"
    },
    {
      "from": "a0_engine_pcna",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_pcna",
      "to": "a0_engine_theta"
    },
    {
      "from": "a0_engine_prime_seeds",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_prime_seeds",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_prime_seeds",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_prime_seeds",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_engine_prime_seeds",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_prime_seeds",
      "to": "a0_engine_ptca_core"
    },
    {
      "from": "a0_engine_ptca_core",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ptca_core",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ptca_core",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ptca_core",
      "to": "none"
    },
    {
      "from": "a0_engine_sigma",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_sigma",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_sigma",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_sigma",
      "to": "none"
    },
    {
      "from": "a0_engine_theta",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_theta",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_theta",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_theta",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_audit",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_audit",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_audit",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_audit",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_coherence_primes",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_coherence_primes",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_coherence_primes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_coherence_primes",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_disk_flip",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_disk_flip",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_disk_flip",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_disk_flip",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_encoder",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_encoder",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_encoder",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_encoder",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_orchestrator",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_orchestrator",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_orchestrator",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_orchestrator",
      "to": "a0_engine_ucns_kit_pool"
    },
    {
      "from": "a0_engine_ucns_kit_pool",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_pool",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_pool",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_pool",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_protocols",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_protocols",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_protocols",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_protocols",
      "to": "none"
    },
    {
      "from": "a0_engine_ucns_kit_theta_gate",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_theta_gate",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_ucns_kit_theta_gate",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_ucns_kit_theta_gate",
      "to": "none"
    },
    {
      "from": "a0_engine_zeta",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_zeta",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_engine_zeta",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_zeta",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_engine_zeta",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_engine_zeta",
      "to": "a0_service_edcm"
    },
    {
      "from": "a0_service_agent_instance",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_instance",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_agent_instance",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_instance",
      "to": "a0_service_call_fn"
    },
    {
      "from": "a0_service_agent_instance",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_instance",
      "to": "a0_service_model_catalog"
    },
    {
      "from": "a0_service_agent_lifecycle",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_lifecycle",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_agent_lifecycle",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_lifecycle",
      "to": "a0_engine_merge"
    },
    {
      "from": "a0_service_agent_lifecycle",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_agent_lifecycle",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_artifacts",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_artifacts",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_artifacts",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_artifacts",
      "to": "none"
    },
    {
      "from": "a0_service_attachments",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_attachments",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_attachments",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_attachments",
      "to": "none"
    },
    {
      "from": "a0_service_bg_tasks",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_bg_tasks",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_bg_tasks",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_bg_tasks",
      "to": "none"
    },
    {
      "from": "a0_service_call_fn",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_call_fn",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_call_fn",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_call_fn",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_call_fn",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_call_fn",
      "to": "a0_service_model_catalog"
    },
    {
      "from": "a0_service_cut_modes",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_cut_modes",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_cut_modes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_cut_modes",
      "to": "none"
    },
    {
      "from": "a0_service_edcm",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_edcm",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_edcm",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_edcm",
      "to": "none"
    },
    {
      "from": "a0_service_edcmbone_explainer",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_edcmbone_explainer",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_edcmbone_explainer",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_edcmbone_explainer",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_editable_registry",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_editable_registry",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_editable_registry",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_editable_registry",
      "to": "none"
    },
    {
      "from": "a0_service_energy_registry",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_energy_registry",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_energy_registry",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_energy_registry",
      "to": "none"
    },
    {
      "from": "a0_service_gating",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gating",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_gating",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gating",
      "to": "none"
    },
    {
      "from": "a0_service_gating_allowlist",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gating_allowlist",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_gating_allowlist",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gating_allowlist",
      "to": "none"
    },
    {
      "from": "a0_service_gemini_native",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gemini_native",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_gemini_native",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_gemini_native",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_heartbeat",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_heartbeat",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_heartbeat",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_heartbeat",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_inference",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_inference",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference",
      "to": "a0_service_attachments"
    },
    {
      "from": "a0_service_inference",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_inference",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference",
      "to": "a0_service_prompt_assembly"
    },
    {
      "from": "a0_service_inference",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_inference_modes",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference_modes",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_inference_modes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference_modes",
      "to": "a0_service_cut_modes"
    },
    {
      "from": "a0_service_inference_modes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference_modes",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_inference_modes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference_modes",
      "to": "a0_service_orch_progress"
    },
    {
      "from": "a0_service_inference_modes",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_inference_modes",
      "to": "a0_service_run_logger"
    },
    {
      "from": "a0_service_interdependent_bootstrap",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_interdependent_bootstrap",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_interdependent_bootstrap",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_interdependent_bootstrap",
      "to": "none"
    },
    {
      "from": "a0_service_model_catalog",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_model_catalog",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_model_catalog",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_model_catalog",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_openai_router",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_openai_router",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_openai_router",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_openai_router",
      "to": "none"
    },
    {
      "from": "a0_service_orch_progress",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_orch_progress",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_orch_progress",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_orch_progress",
      "to": "none"
    },
    {
      "from": "a0_service_prompt_assembly",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_prompt_assembly",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_prompt_assembly",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_prompt_assembly",
      "to": "a0_engine_prime_seeds"
    },
    {
      "from": "a0_service_providers_claude",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_claude",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_providers_claude",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_claude",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_providers_claude",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_claude",
      "to": "a0_service_providers_resolver"
    },
    {
      "from": "a0_service_providers_claude",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_claude",
      "to": "a0_service_tool_distill"
    },
    {
      "from": "a0_service_providers_claude",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_claude",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_providers_gemini",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_gemini",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_providers_gemini",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_gemini",
      "to": "a0_service_gemini_native"
    },
    {
      "from": "a0_service_providers_gemini",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_gemini",
      "to": "a0_service_providers_resolver"
    },
    {
      "from": "a0_service_providers_openai",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_openai",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_providers_openai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_openai",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_providers_openai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_openai",
      "to": "a0_service_providers_resolver"
    },
    {
      "from": "a0_service_providers_openai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_openai",
      "to": "a0_service_tool_distill"
    },
    {
      "from": "a0_service_providers_openai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_openai",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_providers_resolver",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_resolver",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_providers_resolver",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_resolver",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_providers_resolver"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_run_context"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_tool_distill"
    },
    {
      "from": "a0_service_providers_xai",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_providers_xai",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_research",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_research",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_research",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_research",
      "to": "none"
    },
    {
      "from": "a0_service_run_context",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_run_context",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_run_context",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_run_context",
      "to": "none"
    },
    {
      "from": "a0_service_run_logger",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_run_logger",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_run_logger",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_run_logger",
      "to": "a0_service_run_context"
    },
    {
      "from": "a0_service_slot_locks",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_slot_locks",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_slot_locks",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_slot_locks",
      "to": "none"
    },
    {
      "from": "a0_service_spawn_caps",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_caps",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_spawn_caps",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_caps",
      "to": "none"
    },
    {
      "from": "a0_service_spawn_db",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_db",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_spawn_db",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_db",
      "to": "none"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_agent_instance"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_run_context"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_run_logger"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_spawn_db"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_spawn_pcna"
    },
    {
      "from": "a0_service_spawn_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_executor",
      "to": "a0_service_spawn_sweep"
    },
    {
      "from": "a0_service_spawn_pcna",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_pcna",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_spawn_pcna",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_pcna",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_spawn_sweep",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_sweep",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_spawn_sweep",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_spawn_sweep",
      "to": "none"
    },
    {
      "from": "a0_service_stripe_service",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_stripe_service",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_stripe_service",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_stripe_service",
      "to": "none"
    },
    {
      "from": "a0_service_swarm",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_swarm",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_swarm",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_swarm",
      "to": "none"
    },
    {
      "from": "a0_service_tool_distill",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tool_distill",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tool_distill",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tool_distill",
      "to": "a0_service_energy_registry"
    },
    {
      "from": "a0_service_tool_distill",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tool_distill",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_tool_executor",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tool_executor",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tool_executor",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tool_executor",
      "to": "a0_service_tool_distill"
    },
    {
      "from": "a0_service_tools_archive_wrap",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_archive_wrap",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_archive_wrap",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_archive_wrap",
      "to": "a0_service_artifacts"
    },
    {
      "from": "a0_service_tools_bash_run",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_bash_run",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_bash_run",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_bash_run",
      "to": "a0_service_run_context"
    },
    {
      "from": "a0_service_tools_edcm_score",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_edcm_score",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_edcm_score",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_edcm_score",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_tools_edcm_score",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_edcm_score",
      "to": "a0_service_edcm"
    },
    {
      "from": "a0_service_tools_github_api",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_github_api",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_github_api",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_github_api",
      "to": "none"
    },
    {
      "from": "a0_service_tools_github_write_file",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_github_write_file",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_github_write_file",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_github_write_file",
      "to": "a0_service_tools_github_api"
    },
    {
      "from": "a0_service_tools_image_generate",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_image_generate",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_image_generate",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_image_generate",
      "to": "none"
    },
    {
      "from": "a0_service_tools_manage_approval_scope",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_manage_approval_scope",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_manage_approval_scope",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_manage_approval_scope",
      "to": "a0_service_tool_executor"
    },
    {
      "from": "a0_service_tools_memory_flush",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_memory_flush",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_memory_flush",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_memory_flush",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_tools_pcna_infer",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_pcna_infer",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_pcna_infer",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_pcna_infer",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_tools_pcna_reward",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_pcna_reward",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_pcna_reward",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_pcna_reward",
      "to": "a0_engine_pcna"
    },
    {
      "from": "a0_service_tools_post_tweet",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_post_tweet",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_post_tweet",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_post_tweet",
      "to": "none"
    },
    {
      "from": "a0_service_tools_set_user_tier",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_set_user_tier",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_set_user_tier",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_set_user_tier",
      "to": "none"
    },
    {
      "from": "a0_service_tools_sub_agent_merge",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_merge",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_sub_agent_merge",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_merge",
      "to": "a0_service_artifacts"
    },
    {
      "from": "a0_service_tools_sub_agent_merge",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_merge",
      "to": "a0_service_run_logger"
    },
    {
      "from": "a0_service_tools_sub_agent_spawn",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_spawn",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_sub_agent_spawn",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_spawn",
      "to": "a0_service_run_context"
    },
    {
      "from": "a0_service_tools_sub_agent_spawn",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_spawn",
      "to": "a0_service_run_logger"
    },
    {
      "from": "a0_service_tools_sub_agent_spawn",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_sub_agent_spawn",
      "to": "a0_service_spawn_caps"
    },
    {
      "from": "a0_service_tools_swarm_classify",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_swarm_classify",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_swarm_classify",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_swarm_classify",
      "to": "a0_service_inference"
    },
    {
      "from": "a0_service_tools_swarm_classify",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_swarm_classify",
      "to": "a0_service_swarm"
    },
    {
      "from": "a0_service_tools_tool_result_fetch",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_tool_result_fetch",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_tool_result_fetch",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_tool_result_fetch",
      "to": "none"
    },
    {
      "from": "a0_service_tools_web_search",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_web_search",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_tools_web_search",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_tools_web_search",
      "to": "none"
    },
    {
      "from": "a0_service_transcript_ingest",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_transcript_ingest",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_transcript_ingest",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_transcript_ingest",
      "to": "a0_service_edcm"
    },
    {
      "from": "a0_service_zeta_observe",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_zeta_observe",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_service_zeta_observe",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_service_zeta_observe",
      "to": "none"
    }
  ],
  "gaps": [],
  "repo": "a0",
  "source_commit": "51837a6"
});
