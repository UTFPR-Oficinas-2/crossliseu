// Testes do texto dos LCDs (#39).
// Rodam no computador: pio test -e native
#include <limits.h>
#include <unity.h>

#include "demo_clock.h"
#include "display_text.h"
#include "link_monitor.h"

void setUp() {}
void tearDown() {}

static void assertTime(const char* expected, long ms) {
  char out[6];
  formatTime(ms, out);
  TEST_ASSERT_EQUAL_STRING(expected, out);
}

static void assertLine(const char* expected, const char* text) {
  char out[LCD_COLS + 1];
  formatLine(text, out);
  TEST_ASSERT_EQUAL_STRING(expected, out);
}

// --- tempo -------------------------------------------------------------------

static void test_time_issue_examples() {
  assertTime("03:05", 185000);
  assertTime("01:35", 94210);
}

static void test_time_rounds_up() {
  assertTime("00:01", 1);
  assertTime("00:01", 1000);
  assertTime("00:02", 1001);
  assertTime("03:00", 180000);
  assertTime("03:00", 179001);  // 179,001 s -> 180 s
}

static void test_time_zero_or_negative() {
  assertTime("00:00", 0);
  assertTime("00:00", -1);
  assertTime("00:00", -60000);
}

static void test_time_caps_at_99_59() {
  assertTime("99:59", 99L * 60000 + 59000);
  assertTime("99:59", 100L * 60000);
  assertTime("99:59", 2000000000L);
  assertTime("99:59", LONG_MAX);  // sem estouro no arredondamento
}

// --- linhas ------------------------------------------------------------------

static void test_line_centered() {
  assertLine("     Paused     ", "Paused");
  assertLine("     03:05      ", "03:05");       // ímpar: sobra um espaço à direita
  assertLine(" TEMPO RESTANTE ", "TEMPO RESTANTE");
}

static void test_line_full_and_truncated() {
  assertLine("0123456789ABCDEF", "0123456789ABCDEF");
  assertLine("0123456789ABCDEF", "0123456789ABCDEFGHIJ");
}

static void test_line_empty() {
  assertLine("                ", "");
  assertLine("                ", nullptr);
}

static void test_line_removes_portuguese_accents() {
  assertLine("  DESISTENCIA   ", "DESISTÊNCIA");
  assertLine("      Acao      ", "Ação");
  assertLine("  SEM CONEXAO   ", "SEM CONEXÃO");
  assertLine(" aeiouc AEIOUC  ", "áéíóúç ÁÉÍÓÚÇ");
}

// Acento decomposto (letra + marca combinante, NFD): a marca some, sem '?' sobrando.
static void test_line_removes_decomposed_accents() {
  assertLine("       e        ", "e\xCC\x81");
  assertLine("  DESISTENCIA   ", "DESISTE\xCC\x82" "NCIA");
}

static void test_line_folds_extra_latin1_letters() {
  assertLine("      OoS       ", "\xC3\x98\xC3\xB8" "S");
  assertLine("       s        ", "\xC3\x9F");
}

static void test_line_other_unicode_becomes_question_mark() {
  assertLine("      A?B       ", "A\xF0\x9F\xA4\x96" "B");  // emoji de robô
  assertLine("      A?B       ", "A\xE2\x82\xAC" "B");      // euro
}

static void test_line_control_chars_become_spaces() {
  assertLine("      A  B      ", "A\t\nB");
}

// A ROM A00 do HD44780 troca a barra invertida por iene e '~' por seta; DEL é controle.
static void test_line_chars_the_lcd_rom_lacks() {
  assertLine("      A?B       ", "A\\B");
  assertLine("      A?B       ", "A~B");
  assertLine("      A B       ", "A\x7F" "B");
}

// --- ligação com o LCD --------------------------------------------------------

static void test_link_one_bad_poll_is_not_lost() {
  LinkMonitor m;
  TEST_ASSERT_FALSE(m.lost(false));
  TEST_ASSERT_FALSE(m.lost(true));
  TEST_ASSERT_FALSE(m.lost(false));  // a leitura boa zerou a contagem
}

static void test_link_two_bad_polls_in_a_row_is_lost() {
  LinkMonitor m;
  TEST_ASSERT_FALSE(m.lost(false));
  TEST_ASSERT_TRUE(m.lost(false));
}

// LCD que responde com o E em 1 voltou de um reset: não há o que debater.
static void test_link_reset_evidence_is_lost_at_once() {
  LinkMonitor m;
  TEST_ASSERT_TRUE(m.lost(false, true));
}

static void test_link_reset_clears_failures() {
  LinkMonitor m;
  m.lost(false);
  m.reset();
  TEST_ASSERT_FALSE(m.lost(false));
}

// --- contagem de teste (demo) --------------------------------------------------

static void test_demo_clock_counts_down() {
  DemoClock c(180000);
  c.start(1000);
  TEST_ASSERT_EQUAL_INT32(120000, c.remaining(61000));
}

static void test_demo_clock_pause_freezes() {
  DemoClock c(180000);
  c.start(1000);
  c.pause(61000);
  TEST_ASSERT_EQUAL_INT32(120000, c.remaining(999999));
}

static void test_demo_clock_start_after_pause_resumes() {
  DemoClock c(180000);
  c.start(1000);
  c.pause(61000);
  c.start(70000);
  TEST_ASSERT_EQUAL_INT32(110000, c.remaining(80000));
}

static void test_demo_clock_stop_clears_pause() {
  DemoClock c(180000);
  c.start(1000);
  c.pause(61000);
  c.stop();
  c.start(0);
  TEST_ASSERT_EQUAL_INT32(180000, c.remaining(0));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_demo_clock_counts_down);
  RUN_TEST(test_demo_clock_pause_freezes);
  RUN_TEST(test_demo_clock_start_after_pause_resumes);
  RUN_TEST(test_demo_clock_stop_clears_pause);
  RUN_TEST(test_link_one_bad_poll_is_not_lost);
  RUN_TEST(test_link_two_bad_polls_in_a_row_is_lost);
  RUN_TEST(test_link_reset_evidence_is_lost_at_once);
  RUN_TEST(test_link_reset_clears_failures);
  RUN_TEST(test_time_issue_examples);
  RUN_TEST(test_time_rounds_up);
  RUN_TEST(test_time_zero_or_negative);
  RUN_TEST(test_time_caps_at_99_59);
  RUN_TEST(test_line_centered);
  RUN_TEST(test_line_full_and_truncated);
  RUN_TEST(test_line_empty);
  RUN_TEST(test_line_removes_portuguese_accents);
  RUN_TEST(test_line_removes_decomposed_accents);
  RUN_TEST(test_line_folds_extra_latin1_letters);
  RUN_TEST(test_line_other_unicode_becomes_question_mark);
  RUN_TEST(test_line_control_chars_become_spaces);
  RUN_TEST(test_line_chars_the_lcd_rom_lacks);
  return UNITY_END();
}
