import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from contextlib import asynccontextmanager

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set.")

ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://").replace("postgres://", "postgresql+asyncpg://")
SYNC_DATABASE_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")

engine = create_async_engine(ASYNC_DATABASE_URL, echo=False, pool_pre_ping=True)
async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

sync_engine = create_engine(SYNC_DATABASE_URL, echo=False, pool_pre_ping=True)


@asynccontextmanager
async def get_session():
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
