# 93:4 0:0 2:3
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select, update, desc, asc

from ..database import get_session
from ..models import (
    MemorySeed, MemoryProjection, MemoryTensorSnapshot,
    EdcmMetricSnapshot,
)
from .core import _CoreStorage, _row_to_dict


class MemoryMixin(_CoreStorage):
    # DOC section: EDCM snapshots

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

    # DOC section: memory seeds

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

    # DOC section: memory projection

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

    # DOC section: tensor snapshots

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
# 93:4 0:0 2:3
