// Testes das cores e efeitos da fita de LED (#40).
// Rodam no computador: pio test -e native
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

static void test_connected_cycles_blue_green_red() {
  assertRgb(BLUE, ledColorAt(LedState::Connected, 0));
  assertRgb(BLUE, ledColorAt(LedState::Connected, 999));
  assertRgb(GREEN, ledColorAt(LedState::Connected, 1000));
  assertRgb(RED, ledColorAt(LedState::Connected, 2000));
  assertRgb(BLUE, ledColorAt(LedState::Connected, 3000));
  assertRgb(GREEN, ledColorAt(LedState::Connected, 3000 * 1000 + 1500));
}

static void test_ready_is_f1_start_in_pink() {
  Rgb previous = OFF;
  for (uint8_t step = 0; step < LED_F1_STEPS; step++) {  // 5 degraus, cada um mais forte
    const Rgb c = ledColorAt(LedState::Ready, step * 1000 + 500);
    assertRgb(scaled(PINK, LED_F1_LEVELS[step]), c);
    TEST_ASSERT_TRUE(c.r > previous.r);
    previous = c;
  }
  assertRgb(PINK, ledColorAt(LedState::Ready, 4500));  // último degrau = rosa cheio
  assertRgb(OFF, ledColorAt(LedState::Ready, 5500));   // apaga 1 s
  assertRgb(scaled(PINK, LED_F1_LEVELS[0]), ledColorAt(LedState::Ready, 6000));  // recomeça
}

static void test_solid_states() {
  const uint32_t times[] = {0, 400, 600, 123456};
  for (uint32_t t : times) {
    assertRgb(WHITE, ledColorAt(LedState::Running, t));
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

// Cada estado tem de dar para distinguir: nenhum par tem a mesma sequência de cores.
static void test_states_are_all_different() {
  const LedState states[] = {LedState::NotConnected, LedState::Connected, LedState::Ready, LedState::Running,
                             LedState::Paused,       LedState::Ended,     LedState::Surrender};
  for (LedState a : states) {
    for (LedState b : states) {
      if (a == b) continue;
      bool differs = false;
      for (uint32_t t = 0; t < 12000 && !differs; t += 250) differs = ledColorAt(a, t) != ledColorAt(b, t);
      TEST_ASSERT_TRUE_MESSAGE(differs, ledStateName(a));
    }
  }
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
  anim.update(LedState::Connected, 0);
  assertRgb(RED, anim.update(LedState::Connected, 2500));
  assertRgb(scaled(PINK, LED_F1_LEVELS[0]), anim.update(LedState::Ready, 2600));  // degrau 1
  assertRgb(scaled(PINK, LED_F1_LEVELS[1]), anim.update(LedState::Ready, 3600));  // degrau 2
  assertRgb(BLUE, anim.update(LedState::Connected, 3700));  // ciclo recomeça no azul
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
  TEST_ASSERT_EQUAL(LedState::Ready, ledStateFor(true, stateWith(ArenaStatus::Ready)));
  TEST_ASSERT_EQUAL(LedState::Running, ledStateFor(true, stateWith(ArenaStatus::Running)));
  TEST_ASSERT_EQUAL(LedState::Paused, ledStateFor(true, stateWith(ArenaStatus::Paused)));
  TEST_ASSERT_EQUAL(LedState::Ended, ledStateFor(true, stateWith(ArenaStatus::Ended, EndReason::TimeOut)));
  TEST_ASSERT_EQUAL(LedState::Ended, ledStateFor(true, stateWith(ArenaStatus::Ended, EndReason::OperatorEnded)));
  TEST_ASSERT_EQUAL(LedState::Surrender, ledStateFor(true, stateWith(ArenaStatus::Ended, EndReason::SurrenderA)));
  TEST_ASSERT_EQUAL(LedState::Surrender, ledStateFor(true, stateWith(ArenaStatus::Ended, EndReason::SurrenderB)));
}

static void test_led_state_not_connected_wins() {
  TEST_ASSERT_EQUAL(LedState::NotConnected, ledStateFor(false, stateWith(ArenaStatus::Running)));
  TEST_ASSERT_EQUAL(LedState::NotConnected,
                    ledStateFor(false, stateWith(ArenaStatus::Ended, EndReason::SurrenderA)));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_not_connected_blinks_magenta);
  RUN_TEST(test_connected_cycles_blue_green_red);
  RUN_TEST(test_ready_is_f1_start_in_pink);
  RUN_TEST(test_solid_states);
  RUN_TEST(test_ended_blinks_white);
  RUN_TEST(test_states_are_all_different);
  RUN_TEST(test_same_state_keeps_the_effect_going);
  RUN_TEST(test_new_state_restarts_the_effect);
  RUN_TEST(test_animator_millis_wraparound);
  RUN_TEST(test_led_state_for_each_server_state);
  RUN_TEST(test_led_state_not_connected_wins);
  return UNITY_END();
}
