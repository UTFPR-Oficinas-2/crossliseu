// Máquina de estados da conexão com /arena. Regras em docs/arena-protocol.md
// ("Handshake", "Close codes", "Disconnects"). Nunca registra o token nem o hello.
#include "arena.h"

#include <Arduino.h>
#include <WebSocketsClient.h>
#include <WiFi.h>

#if __has_include("config.h")
#include "config.h"
#else
#error "Falta apps/firmware/config.h: baixe na página Arenas do Crossliseu (veja README.md)"
#endif

#include "arena_ca.h"

namespace {

constexpr uint32_t CONNECT_TIMEOUT_MS = 15000;    // TCP + TLS + upgrade sem CONNECTED
constexpr uint32_t HANDSHAKE_TIMEOUT_MS = 15000;  // hello enviado sem welcome
constexpr uint32_t LIVENESS_MS = 30000;           // nada do servidor (ping ou mensagem)
// Wi-Fi caído por esse tempo: chama WiFi.begin() de novo. O setAutoReconnect do core
// desiste depois de um WL_CONNECT_FAILED (por exemplo, um hotspot ainda religando) e
// a caixa ficava sem rede até ser reiniciada.
constexpr uint32_t WIFI_RETRY_MS = 10000;

enum class Phase : uint8_t { WifiDown, Waiting, Connecting, Handshaking, Connected, Stopped };

WebSocketsClient ws;
ServerUrl url;
Phase phase = Phase::WifiDown;
uint32_t phaseSince = 0;
uint32_t waitMs = 0;
uint32_t lastRxMs = 0;
Backoff backoff;
ArenaState lastState;
void (*stateCb)(const ArenaState&) = nullptr;

const char* const STATUS_NAMES[] = {"idle", "scheduled", "ongoing", "paused", "finished"};

void enter(Phase p) {
  phase = p;
  phaseSince = millis();
}

bool socketPhase() { return phase == Phase::Connecting || phase == Phase::Handshaking || phase == Phase::Connected; }

void waitThenRetry(uint32_t ms) {
  waitMs = ms;
  enter(Phase::Waiting);
}

// Abandona a tentativa/conexão atual por iniciativa da caixa e espera o backoff.
// A fase muda antes do disconnect(), então o DISCONNECTED que ele dispara é ignorado.
void dropAndBackoff(const char* reason) {
  uint32_t ms = backoff.next();
  Serial.printf("arena: %s, retry in %lu s\n", reason, (unsigned long)(ms / 1000));
  waitThenRetry(ms);
  ws.disconnect();
}

void startAttempt() {
  // Limpa o socket da tentativa anterior antes de entrar em Connecting: senão o
  // ws.loop() faz essa limpeza e dispara um DISCONNECTED (com o close code velho)
  // como se fosse desta tentativa. A fase ainda não é de socket, então ele é ignorado.
  ws.disconnect();
  Serial.printf("arena: connecting %s:%u\n", url.host, url.port);
  enter(Phase::Connecting);
}

void onClosed(uint16_t code) {
  char codeText[24];
  if (code) snprintf(codeText, sizeof codeText, "%u", code);
  else snprintf(codeText, sizeof codeText, "(no close frame)");

  switch (retryForClose(code)) {
    case Retry::Stop:
      Serial.printf("arena: closed %s -> stopped (replaced by another box); reboot to retry\n", codeText);
      enter(Phase::Stopped);
      break;
    case Retry::Slow:
      Serial.printf("arena: closed %s -> %s, retry in %lu s\n", codeText,
                    code == 4004 ? "unsupported protocol (update firmware)" : "bad config (device id / token)",
                    (unsigned long)(SLOW_RETRY_MS / 1000));
      waitThenRetry(SLOW_RETRY_MS);
      break;
    case Retry::Backoff: {
      uint32_t ms = backoff.next();
      Serial.printf("arena: closed %s -> retry in %lu s\n", codeText, (unsigned long)(ms / 1000));
      waitThenRetry(ms);
      break;
    }
  }
}

void sendHello() {
  char buf[256];
  size_t n = buildHello(buf, sizeof buf, ARENA_DEVICE_ID, ARENA_DEVICE_TOKEN);
  if (!n) {
    Serial.println("arena: device id / token too long for hello, stopped");
    enter(Phase::Stopped);
    ws.disconnect();
    return;
  }
  ws.sendTXT(buf, n);
  Serial.println("arena: socket open, sent hello");
  enter(Phase::Handshaking);
}

void handleFrame(const uint8_t* payload, size_t len) {
  char text[96] = "";
  switch (parseServerFrame(reinterpret_cast<const char*>(payload), len, lastState, text, sizeof text)) {
    case FrameKind::Welcome:
      if (phase != Phase::Handshaking) break;
      Serial.printf("arena: welcome \"%s\"\n", text);
      lastState = ArenaState{};  // o state de antes da queda não vale mais; o servidor manda o atual logo depois
      backoff.reset();
      enter(Phase::Connected);
      break;
    case FrameKind::State:
      lastState.receivedAtMs = millis();
      if (lastState.hasRemaining) {
        Serial.printf("arena: state %s match=%s remainingMs=%ld\n", STATUS_NAMES[(int)lastState.status],
                      lastState.matchId[0] ? lastState.matchId : "null", (long)lastState.remainingMs);
      } else {
        Serial.printf("arena: state %s match=null remainingMs=null\n", STATUS_NAMES[(int)lastState.status]);
      }
      if (stateCb) stateCb(lastState);
      break;
    case FrameKind::Error:
      Serial.printf("arena: error %s\n", text);
      break;
    case FrameKind::Unknown:
      Serial.println("arena: ignored unknown event");
      break;
    case FrameKind::Bad:
      Serial.println("arena: ignored malformed frame");
      break;
  }
}

void onWsEvent(WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      if (phase != Phase::Connecting) break;
      lastRxMs = millis();
      sendHello();
      break;
    case WStype_TEXT:
      lastRxMs = millis();
      handleFrame(payload, len);
      break;
    case WStype_PING:
    case WStype_PONG:
      lastRxMs = millis();
      break;
    case WStype_ERROR:  // connect TCP/TLS falhou (patch em lib/WebSockets)
      if (phase != Phase::Connecting) break;
      {
        uint32_t ms = backoff.next();
        Serial.printf("arena: connect failed, retry in %lu s\n", (unsigned long)(ms / 1000));
        waitThenRetry(ms);
        ws.disconnect();  // libera o socket que falhou; sem isso o resto do ws.loop() já abre outro
      }
      break;
    case WStype_DISCONNECTED:
      if (socketPhase()) onClosed(ws.lastCloseCode());
      break;
    default:
      break;
  }
}

}  // namespace

