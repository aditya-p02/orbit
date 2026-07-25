#!/usr/bin/env python3
"""
Stands in for a flashed ESP32 node. Run one instance with --node A and one
with --node B (in separate terminals, or let ProcessFrameSource launch them)
and they behave like the two physical nodes described in main_node_a.cpp /
main_node_b.cpp: Node A hops channels 1-11 every 300ms, Node B stays parked
on the home channel. Output is line-by-line JSON on stdout, byte-identical
in shape to what orbit_sniffer_emit() sends over serial.

Usage:
    python -m scripts.mock.mock_sniffer --node A
    python -m scripts.mock.mock_sniffer --node B

Caveat: sequence-number consistency for a given BSSID across the two node
processes relies on both being started at roughly the same wall-clock
moment (each tracks elapsed time independently, not via shared IPC). Good
enough for Phase 2/3 development; if Phase 3's sequence-continuity check
turns out to need tighter cross-node sync, revisit with a shared clock file.
"""

from __future__ import annotations

import argparse
import base64
import json
import random
import sys
import time

from scripts.mock import ap_world as world
from scripts.mock.frame_builders import (
    build_beacon_or_probe_resp,
    build_deauth,
    build_probe_req,
    build_rsn_ie,
    build_wps_vendor_ie,
)

ORBIT_MAX_CAPTURE_LEN = 320  # must match firmware's orbit_sniffer.h

NODE_A_CHANNELS = list(range(1, 12))  # matches kChannels in main_node_a.cpp
NODE_A_DWELL_MS = 300                  # matches kDwellMs in main_node_a.cpp
NODE_B_HOME_CHANNEL = world.TRUSTED_AP.channel  # matches ORBIT_HOME_CHANNEL

TICK_MS = 50
BEACON_PERIOD_MS = 100  # ~ standard 100 TU beacon interval, rounded for sim simplicity
PROBE_PERIOD_MS = 3000
DEAUTH_BURST_PERIOD_MS = 15000
DEAUTH_BURST_COUNT = 5
DEAUTH_BURST_GAP_MS = 100


def emit(node_id: str, rssi: int, channel: int, raw: bytes) -> None:
    copy_len = min(len(raw), ORBIT_MAX_CAPTURE_LEN)
    truncated = raw[:copy_len]
    subtype = (truncated[0] >> 4) & 0x0F
    seq_ctrl = truncated[22] | (truncated[23] << 8)
    seq_num = seq_ctrl >> 4
    a1 = truncated[4:10].hex().upper()
    a2 = truncated[10:16].hex().upper()
    a3 = truncated[16:22].hex().upper()

    line = {
        "node": node_id,
        "rssi": rssi,
        "ch": channel,
        "subtype": subtype,
        "seq": seq_num,
        "a1": a1,
        "a2": a2,
        "a3": a3,
        "len": copy_len,
        "data": base64.b64encode(truncated).decode("ascii"),
    }
    sys.stdout.write(json.dumps(line) + "\n")
    sys.stdout.flush()


def simulate_rssi(base_rssi: int, rng: random.Random) -> int:
    return max(-95, min(-20, base_rssi + rng.randint(-4, 4)))


def build_ap_beacon_bytes(ap: world.APProfile, seq_num: int) -> bytes:
    rsn_ie = build_rsn_ie(open_network=ap.open_network, pmf_capable=ap.pmf_capable)
    wps_ie = build_wps_vendor_ie() if ap.wps else None
    return build_beacon_or_probe_resp(
        is_probe_resp=False,
        bssid=ap.bssid,
        ssid=ap.ssid,
        channel=ap.channel,
        seq_num=seq_num,
        privacy=not ap.open_network,
        rsn_ie=rsn_ie,
        wps_ie=wps_ie,
    )


def run(node_id: str, evil_twin_at: float, speed: float, seed: int) -> None:
    rng = random.Random(seed + (0 if node_id == "A" else 1))  # per-node noise, not schedule
    seq_counters = {ap.bssid: 0 for ap in world.ALL_APS}
    client_seq = 0

    start = time.monotonic()
    last_probe_ms = -PROBE_PERIOD_MS
    last_deauth_burst_ms = -DEAUTH_BURST_PERIOD_MS

    while True:
        elapsed_s = (time.monotonic() - start) * speed
        elapsed_ms = int(elapsed_s * 1000)

        if node_id == "A":
            idx = (elapsed_ms // NODE_A_DWELL_MS) % len(NODE_A_CHANNELS)
            current_channel = NODE_A_CHANNELS[idx]
        else:
            current_channel = NODE_B_HOME_CHANNEL

        # --- AP beacons ---
        if elapsed_ms % BEACON_PERIOD_MS < TICK_MS:
            for ap in world.ALL_APS:
                if ap is world.EVIL_TWIN_AP and elapsed_s < evil_twin_at:
                    continue  # silent until the attack "starts"
                seq_counters[ap.bssid] += 1
                if ap.channel == current_channel:
                    raw = build_ap_beacon_bytes(ap, seq_counters[ap.bssid])
                    base_rssi = -40 if ap.trusted else -55
                    emit(node_id, simulate_rssi(base_rssi, rng), current_channel, raw)

        # --- occasional client probe request for the home SSID ---
        if elapsed_ms - last_probe_ms >= PROBE_PERIOD_MS:
            last_probe_ms = elapsed_ms
            client_seq += 1
            if current_channel == world.TRUSTED_AP.channel:
                raw = build_probe_req(client_mac=world.CLIENT_MAC, ssid=world.TRUSTED_AP.ssid, seq_num=client_seq)
                emit(node_id, simulate_rssi(-50, rng), current_channel, raw)

        # --- deauth burst against the client once the evil twin is live ---
        if elapsed_s >= evil_twin_at and elapsed_ms - last_deauth_burst_ms >= DEAUTH_BURST_PERIOD_MS:
            last_deauth_burst_ms = elapsed_ms
            if current_channel == world.EVIL_TWIN_AP.channel:
                for i in range(DEAUTH_BURST_COUNT):
                    seq_counters[world.EVIL_TWIN_AP.bssid] += 1
                    raw = build_deauth(
                        bssid=world.EVIL_TWIN_AP.bssid,
                        client_mac=world.CLIENT_MAC,
                        seq_num=seq_counters[world.EVIL_TWIN_AP.bssid],
                    )
                    emit(node_id, simulate_rssi(-55, rng), current_channel, raw)
                    time.sleep((DEAUTH_BURST_GAP_MS / 1000) / speed)

        time.sleep((TICK_MS / 1000) / speed)


def main() -> None:
    p = argparse.ArgumentParser(description="Mock ORBIT sensor node — no hardware required")
    p.add_argument("--node", choices=["A", "B"], required=True)
    p.add_argument("--evil-twin-at", type=float, default=20.0, help="seconds before the evil twin AP goes live")
    p.add_argument("--speed", type=float, default=1.0, help="simulation speed multiplier (2.0 = twice real-time)")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    try:
        run(args.node, args.evil_twin_at, args.speed, args.seed)
    except (KeyboardInterrupt, BrokenPipeError):
        pass


if __name__ == "__main__":
    main()
