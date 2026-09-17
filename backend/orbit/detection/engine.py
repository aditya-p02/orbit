"""
ORBIT Detection Engine — Stage 1.

Consumes ParsedFrames from the ingestion queue, runs all evidence checkers,
updates per-device state machines, and prints a full evidence breakdown to
console whenever a device is flagged.

Usage (standalone, for midsem demo):
    from orbit.detection.engine import DetectionEngine
    engine = DetectionEngine()
    engine.run(queue)           # blocking — runs until queue is exhausted or Ctrl-C
"""

from __future__ import annotations

import time
from queue import Queue, Empty

from orbit.parsing.frame_parser import ParsedFrame, parse_frame
from orbit.ingestion.serial_reader import IngestedFrame, IngestionQueue
from orbit.detection.whitelist import Whitelist, build_default_whitelist
from orbit.detection.state_machine import DeviceRegistry, TrustState
from orbit.detection.evidence import (
    BaselineStore,
    DeauthTracker,
    EvidenceHit,
    check_ssid_collision,
    check_security_downgrade,
    check_channel_mismatch,
    check_rssi_anomaly,
)
from orbit.detection.karma import KarmaTracker
from orbit.detection.handshake import HandshakeDetector
from orbit.detection.anomaly import check_rssi_anomaly_zscore
from orbit.detection.ble_correlation import BLECorrelationTracker
from orbit.detection.narration import AlertNarrator, get_fallback
from orbit.detection.heatmap import LocationTracker

# how long to block waiting for the next frame before looping again
_QUEUE_TIMEOUT_S = 0.1

# subtypes for frames we track
_SUBTYPE_BEACON     = 0x08
_SUBTYPE_PROBE_RESP = 0x05
_SUBTYPE_DEAUTH     = 0x0C
_SUBTYPE_DISASSOC   = 0x0A
_SUBTYPE_EAPOL      = 0xFF  # synthetic

# Alert deduplication cooldown
_ALERT_COOLDOWN_S = 60.0


