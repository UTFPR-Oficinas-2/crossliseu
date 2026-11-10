// Testes da lógica pura do protocolo /arena (docs/arena-protocol.md).
// Rodam no computador: pio test -e native
#include <unity.h>
#include <ArduinoJson.h>
#include <string.h>
#include <string>
#include "arena_logic.h"

void setUp() {}
void tearDown() {}

// --- URL -------------------------------------------------------------------

static void test_url_wss_prod() {
  ServerUrl u;
  TEST_ASSERT_TRUE(parseServerUrl("wss://ediasv.dev/crossliseu/api/arena", u));
  TEST_ASSERT_TRUE(u.tls);
  TEST_ASSERT_EQUAL_STRING("ediasv.dev", u.host);
  TEST_ASSERT_EQUAL_UINT16(443, u.port);
  TEST_ASSERT_EQUAL_STRING("/crossliseu/api/arena", u.path);
}

static void test_url_ws_local() {
  ServerUrl u;
  TEST_ASSERT_TRUE(parseServerUrl("ws://192.168.0.10:3000/arena", u));
  TEST_ASSERT_FALSE(u.tls);
  TEST_ASSERT_EQUAL_STRING("192.168.0.10", u.host);
  TEST_ASSERT_EQUAL_UINT16(3000, u.port);
  TEST_ASSERT_EQUAL_STRING("/arena", u.path);
}

static void test_url_no_path() {
  ServerUrl u;
  TEST_ASSERT_TRUE(parseServerUrl("wss://example.org", u));
  TEST_ASSERT_EQUAL_STRING("example.org", u.host);
  TEST_ASSERT_EQUAL_UINT16(443, u.port);
  TEST_ASSERT_EQUAL_STRING("/", u.path);
}

static void test_url_invalid() {
  ServerUrl u;
  TEST_ASSERT_FALSE(parseServerUrl("http://x/arena", u));
  TEST_ASSERT_FALSE(parseServerUrl("", u));
  TEST_ASSERT_FALSE(parseServerUrl("wss://", u));
  TEST_ASSERT_FALSE(parseServerUrl("ws://h:99999/", u));
}

// --- Política de reconexão ---------------------------------------------------

static void test_retry_codes() {
  TEST_ASSERT_TRUE(retryForClose(4001) == Retry::Slow);
  TEST_ASSERT_TRUE(retryForClose(4004) == Retry::Slow);
  TEST_ASSERT_TRUE(retryForClose(4003) == Retry::Stop);
  const uint16_t backoff[] = {4002, 1000, 1001, 1006, 1011, 1013, 0};
  for (uint16_t c : backoff) TEST_ASSERT_TRUE_MESSAGE(retryForClose(c) == Retry::Backoff, "expected Backoff");
  TEST_ASSERT_EQUAL_UINT32(60000, SLOW_RETRY_MS);
}

static void test_retry_4003_is_stop() { TEST_ASSERT_TRUE(retryForClose(4003) == Retry::Stop); }

static void test_backoff_sequence() {
  Backoff b;
  const uint32_t expected[] = {1000, 2000, 4000, 8000, 16000, 30000, 30000};
  for (uint32_t e : expected) TEST_ASSERT_EQUAL_UINT32(e, b.next());
}

static void test_backoff_reset() {
  Backoff b;
  b.next();
  b.next();
  b.reset();
  TEST_ASSERT_EQUAL_UINT32(1000, b.next());
}

// --- Quadros do servidor -------------------------------------------------------

static FrameKind parse(const char* json, ArenaState& s, char* text, size_t cap) {
  return parseServerFrame(json, strlen(json), s, text, cap);
}

static void test_frame_welcome() {
  ArenaState s;
  char text[64] = "";
  TEST_ASSERT_TRUE(parse(R"({"event":"welcome","data":{"arenaName":"Arena 01"}})", s, text, sizeof text) == FrameKind::Welcome);
  TEST_ASSERT_EQUAL_STRING("Arena 01", text);
}

static void test_state_idle() {
  ArenaState s;
  strcpy(s.matchId, "stale");
  strcpy(s.robotA, "stale");
  s.hasRemaining = true;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"idle","matchId":null,"remainingMs":null,"endReason":null,"robots":null}})",
                         s, text, sizeof text) == FrameKind::State);
  TEST_ASSERT_TRUE(s.status == ArenaStatus::Idle);
  TEST_ASSERT_EQUAL_STRING("", s.matchId);
  TEST_ASSERT_FALSE(s.hasRemaining);
  TEST_ASSERT_EQUAL_STRING("", s.robotA);
  TEST_ASSERT_TRUE(s.endReason == EndReason::None);
}

