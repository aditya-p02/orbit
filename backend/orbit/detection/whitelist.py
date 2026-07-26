"""
Trusted AP whitelist store.

Keeps an in-memory map of  SSID -> [bssid, bssid, ...]
representing APs the operator has explicitly declared safe.

A single SSID can legitimately have multiple BSSIDs — dual-band routers
present two BSSIDs (2.4 GHz + 5 GHz) for the same network name.
Flagging either of those would be a false positive on every home router,
so we store a list, not a single BSSID per SSID.

For midsem: entries are hardcoded here. After midsem, Kuldeep's API
adds a POST /whitelist endpoint that calls add_trusted() at runtime.
"""

from __future__ import annotations


def _norm(bssid: str) -> str:
    """Normalize a MAC address to uppercase with no separators: AA:BB:CC:00:11:22 -> AABBCC001122."""
    return bssid.upper().replace(":", "").replace("-", "")


class Whitelist:
    def __init__(self) -> None:
        # { ssid: [normalized_bssid, ...] }  — BSSIDs stored normalized (no colons, uppercase)
        self._store: dict[str, list[str]] = {}

    # ------------------------------------------------------------------
    # write
    # ------------------------------------------------------------------

    def add_trusted(self, ssid: str, bssid: str) -> None:
        """Mark a BSSID as trusted for the given SSID."""
        bssid = _norm(bssid)
        if ssid not in self._store:
            self._store[ssid] = []
        if bssid not in self._store[ssid]:
            self._store[ssid].append(bssid)

    def remove_trusted(self, ssid: str, bssid: str) -> None:
        """Remove a specific BSSID from the trusted list for an SSID."""
        bssid = _norm(bssid)
        if ssid in self._store and bssid in self._store[ssid]:
            self._store[ssid].remove(bssid)

    # ------------------------------------------------------------------
    # read
    # ------------------------------------------------------------------

    def is_trusted_ssid(self, ssid: str) -> bool:
        """Return True if this SSID is known at all (has at least one trusted BSSID)."""
        return ssid in self._store and len(self._store[ssid]) > 0

    def is_trusted_bssid(self, ssid: str, bssid: str) -> bool:
        """Return True if this exact BSSID is trusted for this SSID."""
        return _norm(bssid) in self._store.get(ssid, [])

    def trusted_bssids_for(self, ssid: str) -> list[str]:
        """Return all trusted BSSIDs for an SSID (normalized). Empty list if SSID unknown."""
        return list(self._store.get(ssid, []))

    def all_entries(self) -> dict[str, list[str]]:
        """Return a copy of the full store. Used by the API GET /whitelist."""
        return {ssid: list(bssids) for ssid, bssids in self._store.items()}


# ------------------------------------------------------------------
# Default whitelist for midsem — hardcoded from ap_world.py
# ------------------------------------------------------------------

def build_default_whitelist() -> Whitelist:
    """
    Returns a Whitelist pre-loaded with the trusted AP from the mock scenario.
    This is the only thing that changes when we move from mock to real hardware —
    the real trusted AP's SSID and BSSID get added here instead.
    """
    wl = Whitelist()
    # From ap_world.py: TRUSTED_AP
    wl.add_trusted("HomeNet-5G", "AA:BB:CC:00:11:22")
    return wl
