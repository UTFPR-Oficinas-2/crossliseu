// Demonstração enquanto a integração (#42) não existe: conexão (src/arena.h),
// botões (src/buttons.h), os dois LCDs (src/display.h) e a fita de LED (src/led.h).
//   - O LED da placa acende com a caixa conectada.
//   - Cada aperto dos botões físicos imprime "button: A" ou "button: B".
//   - A fita segue a caixa: sem conexão, arena livre e cada `state` que o servidor
//     manda (é só criar, começar, pausar e encerrar uma luta no site).
//   - Comandos no monitor serial:
//       a / b  envia surrender do lado A ou B
//       t      contagem de teste de 3 minutos nos LCDs ("TEMPO RESTANTE"); depois de p, continua de onde parou
//       p      pausa a contagem e mostra "PAUSADA"
//       1 / 2  mostra showTime(185000) / showTime(94210): 03:05 / 01:35
//       l      passa a fita para o próximo estado, à mão (para testar na bancada);
//              depois do último, volta a seguir a caixa
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"
#include "buttons.h"
#include "demo_clock.h"
#include "display.h"
#include "led.h"
#include "pins.h"

static constexpr long TEST_MATCH_MS = 3L * 60 * 1000;

static DemoClock demo(TEST_MATCH_MS);  // contagem de teste dos LCDs (comandos "t" e "p")

static ArenaState lastState;  // último `state` recebido, para a fita seguir a caixa

// Teste à mão da fita (comando "l"): -1 = seguir a caixa; 0..6 = LedState fixo.
static int manualLed = -1;
static constexpr int LED_STATE_COUNT = 7;

static void onState(const ArenaState& s) {
  lastState = s;
  Serial.printf("demo: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

static void printHelp() {
  Serial.println("demo: a/b = surrender A/B, t = 3:00 test countdown (resumes after p), p = pause + PAUSADA, 1 = showTime(185000), 2 = showTime(94210), l = next LED state (by hand)");
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

static void handleSerial(char c) {
  switch (c) {
    case 'A':
    case 'B': {
      const bool sent = arenaSendSurrender(c);
      Serial.printf("demo: surrender %c %s\n", c, sent ? "sent" : "dropped (not connected)");
      break;
    }
    case 'T': {
      if (demo.running) demo.stop();  // "t" com a contagem rodando recomeça do 3:00
      const bool resuming = demo.remainingMs < TEST_MATCH_MS;
      demo.start(millis());
      showMessage("TEMPO RESTANTE");
      Serial.println(resuming ? "demo: test countdown resumed" : "demo: 3:00 test countdown started");
      break;
    }
    case 'P':
      demo.pause(millis());
      showTime(demo.remaining(millis()));
      showMessage("PAUSADA");
      Serial.println("demo: showMessage(\"PAUSADA\")");
      break;
    case '1':
    case '2':
      demo.stop();
      showMessage("TESTE");
      showTime(c == '1' ? 185000 : 94210);
      Serial.printf("demo: showTime(%ld)\n", c == '1' ? 185000L : 94210L);
      break;
    case 'L':
      nextManualLed();
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ONBOARD_LED, OUTPUT);
  ledBegin();  // cedo, para a fita não acender sozinha com os gates soltos no boot
  delay(500);
  Serial.println("\nCrossliseu arena box");
  displayBegin();
  showMessage("CROSSLISEU");
  showTime(TEST_MATCH_MS);
  buttonsBegin();
  onArenaState(onState);
  arenaBegin();
  printHelp();
}

void loop() {
  arenaLoop();
  const bool connected = arenaConnected();
  digitalWrite(PIN_ONBOARD_LED, connected ? HIGH : LOW);

  const LedState led = manualLed >= 0 ? static_cast<LedState>(manualLed) : ledStateFor(connected, lastState);
  setLedState(led);

  const Press press = pollButtons();
  if (press != Press::None) Serial.printf("button: %c\n", press == Press::A ? 'A' : 'B');

  if (demo.running) {
    const long remaining = demo.remaining(millis());
    showTime(remaining);  // chamar a cada loop é barato: só formata quando o segundo muda
    if (remaining <= 0) {
      demo.stop();
      showMessage("FIM DE TEMPO");
      Serial.println("demo: test countdown finished");
    }
  }

  displayPoll();

  while (Serial.available()) handleSerial(toupper(Serial.read()));
}
