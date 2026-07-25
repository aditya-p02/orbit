# ORBIT

Wi-Fi/BLE intrusion detection — dual-node ESP32 sniffers feeding a Python
detection engine (evil twin, Karma, deauth/handshake-capture-attempt) with
an explainable-alerts dashboard on top.

Full phase-by-phase build plan: `docs/ORBIT_Software_Roadmap.md`
Current team split: `docs/ORBIT_Team_Roadmap_v2.md`

## Status right now

No physical hardware yet, so **Phase 1 (firmware) is paused, not blocking**.
Everything from Phase 2 onward runs against a mock sensor node that emits
real, byte-accurate 802.11 frames in the exact JSON format the firmware
will eventually send over serial — you can develop and test the full
backend pipeline with zero hardware. See `backend/README.md` to get that
running immediately.

## Layout

```
firmware/    ESP32 sniffer firmware (Arduino/PlatformIO) — Phase 0-1
backend/     Python: ingestion, parsing, detection engine, API — Phase 2-4, 6, 9
dashboard/   (not started yet) React dashboard — Phase 5, 8
docs/        Design doc, roadmap, team split
```

## Getting started (backend, no hardware needed)

```bash
cd backend
pip install -r requirements.txt --break-system-packages   # or use a venv
python -m scripts.mock.mock_sniffer --node A &
python -m scripts.mock.mock_sniffer --node B &
```

See `backend/README.md` for how to wire those into the ingestion queue and
what's already built vs. still open.

## Getting started (firmware, once hardware's in hand)

```bash
cd firmware
pip install -r requirements.txt
pio run -e node_a -t upload --upload-port <NODE_A_COM_PORT>
pio run -e node_b -t upload --upload-port <NODE_B_COM_PORT>
```

Run `pio device list` first to find the actual COM ports — they're not
fixed and will vary by machine/USB port.
