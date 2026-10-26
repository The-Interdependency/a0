# 176:55 0:0 2:1
"""attachments — attachment resolution, extraction, and provider message building.

Extracted from inference.py. Activated only when a message carries
`attachments` — zero cost on text-only turns.

Handles four provider-specific multimodal shapes:
  - OpenAI-style (supports_vision flag): image_url content parts
  - Claude native: image source blocks
  - Gemini: inline_data passthrough for gemini_native
  - Unknown providers: text only, explicit [N images dropped] marker

Document attachments (PDF, text, code) are always extracted to text and
folded into the user turn's content regardless of provider, so every
model can read them even without vision capability.
"""
from __future__ import annotations

# === MODULE_BUILD ===
# id: a0_service_attachments
#   module_name: attachments
#   module_kind: service
#   summary: Attachment resolution, text/document extraction, and provider-specific multimodal message building (OpenAI image_url, Claude image blocks, Gemini inline_data); extracted from inference.py and active only when a message carries attachments.
#   owner: Erin Spencer
#   public_surface: build_provider_messages
#   internal_surface: _resolve_attachment_path, _read_attachment_b64, _extract_pdf_text, _extract_text_file, _extract_document_text, _att_kind
#   auth_boundary: none
#   storage_boundary: read
#   network_boundary: none
#   user_data_boundary: read
#   admin_only: false
#   tests: hmmm
#   rollout: default_enabled
#   rollback: Revert this file; only affects multimodal/document turns — text-only turns are unaffected.
#   requires: none
#   since: 2026-06-02
#   unresolved: none
# === END MODULE_BUILD ===

import os
import logging
from typing import Optional

_log = logging.getLogger("a0p.attachments")

# ── Path resolution ──────────────────────────────────────────────────────────

def _resolve_attachment_path(storage_url: str) -> Optional[str]:
    """Map a storage_url like '/uploads/foo.png' to an absolute local path.

    Rejects any path that resolves outside the project uploads/ directory.
    lstrip('/') alone does NOT stop '..' segments — the realpath + commonpath
    check below is what actually contains the lookup.
    """
    if not storage_url:
        return None
    base = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    uploads_root = os.path.realpath(os.path.join(base, "uploads"))

    # Only allow URLs that explicitly point into uploads.
    # This avoids resolving arbitrary project-relative paths.
    s = storage_url.strip()
    if not s or ("\x00" in s) or any(ord(ch) < 32 for ch in s):
        _log.warning("attachment path rejected (invalid characters): %s", storage_url)
        return None

    if s.startswith("/uploads/"):
        rel_under_uploads = s[len("/uploads/"):]
    elif s.startswith("uploads/"):
        rel_under_uploads = s[len("uploads/"):]
    else:
        _log.warning("attachment path rejected (not uploads scoped): %s", storage_url)
        return None

    rel_norm = os.path.normpath(rel_under_uploads)
    if rel_norm in ("", ".") or os.path.isabs(rel_norm) or rel_norm == ".." or rel_norm.startswith(".."+os.sep):
        _log.warning("attachment path traversal blocked: %s", storage_url)
        return None

    abs_path = os.path.realpath(os.path.join(uploads_root, rel_norm))
    try:
        if os.path.commonpath([uploads_root, abs_path]) != uploads_root:
            _log.warning("attachment path traversal blocked: %s", storage_url)
            return None
    except ValueError:
        return None
    return abs_path if os.path.isfile(abs_path) else None


def _read_attachment_b64(storage_url: str) -> Optional[tuple[str, str]]:
    """Return (mime_type, base64_data) for a local file, or None on any error."""
    import base64
    import mimetypes
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


# ── Text extraction ──────────────────────────────────────────────────────────

_DOC_TEXT_CAP = 100_000


