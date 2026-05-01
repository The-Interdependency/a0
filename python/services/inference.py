# 652:153
import os
import json
import copy
import random
import asyncio
import logging
from typing import Optional, Callable, Awaitable, Any
import httpx

from .tool_executor import (
    TOOL_SCHEMAS_CHAT,
    TOOL_SCHEMAS_RESPONSES,
    execute_tool,
    set_caller_provider,
    get_a0_skill_manifest,
)
# Single source of truth for provider specs — loaded from python/config/providers.json.
# Replaces the old hardcoded PROVIDER_ENDPOINTS dict per the no-string-literals doctrine.
from .energy_registry import BUILTIN_PROVIDERS

_log = logging.getLogger("a0p.inference")


# Doctrine prefix — the canonical text of The Interdependent Way (sourced from
# https://interdependentway.org/canon/the_interdependent_way.md) is prepended to
# every system prompt as the first stable block so prompt caches across all four
# providers (Anthropic ephemeral, OpenAI auto, Gemini implicit, Grok auto) latch
# onto the same byte-identical prefix on first call and bill subsequent calls at
# cache-read rates (≈90% off for OpenAI/Anthropic/Grok, ≈75% off for Gemini).
# NOTE: no fallback to spec.md — spec.md is the a0p platform spec, NOT doctrine.
# If interdependent_way.md is missing the right behavior is to skip the prefix
# entirely rather than silently substitute the wrong document.
_DOCTRINE_CACHE: dict[str, str | float] = {"text": "", "mtime": 0.0}
_DOCTRINE_PATHS = ("interdependent_way.md",)


def _load_doctrine() -> str:
    """Read the canonical doctrine file (memoized; reloads on mtime change)."""
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    for rel in _DOCTRINE_PATHS:
        path = os.path.join(base, rel)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            continue
        if _DOCTRINE_CACHE["mtime"] == mtime and _DOCTRINE_CACHE["text"]:
            return _DOCTRINE_CACHE["text"]  # type: ignore[return-value]
        try:
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        _DOCTRINE_CACHE["text"] = text
        _DOCTRINE_CACHE["mtime"] = mtime
        return text
    return ""


def _prepend_doctrine(system_prompt: Optional[str]) -> Optional[str]:
    """Prepend the doctrine + a0 skill manifest as the first cacheable blocks
    of any system prompt. Both blocks are byte-stable across calls (manifest
    is alphabetically sorted) so prompt caches latch onto the same prefix
    until either a doctrine edit or a SKILL.md edit invalidates it."""
    doctrine = _load_doctrine()
    try:
        manifest = get_a0_skill_manifest()
    except Exception:
        manifest = ""
    parts = [p for p in (doctrine, manifest, system_prompt) if p]
    if not parts:
        return system_prompt
    if len(parts) == 1:
        return parts[0]
    return "\n\n---\n\n".join(parts)


# Anthropic prompt caching minimum is 1024 tokens. We use a rough char-based
# estimate (~4 chars/token) to skip cache_control when the prefix is too small.
_ANTHROPIC_CACHE_MIN_CHARS = 4096


def _resolve_attachment_path(storage_url: str) -> Optional[str]:
    """Map a storage_url like '/uploads/foo.png' to an absolute local path.

    Rejects any storage_url that resolves outside the project's uploads/
    directory. lstrip('/') alone does NOT stop '..' segments — os.path.join
    with an absolute base happily walks up via '..', and the realpath that
    follows would then succeed against /etc/passwd or similar. The realpath
    + commonpath check below is what actually contains the lookup.
    """
    if not storage_url:
        return None
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_root = os.path.realpath(os.path.join(base, "uploads"))
    rel = storage_url.lstrip("/")
    abs_path = os.path.realpath(os.path.join(base, rel))
    try:
        if os.path.commonpath([uploads_root, abs_path]) != uploads_root:
            _log.warning("attachment path traversal blocked: %s", storage_url)
            return None
    except ValueError:
        # commonpath raises on different drives (Windows) or empty paths.
        return None
    return abs_path if os.path.isfile(abs_path) else None


