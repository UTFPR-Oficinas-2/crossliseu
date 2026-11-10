// Decide quando um LCD está mesmo perdido. Um único erro de leitura no I2C
// (ruído) não basta: reiniciar o LCD apaga a tela e trava o loop() por ~60 ms.
// Sem dependência do Arduino, para testar no computador.
#pragma once

#include <stdint.h>

// Leituras ruins seguidas até dar o LCD por perdido.
constexpr uint8_t LINK_LOST_AFTER = 2;

struct LinkMonitor {
  uint8_t failures = 0;

  // pollOk: a última leitura do LCD foi boa. true quando ele deve ser dado por perdido.
  bool lost(bool pollOk) {
    if (pollOk) {
      failures = 0;
      return false;
    }
    if (failures < LINK_LOST_AFTER) failures++;
    return failures >= LINK_LOST_AFTER;
  }

  void reset() { failures = 0; }
};
