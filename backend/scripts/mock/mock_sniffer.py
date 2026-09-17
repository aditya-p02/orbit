#!/usr/bin/env python3
"""
Stands in for a flashed ESP32 node. Run one instance with --node A and one
with --node B (in separate terminals, or let ProcessFrameSource launch them)
and they behave like the two physical nodes described in main_node_a.cpp /
main_node_b.cpp: Node A hops channels 1-11 every 300ms, Node B stays parked
on the home channel. Output is line-by-line JSON on stdout, byte-identical
in shape to what orbit_sniffer_emit() sends over serial.

Stage 2 additions:
  - EAPOL frames emitted after deauth bursts (handshake-capture detection)
  - Karma AP probe responses for multiple SSIDs
  - RSSI variation over time (device moving closer)
  - Second rogue AP appears at t=60s
  - Beacon timing jitter (±10ms)
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
    build_eapol,
    build_probe_req,
    build_rsn_ie,
    build_wps_vendor_ie,
)

ORBIT_MAX_CAPTURE_LEN = 320  # must match firmware's orbit_sniffer.h

NODE_A_CHANNELS = list(range(1, 12))  # matches kChannels in main_node_a.cpp
NODE_A_DWELL_MS = 300                  # matches kDwellMs in main_node_a.cpp
NODE_B_HOME_CHANNEL = world.TRUSTED_AP.channel  # matches ORBIT_HOME_CHANNEL

TICK_MS = 50
BEACON_PERIOD_MS = 100  # ~100 TU beacon interval
PROBE_PERIOD_MS = 3000
DEAUTH_BURST_PERIOD_MS = 15000
DEAUTH_BURST_COUNT = 5
DEAUTH_BURST_GAP_MS = 20    # 20ms gap (within a single ch11 dwell at typical sim speeds)
EAPOL_DELAY_MS = 500   # EAPOL follows the deauth burst by ~500ms

# Karma: how often we emit fake probe responses for alternate SSIDs
KARMA_PROBE_RESP_PERIOD_MS = 5000

# BLE: fake BLE advertisement from the evil twin (same physical device)
BLE_ADV_PERIOD_MS = 2000
BLE_EVIL_ADDR = "EE:11:22:33:44:55"   # fake stable BLE addr for the attacker device


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


def emit_eapol(node_id: str, channel: int, bssid: str, client_mac: str, seq_num: int) -> None:
    """Emit an EAPOL envelope directly as JSON (synthetic frame type)."""
    envelope = build_eapol(bssid=bssid, client_mac=client_mac, seq_num=seq_num)
    envelope["node"] = node_id
    envelope["rssi"] = -55
    envelope["ch"] = channel
    envelope["len"] = 0
    envelope["data"] = ""
    sys.stdout.write(json.dumps(envelope) + "\n")
    sys.stdout.flush()


def emit_ble(node_id: str, address: str, rssi: int) -> None:
    """Emit a fake BLE advertisement envelope as JSON."""
    line = {
        "node": node_id,
        "type": "ble",
        "address": address,
        "rssi": rssi,
        "timestamp": time.time(),
        # required fields for ingestion (ble frames skip the frame parser path)
        "ch": 0, "subtype": 0xFE, "seq": 0,
        "a1": "", "a2": address.replace(":", "").upper(), "a3": "",
        "len": 0, "data": "",
    }
    sys.stdout.write(json.dumps(line) + "\n")
    sys.stdout.flush()


def emit_probe_response(
    node_id: str, rssi: int, channel: int,
    bssid: str, ssid: str, seq_num: int,
) -> None:
    """Emit a probe response frame — used for Karma simulation."""
    raw = build_beacon_or_probe_resp(
        is_probe_resp=True,
        bssid=bssid,
        ssid=ssid,
        channel=channel,
        seq_num=seq_num,
        privacy=False,
        rsn_ie=None,
    )
    emit(node_id, rssi, channel, raw)


def simulate_rssi(base_rssi: int, rng: random.Random, elapsed_s: float = 0.0, ramp: bool = False) -> int:
    """
    With ramp=True: RSSI starts at base_rssi and increases by up to 30 dBm
    over 30 seconds, simulating a device moving closer.
    """
    noise = rng.randint(-4, 4)
    if ramp:
        # ramp from base to base+30 over 30s
        gain = min(30, int(elapsed_s))
        return max(-95, min(-20, base_rssi + gain + noise))
    return max(-95, min(-20, base_rssi + noise))


def jitter_ms(rng: random.Random) -> int:
    """±10ms beacon timing jitter to simulate real hardware behaviour."""
    return rng.randint(-10, 10)


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
    rng = random.Random(seed + (0 if node_id == "A" else 1))
    seq_counters = {ap.bssid: 0 for ap in world.ALL_APS}
    seq_counters[world.KARMA_AP.bssid] = seq_counters.get(world.KARMA_AP.bssid, 0)
    client_seq = 0
    eapol_seq = 0

    start = time.monotonic()
    last_probe_ms = -PROBE_PERIOD_MS
    last_deauth_burst_ms = -DEAUTH_BURST_PERIOD_MS
    last_karma_resp_ms: dict[str, int] = {}  # ssid -> last ms emitted
    deauth_burst_done_ms: int | None = None  # when did last burst finish

    while True:
        elapsed_s = (time.monotonic() - start) * speed
        elapsed_ms = int(elapsed_s * 1000)

        if node_id == "A":
            idx = (elapsed_ms // NODE_A_DWELL_MS) % len(NODE_A_CHANNELS)
            current_channel = NODE_A_CHANNELS[idx]
        else:
            current_channel = NODE_B_HOME_CHANNEL

        # --- AP beacons (with ±10ms jitter) ---
        jitter = jitter_ms(rng)
        beacon_phase = (elapsed_ms + jitter) % BEACON_PERIOD_MS
        if beacon_phase < TICK_MS:
            for ap in world.ALL_APS:
                if elapsed_s < ap.active_after_s:
                    continue  # not yet active
                if ap is world.EVIL_TWIN_AP and elapsed_s < evil_twin_at:
                    continue  # evil twin silent until attack starts
                if ap is world.EVIL_TWIN_AP2 and elapsed_s < world.EVIL_TWIN_AP2.active_after_s:
                    continue

                seq_counters[ap.bssid] += 1
                if ap.channel == current_channel:
                    raw = build_ap_beacon_bytes(ap, seq_counters[ap.bssid])

                    # Evil twin RSSI ramps up (simulates device moving closer)
                    is_evil = ap in (world.EVIL_TWIN_AP, world.EVIL_TWIN_AP2)
                    twin_elapsed = max(0.0, elapsed_s - evil_twin_at) if is_evil else 0.0
                    base = -40 if ap.trusted else -55
                    rssi = simulate_rssi(base, rng, twin_elapsed, ramp=is_evil)

                    emit(node_id, rssi, current_channel, raw)

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
                deauth_burst_done_ms = elapsed_ms

        # --- EAPOL frames ~500ms after deauth burst (Stage 2) ---
        if (
            deauth_burst_done_ms is not None
            and elapsed_ms - deauth_burst_done_ms >= EAPOL_DELAY_MS
        ):
            # EAPOL is emitted on whatever channel we're currently listening on —
            # the client reconnects via probe/auth/assoc and EAPOL can appear
            # on any channel the AP responds on. For the mock, emit on home ch.
            eapol_channel = world.TRUSTED_AP.channel
            for _ in range(4):
                eapol_seq += 1
                emit_eapol(
                    node_id, eapol_channel,
                    bssid=world.EVIL_TWIN_AP.bssid,
                    client_mac=world.CLIENT_MAC,
                    seq_num=eapol_seq,
                )
            deauth_burst_done_ms = None  # only emit once per burst

        # --- Karma AP: respond to probes for multiple SSIDs ---
        if elapsed_s >= world.KARMA_AP.active_after_s and current_channel == world.KARMA_AP.channel:
            for fake_ssid in world.KARMA_AP_EXTRA_SSIDS:
                last_ms = last_karma_resp_ms.get(fake_ssid, -KARMA_PROBE_RESP_PERIOD_MS)
                if elapsed_ms - last_ms >= KARMA_PROBE_RESP_PERIOD_MS:
                    last_karma_resp_ms[fake_ssid] = elapsed_ms
                    seq_counters[world.KARMA_AP.bssid] += 1
                    emit_probe_response(
                        node_id,
                        rssi=simulate_rssi(-60, rng),
                        channel=current_channel,
                        bssid=world.KARMA_AP.bssid,
                        ssid=fake_ssid,
                        seq_num=seq_counters[world.KARMA_AP.bssid],
                    )

        # --- BLE advertisement from evil twin device (Stage 4) ---
        # The evil twin AP and a BLE device are carried by the same attacker.
        # BLE RSSI ramps up alongside the Wi-Fi RSSI as attacker moves closer.
        if elapsed_s >= evil_twin_at:
            last_ble_ms = last_karma_resp_ms.get("__ble__", -BLE_ADV_PERIOD_MS)
            if elapsed_ms - last_ble_ms >= BLE_ADV_PERIOD_MS:
                last_karma_resp_ms["__ble__"] = elapsed_ms
                twin_elapsed = max(0.0, elapsed_s - evil_twin_at)
                ble_rssi = simulate_rssi(-70, rng, twin_elapsed, ramp=True)
                emit_ble(node_id, BLE_EVIL_ADDR, ble_rssi)

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
