// Debounce de um botão, sem dependência do Arduino, para ser testado no
// computador (test/test_buttons, pio test -e native). Os pinos ficam em src/pins.h.
#pragma once

#include <stdint.h>

class Debouncer {
 public:
  // stableMs: quanto tempo a leitura precisa ficar igual para valer.
  explicit Debouncer(uint32_t stableMs) : stableMs_(stableMs) {}

  // Chamar a cada loop com a leitura atual (true = apertado) e millis().
  // Devolve true uma única vez por aperto: na passagem solto -> apertado,
  // depois que a leitura ficou estável por stableMs. Segurar o botão, soltar
  // ou o ruído dos contatos (bounce) não devolvem nada.
  // A primeira chamada só aprende o estado inicial: um botão que já está
  // apertado no boot (ou um NC com o fio solto) não conta como aperto.
  bool update(bool pressed, uint32_t now) {
    if (!started_) {
      started_ = true;
      stable_ = raw_ = pressed;
      changedAt_ = now;
      return false;
    }
    if (pressed != raw_) {  // a leitura mudou: recomeça a contar o tempo
      raw_ = pressed;
      changedAt_ = now;
      return false;
    }
    // Subtração sem sinal: continua certa quando o millis() dá a volta (~49 dias).
    if (raw_ != stable_ && (uint32_t)(now - changedAt_) >= stableMs_) {
      stable_ = raw_;
      return stable_;  // true só na passagem para apertado
    }
    return false;
  }

  bool pressed() const { return stable_; }  // estado já filtrado

 private:
  uint32_t stableMs_;
  bool started_ = false;
  bool stable_ = false;  // último estado aceito
  bool raw_ = false;     // última leitura
  uint32_t changedAt_ = 0;
};
