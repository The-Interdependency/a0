# 90:4
"""image_generate — Google Imagen image generation, archived through artifacts."""
import os

SCHEMA = {
    "type": "function",
    "function": {
        "name": "image_generate",
        "description": (
            "Generate a new image from a text prompt using Google Imagen. "
            "The PNG is auto-archived through the artifacts module; you'll "
            "receive {artifacts: [{id, url, kind, ...}], count: 1}. "
            "Use for infographics, illustrations, diagrams, or any visual the "
            "user requested. Fails explicitly on provider error — no silent fallbacks."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Detailed natural-language description of the image to generate.",
                },
                "aspect_ratio": {
                    "type": "string",
                    "enum": ["1:1", "16:9", "9:16", "4:3", "3:4"],
                    "description": "Output aspect ratio. Default 1:1 (square).",
                    "default": "1:1",
                },
                "style_hint": {
                    "type": "string",
                    "description": "Optional style cue appended to the prompt (e.g. 'minimalist line-art', 'photorealistic', 'flat infographic').",
                },
            },
            "required": ["prompt"],
        },
    },
    "tier": "free",
    "approval_scope": None,
    "enabled": True,
    "category": "media",
    "cost_hint": "high",
    "side_effects": ["network", "billing"],
    "version": 2,
    # Auto-archive into the artifacts table via dispatcher wrapper.
    "produces": {"kind": "image", "mime_pattern": "image/*"},
}

_IMAGE_MODEL = "imagen-3.0-generate-002"
_VALID_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4"}


async def handle(prompt: str = "", aspect_ratio: str = "1:1", style_hint: str | None = None, **_) -> dict:
    """Returns {data, filename, mime, provenance} — the dispatcher's archive
    wrapper picks this up via SCHEMA["produces"] and persists to Object Storage."""
    prompt = (prompt or "").strip()
    if not prompt:
        raise ValueError("image_generate: prompt is required")
    if aspect_ratio not in _VALID_RATIOS:
        aspect_ratio = "1:1"
    full_prompt = f"{prompt}\n\nStyle: {style_hint}" if style_hint else prompt

    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("image_generate: GEMINI_API_KEY not configured")

    from google import genai as _genai
    from google.genai import types as _gtypes

    client = _genai.Client(api_key=api_key)

    def _gen() -> bytes:
        resp = client.models.generate_images(
            model=_IMAGE_MODEL,
            prompt=full_prompt,
            config=_gtypes.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio,
                output_mime_type="image/png",
            ),
        )
        if not getattr(resp, "generated_images", None):
            raise RuntimeError(f"image_generate: provider returned no images for prompt={prompt!r}")
        gi = resp.generated_images[0]
        img = getattr(gi, "image", None) or gi
        data = getattr(img, "image_bytes", None)
        if not data:
            raise RuntimeError("image_generate: provider returned empty image_bytes")
        return data

    import asyncio as _asyncio
    img_bytes = await _asyncio.to_thread(_gen)
    import uuid as _uuid
    filename = f"imagen3_{_uuid.uuid4().hex[:16]}.png"
    return {
        "data": img_bytes,
        "filename": filename,
        "mime": "image/png",
        "provenance": {
            "prompt": prompt,
            "aspect_ratio": aspect_ratio,
            "style_hint": style_hint,
            "model": "imagen-3",
        },
    }
# 90:4