static void test_state_ongoing() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"ongoing","matchId":"6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33","remainingMs":180000,"endReason":null,"robots":{"A":{"name":"Tritura"},"B":{"name":"Ferrugem"}}}})",
                         s, text, sizeof text) == FrameKind::State);
  TEST_ASSERT_TRUE(s.status == ArenaStatus::Ongoing);
  TEST_ASSERT_EQUAL_STRING("6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33", s.matchId);
  TEST_ASSERT_TRUE(s.hasRemaining);
  TEST_ASSERT_EQUAL_INT32(180000, s.remainingMs);
  TEST_ASSERT_EQUAL_STRING("Tritura", s.robotA);
  TEST_ASSERT_EQUAL_STRING("Ferrugem", s.robotB);
}

static void test_state_finished() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"finished","matchId":"6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33","remainingMs":61530,"endReason":"surrender","robots":{"A":{"name":"Tritura"},"B":{"name":"Ferrugem"}}}})",
                         s, text, sizeof text) == FrameKind::State);
  TEST_ASSERT_TRUE(s.status == ArenaStatus::Finished);
  TEST_ASSERT_EQUAL_INT32(61530, s.remainingMs);
  TEST_ASSERT_TRUE(s.endReason == EndReason::Surrender);
}

static void test_parses_manual_end_reason() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"finished","matchId":"m","remainingMs":5000,"endReason":"manual","robots":null}})",
                         s, text, sizeof text) == FrameKind::State);
  TEST_ASSERT_TRUE(s.endReason == EndReason::Manual);
}

static void test_rejects_old_names() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"running","matchId":null,"remainingMs":null,"endReason":null,"robots":null}})",
                         s, text, sizeof text) == FrameKind::Bad);
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"finished","matchId":"m","remainingMs":0,"endReason":"surrender_A","robots":null}})",
                         s, text, sizeof text) == FrameKind::Bad);
}

static void test_state_unknown_status() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"exploded","matchId":null,"remainingMs":null,"endReason":null,"robots":null}})",
                         s, text, sizeof text) == FrameKind::Bad);
}

static void test_state_long_name() {
  std::string name;
  for (int i = 0; i < 40; i++) name += "\xC3\xA9";  // "é", 2 bytes
  std::string json = R"({"event":"state","data":{"status":"scheduled","matchId":"m","remainingMs":1000,"endReason":null,"robots":{"A":{"name":")" +
                     name + R"("},"B":{"name":"x"}}}})";
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parseServerFrame(json.c_str(), json.size(), s, text, sizeof text) == FrameKind::State);
  std::string expected;
  for (int i = 0; i < 16; i++) expected += "\xC3\xA9";
  TEST_ASSERT_EQUAL_STRING(expected.c_str(), s.robotA);
  TEST_ASSERT_EQUAL_size_t(32, strlen(s.robotA));
}

static void test_state_long_name_odd_cut() {
  // 31 bytes ASCII + "é": cortar em 32 partiria o "é"; deve ficar só o ASCII.
  std::string name(31, 'a');
  name += "\xC3\xA9";
  std::string json = R"({"event":"state","data":{"status":"scheduled","matchId":"m","remainingMs":1000,"endReason":null,"robots":{"A":{"name":")" +
                     name + R"("},"B":{"name":"x"}}}})";
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parseServerFrame(json.c_str(), json.size(), s, text, sizeof text) == FrameKind::State);
  TEST_ASSERT_EQUAL_STRING(std::string(31, 'a').c_str(), s.robotA);
}

static void test_state_long_match_id() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"scheduled","matchId":"6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33X","remainingMs":1000,"endReason":null,"robots":null}})",
                         s, text, sizeof text) == FrameKind::Bad);
}

static void test_state_missing_data() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state"})", s, text, sizeof text) == FrameKind::Bad);
}

static void test_state_bad_not_applied() {
  // Um state inválido não pode alterar o último state válido.
  ArenaState s;
  strcpy(s.matchId, "keep");
  s.status = ArenaStatus::Ongoing;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"state","data":{"status":"exploded","matchId":"other"}})", s, text, sizeof text) == FrameKind::Bad);
  TEST_ASSERT_EQUAL_STRING("keep", s.matchId);
  TEST_ASSERT_TRUE(s.status == ArenaStatus::Ongoing);
}

