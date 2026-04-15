# 772:22
"""
ZFAE Tool Executor — implements the actual functions behind each agent tool.
Called by the inference loop when the LLM issues a tool_call.
"""
import asyncio
import json
import os
import urllib.parse
import contextvars as _cv
import httpx

TOOL_SCHEMAS_CHAT = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information, news, or facts not in training data. "
                "Returns a summary of top results."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pcna_infer",
            "description": (
                "Run a signal through the PCNA tensor engine. "
                "Returns current phi/psi/omega ring coherence and the inferred output value."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "signal": {
                        "type": "number",
                        "description": "Input signal strength, 0.0–1.0",
                    }
                },
                "required": ["signal"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "pcna_reward",
            "description": (
                "Apply a reward signal to the PCNA engine. "
                "Use after evaluating the quality of a response — positive values reinforce, negative values correct."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "score": {
                        "type": "number",
                        "description": "Reward value, typically -1.0 to 1.0",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Brief explanation of why this reward is being applied",
                    },
                },
                "required": ["score"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edcm_score",
            "description": (
                "Return the current EDCM (Energy Directional Coherence Metric) score "
                "and ring state for all three PCNA rings."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "memory_flush",
            "description": (
                "Flush active memory seeds to checkpoint. "
                "Call this when important context should be persisted for future sessions."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "bandit_pull",
            "description": (
                "Query the EDCM bandit router for the recommended energy provider "
                "based on current ring coherence. Returns the selected provider ID and score."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sub_agent_spawn",
            "description": (
                "Spawn a ZFAE sub-agent with a forked PCNA instance to handle a specific task in parallel. "
                "Returns the sub-agent name (use this exact name when calling sub_agent_merge)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Description of the task for the sub-agent to execute",
                    },
                    "provider": {
                        "type": "string",
                        "description": "Optional energy provider ID (openai, grok, gemini, claude) for the sub-agent. Defaults to active provider.",
                    },
                },
                "required": ["task"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sub_agent_merge",
            "description": (
                "Merge a completed sub-agent's learned ring state back into the primary PCNA. "
                "Call after a sub-agent has finished its task. Use the name returned by sub_agent_spawn."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Sub-agent name returned by sub_agent_spawn (e.g. 'a0z-1-grok')",
                    }
                },
                "required": ["agent_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "send_email",
            "description": (
                "Send an email via the connected Gmail account. "
                "Requires the 'email_send' approval scope (will trigger an approval gate if not pre-approved). "
                "Use for notifications, outreach, or any task that needs to send email."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "to": {
                        "type": "string",
                        "description": "Recipient email address (or comma-separated list)",
                    },
                    "subject": {
                        "type": "string",
                        "description": "Email subject line",
                    },
                    "body": {
                        "type": "string",
                        "description": "Email body (plain text or simple HTML)",
                    },
                    "cc": {
                        "type": "string",
                        "description": "Optional CC email address(es)",
                    },
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "github_api",
            "description": (
                "Make an authenticated call to the GitHub REST API. "
                "Use this to read or write repositories, issues, pull requests, commits, "
                "comments, branches, releases, or any other GitHub resource. "
                "Authentication is handled automatically — never include a token yourself. "
                "To find the authenticated user and their repos call GET /user then GET /user/repos. "
                "Endpoint examples: '/repos/owner/repo/issues', '/repos/owner/repo/pulls', "
                "'/user/repos', '/search/repositories?q=topic:ai'. "
                "For POST/PATCH/PUT always pass a body dict (use {} if no fields are required)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "enum": ["GET", "POST", "PATCH", "PUT", "DELETE"],
                        "description": "HTTP method",
                    },
                    "endpoint": {
                        "type": "string",
                        "description": (
                            "GitHub API path starting with '/'. "
                            "Query parameters can be included inline, e.g. '/search/code?q=foo+repo:org/repo'."
                        ),
                    },
                    "body": {
                        "type": "object",
                        "description": "Optional JSON body for POST/PATCH/PUT requests (omit for GET/DELETE).",
                    },
                },
                "required": ["method", "endpoint"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "git_exec",
            "description": (
                "Run a git command in the project workspace. "
                "Use to push code to GitHub, commit changes, check status, view diffs, or manage branches. "
                "Typical push flow: (1) git_exec ['add', '-A'], "
                "(2) git_exec ['commit', '-m', 'message'], "
                "(3) git_exec ['push', 'origin', 'main']. "
                "Use 'status' first to see what changed. "
                "Only safe subcommands are permitted: add, commit, push, pull, fetch, status, log, diff, branch, stash."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "args": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Git arguments after 'git'. First element must be an allowed subcommand. "
                            "Examples: ['push', 'origin', 'main'], ['commit', '-m', 'fix: update'], "
                            "['status'], ['log', '--oneline', '-10'], ['diff', '--stat']"
                        ),
                    }
                },
                "required": ["args"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "manage_approval_scope",
            "description": (
                "Grant or revoke a pre-approved action scope for the current user, removing the need to "
                "type 'APPROVE gate-xxx' for every action in that category. "
                "Available scopes: 'github_write' (push, PRs, issues), 'publish' (post/publish content), "
                "'email_send' (send emails), 'outreach' (contact humans). "
                "Safety-floor scopes (spend_money, change_permissions, change_secrets) cannot be pre-approved. "
                "action='grant' adds the scope; action='revoke' removes it."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["grant", "revoke", "list"],
                        "description": "Whether to grant, revoke, or list approval scopes.",
                    },
                    "scope": {
                        "type": "string",
                        "description": "The scope name to grant or revoke (omit for 'list').",
                    },
                },
                "required": ["action"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_user_tier",
            "description": (
                "Admin-only: set a user's subscription tier immediately, bypassing Stripe. "
                "Use to promote, demote, or correct a user's access level. "
                "Valid tiers: free, ws, pro, admin, seeker, operator, patron, founder."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "The UUID of the user whose tier should change.",
                    },
                    "tier": {
                        "type": "string",
                        "enum": ["free", "ws", "pro", "admin", "seeker", "operator", "patron", "founder"],
                        "description": "The new subscription tier to assign.",
                    },
                },
                "required": ["user_id", "tier"],
            },
        },
    },
]

