# ORBIT — Software Build Roadmap (EDI Aligned)

**Last updated:** July 2026
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

### 4c — AI alert narration (optional, build last)
- Converts evidence list into a one-sentence human-readable summary
- Example: "This AP uses your trusted SSID but an unapproved BSSID on a
  different channel — consistent with an Evil Twin attack."
- Use a locally hostable model or template-based generation
- Build only after the evidence text already reads clearly on its own
- This is cosmetic, not functional — it does not change any score

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

## Technology stack (locked)

- Firmware: PlatformIO + Arduino-ESP32 (already compiled)
- Backend: Python 3, pyserial, FastAPI, SQLite (stdlib sqlite3)
- Dashboard: React or plain HTML/JS with fetch + WebSocket
- AI layer: pure Python math for z-score; lightweight local model for narration
- No paid APIs, no cloud dependencies required for core detection
