from __future__ import annotations

from typing import Any, Dict, List


def run_pdf_extract(files: List[str]) -> Dict[str, Any]:
    """Extract text from PDF files using pypdf.

    Falls back to stub if pypdf is not installed.
    Install with: pip install pypdf
    """
    try:
        from pypdf import PdfReader  # type: ignore[import]
    except ImportError:
        return {"tool": "pdf_extract", "status": "stub", "files": files,
                "note": "install pypdf to enable: pip install pypdf"}

    results = []
    for path in files:
        try:
            reader = PdfReader(path)
            pages = [page.extract_text() or "" for page in reader.pages]
            results.append({"file": path, "pages": len(pages), "text": "\n\n".join(pages)})
        except Exception as exc:
            results.append({"file": path, "error": str(exc)})

    return {"tool": "pdf_extract", "status": "ok", "results": results}
