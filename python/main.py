import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[python] FastAPI starting — DB engine initialized")
    yield
    await engine.dispose()
    print("[python] FastAPI shutdown")


app = FastAPI(title="A0P Python Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "http://localhost:5173",
        "http://0.0.0.0:5000",
        "http://0.0.0.0:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "python-backend"}


STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "dist", "public")
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
