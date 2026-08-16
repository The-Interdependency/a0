import { defineMsdmdCollection } from "./.agents/skills/msdmd/collection";

export default defineMsdmdCollection({
  "declarations": [
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "network_boundary": "internal",
        "owner": "database-owner",
        "pii": "possible",
        "review_required": "database-owner",
        "secrets": "read",
        "side_effects": "explicit migration commands only",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "Opens the configured PostgreSQL database only for explicit Alembic commands and wraps supported DDL in transactions.",
        "user_data_boundary": "write"
      },
      "file": "migrations/env.py",
      "id": "alembic_environment_migration_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "a migration command runs while the legacy schema has no complete metadata authority",
        "since": "2026-08-05",
        "then": "Alembic uses transactional PostgreSQL DDL and refuses autogeneration rather than inferring a partial schema"
      },
      "file": "migrations/env.py",
      "id": "alembic_environment_explicit_transactional_only"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "internal_surface": "_database_url, run_migrations_offline, run_migrations_online",
        "module_kind": "migration",
        "module_name": "alembic_environment",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "alembic offline and online migration execution",
        "requires": "a0_schema_inventory, a0_live_schema_capture",
        "rollback": "remove the Alembic environment before any revision is applied",
        "rollout": "invoked with alembic -c albm_conf_file_v0.0.0alpha.ini",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "Configures transactional PostgreSQL migrations while refusing unsafe autogeneration against incomplete legacy metadata.",
        "tests": "python/tests/test_schema_migration_foundation.py",
        "unresolved": "complete target_metadata is intentionally absent until the captured legacy baseline is reconciled",
        "user_data_boundary": "write"
      },
      "file": "migrations/env.py",
      "id": "a0_alembic_environment"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "network_boundary": "internal",
        "owner": "database-owner",
        "pii": "none",
        "review_required": "database-owner",
        "secrets": "none",
        "side_effects": "creates all legacy schema objects in the target database",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "Reads the committed SQL artifact, verifies its digest, and issues multi-statement DDL through the Alembic-managed connection; never reads table data, writes rows, or drops objects.",
        "user_data_boundary": "write"
      },
      "file": "migrations/versions/lega_schm_base_v0.0.0alpha.py",
      "id": "legacy_schema_baseline_revision_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "the SQL artifact on disk",
        "since": "2026-08-05",
        "then": "upgrade() verifies SHA-256 matches the value pinned at review time and raises RuntimeError on any mismatch before touching the database"
      },
      "file": "migrations/versions/lega_schm_base_v0.0.0alpha.py",
      "id": "legacy_schema_baseline_digest_locked"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "any caller invoking downgrade()",
        "since": "2026-08-05",
        "then": "NotImplementedError is raised immediately and no DDL is executed"
      },
      "file": "migrations/versions/lega_schm_base_v0.0.0alpha.py",
      "id": "legacy_schema_baseline_downgrade_closed"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "an empty PostgreSQL database with no prior schema",
        "since": "2026-08-05",
        "then": "upgrade() creates the full reviewed object set and leaves no orphan psql metacommands in the executed SQL"
      },
      "file": "migrations/versions/lega_schm_base_v0.0.0alpha.py",
      "id": "legacy_schema_baseline_empty_apply"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "internal_surface": "upgrade, downgrade, _CAPTURE_SHA256, _SQL_PATH",
        "module_kind": "migration",
        "module_name": "legacy_schema_baseline_revision",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "alembic upgrade head",
        "requires": "a0_alembic_environment, a0_live_schema_capture, a0_schema_baseline_review",
        "rollback": "restore-point recovery only; downgrade() is intentionally closed",
        "rollout": "alembic upgrade head against an empty or archive-stamped database",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "First Alembic revision; applies the reviewed, digest-locked pg_dump baseline to an empty database with no downgrade path.",
        "tests": "python/tests/test_schema_baseline_revision.py",
        "unresolved": "live apply blocked until a restore-point identifier is recorded",
        "user_data_boundary": "write"
      },
      "file": "migrations/versions/lega_schm_base_v0.0.0alpha.py",
      "id": "a0_legacy_schema_baseline_revision"
    },
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
        "class": "correctness",
        "given": "a route file begins with a legacy N:M or full N:M C:D I:O annotation",
        "then": "collect_doc_meta exposes every available metric as an integer"
      },
      "file": "python/routes/__init__.py",
      "id": "routes_doc_annotation_metrics"
    },
    {
      "block": "CONTRACTS",
      "fields": {
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
        "class": "correctness",
        "given": "POST /api/v1/conversations/{id}/messages with body.model that",
        "then": "400 with a detail naming the unknown id (no silent fallback to"
      },
      "file": "python/routes/chat.py",
      "id": "chat_unknown_body_model_400"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "network_boundary": "internal",
        "owner": "platform-runtime",
        "pii": "none",
        "review_required": "platform-runtime",
        "secrets": "none",
        "side_effects": "none",
        "since": "2026-08-04",
        "storage_boundary": "read",
        "summary": "Returns process and dependency health without exposing secrets, provider details, or user data.",
        "user_data_boundary": "none"
      },
      "file": "python/routes/runtime_readiness.py",
      "id": "runtime_readiness_route_boundary"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "live, ready",
        "module_kind": "route",
        "module_name": "runtime_readiness_route",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "GET /api/v1/runtime/live, GET /api/v1/runtime/ready",
        "requires": "a0_runtime_readiness",
        "rollback": "unregister the router",
        "rollout": "registered in python.routes.ALL_ROUTERS",
        "since": "2026-08-04",
        "storage_boundary": "read",
        "summary": "Exposes liveness and dependency-aware readiness for the complete a0 deployment unit.",
        "tests": "python.tests.test_runtime_readiness",
        "unresolved": "Replit health-check path configuration",
        "user_data_boundary": "none"
      },
      "file": "python/routes/runtime_readiness.py",
      "id": "a0_runtime_readiness_route"
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
        "tests": "python/tests/contracts/spawn_executor_checks.py",
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
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "network_boundary": "internal",
        "owner": "platform-runtime",
        "pii": "none",
        "review_required": "platform-runtime",
        "secrets": "read",
        "side_effects": "none",
        "since": "2026-08-04",
        "storage_boundary": "read",
        "summary": "Reads deployment configuration, probes PostgreSQL, and reads heartbeat status without returning secrets or user data.",
        "user_data_boundary": "none"
      },
      "file": "python/services/runtime_readiness.py",
      "id": "runtime_readiness_dependency_probe"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "security",
        "given": "configuration is missing or an internal dependency probe fails",
        "since": "2026-08-04",
        "then": "the report contains dependency names and exception types but no secret values, database details, exception messages, provider credentials, or user data"
      },
      "file": "python/services/runtime_readiness.py",
      "id": "runtime_readiness_redacts_sensitive_values"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "deployment configuration, PostgreSQL, and the heartbeat service are probed",
        "since": "2026-08-04",
        "then": "ready is true if and only if every declared dependency reports ok"
      },
      "file": "python/services/runtime_readiness.py",
      "id": "runtime_readiness_requires_every_dependency"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "_check_database, _check_heartbeat, _check_required_config",
        "module_kind": "service",
        "module_name": "runtime_readiness",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "build_readiness_report",
        "requires": "a0_service_heartbeat",
        "rollback": "unregister the readiness route and remove this service",
        "rollout": "consumed by the runtime readiness route",
        "since": "2026-08-04",
        "storage_boundary": "read",
        "summary": "Produces dependency-aware readiness reports for the complete a0 deployment unit without mutating runtime state.",
        "tests": "python.tests.test_runtime_readiness",
        "unresolved": "worker-leader lease is not yet part of readiness",
        "user_data_boundary": "none"
      },
      "file": "python/services/runtime_readiness.py",
      "id": "a0_runtime_readiness"
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
        "class": "security",
        "given": "create_conversation called via POST /api/v1/conversations with",
        "then": "stored row.user_id == \"legit\"; smuggled value is dropped by"
      },
      "file": "python/storage/core.py",
      "id": "storage_create_owner_isolation"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "an executable CHECK whose call exceeds its positive timeout",
        "since": "2026-08-05",
        "then": "_execute_check terminates the wait and reports ERROR rather than hanging or passing"
      },
      "file": "python/tests/contract_runner.py",
      "id": "contract_graph_enforces_declared_timeout"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "duplicate ids, missing required fields, source-owned call topology, unknown proves targets, contracts without witnesses, or calls that do not resolve by AST",
        "since": "2026-08-05",
        "then": "audit_graph reports visible gaps and the main runner executes no checks"
      },
      "file": "python/tests/contract_runner.py",
      "id": "contract_graph_rejects_incomplete_linkage"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "Declaration, audit_graph, _resolve_call_no_exec, _execute_check",
        "module_kind": "instrument",
        "module_name": "contract_graph_runner",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "python -m python.tests.contract_runner",
        "requires": "msdmd universal parser, test-build doctrine",
        "rollback": "restore the prior runner only with an explicit test-build doctrine exception",
        "rollout": "repository contract gate",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Audits source-owned CONTRACTS against test-owned CHECKS without executing imports, then runs only a closed evidence graph under declared timeouts.",
        "tests": "python/tests/test_contract_runner.py",
        "unresolved": "none",
        "user_data_boundary": "none"
      },
      "file": "python/tests/contract_runner.py",
      "id": "a0_contract_graph_runner"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_webhook_replay_is_idempotent",
        "cleanup": "unique_test_event_is_inert",
        "mutates": "db",
        "proves": "billing_webhook_replay_idempotent",
        "requires": "python3, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/billing.py",
      "id": "check_billing_webhook_replay_idempotent"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_delete_other_owner_404",
        "cleanup": "explicit_conversation_delete",
        "mutates": "db",
        "proves": "chat_delete_other_owner_404",
        "requires": "python3, running_test_server, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/chat.py",
      "id": "check_chat_delete_other_owner_404"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_get_other_owner_404",
        "cleanup": "explicit_conversation_delete",
        "mutates": "db",
        "proves": "chat_get_other_owner_404",
        "requires": "python3, running_test_server, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/chat.py",
      "id": "check_chat_get_other_owner_404"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_unknown_body_model_400",
        "cleanup": "explicit_conversation_delete",
        "mutates": "db",
        "proves": "chat_unknown_body_model_400",
        "requires": "python3, running_test_server, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/chat.py",
      "id": "check_chat_unknown_body_model_400"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_create_anonymous_owner_null",
        "cleanup": "explicit_database_delete",
        "mutates": "db",
        "proves": "storage_anonymous_owner_null",
        "requires": "python3, running_test_server, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/chat.py",
      "id": "check_storage_anonymous_owner_null"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_create_owner_isolation",
        "cleanup": "explicit_conversation_delete",
        "mutates": "db",
        "proves": "storage_create_owner_isolation",
        "requires": "python3, running_test_server, postgres",
        "timeout": "30"
      },
      "file": "python/tests/contracts/chat.py",
      "id": "check_storage_create_owner_isolation"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_allowlist_entries_correspond_to_real_routes",
        "cleanup": "none",
        "mutates": "none",
        "proves": "gating_allowlist_entries_are_real_routes",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/gating.py",
      "id": "check_gating_allowlist_real_routes"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_every_write_route_is_gated_or_allowlisted",
        "cleanup": "none",
        "mutates": "none",
        "proves": "gating_every_write_route_is_admin_or_allowlisted",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/gating.py",
      "id": "check_gating_every_write_route"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_instrument_mutation_files_have_all_writes_gated",
        "cleanup": "none",
        "mutates": "none",
        "proves": "gating_instrument_files_all_writes_gated",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/gating.py",
      "id": "check_gating_forbidden_files_all_gated"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_instrument_mutation_files_are_never_allowlisted",
        "cleanup": "none",
        "mutates": "none",
        "proves": "gating_instrument_files_never_allowlisted",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/gating.py",
      "id": "check_gating_forbidden_files_never_allowlisted"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_doc_annotation_metrics_parse",
        "cleanup": "none",
        "mutates": "none",
        "proves": "routes_doc_annotation_metrics",
        "requires": "python3",
        "timeout": "20"
      },
      "file": "python/tests/contracts/module_doctrine.py",
      "id": "check_routes_doc_annotation_metrics"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_route_doc_blocks_are_complete",
        "cleanup": "none",
        "mutates": "none",
        "proves": "routes_doc_blocks_complete",
        "requires": "python3",
        "timeout": "20"
      },
      "file": "python/tests/contracts/module_doctrine.py",
      "id": "check_routes_doc_blocks_complete"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_route_files_are_annotated",
        "cleanup": "none",
        "mutates": "none",
        "proves": "routes_files_annotated",
        "requires": "python3",
        "timeout": "20"
      },
      "file": "python/tests/contracts/module_doctrine.py",
      "id": "check_routes_files_annotated"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_router_defining_files_are_registered",
        "cleanup": "none",
        "mutates": "none",
        "proves": "routes_routers_registered",
        "requires": "python3",
        "timeout": "20"
      },
      "file": "python/tests/contracts/module_doctrine.py",
      "id": "check_routes_routers_registered"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_every_write_route_is_gated",
        "cleanup": "none",
        "mutates": "none",
        "proves": "routes_write_endpoints_gated",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/route_gating.py",
      "id": "check_routes_write_endpoints_gated"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_count_live_for_parent_filters",
        "cleanup": "explicit_registry_pop",
        "mutates": "process_registry",
        "proves": "agent_lifecycle_count_live_for_parent_filters",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_agent_lifecycle_parent_filter"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_registry_is_singleton",
        "cleanup": "none",
        "mutates": "none",
        "proves": "agent_lifecycle_registry_is_singleton",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_agent_lifecycle_registry_singleton"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_claim_atomic",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_claim_atomic",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_claim_atomic"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_concurrent_live_cap",
        "cleanup": "explicit_registry_pop",
        "mutates": "process_registry, db_read",
        "proves": "spawn_executor_concurrent_live_cap",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_concurrent_live_cap"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna",
        "cleanup": "none",
        "mutates": "none",
        "proves": "spawn_executor_merge_helpers_tolerate_no_pcna",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_degraded_merge_helpers"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_heartbeat_advances",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_heartbeat_advances",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_heartbeat_advances"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_marks_failed_on_exception",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_marks_failed_on_exception",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_marks_failed"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_no_orphan_invariant",
        "cleanup": "explicit_registry_pop, explicit_run_delete",
        "mutates": "process_registry, db",
        "proves": "spawn_executor_no_orphan_invariant",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_no_orphan"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty",
        "cleanup": "none",
        "mutates": "none",
        "proves": "spawn_executor_resolve_provider_rejects_empty",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_rejects_empty_provider"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_retry_default_none",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_retry_default_none",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_retry_default_none"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_retry_once_on_transient",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_retry_once_on_transient",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_retry_once"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_skips_non_running",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_skips_non_running",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_skips_non_running"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_snapshot_pcna_shape",
        "cleanup": "ephemeral_object_release",
        "mutates": "process_memory",
        "proves": "spawn_executor_snapshot_pcna_shape",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_snapshot_shape"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost",
        "cleanup": "explicit_run_delete",
        "mutates": "db",
        "proves": "spawn_executor_stale_sweep_marks_worker_lost",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/spawn_executor_checks.py",
      "id": "check_spawn_executor_stale_sweep"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations",
        "cleanup": "none",
        "mutates": "none",
        "proves": "explainer_rejects_fabricated_citations",
        "requires": "python3",
        "timeout": "30"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_citation_integrity"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_no_credits_returns_none",
        "cleanup": "explicit_uuid_scoped_delete",
        "mutates": "db",
        "proves": "explainer_402_when_no_credits",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_empty_balance"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid",
        "cleanup": "explicit_uuid_scoped_delete",
        "mutates": "db",
        "proves": "explainer_decrements_free_first",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_free_before_paid"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge",
        "cleanup": "explicit_report_and_upload_delete",
        "mutates": "db",
        "proves": "explainer_explanation_is_idempotent",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_idempotent_report"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary",
        "cleanup": "explicit_provider_scoped_delete",
        "mutates": "db, process_log_buffer",
        "proves": "explainer_call_surfaces_in_learning_summary",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_learning_summary"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "python.tests.contracts.transcripts_explainer.test_refund_after_failure",
        "cleanup": "explicit_uuid_scoped_delete",
        "mutates": "db",
        "proves": "explainer_refund_restores_balance",
        "requires": "python3, postgres",
        "timeout": "60"
      },
      "file": "python/tests/contracts/transcripts_explainer_checks.py",
      "id": "check_transcript_explainer_refund"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_execute_check_enforces_timeout",
        "cleanup": "none",
        "mutates": "none",
        "proves": "contract_graph_enforces_declared_timeout",
        "requires": "python3",
        "timeout": "10"
      },
      "file": "python/tests/test_contract_runner.py",
      "id": "check_contract_graph_enforces_declared_timeout"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_audit_graph_rejects_incomplete_linkage",
        "cleanup": "none",
        "mutates": "none",
        "proves": "contract_graph_rejects_incomplete_linkage",
        "requires": "python3",
        "timeout": "10"
      },
      "file": "python/tests/test_contract_runner.py",
      "id": "check_contract_graph_rejects_incomplete_linkage"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_readiness_requires_all_dependencies",
        "cleanup": "patch_dict_restore",
        "mutates": "environment",
        "proves": "runtime_readiness_requires_every_dependency",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_runtime_readiness.py",
      "id": "check_runtime_readiness_all_dependencies"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_readiness_fails_closed_when_database_probe_fails",
        "cleanup": "patch_dict_restore",
        "mutates": "environment",
        "proves": "runtime_readiness_requires_every_dependency, runtime_readiness_redacts_sensitive_values",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_runtime_readiness.py",
      "id": "check_runtime_readiness_database_fail_closed"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_readiness_reports_missing_config_without_values",
        "cleanup": "patch_dict_restore",
        "mutates": "environment",
        "proves": "runtime_readiness_redacts_sensitive_values",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_runtime_readiness.py",
      "id": "check_runtime_readiness_redacts_configuration_values"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_review_requires_matching_digest",
        "cleanup": "pytest_tmp_path",
        "mutates": "temporary_files",
        "proves": "schema_baseline_review_requires_matching_digest",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_baseline_review.py",
      "id": "check_schema_baseline_review_digest"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_review_reports_objects_and_preserves_drift",
        "cleanup": "pytest_tmp_path",
        "mutates": "temporary_files",
        "proves": "schema_baseline_review_reports_object_inventory, schema_baseline_review_preserves_drift",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_baseline_review.py",
      "id": "check_schema_baseline_review_inventory"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_review_rejects_unsafe_statement_classes",
        "cleanup": "pytest_tmp_path",
        "mutates": "temporary_files",
        "proves": "schema_baseline_review_rejects_data_and_authority_statements",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_baseline_review.py",
      "id": "check_schema_baseline_review_safety"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_evidence_cleanup_confirmed",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_baseline_harness_always_cleans_up",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_harness_cleanup_evidence"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_gate_a_evidence_confirms_pass",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_baseline_harness_gate_a_empty_apply",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_harness_gate_a_evidence"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_gate_b_evidence_confirms_pass",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_baseline_harness_gate_b_stamp_preservation",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_harness_gate_b_evidence"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_harness_refuses_non_loopback_url",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_baseline_harness_refuses_non_disposable",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_harness_refuses_non_disposable"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_harness_refuses_without_allow_flag",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_baseline_harness_refuses_non_disposable",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_harness_refuses_without_flag"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_upgrade_raises_on_digest_mismatch",
        "cleanup": "monkeypatch",
        "mutates": "temporary_files",
        "proves": "legacy_schema_baseline_digest_locked",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_revision_digest_locked"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_downgrade_raises_not_implemented",
        "cleanup": "none",
        "mutates": "none",
        "proves": "legacy_schema_baseline_downgrade_closed",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_revision_downgrade_closed"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_upgrade_strips_psql_metacommands",
        "cleanup": "monkeypatch",
        "mutates": "temporary_files",
        "proves": "legacy_schema_baseline_empty_apply",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_revision_metacommand_filter"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_sql_path_constant_resolves_to_committed_file",
        "cleanup": "none",
        "mutates": "none",
        "proves": "legacy_schema_baseline_digest_locked",
        "requires": "python3, pytest",
        "timeout": "10"
      },
      "file": "python/tests/test_schema_baseline_revision.py",
      "id": "check_baseline_revision_sql_path_resolvable"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_alembic_configuration_loads_without_database",
        "cleanup": "none",
        "mutates": "none",
        "proves": "alembic_environment_explicit_transactional_only",
        "requires": "python3, pytest, alembic",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_alembic_control_plane_loads"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_normalize_dump_removes_volatile_lines",
        "cleanup": "none",
        "mutates": "none",
        "proves": "live_schema_capture_is_deterministic",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_live_schema_capture_deterministic"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_capture_uses_read_only_pg_dump_flags_and_redacts_failure",
        "cleanup": "mock_patch_restore",
        "mutates": "process_mock, environment",
        "proves": "live_schema_capture_is_read_only, live_schema_capture_redacts_connection, live_schema_capture_decomposes_postgres_url",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_live_schema_capture_read_only"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_inventory_detects_and_checks_mutation_sites",
        "cleanup": "temporary_directory",
        "mutates": "temporary_files",
        "proves": "schema_inventory_reports_mutation_sites, schema_inventory_check_fails_on_unreviewed_mutation_site, schema_inventory_excludes_environment_vendor_trees",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_schema_inventory_mutation_sites"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_repository_inventory_exposes_legacy_drift",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_inventory_reports_three_authorities",
        "requires": "python3, pytest",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_schema_inventory_three_authorities"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_schema_status_failure_surface_is_bounded",
        "cleanup": "mock_patch_restore",
        "mutates": "process_mock",
        "proves": "schema_migration_status_bounds_failures",
        "requires": "python3, pytest, alembic",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_schema_migration_status_bounds_failures"
    },
    {
      "block": "CHECKS",
      "fields": {
        "call": "self::test_schema_status_requires_exact_nonempty_match",
        "cleanup": "none",
        "mutates": "none",
        "proves": "schema_migration_status_exact_set_match",
        "requires": "python3, pytest, alembic",
        "timeout": "20"
      },
      "file": "python/tests/test_schema_migration_foundation.py",
      "id": "check_schema_migration_status_exact_match"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "network_boundary": "internal",
        "owner": "database-owner",
        "pii": "none",
        "review_required": "database-owner",
        "secrets": "read",
        "side_effects": "local capture files only",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Connects to PostgreSQL through pg_dump in schema-only mode; writes local SQL and digest artifacts and executes no SQL.",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "live_schema_capture_database_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "a PostgreSQL URL with explicit host, port, credentials, database, sslmode, and channel_binding",
        "since": "2026-08-05",
        "then": "the child receives equivalent PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE, and PGCHANNELBINDING values without the URL appearing in argv"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "live_schema_capture_decomposes_postgres_url"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "equivalent pg_dump schema output with volatile header/completion lines",
        "since": "2026-08-05",
        "then": "normalized SQL and its SHA-256 digest are stable"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "live_schema_capture_is_deterministic"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "a valid PostgreSQL DATABASE_URL",
        "since": "2026-08-05",
        "then": "pg_dump is invoked with --schema-only, --no-owner, --no-privileges and no data-export option; no SQL is executed"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "live_schema_capture_is_read_only"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "security",
        "given": "DATABASE_URL contains user, password, host and query parameters plus unrelated deployment secrets",
        "since": "2026-08-05",
        "then": "the URL is absent from argv/output, only required libpq fields and allowlisted process variables reach the child, and failures expose only the pg_dump exit code"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "live_schema_capture_redacts_connection"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "internal_surface": "capture_schema, normalize_dump, _connection_env",
        "module_kind": "script",
        "module_name": "live_schema_capture",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "command line schema SQL and adjacent SHA-256 evidence",
        "requires": "a0_schema_inventory",
        "rollback": "delete generated capture artifacts; database state is unchanged",
        "rollout": "invoked manually after backup identity and client/server versions are recorded",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Captures deterministic schema-only PostgreSQL SQL and SHA-256 evidence without reading table rows or exposing the connection URL in process arguments.",
        "tests": "python/tests/test_schema_migration_foundation.py",
        "unresolved": "live capture has not yet been run against the archive-shaped production database",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_capt_live_v0.0.0alpha.py",
      "id": "a0_live_schema_capture"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "network_boundary": "none",
        "owner": "platform-runtime",
        "pii": "none",
        "review_required": "platform-runtime",
        "secrets": "none",
        "side_effects": "writes only the explicitly requested report file",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Reads repository text and reports schema declarations without opening a database or executing source.",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "schema_inventory_read_only_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "--check and a schema-mutating path exists outside the reviewed legacy allowlist or migrations directory",
        "since": "2026-08-05",
        "then": "the process exits nonzero and names the unreviewed path"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "schema_inventory_check_fails_on_unreviewed_mutation_site"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "Replit or Python dependency trees such as .cache, .pythonlibs, node_modules, or site-packages contain schema-like text",
        "since": "2026-08-05",
        "then": "inventory walks only declared first-party source roots and none of those vendor paths appear in authorities or mutation sites"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "schema_inventory_excludes_environment_vendor_trees"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "a first-party source file contains CREATE TABLE, ALTER TABLE, CREATE INDEX, DROP TABLE, createTableIfMissing, or db:push",
        "since": "2026-08-05",
        "then": "the file and mutation kinds appear in runtime_mutation_sites"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "schema_inventory_reports_mutation_sites"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "Drizzle declarations, SQLAlchemy models, and executable SQL exist in the repository",
        "since": "2026-08-05",
        "then": "the report lists each authority separately and exposes pairwise and runtime-only table drift"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "schema_inventory_reports_three_authorities"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "collect_inventory, parse_drizzle_tables, parse_sqlalchemy_tables, parse_sql_mutations",
        "module_kind": "script",
        "module_name": "schema_inventory",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "command line JSON report",
        "requires": "none",
        "rollback": "remove this script; it mutates no source or database state",
        "rollout": "invoked explicitly and by the migration-foundation gate",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Inventories table declarations and schema-mutating code paths across the three legacy schema authorities.",
        "tests": "python/tests/test_schema_migration_foundation.py",
        "unresolved": "parser is intentionally syntactic and does not interpret dynamically assembled SQL",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_invt_repo_v0.0.0alpha.py",
      "id": "a0_schema_inventory"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "read",
        "network_boundary": "internal",
        "owner": "database-owner",
        "pii": "none",
        "review_required": "database-owner",
        "secrets": "read",
        "side_effects": "none",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Reads only Alembic revision metadata and reports revision identifiers without exposing the database URL or exception messages.",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_migr_stat_v0.0.0alpha.py",
      "id": "schema_migration_status_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "security",
        "given": "configuration or database probing fails",
        "since": "2026-08-05",
        "then": "the report contains only an error type and never a database URL, password, host, or exception message"
      },
      "file": "scripts/sche_migr_stat_v0.0.0alpha.py",
      "id": "schema_migration_status_bounds_failures"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "repository heads and database current revisions",
        "since": "2026-08-05",
        "then": "at_head is true only when both non-empty revision sets are exactly equal"
      },
      "file": "scripts/sche_migr_stat_v0.0.0alpha.py",
      "id": "schema_migration_status_exact_set_match"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "read",
        "internal_surface": "expected_heads, current_heads, build_status",
        "module_kind": "script",
        "module_name": "schema_migration_status",
        "network_boundary": "internal",
        "owner": "Erin Spencer",
        "public_surface": "command line JSON status and exit code",
        "requires": "a0_alembic_environment",
        "rollback": "remove this script; it mutates no database state",
        "rollout": "release gate and later runtime readiness dependency",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Compares the database Alembic revision set with the repository heads and emits a bounded machine-readable status.",
        "tests": "python/tests/test_schema_migration_foundation.py",
        "unresolved": "runtime readiness integration follows the reviewed baseline revision",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_migr_stat_v0.0.0alpha.py",
      "id": "a0_schema_migration_status"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "network_boundary": "none",
        "owner": "database-owner",
        "pii": "none",
        "review_required": "database-owner",
        "secrets": "none",
        "side_effects": "writes only an explicitly requested local JSON report",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Reads captured SQL, digest evidence, and optional inventory JSON without executing SQL, opening a database, or exposing credentials.",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "schema_baseline_review_read_only_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "provenance",
        "given": "optional source inventory and captured live tables differ",
        "since": "2026-08-05",
        "then": "live_only and source_only tables remain visible and do not silently fail or disappear"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "schema_baseline_review_preserves_drift"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "security",
        "given": "captured SQL contains data movement, role/database creation, ownership, privileges, psql connection commands, or a database URL",
        "since": "2026-08-05",
        "then": "review fails and names only the unsafe statement class, not captured secret text"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "schema_baseline_review_rejects_data_and_authority_statements"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "safe schema-only PostgreSQL SQL",
        "since": "2026-08-05",
        "then": "tables, sequences, indexes, types, extensions, functions, triggers, and constraints are reported deterministically"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "schema_baseline_review_reports_object_inventory"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "integrity",
        "given": "captured SQL and adjacent or explicit SHA-256 evidence",
        "since": "2026-08-05",
        "then": "review succeeds only when the evidence digest exactly matches the SQL bytes"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "schema_baseline_review_requires_matching_digest"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "false",
        "auth_boundary": "none",
        "internal_surface": "review_capture, parse_objects, verify_digest, reject_unsafe_sql",
        "module_kind": "script",
        "module_name": "schema_baseline_review",
        "network_boundary": "none",
        "owner": "Erin Spencer",
        "public_surface": "command line JSON review report",
        "requires": "a0_schema_inventory, a0_live_schema_capture",
        "rollback": "remove this script; it mutates no repository or database state",
        "rollout": "required after schema capture and before a baseline revision is authored",
        "since": "2026-08-05",
        "storage_boundary": "read",
        "summary": "Verifies captured schema integrity and safety, inventories PostgreSQL objects, and exposes live-versus-source drift before baseline revision authoring.",
        "tests": "python/tests/test_schema_baseline_review.py",
        "unresolved": "semantic equivalence of columns, constraints, defaults, and functions still requires PostgreSQL apply-and-compare fixtures",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_revw_base_v0.0.0alpha.py",
      "id": "a0_schema_baseline_review"
    },
    {
      "block": "BOUNDARIES",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "network_boundary": "loopback-only",
        "owner": "database-owner",
        "pii": "none",
        "review_required": "database-owner",
        "secrets": "isolated",
        "side_effects": "creates and always drops disposable databases; writes evidence JSON",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "Connects only to loopback URLs explicitly supplied by the operator; creates and drops unique-named disposable databases; DATABASE_URL is overridden with the disposable URL for each Alembic call; production secrets are never passed to Alembic or psycopg2.",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "schema_baseline_test_harness_boundary"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "any gate outcome including exceptions",
        "since": "2026-08-05",
        "then": "every disposable database created by this harness is dropped before the process exits"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "schema_baseline_harness_always_cleans_up"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "an empty disposable PostgreSQL database and the baseline revision",
        "since": "2026-08-05",
        "then": "alembic upgrade head creates all reviewed objects, alembic_version contains the baseline revision id, and a second upgrade head is a no-op"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "schema_baseline_harness_gate_a_empty_apply"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "correctness",
        "given": "a disposable database with the raw schema applied and at least one table seeded via DEFAULT VALUES",
        "since": "2026-08-05",
        "then": "alembic stamp head + upgrade head leaves every pre-stamp table row count unchanged"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "schema_baseline_harness_gate_b_stamp_preservation"
    },
    {
      "block": "CONTRACTS",
      "fields": {
        "class": "safety",
        "given": "--admin-url resolves to a non-loopback host or --allow-disposable is absent",
        "since": "2026-08-05",
        "then": "the harness exits with an error before creating any database"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "schema_baseline_harness_refuses_non_disposable"
    },
    {
      "block": "MODULE_BUILD",
      "fields": {
        "admin_only": "true",
        "auth_boundary": "admin",
        "internal_surface": "gate_a, gate_b, _refuse_if_not_disposable, _connect, _run_alembic",
        "module_kind": "script",
        "module_name": "schema_baseline_test_harness",
        "network_boundary": "loopback-only",
        "owner": "Erin Spencer",
        "public_surface": "command line evidence JSON",
        "requires": "a0_legacy_schema_baseline_revision, a0_alembic_environment",
        "rollback": "script always drops every database it creates; no cleanup required",
        "rollout": "manual, against a freshly initialized local PostgreSQL 16 cluster only",
        "since": "2026-08-05",
        "storage_boundary": "migration",
        "summary": "Disposable-only PostgreSQL harness proving empty-apply, second-upgrade no-op, and archive-stamp row-preservation for the legacy schema baseline revision.",
        "tests": "python/tests/test_schema_baseline_revision.py",
        "unresolved": "archive-shaped fixture uses live-capture SQL; fixture not yet compared across PG versions",
        "user_data_boundary": "none"
      },
      "file": "scripts/sche_test_base_v0.0.0alpha.py",
      "id": "a0_schema_baseline_test_harness"
    }
  ],
  "edges": [
    {
      "from": "alembic_environment_migration_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "alembic_environment_migration_boundary",
      "to": "database-owner"
    },
    {
      "from": "legacy_schema_baseline_revision_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "legacy_schema_baseline_revision_boundary",
      "to": "database-owner"
    },
    {
      "from": "live_schema_capture_database_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "live_schema_capture_database_boundary",
      "to": "database-owner"
    },
    {
      "from": "runtime_readiness_dependency_probe",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "runtime_readiness_dependency_probe",
      "to": "platform-runtime"
    },
    {
      "from": "runtime_readiness_route_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "runtime_readiness_route_boundary",
      "to": "platform-runtime"
    },
    {
      "from": "schema_baseline_review_read_only_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "schema_baseline_review_read_only_boundary",
      "to": "database-owner"
    },
    {
      "from": "schema_baseline_test_harness_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "schema_baseline_test_harness_boundary",
      "to": "database-owner"
    },
    {
      "from": "schema_inventory_read_only_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "schema_inventory_read_only_boundary",
      "to": "platform-runtime"
    },
    {
      "from": "schema_migration_status_boundary",
      "kind": "owns",
      "source_block": "BOUNDARIES",
      "source_id": "schema_migration_status_boundary",
      "to": "database-owner"
    },
    {
      "from": "check_agent_lifecycle_parent_filter",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_parent_filter",
      "to": "python.tests.contracts.spawn_executor.test_count_live_for_parent_filters"
    },
    {
      "from": "check_agent_lifecycle_parent_filter",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_parent_filter",
      "to": "agent_lifecycle_count_live_for_parent_filters"
    },
    {
      "from": "check_agent_lifecycle_parent_filter",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_parent_filter",
      "to": "python3"
    },
    {
      "from": "check_agent_lifecycle_registry_singleton",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_registry_singleton",
      "to": "python.tests.contracts.spawn_executor.test_registry_is_singleton"
    },
    {
      "from": "check_agent_lifecycle_registry_singleton",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_registry_singleton",
      "to": "agent_lifecycle_registry_is_singleton"
    },
    {
      "from": "check_agent_lifecycle_registry_singleton",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_agent_lifecycle_registry_singleton",
      "to": "python3"
    },
    {
      "from": "check_alembic_control_plane_loads",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_alembic_control_plane_loads",
      "to": "self::test_alembic_configuration_loads_without_database"
    },
    {
      "from": "check_alembic_control_plane_loads",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_alembic_control_plane_loads",
      "to": "alembic_environment_explicit_transactional_only"
    },
    {
      "from": "check_alembic_control_plane_loads",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_alembic_control_plane_loads",
      "to": "alembic"
    },
    {
      "from": "check_alembic_control_plane_loads",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_alembic_control_plane_loads",
      "to": "pytest"
    },
    {
      "from": "check_alembic_control_plane_loads",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_alembic_control_plane_loads",
      "to": "python3"
    },
    {
      "from": "check_baseline_harness_cleanup_evidence",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_cleanup_evidence",
      "to": "self::test_evidence_cleanup_confirmed"
    },
    {
      "from": "check_baseline_harness_cleanup_evidence",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_cleanup_evidence",
      "to": "schema_baseline_harness_always_cleans_up"
    },
    {
      "from": "check_baseline_harness_cleanup_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_cleanup_evidence",
      "to": "pytest"
    },
    {
      "from": "check_baseline_harness_cleanup_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_cleanup_evidence",
      "to": "python3"
    },
    {
      "from": "check_baseline_harness_gate_a_evidence",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_a_evidence",
      "to": "self::test_gate_a_evidence_confirms_pass"
    },
    {
      "from": "check_baseline_harness_gate_a_evidence",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_a_evidence",
      "to": "schema_baseline_harness_gate_a_empty_apply"
    },
    {
      "from": "check_baseline_harness_gate_a_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_a_evidence",
      "to": "pytest"
    },
    {
      "from": "check_baseline_harness_gate_a_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_a_evidence",
      "to": "python3"
    },
    {
      "from": "check_baseline_harness_gate_b_evidence",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_b_evidence",
      "to": "self::test_gate_b_evidence_confirms_pass"
    },
    {
      "from": "check_baseline_harness_gate_b_evidence",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_b_evidence",
      "to": "schema_baseline_harness_gate_b_stamp_preservation"
    },
    {
      "from": "check_baseline_harness_gate_b_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_b_evidence",
      "to": "pytest"
    },
    {
      "from": "check_baseline_harness_gate_b_evidence",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_gate_b_evidence",
      "to": "python3"
    },
    {
      "from": "check_baseline_harness_refuses_non_disposable",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_non_disposable",
      "to": "self::test_harness_refuses_non_loopback_url"
    },
    {
      "from": "check_baseline_harness_refuses_non_disposable",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_non_disposable",
      "to": "schema_baseline_harness_refuses_non_disposable"
    },
    {
      "from": "check_baseline_harness_refuses_non_disposable",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_non_disposable",
      "to": "pytest"
    },
    {
      "from": "check_baseline_harness_refuses_non_disposable",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_non_disposable",
      "to": "python3"
    },
    {
      "from": "check_baseline_harness_refuses_without_flag",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_without_flag",
      "to": "self::test_harness_refuses_without_allow_flag"
    },
    {
      "from": "check_baseline_harness_refuses_without_flag",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_without_flag",
      "to": "schema_baseline_harness_refuses_non_disposable"
    },
    {
      "from": "check_baseline_harness_refuses_without_flag",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_without_flag",
      "to": "pytest"
    },
    {
      "from": "check_baseline_harness_refuses_without_flag",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_harness_refuses_without_flag",
      "to": "python3"
    },
    {
      "from": "check_baseline_revision_digest_locked",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_digest_locked",
      "to": "self::test_upgrade_raises_on_digest_mismatch"
    },
    {
      "from": "check_baseline_revision_digest_locked",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_digest_locked",
      "to": "legacy_schema_baseline_digest_locked"
    },
    {
      "from": "check_baseline_revision_digest_locked",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_digest_locked",
      "to": "pytest"
    },
    {
      "from": "check_baseline_revision_digest_locked",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_digest_locked",
      "to": "python3"
    },
    {
      "from": "check_baseline_revision_downgrade_closed",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_downgrade_closed",
      "to": "self::test_downgrade_raises_not_implemented"
    },
    {
      "from": "check_baseline_revision_downgrade_closed",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_downgrade_closed",
      "to": "legacy_schema_baseline_downgrade_closed"
    },
    {
      "from": "check_baseline_revision_downgrade_closed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_downgrade_closed",
      "to": "pytest"
    },
    {
      "from": "check_baseline_revision_downgrade_closed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_downgrade_closed",
      "to": "python3"
    },
    {
      "from": "check_baseline_revision_metacommand_filter",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_metacommand_filter",
      "to": "self::test_upgrade_strips_psql_metacommands"
    },
    {
      "from": "check_baseline_revision_metacommand_filter",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_metacommand_filter",
      "to": "legacy_schema_baseline_empty_apply"
    },
    {
      "from": "check_baseline_revision_metacommand_filter",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_metacommand_filter",
      "to": "pytest"
    },
    {
      "from": "check_baseline_revision_metacommand_filter",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_metacommand_filter",
      "to": "python3"
    },
    {
      "from": "check_baseline_revision_sql_path_resolvable",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_sql_path_resolvable",
      "to": "self::test_sql_path_constant_resolves_to_committed_file"
    },
    {
      "from": "check_baseline_revision_sql_path_resolvable",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_sql_path_resolvable",
      "to": "legacy_schema_baseline_digest_locked"
    },
    {
      "from": "check_baseline_revision_sql_path_resolvable",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_sql_path_resolvable",
      "to": "pytest"
    },
    {
      "from": "check_baseline_revision_sql_path_resolvable",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_baseline_revision_sql_path_resolvable",
      "to": "python3"
    },
    {
      "from": "check_billing_webhook_replay_idempotent",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_billing_webhook_replay_idempotent",
      "to": "self::test_webhook_replay_is_idempotent"
    },
    {
      "from": "check_billing_webhook_replay_idempotent",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_billing_webhook_replay_idempotent",
      "to": "billing_webhook_replay_idempotent"
    },
    {
      "from": "check_billing_webhook_replay_idempotent",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_billing_webhook_replay_idempotent",
      "to": "postgres"
    },
    {
      "from": "check_billing_webhook_replay_idempotent",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_billing_webhook_replay_idempotent",
      "to": "python3"
    },
    {
      "from": "check_chat_delete_other_owner_404",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_chat_delete_other_owner_404",
      "to": "self::test_delete_other_owner_404"
    },
    {
      "from": "check_chat_delete_other_owner_404",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_chat_delete_other_owner_404",
      "to": "chat_delete_other_owner_404"
    },
    {
      "from": "check_chat_delete_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_delete_other_owner_404",
      "to": "postgres"
    },
    {
      "from": "check_chat_delete_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_delete_other_owner_404",
      "to": "python3"
    },
    {
      "from": "check_chat_delete_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_delete_other_owner_404",
      "to": "running_test_server"
    },
    {
      "from": "check_chat_get_other_owner_404",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_chat_get_other_owner_404",
      "to": "self::test_get_other_owner_404"
    },
    {
      "from": "check_chat_get_other_owner_404",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_chat_get_other_owner_404",
      "to": "chat_get_other_owner_404"
    },
    {
      "from": "check_chat_get_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_get_other_owner_404",
      "to": "postgres"
    },
    {
      "from": "check_chat_get_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_get_other_owner_404",
      "to": "python3"
    },
    {
      "from": "check_chat_get_other_owner_404",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_get_other_owner_404",
      "to": "running_test_server"
    },
    {
      "from": "check_chat_unknown_body_model_400",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_chat_unknown_body_model_400",
      "to": "self::test_unknown_body_model_400"
    },
    {
      "from": "check_chat_unknown_body_model_400",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_chat_unknown_body_model_400",
      "to": "chat_unknown_body_model_400"
    },
    {
      "from": "check_chat_unknown_body_model_400",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_unknown_body_model_400",
      "to": "postgres"
    },
    {
      "from": "check_chat_unknown_body_model_400",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_unknown_body_model_400",
      "to": "python3"
    },
    {
      "from": "check_chat_unknown_body_model_400",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_chat_unknown_body_model_400",
      "to": "running_test_server"
    },
    {
      "from": "check_contract_graph_enforces_declared_timeout",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_enforces_declared_timeout",
      "to": "self::test_execute_check_enforces_timeout"
    },
    {
      "from": "check_contract_graph_enforces_declared_timeout",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_enforces_declared_timeout",
      "to": "contract_graph_enforces_declared_timeout"
    },
    {
      "from": "check_contract_graph_enforces_declared_timeout",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_enforces_declared_timeout",
      "to": "python3"
    },
    {
      "from": "check_contract_graph_rejects_incomplete_linkage",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_rejects_incomplete_linkage",
      "to": "self::test_audit_graph_rejects_incomplete_linkage"
    },
    {
      "from": "check_contract_graph_rejects_incomplete_linkage",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_rejects_incomplete_linkage",
      "to": "contract_graph_rejects_incomplete_linkage"
    },
    {
      "from": "check_contract_graph_rejects_incomplete_linkage",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_contract_graph_rejects_incomplete_linkage",
      "to": "python3"
    },
    {
      "from": "check_gating_allowlist_real_routes",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_gating_allowlist_real_routes",
      "to": "self::test_allowlist_entries_correspond_to_real_routes"
    },
    {
      "from": "check_gating_allowlist_real_routes",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_gating_allowlist_real_routes",
      "to": "gating_allowlist_entries_are_real_routes"
    },
    {
      "from": "check_gating_allowlist_real_routes",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_gating_allowlist_real_routes",
      "to": "python3"
    },
    {
      "from": "check_gating_every_write_route",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_gating_every_write_route",
      "to": "self::test_every_write_route_is_gated_or_allowlisted"
    },
    {
      "from": "check_gating_every_write_route",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_gating_every_write_route",
      "to": "gating_every_write_route_is_admin_or_allowlisted"
    },
    {
      "from": "check_gating_every_write_route",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_gating_every_write_route",
      "to": "python3"
    },
    {
      "from": "check_gating_forbidden_files_all_gated",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_all_gated",
      "to": "self::test_instrument_mutation_files_have_all_writes_gated"
    },
    {
      "from": "check_gating_forbidden_files_all_gated",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_all_gated",
      "to": "gating_instrument_files_all_writes_gated"
    },
    {
      "from": "check_gating_forbidden_files_all_gated",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_all_gated",
      "to": "python3"
    },
    {
      "from": "check_gating_forbidden_files_never_allowlisted",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_never_allowlisted",
      "to": "self::test_instrument_mutation_files_are_never_allowlisted"
    },
    {
      "from": "check_gating_forbidden_files_never_allowlisted",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_never_allowlisted",
      "to": "gating_instrument_files_never_allowlisted"
    },
    {
      "from": "check_gating_forbidden_files_never_allowlisted",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_gating_forbidden_files_never_allowlisted",
      "to": "python3"
    },
    {
      "from": "check_live_schema_capture_deterministic",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_deterministic",
      "to": "self::test_normalize_dump_removes_volatile_lines"
    },
    {
      "from": "check_live_schema_capture_deterministic",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_deterministic",
      "to": "live_schema_capture_is_deterministic"
    },
    {
      "from": "check_live_schema_capture_deterministic",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_deterministic",
      "to": "pytest"
    },
    {
      "from": "check_live_schema_capture_deterministic",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_deterministic",
      "to": "python3"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "self::test_capture_uses_read_only_pg_dump_flags_and_redacts_failure"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "live_schema_capture_decomposes_postgres_url"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "live_schema_capture_is_read_only"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "live_schema_capture_redacts_connection"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "pytest"
    },
    {
      "from": "check_live_schema_capture_read_only",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_live_schema_capture_read_only",
      "to": "python3"
    },
    {
      "from": "check_routes_doc_annotation_metrics",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_annotation_metrics",
      "to": "self::test_doc_annotation_metrics_parse"
    },
    {
      "from": "check_routes_doc_annotation_metrics",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_annotation_metrics",
      "to": "routes_doc_annotation_metrics"
    },
    {
      "from": "check_routes_doc_annotation_metrics",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_annotation_metrics",
      "to": "python3"
    },
    {
      "from": "check_routes_doc_blocks_complete",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_blocks_complete",
      "to": "self::test_route_doc_blocks_are_complete"
    },
    {
      "from": "check_routes_doc_blocks_complete",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_blocks_complete",
      "to": "routes_doc_blocks_complete"
    },
    {
      "from": "check_routes_doc_blocks_complete",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_routes_doc_blocks_complete",
      "to": "python3"
    },
    {
      "from": "check_routes_files_annotated",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_routes_files_annotated",
      "to": "self::test_route_files_are_annotated"
    },
    {
      "from": "check_routes_files_annotated",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_routes_files_annotated",
      "to": "routes_files_annotated"
    },
    {
      "from": "check_routes_files_annotated",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_routes_files_annotated",
      "to": "python3"
    },
    {
      "from": "check_routes_routers_registered",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_routes_routers_registered",
      "to": "self::test_router_defining_files_are_registered"
    },
    {
      "from": "check_routes_routers_registered",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_routes_routers_registered",
      "to": "routes_routers_registered"
    },
    {
      "from": "check_routes_routers_registered",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_routes_routers_registered",
      "to": "python3"
    },
    {
      "from": "check_routes_write_endpoints_gated",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_routes_write_endpoints_gated",
      "to": "self::test_every_write_route_is_gated"
    },
    {
      "from": "check_routes_write_endpoints_gated",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_routes_write_endpoints_gated",
      "to": "routes_write_endpoints_gated"
    },
    {
      "from": "check_routes_write_endpoints_gated",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_routes_write_endpoints_gated",
      "to": "python3"
    },
    {
      "from": "check_runtime_readiness_all_dependencies",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_all_dependencies",
      "to": "self::test_readiness_requires_all_dependencies"
    },
    {
      "from": "check_runtime_readiness_all_dependencies",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_all_dependencies",
      "to": "runtime_readiness_requires_every_dependency"
    },
    {
      "from": "check_runtime_readiness_all_dependencies",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_all_dependencies",
      "to": "pytest"
    },
    {
      "from": "check_runtime_readiness_all_dependencies",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_all_dependencies",
      "to": "python3"
    },
    {
      "from": "check_runtime_readiness_database_fail_closed",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_database_fail_closed",
      "to": "self::test_readiness_fails_closed_when_database_probe_fails"
    },
    {
      "from": "check_runtime_readiness_database_fail_closed",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_database_fail_closed",
      "to": "runtime_readiness_redacts_sensitive_values"
    },
    {
      "from": "check_runtime_readiness_database_fail_closed",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_database_fail_closed",
      "to": "runtime_readiness_requires_every_dependency"
    },
    {
      "from": "check_runtime_readiness_database_fail_closed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_database_fail_closed",
      "to": "pytest"
    },
    {
      "from": "check_runtime_readiness_database_fail_closed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_database_fail_closed",
      "to": "python3"
    },
    {
      "from": "check_runtime_readiness_redacts_configuration_values",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_redacts_configuration_values",
      "to": "self::test_readiness_reports_missing_config_without_values"
    },
    {
      "from": "check_runtime_readiness_redacts_configuration_values",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_redacts_configuration_values",
      "to": "runtime_readiness_redacts_sensitive_values"
    },
    {
      "from": "check_runtime_readiness_redacts_configuration_values",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_redacts_configuration_values",
      "to": "pytest"
    },
    {
      "from": "check_runtime_readiness_redacts_configuration_values",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_runtime_readiness_redacts_configuration_values",
      "to": "python3"
    },
    {
      "from": "check_schema_baseline_review_digest",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_digest",
      "to": "self::test_review_requires_matching_digest"
    },
    {
      "from": "check_schema_baseline_review_digest",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_digest",
      "to": "schema_baseline_review_requires_matching_digest"
    },
    {
      "from": "check_schema_baseline_review_digest",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_digest",
      "to": "pytest"
    },
    {
      "from": "check_schema_baseline_review_digest",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_digest",
      "to": "python3"
    },
    {
      "from": "check_schema_baseline_review_inventory",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_inventory",
      "to": "self::test_review_reports_objects_and_preserves_drift"
    },
    {
      "from": "check_schema_baseline_review_inventory",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_inventory",
      "to": "schema_baseline_review_preserves_drift"
    },
    {
      "from": "check_schema_baseline_review_inventory",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_inventory",
      "to": "schema_baseline_review_reports_object_inventory"
    },
    {
      "from": "check_schema_baseline_review_inventory",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_inventory",
      "to": "pytest"
    },
    {
      "from": "check_schema_baseline_review_inventory",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_inventory",
      "to": "python3"
    },
    {
      "from": "check_schema_baseline_review_safety",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_safety",
      "to": "self::test_review_rejects_unsafe_statement_classes"
    },
    {
      "from": "check_schema_baseline_review_safety",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_safety",
      "to": "schema_baseline_review_rejects_data_and_authority_statements"
    },
    {
      "from": "check_schema_baseline_review_safety",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_safety",
      "to": "pytest"
    },
    {
      "from": "check_schema_baseline_review_safety",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_baseline_review_safety",
      "to": "python3"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "self::test_inventory_detects_and_checks_mutation_sites"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "schema_inventory_check_fails_on_unreviewed_mutation_site"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "schema_inventory_excludes_environment_vendor_trees"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "schema_inventory_reports_mutation_sites"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "pytest"
    },
    {
      "from": "check_schema_inventory_mutation_sites",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_mutation_sites",
      "to": "python3"
    },
    {
      "from": "check_schema_inventory_three_authorities",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_three_authorities",
      "to": "self::test_repository_inventory_exposes_legacy_drift"
    },
    {
      "from": "check_schema_inventory_three_authorities",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_three_authorities",
      "to": "schema_inventory_reports_three_authorities"
    },
    {
      "from": "check_schema_inventory_three_authorities",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_three_authorities",
      "to": "pytest"
    },
    {
      "from": "check_schema_inventory_three_authorities",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_inventory_three_authorities",
      "to": "python3"
    },
    {
      "from": "check_schema_migration_status_bounds_failures",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_bounds_failures",
      "to": "self::test_schema_status_failure_surface_is_bounded"
    },
    {
      "from": "check_schema_migration_status_bounds_failures",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_bounds_failures",
      "to": "schema_migration_status_bounds_failures"
    },
    {
      "from": "check_schema_migration_status_bounds_failures",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_bounds_failures",
      "to": "alembic"
    },
    {
      "from": "check_schema_migration_status_bounds_failures",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_bounds_failures",
      "to": "pytest"
    },
    {
      "from": "check_schema_migration_status_bounds_failures",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_bounds_failures",
      "to": "python3"
    },
    {
      "from": "check_schema_migration_status_exact_match",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_exact_match",
      "to": "self::test_schema_status_requires_exact_nonempty_match"
    },
    {
      "from": "check_schema_migration_status_exact_match",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_exact_match",
      "to": "schema_migration_status_exact_set_match"
    },
    {
      "from": "check_schema_migration_status_exact_match",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_exact_match",
      "to": "alembic"
    },
    {
      "from": "check_schema_migration_status_exact_match",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_exact_match",
      "to": "pytest"
    },
    {
      "from": "check_schema_migration_status_exact_match",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_schema_migration_status_exact_match",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_claim_atomic",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_claim_atomic",
      "to": "python.tests.contracts.spawn_executor.test_claim_atomic"
    },
    {
      "from": "check_spawn_executor_claim_atomic",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_claim_atomic",
      "to": "spawn_executor_claim_atomic"
    },
    {
      "from": "check_spawn_executor_claim_atomic",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_claim_atomic",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_claim_atomic",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_claim_atomic",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_concurrent_live_cap",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_concurrent_live_cap",
      "to": "python.tests.contracts.spawn_executor.test_concurrent_live_cap"
    },
    {
      "from": "check_spawn_executor_concurrent_live_cap",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_concurrent_live_cap",
      "to": "spawn_executor_concurrent_live_cap"
    },
    {
      "from": "check_spawn_executor_concurrent_live_cap",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_concurrent_live_cap",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_concurrent_live_cap",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_concurrent_live_cap",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_degraded_merge_helpers",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_degraded_merge_helpers",
      "to": "python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna"
    },
    {
      "from": "check_spawn_executor_degraded_merge_helpers",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_degraded_merge_helpers",
      "to": "spawn_executor_merge_helpers_tolerate_no_pcna"
    },
    {
      "from": "check_spawn_executor_degraded_merge_helpers",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_degraded_merge_helpers",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_heartbeat_advances",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_heartbeat_advances",
      "to": "python.tests.contracts.spawn_executor.test_heartbeat_advances"
    },
    {
      "from": "check_spawn_executor_heartbeat_advances",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_heartbeat_advances",
      "to": "spawn_executor_heartbeat_advances"
    },
    {
      "from": "check_spawn_executor_heartbeat_advances",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_heartbeat_advances",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_heartbeat_advances",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_heartbeat_advances",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_marks_failed",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_marks_failed",
      "to": "python.tests.contracts.spawn_executor.test_marks_failed_on_exception"
    },
    {
      "from": "check_spawn_executor_marks_failed",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_marks_failed",
      "to": "spawn_executor_marks_failed_on_exception"
    },
    {
      "from": "check_spawn_executor_marks_failed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_marks_failed",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_marks_failed",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_marks_failed",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_no_orphan",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_no_orphan",
      "to": "python.tests.contracts.spawn_executor.test_no_orphan_invariant"
    },
    {
      "from": "check_spawn_executor_no_orphan",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_no_orphan",
      "to": "spawn_executor_no_orphan_invariant"
    },
    {
      "from": "check_spawn_executor_no_orphan",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_no_orphan",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_no_orphan",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_no_orphan",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_rejects_empty_provider",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_rejects_empty_provider",
      "to": "python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty"
    },
    {
      "from": "check_spawn_executor_rejects_empty_provider",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_rejects_empty_provider",
      "to": "spawn_executor_resolve_provider_rejects_empty"
    },
    {
      "from": "check_spawn_executor_rejects_empty_provider",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_rejects_empty_provider",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_retry_default_none",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_default_none",
      "to": "python.tests.contracts.spawn_executor.test_retry_default_none"
    },
    {
      "from": "check_spawn_executor_retry_default_none",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_default_none",
      "to": "spawn_executor_retry_default_none"
    },
    {
      "from": "check_spawn_executor_retry_default_none",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_default_none",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_retry_default_none",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_default_none",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_retry_once",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_once",
      "to": "python.tests.contracts.spawn_executor.test_retry_once_on_transient"
    },
    {
      "from": "check_spawn_executor_retry_once",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_once",
      "to": "spawn_executor_retry_once_on_transient"
    },
    {
      "from": "check_spawn_executor_retry_once",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_once",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_retry_once",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_retry_once",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_skips_non_running",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_skips_non_running",
      "to": "python.tests.contracts.spawn_executor.test_skips_non_running"
    },
    {
      "from": "check_spawn_executor_skips_non_running",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_skips_non_running",
      "to": "spawn_executor_skips_non_running"
    },
    {
      "from": "check_spawn_executor_skips_non_running",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_skips_non_running",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_skips_non_running",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_skips_non_running",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_snapshot_shape",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_snapshot_shape",
      "to": "python.tests.contracts.spawn_executor.test_snapshot_pcna_shape"
    },
    {
      "from": "check_spawn_executor_snapshot_shape",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_snapshot_shape",
      "to": "spawn_executor_snapshot_pcna_shape"
    },
    {
      "from": "check_spawn_executor_snapshot_shape",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_snapshot_shape",
      "to": "python3"
    },
    {
      "from": "check_spawn_executor_stale_sweep",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_stale_sweep",
      "to": "python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost"
    },
    {
      "from": "check_spawn_executor_stale_sweep",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_stale_sweep",
      "to": "spawn_executor_stale_sweep_marks_worker_lost"
    },
    {
      "from": "check_spawn_executor_stale_sweep",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_stale_sweep",
      "to": "postgres"
    },
    {
      "from": "check_spawn_executor_stale_sweep",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_spawn_executor_stale_sweep",
      "to": "python3"
    },
    {
      "from": "check_storage_anonymous_owner_null",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_storage_anonymous_owner_null",
      "to": "self::test_create_anonymous_owner_null"
    },
    {
      "from": "check_storage_anonymous_owner_null",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_storage_anonymous_owner_null",
      "to": "storage_anonymous_owner_null"
    },
    {
      "from": "check_storage_anonymous_owner_null",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_anonymous_owner_null",
      "to": "postgres"
    },
    {
      "from": "check_storage_anonymous_owner_null",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_anonymous_owner_null",
      "to": "python3"
    },
    {
      "from": "check_storage_anonymous_owner_null",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_anonymous_owner_null",
      "to": "running_test_server"
    },
    {
      "from": "check_storage_create_owner_isolation",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_storage_create_owner_isolation",
      "to": "self::test_create_owner_isolation"
    },
    {
      "from": "check_storage_create_owner_isolation",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_storage_create_owner_isolation",
      "to": "storage_create_owner_isolation"
    },
    {
      "from": "check_storage_create_owner_isolation",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_create_owner_isolation",
      "to": "postgres"
    },
    {
      "from": "check_storage_create_owner_isolation",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_create_owner_isolation",
      "to": "python3"
    },
    {
      "from": "check_storage_create_owner_isolation",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_storage_create_owner_isolation",
      "to": "running_test_server"
    },
    {
      "from": "check_transcript_explainer_citation_integrity",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_citation_integrity",
      "to": "python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations"
    },
    {
      "from": "check_transcript_explainer_citation_integrity",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_citation_integrity",
      "to": "explainer_rejects_fabricated_citations"
    },
    {
      "from": "check_transcript_explainer_citation_integrity",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_citation_integrity",
      "to": "python3"
    },
    {
      "from": "check_transcript_explainer_empty_balance",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_empty_balance",
      "to": "python.tests.contracts.transcripts_explainer.test_no_credits_returns_none"
    },
    {
      "from": "check_transcript_explainer_empty_balance",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_empty_balance",
      "to": "explainer_402_when_no_credits"
    },
    {
      "from": "check_transcript_explainer_empty_balance",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_empty_balance",
      "to": "postgres"
    },
    {
      "from": "check_transcript_explainer_empty_balance",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_empty_balance",
      "to": "python3"
    },
    {
      "from": "check_transcript_explainer_free_before_paid",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_free_before_paid",
      "to": "python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid"
    },
    {
      "from": "check_transcript_explainer_free_before_paid",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_free_before_paid",
      "to": "explainer_decrements_free_first"
    },
    {
      "from": "check_transcript_explainer_free_before_paid",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_free_before_paid",
      "to": "postgres"
    },
    {
      "from": "check_transcript_explainer_free_before_paid",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_free_before_paid",
      "to": "python3"
    },
    {
      "from": "check_transcript_explainer_idempotent_report",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_idempotent_report",
      "to": "python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge"
    },
    {
      "from": "check_transcript_explainer_idempotent_report",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_idempotent_report",
      "to": "explainer_explanation_is_idempotent"
    },
    {
      "from": "check_transcript_explainer_idempotent_report",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_idempotent_report",
      "to": "postgres"
    },
    {
      "from": "check_transcript_explainer_idempotent_report",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_idempotent_report",
      "to": "python3"
    },
    {
      "from": "check_transcript_explainer_learning_summary",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_learning_summary",
      "to": "python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary"
    },
    {
      "from": "check_transcript_explainer_learning_summary",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_learning_summary",
      "to": "explainer_call_surfaces_in_learning_summary"
    },
    {
      "from": "check_transcript_explainer_learning_summary",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_learning_summary",
      "to": "postgres"
    },
    {
      "from": "check_transcript_explainer_learning_summary",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_learning_summary",
      "to": "python3"
    },
    {
      "from": "check_transcript_explainer_refund",
      "kind": "calls",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_refund",
      "to": "python.tests.contracts.transcripts_explainer.test_refund_after_failure"
    },
    {
      "from": "check_transcript_explainer_refund",
      "kind": "claims_proves",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_refund",
      "to": "explainer_refund_restores_balance"
    },
    {
      "from": "check_transcript_explainer_refund",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_refund",
      "to": "postgres"
    },
    {
      "from": "check_transcript_explainer_refund",
      "kind": "requires",
      "source_block": "CHECKS",
      "source_id": "check_transcript_explainer_refund",
      "to": "python3"
    },
    {
      "from": "a0_alembic_environment",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_alembic_environment",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_alembic_environment",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_alembic_environment",
      "to": "a0_live_schema_capture"
    },
    {
      "from": "a0_alembic_environment",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_alembic_environment",
      "to": "a0_schema_inventory"
    },
    {
      "from": "a0_contract_graph_runner",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_contract_graph_runner",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_contract_graph_runner",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_contract_graph_runner",
      "to": "msdmd universal parser"
    },
    {
      "from": "a0_contract_graph_runner",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_contract_graph_runner",
      "to": "test-build doctrine"
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
      "from": "a0_legacy_schema_baseline_revision",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_legacy_schema_baseline_revision",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_legacy_schema_baseline_revision",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_legacy_schema_baseline_revision",
      "to": "a0_alembic_environment"
    },
    {
      "from": "a0_legacy_schema_baseline_revision",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_legacy_schema_baseline_revision",
      "to": "a0_live_schema_capture"
    },
    {
      "from": "a0_legacy_schema_baseline_revision",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_legacy_schema_baseline_revision",
      "to": "a0_schema_baseline_review"
    },
    {
      "from": "a0_live_schema_capture",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_live_schema_capture",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_live_schema_capture",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_live_schema_capture",
      "to": "a0_schema_inventory"
    },
    {
      "from": "a0_runtime_readiness",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_runtime_readiness",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_runtime_readiness",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_runtime_readiness",
      "to": "a0_service_heartbeat"
    },
    {
      "from": "a0_runtime_readiness_route",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_runtime_readiness_route",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_runtime_readiness_route",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_runtime_readiness_route",
      "to": "a0_runtime_readiness"
    },
    {
      "from": "a0_schema_baseline_review",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_review",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_schema_baseline_review",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_review",
      "to": "a0_live_schema_capture"
    },
    {
      "from": "a0_schema_baseline_review",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_review",
      "to": "a0_schema_inventory"
    },
    {
      "from": "a0_schema_baseline_test_harness",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_test_harness",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_schema_baseline_test_harness",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_test_harness",
      "to": "a0_alembic_environment"
    },
    {
      "from": "a0_schema_baseline_test_harness",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_baseline_test_harness",
      "to": "a0_legacy_schema_baseline_revision"
    },
    {
      "from": "a0_schema_inventory",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_inventory",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_schema_inventory",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_inventory",
      "to": "none"
    },
    {
      "from": "a0_schema_migration_status",
      "kind": "owns",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_migration_status",
      "to": "Erin Spencer"
    },
    {
      "from": "a0_schema_migration_status",
      "kind": "requires",
      "source_block": "MODULE_BUILD",
      "source_id": "a0_schema_migration_status",
      "to": "a0_alembic_environment"
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
  "repo": "a0"
});
