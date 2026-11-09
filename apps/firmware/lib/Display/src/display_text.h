// Texto das linhas dos LCDs 16x2, sem dependência do Arduino, para ser testado
// no computador (test/test_display, pio test -e native). Quem escreve nos LCDs
// é src/display.cpp.
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

constexpr size_t LCD_COLS = 16;

// Tempo como "mm:ss", arredondado para cima ao próximo segundo
// (docs/arena-protocol.md, "Timer"): 94210 ms -> "01:35", 185000 ms -> "03:05".
// ms <= 0 vira "00:00", que só aparece quando o tempo acabou de verdade.
// Acima de 99:59 fica em 99:59: o LCD só tem dois dígitos de minuto.
inline void formatTime(long ms, char out[6]) {
  long seconds = ms <= 0 ? 0 : (ms + 999) / 1000;
  if (seconds > 99 * 60 + 59) seconds = 99 * 60 + 59;
  snprintf(out, 6, "%02ld:%02ld", seconds / 60, seconds % 60);
}

namespace display_text_detail {

// Letra sem acento para um caractere Latin-1 (o segundo byte de "\xC3 xx" em UTF-8),
// ou '?' se não for uma letra acentuada do português.
inline char foldLatin1(uint8_t c) {
  if (c >= 0x80 && c <= 0x85) return 'A';  // ÀÁÂÃÄÅ
  if (c == 0x87) return 'C';               // Ç
  if (c >= 0x88 && c <= 0x8B) return 'E';  // ÈÉÊË
  if (c >= 0x8C && c <= 0x8F) return 'I';  // ÌÍÎÏ
  if (c == 0x91) return 'N';               // Ñ
  if (c >= 0x92 && c <= 0x96) return 'O';  // ÒÓÔÕÖ
  if (c >= 0x99 && c <= 0x9C) return 'U';  // ÙÚÛÜ
  if (c >= 0xA0 && c <= 0xA5) return 'a';
  if (c == 0xA7) return 'c';
  if (c >= 0xA8 && c <= 0xAB) return 'e';
  if (c >= 0xAC && c <= 0xAF) return 'i';
  if (c == 0xB1) return 'n';
  if (c >= 0xB2 && c <= 0xB6) return 'o';
  if (c >= 0xB9 && c <= 0xBC) return 'u';
  return '?';
}

}  // namespace display_text_detail

// Uma linha do LCD: texto centralizado em LCD_COLS colunas, completado com espaços.
// O LCD só mostra ASCII, então os acentos do português saem (Ç -> C, ã -> a),
// outros caracteres não ASCII (emoji...) viram '?', e o que passar de 16 é cortado.
// text == nullptr vale como linha vazia.
inline void formatLine(const char* text, char out[LCD_COLS + 1]) {
  char ascii[LCD_COLS + 1];
  size_t n = 0;
  const uint8_t* p = reinterpret_cast<const uint8_t*>(text ? text : "");
  while (*p && n < LCD_COLS) {
    const uint8_t c = *p;
    if (c < 0x80) {
      ascii[n++] = c < 0x20 ? ' ' : static_cast<char>(c);
      p++;
    } else if (c == 0xC3 && p[1] >= 0x80 && p[1] <= 0xBF) {
      ascii[n++] = display_text_detail::foldLatin1(p[1]);
      p += 2;
    } else {
      // Outro caractere UTF-8: um '?' e pula os bytes de continuação.
      ascii[n++] = '?';
      p++;
      while ((*p & 0xC0) == 0x80) p++;
    }
  }

  const size_t left = (LCD_COLS - n) / 2;
  size_t i = 0;
  for (; i < left; i++) out[i] = ' ';
  for (size_t j = 0; j < n; j++) out[i++] = ascii[j];
  for (; i < LCD_COLS; i++) out[i] = ' ';
  out[LCD_COLS] = '\0';
}
