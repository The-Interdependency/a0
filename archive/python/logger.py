# 268:4 0:0 4:1
# NOTE: 447 lines — over the 400-line guideline. Split on next modification.
import asyncio
import json
import os
from datetime import datetime
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, List, Optional

LOGS_DIR = Path("logs").resolve()
TRANSCRIPTS_DIR = LOGS_DIR / "transcripts"
AI_TRANSCRIPTS_DIR = LOGS_DIR / "ai-transcripts"

LOG_STREAMS: Dict[str, str] = {
    "master": "a0p-master.jsonl",
    "edcm": "edcm-metrics.jsonl",
    "memory": "memory-tensor.jsonl",
    "sentinel": "sentinel-memory.jsonl",
    "interference": "memory-interference.jsonl",
    "attribution": "memory-attribution.jsonl",
    "omega": "omega-autonomy.jsonl",
    "psi": "psi-selfmodel.jsonl",
    "openai_events": "openai-events.jsonl",
    "openai_hmmm": "openai-hmmm.jsonl",
}

logging_enabled: bool = True
stream_toggles: Dict[str, bool] = {
    "master": True,
    "edcm": True,
    "memory": True,
    "sentinel": True,
    "interference": True,
    "attribution": True,
    "omega": True,
    "psi": True,
    "transcripts": True,
    "ai-transcripts": True,
    "openai_events": True,
    "openai_hmmm": True,
}
_initialized: bool = False


async def _ensure_dirs() -> None:
    global _initialized
    if _initialized:
        return
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    AI_TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    _initialized = True


def _build_entry(stream: str, subsystem: str, event: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "stream": stream,
        "subsystem": subsystem,
        "event": event,
        "data": data,
    }


async def _append_to_file(file_path: Path, entry: Dict[str, Any]) -> None:
    await _ensure_dirs()
    line = json.dumps(entry) + "\n"
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(line)


def _get_stream_path(stream: str) -> Path:
    return LOGS_DIR / LOG_STREAMS[stream]


def set_logging_enabled(enabled: bool) -> None:
    global logging_enabled
    logging_enabled = enabled


def set_stream_toggle(stream: str, enabled: bool) -> None:
    stream_toggles[stream] = enabled


def get_stream_toggles() -> Dict[str, bool]:
    return dict(stream_toggles)


def is_stream_enabled(stream: str) -> bool:
    return logging_enabled and stream_toggles.get(stream, True)


def update_toggles_from_system(params: Optional[Dict[str, Any]]) -> None:
    global logging_enabled
    if not params:
        return
    if isinstance(params.get("enabled"), bool):
        logging_enabled = params["enabled"]
    if isinstance(params.get("streams"), dict):
        for k, v in params["streams"].items():
            if isinstance(v, bool):
                stream_toggles[k] = v


