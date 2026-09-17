"""
Defines the fake RF environment the mock generator plays out. Kept separate
from mock_sniffer.py so the scenario is easy to see and tweak at a glance
without wading through the tick-loop/timing code.

Scenario:
  - HomeNet-5G: legitimate trusted AP, WPA2-PSK+PMF-capable, channel 6
    (matches ORBIT_HOME_CHANNEL in main_node_b.cpp — Node B should see it
    on every dwell, Node A only when its hop lands on channel 6).
  - Free_Cafe_WiFi: a real but untrusted open AP on channel 3 — background
    noise, nothing malicious, just something that should NOT get flagged.
  - Evil twin of HomeNet-5G: same SSID, DIFFERENT BSSID, open (no RSN IE at
    all — a stark security downgrade from the real AP), on channel 11.
    Silent until `--evil-twin-at` seconds in, so a passive baseline period
    exists before the attack starts.
  - Second rogue AP: appears at t=60s, same SSID again, different BSSID,
    tests that engine handles multiple simultaneous suspects.
  - One client device that legitimately roams and occasionally probes for
    HomeNet-5G, plus a deauth burst against it once the evil twin goes live
    (sets up Stage 2 handshake-capture-attempt detection).
  - Karma AP: single BSSID answers probe requests for multiple SSIDs,
    demonstrating Karma attack pattern detection.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class APProfile:
    name: str
    bssid: str
    ssid: str
    channel: int
    open_network: bool
    pmf_capable: bool
    wps: bool
    trusted: bool
    active_after_s: float = 0.0  # seconds into the run before this AP starts transmitting


TRUSTED_AP = APProfile(
    name="home_ap",
    bssid="AA:BB:CC:00:11:22",
    ssid="HomeNet-5G",
    channel=6,
    open_network=False,
    pmf_capable=True,
    wps=False,
    trusted=True,
)

ROGUE_BACKGROUND_AP = APProfile(
    name="cafe_ap",
    bssid="DE:AD:BE:EF:00:01",
    ssid="Free_Cafe_WiFi",
    channel=3,
    open_network=True,
    pmf_capable=False,
    wps=False,
    trusted=False,
)

EVIL_TWIN_AP = APProfile(
    name="evil_twin",
    bssid="AA:BB:CC:00:11:99",  # same vendor-looking prefix, different NIC
    ssid="HomeNet-5G",           # SAME SSID as the trusted AP — this is the attack
    channel=11,
    open_network=True,           # no RSN IE at all — stark downgrade vs WPA2+PMF
    pmf_capable=False,
    wps=False,
    trusted=False,
)

# Second rogue AP — appears later to test multi-suspect handling
EVIL_TWIN_AP2 = APProfile(
    name="evil_twin_2",
    bssid="BB:CC:DD:00:22:99",
    ssid="HomeNet-5G",
    channel=9,
    open_network=True,
    pmf_capable=False,
    wps=False,
    trusted=False,
    active_after_s=60.0,        # appears 60s in
)

# Karma AP — answers probes for multiple SSIDs
KARMA_AP = APProfile(
    name="karma_ap",
    bssid="EE:FF:00:11:22:33",
    ssid="KarmaNet",             # its own SSID (will also respond to others)
    channel=6,
    open_network=True,
    pmf_capable=False,
    wps=False,
    trusted=False,
    active_after_s=15.0,        # appears 15s in
)

# SSIDs the Karma AP pretends to be (in addition to its own)
KARMA_AP_EXTRA_SSIDS = ["HomeNet-5G", "OfficeWiFi", "AndroidAP"]

ALL_APS = [TRUSTED_AP, ROGUE_BACKGROUND_AP, EVIL_TWIN_AP, EVIL_TWIN_AP2, KARMA_AP]

CLIENT_MAC = "12:34:56:78:9A:BC"
