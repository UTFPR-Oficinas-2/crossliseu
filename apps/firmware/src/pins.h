// Pinos da caixa da arena, todos num lugar só. Os valores padrão são os da PCB
// (ESP32 DevKit). Outra placa troca qualquer um por build_flags no
// platformio.ini, sem mexer no código (README.md, "Other boards"):
//   build_flags = ${env:esp32dev.build_flags} -DPIN_SURRENDER_A=13
// Evite os GPIO 6 a 11 (memória flash), 34 a 39 em botões (não têm pull-up
// interno) e 0, 2, 5, 12 e 15 em botões (são lidos no boot).
#pragma once

// LED da placa: aceso enquanto a caixa está conectada (demo até o #42).
#ifndef PIN_ONBOARD_LED
#define PIN_ONBOARD_LED 2
#endif

// Botões de desistência (src/buttons.cpp), com o pull-up interno; o outro
// terminal do contato vai no GND. *_PRESSED é a leitura com o botão apertado:
// LOW para contato NO (normalmente aberto), HIGH para NC (normalmente fechado).
#ifndef PIN_SURRENDER_A
#define PIN_SURRENDER_A 27
#endif
#ifndef SURRENDER_A_PRESSED
#define SURRENDER_A_PRESSED LOW  // NO
#endif
#ifndef PIN_SURRENDER_B
#define PIN_SURRENDER_B 32
#endif
#ifndef SURRENDER_B_PRESSED
#define SURRENDER_B_PRESSED HIGH  // NC
#endif

// LCDs 16x2 I2C (#42), um barramento I2C para cada.
#ifndef PIN_LCD1_SDA
#define PIN_LCD1_SDA 21  // U3
#endif
#ifndef PIN_LCD1_SCL
#define PIN_LCD1_SCL 23
#endif
#ifndef PIN_LCD2_SDA
#define PIN_LCD2_SDA 18  // U4
#endif
#ifndef PIN_LCD2_SCL
#define PIN_LCD2_SCL 19
#endif

// Fita de LED RGB 12 V (src/led.cpp): cada pino liga o gate de um MOSFET por PWM.
#ifndef PIN_STRIP_RED
#define PIN_STRIP_RED 25
#endif
#ifndef PIN_STRIP_GREEN
#define PIN_STRIP_GREEN 33
#endif
#ifndef PIN_STRIP_BLUE
#define PIN_STRIP_BLUE 26
#endif
