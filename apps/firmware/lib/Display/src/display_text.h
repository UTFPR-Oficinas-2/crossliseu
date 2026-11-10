// Texto das linhas dos LCDs 16x2, sem dependência do Arduino, para ser testado
// no computador (test/test_display, pio test -e native). Quem escreve nos LCDs
// é src/display.cpp.
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

constexpr size_t LCD_COLS = 16;

// Tempo como "mm:ss", arredondado para cima ao próximo segundo
// (docs/arena-protocol.md, "Timer"): 94210 ms -> "01:35", 185000 ms -> "03:05".
// ms <= 0 vira "00:00", que só aparece quando o tempo acabou de verdade.
// Acima de 99:59 fica em 99:59: o LCD só tem dois dígitos de minuto.
// timeSeconds é o número de segundos mostrado, formatTime o texto.
inline long timeSeconds(long ms) {
  if (ms <= 0) return 0;
  const long seconds = ms / 1000 + (ms % 1000 != 0);  // sem ms + 999, que estoura perto de LONG_MAX
  return seconds > 99 * 60 + 59 ? 99 * 60 + 59 : seconds;
}

inline void formatTime(long ms, char out[6]) {
  const long seconds = timeSeconds(ms);
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
  if (c == 0x98) return 'O';               // Ø
  if (c == 0x9F) return 's';               // ß
  if (c >= 0x99 && c <= 0x9C) return 'U';  // ÙÚÛÜ
  if (c >= 0xA0 && c <= 0xA5) return 'a';
  if (c == 0xA7) return 'c';
  if (c >= 0xA8 && c <= 0xAB) return 'e';
  if (c >= 0xAC && c <= 0xAF) return 'i';
  if (c == 0xB1) return 'n';
  if (c >= 0xB2 && c <= 0xB6) return 'o';
  if (c == 0xB8) return 'o';               // ø
  if (c >= 0xB9 && c <= 0xBC) return 'u';
  return '?';
}

}  // namespace display_text_detail

// Uma linha do LCD: texto centralizado em LCD_COLS colunas, completado com espaços.
// O LCD só mostra ASCII, então os acentos do português saem (Ç -> C, ã -> a),
// outros caracteres não ASCII (emoji...) viram '?', e o que passar de 16 é cortado.
// A ROM de caracteres mais comum do HD44780 (A00) mostra a barra invertida como
// iene e '~' como seta, então eles também viram '?'. Controles (e DEL) viram espaço.
// text == nullptr vale como linha vazia.
inline void formatLine(const char* text, char out[LCD_COLS + 1]) {
  size_t n = 0;
  const uint8_t* p = reinterpret_cast<const uint8_t*>(text ? text : "");
  while (*p && n < LCD_COLS) {
    const uint8_t c = *p;
    if (c < 0x80) {
      out[n++] = c < 0x20 || c == 0x7F ? ' ' : c == '\\' || c == '~' ? '?' : static_cast<char>(c);
      p++;
    } else if (c == 0xC3 && p[1] >= 0x80 && p[1] <= 0xBF) {
      out[n++] = display_text_detail::foldLatin1(p[1]);
      p += 2;
    } else if ((c == 0xCC && p[1] >= 0x80 && p[1] <= 0xBF) || (c == 0xCD && p[1] >= 0x80 && p[1] <= 0xAF)) {
      p += 2;  // marca combinante (U+0300-U+036F): o acento decomposto some
    } else {
      // Outro caractere UTF-8: um '?' e pula os bytes de continuação.
      out[n++] = '?';
      p++;
      while ((*p & 0xC0) == 0x80) p++;
    }
  }

  // Centraliza: empurra os n caracteres para a direita e completa com espaços.
  const size_t left = (LCD_COLS - n) / 2;
  memmove(out + left, out, n);
  memset(out, ' ', left);
  memset(out + left + n, ' ', LCD_COLS - left - n);
  out[LCD_COLS] = '\0';
}
