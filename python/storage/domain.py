# 676:41
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, func, desc, asc, text as _sa_text

from ..database import get_session
from ..models import (
    HeartbeatTask, EdcmMetricSnapshot, MemorySeed, MemoryProjection,
    MemoryTensorSnapshot, BanditCorrelation, SystemToggle, DiscoveryDraft,
    TranscriptSource, TranscriptReport, TranscriptUpload, TranscriptMessage,
    TranscriptExplanation, ExplanationCredits,
    Deal, HeartbeatLog,
    Conversation, A0pEvent, Message, ApprovalScope, WsModule,
)
from .core import _CoreStorage, _row_to_dict

_SCOPE_GRANT_TIERS = {"ws", "admin"}


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
            "Requires ws or admin tier."
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

    # ---------- transcript analysis (donation-research instrument) ----------

    async def create_transcript_upload(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            u = TranscriptUpload(**data)
            session.add(u)
            await session.flush()
            await session.refresh(u)
            return _row_to_dict(u)

    async def update_transcript_upload(self, upload_id: int, **fields: Any) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            await session.execute(
                update(TranscriptUpload).where(TranscriptUpload.id == upload_id).values(**fields)
            )
            result = await session.execute(select(TranscriptUpload).where(TranscriptUpload.id == upload_id))
            return _row_to_dict(result.scalar_one_or_none())

    async def get_transcript_upload(self, upload_id: int, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            q = select(TranscriptUpload).where(TranscriptUpload.id == upload_id)
            if user_id is not None:
                q = q.where(TranscriptUpload.user_id == user_id)
            result = await session.execute(q)
            return _row_to_dict(result.scalar_one_or_none())

    async def list_transcript_uploads(self, user_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        async with get_session() as session:
            q = select(TranscriptUpload).order_by(desc(TranscriptUpload.created_at)).limit(limit)
            if user_id is not None:
                q = q.where(TranscriptUpload.user_id == user_id)
            result = await session.execute(q)
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def count_user_uploads_since(self, user_id: str, since: datetime) -> int:
        """Count successful uploads by a user since a given datetime (for free quota gating)."""
        async with get_session() as session:
            result = await session.execute(
                select(func.count(TranscriptUpload.id)).where(
                    TranscriptUpload.user_id == user_id,
                    TranscriptUpload.status == "done",
                    TranscriptUpload.created_at >= since,
                )
            )
            return int(result.scalar_one() or 0)

    async def upsert_transcript_source(self, slug: str, display_name: str, file_count: int = 1) -> Dict[str, Any]:
        async with get_session() as session:
            existing = await session.execute(select(TranscriptSource).where(TranscriptSource.slug == slug))
            row = existing.scalar_one_or_none()
            now = datetime.utcnow()
            if row:
                await session.execute(
                    update(TranscriptSource).where(TranscriptSource.id == row.id).values(
                        display_name=display_name, file_count=file_count, last_scanned_at=now,
                    )
                )
                refreshed = await session.execute(select(TranscriptSource).where(TranscriptSource.id == row.id))
                return _row_to_dict(refreshed.scalar_one())
            s = TranscriptSource(slug=slug, display_name=display_name, file_count=file_count, last_scanned_at=now)
            session.add(s)
            await session.flush()
            await session.refresh(s)
            return _row_to_dict(s)

    async def create_transcript_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            r = TranscriptReport(**data)
            session.add(r)
            await session.flush()
            await session.refresh(r)
            return _row_to_dict(r)

    async def add_transcript_messages_bulk(self, report_id: int, messages: List[Dict[str, Any]]) -> int:
        if not messages:
            return 0
        async with get_session() as session:
            for m in messages:
                session.add(TranscriptMessage(report_id=report_id, **m))
            await session.flush()
            return len(messages)

    async def list_transcript_reports(self, user_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """List reports, optionally scoped to a user via the uploads join."""
        async with get_session() as session:
            if user_id is None:
                result = await session.execute(
                    select(TranscriptReport).order_by(desc(TranscriptReport.created_at)).limit(limit)
                )
                return [_row_to_dict(r) for r in result.scalars().all()]
            # User-scoped: join through uploads
            result = await session.execute(
                select(TranscriptReport).join(
                    TranscriptUpload, TranscriptUpload.report_id == TranscriptReport.id
                ).where(TranscriptUpload.user_id == user_id)
                .order_by(desc(TranscriptReport.created_at)).limit(limit)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    async def get_transcript_report(self, report_id: int, user_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        async with get_session() as session:
            if user_id is None:
                result = await session.execute(select(TranscriptReport).where(TranscriptReport.id == report_id))
                return _row_to_dict(result.scalar_one_or_none())
            result = await session.execute(
                select(TranscriptReport).join(
                    TranscriptUpload, TranscriptUpload.report_id == TranscriptReport.id
                ).where(TranscriptReport.id == report_id, TranscriptUpload.user_id == user_id)
            )
            return _row_to_dict(result.scalar_one_or_none())

    async def get_transcript_messages(self, report_id: int, user_id: Optional[str] = None,
                                       limit: int = 200, offset: int = 0) -> List[Dict[str, Any]]:
        """User-scoped when user_id is passed (joined via transcript_uploads.user_id) to prevent IDOR.
        Returns empty list if the report exists but doesn't belong to the user.
        """
        async with get_session() as session:
            if user_id is not None:
                # Verify ownership via join first; bail with [] if not owner.
                owns = await session.execute(
                    select(func.count(TranscriptUpload.id)).where(
                        TranscriptUpload.report_id == report_id,
                        TranscriptUpload.user_id == user_id,
                    )
                )
                if int(owns.scalar_one() or 0) == 0:
                    return []
            result = await session.execute(
                select(TranscriptMessage).where(TranscriptMessage.report_id == report_id)
                .order_by(asc(TranscriptMessage.idx)).limit(limit).offset(offset)
            )
            return [_row_to_dict(r) for r in result.scalars().all()]

    # ---------- transcript explainer ----------

    async def get_transcript_explanation(
        self, report_id: int, user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Owner-scoped fetch. Returns None if no explanation exists yet
        OR if it does exist but doesn't belong to the caller (treated as
        404 by callers — never leak existence cross-user)."""
        async with get_session() as session:
            q = select(TranscriptExplanation).where(
                TranscriptExplanation.report_id == report_id
            )
            if user_id is not None:
                q = q.where(TranscriptExplanation.user_id == user_id)
            result = await session.execute(q)
            return _row_to_dict(result.scalar_one_or_none())

    async def create_transcript_explanation(
        self, *, report_id: int, user_id: str, model_id: str,
        prompt_tokens: int, completion_tokens: int, cost_cents: int,
        body: str, citations: List[Dict[str, Any]], paid_with: str,
    ) -> Dict[str, Any]:
        """Insert one explanation row. UNIQUE(report_id) makes a duplicate
        insert raise IntegrityError — callers must check existence first."""
        async with get_session() as session:
            row = TranscriptExplanation(
                report_id=report_id, user_id=user_id, model_id=model_id,
                prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
                cost_cents=cost_cents, body=body, citations=citations,
                paid_with=paid_with,
            )
            session.add(row)
            await session.flush()
            await session.refresh(row)
            return _row_to_dict(row)

    async def get_or_seed_explanation_credits(self, user_id: str) -> Dict[str, Any]:
        """Return the user's credit row, seeding with 3 free on first read.
        Idempotent via INSERT ... ON CONFLICT DO NOTHING — concurrent first
        reads can't both seed and double the free count."""
        async with get_session() as session:
            await session.execute(
                _sa_text(
                    "INSERT INTO explanation_credits "
                    "(user_id, free_remaining, paid_remaining, lifetime_purchased) "
                    "VALUES (:uid, 3, 0, 0) ON CONFLICT (user_id) DO NOTHING"
                ),
                {"uid": user_id},
            )
            result = await session.execute(
                select(ExplanationCredits).where(ExplanationCredits.user_id == user_id)
            )
            return _row_to_dict(result.scalar_one())

    async def consume_explanation_credit(self, user_id: str) -> Optional[str]:
        """Decrement one credit free-then-paid; returns the bucket consumed
        ('free' | 'paid') or None if both balances are zero.

        Concurrency: SELECT ... FOR UPDATE inside the same session locks
        the row for the duration of the txn so two parallel /explain calls
        from the same user can't both decrement past zero.
        """
        await self.get_or_seed_explanation_credits(user_id)
        async with get_session() as session:
            row = await session.execute(
                _sa_text(
                    "SELECT free_remaining, paid_remaining FROM explanation_credits "
                    "WHERE user_id = :uid FOR UPDATE"
                ),
                {"uid": user_id},
            )
            rec = row.mappings().first()
            if not rec:
                return None
            free = int(rec["free_remaining"] or 0)
            paid = int(rec["paid_remaining"] or 0)
            if free > 0:
                await session.execute(
                    _sa_text(
                        "UPDATE explanation_credits SET free_remaining = free_remaining - 1, "
                        "updated_at = CURRENT_TIMESTAMP WHERE user_id = :uid"
                    ),
                    {"uid": user_id},
                )
                return "free"
            if paid > 0:
                await session.execute(
                    _sa_text(
                        "UPDATE explanation_credits SET paid_remaining = paid_remaining - 1, "
                        "updated_at = CURRENT_TIMESTAMP WHERE user_id = :uid"
                    ),
                    {"uid": user_id},
                )
                return "paid"
            return None

    async def refund_explanation_credit(self, user_id: str, bucket: str) -> None:
        """Restore one credit to the named bucket. Used when the explainer
        call fails after the credit has been decremented — the user must
        not be charged for a model failure they never received output for.
        """
        if bucket not in ("free", "paid"):
            return
        col = "free_remaining" if bucket == "free" else "paid_remaining"
        async with get_session() as session:
            await session.execute(
                _sa_text(
                    f"UPDATE explanation_credits SET {col} = {col} + 1, "
                    "updated_at = CURRENT_TIMESTAMP WHERE user_id = :uid"
                ),
                {"uid": user_id},
            )

    async def add_explanation_credits(self, user_id: str, packs: int) -> Dict[str, Any]:
        """Stripe webhook entry point — add `packs * 3` paid credits and
        bump lifetime_purchased. Idempotency is enforced upstream by
        processed_stripe_events; this method just does the math."""
        if packs <= 0:
            return await self.get_or_seed_explanation_credits(user_id)
        await self.get_or_seed_explanation_credits(user_id)
        async with get_session() as session:
            await session.execute(
                _sa_text(
                    "UPDATE explanation_credits SET "
                    " paid_remaining = paid_remaining + :n, "
                    " lifetime_purchased = lifetime_purchased + :n, "
                    " updated_at = CURRENT_TIMESTAMP "
                    "WHERE user_id = :uid"
                ),
                {"uid": user_id, "n": packs * 3},
            )
            result = await session.execute(
                select(ExplanationCredits).where(ExplanationCredits.user_id == user_id)
            )
            return _row_to_dict(result.scalar_one())

    async def remove_explanation_credits(self, user_id: str, packs: int) -> Dict[str, Any]:
        """Stripe charge.refunded entry point — subtract `packs * 3` paid
        credits, clamping at zero. Lifetime counter is NOT decremented (it
        is a record of how many packs were ever sold, not a current balance).
        """
        if packs <= 0:
            return await self.get_or_seed_explanation_credits(user_id)
        await self.get_or_seed_explanation_credits(user_id)
        async with get_session() as session:
            await session.execute(
                _sa_text(
                    "UPDATE explanation_credits SET "
                    " paid_remaining = GREATEST(0, paid_remaining - :n), "
                    " updated_at = CURRENT_TIMESTAMP "
                    "WHERE user_id = :uid"
                ),
                {"uid": user_id, "n": packs * 3},
            )
            result = await session.execute(
                select(ExplanationCredits).where(ExplanationCredits.user_id == user_id)
            )
            return _row_to_dict(result.scalar_one())

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
        """Upsert a system shadow record for a hardcoded route module."""
        existing = await self.get_ws_module_by_slug(slug)
        if existing:
            await self.update_ws_module(existing["id"], {
                "name": name,
                "ui_meta": ui_meta,
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
# 676:41
