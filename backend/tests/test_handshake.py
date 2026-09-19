"""
Unit tests for WPA handshake-capture-attempt detection.

Run with:
    cd backend
    python -m pytest tests/test_handshake.py -v
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from orbit.detection.handshake import HandshakeDetector
from orbit.detection.evidence import DeauthTracker
from orbit.parsing.frame_parser import parse_frame

from scripts.mock.frame_builders import build_deauth, build_eapol


BSSID      = "AA:BB:CC:00:99:FF"
CLIENT_MAC = "12:34:56:78:9A:BC"
NOW        = 1_700_000_000.0


def deauth_env(bssid: str, client: str, seq: int = 1) -> dict:
    raw = build_deauth(bssid=bssid, client_mac=client, seq_num=seq)
    return {
        "subtype": 0x0C,
        "a1": client.replace(":", "").upper(),
        "a2": bssid.replace(":", "").upper(),
        "a3": bssid.replace(":", "").upper(),
        "seq": seq, "rssi": -65, "channel": 6, "node": "A",
        "raw": raw.hex(),
    }


def eapol_env(bssid: str, client: str, seq: int = 10) -> dict:
    return {
        **build_eapol(bssid=bssid, client_mac=client, seq_num=seq),
        "rssi": -70, "channel": 6, "node": "A",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestHandshakeDetector:
    def test_deauth_burst_fires(self):
        hd = HandshakeDetector()
        hits = hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)
        assert len(hits) == 1
        assert hits[0].rule == "handshake_deauth_burst"
        assert hits[0].points == 25

    def test_deauth_burst_fires_only_once(self):
        hd = HandshakeDetector()
        hits1 = hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)
        hits2 = hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW + 1.0)
        assert len(hits1) == 1
        assert len(hits2) == 0   # already fired

    def test_eapol_after_deauth_fires(self):
        hd = HandshakeDetector()
        hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)

        eapol_frame = parse_frame(eapol_env(BSSID, CLIENT_MAC), NOW + 0.5)
        hits = hd.observe_frame(eapol_frame, NOW + 0.5)
        assert len(hits) == 1
        assert hits[0].rule == "handshake_eapol_capture"
        assert hits[0].points == 30

    def test_eapol_without_deauth_does_not_fire(self):
        hd = HandshakeDetector()
        eapol_frame = parse_frame(eapol_env(BSSID, CLIENT_MAC), NOW)
        hits = hd.observe_frame(eapol_frame, NOW)
        assert len(hits) == 0

    def test_eapol_outside_window_does_not_fire(self):
        hd = HandshakeDetector()
        hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)

        # EAPOL arrives 20s after deauth — outside the 15s window
        eapol_frame = parse_frame(eapol_env(BSSID, CLIENT_MAC), NOW + 20.0)
        hits = hd.observe_frame(eapol_frame, NOW + 20.0)
        assert len(hits) == 0

    def test_eapol_fires_only_once(self):
        hd = HandshakeDetector()
        hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)

        ef = parse_frame(eapol_env(BSSID, CLIENT_MAC), NOW + 0.5)
        hits1 = hd.observe_frame(ef, NOW + 0.5)
        hits2 = hd.observe_frame(ef, NOW + 1.0)
        assert len(hits1) == 1
        assert len(hits2) == 0

    def test_different_client_independent(self):
        """Deauth for client A should not trigger EAPOL detection for client B."""
        hd = HandshakeDetector()
        other_client = "AA:AA:AA:AA:AA:AA"
        hd.observe_deauth_burst(BSSID, CLIENT_MAC, NOW)

        eapol_frame = parse_frame(eapol_env(BSSID, other_client), NOW + 0.5)
        hits = hd.observe_frame(eapol_frame, NOW + 0.5)
        assert len(hits) == 0


class TestDeauthTracker:
    def test_burst_within_window(self):
        dt = DeauthTracker()
        for i in range(3):
            dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW + i * 1.0)
        assert dt.is_burst(BSSID, CLIENT_MAC, NOW + 2.0)

    def test_no_burst_below_threshold(self):
        dt = DeauthTracker()
        dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW)
        dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW + 1.0)
        # only 2 frames — threshold is 3
        assert not dt.is_burst(BSSID, CLIENT_MAC, NOW + 1.0)

    def test_no_burst_outside_window(self):
        dt = DeauthTracker()
        dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW)
        dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW + 7.0)
        dt.record(bssid=BSSID, client_mac=CLIENT_MAC, ts=NOW + 14.0)
        # all spread > 5s apart
        assert not dt.is_burst(BSSID, CLIENT_MAC, NOW + 14.0)
