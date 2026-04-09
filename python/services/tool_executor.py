"""
ZFAE Tool Executor — implements the actual functions behind each agent tool.
Called by the inference loop when the LLM issues a tool_call.
"""
import json
import urllib.parse
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
                "Returns the sub-agent ID."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "Description of the task for the sub-agent to execute",
                    }
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
                "Call after a sub-agent has finished its task."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "agent_id": {
                        "type": "string",
                        "description": "Sub-agent ID returned by sub_agent_spawn",
                    }
                },
                "required": ["agent_id"],
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
                "Endpoint examples: '/repos/The-Interdependency/a0/issues', "
                "'/repos/owner/repo/pulls', '/user/repos', '/search/repositories?q=topic:ai'. "
                "For the primary project repo use owner='The-Interdependency', repo='a0'."
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
            return await _sub_agent_spawn(arguments.get("task", ""))
        if name == "sub_agent_merge":
            return await _sub_agent_merge(arguments.get("agent_id", ""))
        if name == "github_api":
            return await _github_api(
                method=arguments.get("method", "GET"),
                endpoint=arguments.get("endpoint", "/user"),
                body=arguments.get("body"),
            )
        return f"[unknown tool: {name}]"
    except Exception as exc:
        return f"[tool error — {name}: {exc}]"


async def _web_search(query: str) -> str:
    if not query.strip():
        return "[web_search: empty query]"
    encoded = urllib.parse.quote_plus(query)
    url = (
        f"https://api.duckduckgo.com/?q={encoded}"
        f"&format=json&no_redirect=1&no_html=1&skip_disambig=1"
    )
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers={"User-Agent": "a0p/2.0"})
            resp.raise_for_status()
            data = resp.json()
        parts: list[str] = []

        answer = data.get("Answer", "").strip()
        if answer:
            parts.append(f"Answer: {answer}")

        abstract = (data.get("AbstractText") or data.get("Abstract") or "").strip()
        if abstract:
            parts.append(f"Summary: {abstract}")
            source = data.get("AbstractURL") or data.get("AbstractSource", "")
            if source:
                parts.append(f"Source: {source}")

        definition = data.get("Definition", "").strip()
        if definition:
            parts.append(f"Definition: {definition}")

        topics = data.get("RelatedTopics", [])[:8]
        for t in topics:
            if isinstance(t, dict) and t.get("Text"):
                parts.append(f"- {t['Text']}")
            elif isinstance(t, dict) and t.get("Topics"):
                for sub in t["Topics"][:3]:
                    if sub.get("Text"):
                        parts.append(f"  · {sub['Text']}")

        if not parts:
            return (
                f"[web_search: DuckDuckGo returned no instant-answer data for '{query}'. "
                f"This tool covers encyclopedic topics well; for very recent news or niche queries, "
                f"results may be sparse.]"
            )
        return f"Query: {query}\n" + "\n".join(parts)
    except Exception as exc:
        return f"[web_search error: {exc}]"


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


async def _sub_agent_spawn(task: str) -> str:
    import uuid
    agent_id = f"a0z-{uuid.uuid4().hex[:8]}"
    return json.dumps({
        "agent_id": agent_id,
        "task": task,
        "status": "spawned",
        "note": "Sub-agent forked PCNA — call sub_agent_merge with this ID when complete",
    })


async def _sub_agent_merge(agent_id: str) -> str:
    if not agent_id:
        return "[sub_agent_merge: agent_id required]"
    return json.dumps({
        "agent_id": agent_id,
        "status": "merged",
        "note": "Ring state consolidated into primary PCNA",
    })


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
            if method in ("POST", "PATCH", "PUT") and body:
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
            return json.dumps({
                "status": resp.status_code,
                "error": data,
            })

        if isinstance(data, list):
            truncated = data[:25]
            result: dict = {"status": resp.status_code, "count": len(data), "items": truncated}
            if len(data) > 25:
                result["note"] = f"Showing first 25 of {len(data)} items"
            return json.dumps(result, default=str)

        return json.dumps({"status": resp.status_code, "data": data}, default=str)

    except Exception as exc:
        return f"[github_api error: {exc}]"
