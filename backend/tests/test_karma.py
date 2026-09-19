"""
Unit tests for Karma and WPA handshake detection.

Run with:
    cd backend
    python -m pytest tests/test_karma.py tests/test_handshake.py -v
"""

import sys
from pathlib import Path
import base64
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from orbit.detection.whitelist import Whitelist
from orbit.detection.karma import KarmaTracker
from orbit.parsing.frame_parser import parse_frame

from scripts.mock.frame_builders import build_beacon_or_probe_resp as build_beacon, build_rsn_ie


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TRUSTED_SSID = "HomeNet-5G"
KARMA_BSSID  = "EE:FF:00:11:22:33"
NOW          = 1_700_000_000.0


def make_whitelist() -> Whitelist:
    wl = Whitelist()
    wl.add_trusted(TRUSTED_SSID, "AA:BB:CC:00:11:22")
    return wl


def probe_resp_frame(ssid: str, bssid: str, ts_offset: float = 0.0):
    """Build a probe-response ParsedFrame."""
    rsn = build_rsn_ie(open_network=False)
    raw = build_beacon(bssid=bssid, ssid=ssid, channel=6, seq_num=1, is_probe_resp=True, rsn_ie=rsn)
    env = {
        "subtype": 0x05,
        "a1": "FFFFFFFFFFFF",
        "a2": bssid.replace(":", "").upper(),
        "a3": bssid.replace(":", "").upper(),
        "seq": 1,
        "rssi": -65,
        "ch": 6,
        "node": "A",
        "data": base64.b64encode(raw).decode("ascii"),
    }
    return parse_frame(env, NOW + ts_offset)


# ---------------------------------------------------------------------------
# Karma tracker
# ---------------------------------------------------------------------------

class TestKarmaTracker:
    def test_single_ssid_does_not_fire(self):
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        frame = probe_resp_frame(TRUSTED_SSID, KARMA_BSSID)
        hits = tracker.observe(frame, NOW)
        assert len(hits) == 0

    def test_multi_ssid_fires(self):
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        hits1 = tracker.observe(probe_resp_frame(TRUSTED_SSID, KARMA_BSSID, 0.0), NOW)
        hits2 = tracker.observe(probe_resp_frame("OfficeWiFi", KARMA_BSSID, 1.0), NOW + 1.0)
        all_hits = hits1 + hits2
        rules = {h.rule for h in all_hits}
        assert "karma_multi_ssid" in rules

    def test_untrusted_ssid_fires_after_karma(self):
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        tracker.observe(probe_resp_frame(TRUSTED_SSID, KARMA_BSSID, 0.0), NOW)
        hits = tracker.observe(probe_resp_frame("OfficeWiFi", KARMA_BSSID, 1.0), NOW + 1.0)
        rules = {h.rule for h in hits}
        assert "karma_untrusted_ssid" in rules

    def test_karma_fires_only_once_per_bssid(self):
        """Even with many more SSIDs, karma_multi_ssid fires only once per BSSID."""
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        all_hits = []
        for i, ssid in enumerate(["HomeNet-5G", "OfficeWiFi", "Starbucks", "Guest"]):
            hits = tracker.observe(probe_resp_frame(ssid, KARMA_BSSID, float(i)), NOW + i)
            all_hits.extend(hits)
        multi_hits = [h for h in all_hits if h.rule == "karma_multi_ssid"]
        assert len(multi_hits) == 1

    def test_karma_points_correct(self):
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        tracker.observe(probe_resp_frame(TRUSTED_SSID, KARMA_BSSID, 0.0), NOW)
        hits = tracker.observe(probe_resp_frame("OfficeWiFi", KARMA_BSSID, 1.0), NOW + 1.0)
        multi = next(h for h in hits if h.rule == "karma_multi_ssid")
        assert multi.points == 30

    def test_observations_outside_window_purged(self):
        """Old observations outside the 30s window should not count."""
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        # first probe-response is 60 seconds ago — outside the window
        tracker.observe(probe_resp_frame(TRUSTED_SSID, KARMA_BSSID, 0.0), NOW - 60)
        # second one now — should not pair with the old one as multi-ssid
        hits = tracker.observe(probe_resp_frame("OfficeWiFi", KARMA_BSSID, 0.0), NOW)
        # both in window only if first is NOT expired
        rules = {h.rule for h in hits}
        # with window=30s and first at NOW-60, it should be purged
        assert "karma_multi_ssid" not in rules

    def test_non_probe_resp_ignored(self):
        """Beacon frames (not probe-responses) must be ignored by karma tracker."""
        wl = make_whitelist()
        tracker = KarmaTracker(wl)
        rsn = build_rsn_ie()
        raw = build_beacon(bssid=KARMA_BSSID, ssid=TRUSTED_SSID, channel=6, seq_num=1, is_probe_resp=False, rsn_ie=rsn)
        beacon_env = {
            "subtype": 0x08,   # beacon, NOT probe-response
            "a1": "FFFFFFFFFFFF",
            "a2": KARMA_BSSID.replace(":", "").upper(),
            "a3": KARMA_BSSID.replace(":", "").upper(),
            "seq": 1, "rssi": -60, "ch": 6, "node": "A",
            "data": base64.b64encode(raw).decode("ascii"),
        }
        frame1 = parse_frame(beacon_env, NOW)
        hits1 = tracker.observe(frame1, NOW)

        frame2 = probe_resp_frame("AnotherNet", KARMA_BSSID, 1.0)
        hits2 = tracker.observe(frame2, NOW + 1.0)

        all_hits = hits1 + hits2
        assert "karma_multi_ssid" not in {h.rule for h in all_hits}
