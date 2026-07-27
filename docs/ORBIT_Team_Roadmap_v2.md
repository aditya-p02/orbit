# ORBIT — Team Roadmap (EDI Aligned)

**Last updated:** July 27, 2026
**Team:** Aditya Pawar, Kuldeep Pawar, Reya Sharma, Riya Devi — Group SY-I16
**Guide:** Dr. Manisha More
**Deadline:** November 2026 (final) | August end (midsem review)
**Hardware:** ESP32 boards confirmed before final demo.

This roadmap covers every objective stated in the submitted EDI synopsis.
The project is split into 3 tracks. Aditya's track is separate and is the
hardest — it owns all detection logic and the AI/algorithmic layer.
Teammates split the remaining work into two tracks: backend infrastructure
and frontend + testing.

---

## What midsem evaluators need to see (August end)

1. You understand what you are building and why
2. Working code — not just slides and diagrams
3. A credible plan to finish by November

Target for midsem: detection engine running on mock data, printing alerts
with full evidence breakdown to the console. Stage 1 is the only requirement
for midsem. Everything else comes after.

---

## Full scope (aligned to submitted synopsis)

All six objectives from the synopsis are covered across the five stages:

| Synopsis Objective | Stage |
|---|---|
| Detect Evil Twin, Rogue AP, Beacon Flood, Probe Flood | Stage 1 |
| Karma attacks + WPA handshake-capture attempts | Stage 2 |
| BLE correlation with Wi-Fi | Stage 4 |
| Explainable confidence scoring | Stage 1 (runs through all stages) |
| SQLite database + secure dashboard | Stage 3 |
| Optional AI anomaly detection + natural language narration | Stage 4 |
| Proximity heatmap | Stage 4 |

---

## Aditya — Detection Engine + AI/Algorithmic Layer
### Difficulty: hardest track

This is the core of ORBIT. Everything else depends on what this track produces.

**Stage 1 — before midsem (DONE):**

- Whitelist store: `{ssid: [bssid, ...]}` in-memory dict
- Per-device state machine: Unknown → Watching → Suspicious → Flagged
  Score thresholds: Watching at 20, Suspicious at 40, Flagged at 70
- Five evidence checkers:
  - SSID collision: +30
  - Security downgrade: +25
  - Channel mismatch: +15
  - RSSI anomaly: +15 (simple threshold for midsem)
  - Deauth burst tracker: feeds Stage 2
- Main detection loop: consume queue → parse → score → update state → alert

Exit criteria met: evil twin flagged, trusted AP whitelisted, evidence breakdown printed.

**Stage 2 — September:**

Add Karma and WPA handshake-capture detection:

- Karma: flag a BSSID that answers probes for multiple distinct SSIDs (+30)
  combined with those SSIDs being untrusted (+20)
- WPA handshake: deauth burst (+25) followed by EAPOL frames from reconnecting
  client within a short window (+30). Detect the attempt only — never capture
  or decrypt anything.

Files: backend/orbit/detection/karma.py, backend/orbit/detection/handshake.py

**Stage 4 — October (AI + algorithmic layer):**

Replace the simple RSSI threshold with a proper z-score anomaly model:
- Calibration phase: record RSSI and beacon interval per known AP over time
- Live detection: flag deviations > 2 standard deviations as +15 evidence points
- This replaces Rule 4's simple threshold — same score slot, better logic
- File: backend/orbit/detection/anomaly.py

Build the BLE correlation logic:
- Given BLE RSSI trend and suspicious WiFi RSSI trend over the same time window,
  detect correlated movement (both signals strengthening together = same physical device)
- Feed correlation as +15 evidence points into the scoring engine
- Session-scoped only — BLE MACs are randomized, no persistent tracking
- File: backend/orbit/detection/ble_correlation.py

Add AI alert narration via Ollama (build last, after everything else works):
- Install Ollama locally, pull phi3:mini model
- During development: run inference once per distinct evidence combination,
  cache the generated sentence in SQLite alongside the alert
- On demo day: narration loads instantly from cache — zero lag, zero risk
- Optional: wire live inference mode, only use if response is under 2 seconds
- File: backend/orbit/detection/narration.py
- Pitch: "phi3:mini runs locally via Ollama — fully air-gapped, no cloud"

---

## Teammate 1 — Full Backend Infrastructure
### Difficulty: moderate

Owns everything that connects the detection engine to the outside world:
storage, API, network transport, and ingestion hardening.

**Before midsem:**

Ingestion and parsing are already written. Your job is to break them and
fix what breaks:

- Feed the parser malformed JSON lines — does ingestion crash or drop gracefully?
- Feed truncated base64 frame data — does the frame parser crash or return
  parse_ok=False cleanly?
