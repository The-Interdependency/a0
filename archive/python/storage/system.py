# 201:15 0:0 2:3
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, func, desc, asc, text as _sa_text

from ..database import get_session, engine as _engine
from ..models import (
    HeartbeatTask, HeartbeatLog, SystemToggle, Deal,
    Conversation, A0pEvent, Message,
    EdcmMetricSnapshot, MemoryTensorSnapshot, ApprovalScope,
)
from .core import _CoreStorage, _row_to_dict

_SCOPE_GRANT_TIERS = {"ws", "admin"}


async def check_scope_grant_tier(user_id: str) -> str:
    """Return the user's subscription_tier if allowed to grant scopes, else raise ValueError.

    Allowed tiers: ws, admin. Any authenticated user can read their scopes;
    only elevated tiers can grant or revoke. Enforced across HTTP, chat APPROVE
    SCOPE, and tool calls.
    """
    async with _engine.connect() as conn:
        row = await conn.execute(
            _sa_text("SELECT subscription_tier FROM users WHERE id = :id"), {"id": user_id}
        )
        rec = row.mappings().first()
        tier = rec["subscription_tier"] if rec else "free"
    if tier not in _SCOPE_GRANT_TIERS:
        raise ValueError(
            f"Tier '{tier}' cannot grant pre-approved scopes. Requires ws or admin tier."
        )
    return tier


class SystemMixin(_CoreStorage):
    # DOC section: heartbeat tasks

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

    # DOC section: system toggles
    # User credentials and secrets are stored as JSON blobs in system toggles
    # under keys "user_credentials_{user_id}" and "user_secrets_{user_id}".

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

    # DOC section: user credentials (stored as toggle blobs)

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
            [c for c in existing if c.get("id") != credential_id],
        )

    async def get_user_credential_field_value(self, user_id: str, service_id: str, field_key: str) -> Optional[str]:
        creds = await self.get_user_credentials(user_id)
        svc = next((c for c in creds if c.get("id") == service_id), None)
        if not svc:
            return None
        field = next((f for f in (svc.get("fields") or []) if f.get("key") == field_key), None)
        return field.get("value") if field else None

    # DOC section: user secrets (stored as toggle blobs)

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
            [s for s in existing if s.get("key") != secret_key],
        )

    async def get_user_secret_value(self, user_id: str, key: str) -> Optional[str]:
        secrets = await self.get_user_secrets(user_id)
        secret = next((s for s in secrets if s.get("key") == key), None)
        return secret.get("value") if secret else None

    # DOC section: deals

    async def list_deals(self, user_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        async with get_session() as session:
            result = await session.execute(
                select(Deal).where(Deal.user_id == user_id).order_by(desc(Deal.created_at))
            )
            rows = [_row_to_dict(r) for r in result.scalars().all()]
            return [r for r in rows if r.get("status") == status] if status else rows

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

    # DOC section: activity stats

    async def get_activity_stats(self) -> Dict[str, Any]:
        """Aggregate counts across all major tables for the system dashboard."""
        async with get_session() as session:
            hb = await session.execute(select(func.count()).select_from(HeartbeatLog))
            conv = await session.execute(select(func.count()).select_from(Conversation))
            ev = await session.execute(select(func.count()).select_from(A0pEvent))
            edcm = await session.execute(select(func.count()).select_from(EdcmMetricSnapshot))
            mem = await session.execute(select(func.count()).select_from(MemoryTensorSnapshot))
            msgs = await session.execute(select(func.count()).select_from(Message))
            return {
                "heartbeatRuns": hb.scalar(),
                "transcripts": msgs.scalar(),
                "conversations": conv.scalar(),
                "events": ev.scalar(),
                "edcmSnapshots": edcm.scalar(),
                "memorySnapshots": mem.scalar(),
            }

    # DOC section: approval scopes

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
# 201:15 0:0 2:3
