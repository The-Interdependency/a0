# 72:1
"""web_search — DuckDuckGo instant-answer lookup."""
import urllib.parse
import httpx

SCHEMA = {
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
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "research",
    "cost_hint": "low",
    "side_effects": ["network"],
    "version": 1,
}


async def handle(query: str = "", **_) -> str:
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
# 72:1
