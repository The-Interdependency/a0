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
                [f.name for f in AI_TRANSCRIPTS_DIR.iterdir() if f.name.startswith("ai-transcript-") and f.name.endswith(".jsonl")],
                reverse=True,
            )
            files = all_files

        all_entries = []
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
        sliced = all_entries[offset:offset + limit]
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
            [f for f in AI_TRANSCRIPTS_DIR.iterdir() if f.name.startswith("ai-transcript-") and f.name.endswith(".jsonl")],
            key=lambda x: x.name,
            reverse=True,
        )
        results = []
        for f in files:
            stat = f.stat()
            import re
            m = re.search(r"ai-transcript-(\d{4}-\d{2}-\d{2})\.jsonl", f.name)
            results.append({
                "filename": f.name,
                "size": stat.st_size,
                "date": m.group(1) if m else "",
            })
        return results
    except Exception:
        return []
