// Demonstração da camada de conexão (src/arena.h) enquanto display, LED e botões
// não existem (#42): o LED da placa (GPIO 25) acende com a caixa conectada, e
// digitar "a" ou "b" no monitor serial envia surrender do lado A ou B.
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"

static void printState(const ArenaState& s) {
  Serial.printf("demo: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  delay(500);
  Serial.println("\nCrossliseu arena box");
  onArenaState(printState);
  arenaBegin();
}

void loop() {
  arenaLoop();
  digitalWrite(LED_BUILTIN, arenaConnected() ? HIGH : LOW);

  while (Serial.available()) {
    const char c = toupper(Serial.read());
    if (c != 'A' && c != 'B') continue;
    const bool sent = arenaSendSurrender(c);
    Serial.printf("demo: surrender %c %s\n", c, sent ? "sent" : "dropped (not connected)");
  }
}
