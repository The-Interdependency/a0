---
name: a0p-pcea-naming
description: PCEA four-letter-set file naming doctrine for all new files in the a0p platform. Covers the comd_zets_echo naming scheme, version suffix format, directory lock status, and kudos accounting. Load this skill before creating any new file in the a0p codebase.
---

# PCEA File Naming Doctrine — Four-Letter-Set Convention

This is the authoritative reference for naming **all new files** created in the a0p codebase from the point this doctrine was adopted. Existing files are **not renamed** retroactively unless explicitly tasked; do not touch them.

---

## 1. The Four-Letter-Set Rule

Every new filename is built from one or more **four-character abbreviation chunks**, joined by underscores, followed by a version suffix and the file extension:

```
{set1}_{set2}_{set3}_v{major}.{minor}.{patch}{word}.{ext}
```

- Each chunk is **exactly 4 characters** — letters only, lowercase.
- Use as many chunks as needed to unambiguously describe the file's role; no artificial minimum or maximum beyond descriptiveness.
- The name reads like an abbreviated sentence: `serv_auth_rout` → "server auth routes".
- Inspiration: the old 8.3 (8-character name, 3-character extension) DOS/CP/M naming discipline — brevity as a forcing function for clear naming.

**Examples:**

| Conceptual name | PCEA filename |
|---|---|
| server/auth/routes | `serv_auth_rout_v0.0.0alpha.ts` |
| python/services/sigma engine | `serv_sigm_engn_v0.0.0alpha.py` |
| client/components/chat panel | `clnt_chat_pane_v0.0.0alpha.tsx` |
| shared/models/billing schema | `shrd_bill_schm_v0.0.0alpha.ts` |
| python/routes/fleet API | `flet_rout_api__v0.0.0alpha.py` |

> **Trailing underscores**: if a chunk slot is structurally present but empty (rare), pad with `_` to keep the separator rhythm. Avoid this where possible — add a more specific word instead.

---

## 2. Version Suffix Format

```
v{major}.{minor}.{patch}{word}
```

- `major`, `minor`, `patch` — integers, standard semver semantics.
- `word` — a short lowercase word **immediately appended to patch with no separator**. The word encodes something specific to the file's state or purpose; the encoding scheme will be defined in a follow-up doctrine update. Until that update arrives, use `alpha` for all new files as the placeholder word.
- The suffix is part of the **filename** — it is not a directory path or git tag.

**Lifecycle examples:**
```
serv_auth_rout_v0.0.0alpha.ts   ← initial creation
serv_auth_rout_v0.1.0alpha.ts   ← minor feature added (word TBD by encoding)
serv_auth_rout_v1.0.0alpha.ts   ← breaking interface change
```

> When a file's version bumps, the old filename is retired and the new one is the canonical file. Imports referencing the old name must update to the new name in the same commit.

---

## 3. Directory Lock Status

A **locked directory** is one where every file inside it is at its original version — no file has been bumped since the directory was first populated.

### Lock states

| State | Meaning |
|---|---|
| **Locked** | All files in the directory are at their initial version. No modifications have occurred. High stability signal. |
| **Soft-unlocked** | One or more files have been versioned up but the directory still has no external dependents requiring changes. |
| **Hard-unlocked** | A locked file was modified because an external dependency required it. This is a significant event (see §4). |

### Rules
- A directory lock is **implicit** — no lock file is needed. Lock status is derived from whether any filename in the directory carries a version bump above its initial creation version.
- Subdirectories are evaluated independently — a locked parent can contain an unlocked child directory and vice versa.
- Lock status is **never enforced programmatically** at this stage; it is a tracking and kudos-accounting concept (see §4).

---

## 4. Kudos Accounting

Kudos are a stability and hygiene metric tracked informally (and eventually in tooling):

| Event | Kudos |
|---|---|
| New directory created with all locked files | +1 per locked directory |
| Directory remains locked across a release cycle | +1 per cycle per locked directory |
| Locked file must be modified due to external dependency | Special event — log the reason; kudos awarded for the *detection and explicit justification*, not penalised |
| File versioned with no corresponding change in logic | −1 (version inflation, avoid) |

The "locked directory modified by external pressure" case is considered a **design intelligence signal**: it reveals a coupling that was not previously visible. Detecting and documenting it is valued above preventing it.

---

## 5. Interaction with Existing a0p Doctrine

This doctrine **extends** `a0p-module-doctrine`, it does not replace it. All existing rules (N:M annotation, `# DOC` blocks, `UI_META`, registration checklist, 400-line budget) continue to apply unchanged.

The PCEA naming rule applies **only to new files**. When you encounter an existing file that needs editing:
- Do **not** rename it to PCEA format as a side effect of the edit.
- If the task explicitly asks you to PCEA-rename an existing file, note that in the commit message and update all imports.

**Precedence for new file creation:**
1. Determine the conceptual name (what does this file do?).
2. Derive the four-letter chunks (one per meaningful word in the concept, exactly 4 chars each).
3. Append `_v0.0.0alpha` and the extension.
4. Apply all `a0p-module-doctrine` rules to the file content (annotation, DOC block, etc.).

---

## 6. Quick Reference

```
# New file creation checklist
[ ] Name uses only 4-char lowercase chunks separated by _
[ ] Version suffix is _v{major}.{minor}.{patch}{word}.{ext}
[ ] New files start at v0.0.0alpha until word encoding is defined
[ ] First + last line carry N:M annotation (per a0p-module-doctrine §1)
[ ] # DOC block present if Python route (per a0p-module-doctrine §3)
[ ] Directory lock status noted mentally; no lock file needed
[ ] If bumping version: update all imports in same commit
```

---

## 7. Open Items (pending follow-up)

- **Word encoding scheme**: the `{word}` in the version suffix encodes something specific. Definition deferred — use `alpha` as placeholder until the encoding doctrine is published.
- **Tooling**: a future `scripts/pcea_check.py` will lint new filenames and report lock status per directory. Not yet built.
