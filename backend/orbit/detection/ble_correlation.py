"""
ORBIT Stage 4 — BLE / Wi-Fi correlation.

Attack scenario: an evil twin AP is physically carried by the attacker.
As the attacker moves closer to the victim, both the Wi-Fi RSSI of the
rogue AP and the RSSI of any BLE advertisement from the same device will
increase together. This correlated increase in time/RSSI is a strong
signal that the two radios belong to the same physical device.

Evidence: BLE RSSI trend correlated with suspicious Wi-Fi RSSI over the
same observation window → +15 points (same slot as the synopsis table).

Implementation:
  - Session-scoped only — BLE MACs are randomized so we cannot do
    persistent identity tracking across sessions.
  - Correlation is simple: both RSSI values trending upward (Δ > threshold)
    within the same time window = correlation confirmed.
  - BLE frames are emitted by the mock sniffer (Stage 4 addition) with
    type "ble" in the JSON envelope.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from orbit.detection.evidence import EvidenceHit


# Minimum RSSI increase (dBm) within the window to count as "trending up"
_RSSI_TREND_THRESHOLD = 8

# Window in seconds — BLE and Wi-Fi observations must be within this window
_CORRELATION_WINDOW_S = 30.0

# Minimum observations needed before correlation fires
_MIN_OBSERVATIONS = 3


@dataclass
class _RSSITimeSeries:
    """Recent (ts, rssi) observations for one address/bssid."""
    obs: list[tuple[float, int]] = field(default_factory=list)

    def add(self, ts: float, rssi: int) -> None:
        self.obs.append((ts, rssi))
        cutoff = ts - _CORRELATION_WINDOW_S
        self.obs = [(t, r) for t, r in self.obs if t >= cutoff]

    def trend(self) -> float | None:
        """
        Return RSSI change (newest - oldest) over the window.
        None if not enough data.
        """
        if len(self.obs) < _MIN_OBSERVATIONS:
            return None
        return self.obs[-1][1] - self.obs[0][1]


class BLECorrelationTracker:
    """
    Call observe_wifi() for each suspicious Wi-Fi frame.
    Call observe_ble() for each BLE advertisement frame.
    Returns EvidenceHit if correlated movement is detected for a (bssid, ble_addr) pair.
    Each pair fires at most once (no flooding).
    """

    def __init__(self) -> None:
        # wifi_bssid -> _RSSITimeSeries
        self._wifi: dict[str, _RSSITimeSeries] = defaultdict(_RSSITimeSeries)
        # ble_addr -> _RSSITimeSeries
        self._ble: dict[str, _RSSITimeSeries] = defaultdict(_RSSITimeSeries)
        # fired pairs — (wifi_bssid, ble_addr) -> True
        self._fired: set[tuple[str, str]] = set()

    def observe_wifi(self, bssid: str, rssi: int, ts: float | None = None) -> None:
        ts = ts or time.time()
        self._wifi[bssid].add(ts, rssi)

    def observe_ble(
        self,
        ble_addr: str,
        rssi: int,
        ts: float | None = None,
    ) -> list[EvidenceHit]:
        """
        Process a BLE frame. Check if any suspicious Wi-Fi BSSID has a
        correlated RSSI trend. Returns EvidenceHit list (empty if no correlation).
        """
        ts = ts or time.time()
        self._ble[ble_addr].add(ts, rssi)

        ble_trend = self._ble[ble_addr].trend()
        if ble_trend is None or ble_trend < _RSSI_TREND_THRESHOLD:
            return []

        hits: list[EvidenceHit] = []

        for wifi_bssid, wifi_series in self._wifi.items():
            key = (wifi_bssid, ble_addr)
            if key in self._fired:
                continue
            wifi_trend = wifi_series.trend()
            if wifi_trend is None or wifi_trend < _RSSI_TREND_THRESHOLD:
                continue
            # correlation confirmed
            self._fired.add(key)
            hits.append(EvidenceHit(
                rule="ble_wifi_correlation",
                points=15,
                detail=(
                    f"BLE device {ble_addr} and Wi-Fi rogue AP {wifi_bssid} "
                    f"show correlated RSSI increase over {_CORRELATION_WINDOW_S:.0f}s "
                    f"(Wi-Fi Δ={wifi_trend:+.0f} dBm, BLE Δ={ble_trend:+.0f} dBm) — "
                    f"likely the same physical device (attacker moving closer)."
                ),
            ))

        return hits
