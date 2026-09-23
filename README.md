# ORBIT — Dual-Node Wi-Fi & BLE Intrusion Detection System

**ORBIT** is an explainable, real-time Wireless Intrusion Detection System (WIDS) built for dual-node ESP32 RF sniffers and a multi-layered detection backend. It detects and correlates sophisticated wireless attacks—such as Evil Twin access points, Karma/probe traps, 4-way WPA handshake capture deauth attacks, and co-located BLE tracking beacons—backed by a local, air-gapped explainable AI narration engine and an interactive spatial telemetry dashboard.

---

## 🚀 Key Features

- **Dual-Node RF Architecture**:
  - **Node A (Channel Hopper)**: Sweeps 2.4 GHz channels 1–11 every 300ms for continuous airspace discovery.
  - **Node B (Home Channel Guard)**: Stays parked on the designated baseline channel (e.g. Channel 6) for 100% duty-cycle deauth burst and EAPOL capture interception.
- **Explainable Multi-Signal Detection Engine**:
  - **SSID Collision & Security Downgrade**: Flags open rogue APs mimicking encrypted network credentials.
  - **Channel Mismatch & Z-Score RSSI Anomalies**: Detects abnormal signal jumps and unauthorized frequency shifting.
  - **Karma Attack Tracking**: Identifies rogue APs responding to probe requests for multiple distinct SSIDs.
  - **Handshake Capture Defense**: Detects targeted deauthentication bursts paired with immediate EAPOL 4-way reconnection frames.
  - **Wi-Fi + BLE Cross-Correlation**: Pinpoints physical attackers moving toward the perimeter with synchronized multi-radio signal spikes.
- **Explainable AI Alerts**:
  - Translates technical raw frame evidence into plain-English threat breakdowns via local Ollama LLM integration with instant deterministic fallback.
- **Comprehensive Spatial Proximity & Telemetry Dashboard**:
  - Real-time SVG spatial map with calibrated RSSI path-loss distance triangulation.
  - Multi-category RF device monitoring across APs, Client Stations, and BLE Peripherals.
  - Interactive alerts management with resolution lifecycle and one-click SSID/BSSID whitelisting.
  - Real-time WebSocket streaming for instant device discovery, alert feeds, and sensor FPS telemetry.

---

## 📁 Project Structure

```
orbit/
├── backend/                  # Python backend & detection engine
│   ├── orbit/
│   │   ├── api/              # FastAPI REST endpoints, auth, & WebSockets
│   │   ├── detection/        # Core detection engine, heuristics, Z-score, AI narrator
│   │   ├── ingestion/        # Serial / Network / Subprocess multi-source frame ingestion
│   │   ├── parsing/          # 802.11 IE decoder, RSN security parser, OUI vendor lookup
│   │   └── storage/          # SQLite database layer, schema migrations, and queries
│   ├── scripts/              # Pipeline runner, node forwarders, and mock RF simulator
│   └── tests/                # Comprehensive unit and integration test suite (82 tests)
│
├── dashboard/                # Modern React + Vite + Tailwind CSS dashboard
│   ├── src/
│   │   ├── components/       # Overview, Devices, Alerts, Proximity, Nodes, Timeline
│   │   ├── lib/              # API client & WebSocket connector
│   │   └── data/             # Types, mock fallback dataset, & theme tokens
│
├── firmware/                 # ESP32 C++ sniffer firmware (PlatformIO / Arduino)
│   ├── src/                  # main_node_a.cpp (Hopper) and main_node_b.cpp (Guard)
│   └── lib/orbit_common/     # Promiscuous packet filtering and JSON serial emitter
│
└── docs/                     # Architectural design, roadmaps, and presentation guides
```

---

## ⚡ Quickstart Guide

### 1. Prerequisites
- **Python**: 3.10+ (tested on Python 3.11/3.14)
- **Node.js**: 18+ (tested with npm)
- **PlatformIO** (optional, only needed for flashing physical ESP32 hardware)

---

### 2. Running in Simulated / Mock Mode (No Hardware Needed)

You can run the full dual-node pipeline and web dashboard entirely in software simulation mode:

#### Terminal 1 — Backend & Pipeline:
```bash
cd backend
python -m pip install -r requirements.txt  # if not already installed
python -m scripts.run_pipeline --mode mock --api --evil-twin-at 10 --speed 5.0 --duration 0
```
*The API will start at `http://localhost:8000`.*

#### Terminal 2 — Frontend Dashboard:
```bash
cd dashboard
npm install
npm run dev
```
*Open `http://localhost:5173` in your browser. Default login: `admin` / `orbit2026`.*

---

### 3. Running with Physical ESP32 Hardware

1. **Flash Firmware**:
   ```bash
   cd firmware
   pio run -e node_a -t upload --upload-port <NODE_A_COM_PORT>
   pio run -e node_b -t upload --upload-port <NODE_B_COM_PORT>
   ```
2. **Start Backend with Hardware Source**:
   ```bash
   cd backend
   python -m scripts.run_pipeline --mode hardware --api
   ```

---

## 🧪 Testing & Verification

Run the comprehensive test suite:

```bash
# Backend pytest suite (82 tests)
python -m pytest backend/tests

# Frontend typecheck & build
npm run build --prefix dashboard
```

---

## 🔒 Security & Academic Scope

Built for educational purposes, wireless intrusion research, and campus airspace security monitoring.
Developed by Group SY-I16.
