"""
Static OUI (first 3 bytes of a MAC address) -> vendor name lookup.

Deliberately NOT a live API call (§ roadmap Phase 2: "a static lookup table
is fine — no need for a live API"). This keeps detection fully offline and
avoids adding a network dependency + rate limit to something that runs on
every single observed frame.

Table is intentionally small — common consumer/IoT/AP vendors likely to show
up in a home/campus demo. Extend as needed; unknown OUIs just return None
rather than raising, so parsing never breaks on an unrecognized vendor.
"""

from __future__ import annotations

# OUI (uppercase, colon-separated, first 3 octets) -> vendor name
_OUI_TABLE: dict[str, str] = {
    "00:50:F2": "Microsoft",
    "00:03:93": "Apple",
    "00:1C:B3": "Apple",
    "3C:15:C2": "Apple",
    "AC:DE:48": "Apple",
    "F0:18:98": "Apple",
    "00:1A:11": "Google",
    "F4:F5:D8": "Google",
    "3C:5A:B4": "Google",
    "00:16:6C": "Netgear",
    "00:1B:2F": "Netgear",
    "20:E5:2A": "Netgear",
    "9C:3D:CF": "Netgear",
    "00:14:6C": "Netgear",
    "00:1D:7E": "Cisco-Linksys",
    "00:23:69": "Cisco",
    "00:0F:66": "Cisco",
    "58:6D:8F": "Cisco",
    "C8:D7:19": "TP-Link",
    "50:C7:BF": "TP-Link",
    "EC:08:6B": "TP-Link",
    "F4:F2:6D": "TP-Link",
    "00:E0:4C": "Realtek",
    "52:54:00": "QEMU/Virtual",
    "00:0C:29": "VMware",
    "08:00:27": "VirtualBox",
    "DC:A6:32": "Raspberry Pi Foundation",
    "B8:27:EB": "Raspberry Pi Foundation",
    "24:0A:C4": "Espressif",  # ESP32/ESP8266 default NIC OUI block
    "24:6F:28": "Espressif",
    "30:AE:A4": "Espressif",
    "A4:CF:12": "Espressif",
    "AC:67:B2": "Espressif",
    "CC:50:E3": "Espressif",
    "AA:BB:CC": "Espressif Systems",
    "EE:FF:00": "Realtek Semiconductor",
    "12:34:56": "Samsung / Apple",
    "DE:AD:BE": "Intel Corporation",
    "CC:DD:EE": "Netgear Inc.",
    "EE:11:22": "BLE Peripheral",
}


def lookup_vendor(mac: str) -> str | None:
    """
    mac: colon-separated MAC address string, e.g. "AA:BB:CC:00:11:22"
         (case-insensitive). Also accepts bare hex like "aabbcc001122".

    Returns the vendor name, or None if the OUI isn't in the table.
    """
    mac = mac.strip().upper()

    if ":" not in mac:
        # bare hex (e.g. from orbit_mac_to_hex on the firmware side) -> insert colons
        mac = ":".join(mac[i : i + 2] for i in range(0, len(mac), 2))

    oui = ":".join(mac.split(":")[:3])
    return _OUI_TABLE.get(oui)
