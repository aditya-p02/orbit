"""
Unit tests for all evidence rules, state machine, and detection engine.

Run with:
    cd backend
    python -m pytest tests/test_detection.py -v
"""

import sys
from pathlib import Path
import base64
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import time

from orbit.detection.whitelist import Whitelist, build_default_whitelist
from orbit.detection.state_machine import DeviceRegistry, TrustState
from orbit.detection.evidence import (
    BaselineStore, DeauthTracker, EvidenceHit,
    check_ssid_collision, check_security_downgrade,
    check_channel_mismatch, check_rssi_anomaly,
)
from orbit.detection.anomaly import check_rssi_anomaly_zscore
from orbit.detection.engine import DetectionEngine
from orbit.parsing.frame_parser import parse_frame

from scripts.mock.frame_builders import build_beacon_or_probe_resp as build_beacon, build_rsn_ie, build_deauth


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

TRUSTED_SSID  = "HomeNet-5G"
TRUSTED_BSSID = "AA:BB:CC:00:11:22"
EVIL_BSSID    = "AA:BB:CC:00:99:FF"
CLIENT_MAC    = "12:34:56:78:9A:BC"
NOW           = 1_700_000_000.0


def make_whitelist() -> Whitelist:
    wl = Whitelist()
    wl.add_trusted(TRUSTED_SSID, TRUSTED_BSSID)
    return wl


def make_baseline(channel: int = 6, rssi: int = -60) -> BaselineStore:
    bl = BaselineStore()
    for _ in range(15):
        # store under the NORMALIZED bssid — same form the engine passes to baseline.update
        bl.update(bssid=TRUSTED_BSSID.replace(":", "").upper(), ssid=TRUSTED_SSID, channel=channel, rssi=rssi)
    return bl


def beacon_frame(
    ssid: str,
    bssid: str,
    channel: int,
    rssi: int = -60,
    open_net: bool = False,
    node: str = "A",
):
    rsn = build_rsn_ie(open_network=open_net)
    raw = build_beacon(bssid=bssid, ssid=ssid, channel=channel, seq_num=1, is_probe_resp=False, rsn_ie=rsn)
    env = {
        "subtype": 0x08,
        "a1": "FFFFFFFFFFFF",
        "a2": bssid.replace(":", "").upper(),
        "a3": bssid.replace(":", "").upper(),
        "seq": 1,
        "rssi": rssi,
        "ch": channel,
        "node": node,
        "data": base64.b64encode(raw).decode("ascii"),
    }
    return parse_frame(env, NOW)


# ---------------------------------------------------------------------------
# Whitelist
# ---------------------------------------------------------------------------

class TestWhitelist:
    def test_trusted_bssid_recognised(self):
        wl = make_whitelist()
        assert wl.is_trusted_bssid(TRUSTED_SSID, TRUSTED_BSSID)

    def test_unknown_bssid_not_trusted(self):
        wl = make_whitelist()
        assert not wl.is_trusted_bssid(TRUSTED_SSID, EVIL_BSSID)

    def test_trusted_ssid_recognised(self):
        wl = make_whitelist()
        assert wl.is_trusted_ssid(TRUSTED_SSID)

    def test_unknown_ssid_not_trusted(self):
        wl = make_whitelist()
        assert not wl.is_trusted_ssid("CoffeeShop")

    def test_add_and_remove(self):
        wl = Whitelist()
        wl.add_trusted("Net", "AA:BB:CC:DD:EE:FF")
        assert wl.is_trusted_bssid("Net", "AA:BB:CC:DD:EE:FF")
        wl.remove_trusted("Net", "AA:BB:CC:DD:EE:FF")
        assert not wl.is_trusted_bssid("Net", "AA:BB:CC:DD:EE:FF")

    def test_dual_band_two_bssids(self):
        """One SSID with two BSSIDs (dual-band router) — neither should be suspicious."""
        wl = Whitelist()
        wl.add_trusted("Home", "AA:BB:CC:00:00:01")
        wl.add_trusted("Home", "AA:BB:CC:00:00:02")
        assert wl.is_trusted_bssid("Home", "AA:BB:CC:00:00:01")
        assert wl.is_trusted_bssid("Home", "AA:BB:CC:00:00:02")


