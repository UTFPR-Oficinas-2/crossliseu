// Smoke test: proves the board builds, flashes and talks over serial.
// Blinks the Heltec's onboard LED and prints a heartbeat once a second.
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  delay(500);
  Serial.printf("\nCrossliseu arena box: %s rev %d, %d core(s), %u KB flash\n",
                ESP.getChipModel(), ESP.getChipRevision(), ESP.getChipCores(),
                ESP.getFlashChipSize() / 1024);
}

void loop() {
  static bool on = false;
  on = !on;
  digitalWrite(LED_BUILTIN, on);
  Serial.printf("alive %lus\n", millis() / 1000);
  delay(1000);
}
