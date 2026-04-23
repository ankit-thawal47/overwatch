from __future__ import annotations
import asyncio
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .auth import ACCESS_TOKEN
from .ws import ConnectionManager
from .watcher import watch, poll_ports
from .routers import projects, sessions, ports, worktrees, stats
from .telegram import make_bot

_LOCALHOST = {"127.0.0.1", "::1", "localhost"}
# Paths that are always public (the auth endpoint itself + static assets)
_PUBLIC_PREFIXES = ("/api/auth",)


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = ConnectionManager()
    app.state.ws_manager = manager
    asyncio.create_task(watch(manager))
    asyncio.create_task(poll_ports(manager))

    bot = make_bot()
    if bot:
        task = asyncio.create_task(bot.run())
    else:
        task = None

    print(
        f"\n  ┌─────────────────────────────────────┐\n"
        f"  │  OVERWATCH  access code: {ACCESS_TOKEN:<10} │\n"
        f"  └─────────────────────────────────────┘\n"
    )

    yield

    if bot and task:
        task.cancel()
        await bot.close()


app = FastAPI(title="Overwatch", lifespan=lifespan)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    client_host = request.client.host if request.client else ""

    # Localhost always bypasses auth
    if client_host in _LOCALHOST:
        return await call_next(request)

    # Public paths (auth endpoint)
    if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return await call_next(request)

    # Only guard /api/* and /ws; static assets pass through
    if not (path.startswith("/api") or path == "/ws"):
        return await call_next(request)

    # Validate cookie
    if request.cookies.get("ow_token") == ACCESS_TOKEN:
        return await call_next(request)

    return JSONResponse({"detail": "unauthorized"}, status_code=401)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    response.headers["X-Process-Time-Ms"] = f"{ms:.1f}"
    return response


@app.post("/api/auth")
async def do_auth(request: Request):
    body = await request.json()
    if body.get("token") != ACCESS_TOKEN:
        return JSONResponse({"detail": "invalid code"}, status_code=403)
    response = JSONResponse({"ok": True})
    response.set_cookie(
        "ow_token", ACCESS_TOKEN,
        httponly=True, samesite="lax",
        max_age=86400 * 30,  # 30 days
    )
    return response


# CORS for dev (frontend at :5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(worktrees.router, prefix="/api")  # before projects to avoid path conflicts
app.include_router(projects.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(ports.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    manager: ConnectionManager = app.state.ws_manager
    await manager.connect(ws)
    try:
        while True:
            # Keep connection alive; ignore any incoming messages
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception:
        manager.disconnect(ws)


# Serve static frontend in production
_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="static")


def start():
    import webbrowser
    import threading
    import uvicorn

    threading.Timer(1.2, lambda: webbrowser.open("http://localhost:8080")).start()
    uvicorn.run("sessions.main:app", host="127.0.0.1", port=8080, log_level="warning")
