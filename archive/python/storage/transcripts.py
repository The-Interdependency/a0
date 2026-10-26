# 287:36 0:0 2:3
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, delete, func, desc, asc, text as _sa_text

from ..database import get_session
from ..models import (
    TranscriptSource, TranscriptReport, TranscriptUpload,
    TranscriptMessage, TranscriptExplanation, ExplanationCredits,
)
from .core import _CoreStorage, _row_to_dict


class TranscriptMixin(_CoreStorage):
    # DOC section: uploads

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
        """Count successful uploads by a user since a given datetime (free quota gating)."""
        async with get_session() as session:
            result = await session.execute(
                select(func.count(TranscriptUpload.id)).where(
                    TranscriptUpload.user_id == user_id,
                    TranscriptUpload.status == "done",
                    TranscriptUpload.created_at >= since,
                )
            )
            return int(result.scalar_one() or 0)

    # DOC section: sources

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
        """Delete source and cascade-delete its reports."""
        async with get_session() as session:
            await session.execute(delete(TranscriptSource).where(TranscriptSource.slug == slug))
            await session.execute(delete(TranscriptReport).where(TranscriptReport.source_slug == slug))

    # DOC section: reports and messages

    async def create_transcript_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        async with get_session() as session:
            r = TranscriptReport(**data)
            session.add(r)
            await session.flush()
            await session.refresh(r)
            return _row_to_dict(r)

    async def add_transcript_report(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Alias of create_transcript_report used by source-scoped callers."""
        return await self.create_transcript_report(data)

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

    async def get_transcript_messages(
        self, report_id: int, user_id: Optional[str] = None,
        limit: int = 200, offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """User-scoped when user_id is passed (joined via uploads) to prevent IDOR.
        Returns [] if the report exists but doesn't belong to the caller.
        """
        async with get_session() as session:
            if user_id is not None:
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

    # DOC section: explanations and credits

    async def get_transcript_explanation(
        self, report_id: int, user_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Owner-scoped. Returns None if no explanation exists OR if it belongs
        to a different user — callers treat both as 404 to avoid cross-user leaks.
        """
        async with get_session() as session:
            q = select(TranscriptExplanation).where(TranscriptExplanation.report_id == report_id)
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
        insert raise IntegrityError — callers must check existence first.
        """
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
        """Return the user's credit row, seeding 3 free credits on first read.
        Idempotent via INSERT ... ON CONFLICT DO NOTHING — concurrent first
        reads cannot both seed and double the free count.
        """
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
        """Decrement one credit free-then-paid. Returns the bucket consumed
        ('free' | 'paid') or None if both are zero.

        SELECT ... FOR UPDATE locks the row for the txn duration so parallel
        /explain calls from the same user cannot both decrement past zero.
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
        """Restore one credit to the named bucket. Called when the explainer
        fails after the credit was decremented — the user must not be charged
        for a model failure they never received output for.
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
        """Stripe webhook entry — add packs*3 paid credits and bump
        lifetime_purchased. Idempotency enforced upstream by processed_stripe_events.
        """
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
        """Stripe charge.refunded entry — subtract packs*3 paid credits,
        clamping at zero. Lifetime counter is NOT decremented.
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
# 287:36 0:0 2:3
