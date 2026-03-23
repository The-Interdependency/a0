from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, insert, func, desc, asc, and_
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_session
from .models import (
    Conversation, Message, AutomationTask, CommandHistory,
    A0pEvent, HeartbeatLog, CostMetric, EdcmSnapshot,
    BanditArm, CustomTool, HeartbeatTask, EdcmMetricSnapshot,
    MemorySeed, MemoryProjection, MemoryTensorSnapshot,
    BanditCorrelation, SystemToggle, DiscoveryDraft,
    TranscriptSource, TranscriptReport, Deal,
)


def _row_to_dict(row) -> Dict[str, Any]:
    if row is None:
        return None
    if hasattr(row, "__dict__"):
        d = {k: v for k, v in row.__dict__.items() if not k.startswith("_")}
        return d
    return dict(row._mapping)


class DatabaseStorage:

    async def get_conversations(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Conversation).order_by(desc(Conversation.updated_at))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_conversation(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Conversation).where(Conversation.id == id)
            )
            row = result.scalar_one_or_none()
            return _row_to_dict(row)

    async def create_conversation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            conv = Conversation(**data)
            session.add(conv)
            await session.flush()
            await session.refresh(conv)
            return _row_to_dict(conv)

    async def update_conversation_title(self, id: int, title: str) -> None:
        async with get_session() as session:
            await session.execute(
                update(Conversation)
                .where(Conversation.id == id)
                .values(title=title, updated_at=datetime.utcnow())
            )

    async def delete_conversation(self, id: int) -> None:
        async with get_session() as session:
            await session.execute(delete(Conversation).where(Conversation.id == id))

    async def get_messages(self, conversation_id: int) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def create_message(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            msg = Message(**data)
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
                select(CommandHistory)
                .order_by(desc(CommandHistory.created_at))
                .limit(100)
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
            result = await session.execute(
                select(A0pEvent).order_by(desc(A0pEvent.id)).limit(1)
            )
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
        total_cost = 0.0
        total_prompt_tokens = 0
        total_completion_tokens = 0
        total_cache_tokens = 0
        cost_this_month = 0.0
        cost_today = 0.0

        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        today_str = now.strftime("%Y-%m-%d")

        for m in all_metrics:
            cost = m.get("estimated_cost") or 0
            prompt_tok = m.get("prompt_tokens") or 0
            completion_tok = m.get("completion_tokens") or 0
            cache_tok = m.get("cache_tokens") or 0
            total_cost += cost
            total_prompt_tokens += prompt_tok
            total_completion_tokens += completion_tok
            total_cache_tokens += cache_tok

            created_at = m.get("created_at")
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            if created_at and created_at.replace(tzinfo=None) >= month_start:
                cost_this_month += cost
            day_str = created_at.strftime("%Y-%m-%d") if created_at else today_str
            if day_str == today_str:
                cost_today += cost

            model = m.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {"cost": 0, "promptTokens": 0, "completionTokens": 0, "cacheTokens": 0, "calls": 0}
            by_model[model]["cost"] += cost
            by_model[model]["promptTokens"] += prompt_tok
            by_model[model]["completionTokens"] += completion_tok
            by_model[model]["cacheTokens"] += cache_tok
            by_model[model]["calls"] += 1

            stage = m.get("stage") or "unknown"
            if stage not in by_stage:
                by_stage[stage] = {"cost": 0, "promptTokens": 0, "completionTokens": 0, "calls": 0}
            by_stage[stage]["cost"] += cost
            by_stage[stage]["promptTokens"] += prompt_tok
            by_stage[stage]["completionTokens"] += completion_tok
            by_stage[stage]["calls"] += 1

            conv_id = m.get("conversation_id")
            if conv_id:
                if conv_id not in conv_map:
                    conv_map[conv_id] = {"cost": 0, "tokens": 0, "calls": 0}
                conv_map[conv_id]["cost"] += cost
                conv_map[conv_id]["tokens"] += prompt_tok + completion_tok
                conv_map[conv_id]["calls"] += 1

            if day_str not in daily_map:
                daily_map[day_str] = {"promptTokens": 0, "completionTokens": 0, "cost": 0}
            daily_map[day_str]["promptTokens"] += prompt_tok
            daily_map[day_str]["completionTokens"] += completion_tok
            daily_map[day_str]["cost"] += cost

        by_conversation = sorted(
            [{"conversationId": k, **v} for k, v in conv_map.items()],
            key=lambda x: x["cost"],
            reverse=True,
        )[:50]

        from datetime import timedelta
        thirty_days_ago = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        daily_usage = sorted(
            [{"date": k, **v} for k, v in daily_map.items() if k >= thirty_days_ago],
            key=lambda x: x["date"],
        )

        return {
            "totalCost": total_cost,
            "totalPromptTokens": total_prompt_tokens,
            "totalCompletionTokens": total_completion_tokens,
            "totalCacheTokens": total_cache_tokens,
            "costThisMonth": cost_this_month,
            "costToday": cost_today,
            "byModel": by_model,
            "byStage": by_stage,
            "byConversation": by_conversation,
            "dailyUsage": daily_usage,
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
            result = await session.execute(
                select(BanditArm)
                .where(and_(BanditArm.domain == data["domain"], BanditArm.arm_name == data["arm_name"]))
            )
            existing = result.scalar_one_or_none()
            if existing:
                await session.execute(
                    update(BanditArm).where(BanditArm.id == existing.id).values(**data)
                )
                await session.flush()
                result2 = await session.execute(select(BanditArm).where(BanditArm.id == existing.id))
                return _row_to_dict(result2.scalar_one())
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
                update(BanditArm)
                .where(BanditArm.domain == domain)
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

    async def get_heartbeat_tasks(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(HeartbeatTask).order_by(asc(HeartbeatTask.name))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_heartbeat_task(self, name: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(HeartbeatTask).where(HeartbeatTask.name == name)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def create_heartbeat_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            task = HeartbeatTask(**data)
            session.add(task)
            await session.flush()
            await session.refresh(task)
            return _row_to_dict(task)

    async def upsert_heartbeat_task(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.get_heartbeat_task(data["name"])
        if existing:
            async with get_session() as session:
                await session.execute(
                    update(HeartbeatTask).where(HeartbeatTask.id == existing["id"]).values(**data)
                )
                await session.flush()
                result = await session.execute(
                    select(HeartbeatTask).where(HeartbeatTask.id == existing["id"])
                )
                return _row_to_dict(result.scalar_one())
        return await self.create_heartbeat_task(data)

    async def update_heartbeat_task(self, id: int, updates: Dict[str, Any]) -> None:
        async with get_session() as session:
            await session.execute(
                update(HeartbeatTask).where(HeartbeatTask.id == id).values(**updates)
            )

    async def delete_heartbeat_task(self, id: int) -> None:
        async with get_session() as session:
            await session.execute(delete(HeartbeatTask).where(HeartbeatTask.id == id))

    async def add_edcm_metric_snapshot(self, snap: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            s = EdcmMetricSnapshot(**snap)
            session.add(s)
            await session.flush()
            await session.refresh(s)
            return _row_to_dict(s)

    async def get_edcm_metric_snapshots(self, limit: int = 50) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(EdcmMetricSnapshot).order_by(desc(EdcmMetricSnapshot.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_memory_seeds(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(MemorySeed).order_by(asc(MemorySeed.seed_index))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_memory_seed(self, seed_index: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(MemorySeed).where(MemorySeed.seed_index == seed_index)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def upsert_memory_seed(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.get_memory_seed(data["seed_index"])
        if existing:
            updates = {**data, "updated_at": datetime.utcnow()}
            async with get_session() as session:
                await session.execute(
                    update(MemorySeed).where(MemorySeed.id == existing["id"]).values(**updates)
                )
                await session.flush()
                result = await session.execute(
                    select(MemorySeed).where(MemorySeed.id == existing["id"])
                )
                return _row_to_dict(result.scalar_one())
        async with get_session() as session:
            seed = MemorySeed(**data)
            session.add(seed)
            await session.flush()
            await session.refresh(seed)
            return _row_to_dict(seed)

    async def update_memory_seed(self, seed_index: int, updates: Dict[str, Any]) -> None:
        updates["updated_at"] = datetime.utcnow()
        async with get_session() as session:
            await session.execute(
                update(MemorySeed).where(MemorySeed.seed_index == seed_index).values(**updates)
            )

    async def get_memory_projection(self) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(MemoryProjection).order_by(desc(MemoryProjection.id)).limit(1)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def upsert_memory_projection(self, data: Dict[str, Any]) -> Dict[str, Any]:
        existing = await self.get_memory_projection()
        if existing:
            async with get_session() as session:
                await session.execute(
                    update(MemoryProjection).where(MemoryProjection.id == existing["id"]).values(**data)
                )
                await session.flush()
                result = await session.execute(
                    select(MemoryProjection).where(MemoryProjection.id == existing["id"])
                )
                return _row_to_dict(result.scalar_one())
        async with get_session() as session:
            proj = MemoryProjection(**data)
            session.add(proj)
            await session.flush()
            await session.refresh(proj)
            return _row_to_dict(proj)

    async def add_memory_tensor_snapshot(self, snap: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            s = MemoryTensorSnapshot(**snap)
            session.add(s)
            await session.flush()
            await session.refresh(s)
            return _row_to_dict(s)

    async def get_memory_tensor_snapshots(self, limit: int = 20) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(MemoryTensorSnapshot).order_by(desc(MemoryTensorSnapshot.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def add_bandit_correlation(self, corr: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            c = BanditCorrelation(**corr)
            session.add(c)
            await session.flush()
            await session.refresh(c)
            return _row_to_dict(c)

    async def get_bandit_correlations(self, limit: int = 50) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(BanditCorrelation).order_by(desc(BanditCorrelation.joint_reward)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_system_toggles(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(SystemToggle).order_by(asc(SystemToggle.subsystem))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_system_toggle(self, subsystem: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(SystemToggle).where(SystemToggle.subsystem == subsystem)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def upsert_system_toggle(self, subsystem: str, enabled: bool, parameters: Any = None) -> Dict[str, Any]:
        existing = await self.get_system_toggle(subsystem)
        if existing:
            params = parameters if parameters is not None else existing.get("parameters")
            async with get_session() as session:
                await session.execute(
                    update(SystemToggle)
                    .where(SystemToggle.id == existing["id"])
                    .values(enabled=enabled, parameters=params, updated_at=datetime.utcnow())
                )
                await session.flush()
                result = await session.execute(
                    select(SystemToggle).where(SystemToggle.id == existing["id"])
                )
                return _row_to_dict(result.scalar_one())
        async with get_session() as session:
            toggle = SystemToggle(
                subsystem=subsystem, enabled=enabled,
                parameters=parameters, updated_at=datetime.utcnow()
            )
            session.add(toggle)
            await session.flush()
            await session.refresh(toggle)
            return _row_to_dict(toggle)

    async def delete_system_toggle(self, subsystem: str) -> None:
        async with get_session() as session:
            await session.execute(
                delete(SystemToggle).where(SystemToggle.subsystem == subsystem)
            )

    async def get_discovery_drafts(self, limit: int = 50) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(DiscoveryDraft).order_by(desc(DiscoveryDraft.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def create_discovery_draft(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            draft = DiscoveryDraft(**data)
            session.add(draft)
            await session.flush()
            await session.refresh(draft)
            return _row_to_dict(draft)

    async def promote_discovery_draft(self, id: int, conversation_id: int) -> None:
        async with get_session() as session:
            await session.execute(
                update(DiscoveryDraft)
                .where(DiscoveryDraft.id == id)
                .values(promoted_to_conversation=True, conversation_id=conversation_id)
            )

    async def list_deals(self, user_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            q = select(Deal).where(Deal.user_id == user_id).order_by(desc(Deal.created_at))
            result = await session.execute(q)
            rows = [_row_to_dict(r) for r in result.scalars().all()]
            if status:
                rows = [r for r in rows if r.get("status") == status]
            return rows

    async def get_deal(self, id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(Deal).where(Deal.id == id))
            return _row_to_dict(result.scalar_one_or_none())

    async def create_deal(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            deal = Deal(**data)
            session.add(deal)
            await session.flush()
            await session.refresh(deal)
            return _row_to_dict(deal)

    async def update_deal(self, id: int, updates: Dict[str, Any]) -> Dict[str, Any]:
        updates["updated_at"] = datetime.utcnow()
        async with get_session() as session:
            await session.execute(update(Deal).where(Deal.id == id).values(**updates))
            await session.flush()
            result = await session.execute(select(Deal).where(Deal.id == id))
            return _row_to_dict(result.scalar_one())

    async def get_activity_stats(self) -> Dict[str, Any]:
        async with get_session() as session:
            hb = await session.execute(select(func.count()).select_from(HeartbeatLog))
            conv = await session.execute(select(func.count()).select_from(Conversation))
            ev = await session.execute(select(func.count()).select_from(A0pEvent))
            drafts = await session.execute(select(func.count()).select_from(DiscoveryDraft))
            promos = await session.execute(
                select(func.count()).select_from(DiscoveryDraft).where(DiscoveryDraft.promoted_to_conversation == True)
            )
            edcm = await session.execute(select(func.count()).select_from(EdcmMetricSnapshot))
            mem = await session.execute(select(func.count()).select_from(MemoryTensorSnapshot))
            msgs = await session.execute(select(func.count()).select_from(Message))
            return {
                "heartbeatRuns": hb.scalar(),
                "transcripts": msgs.scalar(),
                "conversations": conv.scalar(),
                "events": ev.scalar(),
                "drafts": drafts.scalar(),
                "promotions": promos.scalar(),
                "edcmSnapshots": edcm.scalar(),
                "memorySnapshots": mem.scalar(),
            }

    async def get_user_credentials(self, user_id: str) -> List[Any]:
        toggle = await self.get_system_toggle(f"user_credentials_{user_id}")
        return (toggle.get("parameters") if toggle else None) or []

    async def add_user_credential(self, user_id: str, credential: Any) -> Any:
        existing = await self.get_user_credentials(user_id)
        updated = [*existing, credential]
        await self.upsert_system_toggle(f"user_credentials_{user_id}", True, updated)
        return credential

    async def delete_user_credential(self, user_id: str, credential_id: str) -> None:
        existing = await self.get_user_credentials(user_id)
        filtered = [c for c in existing if c.get("id") != credential_id]
        await self.upsert_system_toggle(f"user_credentials_{user_id}", True, filtered)

    async def get_user_credential_field_value(self, user_id: str, service_id: str, field_key: str) -> Optional[str]:
        creds = await self.get_user_credentials(user_id)
        service = next((c for c in creds if c.get("id") == service_id), None)
        if not service:
            return None
        field = next((f for f in (service.get("fields") or []) if f.get("key") == field_key), None)
        return field.get("value") if field else None

    async def get_user_secrets(self, user_id: str) -> List[Any]:
        toggle = await self.get_system_toggle(f"user_secrets_{user_id}")
        return (toggle.get("parameters") if toggle else None) or []

    async def add_user_secret(self, user_id: str, secret: Any) -> Any:
        existing = await self.get_user_secrets(user_id)
        idx = next((i for i, s in enumerate(existing) if s.get("key") == secret.get("key")), -1)
        if idx >= 0:
            updated = list(existing)
            updated[idx] = secret
        else:
            updated = [*existing, secret]
        await self.upsert_system_toggle(f"user_secrets_{user_id}", True, updated)
        return secret

    async def delete_user_secret(self, user_id: str, secret_key: str) -> None:
        existing = await self.get_user_secrets(user_id)
        filtered = [s for s in existing if s.get("key") != secret_key]
        await self.upsert_system_toggle(f"user_secrets_{user_id}", True, filtered)

    async def get_user_secret_value(self, user_id: str, key: str) -> Optional[str]:
        secrets = await self.get_user_secrets(user_id)
        secret = next((s for s in secrets if s.get("key") == key), None)
        return secret.get("value") if secret else None

    async def get_transcript_sources(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(TranscriptSource).order_by(asc(TranscriptSource.created_at))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_transcript_source(self, slug: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(TranscriptSource).where(TranscriptSource.slug == slug)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def create_transcript_source(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            source = TranscriptSource(**data)
            session.add(source)
            await session.flush()
            await session.refresh(source)
            return _row_to_dict(source)

    async def update_transcript_source(self, slug: str, updates: Dict[str, Any]) -> None:
        async with get_session() as session:
            await session.execute(
                update(TranscriptSource).where(TranscriptSource.slug == slug).values(**updates)
            )

    async def delete_transcript_source(self, slug: str) -> None:
        async with get_session() as session:
            await session.execute(delete(TranscriptSource).where(TranscriptSource.slug == slug))
            await session.execute(
                delete(TranscriptReport).where(TranscriptReport.source_slug == slug)
            )

    async def add_transcript_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            report = TranscriptReport(**data)
            session.add(report)
            await session.flush()
            await session.refresh(report)
            return _row_to_dict(report)

    async def get_latest_transcript_report(self, source_slug: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(TranscriptReport)
                .where(TranscriptReport.source_slug == source_slug)
                .order_by(desc(TranscriptReport.created_at))
                .limit(1)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def get_transcript_reports(self, source_slug: str, limit: int = 10) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(TranscriptReport)
                .where(TranscriptReport.source_slug == source_slug)
                .order_by(desc(TranscriptReport.created_at))
                .limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]


storage = DatabaseStorage()
