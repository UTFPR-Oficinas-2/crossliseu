// Camada de conexão da caixa com o servidor (/arena, docs/arena-protocol.md):
// Wi-Fi, WebSocket com TLS, handshake hello/welcome, reconexão e liveness.
// Os outros módulos (display, LED, botões, #42) usam só estas funções e nunca o socket.
#pragma once

#include "arena_logic.h"  // ArenaState, ArenaStatus, EndReason

void arenaBegin();                                 // Wi-Fi + socket, a partir do config.h; chamar uma vez no setup()
void arenaLoop();                                  // a cada loop(): Wi-Fi, reconexão, liveness e quadros recebidos
bool arenaConnected();                             // true entre o welcome e o fechamento do socket
void onArenaState(void (*cb)(const ArenaState&));  // chamado a cada `state` válido
bool arenaSendSurrender(char side);                // 'A' ou 'B', com o matchId do último state; false se não conectado
