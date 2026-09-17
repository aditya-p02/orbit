# ORBIT backend

## What's built

- `orbit/ingestion/frame_source.py` — abstraction over "where frames come
  from." `SerialFrameSource` (real hardware, not usable yet),
  `ProcessFrameSource` (runs the mock generator as a subprocess and streams
  its stdout), `FileFrameSource` (replays a saved capture file). Downstream
  code only ever talks to this interface.
- `orbit/ingestion/serial_reader.py` — one reader thread per node, both
  feeding a shared bounded queue. Timestamps every frame at laptop-receipt
  time (not the ESP32's clock). Drops and logs malformed JSON instead of
  crashing.
- `orbit/parsing/frame_parser.py` — full 802.11 IE decode: SSID, DS
  Parameter Set (channel), capability info, RSN IE, WPS vendor IE presence.
- `orbit/parsing/rsn_parser.py` — RSN IE breakdown: group/pairwise cipher
  suites, AKM suites, PMF capable/required bits.
- `orbit/parsing/oui_lookup.py` — static BSSID → vendor name table.
- `scripts/mock/` — the mock sensor node. `mock_sniffer.py` simulates both
  the channel-hopping (Node A) and parked (Node B) behavior from the real
  firmware, and plays out a scripted scenario: a trusted AP, an untrusted
  background AP, and an evil twin of the trusted AP that goes live after
  `--evil-twin-at` seconds (default 20s) plus a deauth burst against a
  simulated client. Output is JSON lines, identical in shape to what
  `orbit_sniffer_emit()` sends over serial on real hardware.
- `orbit/detection/whitelist.py` — in-memory trusted SSID+BSSID whitelist.
- `orbit/detection/state_machine.py` — per-device Unknown → Watching →
  Suspicious → Flagged state machine.
- `orbit/detection/evidence.py` — Stage 1 evidence rules: SSID collision,
  security downgrade, channel mismatch, RSSI anomaly, and deauth tracking.
- `orbit/detection/engine.py` — main Stage 1 detection loop. It consumes the
  ingestion queue, scores frames, updates device state, and prints alerts with
  full evidence breakdown.
- `scripts/run_pipeline.py` — current midsem demo entry point. It wires mock
  Node A + Node B into ingestion and detection.

## Not built yet

- `orbit/storage/`, `orbit/api/` — SQLite schema + FastAPI app
- Karma and WPA handshake-capture-attempt detection
- Anything BLE, heatmap, or AI-layer

## Running the current Stage 1 pipeline

```bash
cd backend
python -m scripts.run_pipeline --evil-twin-at 10 --speed 5 --duration 60
```

You can also run the same entry point from the repository root:

```bash
python3 backend/scripts/run_pipeline.py --evil-twin-at 10 --speed 5 --duration 60
```

Expected result: the engine starts, the trusted `HomeNet-5G` AP is learned,
the evil twin appears, and ORBIT prints one alert with evidence breakdown.

## Running only the mock sniffers manually

Terminal 1:
```bash
python -m scripts.mock.mock_sniffer --node A
```

Terminal 2:
```bash
python -m scripts.mock.mock_sniffer --node B
```

Each prints one JSON line per captured frame to stdout. To wire both into
the shared ingestion queue instead of just eyeballing stdout:

```python
from orbit.ingestion.frame_source import ProcessFrameSource
from orbit.ingestion.serial_reader import IngestionQueue, start_readers
from orbit.parsing.frame_parser import parse_frame
import sys, time

sink = IngestionQueue()
sources = [
    ProcessFrameSource("A", [sys.executable, "-m", "scripts.mock.mock_sniffer", "--node", "A"]),
    ProcessFrameSource("B", [sys.executable, "-m", "scripts.mock.mock_sniffer", "--node", "B"]),
]
start_readers(sources, sink)

while True:
    item = sink.get(timeout=5)
    parsed = parse_frame(item.envelope, item.laptop_recv_ts)
    print(parsed)
```

Useful mock flags while testing:
- `--speed 20` — runs 20x faster than real time (good for quick iteration)
- `--evil-twin-at 5` — evil twin goes live after 5s instead of the default 20s
- `--seed <int>` — change the RSSI-noise seed if you want a different run

## Once real hardware is flashed (Phase 1 done)

Swap `ProcessFrameSource` for `SerialFrameSource(node_id, port)` — nothing
else in ingestion or parsing changes.
