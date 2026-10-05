# Firmware

Experimental ESP32 sketch: a countdown timer driving an RGB LED strip, with a physical stop button. Part of the [Crossliseu](../README.md) monorepo. Code comments are in Portuguese.

## Usage

Open the sketch in the Arduino IDE (or PlatformIO) with an ESP32 board, upload it, and open the Serial Monitor at **115200 baud** with "New Line" enabled.

| Input | Effect |
| --- | --- |
| `90` or `1:30` | Start a countdown of that length |
| `p` | Pause / resume |
| `r` | Reset to waiting |
| Button (GPIO 27) | Stop the countdown |

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
- `lcd_led_botao_01.cpp`: variant that also drives two 16x2 I2C LCDs, with different strip wiring (green 33, blue 26); see the header comment in the file
