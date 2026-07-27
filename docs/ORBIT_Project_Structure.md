# ORBIT — Complete Project File Structure

**Last updated:** July 2026
**Purpose:** Reference for what the final project looks like when fully built.
Use this to track progress — mark files DONE as they get created and working.

Status legend used in this file:
  [DONE]    — file exists and is working
  [PARTIAL] — file exists but incomplete or not tested
  [PENDING] — not created yet, needs to be built
  [HARDWARE]— exists in software, activates when ESP32 arrives

External docs added at bottom (files given directly, not in repo).

---

```
orbit/
│
├── README.md                                          [DONE]
├── .gitignore                                         [DONE]
│
│
├── docs/                                              [DONE]
│   ├── ORBIT_Project_Structure.md                     [DONE]  ← this file
│   ├── ORBIT_Software_Roadmap.md                      [DONE]
│   ├── ORBIT_Team_Roadmap_v2.md                       [DONE]
│   ├── ORBIT_Dashboard_Design.md                      [DONE]  ← full dashboard layout, visual design, component guide
│   ├── ORBIT_Design_Document_v1_2.docx                [DONE]  ← design doc (external copy added below)
│   └── evidence_weight_reference.md                   [PENDING] ← weight table quick reference
│
│
├── firmware/                                          (Stage 1 — hardware)
│   ├── README.md                                      [DONE]
│   ├── platformio.ini                                 [DONE]
│   ├── requirements.txt                               [DONE]
│   │
│   ├── src/
│   │   ├── main_node_a.cpp                            [DONE]  ← Node A: channel hopper
│   │   ├── main_node_b.cpp                            [DONE]  ← Node B: home channel parked
│   │   └── main_node_b_ble.cpp                        [HARDWARE] ← Node B with BLE scanning added
│   │
│   └── lib/
│       └── orbit_common/
│           ├── orbit_sniffer.h                        [DONE]
│           ├── orbit_sniffer.cpp                      [DONE]
│           └── orbit_ble.cpp                          [HARDWARE] ← BLE scanning, scheduled during WiFi dwell gaps
│
│
├── backend/
│   ├── README.md                                      [DONE]
│   ├── requirements.txt                               [DONE]
│   │
│   ├── orbit/                                         (main Python package)
│   │   ├── __init__.py                                [DONE]
│   │   │
│   │   ├── ingestion/                                 (Stage 1 — already built)
│   │   │   ├── __init__.py                            [DONE]
│   │   │   ├── frame_source.py                        [DONE]  ← SerialFrameSource, ProcessFrameSource, FileFrameSource
│   │   │   └── serial_reader.py                       [DONE]  ← NodeReaderThread, IngestionQueue
│   │   │
│   │   ├── parsing/                                   (Stage 1 — already built)
│   │   │   ├── __init__.py                            [DONE]
│   │   │   ├── frame_parser.py                        [DONE]  ← full 802.11 IE parser, ParsedFrame
│   │   │   ├── rsn_parser.py                          [DONE]  ← RSN IE, WPA2/WPA3, PMF bits
│   │   │   ├── oui_lookup.py                          [DONE]  ← static OUI → vendor table
│   │   │   └── ble_parser.py                          [PENDING] ← BLE advertisement parser (Stage 4)
│   │   │
│   │   ├── detection/                                 (Stage 1 — DONE)
│   │   │   ├── __init__.py                            [DONE]  ← empty
│   │   │   ├── whitelist.py                           [DONE]  ← trusted SSID+BSSID store
│   │   │   ├── state_machine.py                       [DONE]  ← per-device Unknown→Watching→Suspicious→Flagged
│   │   │   ├── evidence.py                            [DONE]  ← Stage 1 evidence checkers + scoring
│   │   │   ├── engine.py                              [DONE]  ← main detection loop, consumes ingestion queue
│   │   │   ├── karma.py                               [PENDING] ← Karma / probe-response attack detection (Stage 2)
│   │   │   ├── handshake.py                           [PENDING] ← WPA handshake-capture-attempt detection (Stage 2)
│   │   │   ├── ble_correlation.py                     [PENDING] ← BLE+WiFi RSSI trend correlation (Stage 4)
│   │   │   └── anomaly.py                             [PENDING] ← z-score anomaly model, replaces simple RSSI threshold (Stage 4)
│   │   │
│   │   ├── storage/                                   (Stage 3 — NOT STARTED)
│   │   │   ├── __init__.py                            [DONE]  ← empty
│   │   │   ├── db.py                                  [PENDING] ← SQLite connection, schema creation, migrations
│   │   │   ├── models.py                              [PENDING] ← Device, Alert, Whitelist, BLEObservation, Observation dataclasses
│   │   │   └── queries.py                             [PENDING] ← all read/write queries used by detection + API
│   │   │
│   │   ├── api/                                       (Stage 3 — NOT STARTED)
│   │   │   ├── __init__.py                            [DONE]  ← empty
│   │   │   ├── main.py                                [PENDING] ← FastAPI app entry point
│   │   │   ├── routes/
│   │   │   │   ├── devices.py                         [PENDING] ← GET /devices
│   │   │   │   ├── alerts.py                          [PENDING] ← GET /alerts, POST /alerts/{id}/resolve
│   │   │   │   ├── whitelist.py                       [PENDING] ← GET /whitelist, POST /whitelist
│   │   │   │   └── health.py                          [PENDING] ← GET /health
│   │   │   ├── websocket.py                           [PENDING] ← WebSocket /ws/live — push alerts + device updates
│   │   │   └── auth.py                                [PENDING] ← session login, protect all routes
│   │   │
│   │   └── config/
│   │       ├── __init__.py                            [DONE]
│   │       ├── .gitkeep                               [DONE]
│   │       └── settings.py                            [PENDING] ← evidence weights, thresholds, node ports, DB path
│   │
│   ├── scripts/
│   │   ├── __init__.py                                [DONE]
│   │   │
│   │   └── mock/                                      (Stage 1 — already built)
│   │       ├── __init__.py                            [DONE]
│   │       ├── ap_world.py                            [DONE]  ← AP scenario definition (trusted, rogue, evil twin)
│   │       ├── frame_builders.py                      [DONE]  ← builds real byte-accurate 802.11 frames
│   │       ├── mock_sniffer.py                        [DONE]  ← simulates Node A + Node B serial output
│   │       └── mock_sniffer_ble.py                    [PENDING] ← extends mock_sniffer to also emit BLE adv frames (Stage 4)
│   │
│   └── tests/
│       ├── fixtures/
│       │   └── .gitkeep                               [DONE]
│       ├── test_parser.py                             [PENDING] ← unit tests for frame_parser + rsn_parser
│       ├── test_detection.py                          [PENDING] ← unit tests for all evidence rules + state machine
│       ├── test_karma.py                              [PENDING] ← unit tests for Karma detection
│       ├── test_handshake.py                          [PENDING] ← unit tests for WPA handshake detection
│       └── test_api.py                                [PENDING] ← integration tests for FastAPI endpoints
│
│
├── dashboard/                                         (Stage 3 — NOT STARTED)
│   ├── package.json                                   [PENDING] ← React project config + dependencies
│   ├── public/
│   │   ├── .gitkeep                                   [DONE]
│   │   └── index.html                                 [PENDING] ← HTML shell for React app
│   │
│   └── src/
│       ├── index.js                                   [PENDING] ← React entry point
│       ├── App.js                                     [PENDING] ← root component, routing, auth guard
│       │
│       ├── components/
│       │   ├── .gitkeep                               [DONE]
│       │   ├── Login.js                               [PENDING] ← login form, session auth
│       │   ├── DeviceTable.js                         [PENDING] ← live device list (state, score, last seen, vendor)
│       │   ├── AlertFeed.js                           [PENDING] ← alert list with full evidence breakdown per alert
│       │   ├── EvidenceDetail.js                      [PENDING] ← expandable evidence rows per alert (explainable alerts)
│       │   ├── ThreatTimeline.js                      [PENDING] ← chronological evidence events per device
│       │   ├── NodeHealth.js                          [PENDING] ← Node A / Node B connected status + queue depth
│       │   ├── Heatmap.js                             [PENDING] ← proximity heatmap (floor plan + highlighted zone) (Stage 4)
│       │   └── AlertNarration.js                      [PENDING] ← AI-generated one-sentence alert explanation (Stage 4)
│       │
│       └── services/
│           ├── api.js                                 [PENDING] ← fetch wrappers for all REST endpoints
│           └── websocket.js                           [PENDING] ← WebSocket client, reconnect logic
│
│
└── data/
    ├── calibration/
    │   └── .gitkeep                                   [DONE]
    │   └── fingerprints.json                          [HARDWARE] ← RSSI fingerprint grid from calibration walk
    │
    └── captures/
        └── .gitkeep                                   [DONE]
        └── baseline_session.jsonl                     [PENDING] ← 30-min passive baseline capture for false-positive count
```

