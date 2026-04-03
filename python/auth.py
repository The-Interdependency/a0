from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class ReplitAuthMiddleware(BaseHTTPMiddleware):
    """
    Pass-through middleware. Auth headers (x-replit-user-id, etc.) are
    now set by the upstream Express auth proxy before requests reach
    this Python backend.
    """

    async def dispatch(self, request: Request, call_next):
        return await call_next(request)
