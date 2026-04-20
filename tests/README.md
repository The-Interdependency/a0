# a0p tests

Minimal smoke-test scaffolding. The goal is regression coverage on the
load-bearing surfaces, not exhaustive unit coverage.

## Layout

- `conftest.py` — path setup so tests can `import python.*`
- `test_skills.py` — a0-native skill loader, manifest, recommend, load tools
- `test_route_imports.py` — every route module imports cleanly + UI meta collects
- `test_live_server.py` — HTTP smoke against `localhost:5000` (auto-skipped if down)

## Run

```bash
uv run pytest tests/ -v
```

Or just the offline tests (skip live-server suite explicitly):

```bash
uv run pytest tests/ -v --ignore=tests/test_live_server.py
```

## What's intentionally not here yet

- Frontend component tests (vitest scaffold is a separate task)
- e2e flow tests (Playwright; the `e2e/` dir is reserved)
- Database integration tests (need an ephemeral Postgres fixture)
- Provider call tests (need recorded cassettes; `vcrpy` is the right tool)

Add new offline smoke tests freely. Add live-server tests only when the
behavior cannot be verified at the import/unit layer.