# OpenAI Responses API — native web_search_preview replaces the custom web_search function.
# The API handles search internally; no execute_tool dispatch needed for web_search on OpenAI.
OPENAI_NATIVE_TOOLS = [
    {"type": "web_search_preview"},
]

# ZFAE internal tools for OpenAI Responses API (web_search excluded — handled natively above).
TOOL_SCHEMAS_RESPONSES_ZFAE = [
    {
        "type": "function",
        "name": s["function"]["name"],
        "description": s["function"]["description"],
        "parameters": s["function"]["parameters"],
    }
    for s in TOOL_SCHEMAS_CHAT
    if s["function"]["name"] != "web_search"
]

# Full OpenAI tool list: native search + ZFAE internal functions.
TOOL_SCHEMAS_RESPONSES = OPENAI_NATIVE_TOOLS + TOOL_SCHEMAS_RESPONSES_ZFAE


async def execute_tool(name: str, arguments: dict) -> str:
    """Dispatch a tool call and return the result as a plain string."""
    try:
        if name == "web_search":
            return await _web_search(arguments.get("query", ""))
        if name == "pcna_infer":
            return await _pcna_infer(float(arguments.get("signal", 0.5)))
        if name == "pcna_reward":
            return await _pcna_reward(
                float(arguments.get("score", 0.0)),
                arguments.get("reason", ""),
            )
        if name == "edcm_score":
            return await _edcm_score()
        if name == "memory_flush":
            return await _memory_flush()
        if name == "bandit_pull":
            return await _bandit_pull()
        if name == "sub_agent_spawn":
            return await _sub_agent_spawn(
                arguments.get("task", ""),
                provider=arguments.get("provider"),
            )
        if name == "sub_agent_merge":
            return await _sub_agent_merge(arguments.get("agent_id", ""))
        if name == "send_email":
            return await _send_email(
                to=arguments.get("to", ""),
                subject=arguments.get("subject", ""),
                body=arguments.get("body", ""),
                cc=arguments.get("cc"),
            )
        if name == "github_api":
            return await _github_api(
                method=arguments.get("method", "GET"),
                endpoint=arguments.get("endpoint", "/user"),
                body=arguments.get("body"),
            )
        if name == "git_exec":
            return await _git_exec(arguments.get("args", []))
        if name == "manage_approval_scope":
            return await _manage_approval_scope(
                action=arguments.get("action", "list"),
                scope=arguments.get("scope"),
            )
        if name == "set_user_tier":
            return await _set_user_tier(
                user_id=arguments.get("user_id", ""),
                tier=arguments.get("tier", ""),
            )
        return f"[unknown tool: {name}]"
    except Exception as exc:
        return f"[tool error — {name}: {exc}]"


