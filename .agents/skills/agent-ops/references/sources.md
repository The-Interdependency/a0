# Sources for agent-ops

Reviewed 2026-11-09 against public pages and skill-lib `main` at
`6a16302f0b7ad6e2ed5331ee1423fcc0939e1d57`. `origin/main` was fetched the same
day and was still that commit. These notes are evidence for the skill. They
are not organization canon. Recommended controls become procedure only where
`agent-ops/SKILL.md` adopts them.

## Standing

| Class | What it covers |
|---|---|
| declared | Skill-lib facts already in README, AGENTS, ORG_DISTRIBUTION, skills.json, or a SKILL.md at the baseline commit. |
| implemented | Checker and runner behavior in this repo. |
| proposed | Controls adopted by `agent-ops/SKILL.md` from external guidance, pending maintainer merge. |
| external | Public documents. They stay external even after this skill is merged. |
| hmmm | Claims not re-read, or controls with no declared org schema. |

## Skill-lib facts used

| Fact | Where read | Standing |
|---|---|---|
| Canonical path `<slug>/SKILL.md`; consumer path `.agents/skills/<skill-name>/` | `README.md`, `AGENTS.md`, `ORG_DISTRIBUTION.md`, `skills.json` | declared |
| Missing authority is `hmmm` | `AGENTS.md` | declared |
| Resource-run preflight | `RESOURCE_RUN_INVARIANT.md` | declared |
| Skill questions, lean narrative, index sync | `skill-build/SKILL.md`, `docs/propagation-checklist.md` | declared |
| Only declared and implemented claims are canon without qualification | `canon/SKILL.md` | declared |
| Personal usage state stays out of the canonical repo | `skill-usage/SKILL.md` | declared |
| Declarations do not prove enforcement | `risk-boundary-build/SKILL.md` | declared |
| Closed loop and maker/checker separation | `loop-eng/SKILL.md` | declared |
| a0 spawn and merge rules are repo-specific | `agent-instantiation/SKILL.md` | declared |
| Acceptance commands | `docs/propagation-checklist.md`, `.github/workflows/ci.yml` | declared / implemented |

## External sources re-read for this branch

1. OWASP Top 10 for LLM Applications 2025, including LLM01 Prompt Injection, LLM02 Sensitive Information Disclosure, LLM06 Excessive Agency, LLM07 System Prompt Leakage, and LLM10 Unbounded Consumption. Fetched from `https://genai.owasp.org/llmrisk/llm01-prompt-injection/` and the 2025 list text at `https://genai.owasp.org/download/43299/`. LLM01 mitigations named there include least privilege, human approval for high-risk actions, segregating external content, and adversarial testing. LLM06 names excessive functionality, permissions, and autonomy. LLM10 names uncontrolled inference, denial of service, and unexpected cost.
2. OWASP, *Agentic AI — Threats and Mitigations*, Version 1.1, December 2025, OWASP Agentic Security Initiative, `https://genai.owasp.org/download/45674/`. The fetched text uses threat ids T1 Memory Poisoning, T2 Tool Misuse, and T8 Repudiation & Untraceability. A separate 2025-12-09 announcement, "OWASP Top 10 for Agentic Applications," uses ASI01–ASI10 labels. That announcement is a neighboring document. This skill cites the T-numbered paper at the URL above.
3. Kai Greshake, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz, and Mario Fritz, "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection," arXiv:2302.12173, `https://arxiv.org/abs/2302.12173`. The abstract argues that retrieved content can carry prompts and blur data and instructions.
4. NIST AI 100-1, Artificial Intelligence Risk Management Framework (AI RMF 1.0), January 2023, `https://doi.org/10.6028/NIST.AI.100-1`. The Core functions are GOVERN, MAP, MEASURE, and MANAGE. NIST states that the actions are not a checklist and are not necessarily ordered. This skill's order is its own workflow.
5. NIST AI 600-1, Generative Artificial Intelligence Profile, released 2024-07-26, `https://doi.org/10.6028/NIST.AI.600-1`. Companion profile for generative AI risks and suggested actions. The full action tables were not copied into the skill.
6. CISA and UK NCSC, Guidelines for Secure AI System Development, CISA release note 2023-11-26, `https://www.cisa.gov/news-events/news/dhs-cisa-and-uk-ncsc-release-joint-guidelines-secure-ai-system-development`. The announcement names four lifecycle areas: secure design, secure development, secure deployment, and secure operation and maintenance. The guideline PDF body was not re-read in this pass (`hmmm` for page-level claims beyond that announcement).
7. NSA, CISA, and partners, Deploying AI Systems Securely, CISA alert 2024-04-15, `https://www.cisa.gov/news-events/alerts/2024/04/15/joint-guidance-deploying-ai-systems-securely`. The joint sheet says it is for deploying and operating AI systems designed by another entity, and that it expands the secure-deployment and secure-operation sections of the 2023 guidelines.
8. CISA and partners, Careful Adoption of Agentic AI Services, CISA release 2026-05-01, `https://www.cisa.gov/news-events/news/cisa-us-and-international-partners-release-guide-secure-adoption-agentic-ai`. The page recommends avoiding broad or unrestricted access, starting with low-risk non-sensitive uses, and aligning to the existing security model. An Australian mirror path dated 2026-09 is a later file location, not the CISA release date.
9. UK NCSC, "Managing the cyber risk of agentic AI," `https://www.ncsc.gov.uk/blogs/managing-the-cyber-risk-of-agentic-ai`. The fetched page recommends human-in-the-loop, human-on-the-loop, or human-out-of-the-loop oversight; a sandbox; deny-by-default network with allowlists; a unique agent identity distinct from human identities; restricting resources to the task (the page's phrase is blast radius, not the words "least privilege"); and protected logs. The page's exact phrase "least privilege" was not found.

## Corrections to the research handoff

- The handoff called the December 2025 threats paper "ASI, v1.x" and pointed at `download/45674/`. The fetched PDF is Version 1.1 and numbers threats as T1, T2, and T8. ASI01–ASI10 belong to the neighboring Top 10 announcement.
- The handoff attributed "least-privilege credentials" to the NCSC blog. Least privilege is explicit in OWASP LLM01. The NCSC page supports unique identity, credential blast radius, and task-scoped access.
- The handoff's doctrine pin matches the fetched `origin/main` on 2026-11-09. No newer main commit was available to fast-forward.

## hmmm

- Full PDF pages of the 2023 secure-development guidelines, beyond the CISA announcement.
- Whether a future skill revision should cite the ASI Top 10 as a second OWASP artifact.
- Any skill-lib bot convention that is not in a file at this commit.
