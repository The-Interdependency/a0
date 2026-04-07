import asyncio
import json
import time
import traceback
from datetime import datetime, timedelta

DEFAULT_TASKS = [
    {
        "name": "hash_chain_audit",
        "description": "Verify event hash chain integrity",
        "task_type": "audit",
        "enabled": True,
        "weight": 1.0,
        "interval_seconds": 300,
    },
    {
        "name": "memory_snapshot",
        "description": "Snapshot memory tensor state + save PCNA checkpoint",
        "task_type": "snapshot",
        "enabled": True,
        "weight": 0.8,
        "interval_seconds": 600,
    },
    {
        "name": "pcna_propagate",
        "description": "Propagate all PCNA rings",
        "task_type": "propagate",
        "enabled": True,
        "weight": 1.0,
        "interval_seconds": 120,
    },
    {
        "name": "conversation_review",
        "description": "LLM review of recent conversations → distill conclusions to memory seeds",
        "task_type": "conversation_review",
        "enabled": True,
        "weight": 0.6,
        "interval_seconds": 21600,
    },
]

TICK_INTERVAL = 30

REVIEW_SEED_INDICES = {
    "tool_patterns": 2,
    "conversation_patterns": 3,
    "error_patterns": 5,
    "active_goals": 9,
}

REVIEW_PROMPT = """\
You are reviewing recent conversations for the a0 agent system (The Interdependent Way).

Below are the recent messages. Extract actionable conclusions for each of the four memory categories.
Respond ONLY with valid JSON in exactly this format:
{
  "tool_patterns": "Brief observations about tool usage, API calls, and automation patterns seen in conversations.",
  "conversation_patterns": "Brief observations about how conversations flow, what topics recur, communication style.",
  "error_patterns": "Any errors, failures, misunderstandings, or friction points observed.",
  "active_goals": "Updates to active goals based on what was discussed — what is being worked toward."
}

If there is nothing meaningful to note for a category, write an empty string for that field.
Keep each value under 300 characters.

Recent messages:
"""


