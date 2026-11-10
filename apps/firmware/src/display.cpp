// Os dois LCDs 16x2 I2C (#39). Pinos e telas em README.md ("Pins", "LCD screens").
#include "display.h"

#include <Arduino.h>
#include <LiquidCrystal_PCF8574.h>
#include <Wire.h>
#include <string.h>

#include "display_text.h"
#include "link_monitor.h"
#include "pins.h"

namespace {

// Cada LCD tem o seu barramento I2C (os dois controladores do ESP32), então os
// dois podem ter o mesmo endereço e não é preciso trocar de pinos a cada escrita.
struct Lcd {
  const char* name;
  TwoWire* bus;
  uint8_t sda;
  uint8_t scl;
  uint8_t addr;                        // endereço I2C achado na varredura, 0 se nunca achado
  LiquidCrystal_PCF8574* lcd;          // criado na primeira vez que o LCD responde
  bool online;                         // respondeu na última verificação
  char shown[2][LCD_COLS + 1];         // o que está na tela, para só reescrever o que mudou
  LinkMonitor link;                    // conta leituras ruins seguidas antes de dar o LCD por perdido
  uint8_t fixedAddr;                   // LCD1_ADDR / LCD2_ADDR de pins.h; 0 = procurar na varredura
};

// Pinos em pins.h. Na PCB, o SCL do U3 é o 23 (conferido na bancada); o
// lcd_led_botao_01.cpp antigo usava o 22.
Lcd lcds[] = {
    {"U3", &Wire, PIN_LCD1_SDA, PIN_LCD1_SCL, 0, nullptr, false, {}, {}, LCD1_ADDR},
    {"U4", &Wire1, PIN_LCD2_SDA, PIN_LCD2_SCL, 0, nullptr, false, {}, {}, LCD2_ADDR},
};

constexpr uint32_t I2C_HZ = 100000;
constexpr uint16_t I2C_TIMEOUT_MS = 20;

// A cada CHECK_MS, displayPoll() cuida de uma linha de um LCD, em rodízio: cada
// linha é redesenhada a cada 2 s e cada LCD verificado a cada 1 s. Redesenhar
// uma linha leva ~10 ms de I2C, então é uma por vez para não travar o loop().
constexpr uint32_t CHECK_MS = 500;

// Na ligação padrão do módulo PCF8574, P2 é o E do LCD (LCD_E_MASK em pins.h). A
// biblioteca sempre o deixa em 0 depois de escrever, e o PCF8574 volta de um reset
// com todos os pinos em 1: E lido em 1 quer dizer que o LCD perdeu energia e
// precisa de begin(). Com LCD_E_MASK 0 só vale a resposta do LCD no barramento.

bool started = false;               // displayBegin() ligou os barramentos
char wanted[2][LCD_COLS + 1];       // o que os dois LCDs devem mostrar
long shownSeconds = -1;             // segundos do último showTime, para só formatar quando muda
uint32_t lastCheckMs = 0;
uint8_t nextCheck = 0;              // 0..3: LCD nextCheck / 2, linha nextCheck % 2

// Algum dispositivo responde neste endereço?
bool probe(TwoWire& bus, uint8_t addr) {
  bus.beginTransmission(addr);
  return bus.endTransmission() == 0;
}

// Endereço do módulo I2C do LCD (PCF8574: 0x20-0x27, PCF8574A: 0x38-0x3F), ou 0.
// É o primeiro que responde; com report, avisa no log se outro também responde
// (outro dispositivo no barramento pode ser confundido com o LCD).
uint8_t findLcd(TwoWire& bus, const char* name, bool report) {
  const uint8_t ranges[][2] = {{0x20, 0x27}, {0x38, 0x3F}};
  uint8_t found = 0;
  for (const auto& r : ranges) {
    for (uint8_t addr = r[0]; addr <= r[1]; addr++) {
      if (!probe(bus, addr)) continue;
      if (!found) {
        found = addr;
        if (!report) return found;
      } else {
        Serial.printf("display: %s bus has several devices (0x%02X 0x%02X), using 0x%02X; set LCD1_ADDR/LCD2_ADDR to choose\n",
                      name, found, addr, found);
        return found;
      }
    }
  }
  return found;
}

// Lê a porta do PCF8574; false se o LCD não respondeu.
bool readPort(Lcd& l, uint8_t& port) {
  if (l.bus->requestFrom(l.addr, (uint8_t)1) != 1) return false;
  port = l.bus->read();
  return true;
}

// A biblioteca ignora os erros do I2C, então depois de escrever confere se o LCD
// ainda responde: só então a linha conta como mostrada. Senão o LCD fica fora, e
// displayPoll() o traz de volta e redesenha tudo.
bool drawRow(Lcd& l, uint8_t row) {
  l.lcd->setCursor(0, row);
  l.lcd->print(wanted[row]);
  uint8_t port;
  if (!readPort(l, port)) {
    Serial.printf("display: LCD %s write failed, reconnecting\n", l.name);
    l.online = false;
    return false;
  }
  memcpy(l.shown[row], wanted[row], LCD_COLS + 1);
  return true;
}

// Procura o LCD no barramento, inicializa e desenha as duas linhas.
bool connect(Lcd& l, bool report = false) {
  const uint8_t addr = l.fixedAddr ? (probe(*l.bus, l.fixedAddr) ? l.fixedAddr : 0) : findLcd(*l.bus, l.name, report);
  if (!addr) return false;
  if (!l.lcd || l.addr != addr) {
    delete l.lcd;
    l.lcd = new LiquidCrystal_PCF8574(addr);
    l.addr = addr;
  }
  // begin() chama bus->begin() sem pinos. Com o barramento já ligado em
  // displayBegin(), o core 3.x não mexe nele (fica nos pinos certos) e só
  // registra um aviso no log de debug.
  l.lcd->begin(LCD_COLS, 2, *l.bus);
  l.lcd->setBacklight(255);
  l.lcd->clear();
  l.online = true;  // drawRow() baixa para false se uma escrita falhar
  for (uint8_t row = 0; row < 2 && l.online; row++) drawRow(l, row);
  if (!l.online) return false;
  l.link.reset();
  Serial.printf("display: LCD %s at 0x%02X (SDA %u, SCL %u)\n", l.name, addr, l.sda, l.scl);
  return true;
}

// Lê a porta do PCF8574: false se o LCD não respondeu ou voltou de um reset.
bool stillOk(Lcd& l) {
  uint8_t port;
  if (!readPort(l, port)) return false;
  return LCD_E_MASK == 0 || (port & LCD_E_MASK) == 0;
}

// Escreve uma linha (já com 16 caracteres) nos dois LCDs, só onde ela mudou.
void writeLine(uint8_t row, const char* line) {
  memcpy(wanted[row], line, LCD_COLS + 1);
  for (Lcd& l : lcds) {
    if (l.online && strcmp(l.shown[row], line) != 0) drawRow(l, row);
  }
}

}  // namespace

