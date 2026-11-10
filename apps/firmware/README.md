# Firmware

Firmware for the arena box: an ESP32 that shows the match timer and light to the competitors and reports surrender presses. Part of the [Crossliseu](../../README.md) monorepo. Code comments are in Portuguese.

The box talks to the API over the [`/arena` WebSocket protocol](../../docs/arena-protocol.md), which also defines the LED colors and the module functions (`showTime`, `showMessage`, `setLedState`, `pollButtons`).

## Board

Any board with the **original ESP32** chip (ESP32-WROOM-32 or WROVER module): the ESP32 DevKit, the Heltec WiFi LoRa 32 V2 and most ESP32 dev boards. The build uses PlatformIO's generic `esp32dev` board, which also runs on boards with more than 4 MB of flash. Boards with a newer chip (ESP32-S2, S3, C3, C6, for example the Heltec V3) need a different build and are not supported.

The default pins are the box PCB's (an ESP32 DevKit with the surrender buttons, the two LCDs and the strip); see [Pins](#pins). A board wired differently changes them in `platformio.ini`, without touching the code; see [Other boards](#other-boards).

If the board's serial port does not show up, install the USB-serial driver for the chip on the board (usually CP210x or CH340).

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

The protocol logic (`lib/ArenaLogic`), the button debounce (`lib/Buttons`) and the LCD text (`lib/Display`) have unit tests that run on the computer, without the board. They need a host C++ compiler (on macOS, the Xcode Command Line Tools):

```sh
pio test -e native
```

To remove everything later: `uv tool uninstall platformio`, `rm -rf ~/.platformio` and `rm -rf apps/firmware/.pio`.

## Setup (Windows)

