// Contagem regressiva da demonstração (comandos t/p no monitor serial) enquanto
// a integração (#42) não existe: conta, pausa e continua de onde parou.
// Sem dependência do Arduino, para testar no computador.
#pragma once

#include <stdint.h>

struct DemoClock {
  long totalMs;
  long remainingMs;  // tempo que falta quando parado (pausado ou ainda não iniciado)
  bool running = false;

  explicit DemoClock(long total) : totalMs(total), remainingMs(total) {}

  // Continua de onde a pausa parou; sem pausa, começa do total.
  void start(uint32_t nowMs) {
    if (running) return;
    if (remainingMs <= 0 || remainingMs >= totalMs) remainingMs = totalMs;
    startedAtMs = nowMs;
    running = true;
  }

  void pause(uint32_t nowMs) {
    if (!running) return;
    remainingMs = remaining(nowMs);
    running = false;
  }

  // Para e esquece a pausa: o próximo start() volta ao total.
  void stop() {
    running = false;
    remainingMs = totalMs;
  }

  long remaining(uint32_t nowMs) const {
    return running ? remainingMs - static_cast<long>(nowMs - startedAtMs) : remainingMs;
  }

 private:
  uint32_t startedAtMs = 0;
};
