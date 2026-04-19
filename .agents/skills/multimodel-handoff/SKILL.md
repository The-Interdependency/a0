---
name: multimodel-handoff
description: Structure JSON payloads for tasks that pass between agents, models, or providers so the receiver can act without re-interpretation. Use whenever you are emitting a payload that will be consumed by a different model/agent than the one producing it.
---

# Structuring JSON for Multi-Model Task Flows

When two models hand off a task, every ambiguity in the payload becomes a behavioral fork. The goal of the schema is to make ambiguity impossible.

## The five required fields

Every handoff payload, regardless of task type, carries these:

```json
{
  "schema_version": "1",
  "task_id": "tsk-<uuid>",
  "idempotency_key": "<deterministic hash of inputs>",
  "originating_agent": "<agent_id>",
  "target_capability": "<capability_name>",
  "payload": { ... task-specific ... },
  "ack_required": true
}
```

- `schema_version` — required. A receiver seeing an unknown version refuses rather than guesses.
- `task_id` — globally unique. Used in logs, retries, error reports.
- `idempotency_key` — receiver dedupes on this. Critical for at-least-once delivery.
- `originating_agent` — receiver may apply trust scoping based on origin.
- `target_capability` — names what the receiver is being asked to do. Not a model name. Not a vendor. A capability.
- `payload` — task-specific body. See rules below.
- `ack_required` — if true, receiver must echo `{task_id, status: "received"}` before processing.

## Payload rules

- **No vendor-specific fields in the payload.** `claude_extended_thinking_budget`, `openai_reasoning_effort`, `gemini_thinking_config` belong in a separate `routing` block or in the receiver's local config — never mixed into the task. Vendor coupling at the task level locks you in.
- **No prose in fields meant for parsing.** If a field is `"due_date"`, it gets ISO-8601, not "next Tuesday or so."
- **Enums explicit.** `"priority": "high"` is fine if `priority ∈ {low, medium, high}` is documented. `"priority": "pretty important"` is not.
- **Nullable means absent.** Don't send `"summary": ""` to mean "no summary." Send `"summary": null` or omit the key.
- **Arrays are ordered if order matters.** Document it. If order doesn't matter, sort canonically before hashing for `idempotency_key`.

## Ack/error pattern

Receiver echoes one of:

```json
{ "task_id": "tsk-...", "status": "received" }
{ "task_id": "tsk-...", "status": "rejected", "reason": "schema_version_unsupported" }
{ "task_id": "tsk-...", "status": "completed", "result": { ... } }
{ "task_id": "tsk-...", "status": "failed", "error": { "code": "...", "message": "..." } }
```

`status` values are a closed set. Anything outside the set is a protocol violation and the originator should refuse to interpret.

## Versioning

When the schema needs to change:

- Add a field with a default → bump patch (still version `"1"`).
- Make a field newly required, or change its meaning → bump major (`"2"`).
- Receivers MUST refuse versions they don't understand. Forward compatibility through guessing is forbidden.

## What this prevents

The whole reason for this discipline: a payload produced by Claude must be processable by Gemini, GPT-5, or Grok with byte-identical results. If swapping the receiver changes behavior, the payload is leaking vendor assumptions. Treat that as a bug.
