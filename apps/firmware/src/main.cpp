// Demonstração enquanto a integração (#42) não existe: conexão (src/arena.h),
// botões (src/buttons.h) e os dois LCDs (src/display.h).
//   - O LED da placa acende com a caixa conectada.
//   - Cada aperto dos botões físicos imprime "button: A" ou "button: B".
//   - Comandos no monitor serial:
//       a / b  envia surrender do lado A ou B
//       t      contagem de teste de 3 minutos nos LCDs ("TEMPO RESTANTE")
//       p      para a contagem e mostra "Paused"
//       1 / 2  mostra showTime(185000) / showTime(94210): 03:05 / 01:35
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"
#include "buttons.h"
#include "display.h"
#include "pins.h"

static constexpr long TEST_MATCH_MS = 3L * 60 * 1000;

static bool testRunning = false;  // contagem de teste dos LCDs (comando "t")
static uint32_t testStartMs = 0;

static void printState(const ArenaState& s) {
  Serial.printf("demo: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

static void printHelp() {
  Serial.println("demo: a/b = surrender A/B, t = 3:00 test countdown, p = Paused, 1 = showTime(185000), 2 = showTime(94210)");
}

static void handleSerial(char c) {
  switch (c) {
    case 'A':
    case 'B': {
      const bool sent = arenaSendSurrender(c);
      Serial.printf("demo: surrender %c %s\n", c, sent ? "sent" : "dropped (not connected)");
      break;
    }
    case 'T':
      testRunning = true;
      testStartMs = millis();
      showMessage("TEMPO RESTANTE");
      Serial.println("demo: 3:00 test countdown started");
      break;
    case 'P':
      testRunning = false;
      showMessage("Paused");
      Serial.println("demo: showMessage(\"Paused\")");
      break;
    case '1':
    case '2':
      testRunning = false;
      showMessage("TESTE");
      showTime(c == '1' ? 185000 : 94210);
      Serial.printf("demo: showTime(%ld)\n", c == '1' ? 185000L : 94210L);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ONBOARD_LED, OUTPUT);
  delay(500);
  Serial.println("\nCrossliseu arena box");
  displayBegin();
  showMessage("CROSSLISEU");
  showTime(TEST_MATCH_MS);
  buttonsBegin();
  onArenaState(printState);
  arenaBegin();
  printHelp();
}

void loop() {
  arenaLoop();
  digitalWrite(PIN_ONBOARD_LED, arenaConnected() ? HIGH : LOW);

  const Press press = pollButtons();
  if (press != Press::None) Serial.printf("button: %c\n", press == Press::A ? 'A' : 'B');

  if (testRunning) {
    const long remaining = TEST_MATCH_MS - (long)(millis() - testStartMs);
    showTime(remaining);  // chamar a cada loop é barato: o LCD só é reescrito quando muda
    if (remaining <= 0) {
      testRunning = false;
      showMessage("FIM DE TEMPO");
      Serial.println("demo: test countdown finished");
    }
  }

  while (Serial.available()) handleSerial(toupper(Serial.read()));
}
