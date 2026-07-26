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

# how long to block waiting for the next frame before looping again
_QUEUE_TIMEOUT_S = 0.1

# subtypes for frames we track
_SUBTYPE_BEACON     = 0x08
_SUBTYPE_PROBE_RESP = 0x05
_SUBTYPE_DEAUTH     = 0x0C
_SUBTYPE_DISASSOC   = 0x0A


class DetectionEngine:
    def __init__(
        self,
        whitelist: Whitelist | None = None,
    ) -> None:
        self.whitelist = whitelist or build_default_whitelist()
        self.registry  = DeviceRegistry()
        self.baseline  = BaselineStore()
        self.deauth    = DeauthTracker()

        self._frames_processed = 0
        self._alerts_raised    = 0

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

    def _process(self, item: ParsedFrame | dict | IngestedFrame) -> None:
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

        # --- track deauth bursts ---
        if frame.subtype in (_SUBTYPE_DEAUTH, _SUBTYPE_DISASSOC):
            self.deauth.record(
                bssid=frame.addr3,
                client_mac=frame.addr1,
                ts=ts,
            )
            return

        # --- only score beacon / probe-response frames ---
        if frame.subtype not in (_SUBTYPE_BEACON, _SUBTYPE_PROBE_RESP):
            return

        # --- skip frames with no SSID (hidden AP — not our target for midsem) ---
        if not frame.ssid:
            return

        # --- run evidence checkers ---
        hits: list[EvidenceHit] = []

        # rules already fired for this device — don't double-count
        dev = self.registry.get_or_create(bssid=frame.addr3, ssid=frame.ssid)
        already_fired = {rule for rule, _ in dev.evidence}

        for checker in (
            lambda f: check_ssid_collision(f, self.whitelist),
            lambda f: check_security_downgrade(f, self.whitelist, self.baseline),
            lambda f: check_channel_mismatch(f, self.whitelist, self.baseline),
            lambda f: check_rssi_anomaly(f, self.whitelist, self.baseline),
        ):
            hit = checker(frame)
            if hit and hit.rule not in already_fired:
                hits.append(hit)

        if not hits:
            return  # nothing new to score

        # --- update state machine ---
        newly_flagged = False

        for hit in hits:
            triggered = dev.add_evidence(hit.rule, hit.points, ts)
            if triggered:
                newly_flagged = True

        # --- raise alert on first flag ---
        if newly_flagged:
            self._alerts_raised += 1
            self._print_alert(frame, dev, hits)

    # ------------------------------------------------------------------
    # Console output
    # ------------------------------------------------------------------

    def _print_alert(
        self,
        frame: ParsedFrame,
        dev,
        hits: list[EvidenceHit],
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
