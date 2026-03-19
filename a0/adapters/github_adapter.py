"""
GitHub adapter — wraps the GitHub REST API.

    A0_MODEL=github + GITHUB_TOKEN

Not an LLM. Interprets the last user message as a GitHub query:
  - "repo owner/name"          -> repo summary
  - "issues owner/name"        -> open issues list
  - "pr owner/name 42"         -> pull request detail
  - anything else              -> raw search query on GitHub
"""

from __future__ import annotations

import json
from typing import Any, Dict, List


class GitHubAdapter:
    name = "github"

    def __init__(self, token: str) -> None:
        try:
            from github import Github
        except ImportError as e:
            raise ImportError("pip install PyGithub") from e

        from github import Github
        self._gh = Github(token)

    def complete(self, messages: List[Dict[str, str]], **kwargs: Any) -> Dict[str, Any]:
        query = next(
            (m["content"] for m in reversed(messages) if m.get("role") == "user"), ""
        ).strip()

        parts = query.lower().split()
        try:
            if parts[0] == "repo" and len(parts) >= 2:
                repo = self._gh.get_repo(parts[1])
                data = {
                    "name": repo.full_name,
                    "description": repo.description,
                    "stars": repo.stargazers_count,
                    "open_issues": repo.open_issues_count,
                    "default_branch": repo.default_branch,
                    "url": repo.html_url,
                }

            elif parts[0] == "issues" and len(parts) >= 2:
                repo = self._gh.get_repo(parts[1])
                issues = list(repo.get_issues(state="open")[:10])
                data = [{"number": i.number, "title": i.title, "url": i.html_url} for i in issues]

            elif parts[0] == "pr" and len(parts) >= 3:
                repo = self._gh.get_repo(parts[1])
                pr = repo.get_pull(int(parts[2]))
                data = {
                    "number": pr.number,
                    "title": pr.title,
                    "state": pr.state,
                    "body": pr.body,
                    "url": pr.html_url,
                }

            else:
                results = self._gh.search_repositories(query)
                data = [
                    {"name": r.full_name, "description": r.description, "url": r.html_url}
                    for r in list(results[:5])
                ]

        except Exception as exc:
            return {"text": f"GitHub error: {exc}", "raw": {}}

        text = json.dumps(data, indent=2)
        return {"text": text, "raw": data}
