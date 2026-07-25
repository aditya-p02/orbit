#pragma once
#include <Arduino.h>

// Enough to cover a typical beacon's IEs (SSID, RSN, WPS, HT caps, vendor tags).
// Longer frames are truncated rather than dropped — the laptop still gets the
// header fields (addresses, RSSI, sequence number) even if the tail is cut.
#define ORBIT_MAX_CAPTURE_LEN 320

typedef struct {
  char     node_id;                 // 'A' or 'B' — which physical node captured this
  int8_t   rssi;
  uint8_t  channel;
  uint8_t  subtype;                 // raw 802.11 management frame subtype
  uint16_t seq_num;
  uint8_t  addr1[6];                // receiver / destination address
  uint8_t  addr2[6];                // transmitter / source address
  uint8_t  addr3[6];                // BSSID, for the frame types we capture
  uint16_t frame_len;                // bytes actually captured (<= ORBIT_MAX_CAPTURE_LEN)
  uint8_t  frame_data[ORBIT_MAX_CAPTURE_LEN];
} orbit_frame_event_t;

// IEEE 802.11 management frame subtype values — the ones ORBIT cares about.
#define ORBIT_SUBTYPE_PROBE_REQ   0x04
#define ORBIT_SUBTYPE_PROBE_RESP  0x05
#define ORBIT_SUBTYPE_BEACON      0x08
#define ORBIT_SUBTYPE_DISASSOC    0x0A
#define ORBIT_SUBTYPE_AUTH        0x0B
#define ORBIT_SUBTYPE_DEAUTH      0x0C

// Call once from setup(). node_id is 'A' or 'B' and gets stamped on every event
// this node emits, so the laptop side always knows which sensor saw what.
void orbit_sniffer_begin(char node_id);

// Non-blocking. Returns true and fills `out` if a captured frame was waiting.
// Call this repeatedly from loop() to drain the queue.
bool orbit_sniffer_poll(orbit_frame_event_t &out);

// Serializes one event as a single JSON line (raw frame bytes base64-encoded)
// and prints it to Serial. Full 802.11 IE parsing happens on the laptop —
// the firmware's only job is to capture and forward.
void orbit_sniffer_emit(const orbit_frame_event_t &ev);

// Switches the radio to a specific 2.4GHz channel (1-13). Safe to call from
// loop() for channel hopping.
void orbit_sniffer_set_channel(uint8_t channel);