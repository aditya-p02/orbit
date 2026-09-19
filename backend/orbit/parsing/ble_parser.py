"""
ORBIT — BLE advertisement frame parser.

Parses raw BLE advertisement envelopes emitted by the mock sniffer
(and eventually by the real ESP32 BLE scanner) into a structured
ParsedBLEFrame object.

BLE envelope format (JSON line from sniffer):
    {
        "type":    "ble",
        "node":    "B",
        "addr":    "AA:BB:CC:DD:EE:FF",   # advertiser MAC (may be random/rotated)
        "rssi":    -72,                    # dBm
        "ts":      1234567890.123,         # ESP32 wall-clock seconds (optional)
        "name":    "iPhone",               # advertised local name (optional)
        "company": 76,                     # company ID from manufacturer data (optional)
        "raw":     "0201061AFF..."         # hex AD payload (optional)
    }

Usage:
    from orbit.parsing.ble_parser import parse_ble_frame
    frame = parse_ble_frame(envelope, laptop_recv_ts)
    if frame.parse_ok:
        print(frame.address, frame.rssi)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# Required fields for a valid BLE envelope
_REQUIRED = {"type", "addr", "rssi"}


@dataclass
class ParsedBLEFrame:
    """Structured result of parsing one BLE advertisement envelope."""

    # --- identity ---
    address: str            # advertiser MAC (normalized, uppercase, colon-separated)
    node_id: str            # which sniffer node saw this ("A" or "B")
    rssi: int               # signal strength in dBm

    # --- optional metadata ---
    name: str | None        # advertised local name (e.g. "Mi Smart Band")
    company_id: int | None  # manufacturer data company identifier (e.g. 76 = Apple)
    raw_hex: str | None     # full AD payload as hex string (for future use)

    # --- timestamps ---
    esp_ts: float | None        # timestamp from ESP32 clock (if present)
    laptop_recv_ts: float       # time this frame entered the pipeline (always set)

    # --- validity ---
    parse_ok: bool = True


def _normalize_mac(raw: str) -> str:
    """Normalize MAC to uppercase colon-separated form: AA:BB:CC:DD:EE:FF."""
    cleaned = raw.upper().replace("-", ":").replace(".", ":")
    # handle packed hex with no separators: AABBCCDDEEFF → AA:BB:CC:DD:EE:FF
    if ":" not in cleaned and len(cleaned) == 12:
        cleaned = ":".join(cleaned[i:i+2] for i in range(0, 12, 2))
    return cleaned


def parse_ble_frame(
    envelope: dict[str, Any],
    laptop_recv_ts: float,
) -> ParsedBLEFrame:
    """
    Parse a raw BLE advertisement envelope dict into a ParsedBLEFrame.
    Returns a frame with parse_ok=False on any error — never raises.
    """
    try:
        if not isinstance(envelope, dict):
            return _bad_frame(laptop_recv_ts, "envelope is not a dict")

        if not _REQUIRED.issubset(envelope.keys()):
            missing = _REQUIRED - envelope.keys()
            return _bad_frame(laptop_recv_ts, f"missing fields: {missing}")

        if envelope.get("type") != "ble":
            return _bad_frame(laptop_recv_ts, f"wrong type: {envelope.get('type')!r}")

        address = _normalize_mac(str(envelope["addr"]))
        node_id = str(envelope.get("node", "?"))

        try:
            rssi = int(envelope["rssi"])
        except (ValueError, TypeError):
            return _bad_frame(laptop_recv_ts, f"invalid rssi: {envelope['rssi']!r}")

        name = envelope.get("name")
        if name is not None:
            name = str(name).strip() or None

        company_id: int | None = None
        if "company" in envelope:
            try:
                company_id = int(envelope["company"])
            except (ValueError, TypeError):
                pass

        raw_hex: str | None = None
        if "raw" in envelope:
            raw_hex = str(envelope["raw"]).upper()

        esp_ts: float | None = None
        if "ts" in envelope:
            try:
                esp_ts = float(envelope["ts"])
            except (ValueError, TypeError):
                pass

        return ParsedBLEFrame(
            address=address,
            node_id=node_id,
            rssi=rssi,
            name=name,
            company_id=company_id,
            raw_hex=raw_hex,
            esp_ts=esp_ts,
            laptop_recv_ts=laptop_recv_ts,
            parse_ok=True,
        )

    except Exception as exc:
        return _bad_frame(laptop_recv_ts, f"unexpected error: {exc}")


def _bad_frame(laptop_recv_ts: float, reason: str = "") -> ParsedBLEFrame:
    return ParsedBLEFrame(
        address="",
        node_id="?",
        rssi=0,
        name=None,
        company_id=None,
        raw_hex=None,
        esp_ts=None,
        laptop_recv_ts=laptop_recv_ts,
        parse_ok=False,
    )
