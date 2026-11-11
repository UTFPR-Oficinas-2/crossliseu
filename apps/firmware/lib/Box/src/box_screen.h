// O que os LCDs mostram para cada estado da caixa (#42), sem dependência do
// Arduino, para ser testado no computador (test/test_box, pio test -e native).
// Telas combinadas em README.md ("LCD screens"); quem desenha é src/display.cpp.
#pragma once

#include <stdint.h>

#include "arena_logic.h"  // ArenaState, ArenaStatus, EndReason

// Uma tela: linha de cima (showMessage) e linha de baixo (showTime, ou vazia).
struct BoxScreen {
  const char* message;
  bool hasTime;  // false = linha de baixo vazia
  long timeMs;   // o que vai para showTime quando hasTime
};

// Tempo que falta na luta `now` (millis()): congelado no remainingMs do último
// state, ou descendo desde que ele chegou enquanto `ongoing`. Nunca negativo: no
// zero fica em 0 e a caixa espera o `finished` do servidor (docs/arena-protocol.md, "Timer").
inline long boxRemainingMs(const ArenaState& s, uint32_t now) {
  if (!s.hasRemaining || s.remainingMs <= 0) return 0;
  if (s.status != ArenaStatus::Ongoing) return s.remainingMs;
  // Subtração sem sinal: continua certa quando o millis() dá a volta (~49 dias).
  const uint32_t elapsed = static_cast<uint32_t>(now - s.receivedAtMs);
  if (elapsed >= static_cast<uint32_t>(s.remainingMs)) return 0;
  return s.remainingMs - static_cast<long>(elapsed);
}

// A tela para o último state (`connected` = arenaConnected()).
inline BoxScreen boxScreenFor(bool connected, const ArenaState& s, uint32_t now) {
  if (!connected) return {"SEM CONEXAO", false, 0};
  switch (s.status) {
    case ArenaStatus::Idle:
      return {"AGUARDANDO LUTA", false, 0};
    case ArenaStatus::Scheduled:
      return {"PREPARAR", true, boxRemainingMs(s, now)};
    case ArenaStatus::Ongoing:
      return {"TEMPO RESTANTE", true, boxRemainingMs(s, now)};
    case ArenaStatus::Paused:
      return {"PAUSADA", true, boxRemainingMs(s, now)};
    case ArenaStatus::Finished:
      switch (s.endReason) {
        case EndReason::TimeOut:
          return {"FIM DE TEMPO", true, 0};
        case EndReason::Surrender:
          return {"DESISTENCIA", true, boxRemainingMs(s, now)};
        default:
          return {"LUTA ENCERRADA", true, boxRemainingMs(s, now)};
      }
  }
  return {"AGUARDANDO LUTA", false, 0};
}
