#include "orbit_sniffer.h"
#include <WiFi.h>

extern "C" {
  #include "esp_wifi.h"
}
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <string.h>

// ---- internal state ----
static QueueHandle_t s_orbit_queue = nullptr;
static char s_node_id = '?';

// ---------------------------------------------------------------------------
// Minimal RFC 4648 base64 encoder. Written inline rather than pulling in an
// extra library dependency for one function — keeps the firmware self
// contained and easy to build with plain PlatformIO + Arduino framework.
// ---------------------------------------------------------------------------
static const char *kB64Table =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static size_t orbit_base64_encode(const uint8_t *data, size_t len, char *out, size_t out_cap) {
  size_t out_len = 0;
  size_t i = 0;
  while (i + 3 <= len && out_len + 4 <= out_cap) {
    uint32_t n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    out[out_len++] = kB64Table[(n >> 18) & 0x3F];
    out[out_len++] = kB64Table[(n >> 12) & 0x3F];
    out[out_len++] = kB64Table[(n >> 6) & 0x3F];
    out[out_len++] = kB64Table[n & 0x3F];
    i += 3;
  }
  size_t rem = len - i;
  if (rem == 1 && out_len + 4 <= out_cap) {
    uint32_t n = data[i] << 16;
    out[out_len++] = kB64Table[(n >> 18) & 0x3F];
    out[out_len++] = kB64Table[(n >> 12) & 0x3F];
    out[out_len++] = '=';
    out[out_len++] = '=';
  } else if (rem == 2 && out_len + 4 <= out_cap) {
    uint32_t n = (data[i] << 16) | (data[i + 1] << 8);
    out[out_len++] = kB64Table[(n >> 18) & 0x3F];
    out[out_len++] = kB64Table[(n >> 12) & 0x3F];
    out[out_len++] = kB64Table[(n >> 6) & 0x3F];
    out[out_len++] = '=';
  }
  out[out_len] = '\0';
  return out_len;
}

static void orbit_mac_to_hex(const uint8_t mac[6], char *out /* needs 13 bytes */) {
  static const char *hex = "0123456789abcdef";
  for (int i = 0; i < 6; i++) {
    out[i * 2]     = hex[(mac[i] >> 4) & 0xF];
    out[i * 2 + 1] = hex[mac[i] & 0xF];
  }
  out[12] = '\0';
}

// ---------------------------------------------------------------------------
// This runs in the Wi-Fi driver's task context, not a true hardware ISR, but
// it still must stay fast — no Serial printing, no heap allocation, no
// blocking. It copies the frame into a fixed-size struct and hands it off to
// a queue; the actual JSON/serial work happens later in loop().
// ---------------------------------------------------------------------------
static void orbit_promiscuous_cb(void *buf, wifi_promiscuous_pkt_type_t type) {
  if (type != WIFI_PKT_MGMT) return;   // driver-level filter already restricts to this, checked again defensively

  auto *pkt = (wifi_promiscuous_pkt_t *)buf;
  const uint8_t *payload = pkt->payload;
  uint16_t len = pkt->rx_ctrl.sig_len;

  if (len < 24) return;                // shorter than a minimal mgmt header — malformed/truncated, skip

  uint8_t ftype   = (payload[0] >> 2) & 0x03;
  uint8_t subtype = (payload[0] >> 4) & 0x0F;
  if (ftype != 0) return;              // 0 = management frame; that's all ORBIT cares about

  bool wanted = (subtype == ORBIT_SUBTYPE_PROBE_REQ  || subtype == ORBIT_SUBTYPE_PROBE_RESP ||
                 subtype == ORBIT_SUBTYPE_BEACON     || subtype == ORBIT_SUBTYPE_DISASSOC   ||
                 subtype == ORBIT_SUBTYPE_AUTH       || subtype == ORBIT_SUBTYPE_DEAUTH);
  if (!wanted) return;

  orbit_frame_event_t ev;
  ev.node_id = s_node_id;
  ev.rssi    = pkt->rx_ctrl.rssi;
  ev.channel = pkt->rx_ctrl.channel;
  ev.subtype = subtype;

  // Sequence Control field: low 4 bits = fragment number, top 12 bits = sequence
  // number. ORBIT only needs the sequence number (for continuity checks on the
  // laptop side), so the fragment bits are dropped here.
  uint16_t seq_ctrl = payload[22] | (payload[23] << 8);
  ev.seq_num = seq_ctrl >> 4;

  memcpy(ev.addr1, payload + 4, 6);
  memcpy(ev.addr2, payload + 10, 6);
  memcpy(ev.addr3, payload + 16, 6);

  uint16_t copy_len = (len > ORBIT_MAX_CAPTURE_LEN) ? ORBIT_MAX_CAPTURE_LEN : len;
  memcpy(ev.frame_data, payload, copy_len);
  ev.frame_len = copy_len;

  // Non-blocking send: if the queue is full, drop the frame rather than stall
  // the Wi-Fi driver. Under a genuine beacon/probe flood this will drop some
  // events — acceptable, since the detection logic only needs "a flood is
  // happening," not every single frame of it.
  xQueueSend(s_orbit_queue, &ev, 0);
}

void orbit_sniffer_begin(char node_id) {
  s_node_id = node_id;
  s_orbit_queue = xQueueCreate(12, sizeof(orbit_frame_event_t));

  WiFi.mode(WIFI_MODE_NULL);   // no STA/AP connection — pure listen mode, avoids the
                                // Wi-Fi-upload-while-sniffing conflict entirely

  // Driver-level filter: only management frames are handed to the callback at
  // all, so we're not paying the callback-invocation cost for every data frame
  // on a busy channel. (If your ESP32 Arduino core version doesn't expose
  // wifi_promiscuous_filter_t, comment this block out — the software check in
  // orbit_promiscuous_cb() above still filters correctly, just less efficiently.)
  wifi_promiscuous_filter_t filter;
  filter.filter_mask = WIFI_PROMIS_FILTER_MASK_MGMT;
  esp_wifi_set_promiscuous_filter(&filter);

  esp_wifi_set_promiscuous(true);
  esp_wifi_set_promiscuous_rx_cb(&orbit_promiscuous_cb);
}

void orbit_sniffer_set_channel(uint8_t channel) {
  esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
}

bool orbit_sniffer_poll(orbit_frame_event_t &out) {
  return xQueueReceive(s_orbit_queue, &out, 0) == pdTRUE;
}

void orbit_sniffer_emit(const orbit_frame_event_t &ev) {
  char a1[13], a2[13], a3[13];
  orbit_mac_to_hex(ev.addr1, a1);
  orbit_mac_to_hex(ev.addr2, a2);
  orbit_mac_to_hex(ev.addr3, a3);

  // base64 output is ~4/3 the input size; padding gives a little headroom.
  static char b64buf[(ORBIT_MAX_CAPTURE_LEN * 4) / 3 + 8];
  orbit_base64_encode(ev.frame_data, ev.frame_len, b64buf, sizeof(b64buf));

  Serial.printf(
      "{\"node\":\"%c\",\"rssi\":%d,\"ch\":%u,\"subtype\":%u,\"seq\":%u,"
      "\"a1\":\"%s\",\"a2\":\"%s\",\"a3\":\"%s\",\"len\":%u,\"data\":\"%s\"}\n",
      ev.node_id, ev.rssi, ev.channel, ev.subtype, ev.seq_num,
      a1, a2, a3, ev.frame_len, b64buf);
}