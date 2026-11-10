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

// LCDs 16x2 I2C (src/display.cpp), um barramento I2C para cada.
// Na Heltec WiFi LoRa 32 V2 (board = heltec_wifi_lora_32_V2) os pinos padrão
// dos LCDs são os do OLED e do rádio LoRa: o build para até eles serem trocados.
#if defined(ARDUINO_HELTEC_WIFI_LORA_32_V2) && (!defined(PIN_LCD1_SDA) || !defined(PIN_LCD2_SDA) || !defined(PIN_LCD2_SCL))
#error "Heltec V2: os pinos padrao dos LCDs (21, 18, 19) sao do OLED e do LoRa; defina PIN_LCD1_SDA, PIN_LCD2_SDA e PIN_LCD2_SCL (README.md, Other boards)"
#endif
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
// Endereço I2C de cada LCD (0x20-0x27 ou 0x38-0x3F). 0 = procurar na varredura do
// boot; fixe o valor (-DLCD1_ADDR=0x27) quando outro dispositivo divide o barramento.
#ifndef LCD1_ADDR
#define LCD1_ADDR 0
#endif
#ifndef LCD2_ADDR
#define LCD2_ADDR 0
#endif
// Bit do PCF8574 ligado ao E do LCD (P2 = 0x04 no módulo padrão), usado para
// notar que o LCD resetou. Um módulo ligado de outro jeito usa -DLCD_E_MASK=0
// para desligar essa checagem e ficar só com a resposta do LCD no barramento.
#ifndef LCD_E_MASK
#define LCD_E_MASK 0x04
#endif

// Fita de LED (#42): GPIO 25, 26 e 33 na PCB. A cor de cada um entra aqui no PR do LED.
