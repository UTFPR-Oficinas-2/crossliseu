// Botões de desistência (#41). Pinos e nível de "apertado" em src/pins.h; ligação em README.md ("Pins").
#include "buttons.h"

#include <Arduino.h>

#include "debouncer.h"
#include "pins.h"

namespace {

constexpr uint32_t DEBOUNCE_MS = 30;  // leitura estável por 30 ms para valer

Debouncer debounceA(DEBOUNCE_MS);
Debouncer debounceB(DEBOUNCE_MS);

// Apertos detectados e ainda não devolvidos por pollButtons().
bool pendingA = false;
bool pendingB = false;

bool readA() { return digitalRead(PIN_SURRENDER_A) == SURRENDER_A_PRESSED; }
bool readB() { return digitalRead(PIN_SURRENDER_B) == SURRENDER_B_PRESSED; }

}  // namespace

void buttonsBegin() {
  pinMode(PIN_SURRENDER_A, INPUT_PULLUP);
  pinMode(PIN_SURRENDER_B, INPUT_PULLUP);
  delayMicroseconds(100);  // tempo para o pull-up subir antes da primeira leitura

  // Primeira leitura: só aprende o estado inicial, não conta como aperto.
  const uint32_t now = millis();
  debounceA.update(readA(), now);
  debounceB.update(readB(), now);
}

Press pollButtons() {
  const uint32_t now = millis();
  if (debounceA.update(readA(), now)) pendingA = true;
  if (debounceB.update(readB(), now)) pendingB = true;

  // Se os dois lados apertarem no mesmo instante, devolve o A agora e o B na
  // próxima chamada: nenhum aperto se perde.
  if (pendingA) {
    pendingA = false;
    return Press::A;
  }
  if (pendingB) {
    pendingB = false;
    return Press::B;
  }
  return Press::None;
}