- Feed a beacon with a hidden SSID (zero-length SSID IE) — does it parse correctly?
- Feed frames with vendor IEs not in the OUI table — does lookup_vendor return None?
- Write down every failure and fix it. Aditya's detection engine consumes your
  parser's output — broken parser = broken detection.

Also add EAPOL frame support to the mock sniffer (ap_world.py):
- EAPOL frames are the 4-way handshake frames that appear after a deauth burst
- Aditya needs these to test WPA handshake-capture detection in Stage 2
- Frame structure is simple: recognised by subtype + timing

**Stage 3 — September (storage + API + network transport):**

Build SQLite storage layer:
- File: backend/orbit/storage/db.py — connection, schema creation
- File: backend/orbit/storage/models.py — Device, Alert, Whitelist, BLEObservation dataclasses
- File: backend/orbit/storage/queries.py — all read/write queries
- Tables: devices, alerts, whitelist, ble_observations, observations
  (full schema in ORBIT_Software_Roadmap.md Stage 3a)

Build full FastAPI backend:
- backend/orbit/api/main.py — app entry point
- GET /devices — live device table
- GET /alerts — alert history with full evidence JSON
- POST /alerts/{id}/resolve — mark alert resolved
- GET /whitelist — trusted AP list
- POST /whitelist — add trusted AP
- GET /health — node A + node B status, queue depth, uptime
- WebSocket /ws/live — push device state changes and new alerts in real time
- backend/orbit/api/auth.py — session login, protect all routes

Build the two-laptop network transport:
- NetworkFrameSource (add to backend/orbit/ingestion/frame_source.py):
  Listens on TCP port 9001, yields received JSON lines into IngestionQueue,
  reconnects silently if connection drops, never crashes the pipeline
- node_b_forwarder.py (new, backend/scripts/node_b_forwarder.py):
  Reads Node B serial port, forwards each JSON line over TCP to Aditya's laptop,
  auto-reconnects on drop, prints status every 10 seconds
- run_pipeline.py hardware mode flag: --mode hardware starts SerialFrameSource
  for Node A and NetworkFrameSource for Node B. Mock mode stays untouched.
- Node B connection status visible in GET /health response

Wire detection engine output into SQLite so every alert and device state
change is persisted and served by the API.

**Stage 5 — hardening:**
- Serial reconnection: if reader thread drops (USB disconnect), retry after 3 seconds
- API error handling: all endpoints return proper HTTP codes, no 500s on bad input
- Auth must be working before demo day — no open dashboard

---

## Teammate 2 — Dashboard + Mock Data + Testing + Demo Prep
### Difficulty: easy to moderate

This track owns everything the examiner sees directly: the UI, the test data
quality, and the demo running smoothly.

> IMPORTANT — READ THIS FIRST BEFORE WRITING ANY FRONTEND CODE:
> docs/ORBIT_Dashboard_Design.md
>
> It contains: exact visual theme, full layout diagram, every component's
> behaviour, the 12-step examiner sequence, build order, tech stack.
> Do NOT make any layout or colour decisions without reading it.
> If using an AI assistant: paste the full contents of ORBIT_Dashboard_Design.md
> into the prompt — the AI will not read it on its own.

**Before midsem:**

