// Os dois LCDs 16x2 dos competidores (#39, RFE03, RFE04, RNFE02): mostram sempre
// o mesmo conteúdo. Linha de cima: texto de status; linha de baixo: o tempo.
// Só desenham o que recebem; a contagem regressiva fica na integração (#42).
#pragma once

void displayBegin();                  // liga os dois barramentos I2C e os LCDs; chamar uma vez no setup()
void showTime(long ms);               // linha de baixo: ms como mm:ss, arredondado para cima; ms <= 0 mostra 00:00
void showMessage(const char* text);   // linha de cima: texto de status, centralizado (até 16 caracteres)
