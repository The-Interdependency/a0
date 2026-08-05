# 1:75 0:0 0:0
"""Test-owned evidence graph for the EDCMbone transcript explainer.

The executable functions remain in `transcripts_explainer.py`, where every
stateful check uses unique identities and explicit cleanup. This module owns
only CHECKS topology.
"""
# === CHECKS ===
# id: check_transcript_explainer_free_before_paid
#   proves: explainer_decrements_free_first
#   call: python.tests.contracts.transcripts_explainer.test_decrements_free_then_paid
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_uuid_scoped_delete
#
# id: check_transcript_explainer_empty_balance
#   proves: explainer_402_when_no_credits
#   call: python.tests.contracts.transcripts_explainer.test_no_credits_returns_none
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_uuid_scoped_delete
#
# id: check_transcript_explainer_refund
#   proves: explainer_refund_restores_balance
#   call: python.tests.contracts.transcripts_explainer.test_refund_after_failure
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_uuid_scoped_delete
#
# id: check_transcript_explainer_idempotent_report
#   proves: explainer_explanation_is_idempotent
#   call: python.tests.contracts.transcripts_explainer.test_idempotent_no_double_charge
#   requires: python3, postgres
#   timeout: 60
#   mutates: db
#   cleanup: explicit_report_and_upload_delete
#
# id: check_transcript_explainer_citation_integrity
#   proves: explainer_rejects_fabricated_citations
#   call: python.tests.contracts.transcripts_explainer.test_rejects_fabricated_citations
#   requires: python3
#   timeout: 30
#   mutates: none
#   cleanup: none
#
# id: check_transcript_explainer_learning_summary
#   proves: explainer_call_surfaces_in_learning_summary
#   call: python.tests.contracts.transcripts_explainer.test_explainer_call_surfaces_in_learning_summary
#   requires: python3, postgres
#   timeout: 60
#   mutates: db, process_log_buffer
#   cleanup: explicit_provider_scoped_delete
# === END CHECKS ===
# 1:75 0:0 0:0
