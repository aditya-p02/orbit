"""
ORBIT Stage 2 — Karma / Rogue-AP probe-response detection.

A Karma-style attack: a rogue AP answers *any* probe request, responding
to multiple different SSIDs from the same BSSID. Evidence signals:

  - Single BSSID responds to probes for multiple distinct SSIDs
    within a short observation window: +30 points
  - Any of those SSIDs is NOT in the trusted whitelist: +20 points
    (combined with the first signal this almost always hits the 70-pt threshold)

Unlike the evil-twin detector (which scores individual beacons), Karma
detection is stateful — it accumulates probe-response observations per BSSID
over time and only fires once the multi-SSID pattern is confirmed.

Usage:
    tracker = KarmaTracker(whitelist)
    # feed probe-response frames:
    hits = tracker.observe(frame, ts)  # returns list[EvidenceHit], may be empty
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from orbit.parsing.frame_parser import ParsedFrame
from orbit.detection.whitelist import Whitelist
from orbit.detection.evidence import EvidenceHit

# A BSSID must answer probes for this many DISTINCT SSIDs within the window
# to be flagged as Karma.
_KARMA_DISTINCT_SSID_THRESHOLD = 2

# Observation window in seconds — probe responses older than this are discarded
_KARMA_WINDOW_S = 30.0

# Probe-response subtype
_SUBTYPE_PROBE_RESP = 0x05


@dataclass
class _BSSIDRecord:
    """Per-BSSID state: set of SSIDs it has answered probes for, with timestamps."""
    # ssid -> list of timestamps when this BSSID answered a probe for it
    ssid_timestamps: dict[str, list[float]] = field(default_factory=dict)
    # track which rule combos have already been scored to avoid double-counting
    karma_fired: bool = False
    untrusted_fired: bool = False


class KarmaTracker:
    """
    Stateful tracker across frames. Call observe() on every probe-response
    frame; it returns a (possibly empty) list of EvidenceHit to add to the
    device's score.
    """

    def __init__(self, whitelist: Whitelist) -> None:
        self._whitelist = whitelist
        self._records: dict[str, _BSSIDRecord] = defaultdict(_BSSIDRecord)

    def observe(self, frame: ParsedFrame, ts: float | None = None) -> list[EvidenceHit]:
        """
        Process a single frame. Returns any new EvidenceHits that fired.
        Caller is responsible for only passing probe-response frames (subtype 0x05),
        but we guard here too.
        """
        if frame.subtype != _SUBTYPE_PROBE_RESP:
            return []
        if not frame.ssid:
            return []

        ts = ts or time.time()
        bssid = frame.addr3
        ssid  = frame.ssid
        rec   = self._records[bssid]

        # record this probe-response observation
        if ssid not in rec.ssid_timestamps:
            rec.ssid_timestamps[ssid] = []
        rec.ssid_timestamps[ssid].append(ts)

        # prune old observations outside the window
        cutoff = ts - _KARMA_WINDOW_S
        for s in list(rec.ssid_timestamps.keys()):
            rec.ssid_timestamps[s] = [t for t in rec.ssid_timestamps[s] if t >= cutoff]
            if not rec.ssid_timestamps[s]:
                del rec.ssid_timestamps[s]

        # count distinct SSIDs answered within the window
        distinct_ssids = set(rec.ssid_timestamps.keys())
        n_distinct = len(distinct_ssids)

        hits: list[EvidenceHit] = []

        # Rule: multi-SSID probe responses = Karma pattern
        if n_distinct >= _KARMA_DISTINCT_SSID_THRESHOLD and not rec.karma_fired:
            rec.karma_fired = True
            ssid_list = ", ".join(f"'{s}'" for s in sorted(distinct_ssids))
            hits.append(EvidenceHit(
                rule="karma_multi_ssid",
                points=30,
                detail=(
                    f"BSSID {bssid} answered probe requests for {n_distinct} distinct SSIDs "
                    f"within {_KARMA_WINDOW_S:.0f}s: {ssid_list}. Classic Karma attack pattern."
                ),
            ))

        # Rule: any answered SSID is not in the trusted whitelist
        untrusted = [s for s in distinct_ssids if not self._whitelist.is_trusted_ssid(s)]
        if untrusted and not rec.untrusted_fired and rec.karma_fired:
            rec.untrusted_fired = True
            hits.append(EvidenceHit(
                rule="karma_untrusted_ssid",
                points=20,
                detail=(
                    f"BSSID {bssid} responded to probes for untrusted SSIDs: "
                    f"{', '.join(repr(s) for s in sorted(untrusted))}."
                ),
            ))

        return hits

    def reset_bssid(self, bssid: str) -> None:
        """Clear state for a BSSID (e.g. after it's been whitelisted)."""
        self._records.pop(bssid, None)
