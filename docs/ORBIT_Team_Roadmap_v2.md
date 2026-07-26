# ORBIT — Team Roadmap (EDI Aligned)

**Last updated:** July 2026
**Team:** Aditya Pawar, Kuldeep Pawar, Reya Sharma, Riya Devi — Group SY-I16
**Guide:** Dr. Manisha More
**Deadline:** November 2026 (final) | August end (midsem review)
**Hardware:** ESP32 boards confirmed before final demo.

This roadmap covers every objective stated in the submitted EDI synopsis.
Member tracks are labeled Teammate 1, 2, 3 — the three teammates decide
among themselves who takes which track based on comfort and interest.
Tracks are ordered: Track 1 is easiest, Track 2 is moderate, Track 3 is hardest
among the three. Aditya's track is separate — it is the most critical piece.

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

**Before midsem:**

No dashboard needed yet. Use this time productively:

- Coordinate with Teammate 1 to understand what the API will return.
  Ask: what does a GET /alerts response look like? What fields does each
  alert have? Build a fake JSON response that looks like the real thing.
- Learn React basics if not already comfortable — component state, useEffect,
  fetch. Plain HTML/JS with fetch is also acceptable if React feels too heavy.
- Build a stub dashboard that works entirely against hardcoded fake data.
  It should show a device table and an alert feed even if nothing is real yet.
  This lets you build and polish the UI without waiting for the backend.

**After midsem (Stage 3):**

Wire the real API into the dashboard:

- Live device table: trust state, confidence score, last seen, vendor name
- Alert feed: confidence score + full evidence breakdown per alert.
  Show each rule that fired and its score contribution. Do not collapse to
  just a threat name — "explainable alerts" is literally in the synopsis
  objectives and evaluators will look for it.
- Threat timeline: chronological list of evidence events per device
- Resolve and whitelist action buttons per alert, wired to the API
- Node health panel: both nodes connected, queue depth, uptime
- Login / session authentication before demo day — non-negotiable

**Stage 4 (October):**

Add the heatmap widget once the heatmap logic is ready:
- Floor plan image as canvas background
- Node A and Node B markers at their physical positions
- Highlighted zone showing estimated proximity of suspicious device
- The backend KNN logic feeds this — you just render what the API returns

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