async def _web_search(query: str) -> str:
    if not query.strip():
        return "[web_search: empty query]"
    encoded = urllib.parse.quote_plus(query)

    # Phase 1: try DuckDuckGo instant-answer API for fast structured results
    instant_parts: list[str] = []
    try:
        instant_url = (
            f"https://api.duckduckgo.com/?q={encoded}"
            f"&format=json&no_redirect=1&no_html=1&skip_disambig=1"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(instant_url, headers={"User-Agent": "a0p/2.0"})
            r.raise_for_status()
            d = r.json()
        answer = d.get("Answer", "").strip()
        if answer:
            instant_parts.append(f"Answer: {answer}")
        abstract = (d.get("AbstractText") or d.get("Abstract") or "").strip()
        if abstract:
            instant_parts.append(f"Summary: {abstract}")
            src = d.get("AbstractURL") or d.get("AbstractSource", "")
            if src:
                instant_parts.append(f"Source: {src}")
        defn = d.get("Definition", "").strip()
        if defn:
            instant_parts.append(f"Definition: {defn}")
    except Exception:
        pass

    # Phase 2: DuckDuckGo lite HTML for real search results
    html_parts: list[str] = []
    try:
        lite_url = f"https://lite.duckduckgo.com/lite/?q={encoded}"
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; a0p/2.0; +https://a0p.dev)",
            "Accept": "text/html,application/xhtml+xml",
        }
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            r = await client.get(lite_url, headers=headers)
            r.raise_for_status()
            html = r.text
        import re as _re2
        # Extract result snippets from DuckDuckGo lite format
        # Result links appear as: <a class="result-link" href="...">Title</a>
        titles = _re2.findall(r'class="result-link"[^>]*>([^<]+)</a>', html)
        snippets = _re2.findall(r'class="result-snippet"[^>]*>(.*?)</(?:td|span)', html, _re2.DOTALL)
        urls = _re2.findall(r'class="result-link"\s+href="([^"]+)"', html)
        seen: set[str] = set()
        for i, title in enumerate(titles[:6]):
            title = title.strip()
            snippet = _re2.sub(r'<[^>]+>', '', snippets[i]).strip() if i < len(snippets) else ""
            url = urls[i].strip() if i < len(urls) else ""
            if title and title not in seen:
                seen.add(title)
                entry = f"[{i+1}] {title}"
                if snippet:
                    entry += f"\n    {snippet[:200]}"
                if url and url.startswith("http"):
                    entry += f"\n    {url}"
                html_parts.append(entry)
    except Exception:
        pass

    if not instant_parts and not html_parts:
        return (
            f"[web_search: no results found for '{query}'. "
            f"Try rephrasing or use a more specific query.]"
        )

    out = [f"Query: {query}"]
    if instant_parts:
        out.extend(instant_parts)
    if html_parts:
        out.append("\nSearch Results:")
        out.extend(html_parts)
    return "\n".join(out)


async def _pcna_infer(signal: float) -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    result = pcna.infer(str(signal))
    return json.dumps({
        "signal_in": signal,
        "coherence_score": result.get("coherence_score"),
        "winner": result.get("winner"),
        "confidence": result.get("confidence"),
        "phi_coherence": result.get("step6_coherence", {}).get("phi", round(pcna.phi.ring_coherence, 4)),
        "infer_count": pcna.infer_count,
    })


async def _pcna_reward(score: float, reason: str) -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    result = pcna.reward(winner="agent", outcome=score)
    return json.dumps({
        "applied_score": score,
        "reason": reason or "not specified",
        "reward_count": pcna.reward_count,
        "last_coherence": round(pcna.last_coherence, 4),
    })