static void test_frame_error() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"error","data":{"code":"surrender_rejected","message":"Match is paused"}})", s, text, sizeof text) == FrameKind::Error);
  TEST_ASSERT_EQUAL_STRING("surrender_rejected: Match is paused", text);
}

static void test_frame_unknown() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse(R"({"event":"pong","data":{}})", s, text, sizeof text) == FrameKind::Unknown);
}

static void test_frame_bad_json() {
  ArenaState s;
  char text[64];
  TEST_ASSERT_TRUE(parse("not json", s, text, sizeof text) == FrameKind::Bad);
  TEST_ASSERT_TRUE(parse(R"({"data":{}})", s, text, sizeof text) == FrameKind::Bad);
}

// --- Quadros da caixa ----------------------------------------------------------

static void test_hello() {
  char buf[256];
  size_t n = buildHello(buf, sizeof buf, "test-arena-861b", "abc");
  TEST_ASSERT_EQUAL_size_t(strlen(buf), n);
  JsonDocument d;
  TEST_ASSERT_FALSE(deserializeJson(d, buf, n));
  TEST_ASSERT_EQUAL_STRING("hello", d["event"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("test-arena-861b", d["data"]["deviceId"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("abc", d["data"]["token"].as<const char*>());
  TEST_ASSERT_TRUE(d["data"]["protocol"].is<int>());
  TEST_ASSERT_EQUAL_INT(1, d["data"]["protocol"].as<int>());
}

static void test_hello_too_small() {
  char buf[16];
  TEST_ASSERT_EQUAL_size_t(0, buildHello(buf, sizeof buf, "test-arena-861b", "abc"));
}

static void test_surrender() {
  char buf[128];
  size_t n = buildSurrender(buf, sizeof buf, 'B', "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33");
  TEST_ASSERT_TRUE(n > 0);
  JsonDocument d;
  TEST_ASSERT_FALSE(deserializeJson(d, buf, n));
  TEST_ASSERT_EQUAL_STRING("surrender", d["event"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("B", d["data"]["side"].as<const char*>());
  TEST_ASSERT_EQUAL_STRING("6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33", d["data"]["matchId"].as<const char*>());
}

static void test_surrender_null_match() {
  char buf[128];
  size_t n = buildSurrender(buf, sizeof buf, 'A', "");
  TEST_ASSERT_TRUE(n > 0);
  JsonDocument d;
  TEST_ASSERT_FALSE(deserializeJson(d, buf, n));
  TEST_ASSERT_EQUAL_STRING("A", d["data"]["side"].as<const char*>());
  TEST_ASSERT_TRUE(d["data"]["matchId"].isNull());
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"matchId\":null"));  // presente como null, não omitido
}

static void test_surrender_bad_side() {
  char buf[128];
  TEST_ASSERT_EQUAL_size_t(0, buildSurrender(buf, sizeof buf, 'C', ""));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_url_wss_prod);
  RUN_TEST(test_url_ws_local);
  RUN_TEST(test_url_no_path);
  RUN_TEST(test_url_invalid);
  RUN_TEST(test_retry_codes);
  RUN_TEST(test_retry_4003_is_stop);
  RUN_TEST(test_backoff_sequence);
  RUN_TEST(test_backoff_reset);
  RUN_TEST(test_frame_welcome);
  RUN_TEST(test_state_idle);
  RUN_TEST(test_state_ongoing);
  RUN_TEST(test_state_finished);
  RUN_TEST(test_parses_manual_end_reason);
  RUN_TEST(test_rejects_old_names);
  RUN_TEST(test_state_unknown_status);
  RUN_TEST(test_state_long_name);
  RUN_TEST(test_state_long_name_odd_cut);
  RUN_TEST(test_state_long_match_id);
  RUN_TEST(test_state_missing_data);
  RUN_TEST(test_state_bad_not_applied);
  RUN_TEST(test_frame_error);
  RUN_TEST(test_frame_unknown);
  RUN_TEST(test_frame_bad_json);
  RUN_TEST(test_hello);
  RUN_TEST(test_hello_too_small);
  RUN_TEST(test_surrender);
  RUN_TEST(test_surrender_null_match);
  RUN_TEST(test_surrender_bad_side);
  return UNITY_END();
}
