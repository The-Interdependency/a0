# 71:18
"""github_api — authenticated GitHub REST call."""
import json
import os
import httpx

SCHEMA = {
    "type": "function",
    "function": {
        "name": "github_api",
        "description": (
            "Make an authenticated call to the GitHub REST API. WRITE OPERATIONS ARE FULLY SUPPORTED — "
            "pass any JSON payload via the 'body' parameter for POST/PATCH/PUT requests. "
            "Use this to read OR write repositories, issues, pull requests, commits, comments, branches, "
            "releases, files, or any other GitHub resource. Authentication is handled automatically — "
            "never include a token yourself. "
            "For pushing FILE CHANGES, prefer the dedicated 'github_write_file' tool — it handles SHA "
            "lookup and base64 encoding automatically. Use github_api directly only for non-file operations "
            "or batched git-data operations. "
            "Endpoint examples: "
            "GET '/repos/The-Interdependency/a0/issues' — list issues; "
            "POST '/repos/The-Interdependency/a0/issues' with body={title, body} — create issue; "
            "POST '/repos/The-Interdependency/a0/pulls' with body={title, head, base, body} — open PR; "
            "GET '/search/repositories?q=topic:ai' — search repos. "
            "For the primary project repo use owner='The-Interdependency', repo='a0'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "method": {
                    "type": "string",
                    "enum": ["GET", "POST", "PATCH", "PUT", "DELETE"],
                    "description": "HTTP method. POST/PATCH/PUT require 'body'.",
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
                    "description": (
                        "JSON body for POST/PATCH/PUT requests. Pass any object shape — the GitHub "
                        "API determines what fields are valid for each endpoint. Example for creating "
                        "an issue: {\"title\": \"Bug: X\", \"body\": \"Details...\", \"labels\": [\"bug\"]}. "
                        "Omit only for GET/DELETE."
                    ),
                    "additionalProperties": True,
                },
            },
            "required": ["method", "endpoint"],
        },
    },
    "tier": "free",
    "approval_scope": "github_write",
    "enabled": True,
    "category": "integration",
    "cost_hint": "low",
    "side_effects": ["network", "external_account"],
    "version": 1,
}


async def call_github_api(method: str, endpoint: str, body: dict | None = None) -> str:
    """Internal callable also reused by github_write_file."""
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
            text = (resp.text or "").strip()
            if text.lower().startswith("<!doctype") or text.startswith("<"):
                data = f"[non-JSON HTML response, {len(text)} bytes — likely 404/auth page]"
            else:
                data = text[:500] + ("…" if len(text) > 500 else "")
        if resp.status_code >= 400:
            return json.dumps({"status": resp.status_code, "endpoint": endpoint, "error": data})
        if isinstance(data, list):
            truncated = data[:25]
            result: dict = {"status": resp.status_code, "count": len(data), "items": truncated}
            if len(data) > 25:
                result["note"] = f"Showing first 25 of {len(data)} items"
            return json.dumps(result, default=str)
        return json.dumps({"status": resp.status_code, "data": data}, default=str)
    except Exception as exc:
        return f"[github_api error: {exc}]"


async def handle(method: str = "GET", endpoint: str = "/user", body: dict | None = None, **_) -> str:
    return await call_github_api(method, endpoint, body)
# 71:18
