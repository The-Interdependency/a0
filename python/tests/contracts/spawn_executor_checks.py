# 1:165 0:0 0:0
"""Test-owned evidence graph for agent lifecycle and spawn execution.

The executable functions remain in `spawn_executor.py`, where their UUID-scoped
database and process-registry cleanup is implemented. This module owns only
the CHECKS topology required by skill-lib test-build doctrine.
"""
# === CHECKS ===
# id: check_agent_lifecycle_registry_singleton
#   proves: agent_lifecycle_registry_is_singleton
#   call: python.tests.contracts.spawn_executor.test_registry_is_singleton
#   requires: python3
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_agent_lifecycle_parent_filter
#   proves: agent_lifecycle_count_live_for_parent_filters
#   call: python.tests.contracts.spawn_executor.test_count_live_for_parent_filters
#   requires: python3
#   timeout: 30
#   mutates: process_registry
#   cleanup: explicit_registry_pop
#
# id: check_spawn_executor_claim_atomic
#   proves: spawn_executor_claim_atomic
#   call: python.tests.contracts.spawn_executor.test_claim_atomic
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_skips_non_running
#   proves: spawn_executor_skips_non_running
#   call: python.tests.contracts.spawn_executor.test_skips_non_running
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_marks_failed
#   proves: spawn_executor_marks_failed_on_exception
#   call: python.tests.contracts.spawn_executor.test_marks_failed_on_exception
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_rejects_empty_provider
#   proves: spawn_executor_resolve_provider_rejects_empty
#   call: python.tests.contracts.spawn_executor.test_resolve_provider_rejects_empty
#   requires: python3
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_spawn_executor_snapshot_shape
#   proves: spawn_executor_snapshot_pcna_shape
#   call: python.tests.contracts.spawn_executor.test_snapshot_pcna_shape
#   requires: python3
#   timeout: 30
#   mutates: process_memory
#   cleanup: ephemeral_object_release
#
# id: check_spawn_executor_degraded_merge_helpers
#   proves: spawn_executor_merge_helpers_tolerate_no_pcna
#   call: python.tests.contracts.spawn_executor.test_merge_helpers_tolerate_no_pcna
#   requires: python3
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_spawn_executor_heartbeat_advances
#   proves: spawn_executor_heartbeat_advances
#   call: python.tests.contracts.spawn_executor.test_heartbeat_advances
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_stale_sweep
#   proves: spawn_executor_stale_sweep_marks_worker_lost
#   call: python.tests.contracts.spawn_executor.test_stale_sweep_marks_worker_lost
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_retry_once
#   proves: spawn_executor_retry_once_on_transient
#   call: python.tests.contracts.spawn_executor.test_retry_once_on_transient
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_retry_default_none
#   proves: spawn_executor_retry_default_none
#   call: python.tests.contracts.spawn_executor.test_retry_default_none
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_run_delete
#
# id: check_spawn_executor_concurrent_live_cap
#   proves: spawn_executor_concurrent_live_cap
#   call: python.tests.contracts.spawn_executor.test_concurrent_live_cap
#   requires: python3, postgres
#   timeout: 60
#   mutates: process_registry, db_read
#   cleanup: explicit_registry_pop
#
# id: check_spawn_executor_no_orphan
#   proves: spawn_executor_no_orphan_invariant
#   call: python.tests.contracts.spawn_executor.test_no_orphan_invariant
#   requires: python3, postgres
#   timeout: 60
#   mutates: process_registry, db
#   cleanup: explicit_registry_pop, explicit_run_delete
# === END CHECKS ===
# 1:165 0:0 0:0