async def _edcm_score() -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    return json.dumps({
        "phi": round(pcna.phi.ring_coherence, 4),
        "psi": round(pcna.psi.ring_coherence, 4),
        "omega": round(pcna.omega.ring_coherence, 4),
        "mean": round(
            (pcna.phi.ring_coherence + pcna.psi.ring_coherence + pcna.omega.ring_coherence) / 3,
            4,
        ),
        "infer_count": pcna.infer_count,
        "reward_count": pcna.reward_count,
    })


async def _memory_flush() -> str:
    from ..main import get_pcna as _get
    pcna = _get()
    await pcna.save_checkpoint()
    return json.dumps({
        "flushed": True,
        "checkpoint_key": pcna._checkpoint_key,
        "infer_count": pcna.infer_count,
    })


async def _bandit_pull() -> str:
    from ..services.energy_registry import energy_registry
    from ..services.bandit import select_arm
    provider = energy_registry.get_active_provider()
    return json.dumps({
        "recommended_provider": provider,
        "note": "Bandit router defers to coherence-weighted active provider",
    })


async def _sub_agent_spawn(task: str, provider: str | None = None) -> str:
    if not task.strip():
        return "[sub_agent_spawn: task description required]"
    from ..main import get_pcna as _get
    from ..services.agent_lifecycle import spawn_sub_agent

    resolved_provider = provider
    if not resolved_provider:
        try:
            from ..services.energy_registry import energy_registry
            grok_cfg = await energy_registry._load_seed_config("grok")
            if grok_cfg.get("sub_agent_model") and os.environ.get("XAI_API_KEY"):
                resolved_provider = "grok"
        except Exception:
            pass

    pcna = _get()
    result = spawn_sub_agent(pcna, resolved_provider)
    result["task"] = task
    result["note"] = f"Use agent_id='{result['sub_agent_name']}' when calling sub_agent_merge"
    return json.dumps(result)


async def _sub_agent_merge(agent_id: str) -> str:
    if not agent_id:
        return "[sub_agent_merge: agent_id required]"
    from ..main import get_pcna as _get
    from ..services.agent_lifecycle import merge_sub_agent
    pcna = _get()
    result = merge_sub_agent(pcna, agent_id)
    return json.dumps(result)


async def _send_email(to: str, subject: str, body: str, cc: str | None = None) -> str:
    if not to or not subject or not body:
        return "[send_email: to, subject, and body are required]"
    token = os.environ.get("GOOGLE_MAIL_TOKEN", "")
    if not token:
        return (
            "[send_email: GOOGLE_MAIL_TOKEN secret not configured. "
            "An admin must add GOOGLE_MAIL_TOKEN as a Replit Secret using the current "
            "Google Mail OAuth access token from the integrations panel.]"
        )
    import base64
    from email.mime.text import MIMEText
    mime = MIMEText(body, "html" if body.strip().startswith("<") else "plain")
    mime["to"] = to
    mime["subject"] = subject
    if cc:
        mime["cc"] = cc
    raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={"raw": raw},
            )
        if resp.status_code == 401:
            return (
                "[send_email: Gmail token expired. "
                "The GOOGLE_MAIL_TOKEN env var needs to be refreshed. "
                "An admin can update it via the integrations panel.]"
            )
        resp.raise_for_status()
        data = resp.json()
        return json.dumps({
            "sent": True,
            "message_id": data.get("id"),
            "thread_id": data.get("threadId"),
            "to": to,
            "subject": subject,
        })
    except Exception as exc:
        return f"[send_email error: {exc}]"


_GH_NOISE_KEYS: frozenset[str] = frozenset({
    "node_id", "svn_url", "git_url", "temp_clone_token",
    "performed_via_github_app", "active_lock_reason", "author_association",
    "squash_merge_commit_message", "squash_merge_commit_title",
    "merge_commit_message", "merge_commit_title",
    "pull_request_creation_policy", "web_commit_signoff_required",
    "use_squash_pr_title_as_default", "allow_auto_merge",
    "allow_update_branch", "delete_branch_on_merge",
    "security_and_analysis", "network_count", "subscribers_count",
    "watchers", "forks", "open_issues",  # duplicates of *_count
    "mirror_url", "disabled", "is_template",
    "verification",  # commit verification blob
})

