# 320:0
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, func, desc, asc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session
from ..models import (
    Conversation, Message, AutomationTask, CommandHistory,
    A0pEvent, HeartbeatLog, CostMetric, EdcmSnapshot,
    BanditArm, CustomTool,
)


# Allowed client-supplied fields for create operations. Internal columns
# (id, created_at, updated_at, etc.) are set server-side only.
_CONV_ALLOWED_FIELDS = {
    "title", "model", "user_id", "context_boost",
    "parent_conv_id", "subagent_status", "subagent_error", "archived",
    "agent_id",
}
_MSG_ALLOWED_FIELDS = {
    "conversation_id", "role", "content", "model", "metadata",
}


def _row_to_dict(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    if hasattr(row, "__dict__"):
        return {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
    return dict(row._mapping)


def _filter_fields(data: Dict[str, Any], allowed: set) -> Dict[str, Any]:
    return {k: v for k, v in data.items() if k in allowed}


class _CoreStorage:

    async def get_conversations(
        self,
        user_id: Optional[str] = None,
        agent_id: Optional[int] = None,
        include_agent_pinned: bool = False,
    ) -> List[Dict[str, Any]]:
        """List conversations strictly scoped to a single user.

        agent_id semantics:
          - None + include_agent_pinned=False (default): only a0 conversations
            (rows where agent_id IS NULL). This keeps the main Chat sidebar
            from being polluted with Forge agent chats.
          - int: only conversations pinned to that specific agent.
          - None + include_agent_pinned=True: everything (admin / debug).
        """
        async with get_session() as session:
            q = select(Conversation).order_by(desc(Conversation.updated_at))
            if user_id is not None:
                q = q.where(Conversation.user_id == user_id)
            if agent_id is not None:
                q = q.where(Conversation.agent_id == agent_id)
            elif not include_agent_pinned:
                q = q.where(Conversation.agent_id.is_(None))
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_conversation(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(Conversation).where(Conversation.id == id))
            return _row_to_dict(result.scalar_one_or_none())

    async def create_conversation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        safe = _filter_fields(data, _CONV_ALLOWED_FIELDS)
        async with get_session() as session:
            conv = Conversation(**safe)
            session.add(conv)
            await session.flush()
            await session.refresh(conv)
            return _row_to_dict(conv)

    async def update_conversation_title(self, id: int, title: str) -> None:
        async with get_session() as session:
            await session.execute(
                update(Conversation).where(Conversation.id == id)
                .values(title=title, updated_at=datetime.utcnow())
            )

    async def delete_conversation(self, id: int) -> None:
        async with get_session() as session:
            await session.execute(delete(Conversation).where(Conversation.id == id))

    async def set_conversation_archived(self, id: int, archived: bool) -> None:
        async with get_session() as session:
            await session.execute(
                update(Conversation).where(Conversation.id == id)
                .values(archived=archived, updated_at=datetime.utcnow())
            )

    async def get_messages(self, conversation_id: int) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Message).where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_messages_since(self, since: datetime, limit: int = 500) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Message)
                .where(Message.created_at >= since)
                .order_by(asc(Message.created_at))
                .limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_events_by_type(self, event_type: str, limit: int = 10) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(A0pEvent)
                .where(A0pEvent.event_type == event_type)
                .order_by(desc(A0pEvent.created_at))
                .limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def create_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        safe = _filter_fields(data, _MSG_ALLOWED_FIELDS)
        async with get_session() as session:
            msg = Message(**safe)
            session.add(msg)
            await session.flush()
            await session.refresh(msg)
            return _row_to_dict(msg)

    async def get_automation_tasks(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(AutomationTask).order_by(desc(AutomationTask.created_at))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_automation_task(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(AutomationTask).where(AutomationTask.id == id)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def create_automation_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            task = AutomationTask(**data)
            session.add(task)
            await session.flush()
            await session.refresh(task)
            return _row_to_dict(task)

    async def update_automation_task(self, id: int, updates: Dict[str, Any]) -> None:
        updates["updated_at"] = datetime.utcnow()
        async with get_session() as session:
            await session.execute(
                update(AutomationTask).where(AutomationTask.id == id).values(**updates)
            )

    async def delete_automation_task(self, id: int) -> None:
        async with get_session() as session:
            await session.execute(delete(AutomationTask).where(AutomationTask.id == id))

    async def get_command_history(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(CommandHistory).order_by(desc(CommandHistory.created_at)).limit(100)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def add_command_history(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            entry = CommandHistory(**data)
            session.add(entry)
            await session.flush()
            await session.refresh(entry)
            return _row_to_dict(entry)

    async def clear_command_history(self) -> None:
        async with get_session() as session:
            await session.execute(delete(CommandHistory))

    async def append_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            e = A0pEvent(**event)
            session.add(e)
            await session.flush()
            await session.refresh(e)
            return _row_to_dict(e)

    async def get_events(self, task_id: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            q = select(A0pEvent).order_by(asc(A0pEvent.created_at))
            if task_id:
                q = q.where(A0pEvent.task_id == task_id)
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_recent_events(self, limit: int = 100) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(A0pEvent).order_by(desc(A0pEvent.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_last_event(self) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(A0pEvent).order_by(desc(A0pEvent.id)).limit(1))
            return _row_to_dict(result.scalar_one_or_none())

    async def add_heartbeat(self, log: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            h = HeartbeatLog(**log)
            session.add(h)
            await session.flush()
            await session.refresh(h)
            return _row_to_dict(h)

    async def get_heartbeats(self, limit: int = 24) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(HeartbeatLog).order_by(desc(HeartbeatLog.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def add_cost_metric(self, metric: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            c = CostMetric(**metric)
            session.add(c)
            await session.flush()
            await session.refresh(c)
            return _row_to_dict(c)

    async def get_cost_metrics(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            q = select(CostMetric).order_by(desc(CostMetric.created_at)).limit(200)
            if user_id:
                q = q.where(CostMetric.user_id == user_id)
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_cost_summary(self) -> Dict[str, Any]:
        async with get_session() as session:
            result = await session.execute(select(CostMetric))
            all_metrics = [_row_to_dict(r) for r in result.scalars().all()]

        by_model: Dict[str, Any] = {}
        by_stage: Dict[str, Any] = {}
        conv_map: Dict[int, Any] = {}
        daily_map: Dict[str, Any] = {}
        total_cost = total_prompt = total_completion = total_cache = 0.0
        cost_month = cost_today = 0.0
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        today_str = now.strftime("%Y-%m-%d")

        for m in all_metrics:
            cost = m.get("estimated_cost") or 0
            pt = m.get("prompt_tokens") or 0
            ct = m.get("completion_tokens") or 0
            ca = m.get("cache_tokens") or 0
            total_cost += cost
            total_prompt += pt
            total_completion += ct
            total_cache += ca
            created = m.get("created_at")
            if isinstance(created, str):
                created = datetime.fromisoformat(created.replace("Z", "+00:00"))
            if created and created.replace(tzinfo=None) >= month_start:
                cost_month += cost
            day = created.strftime("%Y-%m-%d") if created else today_str
            if day == today_str:
                cost_today += cost
            model = m.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {"cost": 0, "promptTokens": 0, "completionTokens": 0, "cacheTokens": 0, "calls": 0}
            by_model[model]["cost"] += cost
            by_model[model]["promptTokens"] += pt
            by_model[model]["completionTokens"] += ct
            by_model[model]["cacheTokens"] += ca
            by_model[model]["calls"] += 1
            stage = m.get("stage") or "unknown"
            if stage not in by_stage:
                by_stage[stage] = {"cost": 0, "promptTokens": 0, "completionTokens": 0, "calls": 0}
            by_stage[stage]["cost"] += cost
            by_stage[stage]["promptTokens"] += pt
            by_stage[stage]["completionTokens"] += ct
            by_stage[stage]["calls"] += 1
            cid = m.get("conversation_id")
            if cid:
                if cid not in conv_map:
                    conv_map[cid] = {"cost": 0, "tokens": 0, "calls": 0}
                conv_map[cid]["cost"] += cost
                conv_map[cid]["tokens"] += pt + ct
                conv_map[cid]["calls"] += 1
            if day not in daily_map:
                daily_map[day] = {"promptTokens": 0, "completionTokens": 0, "cost": 0}
            daily_map[day]["promptTokens"] += pt
            daily_map[day]["completionTokens"] += ct
            daily_map[day]["cost"] += cost

        by_conv = sorted(
            [{"conversationId": k, **v} for k, v in conv_map.items()],
            key=lambda x: x["cost"], reverse=True
        )[:50]
        cutoff = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        daily = sorted(
            [{"date": k, **v} for k, v in daily_map.items() if k >= cutoff],
            key=lambda x: x["date"]
        )
        return {
            "totalCost": total_cost, "totalPromptTokens": int(total_prompt),
            "totalCompletionTokens": int(total_completion), "totalCacheTokens": int(total_cache),
            "costThisMonth": cost_month, "costToday": cost_today,
            "byModel": by_model, "byStage": by_stage,
            "byConversation": by_conv, "dailyUsage": daily,
        }

    async def add_edcm_snapshot(self, snap: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            s = EdcmSnapshot(**snap)
            session.add(s)
            await session.flush()
            await session.refresh(s)
            return _row_to_dict(s)

    async def get_edcm_snapshots(self, limit: int = 50) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(EdcmSnapshot).order_by(desc(EdcmSnapshot.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_bandit_arms(self, domain: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            if domain:
                q = select(BanditArm).where(BanditArm.domain == domain).order_by(desc(BanditArm.ucb_score))
            else:
                q = select(BanditArm).order_by(asc(BanditArm.domain), desc(BanditArm.ucb_score))
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_bandit_arm(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(BanditArm).where(BanditArm.id == id))
            return _row_to_dict(result.scalar_one_or_none())

    async def upsert_bandit_arm(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            from sqlalchemy import and_
            result = await session.execute(
                select(BanditArm).where(
                    and_(BanditArm.domain == data["domain"], BanditArm.arm_name == data["arm_name"])
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                await session.execute(update(BanditArm).where(BanditArm.id == existing.id).values(**data))
                await session.flush()
                r2 = await session.execute(select(BanditArm).where(BanditArm.id == existing.id))
                return _row_to_dict(r2.scalar_one())
            arm = BanditArm(**data)
            session.add(arm)
            await session.flush()
            await session.refresh(arm)
            return _row_to_dict(arm)

    async def update_bandit_arm(self, id: int, updates: Dict[str, Any]) -> None:
        async with get_session() as session:
            await session.execute(update(BanditArm).where(BanditArm.id == id).values(**updates))

    async def reset_bandit_domain(self, domain: str) -> None:
        async with get_session() as session:
            await session.execute(
                update(BanditArm).where(BanditArm.domain == domain)
                .values(pulls=0, total_reward=0, avg_reward=0, ema_reward=0, ucb_score=0)
            )

    async def get_custom_tools(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            q = select(CustomTool).order_by(desc(CustomTool.created_at))
            if user_id:
                q = q.where(CustomTool.user_id == user_id)
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_custom_tool(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(CustomTool).where(CustomTool.id == id))
            return _row_to_dict(result.scalar_one_or_none())

    async def create_custom_tool(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            tool = CustomTool(**data)
            session.add(tool)
            await session.flush()
            await session.refresh(tool)
            return _row_to_dict(tool)

    async def update_custom_tool(self, id: int, updates: Dict[str, Any]) -> None:
        async with get_session() as session:
            await session.execute(update(CustomTool).where(CustomTool.id == id).values(**updates))

    async def delete_custom_tool(self, id: int) -> None:
        async with get_session() as session:
            await session.execute(delete(CustomTool).where(CustomTool.id == id))
# 320:0
