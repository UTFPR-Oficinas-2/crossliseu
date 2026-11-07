# Firmware

Experimental ESP32 sketch: a countdown timer driving an RGB LED strip, with a physical stop button. Part of the [Crossliseu](../../README.md) monorepo. Code comments are in Portuguese.

The box talks to the API over the [`/arena` WebSocket protocol](../../docs/arena-protocol.md), which also defines the LED colors and the module functions (`showTime`, `showMessage`, `setLedState`, `pollButtons`).

## Usage

Open the sketch in the Arduino IDE (or PlatformIO) with an ESP32 board, upload it, and open the Serial Monitor at **115200 baud** with "New Line" enabled.

| Input | Effect |
| --- | --- |
| `90` or `1:30` | Start a countdown of that length |
| `p` | Pause / resume |
| `r` | Reset to waiting |
| Button (GPIO 27) | Stop the countdown |

## Configuration

Each box needs its own `config.h` next to the sketch. Get it from the web app: **Meus campeonatos → Arenas**, create the arena (or generate a new token) and download `config.h`. The token is shown only once. Fill in `WIFI_SSID` and `WIFI_PASSWORD`, then flash. The file is git-ignored; [`config.example.h`](config.example.h) shows the format.

No code reads these defines yet; the connection to the API is tracked in #19.

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

- `main.cpp`: setup, serial commands and state machine
- `Definitions.h`: pin numbers and the state enum
- `config.example.h`: template for the git-ignored `config.h` (server address, device id and token, Wi-Fi)
- `lcd_led_botao_01.cpp`: variant that also drives two 16x2 I2C LCDs, with different strip wiring (green 33, blue 26); see the header comment in the file
