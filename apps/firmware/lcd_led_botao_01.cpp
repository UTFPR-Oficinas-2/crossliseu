/*
  Cronometro - ESP32 + fita RGB 12V + botao + 2 LCDs 16x2 I2C

  Controle pelo Monitor Serial (115200 baud, com "New Line" ligado):

    digite um tempo  -> inicia a contagem
                        formatos aceitos: "90"  ou  "1:30"
    p                -> pausa / retoma
    r                -> volta ao inicio (espera)

  Botao no GPIO 27: interrompe a contagem.
  Para voltar a contar, digite um tempo novo ou "p" no Serial.

  Ligacoes:
    Display 1:  SDA -> GPIO 21  |  SCL -> GPIO 22
    Display 2:  SDA -> GPIO 18  |  SCL -> GPIO 19
    Displays:   GND -> GND      |  VCC -> VIN
    Fita RGB:   vermelho -> 25  |  verde -> 33  |  azul -> 26
    Botao:      GPIO 27 e GND

  Estados da fita:
    esperando   -> branco piscando
    contando    -> branco fixo
    parado      -> vermelho fixo
    terminou    -> pisca verde, depois azul fixo
*/

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define P_VERMELHO 25
#define P_VERDE    33
#define P_AZUL     26

#define BOTAO 27

#define DEBOUNCE 200

// Brilho maximo de cada cor (0 a 255). Diminua o vermelho se o branco ficar rosado.
#define BRILHO_VERMELHO 255
#define BRILHO_VERDE    255
#define BRILHO_AZUL     255

// ---------- Displays ----------

const int LCD_SDA[2] = {21, 18};
const int LCD_SCL[2] = {22, 19};

LiquidCrystal_I2C *lcd[2] = {nullptr, nullptr};
int barramentoAtual = -1;

enum Estado { ESPERANDO, CONTANDO, PAUSADO, PISCANDO_FIM, PRONTO };

Estado estado = ESPERANDO;

long restante = 0;
unsigned long ultimoTick = 0;
unsigned long ultimoPisca = 0;
bool piscaAceso = false;
int piscasQueFaltam = 0;

bool botaoAnterior = HIGH;
unsigned long ultimoAperto = 0;

// Liga o I2C nos pinos do display escolhido (0 ou 1)
void usarDisplay(int n) {
  if (barramentoAtual == n) return;
  Wire.end();
  Wire.begin(LCD_SDA[n], LCD_SCL[n]);
  barramentoAtual = n;
}

byte procurarEndereco() {
  for (byte e = 1; e < 127; e++) {
    Wire.beginTransmission(e);
    if (Wire.endTransmission() == 0) return e;
  }
  return 0;
}

void iniciarDisplays() {
  for (int n = 0; n < 2; n++) {
    usarDisplay(n);
    byte endereco = procurarEndereco();

    if (endereco == 0) {
      Serial.printf("AVISO: Display %d nao encontrado (SDA %d, SCL %d)\n",
                    n + 1, LCD_SDA[n], LCD_SCL[n]);
      continue;
    }

    Serial.printf("Display %d encontrado em 0x%02X\n", n + 1, endereco);
    lcd[n] = new LiquidCrystal_I2C(endereco, 16, 2);
    lcd[n]->init();
    lcd[n]->backlight();
    lcd[n]->clear();
  }
}

// Escreve uma linha inteira NOS DOIS displays
void lcdLinha(int linha, const char *texto) {
  char buf[17];
  snprintf(buf, sizeof(buf), "%-16s", texto);

  for (int n = 0; n < 2; n++) {
    if (!lcd[n]) continue;
    usarDisplay(n);
    lcd[n]->setCursor(0, linha);
    lcd[n]->print(buf);
  }
}

// Monta "MM:SS" centralizado na linha de baixo
void lcdTempo(long seg) {
  char tempo[12];
  snprintf(tempo, sizeof(tempo), "%02ld:%02ld", seg / 60, seg % 60);

  char linha[17];
  int espacos = (16 - (int)strlen(tempo)) / 2;
  if (espacos < 0) espacos = 0;
  snprintf(linha, sizeof(linha), "%*s%s", espacos, "", tempo);
  lcdLinha(1, linha);
}

// ---------- Fita e Serial ----------

void cor(bool r, bool g, bool b) {
  analogWrite(P_VERMELHO, r ? BRILHO_VERMELHO : 0);
  analogWrite(P_VERDE,    g ? BRILHO_VERDE    : 0);
  analogWrite(P_AZUL,     b ? BRILHO_AZUL     : 0);
}

// Mostra o tempo no Serial E nos dois LCDs
void mostraTempo(long seg) {
  long m = seg / 60;
  long s = seg % 60;

  Serial.print("  ");
  if (m < 10) Serial.print('0');
  Serial.print(m);
  Serial.print(':');
  if (s < 10) Serial.print('0');
  Serial.println(s);

  lcdTempo(seg);
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
      lcdLinha(0, "Aguardando...");
      lcdLinha(1, "Digite o tempo");
      break;

    case CONTANDO:
      cor(1, 1, 1);
      ultimoTick = millis();
      Serial.println("Contando. Aperte o botao para parar.");
      lcdLinha(0, "Contando");
      mostraTempo(restante);
      break;

    case PAUSADO:
      cor(1, 0, 0);
      Serial.print("PARADO em ");
      lcdLinha(0, "PARADO");
      mostraTempo(restante);
      Serial.println("Digite um tempo novo, ou \"p\" para retomar.");
      break;

    case PISCANDO_FIM:
      Serial.println("TEMPO ESGOTADO");
      lcdLinha(0, "TEMPO ESGOTADO!");
      lcdTempo(0);
      piscasQueFaltam = 8;
      ultimoPisca = millis();
      piscaAceso = false;
      break;

    case PRONTO:
      cor(0, 0, 1);
      Serial.println("Fim. Digite um novo tempo quando quiser.");
      lcdLinha(0, "Fim!");
      lcdLinha(1, "Novo tempo?");
      break;
  }
}

void trataBotao() {
  bool agora = digitalRead(BOTAO);

  // Com INPUT_PULLUP o botao apertado le LOW: detecta a descida (HIGH -> LOW)
  if (agora == LOW && botaoAnterior == HIGH) {
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

  iniciarDisplays();
  lcdLinha(0, "Cronometro");
  lcdLinha(1, "regressivo");
  delay(1500);

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
