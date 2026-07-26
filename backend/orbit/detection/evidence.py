"""
Evidence checkers for ORBIT Stage 1.

Each checker is a pure function:
    check_*(frame, whitelist, baseline) -> EvidenceHit | None

Returns an EvidenceHit if the rule fires, None otherwise.
The engine calls all checkers per frame and feeds hits into the state machine.

Scoring weights (locked from submitted synopsis — do not change):
    SSID collision      +30
    Security downgrade  +25
    Channel mismatch    +15
    RSSI anomaly        +15
    Deauth burst        tracked here, points applied by engine when burst confirmed
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from orbit.parsing.frame_parser import ParsedFrame
from orbit.detection.whitelist import Whitelist


# ---------------------------------------------------------------------------
# Evidence hit — what a checker returns when its rule fires
# ---------------------------------------------------------------------------

@dataclass
class EvidenceHit:
    rule:   str   # short machine-readable name
    points: int   # score contribution
    detail: str   # human-readable explanation shown in the alert


# ---------------------------------------------------------------------------
# Baseline store — what we know about trusted APs from observed frames
# Used by channel-mismatch and RSSI-anomaly checkers
# ---------------------------------------------------------------------------

@dataclass
class APBaseline:
    ssid:    str
    bssid:   str
    channel: int | None        = None
    rssi_samples: list[int]    = field(default_factory=list)

    @property
    def mean_rssi(self) -> float | None:
        return sum(self.rssi_samples) / len(self.rssi_samples) if self.rssi_samples else None


class BaselineStore:
    """Records observed channel + RSSI for every trusted BSSID."""

    def __init__(self) -> None:
        self._baselines: dict[str, APBaseline] = {}   # bssid -> APBaseline

    def update(self, bssid: str, ssid: str, channel: int | None, rssi: int) -> None:
        if bssid not in self._baselines:
            self._baselines[bssid] = APBaseline(ssid=ssid, bssid=bssid)
        bl = self._baselines[bssid]
        if channel is not None:
            bl.channel = channel
        bl.rssi_samples.append(rssi)
        # keep rolling window — last 50 samples is plenty
        if len(bl.rssi_samples) > 50:
            bl.rssi_samples.pop(0)

    def get(self, bssid: str) -> APBaseline | None:
        return self._baselines.get(bssid)


# ---------------------------------------------------------------------------
# Deauth burst tracker (feeds Stage 2 WPA handshake detection too)
# ---------------------------------------------------------------------------

# 3+ deauth frames targeting the same client within this window = burst
_DEAUTH_WINDOW_S  = 5.0
_DEAUTH_THRESHOLD = 3


class DeauthTracker:
    """
    Tracks deauth/disassoc frames per (bssid, client_mac) pair.
    Call record() on every deauth frame.
    is_burst() returns True if a burst was detected in the last window.
    """

    def __init__(self) -> None:
        # (bssid, client) -> [timestamps]
        self._events: dict[tuple[str, str], list[float]] = defaultdict(list)

    def record(self, bssid: str, client_mac: str, ts: float) -> None:
        key = (bssid, client_mac)
        self._events[key].append(ts)
        # prune old events outside the window
        cutoff = ts - _DEAUTH_WINDOW_S
        self._events[key] = [t for t in self._events[key] if t >= cutoff]

    def is_burst(self, bssid: str, client_mac: str, ts: float) -> bool:
        key = (bssid, client_mac)
        cutoff = ts - _DEAUTH_WINDOW_S
        recent = [t for t in self._events.get(key, []) if t >= cutoff]
        return len(recent) >= _DEAUTH_THRESHOLD

    def burst_count(self, bssid: str, client_mac: str, ts: float) -> int:
        key = (bssid, client_mac)
        cutoff = ts - _DEAUTH_WINDOW_S
        return len([t for t in self._events.get(key, []) if t >= cutoff])


# ---------------------------------------------------------------------------
# Evidence checkers
# ---------------------------------------------------------------------------

def check_ssid_collision(
    frame: ParsedFrame,
    whitelist: Whitelist,
) -> EvidenceHit | None:
    """
    Rule 1 — SSID collision (+30)
    Frame advertises a trusted SSID but its BSSID is not in the whitelist.
    Primary evil twin signal.
    """
    if frame.ssid is None or frame.ssid == "":
        return None
    if not whitelist.is_trusted_ssid(frame.ssid):
        return None
    if whitelist.is_trusted_bssid(frame.ssid, frame.addr3):
        return None  # legitimate AP — no hit

    return EvidenceHit(
        rule="ssid_collision",
        points=30,
        detail=(
            f"SSID '{frame.ssid}' matches a trusted network "
            f"but BSSID {frame.addr3} is not in the whitelist."
        ),
    )


def check_security_downgrade(
    frame: ParsedFrame,
    whitelist: Whitelist,
    baseline: BaselineStore,
) -> EvidenceHit | None:
    """
    Rule 2 — Security downgrade (+25)
    Trusted AP uses WPA2/WPA3 (has RSN IE). This frame has no RSN IE (open)
    or weaker AKM. Only meaningful if the SSID is already flagged as trusted
    and the BSSID is NOT trusted (i.e. Rule 1 also applies).
    """
    if frame.ssid is None or not whitelist.is_trusted_ssid(frame.ssid):
        return None
    if whitelist.is_trusted_bssid(frame.ssid, frame.addr3):
        return None

    # find a trusted BSSID for this SSID to check its security level
    trusted_bssids = whitelist.trusted_bssids_for(frame.ssid)
    if not trusted_bssids:
        return None

    # check if any trusted baseline for this SSID had an RSN IE
    trusted_has_rsn = any(
        baseline.get(b) is not None for b in trusted_bssids
    )

    # frame has no RSN IE = open network
    frame_is_open = frame.rsn is None

    if frame_is_open and trusted_has_rsn:
        return EvidenceHit(
            rule="security_downgrade",
            points=25,
            detail=(
                f"SSID '{frame.ssid}' is trusted with WPA2/WPA3 "
                f"but BSSID {frame.addr3} advertises an open (no RSN) network."
            ),
        )

    # even if we have no baseline yet, open + trusted SSID collision is suspicious
    if frame_is_open and not trusted_has_rsn:
        # we know the trusted AP is WPA2 from ap_world — check privacy bit
        # if privacy bit is also unset, it's definitely open
        if frame.privacy is False:
            return EvidenceHit(
                rule="security_downgrade",
                points=25,
                detail=(
                    f"SSID '{frame.ssid}' is a known trusted network "
                    f"but BSSID {frame.addr3} has no encryption (Privacy bit unset)."
                ),
            )

    return None


def check_channel_mismatch(
    frame: ParsedFrame,
    whitelist: Whitelist,
    baseline: BaselineStore,
) -> EvidenceHit | None:
    """
    Rule 3 — Channel mismatch (+15)
    Trusted AP is known to operate on channel X.
    This frame uses the same SSID but advertises a different channel.
    """
    if frame.ssid is None or not whitelist.is_trusted_ssid(frame.ssid):
        return None
    if whitelist.is_trusted_bssid(frame.ssid, frame.addr3):
        return None

    trusted_bssids = whitelist.trusted_bssids_for(frame.ssid)
    for bssid in trusted_bssids:
        bl = baseline.get(bssid)
        if bl and bl.channel is not None:
            frame_ch = frame.ds_channel or frame.channel_reported
            if frame_ch != bl.channel:
                return EvidenceHit(
                    rule="channel_mismatch",
                    points=15,
                    detail=(
                        f"Trusted '{frame.ssid}' operates on channel {bl.channel} "
                        f"but BSSID {frame.addr3} is on channel {frame_ch}."
                    ),
                )

    return None


def check_rssi_anomaly(
    frame: ParsedFrame,
    whitelist: Whitelist,
    baseline: BaselineStore,
) -> EvidenceHit | None:
    """
    Rule 4 — RSSI anomaly (+15)
    For midsem: flag if this device's RSSI is more than 20 dBm stronger
    than the trusted AP baseline mean. Simple threshold — replaced by
    z-score in Stage 4.
    """
    if frame.ssid is None or not whitelist.is_trusted_ssid(frame.ssid):
        return None
    if whitelist.is_trusted_bssid(frame.ssid, frame.addr3):
        return None

    trusted_bssids = whitelist.trusted_bssids_for(frame.ssid)
    for bssid in trusted_bssids:
        bl = baseline.get(bssid)
        if bl and bl.mean_rssi is not None:
            diff = frame.rssi - bl.mean_rssi
            if diff > 20:
                return EvidenceHit(
                    rule="rssi_anomaly",
                    points=15,
                    detail=(
                        f"BSSID {frame.addr3} RSSI {frame.rssi} dBm is "
                        f"{diff:.1f} dBm stronger than trusted baseline "
                        f"({bl.mean_rssi:.1f} dBm) — unusually close or boosted signal."
                    ),
                )

    return None
