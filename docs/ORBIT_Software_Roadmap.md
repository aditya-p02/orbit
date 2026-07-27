# ORBIT — Software Build Roadmap (EDI Aligned)

**Last updated:** July 27, 2026
**Team:** Aditya, Kuldeep, Reya, Riya — Group SY-I16
**Guide:** Dr. Manisha More
**Deadline:** November 2026 (final) | August end (midsem review)
**Hardware:** ESP32 boards confirmed before final demo. Midsem is software-only by design.

This roadmap is aligned with the submitted EDI synopsis (FF No. 180).
Every objective stated in the synopsis is covered here. Nothing is cut that
was committed to in the submission.

See ORBIT_Team_Roadmap_v2.md for member assignments and week-by-week targets.

---

## Scoring model (from submitted synopsis — fixed, do not change)

| Evidence Signal | Points | Category |
|---|---|---|
| SSID matches trusted, BSSID NOT in whitelist | +30 | Rule-based |
| Security type downgraded vs baseline (e.g. WPA2 → Open) | +25 | Rule-based |
| Channel differs from baseline for that BSSID | +15 | Rule-based |
| RSSI / beacon-interval anomaly vs historical pattern | +15 | Rule-based |
| BLE device correlates in time/space with Wi-Fi signal | +15 | Contextual |
| Anomaly model flags the observation (AI layer) | +10 | AI-assisted |

Alert thresholds:
- 0–39: Unknown — monitor only, no alert
- 40–69: Low confidence suspicious — soft flag on dashboard only
- 70–100: High confidence suspicious — alert raised

These numbers are from the submitted design document. They are locked.

---

## Stage 1 — Detection Engine (target: midsem, August end)
Critical path. Everything else depends on this.

Current status: DONE. The mock pipeline flags the evil twin and prints the
full evidence breakdown to the console. Do not start Stage 2 until Stage 1
docs and basic verification are settled.

### 1a — Whitelist store
- In-memory dict: `{ssid: [bssid, ...]}` of trusted SSID+BSSID pairs
- A trusted SSID can have multiple BSSIDs (enterprise roaming — handle this
  correctly or the system false-positives on every dual-band router)
- Hardcode test AP entries for midsem — no UI needed yet
- Functions: `is_trusted_ssid(ssid)`, `is_trusted_bssid(ssid, bssid)`

### 1b — Per-device state machine
States: `Unknown → Watching → Suspicious → Flagged`

Transitions:
- Watching: score >= 20
- Suspicious: score >= 40
- Flagged: score >= 70 (alert raised)

No score decay for midsem — device stays at highest state reached.
Add decay after midsem.

### 1c — Five evidence checkers (matches synopsis scoring table)

**Rule 1 — SSID collision (+30)**
Beacon/probe-response SSID matches a trusted SSID but BSSID is not in
the whitelist for that SSID. Primary evil twin signal.

**Rule 2 — Security downgrade (+25)**
Trusted AP had WPA2/WPA3 RSN IE. This device has no RSN IE (open) or
weaker AKM. Stark downgrade is a strong evil twin indicator.

**Rule 3 — Channel mismatch (+15)**
Trusted AP is known to operate on channel X. This device uses same SSID
but advertises a different channel. Suspicious.

**Rule 4 — RSSI anomaly (+15)**
Device's RSSI deviates significantly from the known baseline range for
that BSSID. Implemented as z-score after calibration data exists.
For midsem: flag if RSSI is > 20 dBm stronger than baseline (simple threshold).

**Rule 5 — Deauth burst (feeds WPA handshake detection)**
3+ deauth frames targeting same client within 5 seconds. This is both a
standalone signal and a prerequisite for the WPA handshake-capture module.

### 1d — Main detection loop
- Consume IngestedFrame from ingestion queue (already built)
- Parse each frame (parser already built)
- Run evidence checkers, accumulate score per device
- Update device state
- When device hits Flagged: print alert with full evidence breakdown to console
  (which rules fired, what score each contributed, SSID/BSSID, timestamp)

### Exit criteria for Stage 1
- Mock sniffer running (already works)
- Engine correctly whitelists HomeNet-5G (trusted AP in ap_world.py)
- Engine correctly flags the evil twin when it goes live at t=20s
- Console shows evidence breakdown — not just "ALERT", show every rule that fired

---

## Stage 2 — Karma + WPA Handshake Detection (September, before dashboard)

These are in the submitted objectives. Build them before the dashboard.
They reuse frames already being captured — no new sensing required.

### 2a — Karma / Probe-response attack detection
A Karma-style rogue AP answers probe requests for whatever SSID a device
asks for, rather than only its own SSID.

Evidence signals:
- Single BSSID responds to probe requests for multiple distinct SSIDs
  within a short observation window: +30 points
- The SSID being answered is not in the trusted SSID list: +20 points

These combine with existing rules in Stage 1 under the same 70-point threshold.

### 2b — WPA handshake-capture-attempt detection
Deauth burst followed by EAPOL frames from a reconnecting client = attacker
trying to capture the WPA 4-way handshake for offline cracking.
ORBIT detects the attempt — it does not capture or crack anything itself.

