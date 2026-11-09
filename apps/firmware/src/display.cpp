// Os dois LCDs 16x2 I2C (#39). Pinos e telas em README.md ("Pins", "LCD screens").
#include "display.h"

#include <Arduino.h>
#include <LiquidCrystal_PCF8574.h>
#include <Wire.h>
#include <string.h>

#include "display_text.h"

namespace {

// Cada LCD tem o seu barramento I2C (os dois controladores do ESP32), então os
// dois podem ter o mesmo endereço e não é preciso trocar de pinos a cada escrita.
struct Lcd {
  const char* name;
  TwoWire* bus;
  uint8_t sda;
  uint8_t scl;
  LiquidCrystal_PCF8574* lcd;          // nullptr se o LCD não respondeu no boot
  char shown[2][LCD_COLS + 1];         // o que está na tela, para só reescrever o que mudou
};

Lcd lcds[] = {
    {"U3", &Wire, 21, 23, nullptr, {}},
    {"U4", &Wire1, 18, 19, nullptr, {}},
};

constexpr uint32_t I2C_HZ = 100000;

// Endereço do módulo I2C do LCD (PCF8574: 0x20-0x27, PCF8574A: 0x38-0x3F), ou 0.
uint8_t findLcd(TwoWire& bus) {
  const uint8_t ranges[][2] = {{0x20, 0x27}, {0x38, 0x3F}};
  for (const auto& r : ranges) {
    for (uint8_t addr = r[0]; addr <= r[1]; addr++) {
      bus.beginTransmission(addr);
      if (bus.endTransmission() == 0) return addr;
    }
  }
  return 0;
}

// Escreve uma linha (já com 16 caracteres) nos dois LCDs, só onde ela mudou.
void writeLine(uint8_t row, const char* line) {
  for (Lcd& l : lcds) {
    if (!l.lcd || strcmp(l.shown[row], line) == 0) continue;
    l.lcd->setCursor(0, row);
    l.lcd->print(line);
    memcpy(l.shown[row], line, LCD_COLS + 1);
  }
}

}  // namespace

void displayBegin() {
  for (Lcd& l : lcds) {
    l.bus->begin(l.sda, l.scl, I2C_HZ);
    const uint8_t addr = findLcd(*l.bus);
    if (!addr) {
      Serial.printf("display: LCD %s not found (SDA %u, SCL %u)\n", l.name, l.sda, l.scl);
      continue;
    }
    l.lcd = new LiquidCrystal_PCF8574(addr);
    l.lcd->begin(LCD_COLS, 2, *l.bus);
    l.lcd->setBacklight(255);
    l.lcd->clear();
    for (auto& row : l.shown) memset(row, ' ', LCD_COLS), row[LCD_COLS] = '\0';  // tela limpa
    Serial.printf("display: LCD %s at 0x%02X (SDA %u, SCL %u)\n", l.name, addr, l.sda, l.scl);
  }
}

void showTime(long ms) {
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
