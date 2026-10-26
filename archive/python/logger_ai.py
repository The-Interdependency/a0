# 152:6 0:0 1:1
"""AI-transcript and OpenAI-event logging helpers.

Split from logger.py (Task: module-size doctrine).
Imports low-level primitives from logger.py; callers can use either
`from .logger import <fn>` (for the core stream functions) or
`from .logger_ai import <fn>` (for these AI-specific helpers).
"""
import json
import re
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, List, Optional

from .logger import (
    AI_TRANSCRIPTS_DIR,
    _append_to_file,
    _build_entry,
    _ensure_dirs,
    _get_stream_path,
    is_stream_enabled,
)


async def log_ai_transcript(entry: Dict[str, Any]) -> None:
    if not is_stream_enabled("ai-transcripts"):
        return
    await _ensure_dirs()
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    file_path = AI_TRANSCRIPTS_DIR / f"ai-transcript-{date_str}.jsonl"
    try:
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as e:
        print(f"Logger ai-transcript write error: {e}")


async def read_ai_transcripts(
    date: Optional[str] = None,
    model: Optional[str] = None,
    offset: int = 0,
    limit: int = 50,
) -> Dict[str, Any]:
    await _ensure_dirs()
    try:
        if date:
            files = [f"ai-transcript-{date}.jsonl"]
        else:
            all_files = sorted(
                [
                    f.name
                    for f in AI_TRANSCRIPTS_DIR.iterdir()
                    if f.name.startswith("ai-transcript-") and f.name.endswith(".jsonl")
                ],
                reverse=True,
            )
            files = all_files

        all_entries: list = []
        for filename in files:
            file_path = AI_TRANSCRIPTS_DIR / filename
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            entry = json.loads(line)
                            if model and entry.get("model") != model:
                                continue
                            all_entries.append(entry)
                        except Exception:
                            pass
            except FileNotFoundError:
                pass

        all_entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
        total = len(all_entries)
        sliced = all_entries[offset : offset + limit]
        return {"entries": sliced, "total": total}
    except FileNotFoundError:
        return {"entries": [], "total": 0}


async def log_openai_event(
    role: str,
    model: str,
    reasoning_effort: str,
    input_text: str,
    output_text: str,
    approval_state: str,
) -> None:
    if not is_stream_enabled("openai_events"):
        return
    input_token_hash = sha256(input_text.encode()).hexdigest()
    output_token_hash = sha256(output_text.encode()).hexdigest()
    entry = _build_entry("openai_events", "openai", "call", {
        "role": role,
        "model": model,
        "reasoning_effort": reasoning_effort,
        "input_token_hash": input_token_hash,
        "output_token_hash": output_token_hash,
        "approval_state": approval_state,
    })
    try:
        await _append_to_file(_get_stream_path("openai_events"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger openai_events write error: {e}")


async def seed_openai_hmmm_if_empty(items: List[Dict[str, Any]]) -> None:
    hmmm_path = _get_stream_path("openai_hmmm")
    await _ensure_dirs()
    if hmmm_path.exists() and hmmm_path.stat().st_size > 0:
        return
    for item in items:
        entry = _build_entry("openai_hmmm", "openai", "hmmm_item", item)
        try:
            await _append_to_file(hmmm_path, entry)
        except Exception as e:
            print(f"Logger openai_hmmm seed error: {e}")


async def append_openai_hmmm(item: Dict[str, Any]) -> None:
    if not is_stream_enabled("openai_hmmm"):
        return
    entry = _build_entry("openai_hmmm", "openai", "hmmm_item", item)
    try:
        await _append_to_file(_get_stream_path("openai_hmmm"), entry)
    except Exception as e:
        print(f"Logger openai_hmmm write error: {e}")


async def read_openai_hmmm(limit: int = 100) -> List[Dict[str, Any]]:
    hmmm_path = _get_stream_path("openai_hmmm")
    try:
        with open(hmmm_path, "r", encoding="utf-8") as f:
            lines = [l.strip() for l in f if l.strip()]
        results = []
        for line in lines[-limit:]:
            try:
                results.append(json.loads(line))
            except Exception:
                results.append({"raw": line})
        return results
    except FileNotFoundError:
        return []


async def list_ai_transcript_files() -> List[Dict[str, Any]]:
    await _ensure_dirs()
    try:
        files = sorted(
            [
                f
                for f in AI_TRANSCRIPTS_DIR.iterdir()
                if f.name.startswith("ai-transcript-") and f.name.endswith(".jsonl")
            ],
            key=lambda x: x.name,
            reverse=True,
        )
        results = []
        for f in files:
            stat = f.stat()
            m = re.search(r"ai-transcript-(\d{4}-\d{2}-\d{2})\.jsonl", f.name)
            results.append({
                "filename": f.name,
                "size": stat.st_size,
                "date": m.group(1) if m else "",
            })
        return results
    except Exception:
        return []
# 152:6 0:0 1:1
