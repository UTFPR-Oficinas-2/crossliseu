// Testes das telas dos LCDs para cada estado da caixa (#42).
// Rodam no computador: pio test -e native
#include <string.h>
#include <unity.h>

#include "box_screen.h"

void setUp() {}
void tearDown() {}

static ArenaState stateWith(ArenaStatus status, int32_t remainingMs, uint32_t receivedAtMs = 1000,
                            EndReason reason = EndReason::None) {
  ArenaState s;
  s.status = status;
  s.hasRemaining = true;
  s.remainingMs = remainingMs;
  s.receivedAtMs = receivedAtMs;
  s.endReason = reason;
  return s;
}

static void assertScreen(const char* message, bool hasTime, long timeMs, BoxScreen screen) {
  TEST_ASSERT_EQUAL_STRING(message, screen.message);
  TEST_ASSERT_EQUAL(hasTime, screen.hasTime);
  if (hasTime) TEST_ASSERT_EQUAL_INT32(timeMs, screen.timeMs);
}

// --- uma tela por estado ------------------------------------------------------

static void test_not_connected() {
  // Seja qual for o último state: sem conexão a caixa não sabe como a luta está.
  assertScreen("SEM CONEXAO", false, 0, boxScreenFor(false, stateWith(ArenaStatus::Ongoing, 90000), 2000));
}

static void test_idle() {
  ArenaState s;  // padrão: idle, sem tempo
  assertScreen("AGUARDANDO LUTA", false, 0, boxScreenFor(true, s, 5000));
}

static void test_scheduled_shows_the_match_length_frozen() {
  const ArenaState s = stateWith(ArenaStatus::Scheduled, 180000);
  assertScreen("PREPARAR", true, 180000, boxScreenFor(true, s, 1000));
  assertScreen("PREPARAR", true, 180000, boxScreenFor(true, s, 61000));  // não desce
}

static void test_ongoing_counts_down_from_the_state() {
  const ArenaState s = stateWith(ArenaStatus::Ongoing, 180000, 1000);
  assertScreen("TEMPO RESTANTE", true, 180000, boxScreenFor(true, s, 1000));
  assertScreen("TEMPO RESTANTE", true, 120000, boxScreenFor(true, s, 61000));
  assertScreen("TEMPO RESTANTE", true, 94210, boxScreenFor(true, s, 86790));
}

static void test_ongoing_stops_at_zero_and_waits_for_the_server() {
  const ArenaState s = stateWith(ArenaStatus::Ongoing, 5000, 1000);
  assertScreen("TEMPO RESTANTE", true, 0, boxScreenFor(true, s, 6000));
  assertScreen("TEMPO RESTANTE", true, 0, boxScreenFor(true, s, 600000));  // fica em 00:00, sem "FIM"
}

static void test_paused_is_frozen() {
  const ArenaState s = stateWith(ArenaStatus::Paused, 94210, 1000);
  assertScreen("PAUSADA", true, 94210, boxScreenFor(true, s, 300000));
}

static void test_finished_time_out() {
  const ArenaState s = stateWith(ArenaStatus::Finished, 0, 1000, EndReason::TimeOut);
  assertScreen("FIM DE TEMPO", true, 0, boxScreenFor(true, s, 2000));
}

static void test_finished_surrender_freezes_the_time_left() {
  const ArenaState s = stateWith(ArenaStatus::Finished, 61530, 1000, EndReason::Surrender);
  assertScreen("DESISTENCIA", true, 61530, boxScreenFor(true, s, 99000));
}

static void test_finished_manual() {
  const ArenaState s = stateWith(ArenaStatus::Finished, 42000, 1000, EndReason::Manual);
  assertScreen("LUTA ENCERRADA", true, 42000, boxScreenFor(true, s, 99000));
}

// --- tempo ----------------------------------------------------------------------

static void test_a_new_state_resyncs_the_countdown() {
  // Pausa em 01:35, retoma: o state novo (mesmo remainingMs, chegada nova) recomeça dali.
  const ArenaState resumed = stateWith(ArenaStatus::Ongoing, 95000, 500000);
  assertScreen("TEMPO RESTANTE", true, 95000, boxScreenFor(true, resumed, 500000));
  assertScreen("TEMPO RESTANTE", true, 85000, boxScreenFor(true, resumed, 510000));
}

static void test_no_remaining_is_zero() {
  ArenaState s = stateWith(ArenaStatus::Scheduled, 180000);
  s.hasRemaining = false;
  assertScreen("PREPARAR", true, 0, boxScreenFor(true, s, 1000));
}

static void test_countdown_survives_millis_wraparound() {
  const uint32_t arrived = 0xFFFFFFFFu - 1000;  // chegou 1 s antes do millis() dar a volta
  const ArenaState s = stateWith(ArenaStatus::Ongoing, 60000, arrived);
  assertScreen("TEMPO RESTANTE", true, 50000, boxScreenFor(true, s, arrived + 10000));  // já cruzou o zero
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_not_connected);
  RUN_TEST(test_idle);
  RUN_TEST(test_scheduled_shows_the_match_length_frozen);
  RUN_TEST(test_ongoing_counts_down_from_the_state);
  RUN_TEST(test_ongoing_stops_at_zero_and_waits_for_the_server);
  RUN_TEST(test_paused_is_frozen);
  RUN_TEST(test_finished_time_out);
  RUN_TEST(test_finished_surrender_freezes_the_time_left);
  RUN_TEST(test_finished_manual);
  RUN_TEST(test_a_new_state_resyncs_the_countdown);
  RUN_TEST(test_no_remaining_is_zero);
  RUN_TEST(test_countdown_survives_millis_wraparound);
  return UNITY_END();
}
