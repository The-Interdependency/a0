import os
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import create_engine
from contextlib import asynccontextmanager

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set.")


def _prepare_url(raw: str, driver: str) -> str:
    parsed = urlparse(raw)
    scheme = driver
    params = parse_qs(parsed.query)
    params.pop("sslmode", None)
    query = urlencode({k: v[0] for k, v in params.items()})
    return urlunparse((scheme, parsed.netloc, parsed.path, parsed.params, query, ""))


ASYNC_DATABASE_URL = _prepare_url(DATABASE_URL, "postgresql+asyncpg")
SYNC_DATABASE_URL = _prepare_url(DATABASE_URL, "postgresql")

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
