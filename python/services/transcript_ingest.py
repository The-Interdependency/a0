# 191:43
"""Transcript ingestion — parser dispatch + persistence driver.

Accepts raw bytes from an upload, auto-detects format, normalizes to a
SPEAKER: text form edcmbone's parser handles cleanly, scores via
compute_transcript_full, writes:
  - transcript_reports row (avgs, peak, risk, correction_fidelity, etc.)
  - transcript_messages rows (per-round drill-down)
  - transcript_sources upsert (by slug)
  - transcript_uploads row update (status=done, report_id linked)

Honest errors: any parser/scoring failure raises and the upload row is
marked status='error' with the message captured. No silent fallback.

Supported formats (auto-detect by extension + content sniff):
  .txt / .md                  → plain text
  .pdf                        → pypdf text extraction
  .html / .htm                → regex strip + entity decode
  .json                       → ChatGPT export OR a0p conversations.json
  .zip                        → extracted, recursed, per-file breakdown
"""
import html as _html
import io
import json
import re
import zipfile
from datetime import datetime
from typing import Any

import pypdf

from ..storage import storage
from .edcm import compute_transcript_full

SYNC_BYTE_LIMIT = 256 * 1024            # ≤256KB processes inline; > queues async
MAX_UPLOAD_BYTES = 25 * 1024 * 1024     # 25 MB hard cap on raw upload
MAX_ZIP_MEMBERS = 200                   # max files per zip
MAX_ZIP_MEMBER_BYTES = 8 * 1024 * 1024  # max uncompressed bytes per zip member
MAX_ZIP_TOTAL_BYTES = 64 * 1024 * 1024  # max total uncompressed bytes across zip
SUPPORTED_EXTS = {".txt", ".md", ".pdf", ".html", ".htm", ".json", ".zip"}


def _slugify(name: str) -> str:
    """Filename → safe lowercase slug ≤100 chars."""
    base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return (base or "transcript")[:100]


def _strip_html(raw: str) -> str:
    """Lightweight HTML → text. Drops scripts/styles, strips tags, decodes entities."""
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"</p>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<[^>]+>", " ", raw)
    return _html.unescape(raw)


def _pdf_to_text(data: bytes) -> str:
    """Extract concatenated page text from a PDF byte stream."""
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for p in reader.pages:
        try:
            pages.append(p.extract_text() or "")
        except Exception as e:
            pages.append(f"[pdf page extract failed: {e}]")
    return "\n\n".join(pages)


def _json_to_transcript(raw: str) -> str:
    """Render various JSON shapes to SPEAKER: text\n form.

    Recognized shapes (best-effort):
      - ChatGPT export: list of dicts with 'mapping' (tree of message nodes)
      - a0p / generic: list of dicts with role+content OR
        single dict with 'messages': [{role, content}]
      - List of {speaker|name|author, text|content|message}
    Falls back to a JSON dump if shape isn't recognized — still scoreable.
    """
    obj = json.loads(raw)
    lines: list[str] = []

    def emit(speaker: Any, text: Any) -> None:
        if not text:
            return
        sp = str(speaker or "speaker").upper()
        if isinstance(text, list):
            text = " ".join(str(p.get("text", p) if isinstance(p, dict) else p) for p in text)
        lines.append(f"{sp}: {str(text).strip()}")

    def walk_chatgpt(node: dict) -> None:
        msg = node.get("message") or {}
        author = (msg.get("author") or {}).get("role")
        content = msg.get("content") or {}
        parts = content.get("parts") if isinstance(content, dict) else None
        if author and parts:
            emit(author, " ".join(str(p) for p in parts if p))

    if isinstance(obj, list):
        for item in obj:
            if not isinstance(item, dict):
                continue
            if "mapping" in item and isinstance(item["mapping"], dict):
                # ChatGPT export — flatten the mapping tree in node order
                for node in item["mapping"].values():
                    if isinstance(node, dict):
                        walk_chatgpt(node)
            elif "messages" in item and isinstance(item["messages"], list):
                for m in item["messages"]:
                    if isinstance(m, dict):
                        emit(m.get("role") or m.get("speaker"),
                             m.get("content") or m.get("text") or m.get("message"))
            else:
                # Flat list of message-shaped dicts
                emit(item.get("role") or item.get("speaker") or item.get("author") or item.get("name"),
                     item.get("content") or item.get("text") or item.get("message"))
    elif isinstance(obj, dict):
        if "messages" in obj and isinstance(obj["messages"], list):
            for m in obj["messages"]:
                if isinstance(m, dict):
                    emit(m.get("role") or m.get("speaker"),
                         m.get("content") or m.get("text") or m.get("message"))
        else:
            # Last resort — flatten as one big speaker
            lines.append(f"DOC: {json.dumps(obj)[:5000]}")

    if not lines:
        # Nothing extracted — preserve raw JSON as one document
        lines.append(f"DOC: {raw[:10000]}")
    return "\n".join(lines)


