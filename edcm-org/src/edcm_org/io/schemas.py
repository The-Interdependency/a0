"""
EDCM-Org JSON Schemas.

These schemas define the canonical structure for:
  - OutputEnvelope (what the analyzer produces)
  - InputConfig (what the CLI/API accepts)

Used for validation and documentation generation.
"""

from __future__ import annotations

# Output envelope schema (mirrors types.OutputEnvelope)
OUTPUT_ENVELOPE_SCHEMA: dict = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "EDCMOutputEnvelope",
    "description": "Canonical EDCM analysis output. Every field is required.",
    "type": "object",
    "required": [
        "spec_version", "org", "window_id", "aggregation",
        "metrics", "params", "basin", "basin_confidence",
        "gaming_alerts", "warnings"
    ],
    "properties": {
        "spec_version": {
            "type": "string",
            "const": "edcm-org-v0.1.0",
            "description": "Non-negotiable spec stamp."
        },
        "org": {"type": "string", "description": "Organization identifier (anonymized if needed)."},
        "window_id": {"type": "string", "description": "Unique identifier for this analysis window."},
        "aggregation": {
            "type": "string",
            "enum": ["department", "team", "organization"],
            "description": "Aggregation level. 'individual' is prohibited."
        },
        "metrics": {
            "type": "object",
            "required": ["C", "R", "F", "E", "D", "N", "I", "O", "L", "P"],
            "properties": {
                "C": {"type": "number", "minimum": 0, "maximum": 1, "description": "Constraint Strain"},
                "R": {"type": "number", "minimum": 0, "maximum": 1, "description": "Refusal Density"},
                "F": {"type": "number", "minimum": 0, "maximum": 1, "description": "Fixation"},
                "E": {"type": "number", "minimum": 0, "maximum": 1, "description": "Escalation"},
                "D": {"type": "number", "minimum": 0, "maximum": 1, "description": "Deflection"},
                "N": {"type": "number", "minimum": 0, "maximum": 1, "description": "Noise"},
                "I": {"type": "number", "minimum": 0, "maximum": 1, "description": "Integration Failure"},
                "O": {"type": "number", "minimum": -1, "maximum": 1, "description": "Overconfidence"},
                "L": {"type": "number", "minimum": 0, "maximum": 1, "description": "Coherence Loss"},
                "P": {"type": "number", "minimum": 0, "maximum": 1, "description": "Progress"},
                "P_decisions": {"type": "number", "minimum": 0, "maximum": 1},
                "P_commitments": {"type": "number", "minimum": 0, "maximum": 1},
                "P_artifacts": {"type": "number", "minimum": 0, "maximum": 1},
                "P_followthrough": {"type": "number", "minimum": 0, "maximum": 1},
                "conf": {
                    "type": "object",
                    "description": "Per-primary confidence scores.",
                    "additionalProperties": {"type": "number", "minimum": 0, "maximum": 1}
                }
            }
        },
        "params": {
            "type": "object",
            "required": ["alpha", "delta_max", "complexity"],
            "properties": {
                "alpha": {"type": "number", "minimum": 0, "maximum": 1},
                "delta_max": {"type": "number", "minimum": 0, "maximum": 1},
                "complexity": {"type": "number", "minimum": 0, "maximum": 1}
            }
        },
        "basin": {
            "type": "string",
            "enum": [
                "REFUSAL_FIXATION", "DISSIPATIVE_NOISE", "INTEGRATION_OSCILLATION",
                "CONFIDENCE_RUNAWAY", "DEFLECTIVE_STASIS", "COMPLIANCE_STASIS",
                "SCAPEGOAT_DISCHARGE", "UNCLASSIFIED"
            ]
        },
        "basin_confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "gaming_alerts": {"type": "array", "items": {"type": "string"}},
        "warnings": {"type": "array", "items": {"type": "string"}}
    },
    "additionalProperties": False
}
