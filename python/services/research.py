import hashlib
import time
from typing import Any

RESEARCH_SOURCES = [
    {"id": "web_search", "label": "Web Search", "enabled": True},
    {"id": "arxiv", "label": "arXiv Papers", "enabled": False},
    {"id": "github", "label": "GitHub Repos", "enabled": False},
]


def score_relevance(query: str, result_text: str) -> float:
    if not query or not result_text:
        return 0.0
    q_words = set(query.lower().split())
    r_words = set(result_text.lower().split())
    if not q_words:
        return 0.0
    overlap = len(q_words & r_words)
    return min(1.0, overlap / len(q_words))


def create_draft(
    source_task: str,
    title: str,
    summary: str,
    source_data: dict[str, Any] | None = None,
    query: str = "",
) -> dict[str, Any]:
    relevance = score_relevance(query, summary)
    return {
        "source_task": source_task,
        "title": title,
        "summary": summary,
        "relevance_score": round(relevance, 4),
        "source_data": source_data or {},
    }


def deduplicate_drafts(drafts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    unique = []
    for d in drafts:
        key = hashlib.md5(d.get("title", "").encode()).hexdigest()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique
