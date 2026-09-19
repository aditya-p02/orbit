"""
Full 802.11 management-frame parser. Takes the raw frame bytes the ESP32
captured (base64-decoded on the way in) and produces a structured Python
object with every field ORBIT's evidence table needs.

This is deliberately the ONLY place that does IE walking / byte-level 802.11
parsing — the firmware intentionally stays cheap (§ design doc), full parsing
happens here on the laptop where CPU/RAM budget isn't a concern.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass, field

from orbit.parsing.oui_lookup import lookup_vendor
from orbit.parsing.rsn_parser import RSNInfo, parse_rsn_ie

# IE tag numbers ORBIT cares about
TAG_SSID = 0
TAG_DS_PARAM = 3
TAG_RSN = 48
TAG_VENDOR_SPECIFIC = 221

# Vendor-specific OUI + type for Microsoft WPS
_WPS_OUI = b"\x00\x50\xf2"
_WPS_TYPE = 0x04

SUBTYPE_NAMES = {
    0x04: "probe_req",
    0x05: "probe_resp",
    0x08: "beacon",
    0x0A: "disassoc",
    0x0B: "auth",
    0x0C: "deauth",
}


def _mac_str(b: bytes) -> str:
    return ":".join(f"{x:02X}" for x in b)


@dataclass
class ParsedFrame:
    # --- from the JSON envelope / firmware header fields ---
    node_id: str
    rssi: int
    channel_reported: int   # channel the *node* was tuned to when it heard this
    subtype: int
    subtype_name: str
    seq_num: int
    addr1: str  # RA / DA
    addr2: str  # TA / SA
    addr3: str  # BSSID (for the frame types ORBIT captures)
    laptop_recv_ts: float

    # --- decoded from the raw frame body (beacon/probe-resp only) ---
    ssid: str | None = None
    ds_channel: int | None = None       # channel the AP itself advertises (DS Param IE)
    capability_info: int | None = None
    privacy: bool | None = None         # capability-info bit 4: encryption in use
    rsn: RSNInfo | None = None
    has_wps_ie: bool = False
    vendor_addr2: str | None = None     # OUI vendor guess for the transmitter/BSSID
    is_eapol: bool = False              # True for EAPOL 4-way handshake frames (Stage 2)
    parse_ok: bool = True
    parse_error: str | None = None


def _walk_ies(body: bytes, start: int) -> dict[int, bytes]:
    """Walk tag/length/value IEs starting at `start`, return {tag: value_bytes}.
    Stops cleanly (rather than raising) the moment the buffer runs out —
    ESP32-side truncation (ORBIT_MAX_CAPTURE_LEN) means the tail is often
    cut off, and that's expected, not an error."""
    ies: dict[int, bytes] = {}
    pos = start
    n = len(body)
    while pos + 2 <= n:
        tag = body[pos]
        tag_len = body[pos + 1]
        val_start = pos + 2
        val_end = val_start + tag_len
        if val_end > n:
            # truncated tail — keep whatever partial bytes remain, still useful
            ies[tag] = body[val_start:n]
            break
        ies[tag] = body[val_start:val_end]
        pos = val_end
    return ies


def parse_frame(envelope: dict, laptop_recv_ts: float) -> ParsedFrame:
    """
    envelope: the already-JSON-decoded dict from ingestion, e.g.
        {"node":"A","rssi":-45,"ch":6,"subtype":8,"seq":123,
         "a1":"..","a2":"..","a3":"..","len":123,"data":"<base64>"}
    laptop_recv_ts: unix timestamp stamped at the moment ingestion received
                    this line (NOT the ESP32 clock — § design doc §17).
    """
    subtype = envelope["subtype"]

    # Handle synthetic EAPOL envelope (subtype 0xFF, set by mock sniffer / firmware Stage 2)
    if subtype == 0xFF or envelope.get("eapol"):
        pf = ParsedFrame(
            node_id=envelope.get("node", "?"),
            rssi=envelope.get("rssi", 0),
            channel_reported=envelope.get("ch", 0),
            subtype=0xFF,
            subtype_name="eapol",
            seq_num=envelope.get("seq", 0),
            addr1=envelope.get("a1", "").upper(),
            addr2=envelope.get("a2", "").upper(),
            addr3=envelope.get("a3", "").upper(),
            laptop_recv_ts=laptop_recv_ts,
            is_eapol=True,
        )
        return pf

    pf = ParsedFrame(
            node_id=envelope["node"],
            rssi=envelope["rssi"],
            channel_reported=envelope.get("ch", envelope.get("channel", 0)),
            subtype=subtype,
            subtype_name=SUBTYPE_NAMES.get(subtype, f"unknown-{subtype}"),
            seq_num=envelope["seq"],
            addr1=envelope["a1"].upper(),
            addr2=envelope["a2"].upper(),
            addr3=envelope["a3"].upper(),
            laptop_recv_ts=laptop_recv_ts,
        )

    try:
        raw = base64.b64decode(envelope["data"])
    except Exception as e:  # malformed base64 — header fields above are still usable
        pf.parse_ok = False
        pf.parse_error = f"base64 decode failed: {e}"
        return pf

    pf.vendor_addr2 = lookup_vendor(pf.addr2)

    # Only beacons and probe responses carry the fixed fields + IEs ORBIT
    # decodes. Probe requests, auth, deauth, disassoc are header-only for
    # our purposes (deauth/disassoc bodies are just a reason code, already
    # captured at the evidence-scoring level via subtype + timing, not here).
    if subtype not in (0x08, 0x05):
        return pf

    # 802.11 mgmt header is 24 bytes (already stripped by firmware payload
    # copy start — the firmware forwards from offset 0 of the MAC header,
    # so here we still need to skip: 24-byte header, then beacon/probe-resp
    # fixed fields = Timestamp(8) + Beacon Interval(2) + Capability Info(2).
    header_len = 24
    fixed_fields_len = 8 + 2 + 2
    ie_start = header_len + fixed_fields_len

    if len(raw) < ie_start:
        pf.parse_ok = False
        pf.parse_error = "frame shorter than fixed-fields region (likely truncated)"
        return pf

    cap_info = int.from_bytes(raw[header_len + 10 : header_len + 12], "little")
    pf.capability_info = cap_info
    pf.privacy = bool(cap_info & 0x0010)  # bit 4 = Privacy (encryption enabled)

    ies = _walk_ies(raw, ie_start)

    if TAG_SSID in ies:
        ssid_bytes = ies[TAG_SSID]
        # a zero-length SSID IE is a legitimate "hidden SSID" beacon, not an error
        pf.ssid = ssid_bytes.decode("utf-8", errors="replace") if ssid_bytes else ""

    if TAG_DS_PARAM in ies and len(ies[TAG_DS_PARAM]) >= 1:
        pf.ds_channel = ies[TAG_DS_PARAM][0]

    if TAG_RSN in ies:
        pf.rsn = parse_rsn_ie(ies[TAG_RSN])

    if TAG_VENDOR_SPECIFIC in ies:
        vend = ies[TAG_VENDOR_SPECIFIC]
        if len(vend) >= 4 and vend[:3] == _WPS_OUI and vend[3] == _WPS_TYPE:
            pf.has_wps_ie = True

    return pf