---

## External documents (not in repo, keep copies)

These files were provided separately and are referenced by the project.
Keep them alongside the repo or in the docs/ folder.

| File | Location given | Status |
|---|---|---|
| ORBIT_Design_Document_v1.2.docx | /run/media/aditya/A88898718898402C/Users/adity/Downloads/ORBIT_Design_Document_v1.2 (1).docx | [DONE] |
| edi project.docx (EDI synopsis submitted to college) | /run/media/aditya/A88898718898402C/Users/adity/Downloads/edi project.docx | [DONE] |

Recommended: copy both into docs/ folder so they live with the codebase.

---

## Progress summary (update this as work is done)

| Area | Files | Status |
|---|---|---|
| Firmware | main_node_a.cpp, main_node_b.cpp, orbit_sniffer | DONE |
| Ingestion | frame_source.py, serial_reader.py | DONE |
| Parsing (WiFi) | frame_parser.py, rsn_parser.py, oui_lookup.py | DONE |
| Mock sniffer | ap_world.py, frame_builders.py, mock_sniffer.py | DONE |
| Detection engine | whitelist, state machine, evidence, engine | DONE |
| Karma detection | karma.py | NOT STARTED |
| WPA handshake detection | handshake.py | NOT STARTED |
| Storage | db.py, models.py, queries.py | NOT STARTED |
| API | main.py, routes/, websocket.py, auth.py | NOT STARTED |
| Dashboard | all components | NOT STARTED |
| BLE layer | ble_parser.py, ble_correlation.py, mock_sniffer_ble.py | NOT STARTED |
| AI anomaly | anomaly.py | NOT STARTED |
| Heatmap | Heatmap.js, fingerprints.json | NOT STARTED |
| Firmware BLE | orbit_ble.cpp, main_node_b_ble.cpp | NOT STARTED (needs hardware) |
| Tests | test_*.py | NOT STARTED |
| Docs | roadmap, structure, design doc | DONE |
