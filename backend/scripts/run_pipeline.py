#!/usr/bin/env python3
"""
ORBIT — full pipeline runner.

Modes:
  mock (default)   — mock sniffer → ingestion → detection → console + API
  hardware         — serial (Node A) + network (Node B) → detection → API

Usage:
    cd backend
    python -m scripts.run_pipeline                    # mock, console only
    python -m scripts.run_pipeline --api              # mock + FastAPI on :8000
    python -m scripts.run_pipeline --mode hardware --api   # real hardware + API

Options:
    --evil-twin-at N   seconds before evil twin goes live (default 10)
    --speed N          simulation speed multiplier (default 5.0)
    --duration N       stop after N real seconds (default 60; 0=run forever)
    --api              also start uvicorn on port 8000
    --port N           API port (default 8000)
    --mode {mock,hardware}
"""

from __future__ import annotations

import argparse
import asyncio
import threading
import time
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from orbit.ingestion.frame_source import FrameSource, ProcessFrameSource
from orbit.ingestion.serial_reader import IngestionQueue, start_readers
from orbit.detection.engine import DetectionEngine
from orbit.detection.whitelist import build_default_whitelist
from orbit.storage.db import get_conn, init_db
from orbit.storage import queries as q


def make_on_alert(loop: asyncio.AbstractEventLoop | None, pipeline_state=None):
    """
    Returns the callback passed to DetectionEngine(on_alert=...).
    Persists every alert to SQLite, updates the device row,
    inserts a timeline observation, and pushes over WebSocket.
    """
    from orbit.api.main import _push_alert, _push_device, _push_timeline_event

    def on_alert(dev, hits, frame, narration=None):
        conn = get_conn()
        ts = frame.laptop_recv_ts or time.time()

        # build evidence list for storage
        evidence = [
            {"rule": rule, "points": pts,
             "detail": next((h.detail for h in hits if h.rule == rule), "")}
            for rule, pts in dev.evidence
        ]

        # upsert device
        q.upsert_device(
            conn,
            mac=dev.bssid, ssid=dev.ssid,
            state=dev.state.value, score=dev.score,
            vendor=dev.vendor or getattr(frame, "vendor_addr2", None),
            channel=dev.channel,
            rssi=dev.rssi,
            device_type=dev.device_type,
            ts=ts,
        )

        # insert alert
        alert_id = q.insert_alert(
            conn,
            device_mac=dev.bssid, ssid=dev.ssid, bssid=dev.bssid,
            score=dev.score, evidence=evidence, narration=narration, ts=ts,
        )

        # insert timeline observation for each new hit
        for hit in hits:
            obs_id = q.insert_observation(
                conn,
                device_mac=dev.bssid,
                event_type=hit.rule,
                detail=hit.detail,
                score=hit.points,
                ts=ts,
            )
            if loop:
                event_row = {"id": obs_id, "device_mac": dev.bssid,
                             "event_type": hit.rule, "detail": hit.detail,
                             "score": hit.points, "timestamp": ts}
                asyncio.run_coroutine_threadsafe(_push_timeline_event(event_row), loop)

        if loop:
            alert_row = q.get_alert(conn, alert_id)
            device_row = q.get_device(conn, dev.bssid)
            asyncio.run_coroutine_threadsafe(_push_alert(alert_row), loop)
            asyncio.run_coroutine_threadsafe(_push_device(device_row), loop)

    return on_alert


