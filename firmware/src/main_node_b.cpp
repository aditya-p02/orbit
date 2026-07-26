#include <Arduino.h>
#include "orbit_sniffer.h"

// Node B's job: stay locked on ONE channel — the one your demo/test network
// actually broadcasts on — so it never misses anything there, no matter where
// Node A is currently hopped to. Set this to match your test SSID's channel
// before flashing, and re-check it if you change the test network's channel.
#define ORBIT_HOME_CHANNEL 6

void setup() {
  Serial.begin(115200);
  delay(500);

  orbit_sniffer_begin('B');
  orbit_sniffer_set_channel(ORBIT_HOME_CHANNEL);
}

void loop() {
  orbit_frame_event_t ev;
  while (orbit_sniffer_poll(ev)) {
    orbit_sniffer_emit(ev);
  }
}