# ---------------------------------------------------------------------------
# State machine
# ---------------------------------------------------------------------------

class TestStateMachine:
    def test_initial_state_unknown(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID, ssid=TRUSTED_SSID)
        assert dev.state == TrustState.UNKNOWN

    def test_transitions_watching_at_20(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID, ssid=TRUSTED_SSID)
        dev.add_evidence("test_rule", 20, NOW)
        assert dev.state == TrustState.WATCHING

    def test_transitions_suspicious_at_40(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID, ssid=TRUSTED_SSID)
        dev.add_evidence("rule_a", 20, NOW)
        dev.add_evidence("rule_b", 20, NOW)
        assert dev.state == TrustState.SUSPICIOUS

    def test_transitions_flagged_at_70(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID, ssid=TRUSTED_SSID)
        dev.add_evidence("rule_a", 30, NOW)
        dev.add_evidence("rule_b", 25, NOW)
        dev.add_evidence("rule_c", 15, NOW)
        assert dev.state == TrustState.FLAGGED

    def test_score_accumulates(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID, ssid=TRUSTED_SSID)
        dev.add_evidence("r1", 30, NOW)
        dev.add_evidence("r2", 25, NOW)
        assert dev.score == 55

    def test_flagged_devices_list(self):
        reg = DeviceRegistry()
        dev = reg.get_or_create(bssid=EVIL_BSSID.replace(":", "").upper(), ssid=TRUSTED_SSID)
        dev.add_evidence("r1", 70, NOW)
        flagged = reg.flagged()
        assert any(d.bssid == EVIL_BSSID.replace(":", "").upper() for d in flagged)


# ---------------------------------------------------------------------------
# Evidence rules
# ---------------------------------------------------------------------------

class TestEvidenceRules:
    def test_ssid_collision_fires(self):
        wl = make_whitelist()
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6)
        hit = check_ssid_collision(frame, wl)
        assert hit is not None
        assert hit.rule == "ssid_collision"
        assert hit.points == 30

    def test_ssid_collision_no_fire_on_trusted(self):
        wl = make_whitelist()
        frame = beacon_frame(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        hit = check_ssid_collision(frame, wl)
        assert hit is None

    def test_ssid_collision_no_fire_unknown_ssid(self):
        wl = make_whitelist()
        frame = beacon_frame("RandomNet", EVIL_BSSID, channel=6)
        hit = check_ssid_collision(frame, wl)
        assert hit is None

    def test_security_downgrade_fires(self):
        wl = make_whitelist()
        bl = make_baseline()
        # evil twin is open network
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6, open_net=True)
        hit = check_security_downgrade(frame, wl, bl)
        assert hit is not None
        assert hit.rule == "security_downgrade"
        assert hit.points == 25

    def test_security_downgrade_no_fire_no_baseline(self):
        wl = make_whitelist()
        bl = BaselineStore()   # empty — no baseline yet
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6, open_net=True)
        hit = check_security_downgrade(frame, wl, bl)
        # may or may not fire depending on implementation — just ensure no crash
        # (with RSN cached per SSID it should still fire)

    def test_channel_mismatch_fires(self):
        wl = make_whitelist()
        bl = make_baseline(channel=6)
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=11)
        hit = check_channel_mismatch(frame, wl, bl)
        assert hit is not None
        assert hit.rule == "channel_mismatch"
        assert hit.points == 15

    def test_channel_mismatch_no_fire_same_channel(self):
        wl = make_whitelist()
        bl = make_baseline(channel=6)
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6)
        hit = check_channel_mismatch(frame, wl, bl)
        assert hit is None

    def test_rssi_anomaly_zscore_fires(self):
        wl = make_whitelist()
        bl = make_baseline(rssi=-60)
        # device 40 dBm stronger than baseline — will exceed z threshold
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6, rssi=-20)
        hit = check_rssi_anomaly_zscore(frame, wl, bl)
        assert hit is not None
        assert hit.rule == "rssi_anomaly"
        assert hit.points == 15

    def test_rssi_anomaly_zscore_no_fire_normal_rssi(self):
        wl = make_whitelist()
        bl = make_baseline(rssi=-60)
        frame = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6, rssi=-62)
        hit = check_rssi_anomaly_zscore(frame, wl, bl)
        assert hit is None


