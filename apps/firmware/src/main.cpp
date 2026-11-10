// Demonstração da camada de conexão (src/arena.h) e dos botões (src/buttons.h)
// enquanto display e LED não existem (#42): o LED da placa acende com a caixa
// conectada, digitar "a" ou "b" no monitor serial envia surrender do lado A ou B,
// e cada aperto dos botões físicos imprime "button: A" ou "button: B".
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"
#include "buttons.h"
#include "pins.h"

static void printState(const ArenaState& s) {
  Serial.printf("demo: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ONBOARD_LED, OUTPUT);
  delay(500);
  Serial.println("\nCrossliseu arena box");
  buttonsBegin();
  onArenaState(printState);
  arenaBegin();
}

void loop() {
  arenaLoop();
  digitalWrite(PIN_ONBOARD_LED, arenaConnected() ? HIGH : LOW);

  const Press press = pollButtons();
  if (press != Press::None) Serial.printf("button: %c\n", press == Press::A ? 'A' : 'B');

  while (Serial.available()) {
    const char c = toupper(Serial.read());
    if (c != 'A' && c != 'B') continue;
    const bool sent = arenaSendSurrender(c);
    Serial.printf("demo: surrender %c %s\n", c, sent ? "sent" : "dropped (not connected)");
  }
}
