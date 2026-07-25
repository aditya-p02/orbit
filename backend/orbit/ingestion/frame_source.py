"""
A FrameSource is anything that yields raw text lines (one JSON frame per
line) for a single node. Ingestion code only ever talks to this interface,
never to pyserial or a file directly — that's what lets the exact same
serial_reader.py run against a real ESP32 in Phase 1 or a mock generator
right now with zero code changes downstream.
"""

from __future__ import annotations

import subprocess
import sys
from abc import ABC, abstractmethod
from typing import Iterator, Optional


class FrameSource(ABC):
    node_id: str

    @abstractmethod
    def lines(self) -> Iterator[str]:
        """Yield raw lines as they arrive. Blocks waiting for the next one."""
        ...

    def close(self) -> None:
        pass


class SerialFrameSource(FrameSource):
    """Real hardware. Not usable until Phase 1 firmware is flashed and a
    board is actually plugged in — kept here so swapping to real hardware
    later is a one-line change in the source config, not a rewrite."""

    def __init__(self, node_id: str, port: str, baud: int = 115200):
        self.node_id = node_id
        self.port = port
        self.baud = baud
        self._ser = None

    def lines(self) -> Iterator[str]:
        import serial  # local import: don't require pyserial if unused (mock-only dev)

        self._ser = serial.Serial(self.port, self.baud, timeout=1)
        while True:
            raw = self._ser.readline()
            if not raw:
                continue  # readline timeout, not EOF — keep waiting
            yield raw.decode("utf-8", errors="replace").rstrip("\r\n")

    def close(self) -> None:
        if self._ser is not None:
            self._ser.close()


class ProcessFrameSource(FrameSource):
    """Runs a subprocess (e.g. scripts/mock_sniffer.py --node A) and streams
    its stdout line-by-line. This is what stands in for hardware right now:
    same "one continuous line stream" shape as a serial port, so nothing
    downstream needs to know or care that there's no board attached."""

    def __init__(self, node_id: str, cmd: list[str]):
        self.node_id = node_id
        self.cmd = cmd
        self._proc: Optional[subprocess.Popen] = None

    def lines(self) -> Iterator[str]:
        self._proc = subprocess.Popen(
            self.cmd, stdout=subprocess.PIPE, text=True, bufsize=1
        )
        assert self._proc.stdout is not None
        for line in self._proc.stdout:
            yield line.rstrip("\r\n")

    def close(self) -> None:
        if self._proc is not None:
            self._proc.terminate()


class FileFrameSource(FrameSource):
    """Replays a previously-saved capture file, one JSON line at a time.
    This IS the roadmap's planned scripts/replay_capture.py mechanism
    (Phase 9 offline tuning) — built now because we need it today anyway."""

    def __init__(self, node_id: str, path: str, loop: bool = False):
        self.node_id = node_id
        self.path = path
        self.loop = loop

    def lines(self) -> Iterator[str]:
        while True:
            with open(self.path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.rstrip("\r\n")
                    if line:
                        yield line
            if not self.loop:
                return
