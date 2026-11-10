# DeepSeek — repair and complete A0's ChatGPT-style GUI

**Read [START-HERE.md](START-HERE.md), then [the November 10 audit](AUDIT-2026-11-10.md).** Continue the existing phone-first successor through G01–G15. Repair the two context-integrity failures first, then the remaining controls, evidence, readability and CI gaps.

## Packet

- [Current assignment, F01–F14 repair order and full G01–G15 contract](START-HERE.md)
- [Audit: reproductions, source owners, expected results and requirement disposition](AUDIT-2026-11-10.md)
- [GUI self-description: MSDMD placement, collection contract and GM01–GM08](GUI-MSDMD.md)
- [Portable diagnostic witnesses and compact receipts](evidence/2026-11-10/README.md)
- [Current downloadable packet](https://github.com/The-Interdependency/a0/raw/main/docs/handoffs/deepseek-gui/a0-gui-deepseek-handoff.zip)
- [GUI requirements graphic](reference/a0-gui-specification.png) and [PDF](reference/a0-gui-specification.pdf)
- [Dated source excerpts and snapshots](sources/)
- [Content checksums](SHA256SUMS) and [packet receipt](https://github.com/The-Interdependency/a0/blob/main/docs/handoffs/deepseek-gui/PACKET-RECEIPT.json)

The owner also requires a place to display the GUI’s own MSDMD: **About this interface**, with a current-view entry into the same inspector. G15 is a new requirement after the audit; its metadata must come from source-owned declarations and the shared collection.

## Instruction for DeepSeek

Read START-HERE.md completely. Resolve current skill-lib and A0 instructions, preserve newer source/VM work, and repair the owning layers. The audited source is de66778dd1d9073f6a8b3d532e73514868f94e3c; public health and served frontend bytes matched it on November 10. Forty browser tests and thirty offline assertions passed locally, while the audit identified fourteen findings. Targeted diagnostics reproduced the documented functional and evidence failures. Their PASS labels mean the defects were reproduced; replace them with expected-behavior assertions during repair.

Complete unblocked implementation and verification, publish through the permitted workflow, and continue through authorized deployment and actual Android acceptance. Preserve chat/history, attachment, voice, comparison and independent tool controls. Checkpoint exact source, running jobs, evidence and next action before resource/session limits. Return CHANGED / PROOF / NEXT / hmmm as specified in START-HERE.md.

## Publication and integrity

The November 4 packet was first published through [PR #123](https://github.com/The-Interdependency/a0/pull/123). This November 10 update replaces its starting-state guidance and downloadable ZIP with the audited continuation. Git history preserves the original publication; reference graphics and dated source files retain their original bytes and G01–G14 scope. GUI-MSDMD.md adds the later G15 display requirement. The sources/ snapshots remain historical inputs, not current status or replacement authority.

From this directory:

```sh
python3 build-packet.py --check
sha256sum --check SHA256SUMS
```

The verifier binds current packet content to its exact manifest, deterministic archive and receipt. The archive excludes itself and PACKET-RECEIPT.json; its extracted content and SHA256SUMS remain independently checkable with sha256sum. Relative references inside copied historical snapshots belong to their original repository context.

**hmmm:** Application repairs, authenticated live behavior, physical-phone acceptance and the recorded full-stream reattachment gap remain work for the builder. This update publishes the audit and execution contract.

GPT generated; context, prompt Erin Spencer.
