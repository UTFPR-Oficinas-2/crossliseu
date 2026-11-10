// Fita de LED RGB 12 V (#40, RFE05, RFE06, RNFE03): uma cor ou efeito para
// cada estado da caixa. Cores e efeitos em lib/Led/src/led_pattern.h e na tabela
// "LED colors" de docs/arena-protocol.md; pinos em src/pins.h.
#pragma once

#include "led_pattern.h"  // LedState, ledStateFor

void ledBegin();                   // configura o PWM dos 3 canais e apaga a fita; chamar uma vez no setup()
void setLedState(LedState state);  // chamar a cada loop(): mantém o efeito andando; trocar de estado
                                   // recomeça o efeito do início, repetir o mesmo estado não
