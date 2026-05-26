# 4:28 0:0 1:0
# Emergent Labs adapter — placeholder
#
# To activate:
# 1. Find the Emergent API base URL and auth format from your dashboard
# 2. Set in .env:
#      A0_MODEL=emergent
#      EMERGENT_API_KEY=<your key>
#      EMERGENT_API_BASE=https://api.emergent.sh/v1   # adjust to real URL
#
# If Emergent uses OpenAI-compatible /chat/completions, implement as:
#
#   import httpx
#   from ..env import EMERGENT_API_KEY, EMERGENT_API_BASE
#
#   class EmergentAdapter:
#       name = "emergent"
#       def complete(self, messages, **kwargs):
#           resp = httpx.post(
#               f"{EMERGENT_API_BASE}/chat/completions",
#               headers={"Authorization": f"Bearer {EMERGENT_API_KEY}"},
#               json={"model": "claude-sonnet-4-6", "messages": messages},
#               timeout=60,
#           )
#           resp.raise_for_status()
#           return {"text": resp.json()["choices"][0]["message"]["content"],
#                   "raw": resp.json(), "subagents_used": []}
#
# If Emergent uses a custom format, adjust the request/response mapping above.

raise NotImplementedError(
    "EmergentAdapter is not yet configured. "
    "See the comments in this file for setup instructions."
)
# 4:28 0:0 1:0
