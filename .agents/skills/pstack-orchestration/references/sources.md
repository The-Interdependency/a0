# Sources for pstack-orchestration

These documents are external recommendations and provenance. They are not organization canon.

## Official pstack

- Plugin and skills: https://github.com/cursor/plugins/tree/main/pstack
- README: https://github.com/cursor/plugins/blob/main/pstack/README.md
- License (MIT, Copyright (c) 2026 Lauren Tan): https://github.com/cursor/plugins/blob/main/pstack/LICENSE
- poteto-mode: https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md
- Orchestrate playbook: https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/orchestrate.md
- Author: Lauren Tan (@poteto), https://x.com/poteto

Reuse of pstack: MIT allows use, copy, modification, and distribution if the copyright notice and permission notice are included in copies or substantial portions. This skill distills principles and does not copy substantial pstack skill text, so it does not vendor the MIT file. If a later change quotes a substantial portion, add the MIT notice to that file and record it here.

## Grok ports

- Official Grok *Build* marketplace listing of pstack (points at `cursor/plugins`, not a separate grok-pstack repo): https://grokstacks.com/p/pstack/ and the catalog https://github.com/xai-org/plugin-marketplace
- Community port `ThewindMom/grok-pstack` (MIT; pstack playbooks/principles attributed to Lauren Tan; Grok harness attributed to Marc / keel and Thewind): https://github.com/ThewindMom/grok-pstack and https://github.com/ThewindMom/grok-pstack/blob/main/LICENSE
- Community port `pstack-ports/grok-pstack`: https://github.com/pstack-ports/grok-pstack

No official Lauren Tan / Cursor "grok-pstack" for Grok Bot was found. The marketplace pstack is for Grok Build. Community grok-pstack ports adapt playbooks to Grok Build (`spawn_subagent`, no Cursor `Task`). Principles overlap (reproduce, verify, evidence, playbook routing); Cursor-only and Grok-Build-only harness steps are not used here.

## Prompt share that triggered this skill

- @0xChonsy, 14 Nov 2026, standalone post with the `[task.contract]` / `[skill.dispatch]` / `[autonomy.gate]` card: https://x.com/0xChonsy/status/2121730042099306942
- Profile mirror of that card and related prompt-cards: https://teapaw.org/0xChonsy

The 0xChonsy cards are viral reformattings of pstack ideas. They are not the official pstack source. This skill follows their section names where useful and distills the procedure; it does not paste the cards verbatim.
