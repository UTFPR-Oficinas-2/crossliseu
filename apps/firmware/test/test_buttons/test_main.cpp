// Testes do debounce dos botões de desistência (#41).
// Rodam no computador: pio test -e native
#include <unity.h>

#include "debouncer.h"

void setUp() {}
void tearDown() {}

static const uint32_t MS = 30;  // o mesmo DEBOUNCE_MS de src/buttons.cpp

// Mantém a leitura em `pressed` de `from` até `to` (inclusive), de 1 em 1 ms,
// e conta quantas vezes update() devolveu true.
static int hold(Debouncer& d, bool pressed, uint32_t from, uint32_t to) {
  int presses = 0;
  for (uint32_t t = from; t <= to; t++) presses += d.update(pressed, t) ? 1 : 0;
  return presses;
}

static void test_clean_press_counts_once() {
  Debouncer d(MS);
  TEST_ASSERT_EQUAL(0, hold(d, false, 0, 100));
  TEST_ASSERT_EQUAL(1, hold(d, true, 101, 200));
  TEST_ASSERT_TRUE(d.pressed());
}

static void test_press_is_reported_after_stable_time() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  TEST_ASSERT_EQUAL(0, hold(d, true, 101, 100 + MS));      // ainda não ficou estável
  TEST_ASSERT_TRUE(d.update(true, 101 + MS));               // agora sim
}

static void test_holding_counts_once() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  TEST_ASSERT_EQUAL(1, hold(d, true, 101, 10000));  // 10 s segurando
}

static void test_release_counts_nothing() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  hold(d, true, 101, 300);
  TEST_ASSERT_EQUAL(0, hold(d, false, 301, 600));
  TEST_ASSERT_FALSE(d.pressed());
}

static void test_bounce_on_press_counts_once() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  int presses = 0;
  // 10 ms de contato pulando a cada 1 ms, depois firme
  for (uint32_t t = 101; t <= 110; t++) presses += d.update(t % 2 == 0, t) ? 1 : 0;
  presses += hold(d, true, 111, 300);
  TEST_ASSERT_EQUAL(1, presses);
}

static void test_bounce_on_release_counts_nothing() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  hold(d, true, 101, 300);
  int presses = 0;
  for (uint32_t t = 301; t <= 310; t++) presses += d.update(t % 2 == 0, t) ? 1 : 0;
  presses += hold(d, false, 311, 600);
  TEST_ASSERT_EQUAL(0, presses);
}

static void test_short_glitch_is_ignored() {
  Debouncer d(MS);
  hold(d, false, 0, 100);
  TEST_ASSERT_EQUAL(0, hold(d, true, 101, 100 + MS - 1));  // pico mais curto que MS
  TEST_ASSERT_EQUAL(0, hold(d, false, 100 + MS, 300));
}

static void test_ten_presses_count_ten() {
  Debouncer d(MS);
  int presses = hold(d, false, 0, 100);
  uint32_t t = 101;
  for (int i = 0; i < 10; i++) {
    presses += hold(d, true, t, t + 150);
    presses += hold(d, false, t + 151, t + 300);
    t += 301;
  }
  TEST_ASSERT_EQUAL(10, presses);
}

static void test_pressed_at_boot_is_not_a_press() {
  Debouncer d(MS);
  TEST_ASSERT_EQUAL(0, hold(d, true, 0, 500));  // apertado (ou NC solto) desde o boot
  TEST_ASSERT_EQUAL(0, hold(d, false, 501, 700));
  TEST_ASSERT_EQUAL(1, hold(d, true, 701, 900));  // o próximo aperto conta
}

static void test_millis_wraparound() {
  Debouncer d(MS);
  const uint32_t start = 0xFFFFFFFFu - 100;
  for (uint32_t i = 0; i <= 50; i++) d.update(false, start + i);
  int presses = 0;
  for (uint32_t i = 51; i <= 200; i++) presses += d.update(true, start + i) ? 1 : 0;  // cruza o zero
  TEST_ASSERT_EQUAL(1, presses);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_clean_press_counts_once);
  RUN_TEST(test_press_is_reported_after_stable_time);
  RUN_TEST(test_holding_counts_once);
  RUN_TEST(test_release_counts_nothing);
  RUN_TEST(test_bounce_on_press_counts_once);
  RUN_TEST(test_bounce_on_release_counts_nothing);
  RUN_TEST(test_short_glitch_is_ignored);
  RUN_TEST(test_ten_presses_count_ten);
  RUN_TEST(test_pressed_at_boot_is_not_a_press);
  RUN_TEST(test_millis_wraparound);
  return UNITY_END();
}
