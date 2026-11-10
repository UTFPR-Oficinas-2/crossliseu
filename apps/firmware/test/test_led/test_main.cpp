// Testes das cores e efeitos da fita de LED (#40).
// Rodam no computador: pio test -e native
#include <string.h>
#include <unity.h>

#include "led_pattern.h"

using namespace led_colors;

void setUp() {}
void tearDown() {}

static void assertRgb(Rgb expected, Rgb actual) {
  TEST_ASSERT_EQUAL_UINT8(expected.r, actual.r);
  TEST_ASSERT_EQUAL_UINT8(expected.g, actual.g);
  TEST_ASSERT_EQUAL_UINT8(expected.b, actual.b);
}

// --- cada estado -------------------------------------------------------------

static void test_not_connected_blinks_magenta() {
  assertRgb(MAGENTA, ledColorAt(LedState::NotConnected, 0));
  assertRgb(MAGENTA, ledColorAt(LedState::NotConnected, 499));
  assertRgb(OFF, ledColorAt(LedState::NotConnected, 500));
  assertRgb(OFF, ledColorAt(LedState::NotConnected, 999));
  assertRgb(MAGENTA, ledColorAt(LedState::NotConnected, 1000));
}

static void test_connected_is_solid_cyan() {
  const uint32_t times[] = {0, 999, 1000, 5000};
  for (uint32_t t : times) assertRgb(CYAN, ledColorAt(LedState::Connected, t));
}

static void test_ready_is_f1_start_in_blue() {
  Rgb previous = OFF;
  for (uint8_t step = 0; step < LED_F1_STEPS; step++) {  // 5 degraus, cada um mais forte
    const Rgb c = ledColorAt(LedState::Ready, step * 1000 + 500);
    assertRgb(scaled(BLUE, LED_F1_LEVELS[step]), c);
    TEST_ASSERT_TRUE(c.b > previous.b);
    previous = c;
  }
  assertRgb(BLUE, ledColorAt(LedState::Ready, 4500));  // último degrau = azul cheio
  assertRgb(OFF, ledColorAt(LedState::Ready, 5500));   // apaga 1 s
  assertRgb(scaled(BLUE, LED_F1_LEVELS[0]), ledColorAt(LedState::Ready, 6000));  // recomeça
}

static void test_solid_states() {
  const uint32_t times[] = {0, 400, 600, 123456};
  for (uint32_t t : times) {
    assertRgb(GREEN, ledColorAt(LedState::Running, t));
    assertRgb(YELLOW, ledColorAt(LedState::Paused, t));
    assertRgb(RED, ledColorAt(LedState::Surrender, t));
  }
}

static void test_ended_blinks_white() {
  assertRgb(WHITE, ledColorAt(LedState::Ended, 0));
  assertRgb(OFF, ledColorAt(LedState::Ended, 500));
  assertRgb(WHITE, ledColorAt(LedState::Ended, 1000));
  assertRgb(OFF, ledColorAt(LedState::Ended, 60500));  // continua piscando
}

static const LedState ALL_STATES[] = {LedState::NotConnected, LedState::Connected, LedState::Ready, LedState::Running,
                                      LedState::Paused,       LedState::Ended,     LedState::Surrender};

// Máscara dos canais acesos: 1 = R, 2 = G, 4 = B; 0 = apagado.
static uint8_t mask(Rgb c) { return (c.r ? 1 : 0) | (c.g ? 2 : 0) | (c.b ? 4 : 0); }

// Conjunto (bit m = máscara m) das máscaras acesas de um estado em 12 s.
static uint8_t masksOf(LedState state) {
  uint8_t set = 0;
  for (uint32_t t = 0; t < 12000; t += 50) {
    const uint8_t m = mask(ledColorAt(state, t));
    if (m) set |= 1 << m;
  }
  return set;
}

// Cada estado acende uma mistura de canais só dele: dá para distinguir num relance,
// em qualquer momento e em qualquer brilho.
static void test_states_never_share_a_hue() {
  for (LedState a : ALL_STATES) {
    for (LedState b : ALL_STATES) {
      if (a == b) continue;
      TEST_ASSERT_EQUAL_MESSAGE(0, masksOf(a) & masksOf(b), ledStateName(a));
    }
  }
}

// Vermelho (só R aceso) é só da desistência.
static void test_red_only_in_surrender() {
  for (LedState state : ALL_STATES) {
    if (state == LedState::Surrender) continue;
    TEST_ASSERT_EQUAL_MESSAGE(0, masksOf(state) & (1 << 1), ledStateName(state));
  }
}

static void test_scaled_keeps_hue() {
  assertRgb({7, 4, 1}, scaled({255, 128, 1}, 7));  // arredonda; canal aceso nunca vira 0
  assertRgb(OFF, scaled({255, 128, 1}, 0));
  assertRgb({255, 128, 1}, scaled({255, 128, 1}, 255));
}

