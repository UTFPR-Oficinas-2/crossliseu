# Firmware

Firmware for the arena box: an ESP32 that shows the match timer and light to the competitors and reports surrender presses. Part of the [Crossliseu](../../README.md) monorepo. Code comments are in Portuguese.

The box talks to the API over the [`/arena` WebSocket protocol](../../docs/arena-protocol.md), which also defines the LED colors and the module functions (`showTime`, `showMessage`, `setLedState`, `pollButtons`).

## Board

**Heltec WiFi LoRa 32 V2**: original ESP32 (D0WDQ6), 8 MB flash, CP2102 USB-serial (no driver needed on macOS). Not the V3, which is an ESP32-S3 and needs a different build.

Pins already taken on the board: onboard LED 25, OLED SDA 4 / SCL 15 / RST 16, Vext (OLED power) 21, PRG button 0, LoRa radio 5, 14, 18, 19, 26, 27 (plus 34, 35 as inputs).

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

`src/main.cpp` is the code that gets built. Right now it is a smoke test that blinks the onboard LED and prints `alive Ns` once a second. Build output goes to `.pio/` (git-ignored).

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

No code reads these defines yet; the box's side of the connection is tracked in #42.

To test the arena flow without the hardware, the simulator in [`tools/arena-sim`](../../tools/arena-sim/arena-sim.mjs) logs in with the same `config.h`: `node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h`.

## Strip states

| State | Colour |
| --- | --- |
| Waiting | White, blinking |
| Counting | White |
| Stopped | Red |
| Finished | Blinks green, then solid blue |

## Pins

For `main.cpp` / `Definitions.h`:

| Signal | GPIO |
| --- | --- |
| Red | 25 |
| Green | 26 |
| Blue | 16 |
| Button | 27 |

## Files

- `platformio.ini`: board, platform version and build settings
- `src/main.cpp`: the firmware PlatformIO builds (currently the smoke test)
- `main.cpp`: old sketch: setup, serial commands and state machine
- `Definitions.h`: pin numbers and the state enum
- `config.example.h`: template for the git-ignored `config.h` (server address, device id and token, Wi-Fi)
- `lcd_led_botao_01.cpp`: variant that also drives two 16x2 I2C LCDs, with different strip wiring (green 33, blue 26); see the header comment in the file
