# TIW v1 Spec File Set (EDCM + PTCA/PCTA + PCNA)

This folder is the **canon** for v1.0.2-S9.

## Contents
- canon/spec.md — frozen canonical spec
- canon/CHANGELOG.md — append-only changelog
- config/v1.0.2.json — frozen constants
- schemas/events.schema.json — event schema
- logs/events.jsonl — append-only event log (empty)

## Invariants
- Update the spec only by versioned replacement (new file/version tag), never silent edits.
- Append events to logs/events.jsonl; never rewrite.