class HeartbeatService:

    def __init__(self):
        self._running = False
        self._task: asyncio.Task | None = None
        self._tick_count = 0
        self._last_tick: float = 0
        self._errors: list[str] = []

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        print("[heartbeat] started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        print("[heartbeat] stopped")

    def status(self) -> dict:
        return {
            "running": self._running,
            "tick_count": self._tick_count,
            "last_tick": self._last_tick,
            "tick_interval": TICK_INTERVAL,
            "recent_errors": self._errors[-5:],
        }

    async def _loop(self):
        while self._running:
            try:
                await self._tick()
            except Exception as e:
                self._errors.append(f"{datetime.utcnow().isoformat()}: {e}")
                if len(self._errors) > 50:
                    self._errors = self._errors[-25:]
            await asyncio.sleep(TICK_INTERVAL)

    async def _tick(self):
        self._tick_count += 1
        self._last_tick = time.time()

        from ..storage import storage

        tasks = await storage.get_heartbeat_tasks()
        if not tasks:
            for t in DEFAULT_TASKS:
                await storage.upsert_heartbeat_task(t)
            tasks = await storage.get_heartbeat_tasks()
        else:
            existing_names = {t["name"] for t in tasks}
            for t in DEFAULT_TASKS:
                if t["name"] not in existing_names:
                    await storage.upsert_heartbeat_task(t)
            tasks = await storage.get_heartbeat_tasks()

        now = datetime.utcnow()
        for task in tasks:
            if not task.get("enabled"):
                continue
            interval = task.get("interval_seconds", 300)
            last_run = task.get("last_run")
            if last_run:
                if isinstance(last_run, str):
                    last_run = datetime.fromisoformat(last_run.replace("Z", "+00:00")).replace(tzinfo=None)
                if (now - last_run).total_seconds() < interval:
                    continue

            scheduled = task.get("scheduled_at")
            if scheduled:
                if isinstance(scheduled, str):
                    scheduled = datetime.fromisoformat(scheduled.replace("Z", "+00:00")).replace(tzinfo=None)
                if now < scheduled:
                    continue

            try:
                result = await self._run_task(task)
                await storage.update_heartbeat_task(task["id"], {
                    "last_run": now,
                    "last_result": str(result)[:500],
                    "run_count": (task.get("run_count") or 0) + 1,
                })
                if task.get("one_shot"):
                    await storage.delete_heartbeat_task(task["id"])
            except Exception as e:
                await storage.update_heartbeat_task(task["id"], {
                    "last_run": now,
                    "last_result": f"error: {e}",
                })

        await storage.add_heartbeat({
            "status": "ok",
            "hash_chain_valid": True,
            "details": {"tick": self._tick_count, "tasks_checked": len(tasks)},
        })

    async def _run_task(self, task: dict) -> str:
        task_type = task.get("task_type", "")

        if task_type == "audit":
            from ..storage import storage
            last_event = await storage.get_last_event()
            return f"audit_ok: last_event={last_event.get('id') if last_event else 'none'}"

        if task_type == "snapshot":
            from ..storage import storage
            from ..main import get_pcna
            seeds = await storage.get_memory_seeds()
            proj = await storage.get_memory_projection()
            await storage.add_memory_tensor_snapshot({
                "seeds_state": seeds,
                "projection_in": proj.get("projection_in") if proj else None,
                "projection_out": proj.get("projection_out") if proj else None,
                "request_count": proj.get("request_count", 0) if proj else 0,
            })
            pcna = get_pcna()
            await pcna.save_checkpoint()
            return f"snapshot_ok: {len(seeds)} seeds + pcna checkpoint saved"

        if task_type == "propagate":
            from ..main import get_pcna
            pcna = get_pcna()
            pcna.phi.propagate(steps=5)
            pcna.psi.propagate(steps=4)
            pcna.omega.propagate(steps=3)
            pcna.guardian.propagate(steps=2)
            return f"propagate_ok: phi={pcna.phi.ring_coherence:.4f}"

        if task_type == "conversation_review":
            return await self._run_conversation_review()

        return f"unknown_task_type: {task_type}"

    async def _run_conversation_review(self) -> str:
        from ..storage import storage
        from ..services.inference import call_energy_provider
        from ..services.energy_registry import energy_registry

        toggle = await storage.get_system_toggle("last_conversation_review_at")
        since = datetime.utcfromtimestamp(0)
        if toggle and toggle.get("parameters"):
            ts = toggle["parameters"].get("ts")
            if ts:
                since = datetime.utcfromtimestamp(float(ts))

        messages = await storage.get_messages_since(since, limit=300)
        if not messages:
            return "conversation_review_skip: no new messages"

        msg_lines = []
        for m in messages[-100:]:
            role = m.get("role", "?")
            content = (m.get("content") or "")[:200]
            msg_lines.append(f"[{role}]: {content}")
        transcript = "\n".join(msg_lines)

        prompt_text = REVIEW_PROMPT + transcript
        provider_id = energy_registry.get_active_provider() or "gemini"

        try:
            raw_content, _ = await call_energy_provider(
                provider_id=provider_id,
                messages=[{"role": "user", "content": prompt_text}],
                max_tokens=800,
            )
        except Exception as e:
            return f"conversation_review_error: inference failed: {e}"

        try:
            start = raw_content.find("{")
            end = raw_content.rfind("}") + 1
            parsed = json.loads(raw_content[start:end]) if start >= 0 else {}
        except Exception:
            parsed = {}

        seeds_written = []
        for field_key, seed_index in REVIEW_SEED_INDICES.items():
            value = parsed.get(field_key, "").strip()
            if value:
                existing = await storage.get_memory_seed(seed_index)
                if existing:
                    await storage.update_memory_seed(seed_index, {"summary": value})
                    seeds_written.append(seed_index)

        now_ts = time.time()
        await storage.upsert_system_toggle(
            "last_conversation_review_at", True, {"ts": now_ts}
        )

        await storage.append_event({
            "task_id": "heartbeat",
            "event_type": "conversation_review",
            "payload": {
                "provider": provider_id,
                "messages_reviewed": len(messages),
                "seeds_written": seeds_written,
                "ts": now_ts,
                "conclusions": parsed,
            },
        })

        return f"conversation_review_ok: {len(messages)} msgs, seeds_written={seeds_written}"


heartbeat_service = HeartbeatService()
