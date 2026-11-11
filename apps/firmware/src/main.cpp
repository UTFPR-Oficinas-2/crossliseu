// Caixa da arena (#42): junta a conexão com o servidor (src/arena.h) aos LCDs
// (src/display.h), à fita de LED (src/led.h) e aos botões de desistência
// (src/buttons.h). O servidor manda na luta; a caixa só mostra o último `state`
// e avisa quando um botão é apertado (docs/arena-protocol.md).
//   - LCDs: uma tela por estado (README.md, "LCD screens"); durante a luta, o tempo
//     desce a partir do remainingMs do último state e para em 00:00 esperando o servidor.
//   - Fita: uma cor por estado (README.md, "Strip states").
//   - Botões: cada aperto vira um surrender; sem conexão, o aperto é descartado.
//   - LED da placa: aceso com a caixa conectada.
// Comandos no monitor serial, para testar na bancada:
//   a / b  envia surrender do lado A ou B (o mesmo que apertar o botão)
//   l      passa a fita para o próximo estado, à mão; depois do último, volta a seguir a caixa
#include <Arduino.h>
#include <ctype.h>

#include "arena.h"
#include "box_screen.h"
#include "buttons.h"
#include "display.h"
#include "led.h"
#include "pins.h"

// Teste à mão da fita (comando "l"): -1 = seguir a caixa; 0..6 = LedState fixo.
static int manualLed = -1;

static void logState(const ArenaState& s) {
  Serial.printf("box: robots A=\"%s\" B=\"%s\"\n", s.robotA, s.robotB);
}

static void surrender(char side, const char* from) {
  const bool sent = arenaSendSurrender(side);
  Serial.printf("box: %s %c -> surrender %s\n", from, side, sent ? "sent" : "dropped (not connected)");
}

static void nextManualLed() {
  manualLed++;
  if (manualLed >= LED_STATE_COUNT) {
    manualLed = -1;
    Serial.println("box: LED follows the box again");
  } else {
    Serial.printf("box: LED %s (by hand)\n", ledStateName(static_cast<LedState>(manualLed)));
  }
}

static void handleSerial(char c) {
  if (c == 'A' || c == 'B') surrender(c, "serial");
  else if (c == 'L') nextManualLed();
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_ONBOARD_LED, OUTPUT);
  ledBegin();  // cedo, para a fita não acender sozinha com os gates soltos no boot
  delay(500);
  Serial.println("\nCrossliseu arena box");
  displayBegin();
  buttonsBegin();
  onArenaState(logState);
  arenaBegin();
  Serial.println("box: a/b = surrender A/B, l = next LED state (by hand)");
}

void loop() {
  arenaLoop();
  const bool connected = arenaConnected();
  const ArenaState& state = arenaState();
  digitalWrite(PIN_ONBOARD_LED, connected ? HIGH : LOW);

  // LCDs: chamar a cada loop é barato, só redesenham o que mudou (texto) e uma vez
  // por segundo (tempo). Um state novo aparece no loop seguinte, bem antes de 1 s.
  const BoxScreen screen = boxScreenFor(connected, state, millis());
  showMessage(screen.message);
  if (screen.hasTime) showTime(screen.timeMs);
  else clearTime();
  displayPoll();

  setLedState(manualLed >= 0 ? static_cast<LedState>(manualLed) : ledStateFor(connected, state));

  const Press press = pollButtons();
  if (press != Press::None) surrender(press == Press::A ? 'A' : 'B', "button");

  while (Serial.available()) handleSerial(toupper(Serial.read()));
}