Evidence signals:
- Deauth burst against a client on a monitored BSSID: +25 points
- EAPOL handshake frames from reconnecting client within short window: +30 points

Note: EAPOL frames are unencrypted management-layer traffic — ESP32 in
promiscuous mode can observe them passively. The mock sniffer needs a
EAPOL frame builder added to simulate this (Teammate 1 task).

---

## Stage 3 — Storage + API + Dashboard (September–October)

### 3a — SQLite storage
Tables:
- `devices` — mac, ssid, state, score, first_seen, last_seen
- `alerts` — id, device_mac, ssid, bssid, score, evidence_json, timestamp, resolved
- `whitelist` — ssid, bssid, added_at
- `ble_observations` — address, rssi, timestamp, correlated_wifi_bssid
- `observations` — raw frame log for the threat timeline feature

### 3b — FastAPI endpoints
- `GET /devices` — live device table
- `GET /alerts` — alert history with evidence JSON
- `POST /alerts/{id}/resolve` — mark resolved
- `GET /whitelist` — trusted AP list
- `POST /whitelist` — add trusted AP
- `GET /health` — node status, queue depth, uptime
- `WebSocket /ws/live` — push new alerts and device state changes in real time

### 3c — Dashboard (React preferred, plain HTML/JS acceptable)
- Live device table: state, confidence score, last seen, vendor
- Alert feed: confidence score + full evidence breakdown per alert
  (explainable alerts — this is in the synopsis, do not collapse to a threat name)
- Threat timeline: chronological view of evidence events per device
- Resolve / whitelist actions per alert
- Node health indicator (both nodes connected, queue depth)
- Login / session auth — non-negotiable before demo day

---

## Stage 4 — BLE Correlation + AI layer + Heatmap (October)

### 4a — BLE software layer
- BLE advertisement parser: Python object from raw BLE adv bytes
  (address, RSSI, timestamp, advertised name if present)
- Extend mock sniffer to emit fake BLE frames (same JSON format, "type": "ble")
- Extend ingestion queue to handle BLE frame type alongside WiFi
- Correlation logic: BLE RSSI trend moving with suspicious WiFi RSSI over time
  (session-scoped — BLE MACs are randomized, no persistent identity tracking)
- Feed correlation as +15 evidence points into scoring engine

Hardware part (when ESP32 arrives):
- BLE scanning added to firmware, scheduled during WiFi dwell gaps
- Serial frame format extended to include BLE advertisements
- One-line config swap: real BLE frames replace mock BLE frames

### 4b — Z-score anomaly (AI component, replaces Rule 4 simple threshold)
- Calibration session: record RSSI and beacon interval per known AP
- Live detection: flag deviations > 2 standard deviations as +15 evidence points
  (replaces the simple RSSI threshold from Stage 1 Rule 4 — same slot, better logic)
- Wire as a proper evidence row, same format as all other rules

### 4c — AI alert narration (Ollama, locally hosted)

A locally running language model converts the evidence list into one
human-readable sentence per alert. Runs entirely on-device — no cloud,
no internet, no API key. Model: phi3:mini (Microsoft, 2.7B parameters,
fast on CPU, factual on structured inputs).

Implementation strategy — cached narration (safe for demo day):
- During development: run Ollama once per distinct evidence combination,
  store the generated sentence in the database alongside the alert
- On demo day: narration is already cached, appears on dashboard instantly
  with zero lag and zero hallucination risk
- In the viva: explain the full Ollama architecture honestly — the examiner
  cares about the design, not whether inference ran live

Optional live mode (build after caching works):
- Wire Ollama API call directly into the alert pipeline
- Only enable if phi3:mini responds in under 2 seconds on the demo laptop
- If slower: fall back to cached mode silently, no visible difference

Prompt structure (feed to phi3:mini):
  "A Wi-Fi device was detected with the following evidence:
   - SSID collision: the device broadcasts a trusted SSID but has an
     unknown BSSID (+30 points)
   - Security downgrade: WPA2 downgraded to Open (+25 points)
   - Channel mismatch: expected channel 6, device on channel 11 (+15 points)
   Confidence score: 70/100. In one sentence, explain what this likely means
   to a network administrator."

Expected output:
  "This device is broadcasting a trusted network name with no security on
   the wrong channel — strong indicators of an Evil Twin attack."

This narration:
- Does NOT affect any score
- Does NOT change detection logic
- Is purely for dashboard explainability — which is a stated synopsis objective
- Is defensible in the viva as a genuine local LLM integration

Pitch to examiner:
  "Alert explanations are generated by phi3:mini, a locally hosted language
   model running via Ollama. The system is fully air-gapped — no cloud
   dependency at any layer."

### 4d — Proximity heatmap (hardware-dependent, software first)
Software part (build now):
- KNN fingerprint matcher: given RSSI from Node A and Node B, find closest
  calibration grid point
- Exponential moving average smoothing to prevent jitter
- Dashboard heatmap widget: floor plan + node markers + highlighted zone

