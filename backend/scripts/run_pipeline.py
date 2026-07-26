#!/usr/bin/env python3
"""
ORBIT — full pipeline runner (midsem demo entry point).

Wires mock sniffer → ingestion → detection engine → console alerts.

Usage:
    cd backend
    python -m scripts.run_pipeline

Options:
    --evil-twin-at N   seconds before evil twin goes live (default 10)
    --speed N          simulation speed multiplier (default 5.0 = 5x faster)
    --duration N       stop after N seconds of sim time (default 60)
"""

from __future__ import annotations

import argparse
import sys
import threading
import time

sys.path.insert(0, ".")

from orbit.ingestion.frame_source import FrameSource, ProcessFrameSource
from orbit.ingestion.serial_reader import IngestionQueue, start_readers
from orbit.detection.engine import DetectionEngine


def main() -> None:
    p = argparse.ArgumentParser(description="ORBIT full pipeline — mock sniffer to detection engine")
    p.add_argument("--evil-twin-at", type=float, default=10.0,
                   help="sim-seconds before evil twin goes live (default 10)")
    p.add_argument("--speed", type=float, default=5.0,
                   help="simulation speed multiplier (default 5.0)")
    p.add_argument("--duration", type=float, default=60.0,
                   help="stop after this many real seconds (default 60)")
    args = p.parse_args()

    print(f"[ORBIT] Starting pipeline  speed={args.speed}x  evil-twin-at={args.evil_twin_at}s  duration={args.duration}s")
    print()

    # --- frame sources: two mock nodes ---
    sources: list[FrameSource] = [
        ProcessFrameSource(
            node_id="A",
            cmd=[
                sys.executable, "-m", "scripts.mock.mock_sniffer",
                "--node", "A",
                "--evil-twin-at", str(args.evil_twin_at),
                "--speed", str(args.speed),
            ],
        ),
        ProcessFrameSource(
            node_id="B",
            cmd=[
                sys.executable, "-m", "scripts.mock.mock_sniffer",
                "--node", "B",
                "--evil-twin-at", str(args.evil_twin_at),
                "--speed", str(args.speed),
            ],
        ),
    ]

    # --- shared ingestion queue ---
    queue = IngestionQueue(maxsize=2000)

    # --- start reader threads (one per node) ---
    readers = start_readers(sources, queue)

    # --- detection engine in its own thread ---
    engine = DetectionEngine()

    def engine_loop():
        engine.run(queue)

    engine_thread = threading.Thread(target=engine_loop, daemon=True, name="orbit-engine")
    engine_thread.start()

    # --- run for --duration seconds then shut down ---
    try:
        time.sleep(args.duration)
    except KeyboardInterrupt:
        print("\n[ORBIT] Interrupted by user.")

    print(f"\n[ORBIT] Duration reached — shutting down.")
    for r in readers:
        r.stop()

    # give engine a moment to drain remaining queue items
    time.sleep(0.5)

    print(f"[ORBIT] Queue depth at shutdown : {queue.qsize()}")
    print(f"[ORBIT] Dropped frames          : {queue.dropped_count}")
    print(f"[ORBIT] Malformed frames        : {queue.malformed_count}")


if __name__ == "__main__":
    main()
