// Fita de LED (#40): cada canal (R, G, B) liga o gate de um MOSFET por PWM.
#include "led.h"

#include <Arduino.h>

#include "pins.h"

namespace {

// 5 kHz não pisca para o olho nem na câmera do celular; 8 bits = brilho de 0 a 255.
constexpr uint32_t PWM_HZ = 5000;
constexpr uint8_t PWM_BITS = 8;

LedAnimator animator;
Rgb shown = {0, 0, 0};
bool started = false;

void write(const Rgb& c) {
  ledcWrite(PIN_STRIP_RED, c.r);
  ledcWrite(PIN_STRIP_GREEN, c.g);
  ledcWrite(PIN_STRIP_BLUE, c.b);
  shown = c;
}

}  // namespace

void ledBegin() {
  const uint8_t pins[] = {PIN_STRIP_RED, PIN_STRIP_GREEN, PIN_STRIP_BLUE};
  for (uint8_t i = 0; i < 3; i++) {
    if (!ledcAttach(pins[i], PWM_HZ, PWM_BITS)) {
      // Fita pela metade engana mais que fita apagada: solta os canais já presos e
      // deixa setLedState() sem efeito (nada de ledcWrite num pino sem PWM).
      Serial.printf("led: PWM failed on GPIO %u, strip disabled\n", pins[i]);
      for (uint8_t j = 0; j < i; j++) ledcDetach(pins[j]);
      return;
    }
  }
  write(led_colors::OFF);
  started = true;
  Serial.printf("led: strip R %u, G %u, B %u\n", PIN_STRIP_RED, PIN_STRIP_GREEN, PIN_STRIP_BLUE);
}

void setLedState(LedState state) {
  if (!started) return;
  const Rgb c = animator.update(state, millis());
  if (c != shown) write(c);  // só mexe no PWM quando a cor muda
}