def _read_attachment_b64(storage_url: str) -> Optional[tuple[str, str]]:
    """Return (mime_type, base64_data) for a local file referenced by storage_url, or None."""
    import base64, mimetypes
    p = _resolve_attachment_path(storage_url)
    if not p:
        return None
    mime, _ = mimetypes.guess_type(p)
    if not mime:
        mime = "image/png"
    try:
        with open(p, "rb") as fh:
            data = base64.b64encode(fh.read()).decode("ascii")
    except OSError:
        return None
    return (mime, data)


# Per-document character cap. ~100K chars ≈ ~25K tokens, well under any
# provider's input window. Exceeding it returns the head of the doc with an
# explicit truncation marker so the model sees that the tail was elided
# (NO silent fallback policy — never lie to the model about its inputs).
_DOC_TEXT_CAP = 100_000


def _extract_pdf_text(abs_path: str) -> str:
    """Extract text from a PDF using pypdf. Per-page errors are swallowed
    to one page, never to the whole doc; the rest still comes through."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return "[pdf extraction unavailable: pypdf not installed]"
    try:
        reader = PdfReader(abs_path)
    except Exception as e:
        return f"[pdf open failed: {type(e).__name__}: {e}]"
    pages: list[str] = []
    total = len(reader.pages)
    for i, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
        except Exception as e:
            txt = f"[page {i + 1} extract failed: {type(e).__name__}]"
        pages.append(f"--- page {i + 1}/{total} ---\n{txt}")
        # Early stop once we're well past the cap — no point parsing 500 more pages.
        if sum(len(p) for p in pages) > _DOC_TEXT_CAP * 1.2:
            pages.append(f"[truncated: stopped at page {i + 1} of {total}]")
            break
    return "\n\n".join(pages)


def _extract_text_file(abs_path: str) -> str:
    """Read a UTF-8 (or latin-1 fallback) text/code file."""
    try:
        with open(abs_path, "rb") as fh:
            raw = fh.read()
    except OSError as e:
        return f"[read failed: {type(e).__name__}: {e}]"
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        # latin-1 always succeeds; better to show garbled bytes than fail silently.
        return raw.decode("latin-1", errors="replace")


def _extract_document_text(storage_url: str, mime_type: str, name: str = "") -> str:
    """Return the textual contents of a document attachment, capped and labeled.

    Caller is `_build_provider_messages` — we always return SOMETHING the
    model can read, including an explicit error string when extraction
    fails, so prompts never silently omit attachments the user uploaded.
    """
    p = _resolve_attachment_path(storage_url)
    if not p:
        return f"[attachment not found on disk: {storage_url}]"
    label = name or os.path.basename(p)
    mt = (mime_type or "").lower()
    if mt == "application/pdf" or p.lower().endswith(".pdf"):
        body = _extract_pdf_text(p)
    else:
        # Everything else in our DOC_MIME / DOC_EXT whitelist (server/attachments.ts)
        # is plain-text-ish: code files, markdown, csv, json, yaml, xml, html, logs.
        body = _extract_text_file(p)
    if len(body) > _DOC_TEXT_CAP:
        body = body[:_DOC_TEXT_CAP] + f"\n\n[truncated: showing first {_DOC_TEXT_CAP} chars of {len(body)}]"
    header = f"[attachment: {label} ({mt or 'unknown mime'})]"
    return f"{header}\n{body}"


def _att_kind(att: dict) -> str:
    """Best-effort kind classification. Trusts `kind` if the upload route
    set it (server/attachments.ts does); otherwise falls back to mime sniff
    so older rows or callers without kind still get routed correctly."""
    k = (att.get("kind") or "").lower()
    if k in ("image", "document"):
        return k
    mt = (att.get("mime_type") or "").lower()
    if mt.startswith("image/"):
        return "image"
    return "document"


def _build_provider_messages(messages: list[dict], provider_id: str) -> list[dict]:
    """Convert a list of {role, content, attachments?} messages into the
    multimodal shape required by the target provider.

    `attachments` items are dicts with at least `storage_url` and `mime_type`.
    Only user-role messages carry attachments today; assistant/tool turns are
    passed through unchanged. Vision content is appended to the user turn so
    the doctrine system-prompt prefix remains byte-identical and cacheable.
    """
    out: list[dict] = []
    for m in messages:
        atts = m.get("attachments") or []
        # Strip attachments key from passthrough copy regardless.
        base = {k: v for k, v in m.items() if k != "attachments"}
        if not atts or m.get("role") != "user":
            out.append(base)
            continue
        text = base.get("content") if isinstance(base.get("content"), str) else ""

        # Split images vs documents. Documents get extracted server-side and
        # spliced into the user turn as text — works on every provider, no
        # vision capability required. Images stay on the multimodal path.
        images = [a for a in atts if _att_kind(a) == "image"]
        docs = [a for a in atts if _att_kind(a) == "document"]
        doc_blocks = [
            _extract_document_text(
                a.get("storage_url", ""),
                a.get("mime_type", ""),
                a.get("name") or a.get("filename") or "",
            )
            for a in docs
        ]
        # Compose the text with doc bodies appended. Docs are bracketed by
        # their own [attachment: ...] header inside _extract_document_text.
        composed_text = text
        if doc_blocks:
            composed_text = (text + "\n\n" if text else "") + "\n\n".join(doc_blocks)

        # Vision branch: providers using OpenAI Chat-Completions style image_url
        # parts. Driven by providers.json supports_vision flag — claude has its
        # own native parts branch below, gemini uses the google-genai parts API.
        if (BUILTIN_PROVIDERS.get(provider_id) or {}).get("supports_vision"):
            parts: list[dict] = []
            if composed_text:
                parts.append({"type": "text", "text": composed_text})
            for a in images:
                pair = _read_attachment_b64(a.get("storage_url", ""))
                if not pair:
                    continue
                mime, data = pair
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime};base64,{data}"},
                })
            out.append({**base, "content": parts if parts else composed_text})
            continue

        if provider_id == "claude":
            parts = []
            if composed_text:
                parts.append({"type": "text", "text": composed_text})
            for a in images:
                pair = _read_attachment_b64(a.get("storage_url", ""))
                if not pair:
                    continue
                mime, data = pair
                parts.append({
                    "type": "image",
                    "source": {"type": "base64", "media_type": mime, "data": data},
                })
            out.append({**base, "content": parts if parts else composed_text})
            continue

        if provider_id in ("gemini", "gemini3"):
            # Native Gemini path expects Part.from_bytes; preserve image
            # attachments so gemini_native._messages_to_contents can build
            # inline_data parts. Doc text is folded into content above.
            inline = []
            for a in images:
                pair = _read_attachment_b64(a.get("storage_url", ""))
                if not pair:
                    continue
                mime, data = pair
                inline.append({"mime_type": mime, "data_b64": data})
            out.append({**base, "content": composed_text, "attachments": inline})
            continue

        # Unknown provider: pass the composed text so docs aren't lost, and
        # surface the dropped images explicitly rather than silently eliding
        # them. Better that the model sees "[3 images dropped: ...]" than
        # nothing at all.
        if images:
            _log.warning(
                "provider %r has no multimodal adapter; %d image attachment(s) dropped",
                provider_id, len(images),
            )
            marker = f"\n\n[{len(images)} image attachment(s) dropped: provider {provider_id!r} has no vision adapter]"
            composed_text = (composed_text or "") + marker
        out.append({**base, "content": composed_text})
    return out

# Retry policy: 2 retries (3 attempts total) with jittered exponential backoff
# on 429 and 5xx. 4xx other than 429 fail fast.
_RETRY_MAX_ATTEMPTS = 3
_RETRY_BASE_SLEEP = 1.5


def _safe_error_snippet(raw: object, limit: int = 200) -> str:
    """Sanitize an arbitrary error string so it's safe to surface to the UI.

    Strips control chars, collapses whitespace, drops anything that looks like
    a credential token or query string, and truncates. Empty if nothing safe
    remains — callers should fall back to a generic label in that case.
    """
    if not raw:
        return ""
    s = str(raw).replace("\r", " ").replace("\n", " ").replace("\t", " ")
    s = " ".join(s.split())
    # Strip URL query strings and obvious key=value pairs (env-var leakage guard).
    import re as _re
    s = _re.sub(r"\?[^\s]+", "", s)
    s = _re.sub(r"\b[A-Za-z_][A-Za-z0-9_]*=[\S]+", "", s)
    # Strip bearer/sk- token shapes.
    s = _re.sub(r"\b(?:Bearer\s+|sk-)[A-Za-z0-9_\-\.]{6,}", "", s)
    s = s.strip(" .,;:")
    if len(s) > limit:
        s = s[:limit].rstrip() + "…"
    return s


def _sanitize_provider_error(provider: str, exc: BaseException) -> str:
    """Return a single-line user-safe error summary; full detail goes to server log."""
    _log.exception("[%s] provider call failed", provider)

    # google-genai SDK errors carry useful, safe fields (.code, .message, .status).
    # Surface them so users can tell quota/auth/blocked-content apart instead of
    # all collapsing to "[gemini error: ClientError]".
    try:
        from google.genai import errors as _genai_errors  # type: ignore
        if isinstance(exc, _genai_errors.APIError):
            code = getattr(exc, "code", None) or getattr(exc, "status", None) or "?"
            msg = _safe_error_snippet(getattr(exc, "message", None) or str(exc))
            return f"[{provider} error: {code} {msg}]".rstrip(" ]") + "]"
    except ImportError:
        pass

    if isinstance(exc, httpx.HTTPStatusError):
        try:
            code = exc.response.status_code
        except Exception:
            code = "?"
        # Try to lift a JSON `error.message` / `message` field from the response body.
        body_msg = ""
        try:
            data = exc.response.json()
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, dict):
                    body_msg = err.get("message") or err.get("code") or ""
                elif isinstance(err, str):
                    body_msg = err
                else:
                    body_msg = data.get("message") or ""
        except Exception:
            body_msg = ""
        body_msg = _safe_error_snippet(body_msg)
        if body_msg:
            return f"[{provider} error: HTTP {code} {body_msg}]"
        return f"[{provider} error: HTTP {code}]"
    if isinstance(exc, httpx.TimeoutException):
        return f"[{provider} error: request timed out]"
    if isinstance(exc, httpx.HTTPError):
        return f"[{provider} error: network error]"
    # Generic — include the type plus a sanitized message snippet if non-empty.
    snippet = _safe_error_snippet(str(exc))
    if snippet:
        return f"[{provider} error: {type(exc).__name__}: {snippet}]"
    return f"[{provider} error: {type(exc).__name__}]"


async def _post_with_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    json_payload: dict,
    headers: dict,
) -> httpx.Response:
    """POST with jittered exponential backoff on 429 and 5xx. 4xx other than 429 fail fast."""
    last_exc: Optional[BaseException] = None
    for attempt in range(_RETRY_MAX_ATTEMPTS):
        try:
            resp = await client.post(url, json=json_payload, headers=headers)
            status = resp.status_code
            if status == 429 or 500 <= status < 600:
                last_exc = httpx.HTTPStatusError(
                    f"retryable status {status}", request=resp.request, response=resp
                )
                if attempt < _RETRY_MAX_ATTEMPTS - 1:
                    sleep_s = _RETRY_BASE_SLEEP * (2 ** attempt) + random.uniform(0, 0.5)
                    await asyncio.sleep(sleep_s)
                    continue
                resp.raise_for_status()
            resp.raise_for_status()
            return resp
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            last_exc = exc
            if attempt < _RETRY_MAX_ATTEMPTS - 1:
                sleep_s = _RETRY_BASE_SLEEP * (2 ** attempt) + random.uniform(0, 0.5)
                await asyncio.sleep(sleep_s)
                continue
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError("retry loop exited without response")


def _canonical_tool_calls(tool_calls: list[dict]) -> str:
    """Produce a stable string fingerprint of a list of tool calls for repeat detection."""
    norm = []
    for tc in tool_calls:
        if "function" in tc:
            name = tc.get("function", {}).get("name", "")
            args = tc.get("function", {}).get("arguments", "")
        elif tc.get("type") == "function_call":
            name = tc.get("name", "")
            args = tc.get("arguments", "")
        else:
            name = tc.get("name", "")
            args = tc.get("input", "") or tc.get("arguments", "")
        try:
            args_obj = json.loads(args) if isinstance(args, str) else args
            args_str = json.dumps(args_obj, sort_keys=True, default=str)
        except Exception:
            args_str = str(args)

# Anthropic API version (stable; new features arrive via anthropic-beta header).
_ANTHROPIC_VERSION = "2023-06-01"


def _gate_to_effort(effort: Optional[str]) -> str:
    """Normalize a reasoning effort hint to the canonical scale used by Grok / GPT-5."""
    if not effort:
        return "low"
    e = effort.lower()
    if e in ("minimal", "low", "medium", "high"):
        return e
    return "low"


def _effort_to_thinking_budget(effort: Optional[str], max_tokens: int) -> int:
    """Map effort → Claude thinking budget tokens. Must be < max_tokens and >= 1024."""
    e = _gate_to_effort(effort)
    budget = {"minimal": 0, "low": 1024, "medium": 4096, "high": 16384}.get(e, 1024)
    if budget == 0:
        return 0
    # budget must be strictly less than max_tokens, and at least 1024
    return max(1024, min(budget, max(1024, max_tokens - 512)))

_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"

_MAX_TOOL_ROUNDS = 5


async def call_energy_provider(
    provider_id: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    max_tokens: int = 8000,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
    reasoning_effort: Optional[str] = None,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> tuple[str, dict]:
    """
    Forward messages to the active energy provider with the system prompt prepended.
    Returns (content, usage_dict).
    user_id is threaded into the OpenAI path for approval-scope checking.
    skip_approval=True bypasses the approval gate (used for replay after explicit APPROVE).
    reasoning_effort is mapped per-provider, gated by capability flags in
    providers.json (single source of truth — no model slugs in code):
      - OpenAI: passed via openai_router call_cfg (ignored on the openai branch)
      - Grok:   passed as reasoning_effort when spec.supports_reasoning_effort
      - Claude: mapped to thinking.budget_tokens when spec.supports_thinking
      - Gemini: honored only on the native SDK path (gemini3 spec.supports_thinking)
    """
    system_prompt = _prepend_doctrine(system_prompt)
    messages = _build_provider_messages(messages, provider_id)

    # Per-provider PCNA: lazy-fork on first call, fire infer signal with the
    # last user text. Reward stays explicit (pcna_reward tool, routed via
    # caller_provider). Failure to fork or infer must NOT block the chat —
    # PCNA is a learning side-effect, not the user-facing concern. Logged at
    # WARNING so genuine bugs surface without silently corrupting output.
    try:
        from ..main import get_or_fork_provider_pcna
        _core = await get_or_fork_provider_pcna(provider_id)
        _last_user_text = ""
        for _m in reversed(messages):
            if _m.get("role") == "user":
                _c = _m.get("content")
                if isinstance(_c, str):
                    _last_user_text = _c
                elif isinstance(_c, list):
                    for _p in _c:
                        if isinstance(_p, dict) and _p.get("type") == "text":
                            _last_user_text = _p.get("text", "")
                            break
                break
        if _last_user_text:
            # Cap to avoid projecting megabytes — projection is fixed-dim.
            _core.infer(_last_user_text[:4000])
    except Exception as _pcna_err:
        _log.warning("[pcna] provider core infer skipped for %s: %s", provider_id, _pcna_err)

    if provider_id == "openai":
        return await _call_openai_routed(messages, system_prompt, use_tools=use_tools, user_id=user_id, skip_approval=skip_approval)

    spec = BUILTIN_PROVIDERS.get(provider_id)
    if not spec:
        raise RuntimeError(
            f"Unknown provider_id={provider_id!r} — no spec in BUILTIN_PROVIDERS. "
            f"This indicates a misrouted call; fix at the caller."
        )

    # OpenAI-vendored single-model providers (openai-5.5, openai-5.5-pro and
    # any future siblings). The legacy "openai" provider above goes through
    # role-based router; these go straight to openai_provider.call with the
    # spec's pinned model. reasoning_effort is clamped UP to the spec's
    # min_reasoning_effort (no silent downgrade — gpt-5.5-pro returns HTTP
    # 400 on 'low', so we honor the floor verbatim, not silently swallow).
    if spec.get("vendor") == "openai":
        api_key = os.environ.get(spec["env_key"], "")
        if not api_key:
            raise RuntimeError(
                f"{provider_id} unavailable: env var {spec['env_key']} is not set. "
                f"Set the API key or route the request to a configured provider."
            )
        effective_effort = (reasoning_effort or "medium").lower()
        min_effort = spec.get("min_reasoning_effort")
        if min_effort:
            order = {"minimal": 0, "low": 1, "medium": 2, "high": 3}
            if order.get(effective_effort, 0) < order.get(min_effort, 0):
                effective_effort = min_effort
        payload_messages: list[dict] = []
        if system_prompt:
            payload_messages.append({"role": "system", "content": system_prompt})
        payload_messages.extend(messages)
        from .providers.openai_provider import call as openai_call
        return await openai_call(
            payload_messages,
            model_override=spec["model"],
            api_key=api_key,
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=effective_effort,
        )

    api_key = os.environ.get(spec["env_key"], "")
    if not api_key:
        raise RuntimeError(
            f"{provider_id} unavailable: env var {spec['env_key']} is not set. "
            f"Set the API key or route the request to a configured provider."
        )

    payload_messages: list[dict] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})
    payload_messages.extend(messages)

    if provider_id == "claude":
        return await _call_anthropic(
            api_key, spec["model"], payload_messages, max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            enable_caching=spec.get("supports_prompt_caching", False),
        )

    if provider_id in ("gemini", "gemini3"):
        from .providers.gemini_provider import call as gemini_call
        return await gemini_call(
            payload_messages,
            api_key=api_key,
            model_override=spec["model"],
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            provider_id=provider_id,
        )

    if provider_id == "grok":
        from .providers.grok_provider import call as grok_call
        return await grok_call(
            payload_messages,
            api_key=api_key,
            model_override=spec["model"],
            max_tokens=max_tokens,
            use_tools=use_tools,
            reasoning_effort=reasoning_effort,
            progress_callback=progress_callback,
        )

    # No-silent-fallback doctrine: don't quietly route an unknown provider
    # to the openai-compat endpoint. If we got here, the provider id is not
    # one of the four we ship — raise so the caller sees a real error.
    raise ValueError(
        f"Unknown provider_id={provider_id!r} reached inference dispatcher. "
        f"Supported: openai, claude, gemini, gemini3, grok."
    )


async def _call_openai_routed(
    messages: list[dict],
    system_prompt: Optional[str] = None,
    use_tools: bool = True,
    user_id: Optional[str] = None,
    skip_approval: bool = False,
) -> tuple[str, dict]:
    """
    Route to the appropriate role via openai_router, check approval gate,
    then call the Responses API.
    route_decision and approval_packet are kept strictly schema-compliant.
    Call config (model, effort, etc.) is obtained separately via make_call_config().
    user_id is used to load pre-approved scopes so pre-authorized actions bypass the gate.
    """
    from .openai_router import make_route_decision, make_call_config, make_approval_packet, get_triggered_actions
    from ..logger import log_openai_event, seed_openai_hmmm_if_empty
    from ..config.policy_loader import get_hmmm_seed_items, get_action_scope, get_scope_categories
    from ..storage import storage

    await seed_openai_hmmm_if_empty(get_hmmm_seed_items())

    task_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user")

    pre_approved_scopes: set[str] = set()
    if user_id:
        try:
            pre_approved_scopes = await storage.get_approval_scope_names(user_id)
        except Exception as _scope_err:
            print(f"[approval_scopes] failed to load scopes for {user_id}: {_scope_err}")

    route_decision = make_route_decision(task_text, pre_approved_scopes=pre_approved_scopes)
    role = route_decision["role"]
    call_cfg = make_call_config(role)

    if route_decision["requires_approval"] and not skip_approval:
        import uuid
        gate_id = f"gate-{uuid.uuid4().hex[:8]}"
        packet = make_approval_packet(task_text, gate_id)
        input_repr = json.dumps({"task": task_text})
        output_repr = json.dumps(packet)
        await log_openai_event(
            role=role,
            model=call_cfg["model"],
            reasoning_effort=call_cfg["reasoning_effort"],
            input_text=input_repr,
            output_text=output_repr,
            approval_state="pending",
        )
        usage = {
            "approval_state": "pending",
            "gate_id": gate_id,
            "approval_packet": packet,
            "route_decision": route_decision,
        }
        triggered = get_triggered_actions(task_text)
        scope_hints: list[str] = []
        scope_categories = get_scope_categories()
        seen_scopes: set[str] = set()
        for action in triggered:
            sc = get_action_scope(action)
            if sc and sc not in seen_scopes and sc in scope_categories:
                meta = scope_categories[sc]
                scope_hints.append(f"  Pre-approve all {meta['label']}: APPROVE SCOPE {sc}")
                seen_scopes.add(sc)
        scope_section = "\n" + "\n".join(scope_hints) if scope_hints else ""
        content = (
            f"[APPROVAL REQUIRED — gate_id: {gate_id}]\n"
            f"Action: {packet['action'][:120]}\n"
            f"Impact: {packet['impact']}\n"
            f"Rollback: {packet['rollback']}\n"
            f"To approve this action: APPROVE {gate_id}"
            f"{scope_section}"
        )
        return content, usage

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError(
            "openai unavailable: env var OPENAI_API_KEY is not set. "
            "Set the API key or route the request to a configured provider."
        )

    full_input: list[dict] = []
    if system_prompt:
        full_input.append({"role": "system", "content": system_prompt})
    full_input.extend(messages)

    from .providers.openai_provider import call as openai_call
    content, usage = await openai_call(
        full_input,
        api_key=api_key,
        model_override=call_cfg["model"],
        max_tokens=call_cfg["max_output_tokens"],
        use_tools=use_tools,
        reasoning_effort=call_cfg["reasoning_effort"],
        temperature=call_cfg["temperature"],
        store=call_cfg["store"],
    )

    input_repr = json.dumps(full_input)
    await log_openai_event(
        role=role,
        model=call_cfg["model"],
        reasoning_effort=call_cfg["reasoning_effort"],
        input_text=input_repr,
        output_text=content,
        approval_state="not_required",
    )
    usage["route_decision"] = route_decision
    return content, usage



async def _call_anthropic(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    enable_caching: bool = True,
) -> tuple[str, dict]:
    """Backward-compat shim — delegates to providers.claude_provider.call.

    The real implementation moved to python/services/providers/claude_provider.py
    per energy-model-task-overhaul P3. New callers should import that module
    directly and pass `role=` instead of a pre-resolved model id; legacy
    callers in this file (the dispatcher at line ~547) still pass `model`
    positionally and that path keeps working via `model_override`.
    """
    from .providers.claude_provider import call as _claude_call
    return await _claude_call(
        messages,
        api_key=api_key,
        model_override=model,
        max_tokens=max_tokens,
        use_tools=use_tools,
        reasoning_effort=reasoning_effort,
        enable_caching=enable_caching,
    )


async def _call_anthropic_LEGACY_DEAD_PATH(
    api_key: str,
    model: str,
    messages: list[dict],
    max_tokens: int,
    use_tools: bool = True,
    reasoning_effort: Optional[str] = None,
    enable_caching: bool = True,
) -> tuple[str, dict]:
    """Pre-extraction body, kept temporarily as a reference for the rest of
    the P3 extraction work (grok/openai/gemini). Will be removed in the
    final cleanup pass once all four providers are out. Not wired."""
    set_caller_provider("claude")
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key, max_retries=2, timeout=90.0)

    system_text = ""
    filtered: list[dict] = []
    for m in messages:
        if m["role"] == "system":
            system_text = m["content"]
        else:
            filtered.append(m)

    claude_tools = [
        {
            "name": s["function"]["name"],
            "description": s["function"]["description"],
            "input_schema": s["function"]["parameters"],
        }
        for s in TOOL_SCHEMAS_CHAT
    ]
    # Anthropic prompt caching has a 1024-token minimum (~4096 chars). Below that
    # the cache_control header just adds overhead, so we skip it.
    tools_size_estimate = sum(
        len(t.get("name", "")) + len(t.get("description", "")) + len(json.dumps(t.get("input_schema", {})))
        for t in claude_tools
    )
    cache_tools = enable_caching and claude_tools and tools_size_estimate >= _ANTHROPIC_CACHE_MIN_CHARS
    if cache_tools:
        claude_tools[-1] = {**claude_tools[-1], "cache_control": {"type": "ephemeral"}}

    # Build the system prompt as structured blocks with up to two cache breakpoints:
    #   block 1: stable prefix (identity + base + tier + persona) → cache_control
    #   block 2: volatile suffix (memory seeds, dynamic context)  → cache_control
    # Anthropic allows up to 4 cache_control markers; this gives us a long-lived
    # prefix cache that survives memory-seed edits, plus a shorter cache for
    # the seeds themselves. The split marker is the literal "## Memory" header
    # emitted by _build_system_prompt — kept loose-coupled so callers can still
    # send a flat string and get single-block behavior.
    system_blocks: list[dict] = []
    if system_text:
        split_marker = "\n\n## Memory\n"
        idx = system_text.find(split_marker) if enable_caching else -1
        if idx > 0 and len(system_text[:idx]) >= _ANTHROPIC_CACHE_MIN_CHARS:
            prefix = system_text[:idx]
            suffix = system_text[idx + 2:]  # keep "## Memory\n..." in suffix
            system_blocks.append({
                "type": "text", "text": prefix,
                "cache_control": {"type": "ephemeral"},
            })
            suffix_block: dict = {"type": "text", "text": suffix}
            if len(suffix) >= _ANTHROPIC_CACHE_MIN_CHARS:
                suffix_block["cache_control"] = {"type": "ephemeral"}
            system_blocks.append(suffix_block)
        else:
            block: dict = {"type": "text", "text": system_text}
            if enable_caching and len(system_text) >= _ANTHROPIC_CACHE_MIN_CHARS:
                block["cache_control"] = {"type": "ephemeral"}
            system_blocks.append(block)

    # Extended thinking (skip for tool-use turns to avoid the "preserve thinking blocks"
    # complexity — re-enable for the final answer turn only).
    thinking_budget = _effort_to_thinking_budget(reasoning_effort, max_tokens)

    # Defensive deepcopy: caller's list is never mutated by our tool loop.
    current_messages = copy.deepcopy(filtered)
    accumulated_usage: dict = {}
    prev_call_fingerprint: Optional[str] = None

    for _round in range(_MAX_TOOL_ROUNDS + 1):
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": current_messages,
        }
        if system_blocks:
            kwargs["system"] = system_blocks
        if use_tools:
            kwargs["tools"] = claude_tools
        # Extended thinking is enabled on every round; the assistant turn we re-inject
        # below preserves the model's thinking blocks intact (Anthropic requires this
        # when continuing a thinking conversation).
        if thinking_budget > 0:
            kwargs["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
            # thinking forces temperature=1 — don't set temperature alongside it.

        try:
            msg = await client.messages.create(**kwargs)
        except Exception as exc:
            return _sanitize_provider_error("claude", exc), accumulated_usage

        # SDK returns a typed Message — coerce to dict shape the existing loop expects.
        usage_dict = msg.usage.model_dump() if msg.usage else {}
        for k, v in usage_dict.items():
            if isinstance(v, (int, float)):
                accumulated_usage[k] = accumulated_usage.get(k, 0) + v

        stop_reason = msg.stop_reason or "end_turn"
        content_blocks = [b.model_dump() for b in (msg.content or [])]

        tool_use_blocks = [b for b in content_blocks if b.get("type") == "tool_use"]

        # Repeat-tool break for Claude.
        if tool_use_blocks:
            fp = _canonical_tool_calls(tool_use_blocks)
            if prev_call_fingerprint is not None and fp == prev_call_fingerprint:
                return "[noticed repeat tool call — answering directly]", accumulated_usage
            prev_call_fingerprint = fp

        if not tool_use_blocks or not use_tools or _round >= _MAX_TOOL_ROUNDS:
            for block in content_blocks:
                if block.get("type") == "text":
                    return block["text"], accumulated_usage
            return "[claude: no text in response]", accumulated_usage

        current_messages.append({"role": "assistant", "content": content_blocks})

        tool_results = []
        for block in tool_use_blocks:
            name = block.get("name", "")
            tool_id = block.get("id", "")
            args = block.get("input", {})
            result = await execute_tool(name, args)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": result,
            })

        current_messages.append({"role": "user", "content": tool_results})

    return "[claude: tool loop exhausted]", accumulated_usage
# 652:153