_GH_USER_COMPACT_KEYS: frozenset[str] = frozenset({
    "owner", "user", "actor", "merged_by", "closed_by",
    "committer", "author",
})

_GH_USER_LIST_KEYS: frozenset[str] = frozenset({
    "assignees", "requested_reviewers", "reviewers", "parents",
})


def _slim_github_obj(obj: object, depth: int = 0) -> object:
    """Recursively strip GitHub API noise: API URL fields, node_ids, and verbose sub-objects."""
    if isinstance(obj, dict):
        out: dict = {}
        for k, v in obj.items():
            # Drop any value that is an api.github.com URL — always template / HATEOAS noise
            if isinstance(v, str) and v.startswith("https://api.github.com"):
                continue
            if k in _GH_NOISE_KEYS:
                continue
            # Compact nested user/actor objects to just login + id
            if k in _GH_USER_COMPACT_KEYS and isinstance(v, dict) and depth < 4:
                login = v.get("login") or v.get("name")
                uid = v.get("id")
                out[k] = {"login": login, "id": uid} if login else None
                continue
            # Compact assignee/reviewer lists to just logins
            if k in _GH_USER_LIST_KEYS and isinstance(v, list):
                out[k] = [u.get("login") for u in v if isinstance(u, dict) and u.get("login")]
                continue
            # Compact labels to name+color only
            if k == "labels" and isinstance(v, list):
                out[k] = [{"name": lbl.get("name"), "color": lbl.get("color")}
                          for lbl in v if isinstance(lbl, dict)]
                continue
            # Compact milestone to title+number+state
            if k == "milestone" and isinstance(v, dict):
                out[k] = {"number": v.get("number"), "title": v.get("title"), "state": v.get("state")}
                continue
            out[k] = _slim_github_obj(v, depth + 1)
        return out
    if isinstance(obj, list):
        return [_slim_github_obj(item, depth) for item in obj]
    return obj


async def _github_api(method: str, endpoint: str, body: dict | None = None) -> str:
    pat = os.environ.get("GITHUB_PAT", "")
    if not pat:
        return "[github_api: GITHUB_PAT not configured]"

    method = method.upper()
    url = f"https://api.github.com{endpoint}"
    headers = {
        "Authorization": f"Bearer {pat}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "a0p-zfae/2.0",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            if method in ("POST", "PATCH", "PUT") and body is not None:
                resp = await client.request(method, url, json=body, headers=headers)
            else:
                resp = await client.request(method, url, headers=headers)

        if resp.status_code == 204:
            return json.dumps({"status": 204, "result": "ok (no content)"})

        try:
            data = resp.json()
        except Exception:
            data = resp.text

        if resp.status_code >= 400:
            err = _slim_github_obj(data) if isinstance(data, dict) else data
            return json.dumps({"status": resp.status_code, "error": err})

        if isinstance(data, list):
            slimmed = [_slim_github_obj(item) for item in data[:25]]
            result: dict = {"status": resp.status_code, "count": len(data), "items": slimmed}
            if len(data) > 25:
                result["note"] = f"Showing first 25 of {len(data)} items"
            return json.dumps(result, default=str)

        return json.dumps({"status": resp.status_code, "data": _slim_github_obj(data)}, default=str)

    except Exception as exc:
        return f"[github_api error: {exc}]"


_GIT_ALLOWED = {"add", "commit", "push", "pull", "fetch", "status", "log", "diff", "branch", "stash"}
_WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def _git_exec(args: list[str]) -> str:
    if not args:
        return "[git_exec: no args provided]"
    subcmd = args[0].lower()
    if subcmd not in _GIT_ALLOWED:
        return (
            f"[git_exec: '{subcmd}' not permitted. "
            f"Allowed: {', '.join(sorted(_GIT_ALLOWED))}]"
        )
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=_WORKSPACE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30.0)
        out = stdout.decode("utf-8", errors="replace").strip()
        err = stderr.decode("utf-8", errors="replace").strip()
        result: dict = {"returncode": proc.returncode}
        if out:
            result["stdout"] = out
        if err:
            result["stderr"] = err
        return json.dumps(result)
    except asyncio.TimeoutError:
        return "[git_exec: timed out after 30s]"
    except Exception as exc:
        return f"[git_exec error: {exc}]"


