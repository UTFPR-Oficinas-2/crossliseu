// Botões de desistência (#41, RFE01 e RFE02): um de cada lado da arena.
// Só lê os botões; quem envia a desistência ao servidor é a integração (#42).
#pragma once

enum class Press { None, A, B };

void buttonsBegin();  // configura os pinos; chamar uma vez no setup()
Press pollButtons();  // chamar a cada loop(); com debounce, devolve cada aperto uma única vez