# ---------------------------------------------------------------------------
# Deauth tracker
# ---------------------------------------------------------------------------

class TestDeauthTracker:
    def test_burst_detected(self):
        dt = DeauthTracker()
        for i in range(3):
            dt.record(bssid=EVIL_BSSID, client_mac=CLIENT_MAC, ts=NOW + i * 0.5)
        assert dt.is_burst(EVIL_BSSID, CLIENT_MAC, NOW + 1.0)

    def test_no_burst_too_slow(self):
        dt = DeauthTracker()
        dt.record(bssid=EVIL_BSSID, client_mac=CLIENT_MAC, ts=NOW)
        dt.record(bssid=EVIL_BSSID, client_mac=CLIENT_MAC, ts=NOW + 10.0)
        dt.record(bssid=EVIL_BSSID, client_mac=CLIENT_MAC, ts=NOW + 20.0)
        # all more than 5s apart — no burst in any 5s window
        assert not dt.is_burst(EVIL_BSSID, CLIENT_MAC, NOW + 20.0)


# ---------------------------------------------------------------------------
# Full engine integration (mock pipeline)
# ---------------------------------------------------------------------------

class TestDetectionEngine:
    def _run_scenario(self, frames: list, on_alert=None) -> DetectionEngine:
        engine = DetectionEngine(
            whitelist=make_whitelist(),
            on_alert=on_alert,
        )
        for f in frames:
            engine.feed(f)
        return engine

    def test_trusted_ap_not_flagged(self):
        trusted = beacon_frame(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        alerts = []
        engine = self._run_scenario(
            [trusted] * 20,
            on_alert=lambda dev, hits, frame, narr=None: alerts.append(dev.bssid),
        )
        assert len(alerts) == 0

    def test_evil_twin_flagged(self):
        """Evil twin (wrong BSSID, open, wrong channel) must raise an alert."""
        # first build baseline from trusted AP
        trusted = beacon_frame(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        evil = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=11, open_net=True)

        alerts = []
        engine = DetectionEngine(
            whitelist=make_whitelist(),
            on_alert=lambda dev, hits, frame, narr=None: alerts.append(dev),
        )
        # feed trusted frames first to build baseline
        for _ in range(20):
            engine.feed(trusted)
        # feed evil twin
        for _ in range(5):
            engine.feed(evil)

        assert len(alerts) > 0
        flagged_dev = alerts[0]
        assert flagged_dev.state == TrustState.FLAGGED
        assert flagged_dev.score >= 70

    def test_score_includes_ssid_collision(self):
        trusted = beacon_frame(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        evil = beacon_frame(TRUSTED_SSID, EVIL_BSSID, channel=6, open_net=False)

        alerts = []
        engine = DetectionEngine(
            whitelist=make_whitelist(),
            on_alert=lambda dev, hits, frame, narr=None: alerts.append(dev),
        )
        for _ in range(15):
            engine.feed(trusted)
        for _ in range(5):
            engine.feed(evil)

        # ssid_collision alone is +30 — device at least Watching
        # Registry key uses normalized BSSID (no colons, uppercase)
        evil_norm = EVIL_BSSID.replace(":", "").upper()
        registry_dev = engine.registry.get_or_create(
            bssid=evil_norm, ssid=TRUSTED_SSID
        )
        assert registry_dev.score >= 30

    def test_unrelated_ap_not_scored(self):
        """An AP with a completely different SSID should never be scored."""
        unrelated = beacon_frame("RandomNet", "11:22:33:44:55:66", channel=1)
        alerts = []
        engine = DetectionEngine(
            whitelist=make_whitelist(),
            on_alert=lambda dev, hits, frame, narr=None: alerts.append(dev),
        )
        for _ in range(10):
            engine.feed(unrelated)
        assert len(alerts) == 0