Hardware part (when ESP32 arrives):
- Calibration walk: record RSSI from both nodes at known reference points
  in the actual demo room
- Store fingerprints in `calibration_grid` table
- Re-calibrate in the actual demo room before final demo — not a different room

### 4e — Alert deduplication + cooldown
- Once Flagged, suppress duplicate alerts for same device for 60 seconds
- New distinct evidence pattern resets the cooldown
- Prevents dashboard flooding during a sustained beacon flood

### 4f — Serial reconnection handling
- If reader thread drops (USB disconnect), retry after 3 seconds
- Do not crash the pipeline on a dropped connection

---

## Stage 5 — Final hardening + demo prep (Late October – November)

- Run 30-minute passive baseline in actual demo room. Count false positives.
  This gives a real number to defend in the viva — "our false positive rate
  at 70-point threshold was X over 30 minutes of passive monitoring."
- Write the demo script: what you trigger, in what order, what appears on screen
- Two full team rehearsals minimum before the final presentation
- Calibrate in the actual demo room, not a different room
- Prepare own isolated test SSID — never run the evil twin demo against the
  venue's real network
- Trim the report to match what actually got built

---

## Hardware strategy

ESP32 boards confirmed before final November demo.

Midsem is software-only by design — not a workaround. The mock sniffer
produces byte-accurate 802.11 frames. The pipeline cannot tell the difference.

Switching to real hardware: change FrameSource from ProcessFrameSource to
SerialFrameSource. One line. No rewrite downstream.

Statement for midsem slides:
"Hardware integration is planned for the final submission. The complete software
pipeline is validated against byte-accurate simulated ESP32 sensor data.
Switching to real hardware requires a single configuration change."

---

## Two-laptop demo deployment (final demo, Stage 5)

### Physical setup
- Node A (ESP32, channel hopper) — plugged via USB into Laptop A at Corner 1
- Node B (ESP32, fixed channel) — plugged via USB into Laptop B at Corner 2
- Both laptops connected to a trusted mobile hotspot (team-controlled, not college Wi-Fi)
- Laptop A runs the full backend: ingestion queue, detection engine, FastAPI, dashboard
- Laptop B runs only a lightweight frame forwarder process

### Why mobile hotspot and not college Wi-Fi
- College Wi-Fi is shared and unstable — a dropped connection mid-demo kills Node B's feed
- Hotspot is team-controlled: only team devices connect, guaranteed bandwidth, no interference
- Hotspot does not need internet access — just LAN routing between the two laptops

### Software: NetworkFrameSource (to be built in Stage 3 alongside the API)

The existing FrameSource interface already supports this cleanly. One new class
is all that is needed — nothing downstream changes.

**On Laptop B — frame forwarder (node_b_forwarder.py):**
- Reads from Node B's serial port (SerialFrameSource)
- Opens a TCP connection to Laptop A on a fixed port (e.g. 9001)
- Sends each JSON line over the socket as-is
- Reconnects automatically if the connection drops (3-second retry loop)

**On Laptop A — NetworkFrameSource (added to frame_source.py):**
- Listens on TCP port 9001
- Accepts one connection (from Laptop B forwarder)
- Yields each received line into the shared IngestionQueue
- If connection drops: logs warning, waits for reconnect, does not crash pipeline

**In run_pipeline.py (hardware mode):**

```python
sources = [
    SerialFrameSource(node_id="A", port="/dev/ttyUSB0"),   # Node A, local USB
    NetworkFrameSource(node_id="B", host="0.0.0.0", port=9001),  # Node B, over hotspot
]
```

Everything else — ingestion queue, detection engine, state machine, scoring — is identical.
The engine cannot tell whether a frame arrived via USB or network. Same IngestedFrame object.

### Reliability notes
- TCP guarantees delivery and order within a session — no frame corruption in transit
- If Laptop B forwarder crashes: Node B feed pauses, Node A continues unaffected
- Dashboard health panel (Stage 3) should show per-node connection status so the
  team can see in real time if Node B drops — this is already planned in GET /health
- Before demo: static IP or hostname assignment on the hotspot for Laptop A so
  Laptop B always knows where to connect (set this up in advance, not on demo day)

### Demo-day checklist addition (Stage 5)
- Verify hotspot is running and both laptops are connected before powering the nodes
- Confirm Laptop A's IP is fixed / known to Laptop B forwarder config
- Run a 2-minute connectivity test: check Node B frames appear in Laptop A's console
- Have the USB cable fallback ready (10m USB extension) in case hotspot fails

---

## Technology stack (locked)

- Firmware: PlatformIO + Arduino-ESP32 (already compiled)
- Backend: Python 3, pyserial, FastAPI, SQLite (stdlib sqlite3)
- AI anomaly layer: pure Python statistics (z-score, no external ML library needed)
- AI narration layer: Ollama (local) + phi3:mini model — fully air-gapped, no cloud
- Dashboard: React + Vite + Tailwind CSS
- No paid APIs, no cloud dependencies required for core detection or AI features