class DetectionEngine:
    def __init__(
        self,
        whitelist: Whitelist | None = None,
        on_alert=None,  # optional callback(device, hits, frame) — used by API (Stage 3)
    ) -> None:
        self.whitelist = whitelist or build_default_whitelist()
        self.registry  = DeviceRegistry()
        self.baseline  = BaselineStore()
        self.deauth    = DeauthTracker()
        self.karma     = KarmaTracker(self.whitelist)
        self.handshake = HandshakeDetector()
        self.ble       = BLECorrelationTracker()
        self.heatmap   = LocationTracker()
        self.narrator  = AlertNarrator()
        self.on_alert  = on_alert

        self._frames_processed = 0
        self._alerts_raised    = 0
        # deduplication: bssid -> last alert timestamp
        self._last_alert_ts: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    def run(self, queue: "Queue | IngestionQueue", max_frames: int | None = None) -> None:
        """
        Blocking loop. Pulls frames from queue, processes each one.
        Stops when:
          - max_frames processed (useful for testing)
          - queue.get raises Empty AND queue is marked done (ingestion finished)
          - KeyboardInterrupt (Ctrl-C during live demo)
        """
        print("[ORBIT] Detection engine started.")
        print(f"[ORBIT] Trusted SSIDs: {list(self.whitelist.all_entries().keys())}\n")

        try:
            while True:
                try:
                    item = queue.get(timeout=_QUEUE_TIMEOUT_S)
                except Empty:
                    if max_frames is not None and self._frames_processed >= max_frames:
                        break
                    continue

                self._process(item)

                if max_frames is not None and self._frames_processed >= max_frames:
                    break

        except KeyboardInterrupt:
            pass

        self._print_summary()

    def feed(self, frame: ParsedFrame) -> None:
        """
        Process a single already-parsed frame directly.
        Useful for unit tests and scripted scenarios.
        """
        self._process(frame)

    # ------------------------------------------------------------------
    # Per-frame processing
    # ------------------------------------------------------------------

    def _process(self, item: "ParsedFrame | dict | IngestedFrame") -> None:
        # accept IngestedFrame from ingestion queue, raw envelope dict, or pre-parsed frame
        if isinstance(item, IngestedFrame):
            frame = parse_frame(item.envelope, item.laptop_recv_ts)
        elif isinstance(item, dict):
            frame = parse_frame(item, time.time())
        else:
            frame = item

        if not frame.parse_ok:
            return

        self._frames_processed += 1
        ts = frame.laptop_recv_ts or time.time()

        # --- BLE advertisement frames (Stage 4) ---
        if isinstance(item, IngestedFrame) and item.envelope.get("type") == "ble":
            addr  = item.envelope.get("address", "")
            rssi  = item.envelope.get("rssi", -100)
            self.ble.observe_ble(addr, rssi, ts)
            # check if any flagged BSSID correlates with this BLE device
            for dev in self.registry.all_devices():
                if dev.state.value not in ("Suspicious", "Flagged"):
                    continue
                hits = self.ble.observe_ble(addr, rssi, ts)
                for hit in hits:
                    self._apply_hits(dev.bssid, dev.ssid or "", frame, [hit], ts)
            return

        # --- EAPOL frames: handshake detection (Stage 2) ---
        if frame.is_eapol:
            hits = self.handshake.observe_frame(frame, ts)
            if hits:
                self._apply_hits(frame.addr3, frame.ssid or "", frame, hits, ts)
            return

        # --- update baseline for trusted APs ---
        if (
            frame.ssid
            and frame.subtype in (_SUBTYPE_BEACON, _SUBTYPE_PROBE_RESP)
            and self.whitelist.is_trusted_bssid(frame.ssid, frame.addr3)
        ):
            self.baseline.update(
                bssid=frame.addr3,
                ssid=frame.ssid,
                channel=frame.ds_channel or frame.channel_reported,
                rssi=frame.rssi,
            )
            return  # trusted AP — no further scoring needed

        # --- track deauth bursts (feeds handshake detector) ---
        if frame.subtype in (_SUBTYPE_DEAUTH, _SUBTYPE_DISASSOC):
            self.deauth.record(
                bssid=frame.addr3,
                client_mac=frame.addr1,
                ts=ts,
            )
            if self.deauth.is_burst(frame.addr3, frame.addr1, ts):
                hits = self.handshake.observe_deauth_burst(frame.addr3, frame.addr1, ts)
                if hits:
                    self._apply_hits(frame.addr3, frame.ssid or "", frame, hits, ts)
            return

        # --- probe responses: Karma detection (Stage 2) ---
        if frame.subtype == _SUBTYPE_PROBE_RESP and frame.ssid:
            karma_hits = self.karma.observe(frame, ts)
            if karma_hits:
                self._apply_hits(frame.addr3, frame.ssid, frame, karma_hits, ts)

        # --- only score beacon / probe-response frames for evil-twin rules ---
        if frame.subtype not in (_SUBTYPE_BEACON, _SUBTYPE_PROBE_RESP):
            return

        # --- skip frames with no SSID (hidden AP) ---
        if not frame.ssid:
            return

        # --- run evil-twin evidence checkers ---
        hits: list[EvidenceHit] = []

        dev = self.registry.get_or_create(bssid=frame.addr3, ssid=frame.ssid)
        already_fired = {rule for rule, _ in dev.evidence}

        for checker in (
            lambda f: check_ssid_collision(f, self.whitelist),
            lambda f: check_security_downgrade(f, self.whitelist, self.baseline),
            lambda f: check_channel_mismatch(f, self.whitelist, self.baseline),
            lambda f: check_rssi_anomaly_zscore(f, self.whitelist, self.baseline),  # Stage 4 z-score
        ):
            hit = checker(frame)
            if hit and hit.rule not in already_fired:
                hits.append(hit)

        if hits:
            # update heatmap RSSI for this device
            self.heatmap.update_rssi(frame.addr3, frame.node_id, frame.rssi)
            self._apply_hits(frame.addr3, frame.ssid, frame, hits, ts)

    # ------------------------------------------------------------------
    # Shared hit-application logic
    # ------------------------------------------------------------------

    def _apply_hits(
        self,
        bssid: str,
        ssid: str,
        frame: "ParsedFrame",
        hits: list[EvidenceHit],
        ts: float,
    ) -> None:
        dev = self.registry.get_or_create(bssid=bssid, ssid=ssid or (frame.ssid or ""))
        already_fired = {rule for rule, _ in dev.evidence}

        new_hits = [h for h in hits if h.rule not in already_fired]
        if not new_hits:
            return

        newly_flagged = False
        for hit in new_hits:
            triggered = dev.add_evidence(hit.rule, hit.points, ts)
            if triggered:
                newly_flagged = True

        # alert with cooldown deduplication
        if dev.state is TrustState.FLAGGED:
            last = self._last_alert_ts.get(bssid, 0.0)
            # alert if: newly flagged, OR new evidence added and cooldown elapsed,
            # OR new critical Stage-2 evidence (handshake rules always break through)
            stage2_critical = any(
                h.rule in ("handshake_eapol_capture", "handshake_deauth_burst")
                for h in new_hits
            )
            if newly_flagged or stage2_critical or (ts - last >= _ALERT_COOLDOWN_S):
                self._last_alert_ts[bssid] = ts
                self._alerts_raised += 1

                # Stage 4: generate AI narration
                evidence_dicts = [
                    {"rule": rule, "points": pts,
                     "detail": next((h.detail for h in new_hits if h.rule == rule), "")}
                    for rule, pts in dev.evidence
                ]
                narration = get_fallback(evidence_dicts) or self.narrator.narrate(evidence_dicts, dev.score)

                self._print_alert(frame, dev, new_hits, narration)
                if self.on_alert:
                    self.on_alert(dev, new_hits, frame, narration)

    # ------------------------------------------------------------------
    # Console output
    # ------------------------------------------------------------------

    def _print_alert(
        self,
        frame: ParsedFrame,
        dev,
        hits: list[EvidenceHit],
        narration: str | None = None,
    ) -> None:
        sep = "=" * 60
        print(sep)
        print(f"  !! ORBIT ALERT #{self._alerts_raised}  —  {time.strftime('%H:%M:%S')}")
        print(sep)
        print(f"  SSID   : {dev.ssid}")
        print(f"  BSSID  : {dev.bssid}")
        print(f"  Vendor : {frame.vendor_addr2 or 'unknown'}")
        print(f"  State  : {dev.state.value}")
        print(f"  Score  : {dev.score}")
        print()
        print("  Evidence breakdown:")
        for rule, pts in dev.evidence:
            # find the detail string from the current batch of hits
            detail = next((h.detail for h in hits if h.rule == rule), "")
            print(f"    [{pts:+d}]  {rule}")
            if detail:
                print(f"           {detail}")
        if narration:
            print()
            print(f"  [AI] {narration}")
        print(sep)
        print()

    def _print_summary(self) -> None:
        print("\n[ORBIT] Engine stopped.")
        print(f"[ORBIT] Frames processed : {self._frames_processed}")
        print(f"[ORBIT] Alerts raised    : {self._alerts_raised}")
        flagged = self.registry.flagged()
        if flagged:
            print(f"[ORBIT] Flagged devices  : {len(flagged)}")
            for d in flagged:
                print(f"         {d.bssid}  ({d.ssid})  score={d.score}")
        else:
            print("[ORBIT] No devices flagged.")
