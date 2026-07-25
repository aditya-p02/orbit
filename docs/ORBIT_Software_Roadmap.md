# ORBIT — Software Build Roadmap

A phase-by-phase build plan. **Phases 0–5 are your MVP critical path** — nothing after Phase 5 works without them, so prioritize in order. Phases 6–9 (BLE, heatmap, AI layer, Karma/handshake modules) can be split across team members and built in parallel once Phase 5 is stable, since they all plug into the same core engine rather than depending on each other.

---

## Phase 0 — Project Setup

- [ ] Create the repo with this folder structure: `firmware/`, `ingestion/`, `parsing/`, `detection/`, `storage/`, `api/`, `dashboard/`, `tests/`
- [ ] Set up a Python virtual environment on the laptop (`venv` or `conda`); pin dependency versions in `requirements.txt` from day one
- [ ] Install ESP-IDF or Arduino-ESP32 toolchain (pick one — don't mix) and confirm both ESP32-WROOM-32U boards flash a basic blink sketch
- [ ] Agree on the serial frame format now (JSON-lines is simplest to debug; CBOR is smaller if you hit throughput issues later) — write it down in a shared doc so firmware and ingestion code don't drift apart
- [ ] Set up a shared git branch strategy (e.g. one branch per phase/module, merge to `main` after each phase's steps are checked off)

---

## Phase 1 — Sensor Firmware (Wi-Fi only, no BLE yet)

- [ ] Enable promiscuous mode on ESP32, register a callback for management-frame subtypes (beacon, probe req/resp, deauth, disassoc, auth)
- [ ] Extract only the cheap fields on-device: addresses (RA/TA/BSSID), RSSI, channel, sequence number, frame subtype, timestamp — leave full IE parsing for the laptop (§ design doc — keeps ESP32 CPU/RAM budget safe)
- [ ] Implement the channel-hop schedule: assign **Node A to hop across all channels**, **Node B parked on a fixed "home" channel** (the one your demo network will use) — this directly addresses the channel-blind-spot limitation with a stated mitigation instead of leaving it open
- [ ] Frame each captured event as a JSON line, write to serial
- [ ] Test: point a phone's hotspot near each node, confirm you see beacon/probe frames appear on serial monitor with sane values
- [ ] **Exit criteria for this phase:** both nodes independently stream valid JSON frames over USB serial for at least 10 minutes without crashing or hanging

---

## Phase 2 — Laptop Ingestion & Parsing

- [ ] Write a serial reader (`pyserial`) per node — two threads/processes, one per COM port, both writing into a shared ingestion queue
- [ ] Deserialize and validate incoming JSON lines; drop and log malformed frames instead of crashing
- [ ] **Timestamp every observation at the moment of laptop receipt**, not from the ESP32's onboard clock (already specified in your design doc §17 — implement it here, don't skip it)
- [ ] Full 802.11 IE decode on the laptop side: SSID, RSN IE (cipher suite, AKM suite, PMF bits), vendor-specific IEs (WPS), DS Parameter Set (channel), capability info
- [ ] OUI/vendor lookup from BSSID (a static lookup table is fine — no need for a live API)
- [ ] **Exit criteria:** raw serial frames become clean, structured Python objects with every field from your evidence table (§10) populated

---

## Phase 3 — Core Detection Engine (MVP)

- [ ] Build the trusted-SSID / multi-BSSID whitelist store (in-memory dict is fine to start, backed by SQLite once Phase 4 lands)
- [ ] Implement the per-device state machine: `Unknown → Watching → Suspicious → Confirmed → Trusted/Blocked`, with explicit transition rules and a time-based decay back down if evidence doesn't repeat
- [ ] Implement the weighted evidence scoring from your design doc §10 — **add the sequence-number continuity check as its own evidence row** (track expected-next-sequence-number per BSSID; flag discontinuity) since it's one of the cheapest, strongest signals and wasn't in the original table
- [ ] **Score each attack hypothesis separately** (Evil Twin score, Rogue AP score) rather than one blended per-device number — keeps alert-type attribution honest once Phase 6 adds Karma/handshake-capture as additional hypotheses
- [ ] Implement calibration mode: a script that runs passively for a set window, records every SSID/BSSID/channel/RSSI-range seen, and lets you approve entries into the whitelist
- [ ] Implement alert deduplication and cooldown (§12) so a sustained flood doesn't spam duplicate alerts
- [ ] **Exit criteria:** running the engine against live captured data correctly whitelists your real test network and correctly flags a manually-triggered evil twin, with a visible evidence breakdown in the console/logs

---

## Phase 4 — Storage & API

- [ ] Create the SQLite schema (devices, ssid_whitelist, observations, alerts, calibration_grid, node_health — as specified in the design doc §19)
- [ ] Wire the detection engine's outputs (device state, alerts, evidence) into the database instead of only in-memory
- [ ] Stand up FastAPI with: `GET /devices`, `GET /alerts`, `POST /alerts/{id}/resolve`, `GET /whitelist`, `POST /whitelist`, `GET /health`
- [ ] Add a WebSocket endpoint (`/ws/live`) that pushes new observations/alerts as they happen
- [ ] **Exit criteria:** you can query current devices and alert history over HTTP, and a simple WebSocket test client receives live events as they're detected

---

## Phase 5 — Dashboard (MVP) + Auth

- [ ] Build the live device table (trust state, reputation, last seen) consuming the WebSocket feed
- [ ] Build the alert feed showing confidence score and the full evidence breakdown per alert (this is your "explainable alerts" feature — don't collapse it to just a threat name)
- [ ] Add resolve/acknowledge/whitelist actions on each alert, wired to the API from Phase 4
- [ ] Add login/session authentication in front of the whole dashboard (§22) — do this before demo day, not after
- [ ] **Exit criteria:** you can run both nodes, trigger a manual evil twin, and watch the alert appear live on an authenticated dashboard with correct evidence

---

## At this point you have a working MVP end to end. Phases 6–9 below can be split across teammates in parallel.

## Phase 6 — Karma & WPA Handshake-Capture-Attempt Detection

- [ ] Karma detection: track probe-response behavior per BSSID; flag a single BSSID answering probes for multiple distinct, untrusted SSIDs in a short window
- [ ] Handshake-capture detection: flag a deauth burst against a client, then check for EAPOL frames from a reconnecting client shortly after on the same BSSID
- [ ] Wire both as additional weighted hypotheses in the scoring engine from Phase 3 (own evidence rows, own hypothesis score — don't pool into the Evil Twin score)
- [ ] Test each against a deliberately triggered instance on your own test hardware only

## Phase 7 — BLE Integration & Correlation

- [ ] Add BLE scanning to the firmware, scheduled during each node's "home channel" dwell window (not continuous — respects the shared-radio constraint in §14)
- [ ] Extend the serial frame format and laptop parsing to include BLE advertisements (address, RSSI, timestamp)
- [ ] Implement session-scoped correlation: does a BLE RSSI trend move together with a suspicious Wi-Fi RSSI trend over several seconds — not single-snapshot proximity
- [ ] Feed correlation result in as a bounded, capped evidence weight (already scoped in your design doc §10 as +15, contextual only)

## Phase 8 — Localization Heatmap

- [ ] Build the calibration-walk tool: record RSSI-from-Node-A and RSSI-from-Node-B (and BLE RSSI if Phase 7 is done) at a grid of known points in the demo room
- [ ] Store the fingerprint grid in `calibration_grid`
- [ ] Implement KNN matching: for a new suspicious reading, find the closest-matching grid point
- [ ] Add a smoothing filter (a basic exponential moving average is enough; a Kalman filter is a nice upgrade if time allows) so the heatmap doesn't jitter between readings
- [ ] Build the heatmap widget on the dashboard (floor plan + node markers + highlighted best-match cell)

## Phase 9 — AI-Assisted Layer (optional, build last)

- [ ] Anomaly model: train a lightweight z-score or Isolation Forest model on baseline RSSI/beacon-interval patterns from your calibration session
- [ ] Feed its output in as the capped +10 evidence weight, same evidence-list format as everything else
- [ ] Alert narration: a small template or lightweight local model that turns the evidence list into a one-sentence human-readable summary — build this only after the rule-based evidence text already reads clearly on its own, since narration is cosmetic, not functional

---

## Phase 10 — Validation & Hardening

- [ ] Run a passive baseline session (no attacks) for a few hours in the real deployment room; log the false-positive count at the 70-point threshold — this gives you an actual number to defend in a viva instead of an unverified claim
- [ ] Add reconnection handling for a dropped USB serial link (retry loop, don't crash the whole ingestion service)
- [ ] Add basic input validation/sanitization on the API layer before demo day
- [ ] Review every alert type's evidence table together as a team — make sure nothing double-counts across hypotheses

---

## Phase 11 — Demo Prep

- [ ] Calibrate in the actual demo room, not a different room
- [ ] Prepare your own isolated test SSID and a second device to run the evil twin / Karma / deauth demo — never against the venue's real network
- [ ] Write a short demo script: what you trigger, in what order, what should appear on screen at each step
- [ ] Rehearse the full sequence at least twice before presenting
- [ ] Finalize the written report/synopsis to match whatever the software actually does — trim any claim that didn't make it into the build

---

**Suggested parallelization once Phase 5 is done:** one person on Phase 6 (detection modules), one on Phase 7–8 (BLE + heatmap), one on Phase 9 (AI layer) or dashboard polish, one on Phase 10–11 (testing + demo prep + report). Adjust based on who's stronger in embedded vs. backend vs. frontend.
