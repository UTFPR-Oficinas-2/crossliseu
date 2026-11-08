// Lógica pura do protocolo /arena (docs/arena-protocol.md): sem Arduino.h,
// para poder ser testada no computador (pio test -e native).
// A conexão em si (Wi-Fi, socket) fica em src/arena.cpp.
#pragma once

#include <stddef.h>
#include <stdint.h>

enum class ArenaStatus : uint8_t { Idle, Ready, Running, Paused, Ended };
enum class EndReason : uint8_t { None, TimeOut, OperatorEnded, SurrenderA, SurrenderB };

// Último `state` recebido do servidor. Cada `state` substitui o anterior por inteiro.
struct ArenaState {
  ArenaStatus status = ArenaStatus::Idle;
  char matchId[37] = "";       // "" quando null (UUID tem 36 caracteres)
  bool hasRemaining = false;   // false quando remainingMs é null
  int32_t remainingMs = 0;
  EndReason endReason = EndReason::None;
  char robotA[33] = "";        // "" quando robots é null; cortado sem quebrar UTF-8
  char robotB[33] = "";
  uint32_t receivedAtMs = 0;   // millis() na chegada; preenchido por arena.cpp, não pelo parser
};

struct ServerUrl {
  bool tls;
  char host[64];
  uint16_t port;
  char path[96];
};

// Aceita ws:// e wss://; porta padrão 80/443; caminho padrão "/".
bool parseServerUrl(const char* url, ServerUrl& out);

// O que fazer depois que o socket fecha. code = 0 quando não veio quadro de close.
enum class Retry : uint8_t { Backoff, Slow, Stop };
Retry retryForClose(uint16_t code);
constexpr uint32_t SLOW_RETRY_MS = 60000;  // 4001 e 4004

// Espera entre tentativas: 1 s, dobrando até 30 s; reset() depois de um welcome.
class Backoff {
 public:
  uint32_t next();
  void reset();

 private:
  uint32_t nextMs_ = 1000;
};

enum class FrameKind : uint8_t { Welcome, State, Error, Unknown, Bad };

// Preenche `state` só quando o retorno é State (um quadro inválido não altera nada).
// `text` recebe o arenaName (Welcome) ou "code: message" (Error).
FrameKind parseServerFrame(const char* json, size_t len, ArenaState& state, char* text, size_t textCap);

// Montam os quadros da caixa. Retornam o tamanho escrito, ou 0 se não couber.
size_t buildHello(char* buf, size_t cap, const char* deviceId, const char* token);
// matchId "" vira null. Retorna 0 se side não for 'A' ou 'B'.
size_t buildSurrender(char* buf, size_t cap, char side, const char* matchId);
