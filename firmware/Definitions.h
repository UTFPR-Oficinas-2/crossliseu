/*
  Cronometro regressivo - ESP32 + fita RGB 12V + botao

  Controle pelo Monitor Serial (115200 baud, com "New Line" ligado):

    digite um tempo  -> inicia a contagem
                        formatos aceitos: "90"  ou  "1:30"
    p                -> pausa / retoma
    r                -> volta ao inicio (espera)

  Botao no GPIO 27: interrompe a contagem.
  Para voltar a contar, digite um tempo novo ou "p" no Serial.

  Estados da fita:
    esperando   -> branco piscando
    contando    -> branco fixo
    parado      -> vermelho fixo
    terminou    -> pisca verde, depois azul fixo
*/


#define P_VERMELHO 25
#define P_VERDE    26
#define P_AZUL     16

#define BOTAO 27

#define DEBOUNCE 200

enum Estado { ESPERANDO, CONTANDO, PAUSADO, PISCANDO_FIM, PRONTO };

Estado estado = ESPERANDO;


void cor(bool r, bool g, bool b);
void mostraTempo(long seg);
long interpretaTempo(String s);
void vaiPara(Estado novo);
void trataBotao();
void trataSerial();
void loop();