# Firmware

Firmware for the arena box: an ESP32 that shows the match timer and light to the competitors and reports surrender presses. Part of the [Crossliseu](../../README.md) monorepo. Code comments are in Portuguese.

The box talks to the API over the [`/arena` WebSocket protocol](../../docs/arena-protocol.md), which also defines the LED colors and the module functions (`showTime`, `showMessage`, `setLedState`, `pollButtons`).

## Board

**Heltec WiFi LoRa 32 V2**: original ESP32 (D0WDQ6), 8 MB flash, CP2102 USB-serial (no driver needed on macOS). Not the V3, which is an ESP32-S3 and needs a different build.

Pins already taken on the board: onboard LED 25, OLED SDA 4 / SCL 15 / RST 16, Vext (OLED power) 21, PRG button 0, LoRa radio 5, 14, 18, 19, 26, 27 (plus 34, 35 as inputs).

**ESP32 DevKit** (ESP32-WROOM-32, 4 MB flash): the box PCB with the surrender buttons, the two LCDs and the strip. Same chip as the V2, so the code is the same; build it with the `esp32dev` env (`pio run -e esp32dev`, `pio run -e esp32dev -t upload`). Its onboard LED is on GPIO 2. The pins in [Pins](#pins) are for this board; several of them are taken on the V2.

## Setup (macOS)

Built with [PlatformIO](https://platformio.org) on the Arduino framework. The platform is [pioarduino](https://github.com/pioarduino/platform-espressif32) (Arduino core 3.x), pinned in [`platformio.ini`](platformio.ini).

```sh
uv tool install platformio   # once; puts `pio` in ~/.local/bin
```

From `apps/firmware`, with the board plugged in over USB:

```sh
pio run                      # build (the first run downloads ~6 GB of toolchain into ~/.platformio)
pio run -t upload            # build and flash; the port is found automatically
pio device monitor           # serial monitor at 115200; Ctrl+C to quit
```

`src/` is the code that gets built; it needs a `config.h` (see [Configuration](#configuration)). Build output goes to `.pio/` (git-ignored).

pio test -e native
```

To remove everything later: `uv tool uninstall platformio`, `rm -rf ~/.platformio` and `rm -rf apps/firmware/.pio`.

## Old countdown sketch

`main.cpp`, `Definitions.h` and `lcd_led_botao_01.cpp` in this folder are the earlier Arduino sketch. They are kept for reference and are **not** built by PlatformIO (only `src/` is). Their pins clash with the V2's OLED and LoRa pins (see [Board](#board)). To run one, open it in the Arduino IDE, upload it, and open the Serial Monitor at **115200 baud** with "New Line" enabled.

| Input | Effect |
| --- | --- |
| `90` or `1:30` | Start a countdown of that length |
| `p` | Pause / resume |
| `r` | Reset to waiting |
| Button (GPIO 27) | Stop the countdown |

## Configuration

Each box needs its own `config.h` in this folder, next to `platformio.ini` (the build adds this folder to the include path). Get it from the web app: **Meus campeonatos → Arenas**, create the arena (or generate a new token) and download `config.h`. The token is shown only once. Fill in `WIFI_SSID` and `WIFI_PASSWORD`, then flash. The file is git-ignored; [`config.example.h`](config.example.h) shows the format.

## Connection

`src/arena.cpp` connects the box to the API's [`/arena` WebSocket](../../docs/arena-protocol.md); other modules use only the functions in `src/arena.h` (listed under "Firmware modules" in the protocol doc). Until the display and strip exist (#42), `src/main.cpp` is a demo:

- The onboard LED (GPIO 25 on the V2, GPIO 2 on the DevKit) is on while the box is connected (after `welcome`).
- Typing `a` or `b` in the serial monitor sends `surrender` for side A or B.
- Each press of a physical surrender button prints `button: A` or `button: B` (it does not send anything yet; that is #42).
- The serial log shows each step, prefixed `arena:`: Wi-Fi, connecting, `welcome`, each `state`, and every close with its code and the next retry. The token is never printed.

| Close | The box |
| --- | --- |
| `4001` (bad device id / token) or `4004` (protocol) | Retries every 60 s |
| `4003` (another box logged in with the same id) | Stops until it is rebooted |
| Anything else, or nothing heard for 30 s | Retries after 1 s, doubling up to 30 s |

The WebSocket library is a patched copy of arduinoWebSockets 2.7.2 in `lib/WebSockets`, so the box can read the server's close code; see [`lib/WebSockets/CROSSLISEU_PATCH.md`](lib/WebSockets/CROSSLISEU_PATCH.md). The server certificate is checked against the ISRG Root X1 and X2 certificates in `src/arena_ca.h`.

To test the arena flow without the hardware, the simulator in [`tools/arena-sim`](../../tools/arena-sim/arena-sim.mjs) logs in with the same `config.h`: `node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h`.

## Strip states

| State | Colour |
| --- | --- |
| Waiting | White, blinking |
| Counting | White |
| Stopped | Red |
| Finished | Blinks green, then solid blue |

## Pins

Surrender buttons (`src/buttons.cpp`, ESP32 DevKit). Both use the internal pull-up; the other contact terminal goes to GND.

| Signal | GPIO | Contact | Pressed reads |
| --- | --- | --- | --- |
| Surrender, side A | 27 | NO (normally open) | LOW |
| Surrender, side B | 32 | NC (normally closed) | HIGH |

A press counts once, after the reading stays the same for 30 ms; holding the button counts nothing more. A button already pressed at boot (or an NC button with a loose wire) is not a press.

For the old `main.cpp` / `Definitions.h`:

| Signal | GPIO |
| --- | --- |
| Red | 25 |
| Green | 26 |
| Blue | 16 |
| Button | 27 |

## Files

- `platformio.ini`: board, platform version and build settings
- `src/main.cpp`: demo of the connection layer and the buttons (onboard LED, serial `a`/`b`, `button: A`/`B`) until #42
- `src/arena.h`, `src/arena.cpp`: connection layer (Wi-Fi, WebSocket, handshake, retries)
- `src/arena_ca.h`: root certificates for `wss://`
- `src/buttons.h`, `src/buttons.cpp`: surrender buttons (`buttonsBegin`, `pollButtons`)
- `lib/Buttons/`: debounce logic with no Arduino dependency
- `lib/ArenaLogic/`: protocol logic with no Arduino dependency (URL, retry policy, JSON frames)
- `lib/WebSockets/`: patched arduinoWebSockets 2.7.2
- `test/test_arena_logic/`: unit tests for `lib/ArenaLogic` (`pio test -e native`)
- `test/test_buttons/`: unit tests for the debounce in `lib/Buttons` (`pio test -e native`)
- `main.cpp`: old sketch: setup, serial commands and state machine
- `Definitions.h`: pin numbers and the state enum
- `config.example.h`: template for the git-ignored `config.h` (server address, device id and token, Wi-Fi)
- `lcd_led_botao_01.cpp`: variant that also drives two 16x2 I2C LCDs, with different strip wiring (green 33, blue 26); see the header comment in the file
