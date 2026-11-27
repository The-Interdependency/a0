---
name: adaptive-elicitation
description: Adaptive, context-first interviewing for recovering missing information without making the user answer a questionnaire. Load this when a task requires eliciting facts, preferences, requirements, incident details, form fields, debugging context, or other missing inputs across turns; when prior conversation, files, connected sources, or authoritative records may already answer part of the question set; or when the user asks to be interviewed one question at a time. Do not load for a one-shot clarification that can be asked and resolved in a single ordinary prompt. This includes missing facts in forms, filings, reports, applications, audits, or debugging; questionnaire replacement; debriefing; and sensitive, stressful, or non-linear recall.
---



## Source and evidence boundary

Runtime facts come from the task's actual sources: current conversation,
authoritative attached material, connected sources, repository state, and the
user's answers. This skill supplies the elicitation method, not substantive
facts.

The design is informed by:

- CDC cognitive interviewing: targeted probes for comprehension, recall,
  judgment, and response.
  https://www.cdc.gov/nchs/ccqder/question-evaluation/cognitive-interviewing.html
- UK Home Office interviewing guidance: avoid compound questions, ask one
  question at a time, simplify complex questions, and use open and closed
  questions for different purposes.
  https://www.gov.uk/government/publications/conducting-the-asylum-interview-process/asylum-interviews-accessible
- U.S. DOJ trauma-informed guidance: use neutral, open-ended questions and
  avoid unnecessary repeated recounting.
  https://www.justice.gov/ovw/framework-prosecutors-strengthen-our-national-response-sexual-assault-and-domestic-violence
- Semi-structured interviewing literature: use a short guide with follow-up
  questions dependent on the interviewee's responses; keep questions open,
  neutral, clear, and familiar.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC6910737/
- Motivational Interviewing methods: open questions, reflections, and summaries
  can improve shared understanding when used without importing a therapeutic
  purpose.
  https://motivationalinterviewing.org/node/11216

These references justify interaction mechanics only. They do not authorize
forensic, clinical, legal, or diagnostic claims.

## Core contract

1. Harvest before asking. Search information already available to the task
   before asking the user to repeat it.
2. Ask one question per turn. The default user-visible turn contains one
   requested response unit. Never hide a questionnaire inside semicolons,
   bullets, parentheses, or "while you're at it" clauses.
3. Ask one construct per question. Avoid double- and multi-barrelled questions.
   A structured value such as one mailing address remains one construct.
4. Ask the highest-value unresolved question. Prefer the answer that unlocks
   the most downstream work, disambiguates the most branches, or supplies a
   required fact that cannot be recovered elsewhere.
5. Adapt after every answer. Recompute the gap set. A volunteered answer may
   eliminate several future questions.
6. Use open to focused to confirmatory progression. Invite free narrative when
   the shape is unknown; use focused prompts for missing detail; use closed
   questions only to confirm or select among genuinely unresolved alternatives.
7. Use neutral wording. Do not imply the desired answer, blame, motive, or
   chronology.
8. Accept uncertainty. "I don't know", "I don't remember", approximate values,
   and non-linear recall are legitimate states. Do not pressure the user into
   guessing.
9. Do not re-ask known facts. If sources conflict, ask only the narrow question
   needed to resolve the material discrepancy.
10. Keep the interview subordinate to the task. Stop asking when the requested
    deliverable can be completed honestly.

## Interview ledger

Track each needed fact as one of:

- known — directly supported by an authoritative source or explicit user answer;
- derived — deterministically computed from known facts, with derivation kept;
- candidate — plausible inference that must not be presented as fact;
- unknown_user — recoverable only from the user or their delegate;
- unknown_external — potentially recoverable from a file, app, repo, or source;
- optional — not required for the requested deliverable;
- hmmm — unresolved and material at the completion boundary.

Do not ask about a candidate as though it were true. Convert it into a neutral
confirmation only when the distinction matters.

## Workflow

### 1. Freeze the target

Identify the actual deliverable and, when one exists, its required fields or
decision constraints. Separate required information from merely useful detail.

### 2. Harvest context

Before asking the first question, inspect the current conversation, relevant
prior context, attached files, authoritative source material, connected sources,
and repository state when applicable. Derive only facts that follow
deterministically from supported inputs.

Populate the interview ledger. Do not ask the user to recreate information the
agent can recover.

### 3. Build the gap graph

For every unresolved fact, record:

- whether it is required;
- whether another source can answer it;
- which downstream fields or decisions depend on it;
- whether asking now could bias later recall;
- sensitivity or response burden;
- whether a prior answer may incidentally resolve it.

Prefer external recovery over user burden when source authority is at least as
good.