Mock data (priority — Aditya's engine depends on this):
- Add RSSI variation over time: start at -75 dBm, move to -45 dBm over 30 seconds
- Add a second rogue AP appearing at t=60s — tests multiple simultaneous suspects
- Add ±10ms beacon timing jitter — makes the mock feel like real hardware
- Try evil twin at t=10s, t=30s, t=60s — engine must catch it at any timing
All changes in: backend/scripts/mock/ap_world.py and mock_sniffer.py

Dashboard (start early, build against fake data):
- READ docs/ORBIT_Dashboard_Design.md fully before touching any code
- Get React + Vite + Tailwind set up (see Dashboard Design doc: Tech stack section)
- Build stub dashboard with hardcoded fake data — Login, DeviceTable, AlertFeed
- Follow layout and colours from the design doc exactly, even for the stub
- Coordinate with Teammate 1 to get the exact JSON shape of API responses

**Stage 3 — September (wire real API into dashboard):**

Follow ORBIT_Dashboard_Design.md for exact behaviour of every component:

- Login page — Dashboard Design doc: Login page section
- Live device table — Dashboard Design doc: Left column section
  (row colours, state badges, click to filter timeline)
- Alert feed — Dashboard Design doc: Centre column section
  CRITICAL: every alert card must show each rule that fired + its score
  contribution + one-line reason. Do not collapse to a threat name.
  "Explainable alerts" is in the synopsis — evaluators will check for it.
- Node health panel — Dashboard Design doc: Right column section
  (frames/sec, queue depth, last frame timestamp per node)
- Threat timeline — Dashboard Design doc: Bottom strip section
  (horizontal scrollable event dots, tooltip on click)
- Resolve + whitelist buttons per alert, wired to API
- WebSocket client — Dashboard Design doc: WebSocket behaviour section
  (4 message types: device_update, alert, node_status, timeline_event)
- Login / session auth — non-negotiable before demo day

**Stage 4 — October:**

BLE mock frames (feeds Aditya's BLE correlation logic):
- Extend mock_sniffer.py to emit fake BLE advertisement frames
  Same JSON line format, "type": "ble" field
  Simulate a BLE device moving closer at the same time the evil twin appears
- Extend ingestion queue and serial_reader.py to route BLE frames separately

Heatmap widget — Dashboard Design doc: Right column — Heatmap panel section:
- Floor plan PNG as canvas background (draw a simple room rectangle before demo)
- Node A and Node B markers at their physical corner positions
- Semi-transparent zone showing estimated device location, updates live
- Heatmap placeholder shown until Stage 4 backend logic is ready

AI narration display (AlertNarration.js):
- Show AI narration line inside alert card only if backend provides it
- If not provided: hide section entirely, no placeholder text

**Stage 5 — testing + demo prep (own this entirely):**

Testing:
- Run 30-minute passive baseline session. Count false positives. Write the number
  down — evaluators will ask for it.
- Write unit tests for parser, detection rules, Karma, WPA handshake
  (files: backend/tests/test_parser.py, test_detection.py, test_karma.py, test_handshake.py)

Demo prep:
- Write the full demo script: what gets triggered, in what order, what appears
  on screen. Every team member follows this script — no improvising on demo day.
- Organize minimum two full team rehearsals before the final presentation
- Own demo room logistics: where each person stands, who runs which command,
  what happens if something breaks mid-demo
- Pre-demo checklist (run the day before, not demo morning):
  - [ ] Both laptops connect to hotspot
  - [ ] Aditya's laptop IP noted and stable
  - [ ] node_b_forwarder.py connects and forwards frames successfully
  - [ ] Node B frames appear in Aditya's ingestion console
  - [ ] Dashboard shows both nodes LIVE in health panel
  - [ ] Fallback 10m USB cable tested
  - [ ] Both ESP32s flashed with correct firmware
  - [ ] Serial ports written down for both laptops
  - [ ] Demo script rehearsed with real hardware at least once
  - [ ] Login credentials set and tested

---

## Teammate 3 — Standby
### Status: not yet assigned

Teammate 3 is currently away and will rejoin the team when back in college.

When back: an easy split will be carved out from Aditya's track and handed
over. This will likely be one of the following depending on what is still
pending at that point:
- Mock data enrichment (RSSI variation, jitter, second rogue AP scenarios)
- BLE mock frame generation (extending mock_sniffer.py)
- Unit test writing (test_detection.py, test_karma.py)
- Demo script writing and rehearsal coordination

No task is assigned yet. Do not block any other track waiting for Teammate 3.
Everything is designed so this slot can be filled late without disrupting
the critical path.

---

## Hardware plan

ESP32 boards confirmed to arrive before the final November demo.

Midsem is software-only by design. Mock data is byte-accurate and the pipeline
is identical whether the source is a mock process or a real serial port.

Switching to real hardware: change one line — FrameSource from
ProcessFrameSource to SerialFrameSource. Nothing downstream changes.

Tell evaluators at midsem:
"Hardware arrives before the final submission. Today we demonstrate the
complete detection and alerting logic on simulated sensor data that is
byte-identical to real ESP32 serial output."

---

## Two-laptop demo deployment — full team guide

This section covers exactly how the two-node physical setup works on demo day.
Read this carefully. Every team member needs to know their role.

---

### Why two laptops

The demo room requires Node A at one corner and Node B at the opposite corner
for meaningful spatial coverage — that is the whole point of having two nodes.
A single USB cable cannot realistically span the room. So each node has its
own laptop sitting next to it.

---

### Who owns which laptop

**Aditya's laptop — Corner 1 (main laptop)**
- Node A (ESP32, channel hopper) plugged in via USB
- Runs the full ORBIT backend: ingestion, detection engine, FastAPI API, dashboard
- Listens on TCP port 9001 for Node B frames coming from the teammate's laptop
- The dashboard is opened on this laptop's browser for evaluators to see

**Teammate's laptop — Corner 2 (sensor-only laptop)**
- Node B (ESP32, fixed channel 6) plugged in via USB
- Runs ONE script only: node_b_forwarder.py
- That script reads Node B's serial port and forwards every frame over the
  network to Aditya's laptop
- Nothing else runs on the teammate's laptop during the demo
- Which teammate operates this laptop to be decided by the team

---

### The network: mobile hotspot (not college Wi-Fi)

Use a personal mobile hotspot — either Aditya's phone or a team member's phone.
Do NOT use college Wi-Fi. Reasons:
- College Wi-Fi is shared with hundreds of devices — unstable, unpredictable
- A dropped connection mid-demo would cut off Node B with no warning
- College Wi-Fi sometimes blocks direct device-to-device communication (client isolation)
- A personal hotspot is controlled by the team, only team devices on it,
  and does not need internet access — just LAN routing between two laptops

Before demo day: connect both laptops to the hotspot and note Aditya's laptop IP.
That IP goes into the node_b_forwarder.py command. Do this in advance, not on
demo day morning.

---

### Software components to build (Teammate 1's task — Stage 3)

**Component 1: NetworkFrameSource (backend/orbit/ingestion/frame_source.py)**
Listens on TCP port 9001, yields incoming JSON lines into IngestionQueue,
reconnects if dropped, never crashes the pipeline.

**Component 2: node_b_forwarder.py (backend/scripts/node_b_forwarder.py)**
Reads Node B serial port, sends each JSON line to Aditya's laptop over TCP.
Auto-reconnects. Prints status every 10 seconds.
Usage: python node_b_forwarder.py --port COM3 --host 192.168.x.x

**Component 3: run_pipeline.py hardware mode**
--mode hardware: SerialFrameSource for Node A, NetworkFrameSource for Node B.
Mock mode (ProcessFrameSource) stays untouched.

---

### Data flow end to end

1. Evil twin AP broadcasts a beacon in the demo room
2. Node A (Aditya's corner) captures it — USB serial → ingestion queue
3. Node B (far corner) captures it — USB serial → node_b_forwarder
   → TCP over hotspot → Aditya's laptop port 9001 → ingestion queue
4. Detection engine scores the device from both nodes' frames
5. Score crosses 70 → Flagged → alert on dashboard
6. Evaluators see alert with full evidence breakdown

---

### Teammate's exact steps on demo day

1. Arrive with laptop charged
2. Connect to hotspot
3. Plug Node B (ESP32) into laptop via USB
4. Open terminal, navigate to backend/scripts/
5. Run: python node_b_forwarder.py --port <serial port> --host <Aditya's IP>
6. Confirm terminal shows "Connected" and "Frames forwarded: X"
7. Stay at Corner 2. If the script crashes, run it again.

Serial port: Windows = COM3/COM4, Linux = /dev/ttyUSB0 or /dev/ttyACM0
Check Device Manager (Windows) or `ls /dev/tty*` (Linux) after plugging in the ESP32.

---

### Aditya's exact steps on demo day

1. Arrive with laptop charged
2. Start hotspot on your phone
3. Connect laptop to hotspot
4. Get IP: `ipconfig` (Windows) or `ip addr` (Linux) — share with Corner 2 teammate
5. Plug Node A (ESP32) into laptop via USB
6. Navigate to backend/
7. Run: python -m scripts.run_pipeline --mode hardware
8. Open dashboard: http://localhost:8000
9. Wait for Corner 2 to confirm connection. Confirm Node B frames appear in console.
10. Signal team to begin demo script only after both nodes confirmed LIVE.

---

### Fallback plan (if hotspot fails mid-demo)

Keep a 10-metre USB extension cable in the bag.
If hotspot dies and cannot recover in 2 minutes:
- Bring both laptops to the centre of the room
- Plug Node B directly into Aditya's laptop via extension cable
- Run both nodes as SerialFrameSource (two USB ports, two serial devices)
- Coverage from the corners is lost but detection continues

Test this fallback at least once before demo day.

---

### Who builds what

| Component | Owner | Stage | Deadline |
|---|---|---|---|
| NetworkFrameSource | Teammate 1 | Stage 3 | September |
| node_b_forwarder.py | Teammate 1 | Stage 3 | September |
| run_pipeline.py hardware mode | Teammate 1 | Stage 3 | September |
| Node B health in GET /health | Teammate 1 | Stage 3 | September |
| Pre-demo connectivity test | TBD | Stage 5 | October rehearsal |
| Demo-day checklist execution | TBD | Stage 5 | Demo day |
| Fallback cable test | TBD | Stage 5 | October rehearsal |

TBD = whoever the team decides operates Corner 2 laptop. Decide before October.

---

## Week-by-week target for midsem

**Week 1–2:**
- Aditya: whitelist store + state machine + first two evidence rules (DONE)
- Teammate 1: stress-test parser, document failures, fix them
- Teammate 2: read Dashboard Design doc, learn React, build stub UI

**Week 3:**
- Aditya: remaining evidence rules + main detection loop (DONE)
- Full pipeline test: mock sniffer → ingestion → detection → console alert
- Teammate 2: enrich mock scenario (RSSI variation, second rogue, jitter)

**Week 4:**
- Clean up console output for midsem presentation
- Write midsem demo script (Teammate 2 leads this)
- One full team rehearsal

**Week 5 (buffer):**
- Fix anything that broke in rehearsal
- Finalize midsem slides and report section
- Every member prepares to explain their own track to evaluators

---

## Post-midsem timeline (rough)

| Month | Target |
|---|---|
| September | Stage 2 (Karma + WPA) + Stage 3 (API + storage + network transport) |
| October | Stage 4 (BLE + AI anomaly + heatmap) + Stage 5 begins |
| Late October | Full system integration test with all stages connected |
| November | Stage 5 (hardening, demo room rehearsal, report finalization) |


---

## What midsem evaluators need to see (August end)

1. You understand what you are building and why
2. Working code — not just slides and diagrams
3. A credible plan to finish by November

Target for midsem: detection engine running on mock data, printing alerts
with full evidence breakdown to the console. Stages 1 is the only requirement
for midsem. Everything else comes after.

---

## Full scope (aligned to submitted synopsis)

All six objectives from the synopsis are covered across the five stages:

| Synopsis Objective | Stage |
|---|---|
| Detect Evil Twin, Rogue AP, Beacon Flood, Probe Flood | Stage 1 |
| Karma attacks + WPA handshake-capture attempts | Stage 2 |
| BLE correlation with Wi-Fi | Stage 4 |
| Explainable confidence scoring | Stage 1 (runs through all stages) |
| SQLite database + secure dashboard | Stage 3 |
| Optional AI anomaly detection + natural language narration | Stage 4 |
| Proximity heatmap | Stage 4 |

---

## Aditya — Detection Engine
### Stage 1 (midsem), then Stage 2 (Karma + WPA), then Stage 4 AI layer


**Stage 1 (before midsem):**

Build the core detection engine from scratch:

- Whitelist store: `{ssid: [bssid, ...]}` in-memory dict. Handle multiple
  BSSIDs per SSID correctly — dual-band routers have two BSSIDs for one SSID,
  flagging them would be a false positive on every home network.

- Per-device state machine: Unknown → Watching → Suspicious → Flagged.
  Score thresholds: Watching at 20, Suspicious at 40, Flagged at 70.

- Five evidence checkers using the exact weights from the submitted synopsis:
  - SSID collision: +30 (same SSID, BSSID not in whitelist)
  - Security downgrade: +25 (WPA2 → Open or weaker)
  - Channel mismatch: +15 (different channel than baseline)
  - RSSI anomaly: +15 (simple threshold for midsem, z-score after calibration)
  - Deauth burst tracker: feeds Stage 2 WPA handshake detection

- Main loop: consume ingestion queue → parse → score → update state → alert

Exit criteria: engine flags the evil twin in ap_world.py, whitelists the
trusted AP, shows which rules fired and what score each contributed.

**Stage 2 (September):**

Add Karma and WPA handshake-capture detection — both are in the submitted
objectives and both reuse frames already being captured:

- Karma: flag a BSSID that answers probes for multiple distinct SSIDs (+30)
  combined with those SSIDs being untrusted (+20)

- WPA handshake: deauth burst (+25) followed by EAPOL frames from reconnecting
  client within a short window (+30). Detect the attempt only — never capture
  or attempt to decrypt anything.

**Stage 4 (October):**

- Replace the simple RSSI threshold with z-score anomaly (+15)
- Add AI alert narration: template or lightweight local model that converts
  the evidence list into one human-readable sentence on the dashboard

---

## Teammate 1 — Ingestion hardening + API + EAPOL mock frames
### Difficulty: easy to moderate

**Before midsem:**

Ingestion and parsing are already written. Your job is to break them and
fix what breaks. Specifically:

- Feed the parser malformed JSON lines — what happens? Does ingestion crash
  or drop gracefully?
- Feed truncated base64 frame data — does the frame parser crash or return
  parse_ok=False cleanly?
- Feed a beacon with a hidden SSID (zero-length SSID IE) — does it parse
  correctly or get dropped?
- Feed frames with vendor IEs that are not in the OUI table — does lookup_vendor
  return None cleanly?
- Write down every failure you find and fix it. This is the most important
  work you can do before midsem because Aditya's detection engine consumes
  your parser's output — broken parser = broken detection.

Also add EAPOL frame support to the mock sniffer (ap_world.py):
- EAPOL frames are the 4-way handshake frames that appear after a deauth burst
- Aditya needs these to test WPA handshake-capture detection in Stage 2
- Frame structure is simple: just needs to be recognized by subtype + timing

**After midsem (Stage 3):**

Build the full FastAPI backend:
- `GET /devices` — current device table
- `GET /alerts` — alert history with full evidence JSON
- `POST /alerts/{id}/resolve` — mark alert resolved
- `GET /whitelist` — trusted AP list
- `POST /whitelist` — add trusted AP
- `GET /health` — node status, queue depth, uptime
- `WebSocket /ws/live` — push new device state changes and alerts in real time

Wire detection engine output into SQLite storage (schema is defined in the
software roadmap Stage 3a).

---

## Teammate 2 — Dashboard
### Difficulty: easy

> IMPORTANT — READ THIS FIRST BEFORE WRITING ANY CODE:
> There is a dedicated dashboard design document at:
> docs/ORBIT_Dashboard_Design.md
>
> It contains every detail you need:
> - Exact visual theme (colours, fonts, card styles)
> - Full layout diagram (which panel goes where, proportions)
> - Every component's exact content and behaviour
> - The 12-step examiner sequence the demo must follow
> - Build order (what to build first)
> - Tech stack (React + Vite + Tailwind, no heavy UI libraries)
>
> Do NOT start building without reading that file.
> Do NOT make layout or colour decisions on your own — they are already decided there.
> If you are using an AI assistant to help build the dashboard, paste the contents
> of ORBIT_Dashboard_Design.md into the prompt so it knows the design. The AI
> will not read it on its own — you must provide it explicitly.

**Before midsem:**

No dashboard needed yet. Use this time productively:

- READ docs/ORBIT_Dashboard_Design.md fully. Understand every panel.
- Coordinate with Teammate 1 to understand what the API will return.
  Ask: what does a GET /alerts response look like? What fields does each
  alert have? Build a fake JSON response that looks like the real thing.
- Learn React basics if not already comfortable — component state, useEffect,
  fetch. Plain HTML/JS with fetch is also acceptable if React feels too heavy.
- Build a stub dashboard that works entirely against hardcoded fake data.
  Follow the layout and colours from ORBIT_Dashboard_Design.md exactly —
  even the stub should look like the real thing visually.
  It should show a device table and an alert feed even if nothing is real yet.
  This lets you build and polish the UI without waiting for the backend.

**After midsem (Stage 3):**

Wire the real API into the dashboard.
Refer to ORBIT_Dashboard_Design.md for the exact behaviour of each component.

- Login page — see Dashboard Design doc: Login page section
- Live device table — see Dashboard Design doc: Left column section
  (row colours, state badges, click to filter timeline)
- Alert feed — see Dashboard Design doc: Centre column section
  CRITICAL: show every rule that fired and its score contribution.
  Do not collapse to just a threat name — "explainable alerts" is in the
  synopsis and evaluators will specifically look for it.
- Threat timeline — see Dashboard Design doc: Bottom strip section
  (horizontal scrollable event dots, tooltip on click)
- Node health panel — see Dashboard Design doc: Right column section
  (frames/sec, queue depth, last frame timestamp per node)
- Resolve and whitelist buttons per alert, wired to the API
- WebSocket client for real-time updates — see Dashboard Design doc:
  WebSocket behaviour section (4 message types, reconnect logic)
- Login / session authentication before demo day — non-negotiable

**Stage 4 (October):**

Add the heatmap widget once the heatmap logic is ready.
Refer to ORBIT_Dashboard_Design.md: Right column — Heatmap panel section.

- Floor plan PNG as canvas background (simple rectangle, team draws it)
- Node A and Node B markers at their physical corner positions
- Semi-transparent zone showing estimated device location, updates live
- The backend KNN logic feeds this — you just render what the API returns
- For midsem: show "Heatmap available in final build" placeholder in that panel

---

## Teammate 3 — Mock data + BLE layer + testing + demo prep
### Difficulty: easy

**Before midsem:**

Own the mock sniffer scenario. The detection engine needs realistic input
to be tuned properly — this directly enables Aditya's work.

Enrich ap_world.py and mock_sniffer.py:
- Add RSSI variation over time to simulate a device physically moving closer
  (start at -75 dBm, move to -45 dBm over 30 seconds)
- Add a second rogue AP that appears later (e.g. at t=60s) to test that
  the engine handles multiple simultaneous suspicious devices
- Vary beacon timing slightly — not every beacon at exactly 100ms intervals,
  add ±10ms jitter to simulate real hardware behaviour
- Try different evil twin timing (t=10s, t=30s, t=60s) to make sure the
  detection engine catches it regardless of when it appears

**After midsem (Stage 4):**

Build the BLE software layer:
- BLE advertisement parser: Python dataclass from raw BLE adv bytes
  (address, RSSI, timestamp, advertised name if present)
- Extend mock_sniffer.py to also emit fake BLE advertisement frames.
  Same JSON line format, add a "type": "ble" field.
  Simulate a BLE device that moves closer at the same time the evil twin
  appears — this is what BLE correlation is supposed to catch.
- Extend ingestion queue and serial_reader.py to route BLE frames separately
  from WiFi frames

Also own Stage 5 (testing and demo prep):
- Run 30-minute passive baseline session. Count false positives. Write down
  the number — evaluators will ask for it.
- Write the full demo script: what gets triggered, in what order, what
  appears on screen. Everyone on the team follows this script on demo day.
- Organize minimum two full team rehearsals before the final presentation.
- Own the demo room logistics: know where you will stand, who runs what,
  what happens if something breaks mid-demo (have a fallback).

---

## Hardware plan

ESP32 boards confirmed to arrive before the final November demo.

Midsem is software-only by design. Mock data is byte-accurate and the pipeline
is identical whether the source is a mock process or a real serial port.

Switching to real hardware: change one line — FrameSource from
ProcessFrameSource to SerialFrameSource. Nothing downstream changes.

Tell evaluators at midsem:
"Hardware arrives before the final submission. Today we demonstrate the
complete detection and alerting logic on simulated sensor data that is
byte-identical to real ESP32 serial output."

---

## Two-laptop demo deployment — full team guide

This section covers exactly how the two-node physical setup works on demo day.
Read this carefully. Every team member needs to know their role.

---

### Why two laptops

The demo room requires Node A at one corner and Node B at the opposite corner
for meaningful spatial coverage — that is the whole point of having two nodes.
A single USB cable cannot realistically span the room. So each node has its
own laptop sitting next to it.

---

### Who owns which laptop

**Aditya's laptop — Corner 1 (main laptop)**
- Node A (ESP32, channel hopper) plugged in via USB
- Runs the full ORBIT backend: ingestion, detection engine, FastAPI API, dashboard
- Listens on TCP port 9001 for Node B frames coming from the teammate's laptop
- The dashboard is opened on this laptop's browser for evaluators to see

**Teammate's laptop — Corner 2 (sensor-only laptop)**
- Node B (ESP32, fixed channel 6) plugged in via USB
- Runs ONE script only: node_b_forwarder.py
- That script reads Node B's serial port and forwards every frame over the
  network to Aditya's laptop
- Nothing else runs on the teammate's laptop during the demo
- Which teammate operates this laptop to be decided by the team

---

### The network: mobile hotspot (not college Wi-Fi)

Use a personal mobile hotspot — either Aditya's phone or a team member's phone.
Do NOT use college Wi-Fi. Reasons:
- College Wi-Fi is shared with hundreds of devices — unstable, unpredictable
- A dropped connection mid-demo would cut off Node B with no warning
- College Wi-Fi sometimes blocks direct device-to-device communication (client isolation)
- A personal hotspot is controlled by the team, only team devices on it,
  and does not need internet access — just LAN routing between two laptops

Before demo day: connect both laptops to the hotspot and note Aditya's laptop IP.
That IP gets hardcoded into Riya's forwarder config. Do this in advance, not on
demo day morning.

---

### Software components to build (Stage 3 — Kuldeep's task alongside API)

**Component 1: NetworkFrameSource (added to backend/orbit/ingestion/frame_source.py)**

Lives on Aditya's laptop. Acts exactly like any other FrameSource — same interface,
same lines() method — except instead of reading a serial port it listens on a
TCP socket and yields lines as they arrive from the network.

Behaviour:
- Binds to 0.0.0.0:9001 on startup
- Waits for one incoming connection (from Riya's forwarder)
- Yields each received newline-terminated JSON string into the ingestion queue
- If connection drops: logs a warning, waits for the next connection, does NOT crash
- No changes needed to detection engine, state machine, or scoring — they see
  the same IngestedFrame objects regardless of whether it came from USB or network

**Component 2: node_b_forwarder.py (new script, lives in backend/scripts/)**

Lives on Riya's laptop. One small script, about 40 lines of Python.

Behaviour:
- Opens Node B's serial port (e.g. /dev/ttyUSB0 on Linux, COM3 on Windows)
- Connects via TCP to Aditya's laptop IP on port 9001
- Reads each JSON line from serial, sends it over the socket immediately
- If TCP connection drops: waits 3 seconds, reconnects, continues
- If serial port disconnects: logs error, waits for reconnect, does NOT crash
- Prints a status line every 10 seconds: frames forwarded, connection status

Usage on Riya's laptop:
  python node_b_forwarder.py --port COM3 --host 192.168.x.x

(Replace COM3 with the actual serial port. Replace IP with Aditya's hotspot IP.)

**Component 3: run_pipeline.py — hardware mode**

Aditya's laptop in hardware mode uses:
  Node A: SerialFrameSource (local USB, e.g. /dev/ttyUSB0)
  Node B: NetworkFrameSource (listens on port 9001)

The mock mode (ProcessFrameSource) stays untouched for midsem.
Hardware mode is a separate entry point or flag — do not break mock mode.

---

### Data flow end to end

1. Evil twin AP broadcasts a beacon in the demo room
2. Node A (Aditya's corner) captures it — USB serial → Aditya's laptop ingestion queue
3. Node B (Riya's corner) also captures it — USB serial → Riya's forwarder
   → TCP over hotspot → Aditya's laptop port 9001 → ingestion queue
4. Detection engine sees frames from both nodes, scores the device
5. Score crosses 70 → Flagged → alert appears on dashboard
6. Evaluators see the alert with full evidence breakdown on the screen

---

### Teammate's exact steps on demo day

1. Arrive at the demo room with laptop charged
2. Connect to the hotspot
3. Plug Node B (ESP32) into laptop via USB
4. Open terminal, navigate to backend/scripts/
5. Run: python node_b_forwarder.py --port <serial port> --host <Aditya's IP>
6. Confirm the terminal shows "Connected to Aditya's laptop" and "Frames forwarded: X"
7. That is it. Stay at Corner 2 during the demo. If the script crashes, run it again.

The serial port on Windows will be something like COM3, COM4.
On Linux it will be /dev/ttyUSB0 or /dev/ttyACM0.
Check Device Manager (Windows) or `ls /dev/tty*` (Linux) after plugging in the ESP32.

---

### Aditya's exact steps on demo day

1. Arrive at the demo room with laptop charged
2. Start the hotspot on your phone
3. Connect your laptop to the hotspot
4. Note your laptop's IP address: run `ipconfig` (Windows) or `ip addr` (Linux)
5. Share that IP with Riya so she can put it in the forwarder command
6. Plug Node A (ESP32) into your laptop via USB
7. Navigate to backend/
8. Run: python -m scripts.run_pipeline --mode hardware
   (this starts SerialFrameSource for Node A and NetworkFrameSource waiting for Node B)
9. Open the dashboard in browser: http://localhost:8000
10. Wait for Riya's terminal to confirm connection, then confirm Node B frames appear
    in your console before starting the demo sequence
11. Signal the team to begin the demo script only after both nodes confirmed active

---

### Fallback plan (if hotspot fails mid-demo)

Keep a 10-metre USB extension cable in the bag.
If the hotspot dies and cannot be restarted in 2 minutes:
- Bring both laptops to the centre of the room
- Plug Node B directly into Aditya's laptop via the extension cable
- Switch Aditya's pipeline to use SerialFrameSource for both nodes
  (two USB ports, two serial devices)
- Demo continues. Coverage from the corners is lost but detection still works.

This fallback must be tested at least once before demo day.

---

### Pre-demo checklist (both laptops, day before)

- [ ] Both laptops connect to hotspot successfully
- [ ] Aditya's laptop IP on hotspot is noted and stable
- [ ] node_b_forwarder.py runs on Riya's laptop and connects to Aditya's laptop
- [ ] Frames from Node B appear in Aditya's ingestion console
- [ ] Dashboard shows Node B as connected in the health panel
- [ ] Fallback USB cable tested — Node B works plugged directly into Aditya's laptop
- [ ] Both ESP32 boards flashed with correct firmware (Node A = channel hopper,
      Node B = fixed channel 6)
- [ ] Serial ports identified on both laptops and written down
- [ ] Demo script rehearsed with real hardware at least once

---

### Who builds what (responsibility assignment)

| Component | Owner | Stage | Deadline |
|---|---|---|---|
| NetworkFrameSource (frame_source.py) | Kuldeep | Stage 3 | September |
| node_b_forwarder.py | Kuldeep | Stage 3 | September |
| run_pipeline.py hardware mode flag | Kuldeep | Stage 3 | September |
| Node B health status in GET /health | Kuldeep | Stage 3 | September |
| Pre-demo connectivity test | TBD teammate | Stage 5 | October rehearsal |
| Demo-day checklist execution | TBD teammate | Stage 5 | Demo day |
| Fallback cable test | TBD teammate | Stage 5 | October rehearsal |

Note: "TBD teammate" = whoever the team decides operates the second laptop at Corner 2.
Decide and fill this in before October.

---

## Week-by-week target for midsem

**Week 1–2:**
- Aditya: build whitelist store + state machine + first two evidence rules
- Teammate 1: stress-test parser, document failures, fix them
- Teammate 2: learn React/fetch basics, build stub dashboard UI
- Teammate 3: enrich mock scenario (RSSI variation, second rogue AP, jitter)

**Week 3:**
- Aditya: add remaining evidence rules, wire main detection loop
- Full pipeline test: mock sniffer → ingestion → detection → console alert
- Fix whatever breaks. Tune thresholds. The evil twin must trigger reliably.

**Week 4:**
- Clean up console output for midsem presentation
- Write the midsem demo script (Teammate 3 leads this)
- One full team rehearsal

**Week 5 (buffer):**
- Fix anything that broke in rehearsal
- Finalize midsem slides and report section
- Every member prepares to explain their own track to evaluators

---

## Post-midsem timeline (rough)

| Month | Target |
|---|---|
| September | Stage 2 (Karma + WPA detection) + Stage 3 (API + storage) |
| October | Stage 4 (BLE + AI + heatmap) + Stage 5 begins |
| Late October | Full system integration test with all stages connected |
| November | Stage 5 (hardening, demo room rehearsal, report finalization) |
