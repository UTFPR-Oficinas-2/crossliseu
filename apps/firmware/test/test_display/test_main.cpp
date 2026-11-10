// Testes do texto dos LCDs (#39).
// Rodam no computador: pio test -e native
#include <limits.h>
#include <unity.h>

#include "display_text.h"

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

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_time_issue_examples);
  RUN_TEST(test_time_rounds_up);
  RUN_TEST(test_time_zero_or_negative);
  RUN_TEST(test_time_caps_at_99_59);
  RUN_TEST(test_line_centered);
  RUN_TEST(test_line_full_and_truncated);
  RUN_TEST(test_line_empty);
  RUN_TEST(test_line_removes_portuguese_accents);
  RUN_TEST(test_line_other_unicode_becomes_question_mark);
  RUN_TEST(test_line_control_chars_become_spaces);
  RUN_TEST(test_line_chars_the_lcd_rom_lacks);
  return UNITY_END();
}
