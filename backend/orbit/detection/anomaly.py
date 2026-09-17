"""
ORBIT Stage 4 — Z-score RSSI anomaly detection.

Replaces the simple RSSI threshold from Stage 1 Rule 4 with a proper
statistical z-score model. Same score slot (+15), better logic.

How it works:
  - Calibration phase: collect RSSI and beacon-interval samples from each
    trusted AP (BaselineStore already does this in evidence.py).
  - Live detection: when a suspicious device's RSSI deviates more than
    Z_THRESHOLD standard deviations from the trusted AP's mean, flag it.

The z-score needs at least MIN_SAMPLES before firing — below that, fall
back to the simple threshold (20 dBm difference) from Stage 1.

This module replaces check_rssi_anomaly() in evidence.py — the engine
calls this instead once calibration has enough samples.
"""

from __future__ import annotations

import math

from orbit.parsing.frame_parser import ParsedFrame
from orbit.detection.whitelist import Whitelist
from orbit.detection.evidence import EvidenceHit, BaselineStore

# Z-score threshold: 2 standard deviations → ~95% confidence
Z_THRESHOLD = 2.0

# Minimum samples needed before switching from simple to z-score mode
MIN_SAMPLES = 10

# Fallback simple threshold (from Stage 1, still used when few samples)
SIMPLE_THRESHOLD_DBM = 20


def check_rssi_anomaly_zscore(
    frame: ParsedFrame,
    whitelist: Whitelist,
    baseline: BaselineStore,
) -> EvidenceHit | None:
    """
    Stage 4 replacement for check_rssi_anomaly.
    Same return type — drop-in for the engine's evidence checker list.
    """
    if frame.ssid is None or not whitelist.is_trusted_ssid(frame.ssid):
        return None
    if whitelist.is_trusted_bssid(frame.ssid, frame.addr3):
        return None

    trusted_bssids = whitelist.trusted_bssids_for(frame.ssid)
    for bssid in trusted_bssids:
        bl = baseline.get(bssid)
        if bl is None or bl.mean_rssi is None:
            continue

        samples = bl.rssi_samples
        mean = bl.mean_rssi

        if len(samples) >= MIN_SAMPLES:
            # z-score mode
            variance = sum((x - mean) ** 2 for x in samples) / len(samples)
            std = math.sqrt(variance) if variance > 0 else 1.0
            z = (frame.rssi - mean) / std
            if z > Z_THRESHOLD:
                return EvidenceHit(
                    rule="rssi_anomaly",
                    points=15,
                    detail=(
                        f"BSSID {frame.addr3} RSSI {frame.rssi} dBm is "
                        f"{z:.1f}σ above trusted baseline mean "
                        f"({mean:.1f} dBm, σ={std:.1f}) — statistically anomalous signal strength."
                    ),
                )
        else:
            # fallback: simple threshold
            diff = frame.rssi - mean
            if diff > SIMPLE_THRESHOLD_DBM:
                return EvidenceHit(
                    rule="rssi_anomaly",
                    points=15,
                    detail=(
                        f"BSSID {frame.addr3} RSSI {frame.rssi} dBm is "
                        f"{diff:.1f} dBm stronger than trusted baseline "
                        f"({mean:.1f} dBm) — unusually close or boosted signal. "
                        f"(Calibrating — {len(samples)}/{MIN_SAMPLES} samples, z-score pending)"
                    ),
                )

    return None
