# 126:1
"""github_write_file — single-file commit helper around the GitHub Contents API."""
import base64 as _b64
import json
import os
import urllib.parse

from .github_api import call_github_api

SCHEMA = {
    "type": "function",
    "function": {
        "name": "github_write_file",
        "description": (
            "Create or update a single file in a GitHub repository in one call. "
            "Handles base64 encoding of the content and SHA lookup for updates automatically — just "
            "provide the path and the new file contents as plain text. Returns the commit SHA. "
            "Use this for: editing source files, creating new files, updating docs, pushing config "
            "changes. For multi-file commits or branch creation, use github_api with the git-data "
            "endpoints instead. "
            "Default repo is 'The-Interdependency/a0' on the 'main' branch when omitted."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "Repository-relative file path, no leading slash. "
                        "Examples: 'README.md', 'src/index.html', 'docs/changelog.md'."
                    ),
                },
                "content": {
                    "type": "string",
                    "description": (
                        "The full new contents of the file as plain UTF-8 text. "
                        "Will be base64-encoded automatically. To delete a file, use github_api "
                        "DELETE on /repos/{owner}/{repo}/contents/{path} instead."
                    ),
                },
                "message": {
                    "type": "string",
                    "description": (
                        "Commit message describing the change. "
                        "Example: 'Update homepage hero copy to reflect platform pivot'."
                    ),
                },
                "owner": {
                    "type": "string",
                    "description": "Repository owner. Defaults to 'The-Interdependency' when omitted.",
                },
                "repo": {
                    "type": "string",
                    "description": "Repository name. Defaults to 'a0' when omitted.",
                },
                "branch": {
                    "type": "string",
                    "description": "Target branch. Defaults to the repository's default branch (usually 'main') when omitted.",
                },
            },
            "required": ["path", "content", "message"],
        },
    },
    "tier": "admin",
    "approval_scope": "code_self_modify",
    "enabled": True,
    "category": "integration",
    "cost_hint": "low",
    "side_effects": ["external_account", "irreversible"],
    "version": 2,
}


async def handle(
    path: str = "",
    content: str = "",
    message: str = "",
    owner: str | None = None,
    repo: str | None = None,
    branch: str | None = None,
    **_,
) -> str:
    owner = owner or "The-Interdependency"
    repo = repo or "a0"
    if not path or not message:
        return "[github_write_file: path and message are required]"
    if not os.environ.get("GITHUB_PAT", ""):
        return "[github_write_file: GITHUB_PAT not configured]"

    safe_path = "/".join(urllib.parse.quote(p, safe="") for p in path.lstrip("/").split("/"))
    contents_endpoint = f"/repos/{owner}/{repo}/contents/{safe_path}"

    sha: str | None = None
    lookup_endpoint = contents_endpoint + (f"?ref={urllib.parse.quote(branch)}" if branch else "")
    lookup_raw = await call_github_api("GET", lookup_endpoint)
    try:
        lookup = json.loads(lookup_raw)
        if isinstance(lookup, dict):
            if lookup.get("status") == 200 and isinstance(lookup.get("data"), dict):
                sha = lookup["data"].get("sha")
            elif lookup.get("status") and lookup["status"] >= 400 and lookup["status"] != 404:
                return json.dumps({
                    "ok": False,
                    "stage": "sha_lookup",
                    "endpoint": lookup_endpoint,
                    "error": lookup.get("error"),
                })
    except Exception:
        pass

    encoded = _b64.b64encode(content.encode("utf-8")).decode("ascii")
    body: dict = {"message": message, "content": encoded}
    if sha:
        body["sha"] = sha
    if branch:
        body["branch"] = branch

    write_raw = await call_github_api("PUT", contents_endpoint, body=body)
    try:
        write = json.loads(write_raw)
    except Exception:
        return write_raw

    if isinstance(write, dict) and write.get("status") in (200, 201):
        data = write.get("data", {}) or {}
        commit = data.get("commit", {}) or {}
        content_meta = data.get("content", {}) or {}
        return json.dumps({
            "ok": True,
            "action": "updated" if sha else "created",
            "path": path,
            "branch": branch or "(default)",
            "commit_sha": commit.get("sha"),
            "commit_url": commit.get("html_url"),
            "file_sha": content_meta.get("sha"),
        })
    return json.dumps({"ok": False, "stage": "write", "response": write})
# 126:1
