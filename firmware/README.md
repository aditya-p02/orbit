# ORBIT Firmware — Phase 1

Two build environments, one shared library:

```
firmware/
├── platformio.ini
├── lib/orbit_common/       # shared capture + serial-output logic
│   ├── orbit_sniffer.h
│   └── orbit_sniffer.cpp
└── src/
    ├── main_node_a.cpp      # channel-hopping node
    └── main_node_b.cpp      # fixed-channel node
```

## What this does

Each node captures 802.11 **management frames only** (beacon, probe request/response, deauth, disassoc, auth), pulls out the cheap fields on-device (addresses, RSSI, channel, sequence number), and forwards the raw frame bytes (base64-encoded) over USB serial as one JSON line per event. **No Wi-Fi IE parsing happens on the ESP32** — that's deliberate, matching the design doc's sensor/brain split. Full parsing (SSID, RSN cipher suites, vendor tags, etc.) happens on the laptop in Phase 2, where CPU and RAM aren't a constraint.

Transport is USB serial, not Wi-Fi — this is what avoids the single-radio conflict between sniffing and uploading.

## Setup

1. Install [PlatformIO](https://platformio.org/) (VS Code extension, or CLI via `pip install platformio`)
2. Set `ORBIT_HOME_CHANNEL` in `src/main_node_b.cpp` to match whatever channel your test/demo network broadcasts on
3. Connect Node A's board, then:
   ```bash
   pio run -e node_a -t upload
   ```
4. Connect Node B's board, then:
   ```bash
   pio run -e node_b -t upload
   ```

## Testing (Phase 1 exit criteria)

With a node connected, open its serial monitor:

```bash
pio device monitor -e node_a
```

Turn on a phone's Wi-Fi near the node. You should see JSON lines appear, e.g.:

```json
{"node":"A","rssi":-52,"ch":6,"subtype":8,"seq":1841,"a1":"ffffffffffff","a2":"aabbccddeeff","a3":"aabbccddeeff","len":142,"data":"gAA...=="}
```

**Phase 1 is done when:** both nodes independently stream valid JSON for at least 10 minutes without crashing, hanging, or the queue silently starving (watch for gaps longer than a few seconds while a phone's Wi-Fi is actively nearby).

## Known constraints, on purpose

- **2.4GHz only** — standard ESP32-WROOM-32U hardware limit, not a firmware bug
- **Node A can't see every channel at once** — it hops; Node B's fixed channel is the mitigation for whatever Node A is missing at any given moment
- **Frames longer than 320 bytes are truncated** — covers a typical beacon with RSN/WPS/vendor IEs; if you find real captures getting cut off, raise `ORBIT_MAX_CAPTURE_LEN` in `orbit_sniffer.h` (costs more RAM per queued frame)
- **Dropped frames under heavy load are expected**, not a bug — the queue send is non-blocking by design so a flood can't stall the Wi-Fi driver

## A note on verification

This hasn't been compiled in a live PlatformIO/ESP-IDF environment here — I don't have network access to the Espressif toolchain from this sandbox. The `esp_wifi_*` calls and packet structure fields match the standard ESP-IDF API, but if you hit a compile error (most likely candidates: `wifi_promiscuous_filter_t` naming, or `esp_wifi.h` include path on your specific Arduino-ESP32 core version), paste the error and we'll fix it together.