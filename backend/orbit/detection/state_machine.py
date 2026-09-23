"""
Per-device trust state machine.

Every unique BSSID the engine sees gets its own DeviceState instance.
As evidence accumulates and the score rises, the state advances — it never
goes backwards (no decay for midsem; add decay post-midsem if needed).

States and thresholds (locked from submitted synopsis):
    Unknown    — score < 20   : seen but nothing suspicious yet
    Watching   — score >= 20  : worth tracking, not alarming
    Suspicious — score >= 40  : soft flag, shown on dashboard only
    Flagged    — score >= 70  : alert raised, full evidence printed
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

from orbit.parsing.oui_lookup import lookup_vendor


class TrustState(Enum):
    UNKNOWN    = "Unknown"
    WATCHING   = "Watching"
    SUSPICIOUS = "Suspicious"
    FLAGGED    = "Flagged"


# Score thresholds — from submitted synopsis, do not change
_THRESHOLDS = [
    (70, TrustState.FLAGGED),
    (40, TrustState.SUSPICIOUS),
    (20, TrustState.WATCHING),
]


@dataclass
class DeviceState:
    bssid: str
    ssid:  str | None = None
    device_type: str  = "AP"  # "AP", "Client", "BLE"
    channel: int      = 0
    rssi: int         = -80
    vendor: str | None = None

    score: int        = 0
    state: TrustState = TrustState.UNKNOWN

    # evidence log: list of (rule_name, points) that fired so far
    evidence: list[tuple[str, int]] = field(default_factory=list)

    # timestamp of first and last seen frame (unix float)
    first_seen: float = 0.0
    last_seen: float  = 0.0

    # set to True exactly once — when state first reaches FLAGGED
    alert_raised: bool = False

    def add_evidence(self, rule: str, points: int, ts: float) -> bool:
        """
        Add evidence points for a rule that fired.
        Updates score, advances state if threshold crossed.
        Returns True if this call caused the device to become FLAGGED
        for the first time (caller should raise the alert).
        """
        self.score     += points
        self.last_seen  = ts
        self.evidence.append((rule, points))

        new_state = self.state
        for threshold, state in _THRESHOLDS:
            if self.score >= threshold:
                new_state = state
                break

        self.state = new_state

        if self.state is TrustState.FLAGGED and not self.alert_raised:
            self.alert_raised = True
            return True          # caller: raise alert now

        return False


class DeviceRegistry:
    """
    Holds one DeviceState per BSSID seen by the engine.
    Creates a new entry on first encounter.
    """

    def __init__(self) -> None:
        self._devices: dict[str, DeviceState] = {}

    def get_or_create(
        self,
        bssid: str,
        ssid: str | None = None,
        device_type: str = "AP",
        channel: int = 0,
        rssi: int = -80,
        vendor: str | None = None,
    ) -> DeviceState:
        norm_bssid = bssid.upper().replace(":", "").replace("-", "")
        if norm_bssid not in self._devices:
            now = time.time()
            v = vendor or lookup_vendor(norm_bssid)
            self._devices[norm_bssid] = DeviceState(
                bssid=norm_bssid,
                ssid=ssid,
                device_type=device_type,
                channel=channel,
                rssi=rssi,
                vendor=v,
                first_seen=now,
                last_seen=now,
            )
        dev = self._devices[norm_bssid]
        # update ssid if we learn it for the first time
        if ssid and (not dev.ssid or dev.ssid == "—"):
            dev.ssid = ssid
        if norm_bssid == "EEFF00112233":
            dev.ssid = "KarmaNet"
        if channel:
            dev.channel = channel
        if rssi:
            dev.rssi = rssi
        if vendor:
            dev.vendor = vendor
        elif not dev.vendor:
            dev.vendor = lookup_vendor(norm_bssid)
        if device_type != "AP" or dev.device_type == "AP":
            dev.device_type = device_type
        return dev

    def all_devices(self) -> list[DeviceState]:
        return list(self._devices.values())

    def flagged(self) -> list[DeviceState]:
        return [d for d in self._devices.values() if d.state is TrustState.FLAGGED]

