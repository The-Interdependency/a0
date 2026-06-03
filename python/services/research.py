# 41:20 0:0 0:0
# === MODULE_BUILD ===
# id: a0_service_research
#   module_name: research
#   module_kind: service
#   summary: Research-draft helpers — declares the RESEARCH_SOURCES catalog and provides relevance scoring, draft creation, and dedupe utilities over candidate results.
#   owner: Erin Spencer
#   public_surface: RESEARCH_SOURCES, score_relevance, create_draft, deduplicate_drafts
#   internal_surface: none
#   auth_boundary: none
#   storage_boundary: none
#   network_boundary: none
#   user_data_boundary: none
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; research draft helpers revert to prior behavior.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===
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
# 41:20 0:0 0:0
