// Cores e efeitos da fita de LED (#40), sem dependência do Arduino, para serem
// testados no computador (test/test_led, pio test -e native). Quem escreve nos
// pinos é src/led.cpp. A tabela de cores está em docs/arena-protocol.md ("LED colors").
#pragma once

#include <stdint.h>

#include "arena_logic.h"  // ArenaState, ArenaStatus, EndReason

// Um estado da caixa = uma cor/efeito da fita.
enum class LedState : uint8_t { NotConnected, Connected, Ready, Running, Paused, Ended, Surrender };
constexpr uint8_t LED_STATE_COUNT = 7;  // mantenha em dia com o enum (test_state_count_matches_enum)

struct Rgb {
  uint8_t r, g, b;
  bool operator==(const Rgb& o) const { return r == o.r && g == o.g && b == o.b; }
  bool operator!=(const Rgb& o) const { return !(*this == o); }
};

// Cores, em brilho de 0 a 255 por canal. Cada estado acende uma mistura de canais
// (R, G, B) só dele, para não haver dois estados parecidos em nenhum brilho
// (test_states_never_share_a_hue). Ajuste aqui se na fita uma cor ficar puxada para outra.
namespace led_colors {
constexpr Rgb OFF = {0, 0, 0};
constexpr Rgb RED = {255, 0, 0};
constexpr Rgb GREEN = {0, 255, 0};
constexpr Rgb BLUE = {0, 0, 255};
constexpr Rgb WHITE = {255, 255, 255};
constexpr Rgb YELLOW = {255, 160, 0};
constexpr Rgb MAGENTA = {255, 0, 255};
constexpr Rgb CYAN = {0, 255, 255};
}  // namespace led_colors

// Tempos dos efeitos, em ms.
constexpr uint32_t LED_BLINK_MS = 500;   // pisca: 500 ms aceso, 500 ms apagado
constexpr uint32_t LED_STEP_MS = 1000;   // largada F1 do Preparar: 1 s por degrau

// Os 5 degraus da largada F1: 20%, 40%, 60%, 80% e 100% de brilho percebido.
// O olho não enxerga o brilho de forma linear, então cada degrau é corrigido
// (gama 2,2): 20% percebido é só ~3% de PWM.
constexpr uint8_t LED_F1_LEVELS[] = {7, 34, 83, 156, 255};
constexpr uint8_t LED_F1_STEPS = sizeof(LED_F1_LEVELS) / sizeof(LED_F1_LEVELS[0]);

// Um canal em `level`/255 do brilho, arredondado. Um canal aceso continua aceso
// (pelo menos 1) para o tom não mudar quando a cor é escurecida.
inline uint8_t scaledChannel(uint8_t value, uint8_t level) {
  if (value == 0 || level == 0) return 0;
  const uint8_t v = static_cast<uint8_t>((value * level + 127) / 255);
  return v ? v : 1;
}

inline Rgb scaled(Rgb c, uint8_t level) {
  return {scaledChannel(c.r, level), scaledChannel(c.g, level), scaledChannel(c.b, level)};
}

// Cor da fita `elapsedMs` depois de entrar no estado.
//   NotConnected  magenta piscando                                     (R+B)
//   Connected     ciano fixo                                           (G+B)
//   Ready         azul em 5 degraus (largada F1), 1 s cada, apaga 1 s   (B)
//   Running       verde fixo                                           (G)
//   Paused        amarelo fixo                                         (R+G)
//   Ended         branco piscando (bandeira quadriculada)              (R+G+B)
//   Surrender     vermelho fixo; o único estado com vermelho           (R)
inline Rgb ledColorAt(LedState state, uint32_t elapsedMs) {
  using namespace led_colors;
  const bool blinkOn = (elapsedMs / LED_BLINK_MS) % 2 == 0;
  switch (state) {
    case LedState::NotConnected:
      return blinkOn ? MAGENTA : OFF;
    case LedState::Connected:
      return CYAN;
    case LedState::Ready: {
      const uint32_t step = (elapsedMs / LED_STEP_MS) % (LED_F1_STEPS + 1);
      return step < LED_F1_STEPS ? scaled(BLUE, LED_F1_LEVELS[step]) : OFF;
    }
    case LedState::Running:
      return GREEN;
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
