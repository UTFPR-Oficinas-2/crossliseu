// Cores e efeitos da fita de LED (#40), sem dependência do Arduino, para serem
// testados no computador (test/test_led, pio test -e native). Quem escreve nos
// pinos é src/led.cpp. A tabela de cores está em docs/arena-protocol.md ("LED colors").
#pragma once

#include <stdint.h>

#include "arena_logic.h"  // ArenaState, ArenaStatus, EndReason

// Um estado da caixa = uma cor/efeito da fita.
enum class LedState : uint8_t { NotConnected, Connected, Ready, Running, Paused, Ended, Surrender };

struct Rgb {
  uint8_t r, g, b;
  bool operator==(const Rgb& o) const { return r == o.r && g == o.g && b == o.b; }
  bool operator!=(const Rgb& o) const { return !(*this == o); }
};

// Cores, em brilho de 0 a 255 por canal. Ajuste aqui se na fita uma cor ficar
// puxada para outra (por exemplo, se o rosa e o magenta ficarem parecidos).
namespace led_colors {
constexpr Rgb OFF = {0, 0, 0};
constexpr Rgb RED = {255, 0, 0};
constexpr Rgb GREEN = {0, 255, 0};
constexpr Rgb BLUE = {0, 0, 255};
constexpr Rgb WHITE = {255, 255, 255};
constexpr Rgb YELLOW = {255, 160, 0};
constexpr Rgb MAGENTA = {255, 0, 255};
constexpr Rgb PINK = {255, 20, 70};
}  // namespace led_colors

// Tempos dos efeitos, em ms.
constexpr uint32_t LED_BLINK_MS = 500;   // pisca: 500 ms aceso, 500 ms apagado
constexpr uint32_t LED_CYCLE_MS = 1000;  // ciclo da arena livre: troca de cor a cada 1 s
constexpr uint32_t LED_STEP_MS = 1000;   // largada F1 do Preparar: 1 s por degrau

// Os 5 degraus da largada F1: 20%, 40%, 60%, 80% e 100% de brilho percebido.
// O olho não enxerga o brilho de forma linear, então cada degrau é corrigido
// (gama 2,2): 20% percebido é só ~3% de PWM.
constexpr uint8_t LED_F1_LEVELS[] = {7, 34, 83, 156, 255};
constexpr uint8_t LED_F1_STEPS = sizeof(LED_F1_LEVELS) / sizeof(LED_F1_LEVELS[0]);

inline Rgb scaled(Rgb c, uint8_t level) {
  return {static_cast<uint8_t>(c.r * level / 255), static_cast<uint8_t>(c.g * level / 255),
          static_cast<uint8_t>(c.b * level / 255)};
}

// Cor da fita `elapsedMs` depois de entrar no estado.
//   NotConnected  magenta piscando
//   Connected     azul -> verde -> vermelho, trocando a cada 1 s
//   Ready         rosa em 5 degraus (largada F1), 1 s cada, apaga 1 s e recomeça
//   Running       branco fixo
//   Paused        amarelo fixo
//   Surrender     vermelho fixo
//   Ended         branco piscando (bandeira quadriculada), até o operador fechar a luta
inline Rgb ledColorAt(LedState state, uint32_t elapsedMs) {
  using namespace led_colors;
  const bool blinkOn = (elapsedMs / LED_BLINK_MS) % 2 == 0;
  switch (state) {
    case LedState::NotConnected:
      return blinkOn ? MAGENTA : OFF;
    case LedState::Connected: {
      static constexpr Rgb CYCLE[] = {BLUE, GREEN, RED};
      return CYCLE[(elapsedMs / LED_CYCLE_MS) % 3];
    }
    case LedState::Ready: {
      const uint32_t step = (elapsedMs / LED_STEP_MS) % (LED_F1_STEPS + 1);
      return step < LED_F1_STEPS ? scaled(PINK, LED_F1_LEVELS[step]) : OFF;
    }
    case LedState::Running:
      return WHITE;
    case LedState::Paused:
      return YELLOW;
    case LedState::Surrender:
      return RED;
    case LedState::Ended:
      return blinkOn ? WHITE : OFF;
  }
  return OFF;
}

// Guarda quando o estado começou, para o efeito continuar sem recomeçar
// enquanto o estado é o mesmo e recomeçar do início quando ele muda.
class LedAnimator {
 public:
  Rgb update(LedState state, uint32_t now) {
    if (!started_ || state != state_) {
      started_ = true;
      state_ = state;
      since_ = now;
    }
    // Subtração sem sinal: continua certa quando o millis() dá a volta (~49 dias).
    return ledColorAt(state_, static_cast<uint32_t>(now - since_));
  }

 private:
  bool started_ = false;
  LedState state_ = LedState::NotConnected;
  uint32_t since_ = 0;
};

// O estado da fita para o que o servidor mandou (docs/arena-protocol.md, "Statuses").
// Sem conexão (antes do welcome) vale NotConnected, seja qual for o último state.
inline LedState ledStateFor(bool connected, const ArenaState& s) {
  if (!connected) return LedState::NotConnected;
  switch (s.status) {
    case ArenaStatus::Idle:
      return LedState::Connected;
    case ArenaStatus::Scheduled:
      return LedState::Ready;
    case ArenaStatus::Ongoing:
      return LedState::Running;
    case ArenaStatus::Paused:
      return LedState::Paused;
    case ArenaStatus::Finished:
      return s.endReason == EndReason::Surrender ? LedState::Surrender : LedState::Ended;
  }
  return LedState::Connected;
}

inline const char* ledStateName(LedState state) {
  switch (state) {
    case LedState::NotConnected: return "NotConnected";
    case LedState::Connected: return "Connected";
    case LedState::Ready: return "Ready";
    case LedState::Running: return "Running";
    case LedState::Paused: return "Paused";
    case LedState::Ended: return "Ended";
    case LedState::Surrender: return "Surrender";
  }
  return "?";
}
