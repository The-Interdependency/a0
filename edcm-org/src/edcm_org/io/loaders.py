"""
EDCM-Org Data Loaders.

Supported input formats:
  - Plain text (.txt) — meeting transcripts, discussion logs
  - CSV (.csv) — ticket/issue data with configurable column mapping

All loaders return plain text or structured dicts. No PII is returned
(apply EDCMPrivacyGuard after loading if raw data may contain PII).
"""

from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Dict, List, Optional


def load_meeting_text(path: str | Path) -> str:
    """
    Load a plain-text meeting transcript or discussion log.

    Parameters
    ----------
    path : str or Path
        Path to a .txt file.

    Returns
    -------
    str
        Full text content.
    """
    return Path(path).read_text(encoding="utf-8")


def load_tickets_csv(
    path: str | Path,
    text_columns: Optional[List[str]] = None,
    status_column: Optional[str] = "status",
    resolved_values: Optional[List[str]] = None,
) -> Dict[str, object]:
    """
    Load ticket/issue data from a CSV file.

    Parameters
    ----------
    path : str or Path
        Path to a .csv file.
    text_columns : List[str], optional
        Column names whose text content should be concatenated for metric analysis.
        Defaults to ['title', 'description', 'comments'].
    status_column : str, optional
        Column name for ticket status. Default: 'status'.
    resolved_values : List[str], optional
        Values in status_column that indicate resolution.
        Defaults to ['done', 'resolved', 'closed', 'completed'].

    Returns
    -------
    dict with keys:
      'text'            : str — concatenated text from text_columns
      'total'           : int — total ticket count
      'resolved'        : int — resolved ticket count
      'resolution_rate' : float — resolved / total
      'rows'            : List[dict] — all rows (with PII fields not stripped yet)
    """
    if text_columns is None:
        text_columns = ["title", "description", "comments"]
    if resolved_values is None:
        resolved_values = {"done", "resolved", "closed", "completed"}
    else:
        resolved_values = set(v.lower() for v in resolved_values)

    rows: List[Dict[str, str]] = []
    with open(path, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(dict(row))

    # Concatenate text fields
    text_parts = []
    for row in rows:
        for col in text_columns:
            val = row.get(col, "").strip()
            if val:
                text_parts.append(val)

    full_text = "\n".join(text_parts)

    # Resolution rate
    total = len(rows)
    resolved = sum(
        1 for row in rows
        if row.get(status_column, "").strip().lower() in resolved_values
    )
    resolution_rate = resolved / total if total > 0 else 0.0

    return {
        "text": full_text,
        "total": total,
        "resolved": resolved,
        "resolution_rate": resolution_rate,
        "rows": rows,
    }


def window_meeting_text(text: str, window_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Split a long meeting transcript into overlapping word-count windows.

    Parameters
    ----------
    text        : Full meeting text.
    window_size : Target words per window.
    overlap     : Words of overlap between consecutive windows.

    Returns
    -------
    List[str]
        List of window text strings.
    """
    words = text.split()
    if not words:
        return []

    windows = []
    step = max(1, window_size - overlap)
    start = 0
    while start < len(words):
        end = min(start + window_size, len(words))
        windows.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start += step

    return windows
