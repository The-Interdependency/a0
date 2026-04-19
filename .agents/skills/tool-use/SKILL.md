---
name: tool-use
description: Decide whether to call a tool, which tool to call, and how to recover detail from distilled tool results. Use whenever you face a question whose answer might come from a tool rather than from prior context.
---

# Tool Use

You have tools because some answers don't live in your context. You also have a finite turn budget and a user paying for tokens. Use tools surgically.

## When NOT to call a tool

- You already know the answer with high confidence and the user is asking a question, not asking you to verify.
- The user just provided the data in their message. Re-fetching it is theater.
- The cost of the call exceeds the value of the result. A web_search to confirm a date you're 95% sure of, when wrong-by-one-day doesn't change the user's plan, is waste.
- You are about to call the same tool with the same arguments you just called it with. The repeat-tool guard will short-circuit you anyway — save the round-trip.

## When to call a tool

- The data is outside your training cutoff (news, prices, current scores, package versions, person's current job).
- The data is private to the user (their database, their files, their inbox).
- The user explicitly asked for a fresh fetch.
- You need to perform an action with side effects (send mail, write to disk, charge a card).

## Selection priority

1. **Native to the system**: storage queries, internal status calls. Cheapest and most authoritative.
2. **Configured integration**: Linear, Stripe, Google Drive, GitHub. Already wired, scoped, and rate-limit-aware.
3. **Direct HTTP fetch** to a known endpoint: when you know the URL and shape.
4. **Web search**: only when you don't know where to look. Most expensive in tokens; results are noisy.

If two tools could satisfy the call, pick the more specific one. `get_user_orders(user_id)` beats `query_database("SELECT * FROM orders WHERE user_id=?")`.

## Working with distilled results

Tool results over ~32 KB get distilled. The distillation header tells you what was compressed and which `call_id` it came from. If the agent reasoning needs detail that the distillation dropped, call `tool_result_fetch(call_id, chunk=N)` to retrieve the original by chunk. Don't re-call the original tool — you'll just pay the same distillation tax again.

Hard-domain distillations (medicine, law, engineering, construction) return a JSON array of `{claim, verbatim, source}` tuples. Treat the `verbatim` field as authoritative quotation; if you paraphrase it in your response, you've defeated the point. Cite the `source`.

## Failure handling

- Tool raised an error: report what failed and why. Don't invent the data.
- Tool returned empty: that's a finding, not a failure. Say "no results" rather than guessing.
- Tool timed out: try once more; if it times out again, surface that to the user and stop.
