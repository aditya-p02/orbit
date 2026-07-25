"""
Phase 2 ingestion: one thread per node (matches "two threads/processes, one
per COM port" from the roadmap), both writing into a single shared queue.
Each item is timestamped at the moment of laptop receipt, not trusted from
the ESP32's onboard clock (design doc §17) — the ESP32 has no RTC/NTP sync,
so its own clock is meaningless across a power cycle.

Malformed JSON is dropped and logged, never allowed to crash ingestion —
a flaky USB connection or a torn line from a serial buffer overrun should
degrade gracefully, not take the whole pipeline down.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from dataclasses import dataclass
from typing import Optional

from orbit.ingestion.frame_source import FrameSource

logger = logging.getLogger("orbit.ingestion")

REQUIRED_FIELDS = {"node", "rssi", "ch", "subtype", "seq", "a1", "a2", "a3", "len", "data"}


@dataclass
class IngestedFrame:
    envelope: dict
    laptop_recv_ts: float
    source_node: str


class IngestionQueue:
    """Shared sink for all node reader threads. Bounded so a stuck consumer
    can't grow memory unboundedly — matches the same backpressure philosophy
    as the firmware's own non-blocking queue send."""

    def __init__(self, maxsize: int = 2000):
        self._q: "queue.Queue[IngestedFrame]" = queue.Queue(maxsize=maxsize)
        self.dropped_count = 0
        self.malformed_count = 0
        self._lock = threading.Lock()

    def put(self, item: IngestedFrame) -> None:
        try:
            self._q.put_nowait(item)
        except queue.Full:
            with self._lock:
                self.dropped_count += 1
            logger.warning("ingestion queue full — dropping frame from node %s", item.source_node)

    def get(self, timeout: Optional[float] = None) -> IngestedFrame:
        return self._q.get(timeout=timeout)

    def qsize(self) -> int:
        return self._q.qsize()


class NodeReaderThread(threading.Thread):
    def __init__(self, source: FrameSource, sink: IngestionQueue):
        super().__init__(daemon=True, name=f"orbit-reader-{source.node_id}")
        self.source = source
        self.sink = sink
        self._stop = threading.Event()

    def run(self) -> None:
        logger.info("reader thread started for node %s", self.source.node_id)
        try:
            for line in self.source.lines():
                if self._stop.is_set():
                    break
                recv_ts = time.time()  # laptop-side receipt timestamp — see module docstring
                envelope = self._parse_line(line)
                if envelope is None:
                    continue
                self.sink.put(
                    IngestedFrame(
                        envelope=envelope,
                        laptop_recv_ts=recv_ts,
                        source_node=self.source.node_id,
                    )
                )
        except Exception:
            logger.exception("reader thread for node %s crashed", self.source.node_id)

    def _parse_line(self, line: str) -> Optional[dict]:
        line = line.strip()
        if not line:
            return None
        try:
            envelope = json.loads(line)
        except json.JSONDecodeError:
            with self.sink._lock:
                self.sink.malformed_count += 1
            logger.debug("dropped malformed (non-JSON) line from node %s: %r", self.source.node_id, line[:120])
            return None

        if not isinstance(envelope, dict) or not REQUIRED_FIELDS.issubset(envelope.keys()):
            with self.sink._lock:
                self.sink.malformed_count += 1
            logger.debug("dropped frame missing required fields from node %s: %r", self.source.node_id, envelope)
            return None

        return envelope

    def stop(self) -> None:
        self._stop.set()
        self.source.close()


def start_readers(sources: list[FrameSource], sink: IngestionQueue) -> list[NodeReaderThread]:
    """Convenience: spin up one reader thread per given FrameSource, all
    feeding the same shared queue."""
    threads = []
    for src in sources:
        t = NodeReaderThread(src, sink)
        t.start()
        threads.append(t)
    return threads
