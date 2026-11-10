// Demonstração enquanto a integração (#42) não existe: conexão (src/arena.h),
// botões (src/buttons.h) e fita de LED (src/led.h).
//   - O LED da placa acende com a caixa conectada.
//   - Cada aperto dos botões físicos imprime "button: A" ou "button: B".
//   - A fita segue a caixa: sem conexão, arena livre e cada `state` que o servidor
//     manda (é só criar, começar, pausar e encerrar uma luta no site).
//   - Comandos no monitor serial:
//       a / b  envia surrender do lado A ou B
//       l      passa a fita para o próximo estado, à mão (para testar na bancada);
//              depois do último, volta a seguir a caixa
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"
#include "buttons.h"
#include "led.h"
#include "pins.h"

static ArenaState lastState;  // último `state` recebido, para a fita seguir a caixa

// Teste à mão da fita (comando "l"): -1 = seguir a caixa; 0..6 = LedState fixo.
static int manualLed = -1;
static constexpr int LED_STATE_COUNT = 7;

static void onState(const ArenaState& s) {
  lastState = s;
  Serial.printf("demo: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

static void nextManualLed() {
  manualLed++;
  if (manualLed >= LED_STATE_COUNT) {
    manualLed = -1;
    Serial.println("demo: LED follows the box again");
  } else {
    Serial.printf("demo: LED %s\n", ledStateName(static_cast<LedState>(manualLed)));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ONBOARD_LED, OUTPUT);
  ledBegin();  // cedo, para a fita não acender sozinha com os gates soltos no boot
  delay(500);
  Serial.println("\nCrossliseu arena box");
  buttonsBegin();
  onArenaState(onState);
  arenaBegin();
  Serial.println("demo: a/b = surrender A/B, l = next LED state (by hand)");
}

void loop() {
  arenaLoop();
  const bool connected = arenaConnected();
  digitalWrite(PIN_ONBOARD_LED, connected ? HIGH : LOW);

  const LedState led = manualLed >= 0 ? static_cast<LedState>(manualLed) : ledStateFor(connected, lastState);
  setLedState(led);

  const Press press = pollButtons();
  if (press != Press::None) Serial.printf("button: %c\n", press == Press::A ? 'A' : 'B');

  while (Serial.available()) {
    const char c = toupper(Serial.read());
    if (c == 'L') {
      nextManualLed();
    } else if (c == 'A' || c == 'B') {
      const bool sent = arenaSendSurrender(c);
      Serial.printf("demo: surrender %c %s\n", c, sent ? "sent" : "dropped (not connected)");
    }
  }
}
