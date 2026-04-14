# 437:7
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, func, desc, asc, text as _sa_text

from ..database import get_session
from ..models import (
    HeartbeatTask, EdcmMetricSnapshot, MemorySeed, MemoryProjection,
    MemoryTensorSnapshot, BanditCorrelation, SystemToggle, DiscoveryDraft,
    TranscriptSource, TranscriptReport, Deal, HeartbeatLog,
    Conversation, A0pEvent, Message, ApprovalScope, WsModule,
)
from .core import _CoreStorage, _row_to_dict

_SCOPE_GRANT_TIERS = {"ws", "pro", "admin"}


async def check_scope_grant_tier(user_id: str) -> str:
    """Return the user's subscription_tier if allowed to grant scopes, else raise ValueError.

    Allowed tiers: ws, pro, admin.
    Any authenticated user can read their scopes; only elevated tiers can grant/revoke.
    This is enforced across all entry points: HTTP API, chat APPROVE SCOPE, and tool calls.
    """
    from ..database import engine as _engine
    async with _engine.connect() as conn:
        row = await conn.execute(
            _sa_text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": user_id}
        )
        rec = row.mappings().first()
        tier = rec["subscription_tier"] if rec else "free"
    if tier not in _SCOPE_GRANT_TIERS:
        raise ValueError(
            f"Tier '{tier}' cannot grant pre-approved scopes. "
            "Requires ws, pro, or admin tier."
        )
    return tier