def _extract_pdf_text(abs_path: str) -> str:
    """Extract text page by page via pypdf. Per-page errors are isolated."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return "[pdf extraction unavailable: pypdf not installed]"
    try:
        reader = PdfReader(abs_path)
    except Exception as e:
        _log.exception("PDF open failed for attachment path=%r", abs_path)
        return f"[pdf open failed: {type(e).__name__}]"
    pages: list[str] = []
    total = len(reader.pages)
    for i, page in enumerate(reader.pages):
        try:
            txt = page.extract_text() or ""
        except Exception as e:
            txt = f"[page {i + 1} extract failed: {type(e).__name__}]"
        pages.append(f"--- page {i + 1}/{total} ---\n{txt}")
        if sum(len(p) for p in pages) > _DOC_TEXT_CAP * 1.2:
            pages.append(f"[truncated: stopped at page {i + 1} of {total}]")
            break
    return "\n\n".join(pages)


def _extract_text_file(abs_path: str) -> str:
    """Read a UTF-8 (latin-1 fallback) text/code file."""
    try:
        with open(abs_path, "rb") as fh:
            raw = fh.read()
    except OSError as e:
        _log.exception("Attachment read failed for path=%r", abs_path)
        return f"[read failed: {type(e).__name__}]"
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("latin-1", errors="replace")


def _extract_document_text(storage_url: str, mime_type: str, name: str = "") -> str:
    """Return textual contents of a document attachment, capped and labeled.

    Always returns a non-empty string (error message on failure) so the model
    never silently omits an attachment the user uploaded.
    """
    p = _resolve_attachment_path(storage_url)
    if not p:
        return f"[attachment not found on disk: {storage_url}]"
    label = name or os.path.basename(p)
    mt = (mime_type or "").lower()
    if mt == "application/pdf" or p.lower().endswith(".pdf"):
        body = _extract_pdf_text(p)
    else:
        body = _extract_text_file(p)
    if len(body) > _DOC_TEXT_CAP:
        body = body[:_DOC_TEXT_CAP] + f"\n\n[truncated: showing first {_DOC_TEXT_CAP} chars of {len(body)}]"
    header = f"[attachment: {label} ({mt or 'unknown mime'})]"
    return f"{header}\n{body}"


def _att_kind(att: dict) -> str:
    """Classify an attachment as 'image' or 'document' from kind field or mime."""
    k = (att.get("kind") or "").lower()
    if k in ("image", "document"):
        return k
    mt = (att.get("mime_type") or "").lower()
    if mt.startswith("image/"):
        return "image"
    return "document"


# ── Provider message builder ─────────────────────────────────────────────────

def build_provider_messages(messages: list[dict], provider_id: str) -> list[dict]:
    """Convert {role, content, attachments?} messages into provider-specific shape.

    Only user-role messages carry attachments. Documents are always extracted
    to text. Images go to the provider-specific vision format (or are dropped
    with an explicit marker on providers without vision capability).
    """
    from .energy_registry import BUILTIN_PROVIDERS

    out: list[dict] = []
    for m in messages:
        atts = m.get("attachments") or []
        base = {k: v for k, v in m.items() if k != "attachments"}
        if not atts or m.get("role") != "user":
            out.append(base)
            continue
        text = base.get("content") if isinstance(base.get("content"), str) else ""

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
        composed_text = text
        if doc_blocks:
            composed_text = (text + "\n\n" if text else "") + "\n\n".join(doc_blocks)

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
            inline = []
            for a in images:
                pair = _read_attachment_b64(a.get("storage_url", ""))
                if not pair:
                    continue
                mime, data = pair
                inline.append({"mime_type": mime, "data_b64": data})
            out.append({**base, "content": composed_text, "attachments": inline})
            continue

        if images:
            _log.warning(
                "provider %r has no multimodal adapter; %d image attachment(s) dropped",
                provider_id, len(images),
            )
            marker = f"\n\n[{len(images)} image attachment(s) dropped: provider {provider_id!r} has no vision adapter]"
            composed_text = (composed_text or "") + marker
        out.append({**base, "content": composed_text})
    return out
# 176:55 0:0 2:1
