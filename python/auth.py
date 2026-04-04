from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class UserContextMiddleware(BaseHTTPMiddleware):
    """
    Pass-through middleware. Auth headers (x-user-id, x-user-email, x-user-role)
    are injected by the upstream Express auth proxy before requests reach
    this Python backend.
    """

    async def dispatch(self, request: Request, call_next):
        return await call_next(request)