def main() -> None:
    p = argparse.ArgumentParser(description="ORBIT pipeline runner")
    p.add_argument("--evil-twin-at", type=float, default=10.0)
    p.add_argument("--speed", type=float, default=5.0)
    p.add_argument("--duration", type=float, default=60.0,
                   help="real seconds to run (0 = forever)")
    p.add_argument("--api", action="store_true",
                   help="also run the FastAPI server on --port")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--mode", choices=["mock", "hardware"], default="mock")
    args = p.parse_args()

    print(f"[ORBIT] mode={args.mode}  speed={args.speed}x  evil-twin-at={args.evil_twin_at}s"
          f"  duration={'forever' if args.duration == 0 else f'{args.duration}s'}"
          f"  api={'yes' if args.api else 'no'}")
    print()

    init_db()

    # --- frame sources ---
    if args.mode == "mock":
        sources: list[FrameSource] = [
            ProcessFrameSource(
                node_id="A",
                cmd=[sys.executable, "-m", "scripts.mock.mock_sniffer",
                     "--node", "A",
                     "--evil-twin-at", str(args.evil_twin_at),
                     "--speed", str(args.speed)],
                cwd=BACKEND_DIR,
            ),
            ProcessFrameSource(
                node_id="B",
                cmd=[sys.executable, "-m", "scripts.mock.mock_sniffer",
                     "--node", "B",
                     "--evil-twin-at", str(args.evil_twin_at),
                     "--speed", str(args.speed)],
                cwd=BACKEND_DIR,
            ),
        ]
    else:
        # hardware mode — SerialFrameSource + NetworkFrameSource
        from orbit.ingestion.frame_source import SerialFrameSource, NetworkFrameSource
        node_a_port = input("Node A serial port (e.g. COM3 or /dev/ttyUSB0): ").strip()
        sources = [
            SerialFrameSource(node_id="A", port=node_a_port),
            NetworkFrameSource(node_id="B", host="0.0.0.0", port=9001),
        ]

    # --- shared queue ---
    queue = IngestionQueue(maxsize=2000)

    # --- optional API / WebSocket ---
    api_loop: asyncio.AbstractEventLoop | None = None
    pipeline_state = None

    if args.api:
        import uvicorn
        from orbit.api.main import app, PipelineState, ws_manager

        pipeline_state = PipelineState()
        app.state.pipeline = pipeline_state

        # load persisted whitelist
        conn = get_conn()
        wl = build_default_whitelist()
        q.load_whitelist_into_memory(conn, wl)
        pipeline_state.whitelist = wl

        # run uvicorn in its own thread with its own event loop
        config = uvicorn.Config(app, host="0.0.0.0", port=args.port, log_level="warning")
        server = uvicorn.Server(config)

        def run_api():
            asyncio.set_event_loop(asyncio.new_event_loop())
            loop = asyncio.get_event_loop()
            globals()["_api_loop_ref"] = loop
            loop.run_until_complete(server.serve())

        api_thread = threading.Thread(target=run_api, daemon=True, name="orbit-api")
        api_thread.start()
        # give uvicorn a moment to start
        time.sleep(1.5)
        # grab the running loop
        api_loop = globals().get("_api_loop_ref")
        print(f"[ORBIT] API running at http://localhost:{args.port}")

    # --- detection engine ---
    engine = DetectionEngine(
        whitelist=getattr(pipeline_state, "whitelist", None),
        on_alert=make_on_alert(api_loop, pipeline_state) if args.api else None,
    )
    if pipeline_state:
        pipeline_state.engine = engine

    # --- reader threads ---
    readers = start_readers(sources, queue)

    # --- hook: update device state in DB after every frame processed ---
    # We do this lazily via the on_alert callback; non-alert device updates
    # happen on a background flush thread every 2 seconds.
    def flush_devices():
        _last_frame_counts: dict[str, int] = {}
        while True:
            time.sleep(2.0)
            try:
                conn = get_conn()
                for dev in engine.registry.all_devices():
                    q.upsert_device(
                        conn,
                        mac=dev.bssid, ssid=dev.ssid,
                        state=dev.state.value, score=dev.score,
                        vendor=dev.vendor,
                        channel=dev.channel,
                        rssi=dev.rssi,
                        device_type=dev.device_type,
                        ts=dev.last_seen or time.time(),
                    )
                if pipeline_state and api_loop:
                    from orbit.api.main import _push_device
                    device_rows = q.get_all_devices(conn)
                    for row in device_rows:
                        asyncio.run_coroutine_threadsafe(_push_device(row), api_loop)
                # update node statuses from readers
                if pipeline_state:
                    pipeline_state.set_queue_depth(queue.qsize())
                    for reader in readers:
                        nid = reader.source.node_id
                        # record new frames since last flush cycle
                        current = reader.frames_read
                        prev = _last_frame_counts.get(nid, 0)
                        new_frames = current - prev
                        _last_frame_counts[nid] = current
                        for _ in range(new_frames):
                            pipeline_state.record_frame(nid)
                        # mark LIVE if the reader is alive
                        if reader.is_alive():
                            pipeline_state.node_status[nid]["status"] = "LIVE"
                        if api_loop:
                            from orbit.api.main import _push_node_status
                            asyncio.run_coroutine_threadsafe(
                                _push_node_status(nid, pipeline_state.node_status[nid]),
                                api_loop,
                            )
            except Exception:
                pass

    flush_thread = threading.Thread(target=flush_devices, daemon=True, name="orbit-flush")
    flush_thread.start()

    # --- engine in its own thread ---
    def engine_loop():
        engine.run(queue)

    engine_thread = threading.Thread(target=engine_loop, daemon=True, name="orbit-engine")
    engine_thread.start()

    # --- run for --duration seconds ---
    try:
        if args.duration == 0:
            while True:
                time.sleep(1)
        else:
            time.sleep(args.duration)
    except KeyboardInterrupt:
        print("\n[ORBIT] Interrupted.")

    print(f"\n[ORBIT] Shutting down.")
    for r in readers:
        r.stop()
    time.sleep(0.5)
    print(f"[ORBIT] Queue depth at shutdown : {queue.qsize()}")
    print(f"[ORBIT] Dropped frames          : {queue.dropped_count}")
    print(f"[ORBIT] Malformed frames        : {queue.malformed_count}")


if __name__ == "__main__":
    main()