### 4. Select exactly one next question

Priority:

1. user-only fact blocking the entire deliverable;
2. branch-disambiguating fact that changes what must be asked next;
3. required fact with several downstream dependencies;
4. required low-burden fact;
5. optional detail only when it materially improves the requested output.

Within a tier, prefer the largest expected reduction in uncertainty for the
least response burden. Treat that as a qualitative heuristic, not fake numeric
precision.

### 5. Phrase it cleanly

A good question asks one thing, is short enough to parse in one pass, uses the
user's language where practical, avoids disputed presuppositions, explains
relevance only when needed, and permits unknown, approximate, or not applicable
when valid.

For narrative gaps, start broad: "What happened when the officers arrived?"
Then ask one focused follow-up drawn from that answer.

For exact form fields, ask the exact field: "What mailing address should the
City use for notices?"

### 6. Consume the whole answer

After a reply:

- record the answer to the asked question;
- extract additional volunteered facts;
- preserve qualifiers such as about, I think, before noon, or I don't remember;
- update dependencies and remove questions now answered;
- never continue from a stale prewritten list.

### 7. Resolve conflicts narrowly

When two supported sources conflict, state the conflict in one sentence and ask
one discriminating question. Do not make the user retell the surrounding story.

### 8. Continue or deliver

If another required user-only gap remains, ask the next single question.
Otherwise produce the requested artifact.

If work must stop with material unknowns, surface them as hmmm. Do not convert
missing answers into guesses merely to make the artifact look complete.

## Output shape while interviewing

Ordinary interview turns contain, at most:

- one optional sentence of context when needed; and
- one question requesting one response unit.

Do not append "also", "and while you're here", a numbered queue, or a preview of
future questions unless the user explicitly requests the roadmap.

If the user explicitly asks for the full interview plan, a checklist may be
shown, but actual elicitation returns to one question per turn unless the user
explicitly asks to answer in batches.

## Sensitive and stressful subjects

For legal incidents, victimization, medical history, housing instability,
financial distress, grief, or other high-burden material:

- minimize repeated recounting;
- prefer the user's own words before narrowing;
- do not force strict chronology when recall is non-linear;
- distinguish observed fact, recollection, estimate, inference, and document
  evidence;
- explain why a sensitive detail is required when that is not obvious;
- ask only information needed for the task;
- never treat hesitation, fragmented recall, or later-added detail as evidence
  of deception.

This is an interaction protocol, not a substitute for professional forensic,
legal, clinical, or investigative training.

## Validation

### Context-harvest test

Given a form asking for date, location, phone, damages, and witnesses where the
conversation already establishes date and location, the first question must not
ask for date or location.

### Single-question test

Given seven unresolved fields, the user-visible response contains one
interrogative requesting one construct, not seven bullets.

### Volunteer-consumption test

Asked for a mailing address, the user also supplies a phone number. The next
turn treats both as known and does not ask for the phone number.

### Adaptive-branch test

If the user says no property was seized during a second encounter, do not ask
for the value of property seized in that encounter.

### Uncertainty test

If the user says "I don't remember the officer's name," preserve employee
identity as unknown and continue with another recoverable field rather than
pressing for a guess.

### Conflict test

If a file says 11:20 and the user later says "closer to noon," ask one narrow
time-resolution question only if exact time matters to the deliverable.

### Non-trigger test

If the only missing input is a filename, ask that ordinary clarification
without invoking a full interview workflow.

## Anti-patterns

- dumping every unanswered field into one message;
- asking two independently answerable things in one sentence;
- asking for a fact already present in conversation or source material;
- following a static question list after an answer made later questions obsolete;
- leading with the agent's theory of what happened;
- forcing chronology when sequence is not established;
- turning volunteered approximations into exact facts;
- treating "I don't know" as resistance;
- collecting sensitive background because it might be interesting;
- narrating the entire hidden gap analysis to the user;
- continuing after enough information exists to do the work.

## Usage guidance

Use this as an interaction controller around a task-specific skill. The
task-specific skill owns substantive requirements; adaptive-elicitation decides
which missing user fact to ask next and how to ask it.

A user's explicit interaction preference outranks the default cadence. If the
user asks for a batch questionnaire, provide one. If they ask for one question
at a time, the single-question rule is binding until they change it.

## hmmm

- A future runner could score unresolved fields by dependency reduction and
  response burden, but the procedural heuristic is sufficient without fake
  quantitative precision.
- Cross-session context retrieval varies by agent harness; retrieval failure is
  a source limitation, not permission to pretend the user never supplied it.
- Sometimes the most informative next question is "Which thing do you mean?"
  Entropy occasionally wears a very small hat.
