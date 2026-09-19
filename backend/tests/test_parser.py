"""
Unit tests for frame_parser and rsn_parser.

Run with:
    cd backend
    python -m pytest tests/test_parser.py -v
"""

import sys
from pathlib import Path
import base64
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from scripts.mock.frame_builders import (
    build_beacon_or_probe_resp as build_beacon,
    build_deauth,
    build_eapol,
    build_rsn_ie,
    build_wps_vendor_ie,
)
from orbit.parsing.frame_parser import parse_frame, ParsedFrame
from orbit.parsing.ble_parser import parse_ble_frame


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TRUSTED_BSSID   = "AA:BB:CC:00:11:22"
TRUSTED_SSID    = "HomeNet-5G"
CLIENT_MAC      = "12:34:56:78:9A:BC"
EVIL_BSSID      = "AA:BB:CC:00:99:FF"
NOW             = 1_700_000_000.0


def _beacon_envelope(
    ssid: str,
    bssid: str,
    channel: int,
    rssi: int = -60,
    open_net: bool = False,
    node: str = "A",
) -> dict:
    rsn = build_rsn_ie(open_network=open_net)
    raw = build_beacon(bssid=bssid, ssid=ssid, channel=channel, seq_num=1, is_probe_resp=False, rsn_ie=rsn)
    return {
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


# ---------------------------------------------------------------------------
# Frame parser — beacon
# ---------------------------------------------------------------------------

class TestBeaconParsing:
    def test_trusted_ap_beacon_parses_ok(self):
        env = _beacon_envelope(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        frame = parse_frame(env, NOW)
        assert frame.parse_ok
        assert frame.ssid == TRUSTED_SSID
        assert frame.addr3 == "AABBCC001122"
        assert frame.subtype == 0x08
        assert frame.rssi == -60
        assert frame.ds_channel == 6

    def test_wpa2_network_has_rsn(self):
        env = _beacon_envelope(TRUSTED_SSID, TRUSTED_BSSID, channel=6, open_net=False)
        frame = parse_frame(env, NOW)
        assert frame.parse_ok
        assert frame.rsn is not None  # RSNInfo object present = has RSN

    def test_open_network_has_no_rsn(self):
        env = _beacon_envelope(TRUSTED_SSID, EVIL_BSSID, channel=11, open_net=True)
        frame = parse_frame(env, NOW)
        assert frame.parse_ok
        assert frame.rsn is None or frame.rsn.has_rsn is False

    def test_ssid_extracted_correctly(self):
        env = _beacon_envelope("CoffeeShop_WiFi", EVIL_BSSID, channel=1)
        frame = parse_frame(env, NOW)
        assert frame.ssid == "CoffeeShop_WiFi"

    def test_channel_mismatch_both_sources(self):
        """DS parameter set channel differs from envelope channel — ds_channel wins."""
        env = _beacon_envelope(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        # Use different key - envelope has "ch" but mock would also have "channel" if different
        # The parser uses envelope.get("ch", envelope.get("channel", 0))
        env["channel"] = 11  # envelope channel override
        frame = parse_frame(env, NOW)
        assert frame.ds_channel == 6           # from IE bytes
        assert frame.channel_reported == 6     # envelope "ch" takes priority over "channel"

    def test_laptop_recv_ts_stored(self):
        env = _beacon_envelope(TRUSTED_SSID, TRUSTED_BSSID, channel=6)
        frame = parse_frame(env, NOW)
        assert frame.laptop_recv_ts == NOW

    def test_missing_raw_still_parses(self):
        """Frames with empty 'data' field should still parse header fields (just no IEs)."""
        env = {
            "subtype": 0x08,
            "a1": "FFFFFFFFFFFF",
            "a2": TRUSTED_BSSID.replace(":", "").upper(),
            "a3": TRUSTED_BSSID.replace(":", "").upper(),
            "rssi": -55,
            "ch": 6,
            "node": "A",
            "seq": 1,
            "data": "",
        }
        frame = parse_frame(env, NOW)
        # parse_ok is False because data is empty (frame shorter than fixed-fields)
        # but header fields should still be populated
        assert frame.parse_ok is False
        assert frame.addr3 == "AABBCC001122"
        assert frame.rssi == -55
        assert frame.laptop_recv_ts == NOW


# ---------------------------------------------------------------------------
# Frame parser — deauth
# ---------------------------------------------------------------------------

class TestDeauthParsing:
    def test_deauth_frame_parses(self):
        raw = build_deauth(bssid=TRUSTED_BSSID, client_mac=CLIENT_MAC, seq_num=5)
        env = {
            "subtype": 0x0C,
            "a1": CLIENT_MAC.replace(":", "").upper(),
            "a2": TRUSTED_BSSID.replace(":", "").upper(),
            "a3": TRUSTED_BSSID.replace(":", "").upper(),
            "rssi": -65,
            "ch": 6,
            "node": "A",
            "seq": 5,
            "data": base64.b64encode(raw).decode("ascii"),
        }
        frame = parse_frame(env, NOW)
        assert frame.parse_ok
        assert frame.subtype == 0x0C


# ---------------------------------------------------------------------------
# Frame parser — EAPOL
# ---------------------------------------------------------------------------

class TestEAPOLParsing:
    def test_eapol_frame_recognised(self):
        env = build_eapol(bssid=EVIL_BSSID, client_mac=CLIENT_MAC, seq_num=10)
        env["rssi"] = -70
        env["channel"] = 6
        env["node"] = "A"
        frame = parse_frame(env, NOW)
        assert frame.parse_ok
        assert frame.is_eapol is True


# ---------------------------------------------------------------------------
# RSN parser
# ---------------------------------------------------------------------------

class TestRSNParser:
    def test_wpa2_rsn_parsed(self):
        env = _beacon_envelope(TRUSTED_SSID, TRUSTED_BSSID, channel=6, open_net=False)
        frame = parse_frame(env, NOW)
        assert frame.rsn is not None  # RSNInfo object present = has RSN

    def test_open_network_no_rsn(self):
        env = _beacon_envelope(TRUSTED_SSID, EVIL_BSSID, channel=11, open_net=True)
        frame = parse_frame(env, NOW)
        # open network: no RSN IE → rsn is None
        assert frame.rsn is None


# ---------------------------------------------------------------------------
# BLE parser
# ---------------------------------------------------------------------------

class TestBLEParser:
    def test_valid_ble_frame(self):
        env = {
            "type":  "ble",
            "node":  "B",
            "addr":  "AA:BB:CC:DD:EE:FF",
            "rssi":  -72,
            "name":  "Attacker Device",
            "company": 76,
        }
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok
        assert frame.address == "AA:BB:CC:DD:EE:FF"
        assert frame.rssi == -72
        assert frame.name == "Attacker Device"
        assert frame.company_id == 76
        assert frame.node_id == "B"

    def test_packed_mac_normalised(self):
        env = {"type": "ble", "node": "B", "addr": "AABBCCDDEEFF", "rssi": -60}
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok
        assert frame.address == "AA:BB:CC:DD:EE:FF"

    def test_missing_required_field(self):
        env = {"type": "ble", "node": "B", "addr": "AA:BB:CC:DD:EE:FF"}  # no rssi
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok is False

    def test_wrong_type_rejected(self):
        env = {"type": "wifi", "node": "B", "addr": "AA:BB:CC:DD:EE:FF", "rssi": -60}
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok is False

    def test_invalid_rssi_type(self):
        env = {"type": "ble", "node": "B", "addr": "AA:BB:CC:DD:EE:FF", "rssi": "bad"}
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok is False

    def test_optional_fields_absent(self):
        env = {"type": "ble", "node": "A", "addr": "11:22:33:44:55:66", "rssi": -80}
        frame = parse_ble_frame(env, NOW)
        assert frame.parse_ok
        assert frame.name is None
        assert frame.company_id is None
        assert frame.raw_hex is None