void arenaBegin() {
  if (!parseServerUrl(ARENA_SERVER_URL, url)) {
    Serial.println("arena: invalid ARENA_SERVER_URL, stopped");
    enter(Phase::Stopped);
    return;
  }

  if (WIFI_SSID[0] == '\0') {
    Serial.println("arena: WIFI_SSID is empty in config.h, fill in WIFI_SSID / WIFI_PASSWORD and flash again");
  }

  WiFi.persistent(false);  // não gravar a rede na flash a cada boot
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("arena: wifi connecting");

  // Quem decide quando reconectar é esta máquina de estados: ws.loop() só roda nas
  // fases com socket, então o reconnect automático da biblioteca nunca dispara sozinho.
  ws.onEvent(onWsEvent);
  ws.setReconnectInterval(0);
  if (url.tls) ws.beginSslWithCA(url.host, url.port, url.path, ARENA_CA_PEM);
  else ws.begin(url.host, url.port, url.path);

  enter(Phase::WifiDown);
}

namespace {

// Registra cada mudança de status do Wi-Fi com o motivo, para diagnosticar uma caixa
// que não conecta (rede de 5 GHz, senha errada...).
// WL_DISCONNECTED aparece entre cada nova tentativa e não diz nada, então fica de
// fora; cada motivo é registrado uma vez até o Wi-Fi conectar de novo.
void logWifiStatus(wl_status_t status) {
  static int lastShown = -1;
  if (status == WL_CONNECTED) {
    lastShown = -1;  // "wifi up" já é registrado
    return;
  }
  if (status == WL_DISCONNECTED || status == WL_IDLE_STATUS || status == lastShown) return;
  lastShown = status;
  const char* text;
  switch (status) {
    case WL_NO_SSID_AVAIL: text = "network not found (check WIFI_SSID, case-sensitive; the ESP32 only sees 2.4 GHz)"; break;
    case WL_CONNECT_FAILED: text = "connect failed (check WIFI_PASSWORD, or the network is still starting)"; break;
    case WL_CONNECTION_LOST: text = "connection lost"; break;
    default: text = "not connected"; break;
  }
  Serial.printf("arena: wifi status %d: %s\n", (int)status, text);
}

}  // namespace

void arenaLoop() {
  const wl_status_t wifiStatus = WiFi.status();
  const bool wifiUp = wifiStatus == WL_CONNECTED;
  logWifiStatus(wifiStatus);

  switch (phase) {
    case Phase::Stopped:
      return;

    case Phase::WifiDown:
      if (wifiUp) {
        Serial.printf("arena: wifi up %s\n", WiFi.localIP().toString().c_str());
        startAttempt();
      } else if (millis() - phaseSince >= WIFI_RETRY_MS) {
        // Não confia só no reconnect automático: tenta de novo a cada WIFI_RETRY_MS.
        Serial.printf("arena: wifi still down after %lu s, trying again\n", (unsigned long)(WIFI_RETRY_MS / 1000));
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        enter(Phase::WifiDown);  // recomeça a contar os 10 s
      }
      return;

    case Phase::Waiting:
      if (millis() - phaseSince < waitMs) return;
      if (wifiUp) {
        startAttempt();
      } else {
        Serial.println("arena: wifi down");
        enter(Phase::WifiDown);
      }
      return;

    case Phase::Connecting:
    case Phase::Handshaking:
    case Phase::Connected:
      if (!wifiUp) {
        Serial.println("arena: wifi down");
        enter(Phase::WifiDown);
        ws.disconnect();
        return;
      }
      ws.loop();  // pode bloquear alguns segundos durante TCP + TLS
      break;
  }

  // A fase pode ter mudado dentro do ws.loop().
  const uint32_t now = millis();
  if (phase == Phase::Connecting && now - phaseSince >= CONNECT_TIMEOUT_MS) {
    dropAndBackoff("connect timed out");
  } else if (phase == Phase::Handshaking && now - phaseSince >= HANDSHAKE_TIMEOUT_MS) {
    dropAndBackoff("no welcome after hello");
  } else if (phase == Phase::Connected && now - lastRxMs >= LIVENESS_MS) {
    dropAndBackoff("no data for 30 s, reconnecting");
  }
}

bool arenaConnected() { return phase == Phase::Connected; }

void onArenaState(void (*cb)(const ArenaState&)) { stateCb = cb; }

const ArenaState& arenaState() { return lastState; }

bool arenaSendSurrender(char side) {
  if (phase != Phase::Connected) return false;
  char buf[128];
  size_t n = buildSurrender(buf, sizeof buf, side, lastState.matchId);
  if (!n) return false;
  return ws.sendTXT(buf, n);
}
