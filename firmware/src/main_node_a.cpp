#include <Arduino.h>
#include "orbit_sniffer.h"

// Node A's job: sweep across the 2.4GHz channels for broad coverage.
// Node B (see main_node_b.cpp) stays parked on one fixed channel so nothing
// is ever missed on the channel that matters most during a demo — this two-
// node split is ORBIT's stated mitigation for the single-radio blind-spot
// limitation, not something left unaddressed.

// Channels 12-13 omitted: not part of India's permitted 2.4GHz Wi-Fi channel
// allocation, so real devices won't be on them anyway.
static const uint8_t kChannels[] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
static const uint8_t kNumChannels = sizeof(kChannels) / sizeof(kChannels[0]);

// Time spent on each channel before hopping. Shorter = broader coverage per
// second but shorter dwell on any one channel; tune this against how fast
// you need to catch a beacon (default beacon interval is ~100ms, so 300ms
// dwell should catch at least 2-3 beacons per visit under normal conditions).
static const uint16_t kDwellMs = 300;

static uint8_t s_channel_index = 0;
static uint32_t s_last_hop_ms = 0;

void setup() {
  Serial.begin(115200);
  delay(500);   // let the serial connection settle before the laptop starts reading

  orbit_sniffer_begin('A');
  orbit_sniffer_set_channel(kChannels[0]);
  s_last_hop_ms = millis();
}

void loop() {
  if (millis() - s_last_hop_ms >= kDwellMs) {
    s_channel_index = (s_channel_index + 1) % kNumChannels;
    orbit_sniffer_set_channel(kChannels[s_channel_index]);
    s_last_hop_ms = millis();
  }

  orbit_frame_event_t ev;
  while (orbit_sniffer_poll(ev)) {
    orbit_sniffer_emit(ev);
  }
}