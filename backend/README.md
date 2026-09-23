# ORBIT Backend & Detection Engine

The backend processes incoming 802.11 and BLE frames from dual ESP32 nodes (or the built-in mock RF simulator), extracts structured management/EAPOL headers, scores anomalies through an explainable multi-signal state machine, persists threat history in SQLite, and provides a real-time FastAPI + WebSocket service to the dashboard.

---

## 🏗️ Architecture

- **`orbit/ingestion/`**:
  - `frame_source.py`: Unified abstraction for `SerialFrameSource` (Node A COM port), `NetworkFrameSource` (Node B TCP/UDP forwarder), and `ProcessFrameSource` (Mock simulator).
  - `serial_reader.py`: Multi-threaded bounded queue ingestion with host-level microsecond timestamping.
- **`orbit/parsing/`**:
  - `frame_parser.py`: 802.11 management frame and synthetic EAPOL parser.
  - `rsn_parser.py`: Robust Security Network (RSN) Information Element (IE) decoder for cipher suites, AKM, and PMF validation.
  - `oui_lookup.py`: Static BSSID/MAC OUI hardware vendor resolution.
- **`orbit/detection/`**:
  - `engine.py`: Central detection coordinator. Dispatches frames to evidence checkers, updates `DeviceRegistry`, and triggers alert callbacks.
  - `evidence.py`: Heuristics for SSID collisions, security downgrades, channel mismatches, and deauth burst tracking.
  - `karma.py`: Stateful multi-SSID probe-response Karma attack detector.
  - `handshake.py`: Correlates targeted client deauth bursts with subsequent 4-way WPA EAPOL handshakes.
  - `ble_correlation.py`: Multi-radio correlation between Wi-Fi rogue signal strength and co-located BLE advertisement RSSI.
  - `anomaly.py`: Z-score statistical anomaly detection over moving RSSI baselines.
  - `narration.py`: Natural-language AI threat narrator with Ollama LLM integration and deterministic security rule fallback.
  - `heatmap.py`: KNN spatial signal model for 2D coordinate trilateration.
- **`orbit/storage/`**:
  - `db.py`: SQLite connection management (WAL mode) and schema migrations.
  - `queries.py`: Queries for device upserts, alert resolution lifecycle, and whitelist management.
- **`orbit/api/`**:
  - `main.py`: FastAPI application exposing REST endpoints (`/devices`, `/alerts`, `/whitelist`, `/health`, `/heatmap`, `/auth`) and `/ws/live` real-time WebSocket channel.

---

## 🚀 Running the Backend

### Standalone with Mock Simulation:
```bash
python -m scripts.run_pipeline --mode mock --api --port 8000 --speed 5.0
```

### Options:
- `--mode {mock,hardware}`: Switch between simulated RF environment and live ESP32 serial readers.
- `--api`: Starts the FastAPI server and WebSocket manager on `--port` (default: 8000).
- `--evil-twin-at N`: Starts evil twin attack after N seconds (default: 10.0s).
- `--speed N`: Simulation speed multiplier (default: 5.0x).
- `--duration N`: Runtime in seconds (0 = run forever).

---

## 🧪 Testing

Run pytest across all backend test modules:
```bash
python -m pytest tests/
```