void displayBegin() {
  for (auto& row : wanted) memset(row, ' ', LCD_COLS), row[LCD_COLS] = '\0';  // tela limpa

  for (Lcd& l : lcds) {
    l.bus->begin(l.sda, l.scl, I2C_HZ);
    l.bus->setTimeOut(I2C_TIMEOUT_MS);  // um barramento preso não pode travar o loop() (WebSocket e botões)
    if (!connect(l, true)) Serial.printf("display: LCD %s not found (SDA %u, SCL %u)\n", l.name, l.sda, l.scl);
  }
  started = true;
  lastCheckMs = millis();
}

void displayPoll() {
  if (!started) return;
  const uint32_t now = millis();
  if (now - lastCheckMs < CHECK_MS) return;
  lastCheckMs = now;

  Lcd& l = lcds[nextCheck / 2];
  const uint8_t row = nextCheck % 2;
  nextCheck = (nextCheck + 1) % 4;

  if (!l.online) {
    if (row == 0) connect(l);  // um LCD fora tenta voltar a cada 2 s
    return;
  }
  if (l.link.lost(stillOk(l))) {
    Serial.printf("display: LCD %s lost or reset, reconnecting\n", l.name);
    l.online = false;
    connect(l);
    return;
  }
  drawRow(l, row);  // conserta a linha se o conteúdo da tela se corrompeu
}

void showTime(long ms) {
  const long seconds = timeSeconds(ms);
  if (seconds == shownSeconds) return;  // o texto só muda uma vez por segundo
  shownSeconds = seconds;
  char time[6];
  char line[LCD_COLS + 1];
  formatTime(ms, time);
  formatLine(time, line);
  writeLine(1, line);
}

void showMessage(const char* text) {
  char line[LCD_COLS + 1];
  formatLine(text, line);
  writeLine(0, line);
}