async def log_master(subsystem: str, event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("master"):
        return
    entry = _build_entry("master", subsystem, event, data)
    try:
        await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger master write error: {e}")


async def log_edcm(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("edcm"):
        return
    entry = _build_entry("edcm", "edcm", event, data)
    try:
        await _append_to_file(_get_stream_path("edcm"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger edcm write error: {e}")


async def log_memory(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("memory"):
        return
    entry = _build_entry("memory", "memory_tensor", event, data)
    try:
        await _append_to_file(_get_stream_path("memory"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger memory write error: {e}")


async def log_sentinel(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("sentinel"):
        return
    entry = _build_entry("sentinel", "sentinel", event, data)
    try:
        await _append_to_file(_get_stream_path("sentinel"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger sentinel write error: {e}")


async def log_interference(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("interference"):
        return
    entry = _build_entry("interference", "memory_interference", event, data)
    try:
        await _append_to_file(_get_stream_path("interference"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger interference write error: {e}")


async def log_attribution(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("attribution"):
        return
    entry = _build_entry("attribution", "memory_attribution", event, data)
    try:
        await _append_to_file(_get_stream_path("attribution"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger attribution write error: {e}")


async def log_omega(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("omega"):
        return
    entry = _build_entry("omega", "omega_autonomy", event, data)
    try:
        await _append_to_file(_get_stream_path("omega"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger omega write error: {e}")


async def log_psi(event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("psi"):
        return
    entry = _build_entry("psi", "psi_selfmodel", event, data)
    try:
        await _append_to_file(_get_stream_path("psi"), entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), entry)
    except Exception as e:
        print(f"Logger psi write error: {e}")


async def log_transcript(transcript_hash: str, event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("transcripts"):
        return
    timestamp = int(datetime.utcnow().timestamp() * 1000)
    h = transcript_hash or sha256(str(timestamp).encode()).hexdigest()[:12]
    filename = f"transcript-{timestamp}-{h}.jsonl"
    file_path = TRANSCRIPTS_DIR / filename
    entry = _build_entry("transcript", "transcript", event, {**data, "transcriptHash": h})
    try:
        await _append_to_file(file_path, entry)
        if is_stream_enabled("master"):
            await _append_to_file(_get_stream_path("master"), {**entry, "data": {**entry["data"], "transcriptFile": filename}})
    except Exception as e:
        print(f"Logger transcript write error: {e}")


async def append_to_transcript(filename: str, event: str, data: Dict[str, Any]) -> None:
    if not is_stream_enabled("transcripts"):
        return
    file_path = TRANSCRIPTS_DIR / filename
    entry = _build_entry("transcript", "transcript", event, data)
    try:
        await _append_to_file(file_path, entry)
    except Exception as e:
        print(f"Logger transcript append error: {e}")


async def read_log_stream(stream: str, offset: int = 0, limit: int = 100) -> Dict[str, Any]:
    file_path = _get_stream_path(stream)
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        lines = [l for l in content.strip().split("\n") if l]
        total = len(lines)
        start_idx = max(0, total - offset - limit)
        end_idx = max(0, total - offset)
        sliced = lines[start_idx:end_idx]
        entries = []
        for line in reversed(sliced):
            try:
                entries.append(json.loads(line))
            except Exception:
                entries.append({"raw": line})
        return {"entries": entries, "total": total}
    except FileNotFoundError:
        return {"entries": [], "total": 0}


async def read_transcript_log(filename: str) -> List[Dict[str, Any]]:
    file_path = TRANSCRIPTS_DIR / filename
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        result = []
        for line in content.strip().split("\n"):
            if not line:
                continue
            try:
                result.append(json.loads(line))
            except Exception:
                result.append({"raw": line})
        return result
    except FileNotFoundError:
        return []


async def list_transcripts() -> List[Dict[str, Any]]:
    await _ensure_dirs()
    try:
        files = sorted(
            [f for f in TRANSCRIPTS_DIR.iterdir() if f.suffix == ".jsonl"],
            key=lambda x: x.name,
            reverse=True,
        )
        results = []
        for f in files:
            stat = f.stat()
            results.append({
                "filename": f.name,
                "size": stat.st_size,
                "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            })
        return results
    except Exception:
        return []


async def get_log_stats() -> Dict[str, Dict[str, Any]]:
    await _ensure_dirs()
    stats: Dict[str, Dict[str, Any]] = {}
    for stream, filename in LOG_STREAMS.items():
        file_path = LOGS_DIR / filename
        try:
            stat = file_path.stat()
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            lines = len([l for l in content.strip().split("\n") if l])
            stats[stream] = {"size": stat.st_size, "lines": lines}
        except FileNotFoundError:
            stats[stream] = {"size": 0, "lines": 0}
    return stats


# AI-transcript and OpenAI-event helpers have moved to logger_ai.py.
# Re-exported here for backward-compat (callers that do
# `from .logger import log_openai_event` continue to work).
from .logger_ai import (  # noqa: E402
    log_ai_transcript,
    read_ai_transcripts,
    log_openai_event,
    seed_openai_hmmm_if_empty,
    append_openai_hmmm,
    read_openai_hmmm,
    list_ai_transcript_files,
)

__all__ = [
    "log_ai_transcript",
    "read_ai_transcripts",
    "log_openai_event",
    "seed_openai_hmmm_if_empty",
    "append_openai_hmmm",
    "read_openai_hmmm",
    "list_ai_transcript_files",
]
# 268:4 0:0 4:1
