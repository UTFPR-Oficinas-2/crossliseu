#include "Definitions.h"

// Global Variables
long restante = 0;             
unsigned long ultimoTick = 0;   
unsigned long ultimoPisca = 0;
bool piscaAceso = false;
int piscasQueFaltam = 0;

bool botaoAnterior = LOW;
unsigned long ultimoAperto = 0;

void cor(bool r, bool g, bool b) {
  digitalWrite(P_VERMELHO, r);
  digitalWrite(P_VERDE,    g);
  digitalWrite(P_AZUL,     b);
}

void mostraTempo(long seg) {
  long m = seg / 60;
  long s = seg % 60;

  Serial.print("  ");
  if (m < 10) Serial.print('0');
  Serial.print(m);
  Serial.print(':');
  if (s < 10) Serial.print('0');
  Serial.println(s);
}

long interpretaTempo(String s) {
  s.trim();
  if (s.length() == 0) return -1;

  int dp = s.indexOf(':');

  if (dp > 0) {
    long m = s.substring(0, dp).toInt();
    long seg = s.substring(dp + 1).toInt();
    if (seg < 0 || seg > 59) return -1;
    return m * 60 + seg;
  }

  for (unsigned int i = 0; i < s.length(); i++) {
    if (!isDigit(s.charAt(i))) return -1;
  }
  return s.toInt();
}

void vaiPara(Estado novo) {
  estado = novo;

  switch (novo) {
    case ESPERANDO:
      Serial.println();
      Serial.println("Pronto. Digite o tempo para comecar.");
      break;

    case CONTANDO:
      cor(1, 1, 1);
      ultimoTick = millis();
      Serial.println("Contando. Aperte o botao para parar.");
      mostraTempo(restante);
      break;

    case PAUSADO:
      cor(1, 0, 0);
      Serial.print("PARADO em ");
      mostraTempo(restante);
      Serial.println("Digite um tempo novo, ou \"p\" para retomar.");
      break;

    case PISCANDO_FIM:
      Serial.println("TEMPO ESGOTADO");
      piscasQueFaltam = 8;
      ultimoPisca = millis();
      piscaAceso = false;
      break;

    case PRONTO:
      cor(0, 0, 1);
      Serial.println("Fim. Digite um novo tempo quando quiser.");
      break;
  }
}

void trataBotao() {
  bool agora = digitalRead(BOTAO);

  if (agora == HIGH && botaoAnterior == LOW) {
    if (millis() - ultimoAperto > DEBOUNCE) {
      ultimoAperto = millis();

      if (estado == CONTANDO) vaiPara(PAUSADO);
    }
  }

  botaoAnterior = agora;
}

void trataSerial() {
  if (!Serial.available()) return;

  String linha = Serial.readStringUntil('\n');
  linha.trim();

  if (linha.equalsIgnoreCase("p")) {
    if (estado == CONTANDO)      vaiPara(PAUSADO);
    else if (estado == PAUSADO)  vaiPara(CONTANDO);
    return;
  }

  if (linha.equalsIgnoreCase("r")) {
    restante = 0;
    vaiPara(ESPERANDO);
    return;
  }

  long seg = interpretaTempo(linha);

  if (seg > 0) {
    restante = seg;
    vaiPara(CONTANDO);
  } else if (linha.length() > 0) {
    Serial.println("Nao entendi. Use 90 ou 1:30");
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(P_VERMELHO, OUTPUT);
  pinMode(P_VERDE,    OUTPUT);
  pinMode(P_AZUL,     OUTPUT);
  pinMode(BOTAO, INPUT_PULLUP);

  Serial.println();
  Serial.println("=== Cronometro regressivo ===");
  Serial.println("Digite o tempo (90 ou 1:30) e tecle Enter.");
  Serial.println("p = pausa/retoma    r = reinicia");

  vaiPara(ESPERANDO);
}

void loop() {
  trataSerial();
  trataBotao();

  unsigned long agora = millis();

  switch (estado) {

    case ESPERANDO:
      if (agora - ultimoPisca >= 500) {
        ultimoPisca = agora;
        piscaAceso = !piscaAceso;
        cor(piscaAceso, piscaAceso, piscaAceso);
      }
      break;

    case CONTANDO:
      if (agora - ultimoTick >= 1000) {
        ultimoTick += 1000;
        restante--;

        if (restante <= 0) {
          restante = 0;
          vaiPara(PISCANDO_FIM);
        } else {
          mostraTempo(restante);
        }
      }
      break;

    case PISCANDO_FIM:
      if (agora - ultimoPisca >= 250) {
        ultimoPisca = agora;
        piscaAceso = !piscaAceso;
        cor(0, piscaAceso, 0);      

        if (!piscaAceso) {
          piscasQueFaltam--;
          if (piscasQueFaltam <= 0) vaiPara(PRONTO);
        }
      }
      break;

    case PAUSADO:
    case PRONTO:
      break;
  }
}
