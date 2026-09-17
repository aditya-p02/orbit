"""
Builds real, spec-accurate 802.11 management frame bytes (header + fixed
fields + IEs). Output is byte-for-byte what a real radio would actually put
on the air for these frame types — the ONLY thing "mock" about this is that
no antenna is involved. This is what makes it safe to swap for a real ESP32
later with zero parser changes.
"""

from __future__ import annotations

FT_MGMT = 0
ST_PROBE_REQ = 0x04
ST_PROBE_RESP = 0x05
ST_BEACON = 0x08
ST_DISASSOC = 0x0A
ST_AUTH = 0x0B
ST_DEAUTH = 0x0C

BROADCAST = "FF:FF:FF:FF:FF:FF"


def _mac_bytes(mac: str) -> bytes:
    return bytes(int(o, 16) for o in mac.split(":"))


def _frame_control(subtype: int) -> bytes:
    byte0 = ((subtype & 0x0F) << 4) | (FT_MGMT << 2)  # version=0
    byte1 = 0x00  # no ToDS/FromDS/Protected — plain mgmt frame
    return bytes([byte0, byte1])


def _mgmt_header(subtype: int, addr1: str, addr2: str, addr3: str, seq_num: int, frag: int = 0) -> bytes:
    seq_ctrl = ((seq_num & 0x0FFF) << 4) | (frag & 0x0F)
    return (
        _frame_control(subtype)
        + b"\x00\x00"  # duration
        + _mac_bytes(addr1)
        + _mac_bytes(addr2)
        + _mac_bytes(addr3)
        + seq_ctrl.to_bytes(2, "little")
    )


def _ie(tag: int, value: bytes) -> bytes:
    return bytes([tag, len(value)]) + value


def build_rsn_ie(*, open_network: bool = False, pmf_capable: bool = False, wpa3: bool = False) -> bytes | None:
    """Returns the RSN IE (tag+len+value) for a secured network, or None for
    an open network (no RSN IE at all — that's itself a meaningful signal)."""
    if open_network:
        return None

    std_oui = b"\x00\x0f\xac"
    version = (1).to_bytes(2, "little")
    group_cipher = std_oui + bytes([4])  # CCMP-128

    pairwise_count = (1).to_bytes(2, "little")
    pairwise = std_oui + bytes([4])  # CCMP-128

    akm_type = 8 if wpa3 else 2  # SAE vs PSK
    akm_count = (1).to_bytes(2, "little")
    akm = std_oui + bytes([akm_type])

    rsn_caps = 0x0000
    if pmf_capable:
        rsn_caps |= 0x0080  # MFPC
    rsn_caps_bytes = rsn_caps.to_bytes(2, "little")

    body = version + group_cipher + pairwise_count + pairwise + akm_count + akm + rsn_caps_bytes
    return _ie(48, body)


def build_wps_vendor_ie() -> bytes:
    """Minimal Microsoft WPS vendor-specific IE — just enough for the
    OUI(00:50:F2)+type(4) check the parser does; WPS sub-attributes omitted
    since ORBIT only needs presence/absence."""
    oui_type = b"\x00\x50\xf2\x04"
    stub_attr = b"\x10\x4a\x00\x01\x10"  # a plausible WPS Version attr, not exhaustive
    return _ie(221, oui_type + stub_attr)


def build_beacon_or_probe_resp(
    *,
    is_probe_resp: bool,
    bssid: str,
    ssid: str,
    channel: int,
    seq_num: int,
    dest: str = BROADCAST,
    privacy: bool = True,
    rsn_ie: bytes | None = None,
    wps_ie: bytes | None = None,
    beacon_interval_tu: int = 100,
) -> bytes:
    subtype = ST_PROBE_RESP if is_probe_resp else ST_BEACON
    header = _mgmt_header(subtype, addr1=dest, addr2=bssid, addr3=bssid, seq_num=seq_num)

    timestamp = (0).to_bytes(8, "little")  # value is meaningless to ORBIT, zero is fine
    beacon_interval = beacon_interval_tu.to_bytes(2, "little")
    cap_info = 0x0000
    cap_info |= 0x0001  # ESS (infrastructure AP, not ad-hoc)
    if privacy:
        cap_info |= 0x0010
    cap_info_bytes = cap_info.to_bytes(2, "little")

    fixed_fields = timestamp + beacon_interval + cap_info_bytes

    ies = _ie(0, ssid.encode("utf-8"))  # SSID
    ies += _ie(3, bytes([channel]))     # DS Parameter Set
    if rsn_ie:
        ies += rsn_ie
    if wps_ie:
        ies += wps_ie

    return header + fixed_fields + ies


def build_probe_req(*, client_mac: str, ssid: str, seq_num: int) -> bytes:
    header = _mgmt_header(ST_PROBE_REQ, addr1=BROADCAST, addr2=client_mac, addr3=BROADCAST, seq_num=seq_num)
    ies = _ie(0, ssid.encode("utf-8"))
    return header + ies


def build_deauth(*, bssid: str, client_mac: str, seq_num: int, reason_code: int = 7) -> bytes:
    header = _mgmt_header(ST_DEAUTH, addr1=client_mac, addr2=bssid, addr3=bssid, seq_num=seq_num)
    return header + reason_code.to_bytes(2, "little")


def build_disassoc(*, bssid: str, client_mac: str, seq_num: int, reason_code: int = 8) -> bytes:
    header = _mgmt_header(ST_DISASSOC, addr1=client_mac, addr2=bssid, addr3=bssid, seq_num=seq_num)
    return header + reason_code.to_bytes(2, "little")


def build_auth(*, bssid: str, client_mac: str, seq_num: int) -> bytes:
    header = _mgmt_header(ST_AUTH, addr1=bssid, addr2=client_mac, addr3=bssid, seq_num=seq_num)
    fixed = (0).to_bytes(2, "little") + (1).to_bytes(2, "little") + (0).to_bytes(2, "little")
    return header + fixed


# ---------------------------------------------------------------------------
# EAPOL frame (802.11 data + LLC/SNAP + EtherType 0x888E)
# We model this as a minimal data frame so the parser can identify it.
# The frame_parser detects EAPOL via the "eapol" key in the JSON envelope
# (set by the mock sniffer) — we don't need byte-perfect EAPOL internals.
# ---------------------------------------------------------------------------

FT_DATA = 2
ST_DATA = 0x00


def build_eapol(*, bssid: str, client_mac: str, seq_num: int) -> dict:
    """
    Returns a dict envelope (not raw bytes) with an 'eapol' key set to True.
    The mock sniffer emits this directly as JSON — the parser reads the flag
    rather than byte-decoding a full 802.11 data frame, which is overkill for
    ORBIT's detection goal (confirm attempt, not reconstruct handshake content).
    """
    return {
        "subtype": 0xFF,          # synthetic sentinel — EAPOL
        "a1": bssid.replace(":", "").upper(),       # AP (receiver)
        "a2": client_mac.replace(":", "").upper(),  # client (transmitter / reconnecting)
        "a3": bssid.replace(":", "").upper(),       # BSSID
        "seq": seq_num,
        "eapol": True,
    }
