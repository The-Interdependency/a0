from __future__ import annotations

from typing import Any, Dict, List


def run_whisper_segments(files: List[str]) -> Dict[str, Any]:
    """Transcribe audio files using OpenAI Whisper (local model).

    Falls back to stub if openai-whisper is not installed.
    Install with: pip install openai-whisper
    """
    try:
        import whisper  # type: ignore[import]
    except ImportError:
        return {"tool": "whisper", "status": "stub", "files": files,
                "note": "install openai-whisper to enable: pip install openai-whisper"}

    model = whisper.load_model("base")
    results = []
    for path in files:
        try:
            result = model.transcribe(path)
            segments = [
                {"start": s["start"], "end": s["end"], "text": s["text"]}
                for s in result.get("segments", [])
            ]
            results.append({"file": path, "text": result.get("text", ""), "segments": segments})
        except Exception as exc:
            results.append({"file": path, "error": str(exc)})

    return {"tool": "whisper", "status": "ok", "results": results}
