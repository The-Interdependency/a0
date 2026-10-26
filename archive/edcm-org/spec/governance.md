# EDCM-Org Governance Specification

## Core Governance Rules (Non-Negotiable)

These rules are enforced at runtime by `EDCMPrivacyGuard` and cannot be
overridden by configuration:

1. **Default aggregation is department-level.**
   No finer-grained output is produced without explicit consent + safety protocol.

2. **No individual scoring.**
   `aggregation: "individual"` raises `ConsentError` and halts output.

3. **No punitive automation.**
   EDCM outputs are diagnostic inputs to human decision-making processes.
   No automated personnel action may be triggered by EDCM output alone.

4. **PII is stripped from all processed payloads.**
   Fields: email, phone, name, employee_id, address, ssn, dob, ip_address.

5. **Data retention: 6 months default.**
   Configurable via `PrivacyConfig.retain_months`.

---

## Gaming Detection (Non-Optional)

Gaming detection runs on every analysis window. It cannot be disabled.

Gaming alerts are included in every `OutputEnvelope.gaming_alerts` field.

Detected gaming patterns:
- **ARTIFACT_INFLATION**: High P_artifacts with low constraint reduction.
- **SUPPRESSED_ESCALATION**: High strain + low escalation + low progress.
- **RESOLUTION_TOKEN_INFLATION**: Resolution markers present but constraint engagement is low.
- **OVERCONFIDENCE_INCOHERENCE**: High certainty combined with high internal contradiction.
- **FIXATION_CAMOUFLAGE**: High fixation coinciding with high progress.

Gaming alerts do not change basin classification. They are parallel signals.

---

## Intervention Framing

All interventions recommended by EDCM must be:
- System-level (not individual-level)
- Load-management framed (not blame framed)
- Advisory only (not automated)

Correct: "Introduce decision checkpoints into the meeting format."
Incorrect: "Employee X is causing integration failure."

---

## Consent Protocol for Individual Analysis

Individual-level analysis requires:
1. Explicit written consent from the individual
2. A documented safety protocol covering:
   - Purpose limitation
   - Storage constraints
   - Right to withdraw
   - No punitive use
3. Separate consent for each analysis window

Even with consent, individual outputs must not be used for:
- Performance review inputs
- Hiring/firing decisions
- Compensation adjustments

---

## Ethics as Load Management

EDCM frames ethics as a load-management problem:
- Systems that demand impossible constraint satisfaction must fail.
- Moralizing the failure conceals the design flaw.
- Sustainable systems route dissonance productively.
- Unethical systems externalize dissonance onto dependents.

This is consistent with interdependency-based governance models.

---

## Governance Audit Checklist

- [ ] All outputs include `spec_version`
- [ ] No output has `aggregation: "individual"`
- [ ] PII scrubbing confirmed in processed payloads
- [ ] Gaming detection ran on all windows
- [ ] Interventions are framed as system-level recommendations
- [ ] Data retention policy applied to stored windows
- [ ] Basin explanations included in all non-UNCLASSIFIED outputs
