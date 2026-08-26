# ORBIT

Wi-Fi/BLE intrusion detection — dual-node ESP32 sniffers feeding a Python
detection engine (evil twin, Karma, deauth/handshake-capture-attempt) with
an explainable-alerts dashboard on top.

Full phase-by-phase build plan: `docs/ORBIT_Software_Roadmap.md`
Current team split: `docs/ORBIT_Team_Roadmap_v2.md`

## Status right now

Stage 1 detection is complete on the software/mock pipeline. No physical
hardware is required for the current midsem path: the mock sensor nodes emit
real, byte-accurate 802.11 frames in the exact JSON format the firmware will
eventually send over serial.

Current working path:
- mock Node A + Node B
- ingestion queue
- 802.11 parser
- Stage 1 detection engine
- console alert with full evidence breakdown

See `backend/README.md` to run the verified pipeline.

## Layout

```
firmware/    ESP32 sniffer firmware (Arduino/PlatformIO) — hardware path
backend/     Python: ingestion, parsing, detection engine, API
dashboard/   (not started yet) React dashboard
docs/        Design doc, roadmap, team split
```

## Getting started (backend, no hardware needed)

```bash
cd backend
python -m scripts.run_pipeline --evil-twin-at 10 --speed 5 --duration 60
```

See `backend/README.md` for details on what's already built vs. still open.

## Getting started (firmware, once hardware's in hand)

```bash
cd firmware
pip install -r requirements.txt
pio run -e node_a -t upload --upload-port <NODE_A_COM_PORT>
pio run -e node_b -t upload --upload-port <NODE_B_COM_PORT>
```

Run `pio device list` first to find the actual COM ports — they're not
fixed and will vary by machine/USB port.
this orbit is for educational purposes.