def extract_text(filename: str, data: bytes) -> str:
    """Auto-detect format and extract canonical text. Raises ValueError on unsupported ext."""
    name = filename.lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""
    if ext not in SUPPORTED_EXTS:
        raise ValueError(f"unsupported file extension: {ext} (allowed: {sorted(SUPPORTED_EXTS)})")
    if ext == ".pdf":
        return _pdf_to_text(data)
    text = data.decode("utf-8", errors="replace")
    if ext in (".html", ".htm"):
        return _strip_html(text)
    if ext == ".json":
        return _json_to_transcript(text)
    return text  # .txt, .md


def _ingest_zip(filename: str, data: bytes) -> tuple[str, list[dict[str, Any]]]:
    """Extract every supported file inside a zip, return (joined_text, file_breakdown).

    file_breakdown captures per-file metrics so the final report can show
    which file contributed which signal.
    """
    joined: list[str] = []
    breakdown: list[dict[str, Any]] = []
    total_bytes = 0
    member_count = 0
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_MEMBERS:
            raise ValueError(f"zip has {len(infos)} members; cap is {MAX_ZIP_MEMBERS}")
        for info in infos:
            member = info.filename
            if member.endswith("/"):
                continue
            ext = "." + member.rsplit(".", 1)[-1].lower() if "." in member else ""
            if ext not in SUPPORTED_EXTS or ext == ".zip":
                continue
            if info.file_size > MAX_ZIP_MEMBER_BYTES:
                breakdown.append({"file": member, "skipped": f"oversize ({info.file_size}B > {MAX_ZIP_MEMBER_BYTES})"})
                continue
            if total_bytes + info.file_size > MAX_ZIP_TOTAL_BYTES:
                breakdown.append({"file": member, "skipped": "total extracted budget exhausted"})
                break
            member_count += 1
            try:
                inner = zf.read(member)
                total_bytes += len(inner)
                inner_text = extract_text(member, inner)
                if not inner_text.strip():
                    breakdown.append({"file": member, "skipped": "empty after extract"})
                    continue
                # Per-file score for breakdown (cheap; no message persistence here)
                inner_report = compute_transcript_full(inner_text)
                breakdown.append({
                    "file": member,
                    "rounds": inner_report["message_count"],
                    "avg_cm": inner_report["avg_cm"],
                    "avg_drift": inner_report["avg_drift"],
                    "peak": inner_report["peak_metric"],
                    "peak_metric": inner_report["peak_metric_name"],
                })
                joined.append(f"--- FILE: {member} ---\n{inner_text}")
            except Exception as e:
                breakdown.append({"file": member, "error": str(e)[:240]})
    if not joined:
        raise ValueError(f"zip {filename}: no scoreable files inside")
    return "\n\n".join(joined), breakdown


async def ingest_upload(upload_id: int, filename: str, data: bytes) -> dict[str, Any]:
    """Drive the full ingestion: parse → score → persist report+messages → close upload row.

    Marks upload status='done' on success, 'error' on failure (with message).
    Returns the created report dict (or raises on failure with upload row updated).
    """
    try:
        ext = "." + filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if ext == ".zip":
            text, breakdown = _ingest_zip(filename, data)
        else:
            text = extract_text(filename, data)
            breakdown = [{"file": filename, "bytes": len(data)}]

        report = compute_transcript_full(text)
        slug = _slugify(filename.rsplit(".", 1)[0])
        await storage.upsert_transcript_source(slug, filename, file_count=len(breakdown))

        report_row = await storage.create_transcript_report({
            "source_slug": slug,
            "message_count": report["message_count"],
            "avg_cm": report["avg_cm"],
            "avg_da": report["avg_da"],
            "avg_drift": report["avg_drift"],
            "avg_dvg": report["avg_dvg"],
            "avg_int": report["avg_int"],
            "avg_tbf": report["avg_tbf"],
            "peak_metric": report["peak_metric"],
            "peak_metric_name": report["peak_metric_name"],
            "directives_fired": report["directives_fired"],
            "top_snippets": report["top_snippets"],
            "file_breakdown": breakdown,
            "risk_loop": report["risk_loop"],
            "risk_fixation": report["risk_fixation"],
            "correction_fidelity": report["correction_fidelity"],
            "edcmbone_version": report["edcmbone_version"],
        })

        # Persist per-round messages for drill-in
        msgs = [{
            "idx": r["round_index"],
            "speaker": "round",
            "content": r["snippet"],
            "cm": r["cm"], "da": r["da"], "drift": r["drift"], "dvg": r["dvg"],
            "int_val": r["int_val"], "tbf": r["tbf"],
            "directives_fired": r["directives_fired"],
        } for r in report["per_round"]]
        await storage.add_transcript_messages_bulk(report_row["id"], msgs)

        await storage.update_transcript_upload(
            upload_id,
            status="done",
            source_slug=slug,
            report_id=report_row["id"],
            finished_at=datetime.utcnow(),
        )
        return report_row
    except Exception as e:
        await storage.update_transcript_upload(
            upload_id,
            status="error",
            error=f"{type(e).__name__}: {e}"[:500],
            finished_at=datetime.utcnow(),
        )
        raise
# 191:43