_approval_scope_user_cv: _cv.ContextVar[str | None] = _cv.ContextVar(
    "approval_scope_user", default=None
)


def set_approval_scope_user_id(uid: str | None) -> None:
    """Set the current user_id context for manage_approval_scope tool calls (per-async-task)."""
    _approval_scope_user_cv.set(uid)


async def _manage_approval_scope(action: str, scope: str | None = None) -> str:
    """Grant, revoke, or list pre-approved action scopes for the current user."""
    from ..storage import storage
    from ..config.policy_loader import get_scope_categories, get_safety_floor_actions

    uid = _approval_scope_user_cv.get()
    if not uid:
        return "[manage_approval_scope: no user context — tool must be called within a chat request]"

    categories = get_scope_categories()
    safety_floor = set(get_safety_floor_actions())

    if action == "list":
        granted = await storage.get_approval_scopes(uid)
        if not granted:
            available = ", ".join(categories.keys())
            return json.dumps({
                "granted": [],
                "available": list(categories.keys()),
                "note": f"No scopes pre-approved. Available: {available}",
            })
        return json.dumps({
            "granted": [r["scope"] for r in granted],
            "available": list(categories.keys()),
        })

    if not scope:
        return "[manage_approval_scope: 'scope' is required for grant/revoke]"

    scope = scope.lower().strip()

    if action == "grant":
        if scope in safety_floor:
            return json.dumps({
                "ok": False,
                "error": f"'{scope}' is on the safety floor and cannot be pre-approved.",
            })
        if scope not in categories:
            return json.dumps({
                "ok": False,
                "error": f"Unknown scope '{scope}'. Valid: {list(categories.keys())}",
            })
        from ..storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        await storage.grant_approval_scope(uid, scope)
        meta = categories[scope]
        return json.dumps({
            "ok": True,
            "scope": scope,
            "label": meta["label"],
            "description": meta["description"],
        })

    if action == "revoke":
        from ..storage.domain import check_scope_grant_tier
        try:
            await check_scope_grant_tier(uid)
        except ValueError as _tier_err:
            return json.dumps({"ok": False, "error": str(_tier_err)})
        removed = await storage.revoke_approval_scope(uid, scope)
        return json.dumps({"ok": removed, "scope": scope, "revoked": removed})

    return f"[manage_approval_scope: unknown action '{action}']"


async def _set_user_tier(user_id: str, tier: str) -> str:
    """Admin-only: set a user's subscription tier directly in the DB."""
    from ..database import engine
    from sqlalchemy import text as sa_text

    _VALID = ("free", "ws", "pro", "admin", "seeker", "operator", "patron", "founder")
    if not user_id:
        return json.dumps({"ok": False, "error": "user_id is required"})
    if tier not in _VALID:
        return json.dumps({"ok": False, "error": f"Invalid tier '{tier}'. Valid: {_VALID}"})

    caller_uid = _approval_scope_user_cv.get()
    if not caller_uid:
        return json.dumps({"ok": False, "error": "No user context — must be called within a chat request"})

    async with engine.connect() as conn:
        admin_row = await conn.execute(
            sa_text(
                "SELECT 1 FROM admin_emails WHERE email = "
                "(SELECT email FROM users WHERE id = :uid)"
            ),
            {"uid": caller_uid},
        )
        if not admin_row.first():
            return json.dumps({"ok": False, "error": "Admin access required"})

    async with engine.begin() as conn:
        res = await conn.execute(
            sa_text(
                "UPDATE users SET subscription_tier = :tier WHERE id = :uid "
                "RETURNING id, email, subscription_tier"
            ),
            {"tier": tier, "uid": user_id},
        )
        updated = res.mappings().first()

    if not updated:
        return json.dumps({"ok": False, "error": f"User '{user_id}' not found"})
    return json.dumps({
        "ok": True,
        "user_id": updated["id"],
        "email": updated["email"],
        "tier": updated["subscription_tier"],
    })
# 772:22