class DatabaseStorage(_CoreStorage):

    async def get_heartbeat_tasks(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(HeartbeatTask).order_by(asc(HeartbeatTask.name)))
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_heartbeat_task(self, name: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(HeartbeatTask).where(HeartbeatTask.name == name))
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
            await session.execute(update(HeartbeatTask).where(HeartbeatTask.id == id).values(**updates))

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
            result = await session.execute(select(MemorySeed).order_by(asc(MemorySeed.seed_index)))
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
                result = await session.execute(select(MemorySeed).where(MemorySeed.id == existing["id"]))
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
            result = await session.execute(select(SystemToggle).order_by(asc(SystemToggle.subsystem)))
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
                    update(SystemToggle).where(SystemToggle.id == existing["id"])
                    .values(enabled=enabled, parameters=params, updated_at=datetime.utcnow())
                )
                await session.flush()
                result = await session.execute(select(SystemToggle).where(SystemToggle.id == existing["id"]))
                return _row_to_dict(result.scalar_one())
        async with get_session() as session:
            toggle = SystemToggle(subsystem=subsystem, enabled=enabled, parameters=parameters, updated_at=datetime.utcnow())
            session.add(toggle)
            await session.flush()
            await session.refresh(toggle)
            return _row_to_dict(toggle)

    async def delete_system_toggle(self, subsystem: str) -> None:
        async with get_session() as session:
            await session.execute(delete(SystemToggle).where(SystemToggle.subsystem == subsystem))

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
                update(DiscoveryDraft).where(DiscoveryDraft.id == id)
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
                select(func.count()).select_from(DiscoveryDraft)
                .where(DiscoveryDraft.promoted_to_conversation == True)
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
        await self.upsert_system_toggle(f"user_credentials_{user_id}", True, [*existing, credential])
        return credential

    async def delete_user_credential(self, user_id: str, credential_id: str) -> None:
        existing = await self.get_user_credentials(user_id)
        await self.upsert_system_toggle(
            f"user_credentials_{user_id}", True,
            [c for c in existing if c.get("id") != credential_id]
        )

    async def get_user_credential_field_value(self, user_id: str, service_id: str, field_key: str) -> Optional[str]:
        creds = await self.get_user_credentials(user_id)
        svc = next((c for c in creds if c.get("id") == service_id), None)
        if not svc:
            return None
        field = next((f for f in (svc.get("fields") or []) if f.get("key") == field_key), None)
        return field.get("value") if field else None

    async def get_user_secrets(self, user_id: str) -> List[Any]:
        toggle = await self.get_system_toggle(f"user_secrets_{user_id}")
        return (toggle.get("parameters") if toggle else None) or []

    async def add_user_secret(self, user_id: str, secret: Any) -> Any:
        existing = await self.get_user_secrets(user_id)
        idx = next((i for i, s in enumerate(existing) if s.get("key") == secret.get("key")), -1)
        updated = list(existing)
        if idx >= 0:
            updated[idx] = secret
        else:
            updated.append(secret)
        await self.upsert_system_toggle(f"user_secrets_{user_id}", True, updated)
        return secret

    async def delete_user_secret(self, user_id: str, secret_key: str) -> None:
        existing = await self.get_user_secrets(user_id)
        await self.upsert_system_toggle(
            f"user_secrets_{user_id}", True,
            [s for s in existing if s.get("key") != secret_key]
        )

    async def get_user_secret_value(self, user_id: str, key: str) -> Optional[str]:
        secrets = await self.get_user_secrets(user_id)
        secret = next((s for s in secrets if s.get("key") == key), None)
        return secret.get("value") if secret else None

    async def get_transcript_sources(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(TranscriptSource).order_by(asc(TranscriptSource.created_at)))
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_transcript_source(self, slug: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(TranscriptSource).where(TranscriptSource.slug == slug))
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
            await session.execute(delete(TranscriptReport).where(TranscriptReport.source_slug == slug))

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
                select(TranscriptReport).where(TranscriptReport.source_slug == source_slug)
                .order_by(desc(TranscriptReport.created_at)).limit(1)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def get_transcript_reports(self, source_slug: str, limit: int = 10) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(TranscriptReport).where(TranscriptReport.source_slug == source_slug)
                .order_by(desc(TranscriptReport.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_approval_scopes(self, user_id: str) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(ApprovalScope).where(ApprovalScope.user_id == user_id)
                .order_by(asc(ApprovalScope.scope))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_approval_scope_names(self, user_id: str) -> set:
        rows = await self.get_approval_scopes(user_id)
        return {r["scope"] for r in rows}

    async def grant_approval_scope(self, user_id: str, scope: str) -> Dict[str, Any]:
        existing = await self.get_approval_scopes(user_id)
        for row in existing:
            if row["scope"] == scope:
                return row
        async with get_session() as session:
            record = ApprovalScope(user_id=user_id, scope=scope)
            session.add(record)
            await session.flush()
            await session.refresh(record)
            return _row_to_dict(record)

    async def revoke_approval_scope(self, user_id: str, scope: str) -> bool:
        async with get_session() as session:
            result = await session.execute(
                delete(ApprovalScope)
                .where(ApprovalScope.user_id == user_id, ApprovalScope.scope == scope)
            )
            return result.rowcount > 0

    async def list_ws_modules(self) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(WsModule).order_by(asc(WsModule.status), asc(WsModule.name))
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_ws_module(self, module_id: int) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(WsModule).where(WsModule.id == module_id))
            return _row_to_dict(result.scalar_one_or_none())

    async def get_ws_module_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(select(WsModule).where(WsModule.slug == slug))
            return _row_to_dict(result.scalar_one_or_none())

    async def create_ws_module(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            mod = WsModule(**data)
            session.add(mod)
            await session.flush()
            await session.refresh(mod)
            return _row_to_dict(mod)

    async def update_ws_module(self, module_id: int, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        updates["updated_at"] = datetime.utcnow()
        async with get_session() as session:
            await session.execute(
                update(WsModule).where(WsModule.id == module_id).values(**updates)
            )
        return await self.get_ws_module(module_id)

    async def delete_ws_module(self, module_id: int) -> bool:
        async with get_session() as session:
            result = await session.execute(delete(WsModule).where(WsModule.id == module_id))
            return result.rowcount > 0

    async def get_active_ws_module_ui_metas(self) -> List[Dict[str, Any]]:
        """Return UI_META dicts for all user-created active ws modules."""
        async with get_session() as session:
            result = await session.execute(
                select(WsModule).where(
                    WsModule.status == "active",
                    WsModule.owner_id != "system",
                )
            )
            metas = []
            for row in result.scalars().all():
                d = _row_to_dict(row)
                ui_meta = d.get("ui_meta") or {}
                if ui_meta:
                    metas.append(ui_meta)
            return metas

    async def upsert_system_shadow(self, slug: str, name: str, description: str, ui_meta: Dict[str, Any]) -> None:
        """Upsert a system shadow record for a hardcoded route module.

        On first seed the full ui_meta is written. On subsequent startups only
        ``name`` is refreshed so that any admin customisations to ui_meta
        (label, icon, order, tier_gate) survive restarts.
        """
        existing = await self.get_ws_module_by_slug(slug)
        if existing:
            await self.update_ws_module(existing["id"], {
                "name": name,
            })
        else:
            await self.create_ws_module({
                "slug": slug,
                "name": name,
                "description": description,
                "owner_id": "system",
                "status": "system",
                "ui_meta": ui_meta,
                "route_config": {},
            })


storage = DatabaseStorage()
# 437:7