Install [Git for Windows](https://git-scm.com/download/win) first; PlatformIO needs it. Then install PlatformIO in one of two ways:

- **uv**, as on macOS: `uv tool install platformio`, then run the same `pio` commands from `apps/firmware` in PowerShell.
- **VS Code**: install the [PlatformIO IDE extension](https://marketplace.visualstudio.com/items?itemName=platformio.platformio-ide) and open `apps/firmware` as the project; build, upload and the serial monitor are in the PlatformIO toolbar.

Two extra fixes:

1. **Long paths.** Unpacking `esp32-arduino-libs` on the first build fails unless Windows allows paths over 260 characters. Turn them on once, in PowerShell **as administrator**, then restart the terminal:

   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
   ```

2. **`pioarduino` version.** The pinned platform installs `pioarduino==6.2.0.post1` into `~\.platformio\penv`, and on Windows it then rejects its own platform (`6.2.0.post1` is read as a pre-release of 6.2.0, so `>=6.2.0` fails). If the build stops with that version error, pin it. With the VS Code extension (its penv has `pip`):

   ```powershell
   & "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" -m pip install --force-reinstall --no-deps "pioarduino==6.2.0"
   ```

   With uv (its penv has no `pip`):

   ```powershell
   uv pip install --python "$env:USERPROFILE\.platformio\penv\Scripts\python.exe" --reinstall --no-deps "pioarduino==6.2.0"
   ```

To remove everything later: `uv tool uninstall platformio` (or uninstall the VS Code extension), then delete `%USERPROFILE%\.platformio` and `apps\firmware\.pio`.

## Old countdown sketch

`main.cpp`, `Definitions.h` and `lcd_led_botao_01.cpp` in this folder are the earlier Arduino sketch. They are kept for reference and are **not** built by PlatformIO (only `src/` is). Their pins clash with the Heltec V2's OLED and LoRa pins (see [Other boards](#other-boards)). To run one, open it in the Arduino IDE, upload it, and open the Serial Monitor at **115200 baud** with "New Line" enabled.

| Input | Effect |
| --- | --- |
| `90` or `1:30` | Start a countdown of that length |
| `p` | Pause / resume |
| `r` | Reset to waiting |
| Button (GPIO 27) | Stop the countdown |

## Configuration

Each box needs its own `config.h` in this folder, next to `platformio.ini` (the build adds this folder to the include path). Get it from the web app: **Arenas** in the top bar (`/arenas`), create the arena (or generate a new token) and download `config.h`. The token is shown only once. Fill in `WIFI_SSID` and `WIFI_PASSWORD`, then flash. The file is git-ignored; [`config.example.h`](config.example.h) shows the format.

## Connection

`src/arena.cpp` connects the box to the API's [`/arena` WebSocket](../../docs/arena-protocol.md); other modules use only the functions in `src/arena.h` (listed under "Firmware modules" in the protocol doc). Until the display and strip exist (#42), `src/main.cpp` is a demo:

- The onboard LED (`PIN_ONBOARD_LED`, GPIO 2 on the DevKit) is on while the box is connected (after `welcome`).
- Typing `a` or `b` in the serial monitor sends `surrender` for side A or B.
- Each press of a physical surrender button prints `button: A` or `button: B` (it does not send anything yet; that is #42).
- Both LCDs show `CROSSLISEU` / `03:00` after boot. In the serial monitor, `t` starts a 3-minute test countdown on them (`TEMPO RESTANTE`), `p` stops it and shows `PAUSADA`, and `1` / `2` show `showTime(185000)` / `showTime(94210)` (`03:05` / `01:35`).
- The serial log shows each step, prefixed `arena:`: Wi-Fi, connecting, `welcome`, each `state`, and every close with its code and the next retry. The token is never printed.

| Close | The box |
| --- | --- |
| `4001` (bad device id / token) or `4004` (protocol) | Retries every 60 s |
| `4003` (another box logged in with the same id) | Stops until it is rebooted |
| Anything else, or nothing heard for 30 s | Retries after 1 s, doubling up to 30 s |

The WebSocket library is a patched copy of arduinoWebSockets 2.7.2 in `lib/WebSockets`, so the box can read the server's close code; see [`lib/WebSockets/CROSSLISEU_PATCH.md`](lib/WebSockets/CROSSLISEU_PATCH.md). The server certificate is checked against the ISRG Root X1 and X2 certificates in `src/arena_ca.h`.

To test the arena flow without the hardware, the simulator in [`tools/arena-sim`](../../tools/arena-sim/arena-sim.mjs) logs in with the same `config.h`: `node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h`.

## LCD screens

Line 1 is `showMessage`, line 2 is `showTime`. The display only draws what it is given; the integration (#42) picks the screen from each `state`. These are the texts agreed for the box (the LCD has no accents; `showMessage` drops them, so `DESISTÊNCIA` shows as `DESISTENCIA`):

| Box state | Line 1 | Line 2 |
| --- | --- | --- |
| Not connected | `SEM CONEXAO` | (empty) |
| `idle` | `AGUARDANDO LUTA` | (empty) |
| `scheduled` | `PREPARAR` | `remainingMs`, frozen |
| `ongoing` | `TEMPO RESTANTE` | counting down |
| `paused` | `PAUSADA` | frozen |
| `finished`, `time_out` | `FIM DE TEMPO` | `00:00` |
| `finished`, `surrender` | `DESISTENCIA` | frozen |
| `finished`, `manual` | `LUTA ENCERRADA` | frozen |

`state` does not say which side surrendered (docs/arena-protocol.md, "End reasons"), so the screen is the same for both. The box never shows a surrender on its own when a button is pressed: it waits for the server's `state` with `endReason` `surrender`, so the LCDs and the web app always agree.

## Strip states

| State | Colour |
| --- | --- |
| Waiting | White, blinking |
| Counting | White |
| Stopped | Red |
| Finished | Blinks green, then solid blue |

## Pins

All pins are in [`src/pins.h`](src/pins.h). The defaults are the box PCB's (ESP32 DevKit):

| Signal | Name in `pins.h` | GPIO |
| --- | --- | --- |
| Onboard LED | `PIN_ONBOARD_LED` | 2 |
| Surrender, side A | `PIN_SURRENDER_A` | 27 |
| Surrender, side B | `PIN_SURRENDER_B` | 32 |
| LCD U3 | `PIN_LCD1_SDA`, `PIN_LCD1_SCL` | SDA 21, SCL 23 |
| LCD U4 | `PIN_LCD2_SDA`, `PIN_LCD2_SCL` | SDA 18, SCL 19 |
| LED strip (#42) | (colors confirmed in #42) | 25, 26, 33 |

The strip is not driven yet (#42). Each LCD has its own I2C bus, so the ESP32's two I2C controllers are both in use.

Surrender buttons (`src/buttons.cpp`) use the internal pull-up; the other contact terminal goes to GND. `SURRENDER_A_PRESSED` and `SURRENDER_B_PRESSED` are what the pin reads with the button pressed: `LOW` for a normally open (NO) contact, `HIGH` for a normally closed (NC) one. On the PCB, side A is NO (`LOW`) and side B is NC (`HIGH`).

A press counts once, after the reading stays the same for 30 ms; holding the button counts nothing more. A button already pressed at boot (or an NC button with a loose wire) is not a press.

LCDs (`src/display.cpp`): two 16x2 LCDs with a PCF8574 I2C backpack, U3 on `Wire` and U4 on `Wire1`, both showing the same thing. The I2C address is found at boot (0x20-0x27 or 0x38-0x3F) and printed as `display: LCD U3 at 0x27`. VCC is 5 V.

U3's SCL is 23 on the PCB (checked on the bench); the old `lcd_led_botao_01.cpp` had it on 22.

`displayPoll()`, called every loop, checks one LCD every 500 ms (each LCD every 1 s) and redraws each line every 10 s to repair a garbled screen. An LCD that stops answering or comes back from a reset (power glitch, loose 5 V wire) is set up again and redrawn, and one missing at boot is looked for every 2 s. Each change is logged (`display: LCD U3 lost or reset, reconnecting`).

### Other boards

The quickest way to change pins is the `PLATFORMIO_BUILD_FLAGS` environment variable, which adds `-D` flags (the names in the table above) to the build without editing any file. For example, the Heltec WiFi LoRa 32 V2's onboard LED is on GPIO 25:

```sh
PLATFORMIO_BUILD_FLAGS="-DPIN_ONBOARD_LED=25" pio run -t upload
```

In PowerShell, set it first; it lasts until the terminal is closed (or `Remove-Item Env:PLATFORMIO_BUILD_FLAGS`):

```powershell
$env:PLATFORMIO_BUILD_FLAGS = "-DPIN_ONBOARD_LED=25"
pio run -t upload
```

To keep the pins for a board (or to build from the VS Code toolbar), add an env to [`platformio.ini`](platformio.ini) that extends `esp32dev` and changes only the pins that differ:

```ini
[env:my_board]
extends = env:esp32dev
build_flags = ${env:esp32dev.build_flags} -DPIN_ONBOARD_LED=25 -DPIN_SURRENDER_A=13 -DSURRENDER_B_PRESSED=LOW
```

Then build and flash it with `pio run -e my_board -t upload` (in VS Code, pick the env in the PlatformIO toolbar). Keep `${env:esp32dev.build_flags}` at the start, or `config.h` is not found.

Pins to avoid: 6 to 11 (wired to the flash memory), 34 to 39 for buttons (no internal pull-up), and 0, 2, 5, 12 and 15 for buttons (the chip reads them at boot).

On the **Heltec WiFi LoRa 32 V2**, the onboard LED is GPIO 25, and these pins are wired to the OLED and the LoRa radio: 4, 15, 16 (OLED), 21 (OLED power), 0 (PRG button), 5, 14, 18, 19, 26, 27 (LoRa), 34, 35. The firmware does not use the OLED or the radio, but several PCB defaults (18, 19, 21, 25, 26, 27) are on these pins, so move them. For the current demo, `-DPIN_ONBOARD_LED=25` is enough for the LED and buttons: button A on 27 still works because the radio is not used, and 32 is free; to keep off the radio's pins, add `-DPIN_SURRENDER_A=13`. The LCDs are in the demo too, so also move `PIN_LCD1_SDA` (21) and `PIN_LCD2_SDA` / `PIN_LCD2_SCL` (18, 19) to free pins; otherwise the demo drives the OLED power and LoRa lines as I2C.

For the old `main.cpp` / `Definitions.h`:

| Signal | GPIO |
| --- | --- |
| Red | 25 |
| Green | 26 |
| Blue | 16 |
| Button | 27 |

## Files

- `platformio.ini`: board, platform version and build settings
- `src/main.cpp`: demo of the connection layer, the buttons and the LCDs (onboard LED, serial `a`/`b`/`t`/`p`/`1`/`2`, `button: A`/`B`) until #42
- `src/arena.h`, `src/arena.cpp`: connection layer (Wi-Fi, WebSocket, handshake, retries)
- `src/arena_ca.h`: root certificates for `wss://`
- `src/pins.h`: every pin number, with the box PCB's defaults
- `src/buttons.h`, `src/buttons.cpp`: surrender buttons (`buttonsBegin`, `pollButtons`)
- `src/display.h`, `src/display.cpp`: both LCDs (`displayBegin`, `displayPoll`, `showTime`, `showMessage`)
- `lib/Display/`: LCD text (mm:ss, centring, accents) with no Arduino dependency
- `lib/Buttons/`: debounce logic with no Arduino dependency
- `lib/ArenaLogic/`: protocol logic with no Arduino dependency (URL, retry policy, JSON frames)
- `lib/WebSockets/`: patched arduinoWebSockets 2.7.2
- `test/test_arena_logic/`: unit tests for `lib/ArenaLogic` (`pio test -e native`)
- `test/test_buttons/`: unit tests for the debounce in `lib/Buttons` (`pio test -e native`)
- `test/test_display/`: unit tests for the LCD text in `lib/Display` (`pio test -e native`)
- `main.cpp`: old sketch: setup, serial commands and state machine
- `Definitions.h`: pin numbers and the state enum
- `config.example.h`: template for the git-ignored `config.h` (server address, device id and token, Wi-Fi)
- `lcd_led_botao_01.cpp`: variant that also drives two 16x2 I2C LCDs, with different strip wiring (green 33, blue 26); see the header comment in the file
