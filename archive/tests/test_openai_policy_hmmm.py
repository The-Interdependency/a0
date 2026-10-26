# 13:0 0:0 0:0
import json
from pathlib import Path


_POLICY_PATH = Path(__file__).resolve().parents[1] / "python" / "config" / "openai_policy.json"
_HMMM_FIELDS = ("unresolved_constraint", "honest_incompletion", "continuation_marker")


def test_openai_hmmm_seed_items_use_structured_fields():
    items = json.loads(_POLICY_PATH.read_text(encoding="utf-8"))["hmmm"]["items"]

    assert items
    for item in items:
        assert "note" not in item
        for field in _HMMM_FIELDS:
            assert isinstance(item[field], str)
            assert item[field]
        assert len({item[field] for field in _HMMM_FIELDS}) > 1
# 13:0 0:0 0:0
