#include "arena_logic.h"

#include <ArduinoJson.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

namespace {

// Copia src para dst (capacidade cap, com o '\0'); se não couber, corta antes
// de um byte de continuação UTF-8 (10xxxxxx) para não deixar caractere partido.
void copyUtf8(char* dst, size_t cap, const char* src) {
  if (cap == 0) return;
  size_t n = strlen(src);
  if (n >= cap) {
    n = cap - 1;
    while (n > 0 && (static_cast<unsigned char>(src[n]) & 0xC0) == 0x80) n--;
  }
  memcpy(dst, src, n);
  dst[n] = '\0';
}

bool parseStatus(const char* s, ArenaStatus& out) {
  if (!s) return false;
  if (!strcmp(s, "idle")) out = ArenaStatus::Idle;
  else if (!strcmp(s, "scheduled")) out = ArenaStatus::Scheduled;
  else if (!strcmp(s, "ongoing")) out = ArenaStatus::Ongoing;
  else if (!strcmp(s, "paused")) out = ArenaStatus::Paused;
  else if (!strcmp(s, "finished")) out = ArenaStatus::Finished;
  else return false;
  return true;
}

bool parseEndReason(const char* s, EndReason& out) {
  if (!strcmp(s, "time_out")) out = EndReason::TimeOut;
  else if (!strcmp(s, "manual")) out = EndReason::Manual;
  else if (!strcmp(s, "surrender")) out = EndReason::Surrender;
  else return false;
  return true;
}

// Campos ausentes são tratados como null; tipos errados invalidam o quadro.
bool parseState(JsonObjectConst data, ArenaState& out) {
  ArenaState s;
  if (!parseStatus(data["status"].as<const char*>(), s.status)) return false;

  JsonVariantConst matchId = data["matchId"];
  if (!matchId.isNull()) {
    if (!matchId.is<const char*>()) return false;
    const char* id = matchId.as<const char*>();
    if (strlen(id) >= sizeof s.matchId) return false;  // cortar o id faria o surrender cair em outra partida
    strcpy(s.matchId, id);
  }

  JsonVariantConst remaining = data["remainingMs"];
  if (!remaining.isNull()) {
    if (!remaining.is<int32_t>()) return false;
    s.hasRemaining = true;
    s.remainingMs = remaining.as<int32_t>();
  }

  JsonVariantConst endReason = data["endReason"];
  if (!endReason.isNull()) {
    if (!endReason.is<const char*>() || !parseEndReason(endReason.as<const char*>(), s.endReason)) return false;
  }

  JsonVariantConst robots = data["robots"];
  if (!robots.isNull()) {
    if (!robots.is<JsonObjectConst>()) return false;
    copyUtf8(s.robotA, sizeof s.robotA, robots["A"]["name"] | "");
    copyUtf8(s.robotB, sizeof s.robotB, robots["B"]["name"] | "");
  }

  out = s;
  return true;
}

size_t serializeIfFits(JsonDocument& doc, char* buf, size_t cap) {
  if (measureJson(doc) + 1 > cap) return 0;
  return serializeJson(doc, buf, cap);
}

}  // namespace

bool parseServerUrl(const char* url, ServerUrl& out) {
  if (!url) return false;
  const char* rest;
  if (!strncmp(url, "wss://", 6)) {
    out.tls = true;
    out.port = 443;
    rest = url + 6;
  } else if (!strncmp(url, "ws://", 5)) {
    out.tls = false;
    out.port = 80;
    rest = url + 5;
  } else {
    return false;
  }

  size_t hostLen = strcspn(rest, ":/");
  if (hostLen == 0 || hostLen >= sizeof out.host) return false;
  memcpy(out.host, rest, hostLen);
  out.host[hostLen] = '\0';
  rest += hostLen;

  if (*rest == ':') {
    char* end;
    unsigned long port = strtoul(rest + 1, &end, 10);
    if (end == rest + 1 || port == 0 || port > 65535 || (*end != '/' && *end != '\0')) return false;
    out.port = static_cast<uint16_t>(port);
    rest = end;
  }

  if (*rest == '\0') rest = "/";
  if (strlen(rest) >= sizeof out.path) return false;
  strcpy(out.path, rest);
  return true;
}

Retry retryForClose(uint16_t code) {
  switch (code) {
    case 4001:  // credenciais erradas ou arena apagada
    case 4004:  // versão do protocolo não suportada
      return Retry::Slow;
    case 4003:  // outra caixa com o mesmo deviceId entrou: parar até reiniciar
      return Retry::Stop;
    default:
      return Retry::Backoff;
  }
}

uint32_t Backoff::next() {
  uint32_t wait = nextMs_;
  nextMs_ = nextMs_ >= 15000 ? 30000 : nextMs_ * 2;
  return wait;
}

void Backoff::reset() { nextMs_ = 1000; }

FrameKind parseServerFrame(const char* json, size_t len, ArenaState& state, char* text, size_t textCap) {
  JsonDocument doc;
  if (deserializeJson(doc, json, len)) return FrameKind::Bad;
  const char* event = doc["event"].as<const char*>();
  if (!event) return FrameKind::Bad;
  JsonVariantConst data = doc["data"];

  if (!strcmp(event, "welcome")) {
    copyUtf8(text, textCap, data["arenaName"] | "");
    return FrameKind::Welcome;
  }
  if (!strcmp(event, "error")) {
    if (textCap) snprintf(text, textCap, "%s: %s", data["code"] | "?", data["message"] | "");
    return FrameKind::Error;
  }
  if (!strcmp(event, "state")) {
    if (!data.is<JsonObjectConst>()) return FrameKind::Bad;
    return parseState(data.as<JsonObjectConst>(), state) ? FrameKind::State : FrameKind::Bad;
  }
  return FrameKind::Unknown;
}

size_t buildHello(char* buf, size_t cap, const char* deviceId, const char* token) {
  JsonDocument doc;
  doc["event"] = "hello";
  JsonObject data = doc["data"].to<JsonObject>();
  data["deviceId"] = deviceId;
  data["token"] = token;
  data["protocol"] = 1;
  return serializeIfFits(doc, buf, cap);
}

size_t buildSurrender(char* buf, size_t cap, char side, const char* matchId) {
  if (side != 'A' && side != 'B') return 0;
  const char sideStr[2] = {side, '\0'};
  JsonDocument doc;
  doc["event"] = "surrender";
  JsonObject data = doc["data"].to<JsonObject>();
  data["side"] = sideStr;
  if (matchId && *matchId) data["matchId"] = matchId;
  else data["matchId"] = nullptr;
  return serializeIfFits(doc, buf, cap);
}
