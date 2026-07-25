# ORBIT — Team Roadmap (3-person split)

Same phases as the original roadmap, now assigned to owners. 4th member's work
folds back in wherever noted once they're free — nothing here is blocked
waiting on them.

No hardware in hand right now, so Phase 1 (firmware) is **paused, not
blocking** — Phase 2 onward is already unblocked using a mock sensor node
that emits real, byte-accurate 802.11 frames in the exact JSON format the
firmware will eventually send. Swapping the mock for real ESP32s later is a
one-line config change, not a rewrite.

---

## Track 1 — You (Aditya): Detection Engine
**Phase 3 — Core Detection Engine, then Phase 6 (Karma/handshake), then Phase 9 (AI layer)**


- **State machine + decay logic**: `Unknown → Watching → Suspicious → Confirmed → Trusted/Blocked` isn't just a diagram — you have to pick real numbers for how much evidence, over what time window, moves a device between states, and how fast unconfirmed suspicion decays back down. Get this wrong and you either miss real attacks or the dashboard cries wolf constantly.
- **Weighted evidence scoring, tuned against real behavior**: the design doc gives you a starting evidence table, but the actual weights only get validated by throwing real (or mock) attack traffic at it and watching what breaks. Expect to run it, see a false positive, adjust a weight, re-run, repeat — many times.
- **Per-hypothesis scoring without double-counting**: Evil Twin and Rogue AP need independent scores now, and Karma / handshake-capture (Phase 6) bolt on as *additional* hypotheses later without polluting the earlier two. If the architecture isn't clean here, Phase 6 becomes a rewrite instead of an extension.
- **Sequence-number continuity as its own evidence row**: cheap to compute, easy to get subtly wrong (retransmissions, a node restarting mid-capture, multiple nodes hearing the same BSSID at different times all reset "expected next sequence number" differently).

Exit criteria you're aiming for: engine correctly whitelists your real test network AND correctly flags a manually-triggered evil twin, with a visible evidence breakdown.

I already have mock capture data flowing (see Track 2 below) — you can start building and testing against it immediately, no hardware or teammates needed to unblock you.

---

## Track 2 — Teammate 2: Firmware + Ingestion/Parsing
**Phase 0 (setup, mostly done) → Phase 1 (firmware — paused, resumes once hardware's in hand) → Phase 2 (ingestion & parsing) → later Phase 7 (BLE)**

- Phase 2 is already scaffolded: ingestion queue with per-node reader threads, laptop-side timestamping, a `FrameSource` abstraction that treats a mock generator and a real serial port identically, and a full 802.11 IE parser (SSID, RSN cipher/AKM/PMF bits, DS Parameter channel, WPS vendor IE, OUI vendor lookup).
- Their real job right now: stress-test that parser against messier frames than my mock generator produces cleanly — truncated captures, malformed JSON, hidden-SSID beacons, unusual vendor IEs — and harden it. This is the stuff that'll actually show up once real hardware starts sending real air traffic.
- When hardware arrives: Phase 1 checklist unchanged from the original doc (promiscuous mode, channel-hop schedule, JSON-line serial output, the 10-minute stability exit criteria).

---

## Track 3 — Teammate 3: Storage, API, Dashboard
**Phase 4 (storage & API) → Phase 5 (dashboard + auth) → later Phase 8 (heatmap), Phase 10–11 (validation + demo prep)**

- Phase 4: SQLite schema, FastAPI REST endpoints, the `/ws/live` WebSocket feed.
- Phase 5: live device table, alert feed with full evidence breakdown (not just a threat name — that's the whole "explainable alerts" pitch), resolve/whitelist actions, login/session auth before demo day.
- Can start now against a **stubbed API** (fake devices/alerts) without waiting on Track 1's detection engine to be finished — swap the stub for the real engine output once Phase 3 lands. Don't block on Track 1; build the seams now, wire them together later.

---

## Once the 4th member is back
Slot them into whichever track is behind, or hand them Phase 9's AI layer /
alert-narration work standalone — it's explicitly designed to bolt on last
and doesn't block anyone else's critical path.

---

## Still shared / whole-team
- Phase 10: reviewing every alert type's evidence table together so nothing double-counts across hypotheses — this genuinely needs all eyes, not one owner.
- Phase 11: demo script, rehearsal, trimming the report to match what actually got built.