static void test_state_count_matches_enum() {
  for (uint8_t i = 0; i < LED_STATE_COUNT; i++)
    TEST_ASSERT_NOT_EQUAL(0, strcmp("?", ledStateName(static_cast<LedState>(i))));
  TEST_ASSERT_EQUAL_STRING("?", ledStateName(static_cast<LedState>(LED_STATE_COUNT)));
}

// --- LedAnimator --------------------------------------------------------------

static void test_same_state_keeps_the_effect_going() {
  LedAnimator anim;
  assertRgb(MAGENTA, anim.update(LedState::NotConnected, 10000));
  assertRgb(OFF, anim.update(LedState::NotConnected, 10600));  // não recomeçou em 10600
  assertRgb(MAGENTA, anim.update(LedState::NotConnected, 11000));
}

static void test_new_state_restarts_the_effect() {
  LedAnimator anim;
  anim.update(LedState::Ready, 0);
  assertRgb(scaled(BLUE, LED_F1_LEVELS[2]), anim.update(LedState::Ready, 2500));  // degrau 3
  assertRgb(MAGENTA, anim.update(LedState::NotConnected, 2600));                  // pisca do início
  assertRgb(OFF, anim.update(LedState::NotConnected, 3200));
  assertRgb(scaled(BLUE, LED_F1_LEVELS[0]), anim.update(LedState::Ready, 3300));  // largada do degrau 1
}

static void test_animator_millis_wraparound() {
  LedAnimator anim;
  const uint32_t start = 0xFFFFFFFFu - 200;
  anim.update(LedState::NotConnected, start);
  assertRgb(OFF, anim.update(LedState::NotConnected, start + 600));  // cruza o zero
}

// --- ledStateFor ----------------------------------------------------------------

static ArenaState stateWith(ArenaStatus status, EndReason reason = EndReason::None) {
  ArenaState s;
  s.status = status;
  s.endReason = reason;
  return s;
}

static void test_led_state_for_each_server_state() {
  TEST_ASSERT_EQUAL(LedState::Connected, ledStateFor(true, stateWith(ArenaStatus::Idle)));
  TEST_ASSERT_EQUAL(LedState::Ready, ledStateFor(true, stateWith(ArenaStatus::Scheduled)));
  TEST_ASSERT_EQUAL(LedState::Running, ledStateFor(true, stateWith(ArenaStatus::Ongoing)));
  TEST_ASSERT_EQUAL(LedState::Paused, ledStateFor(true, stateWith(ArenaStatus::Paused)));
  TEST_ASSERT_EQUAL(LedState::Ended, ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::TimeOut)));
  TEST_ASSERT_EQUAL(LedState::Ended, ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::Manual)));
  TEST_ASSERT_EQUAL(LedState::Surrender, ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::Surrender)));
}

static void test_led_finished_null_reason_is_ended() {
  TEST_ASSERT_EQUAL(LedState::Ended, ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::None)));
}

// Correção do endReason (#57): um novo state finished com outro motivo troca a cor.
static void test_led_reason_correction_switches_to_surrender() {
  LedAnimator a;
  a.update(ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::Manual)), 0);
  const Rgb c = a.update(ledStateFor(true, stateWith(ArenaStatus::Finished, EndReason::Surrender)), 100);
  assertRgb(RED, c);
}

static void test_led_state_not_connected_wins() {
  TEST_ASSERT_EQUAL(LedState::NotConnected, ledStateFor(false, stateWith(ArenaStatus::Ongoing)));
  TEST_ASSERT_EQUAL(LedState::NotConnected,
                    ledStateFor(false, stateWith(ArenaStatus::Finished, EndReason::Surrender)));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_not_connected_blinks_magenta);
  RUN_TEST(test_connected_is_solid_cyan);
  RUN_TEST(test_ready_is_f1_start_in_blue);
  RUN_TEST(test_solid_states);
  RUN_TEST(test_ended_blinks_white);
  RUN_TEST(test_states_never_share_a_hue);
  RUN_TEST(test_red_only_in_surrender);
  RUN_TEST(test_scaled_keeps_hue);
  RUN_TEST(test_state_count_matches_enum);
  RUN_TEST(test_same_state_keeps_the_effect_going);
  RUN_TEST(test_new_state_restarts_the_effect);
  RUN_TEST(test_animator_millis_wraparound);
  RUN_TEST(test_led_state_for_each_server_state);
  RUN_TEST(test_led_finished_null_reason_is_ended);
  RUN_TEST(test_led_reason_correction_switches_to_surrender);
  RUN_TEST(test_led_state_not_connected_wins);
  return UNITY_END();
}
