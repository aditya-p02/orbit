"""
RSN (Robust Security Network) information element parser — IEEE 802.11-2020
§9.4.2.24. This is IE tag 48 inside a beacon/probe-response body.

Layout:
  version            (2 bytes, LE)
  group cipher suite (4 bytes: 3-byte OUI + 1-byte suite type)
  pairwise count      (2 bytes, LE)
  pairwise suites     (4 bytes each)
  akm count           (2 bytes, LE)
  akm suites          (4 bytes each)
  rsn capabilities    (2 bytes, LE)   <- PMF bits live here
  [PMKID count/list, group mgmt cipher suite — not needed for ORBIT, ignored]

An absent RSN IE means the network is open or WEP — both are surfaced
upstream as "no RSN IE" rather than this module guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# IEEE 802.11 OUI for standard cipher/AKM suites
_STD_OUI = b"\x00\x0f\xac"

_CIPHER_SUITE_NAMES = {
    0: "Use-Group",
    1: "WEP-40",
    2: "TKIP",
    4: "CCMP-128 (AES)",
    5: "WEP-104",
    6: "BIP-CMAC-128",
    8: "GCMP-128",
    9: "GCMP-256",
    10: "CCMP-256",
    11: "BIP-GMAC-128",
    12: "BIP-GMAC-256",
    13: "BIP-CMAC-256",
}

_AKM_SUITE_NAMES = {
    1: "802.1X (Enterprise)",
    2: "PSK (WPA2-Personal)",
    3: "FT-802.1X",
    4: "FT-PSK",
    5: "802.1X-SHA256",
    6: "PSK-SHA256",
    8: "SAE (WPA3-Personal)",
    9: "FT-SAE",
    11: "802.1X-Suite-B-192",
    18: "OWE (Enhanced Open)",
}


@dataclass
class RSNInfo:
    version: int
    group_cipher: str
    pairwise_ciphers: list[str] = field(default_factory=list)
    akm_suites: list[str] = field(default_factory=list)
    pmf_capable: bool = False   # MFPC bit — station *may* use PMF
    pmf_required: bool = False  # MFPR bit — station *must* use PMF
    raw_ok: bool = True         # False if the IE was truncated/malformed


def _suite_name(table: dict[int, str], oui_and_type: bytes) -> str:
    oui, suite_type = oui_and_type[:3], oui_and_type[3]
    if oui == _STD_OUI:
        return table.get(suite_type, f"unknown-std-{suite_type}")
    return f"vendor-{oui.hex()}-{suite_type}"


def parse_rsn_ie(ie_body: bytes) -> RSNInfo | None:
    """
    ie_body: the RSN IE's payload bytes (i.e. everything after the
             tag-number and tag-length bytes, NOT including them).

    Returns None only if ie_body is empty; returns an RSNInfo with
    raw_ok=False (rather than raising) if it's present but truncated,
    since a malformed RSN IE is itself a data point worth logging, not
    a crash.
    """
    if not ie_body:
        return None

    try:
        pos = 0
        version = int.from_bytes(ie_body[pos : pos + 2], "little")
        pos += 2

        group_cipher = _suite_name(_CIPHER_SUITE_NAMES, ie_body[pos : pos + 4])
        pos += 4

        pairwise_count = int.from_bytes(ie_body[pos : pos + 2], "little")
        pos += 2
        pairwise_ciphers = []
        for _ in range(pairwise_count):
            pairwise_ciphers.append(_suite_name(_CIPHER_SUITE_NAMES, ie_body[pos : pos + 4]))
            pos += 4

        akm_count = int.from_bytes(ie_body[pos : pos + 2], "little")
        pos += 2
        akm_suites = []
        for _ in range(akm_count):
            akm_suites.append(_suite_name(_AKM_SUITE_NAMES, ie_body[pos : pos + 4]))
            pos += 4

        pmf_capable = False
        pmf_required = False
        if pos + 2 <= len(ie_body):
            rsn_caps = int.from_bytes(ie_body[pos : pos + 2], "little")
            pmf_required = bool(rsn_caps & 0x0040)  # bit 6: MFPR
            pmf_capable = bool(rsn_caps & 0x0080)   # bit 7: MFPC

        return RSNInfo(
            version=version,
            group_cipher=group_cipher,
            pairwise_ciphers=pairwise_ciphers,
            akm_suites=akm_suites,
            pmf_capable=pmf_capable,
            pmf_required=pmf_required,
            raw_ok=True,
        )
    except (IndexError, ValueError):
        return RSNInfo(
            version=0,
            group_cipher="malformed",
            pairwise_ciphers=[],
            akm_suites=[],
            pmf_capable=False,
            pmf_required=False,
            raw_ok=False,
        )
