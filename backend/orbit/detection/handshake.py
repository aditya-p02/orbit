"""
ORBIT Stage 2 — WPA handshake-capture-attempt detection.

Attack sequence the attacker uses:
  1. Send a burst of deauth frames at a client connected to a legitimate AP
     (forces the client to disconnect and reconnect)
  2. Capture the 4-way WPA handshake frames (EAPOL) that fly during reconnect
  3. Run offline dictionary attack against the captured handshake

ORBIT detects the ATTEMPT — it does not capture or crack anything.

Evidence signals:
  - Deauth burst against a client on a monitored BSSID: +25 points
  - EAPOL handshake frames from a reconnecting client within a short window
    after the deauth burst: +30 points

These two together usually push a device already at 70 (evil-twin flagged)
to show the full kill-chain — or independently flag a deauth-flood attack.

EAPOL frame: 802.11 data frame with LLC/SNAP header indicating EtherType 0x888E.
The mock sniffer emits these as subtype=0x20 (data) with a recognisable
data payload (see frame_builders.build_eapol).
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field

from orbit.parsing.frame_parser import ParsedFrame
from orbit.detection.evidence import EvidenceHit

# Deauth burst: already tracked by DeauthTracker in evidence.py.
# HandshakeTracker only needs to watch for EAPOL frames arriving shortly
# after a confirmed deauth burst.

# Window: EAPOL must arrive within this many seconds of a deauth burst
_EAPOL_WINDOW_S = 15.0

# EAPOL subtype sentinel — we use subtype 0x20 (data frame) as the mock
# convention; the real parser identifies EAPOL by the LLC payload.
# We also look at a frame's "eapol" flag set by the parser.
_SUBTYPE_DATA = 0x20
_SUBTYPE_EAPOL = 0xFF  # synthetic subtype set by our parser for EAPOL frames


@dataclass
class _HandshakeRecord:
    """State per (bssid, client_mac) pair."""
    deauth_burst_ts: float | None = None   # when we last saw a deauth burst
    deauth_fired: bool = False
    eapol_fired: bool = False


def _norm_mac(mac: str) -> str:
    """Normalize MAC to uppercase no-separator form."""
    return mac.upper().replace(":", "").replace("-", "")


class HandshakeDetector:
    """
    Call observe_deauth_burst() when DeauthTracker confirms a burst.
    Call observe_frame()        for every frame (looks for EAPOL data frames).
    Returns EvidenceHit list (empty if nothing new fired).
    """

    def __init__(self) -> None:
        # (bssid, client_mac) -> _HandshakeRecord
        self._records: dict[tuple[str, str], _HandshakeRecord] = defaultdict(_HandshakeRecord)

    def observe_deauth_burst(
        self,
        bssid: str,
        client_mac: str,
        ts: float | None = None,
    ) -> list[EvidenceHit]:
        """
        Call when a deauth burst for (bssid, client_mac) is confirmed.
        Returns EvidenceHit for the deauth signal (+25) the first time.
        """
        ts = ts or time.time()
        key = (_norm_mac(bssid), _norm_mac(client_mac))
        rec = self._records[key]

        hits: list[EvidenceHit] = []

        if not rec.deauth_fired:
            rec.deauth_fired = True
            rec.deauth_burst_ts = ts
            hits.append(EvidenceHit(
                rule="handshake_deauth_burst",
                points=25,
                detail=(
                    f"Deauth burst: {bssid} sent 3+ deauth frames targeting "
                    f"client {client_mac} within 5 seconds — forcing disconnection "
                    f"to capture the WPA 4-way handshake."
                ),
            ))
        else:
            # update timestamp for EAPOL window even if we've already scored this
            rec.deauth_burst_ts = ts

        return hits

    def observe_frame(
        self,
        frame: ParsedFrame,
        ts: float | None = None,
    ) -> list[EvidenceHit]:
        """
        Call for every frame. If it's an EAPOL frame arriving after a
        recent deauth burst, return the EAPOL evidence hit (+30).
        """
        ts = ts or time.time()

        # EAPOL frames are flagged by the parser via subtype 0xFF (synthetic)
        # or the is_eapol attribute if we add that to ParsedFrame.
        # We also check the "eapol" key in the raw envelope if the mock sets it.
        is_eapol = (
            getattr(frame, "is_eapol", False)
            or frame.subtype == _SUBTYPE_EAPOL
        )
        if not is_eapol:
            return []

        # EAPOL reassociation: addr2 is client, addr3 is the AP they're reconnecting to
        bssid      = frame.addr3
        client_mac = frame.addr2

        key = (_norm_mac(bssid), _norm_mac(client_mac))
        rec = self._records[key]

        hits: list[EvidenceHit] = []

        if (
            rec.deauth_burst_ts is not None
            and not rec.eapol_fired
            and (ts - rec.deauth_burst_ts) <= _EAPOL_WINDOW_S
        ):
            rec.eapol_fired = True
            elapsed = ts - rec.deauth_burst_ts
            hits.append(EvidenceHit(
                rule="handshake_eapol_capture",
                points=30,
                detail=(
                    f"EAPOL 4-way handshake frames observed from client {client_mac} "
                    f"reconnecting to {bssid} {elapsed:.1f}s after deauth burst — "
                    f"attacker likely captured the handshake for offline cracking."
                ),
            ))

        return hits
