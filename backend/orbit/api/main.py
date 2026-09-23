"""
ORBIT FastAPI application (Stage 3).

Endpoints:
  POST /login                  — authenticate, set session cookie
  POST /logout                 — clear session cookie
  GET  /devices                — live device table
  GET  /alerts                 — alert history with evidence JSON
  POST /alerts/{id}/resolve    — mark alert resolved
  GET  /whitelist              — trusted AP list
  POST /whitelist              — add trusted AP entry
  DELETE /whitelist            — remove trusted AP entry
  GET  /health                 — node A/B status, queue depth, uptime
  GET  /observations           — threat timeline events
  WebSocket /ws/live           — real-time push: device_update, alert,
                                 node_status, timeline_event

Run with:
    uvicorn orbit.api.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import (
    Cookie, Depends, FastAPI, Form, HTTPException,
    Request, Response, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from orbit.api.auth import check_credentials, make_token, verify_token
from orbit.storage.db import get_conn, init_db
import orbit.storage.queries as q

# ---------------------------------------------------------------------------
# Shared pipeline state (injected by run_pipeline when running full stack)
# ---------------------------------------------------------------------------

class PipelineState:
    """
    Mutable shared state between the pipeline runner and the API.
    run_pipeline.py creates one instance and assigns it to app.state.pipeline.
    """
    def __init__(self):
        self.node_status: dict[str, dict] = {
            "A": {"status": "OFFLINE", "frames": 0, "fps": 0.0, "queue_depth": 0, "last_frame_ts": None},
            "B": {"status": "OFFLINE", "frames": 0, "fps": 0.0, "queue_depth": 0, "last_frame_ts": None},
        }
        self.start_ts: float = time.time()
        self._fps_window: dict[str, list[float]] = {"A": [], "B": []}

    def record_frame(self, node_id: str) -> None:
        now = time.time()
        ns = self.node_status.get(node_id)
        if ns is None:
            return
        ns["frames"] += 1
        ns["last_frame_ts"] = now
        ns["status"] = "LIVE"
        window = self._fps_window.setdefault(node_id, [])
        window.append(now)
        cutoff = now - 5.0
        self._fps_window[node_id] = [t for t in window if t > cutoff]
        ns["fps"] = round(len(self._fps_window[node_id]) / 5.0, 1)

    def set_queue_depth(self, depth: int) -> None:
        for ns in self.node_status.values():
            ns["queue_depth"] = depth


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class WSManager:
    def __init__(self):
        self._clients: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._clients.append(ws)

    def disconnect(self, ws: WebSocket) -> None:
        self._clients = [c for c in self._clients if c is not ws]

    async def broadcast(self, msg: dict) -> None:
        text = json.dumps(msg)
        dead = []
        for ws in self._clients:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


ws_manager = WSManager()


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not hasattr(app.state, "pipeline"):
        app.state.pipeline = PipelineState()
    yield


app = FastAPI(title="ORBIT IDS API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:3000", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

COOKIE_NAME = "orbit_token"


def current_user(orbit_token: str | None = Cookie(default=None)) -> str:
    if not orbit_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    username = verify_token(orbit_token)
    if not username:
        raise HTTPException(status_code=401, detail="Session expired")
    return username


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

@app.post("/login")
async def login(
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
):
    if not check_credentials(username, password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = make_token(username)
    response.set_cookie(
            COOKIE_NAME, token,
            httponly=True, samesite="lax", secure=False, path="/", max_age=8 * 3600,
        )
    return {"ok": True, "username": username}


@app.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", samesite="lax", secure=False)
    return {"ok": True}


@app.get("/auth/me")
async def auth_me(user: str = Depends(current_user)) -> dict:
    """Lightweight endpoint to validate session and return username."""
    return {"ok": True, "username": user}


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------

@app.get("/devices")
async def get_devices(_user: str = Depends(current_user)) -> list[dict]:
    conn = get_conn()
    return q.get_all_devices(conn)


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

@app.get("/alerts")
async def get_alerts(_user: str = Depends(current_user)) -> list[dict]:
    conn = get_conn()
    return q.get_all_alerts(conn)


@app.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    _user: str = Depends(current_user),
) -> dict:
    conn = get_conn()
    ok = q.resolve_alert(conn, alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    # push update over WebSocket
    alert = q.get_alert(conn, alert_id)
    await ws_manager.broadcast({"type": "alert_resolved", "alert": alert})
    return {"ok": True}


@app.post("/alerts/{alert_id}/unresolve")
async def unresolve_alert(
    alert_id: int,
    _user: str = Depends(current_user),
) -> dict:
    conn = get_conn()
    ok = q.unresolve_alert(conn, alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    # push update over WebSocket
    alert = q.get_alert(conn, alert_id)
    await ws_manager.broadcast({"type": "alert_unresolved", "alert": alert})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Whitelist
# ---------------------------------------------------------------------------

@app.get("/whitelist")
async def get_whitelist(_user: str = Depends(current_user)) -> list[dict]:
    conn = get_conn()
    return q.get_whitelist(conn)


@app.post("/whitelist")
async def add_whitelist(
    request: Request,
    _user: str = Depends(current_user),
) -> dict:
    body = await request.json()
    ssid = body.get("ssid")
    bssid = body.get("bssid")
    if not ssid or not bssid:
        raise HTTPException(status_code=422, detail="ssid and bssid required")
    conn = get_conn()
    q.add_whitelist_entry(conn, ssid, bssid)
    # also update in-memory whitelist if pipeline is running
    pipeline = getattr(request.app.state, "pipeline", None)
    if pipeline and hasattr(pipeline, "whitelist"):
        pipeline.whitelist.add_trusted(ssid, bssid)
    return {"ok": True, "ssid": ssid, "bssid": bssid}


@app.delete("/whitelist")
async def remove_whitelist(
    request: Request,
    _user: str = Depends(current_user),
) -> dict:
    body = await request.json()
    ssid = body.get("ssid")
    bssid = body.get("bssid")
    if not ssid or not bssid:
        raise HTTPException(status_code=422, detail="ssid and bssid required")
    conn = get_conn()
    ok = q.remove_whitelist_entry(conn, ssid, bssid)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health(request: Request) -> dict:
    pipeline: PipelineState = getattr(request.app.state, "pipeline", PipelineState())
    conn = get_conn()
    stats = q.get_health_stats(conn)
    return {
        "uptime_s": round(time.time() - pipeline.start_ts, 1),
        "nodes": pipeline.node_status,
        **stats,
    }


# ---------------------------------------------------------------------------
# Threat timeline / observations
# ---------------------------------------------------------------------------

@app.get("/observations")
async def get_observations(
    mac: str | None = None,
    _user: str = Depends(current_user),
) -> list[dict]:
    conn = get_conn()
    return q.get_observations(conn, mac)


# ---------------------------------------------------------------------------
# Heatmap (Stage 4)
# ---------------------------------------------------------------------------

@app.get("/heatmap")
async def get_heatmap(request: Request, _user: str = Depends(current_user)) -> dict:
    """
    Returns estimated locations for all suspicious/flagged devices.
    Requires the pipeline to be running (engine.heatmap accessible via app.state).
    """
    pipeline = getattr(request.app.state, "pipeline", None)
    engine = getattr(pipeline, "engine", None)

    if engine is None:
        return {"estimates": [], "calibrated": False}

    from orbit.storage.db import get_conn as _gc
    from orbit.detection.heatmap import load_grid
    conn = _gc()
    grid = load_grid(conn)

    estimates = []
    for bssid, est in engine.heatmap.all_estimates().items():
        estimates.append({
            "bssid": bssid,
            "x": round(est.x, 3),
            "y": round(est.y, 3),
            "confidence": round(est.confidence, 2),
            "method": est.method,
        })

    return {"estimates": estimates, "calibrated": len(grid) > 0, "grid_points": len(grid)}


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------

@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket, orbit_token: str | None = Cookie(default=None)):
    # auth check — disconnect unauthenticated connections
    if not orbit_token or not verify_token(orbit_token):
        await ws.close(code=4001)
        return
    await ws_manager.connect(ws)
    try:
        # keep alive — heartbeat every 10s, listen for client pings
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
                if data == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                await ws.send_text(json.dumps({"type": "heartbeat", "ts": time.time()}))
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(ws)


# ---------------------------------------------------------------------------
# Helper: called by the detection engine callback (on_alert)
# ---------------------------------------------------------------------------

async def _push_alert(alert_row: dict) -> None:
    """Called from synchronous engine thread via asyncio.run_coroutine_threadsafe."""
    await ws_manager.broadcast({"type": "alert", "alert": alert_row})


async def _push_device(device_row: dict) -> None:
    await ws_manager.broadcast({"type": "device_update", "device": device_row})


async def _push_node_status(node_id: str, status: dict) -> None:
    await ws_manager.broadcast({"type": "node_status", "node": node_id, **status})


async def _push_timeline_event(event: dict) -> None:
    await ws_manager.broadcast({"type": "timeline_event", "event": event})
