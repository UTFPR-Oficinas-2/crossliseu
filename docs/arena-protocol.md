# `/arena` WebSocket protocol

The contract between an arena's ESP32 box and the API. The firmware (`apps/firmware/`) and the gateway (`apps/api`) are built against this document, so a change here is a change to both.

## Roles

- **The server owns the match.** Status, timer, end reason and whether a surrender counts are decided only by the server.
- **The box owns the physical arena.** It shows the timer and the light color to the competitors and reports surrender button presses. It never decides anything about the match. What the box shows is always what the server last sent.
- **The box is optional.** A match can be selected, started, run and ended from the web app with no box connected. Nothing is ever blocked by an offline arena, and a box that drops mid-match does not affect the match (see [Disconnects](#disconnects)).
- **Only competitors use the box.** The operator and the referees use the web app; their actions reach the box only as a new `state`.

## Arenas and matches

An arena is the physical space where two robots fight. It has exactly one box, and at most one match at a time.

The arena has no match until the operator opens the lobby for a match (the one the referees join) and selects which match runs on this arena. From then until the operator closes that match, it is the arena's **current match**, and every `state` sent to the box describes it. Undoing a pick before Start is `DELETE /arenas/:id/current-match`, refused once the match has started. Closing a finished match is `POST /matches/:id/close`, which also clears it as the arena's current match. With no current match, the box gets `idle`.

Before Start, the operator can change the selection (for example, after picking the wrong match). The box then gets a new `scheduled` with the new `matchId`.

## Connection

| | |
| --- | --- |
| Path | `/arena` |
| Production URL | `wss://ediasv.dev/crossliseu/api/arena` |
| Who connects | Always the box. The server never dials out. |
| Frames | Text frames, one JSON object each |
| Protocol version | `1` |
| Max frame size | 4 KiB; larger frames close the socket with `1009` |

Connecting happens in two layers. First the box's WebSocket library opens the socket (an HTTP request with `Upgrade: websocket`, answered with `101 Switching Protocols`); no protocol data is exchanged yet. Then, on the open socket, the box logs in with [`hello`](#hello). Credentials travel in `hello`, not in the URL or headers, so that a refusal arrives as one of our [close codes](#close-codes) and the token never shows up in proxy logs.

### Identity

Each physical arena box is flashed with its `deviceId` and `token`. Both come from the Arenas page of the web app (#33), where an account creates the box's row in the `arenas` table; that table is not tied to a championship, so a box is flashed once and works for every event. An arena belongs to exactly one account. The table stores only a bcrypt hash of the token: the page shows the plain token once, and generating a new token for the arena invalidates the old one. Only live (not deleted) arenas are accepted at handshake; deleting an arena makes its token stop working. The values live in a firmware `config.h` that is **not committed**. Swapping the ESP32 inside a box means flashing the new chip with the same values.

### Handshake

The server handles a new socket in this order:

1. **Wait for `hello`.** If no `hello` arrives within 5 s of opening the socket, close with `4002`. Any other message before `welcome` is answered with `error` (`not_authenticated`) and ignored; the 5 s limit keeps running.
2. **Check credentials.** If `deviceId` / `token` are wrong, the arena is unknown or has been deleted (only live arenas are accepted), or a field is missing or has the wrong type, close with `4001`.
3. **Check the version.** If `protocol` is not supported, close with `4004`.
4. **Replace any older connection.** If another socket is already logged in with the same `deviceId`, close that old one with `4003`. This happens only here, after the new socket proved its credentials, so a socket that merely knows a `deviceId` cannot knock a box offline.
5. **Accept.** Reply `welcome`, then immediately a `state`.

A second `hello` on a socket that already got `welcome` is answered with `error` (`already_authenticated`) and ignored.

Until `welcome` arrives, the box shows **not connected**, even if the socket is open.

### Testing without a box

[`tools/arena-sim/arena-sim.mjs`](../tools/arena-sim/arena-sim.mjs) plays the box from a terminal: it sends `hello`, prints every message, sends `surrender` A or B on a key press, and reconnects with the backoff below. It reads the same `config.h` the box is flashed with. See the header of the script for usage.

```sh
node tools/arena-sim/arena-sim.mjs --config apps/firmware/config.h --url ws://localhost:3000/arena
```

## Envelope

Every message, in both directions:

```json
{ "event": "<name>", "data": { } }
```

- Unknown `event` names are answered with `error` (`unknown_event`) and otherwise ignored.
- Unknown fields inside `data` are ignored, so fields can be added without breaking older firmware.

## Messages

### Box → server

#### `hello`

Sent once, as the first message on every new connection.

| Field | Type | Notes |
| --- | --- | --- |
| `deviceId` | string | Flashed into the firmware |
| `token` | string | Flashed into the firmware; stored hashed on the server |
| `protocol` | integer | Protocol version the firmware speaks; currently `1` |

```json
{ "event": "hello", "data": { "deviceId": "arena-da-garagem-7f3a", "token": "k3V9...q7", "protocol": 1 } }
```

#### `surrender`

Sent on every surrender button press, without checking the local state. The server decides whether it counts.

| Field | Type | Notes |
| --- | --- | --- |
| `side` | `"A"` \| `"B"` | Which competitor's button was pressed |
| `matchId` | string \| null | The `matchId` from the last `state` the box received |

```json
{ "event": "surrender", "data": { "side": "B", "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33" } }
```

A surrender counts only when the arena's current match is `ongoing` **and** `matchId` matches it. It then ends the match with `endReason` `surrender`, and the other side wins. `matchId` stops a late press from landing on the next match. In any other case (paused, scheduled, finished, no match, wrong `matchId`) the server replies with `error` (`surrender_rejected`) and the match stays as it is. A paused match cannot be surrendered (decided in #30). A second press after the match ended is rejected the same way, so a match can only end once.

Presses while the box is not connected are dropped, not queued.

### Server → box

#### `welcome`

The handshake succeeded. The box now shows **connected**. A `state` always follows.

| Field | Type | Notes |
| --- | --- | --- |
| `arenaName` | string | For example `"Arena 01"`; the box may show it |

```json
{ "event": "welcome", "data": { "arenaName": "Arena 01" } }
```

#### `state`

A **full snapshot** of what the box should show. It is sent right after `welcome` and again every time anything in it changes, never on a schedule. Each `state` replaces whatever the box had; the box never has to combine messages.

| Field | Type | Notes |
| --- | --- | --- |
| `status` | `"idle"` \| `"scheduled"` \| `"ongoing"` \| `"paused"` \| `"finished"` | See [Statuses](#statuses) |
| `matchId` | string \| null | `null` only when `idle` |
| `remainingMs` | integer \| null | Time left on the match clock when the message was sent; `null` only when `idle` |
| `endReason` | `"time_out"` \| `"manual"` \| `"surrender"` \| null | Set only when `finished`; see [End reasons](#end-reasons) |
| `robots` | `{ "A": { "name": string }, "B": { "name": string } }` \| null | `null` only when `idle`; the box may show the names |

The score is never sent: competitors do not see it on the box.

Examples:

```json
{ "event": "state", "data": { "status": "idle", "matchId": null, "remainingMs": null, "endReason": null, "robots": null } }
```

```json
{ "event": "state", "data": {
  "status": "scheduled",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 180000,
  "endReason": null,
  "robots": { "A": { "name": "Tritura" }, "B": { "name": "Ferrugem" } }
} }
```

```json
{ "event": "state", "data": {
  "status": "ongoing",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 180000,
  "endReason": null,
  "robots": { "A": { "name": "Tritura" }, "B": { "name": "Ferrugem" } }
} }
```

```json
{ "event": "state", "data": {
  "status": "paused",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 94210,
  "endReason": null,
  "robots": { "A": { "name": "Tritura" }, "B": { "name": "Ferrugem" } }
} }
```

```json
{ "event": "state", "data": {
  "status": "finished",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 61530,
  "endReason": "surrender",
  "robots": { "A": { "name": "Tritura" }, "B": { "name": "Ferrugem" } }
} }
```

#### `error`

Something the box sent was rejected. The connection stays open. What the box shows, if anything, is up to the firmware.

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | One of the codes below |
| `message` | string | Human-readable, for the serial log |

| `code` | When |
| --- | --- |
| `bad_frame` | The frame is not valid JSON or has no `event` |
| `unknown_event` | `event` is not a box → server message |
| `invalid_data` | `data` is missing a field or has a wrong type (except in `hello`, which closes with `4001`) |
| `not_authenticated` | A message other than `hello` arrived before `welcome` |
| `already_authenticated` | A second `hello` arrived after `welcome` |
| `surrender_rejected` | The surrender does not count (see [`surrender`](#surrender)) |

```json
{ "event": "error", "data": { "code": "surrender_rejected", "message": "Match is paused" } }
```

## Statuses

`status` describes the arena, not only the match. The box adds one local state of its own, **not connected**, which no message carries.

| Box shows | `status` | Meaning | Surrender buttons |
| --- | --- | --- | --- |
| Not connected | (local) | No `welcome` yet: booting, retrying or rejected | Dropped |
| Connected | `idle` | Online, no current match on this arena | Sent, rejected |
| Ready | `scheduled` | A match is selected for this arena, waiting for Start | Sent, rejected |
| Running | `ongoing` | The match clock is running | Sent, may end the match |
| Paused | `paused` | The operator paused the match; clock frozen | Sent, rejected |
| Ended | `finished` | The match is over, waiting for the operator to close it; `endReason` says why | Sent, rejected |

Transitions, all driven by the server:

- `idle → scheduled`: the operator opens the lobby and selects the match for this arena.
- `scheduled → scheduled`: the operator selects a different match before Start (new `matchId`).
- `scheduled → idle`: the operator drops the selection without starting.
- `scheduled → ongoing`, `ongoing ⇄ paused`: the operator starts, pauses and resumes.
- `ongoing → finished`: the clock reaches zero (`time_out`), a valid surrender (`surrender`), or the operator ends it (`manual`).
- `paused → finished`: only the operator can end a paused match (`manual`).
- `finished → idle`: the operator confirms closing the match. There is no direct `finished → scheduled`: the next match is selected after closing. Until then the box keeps showing the result.

`scheduled`, `ongoing`, `paused` and `finished` are the API's match states (`MatchState` in `apps/api/src/modules/matches/entities/match.entity.ts`), with no translation. `idle` is the arena's own status: it has no match.

### End reasons

`endReason` uses the same values everywhere: the database, the REST API, the browser channel and this protocol. No layer translates them.

| `endReason` | Meaning |
| --- | --- |
| `time_out` | The match clock reached zero |
| `manual` | The operator ended the match |
| `surrender` | A competitor surrendered |

The side that surrendered is not part of the value or of `state`: the API records the winner (`winner_robot_id`, the other side), and the box shows the same color for either side.

**Planned (#57, Final delivery milestone): correcting the end reason.** Right after a match ends, in the step where the operator confirms closing it, the operator will be able to change `endReason` (for example from `manual` to `surrender` when the box was offline and a competitor asked to give up). Because the match is still `finished` at that point, a correction sends the box a new `state` with the new `endReason`. After closing, the result is final.

## Timer

- The box runs its own countdown. The server does **not** stream the time.
- Every `state` carries `remainingMs`, and the box resets its countdown to that value on each one. Start, pause, resume and reconnect each send a `state`, so every screen resyncs at those moments.
- `remainingMs` is the value when the server sent the message; network delay is ignored.
- While `paused`, `scheduled` or `finished`, the box shows `remainingMs` frozen.
- The time is shown as `mm:ss`, **rounded up** to the next whole second: `94210` shows `01:35`, and `00:00` appears only once the time is actually up.
- **The server decides when time is up.** When the box's own countdown reaches zero, it shows `00:00` and waits. It switches to ended only when the server sends `state` with `status: "finished"`. This avoids the box declaring the end while a surrender is still in flight.

## Close codes

WebSocket close codes 4000–4999 are reserved for applications; these are ours. The box uses them to decide how to retry.

| Code | Sent by server when | Box should |
| --- | --- | --- |
| `4001` | `deviceId` / `token` is wrong, the arena is unknown or deleted, or `hello` is malformed | Show "not connected" (bad config) and retry every 60 s |
| `4002` | No `hello` within 5 s of opening | Retry with normal backoff |
| `4003` | A newer connection with the same `deviceId` logged in and replaced this one | **Stop retrying** until rebooted, so two boxes do not keep replacing each other |
| `4004` | `protocol` version is not supported | Show "not connected" (update firmware) and retry every 60 s |

Any other close (network loss, server restart, close code `1001`, `1006`, ...) is handled with normal backoff.

The server can also close with `1001` (it is shutting down), `1011` (it could not check the credentials, for example the database is down or slower than 5 s) or `1013` (too many logins are being checked at once). All of them mean: retry with normal backoff.

## Disconnects

- **Server-side detection.** The server sends a WebSocket ping every 10 s and drops a box that does not answer within 10 s. The arena is shown offline in the web app as soon as its socket closes, except when the socket was replaced (`4003`): the new connection keeps it online.
- **Box-side detection.** The box expects a server ping every 10 s. If it hears nothing from the server (no ping, no message) for 30 s, it treats the connection as lost, closes it and reconnects with normal backoff. This catches connections that die silently, such as a router or proxy restart that never delivers a close.
- **During a match the box is ignored.** The match keeps running on the server. Competitors cannot surrender; if they want to, the operator ends the match (`manual`).
- **On the box.** It goes back to not connected, drops button presses and reconnects.
- **Reconnect** is just connecting again: `hello`, `welcome`, then a `state` with the current status and `remainingMs`. No special messages.

### Reconnect backoff

After any close not covered above: wait 1 s, then double the wait on each failed attempt up to 30 s. Reset to 1 s after a `welcome`.

## LED colors

The strip is an RGB strip driven on/off per channel, so these are its eight possible colors. They are the agreed defaults; changing them is a firmware-only change, but update this table too.

| Box state | Color |
| --- | --- |
| Not connected | Magenta, blinking |
| Connected (`idle`) | Cyan |
| Ready | White, blinking |
| Running | White |
| Paused | Yellow |
| Ended (`time_out`, `manual`) | Blue |
| Ended (`surrender`) | Red |

## Firmware modules

The firmware is split so the display, LED, button and network parts can be built separately and joined in #42. Each module exposes these functions:

```cpp
// Display (#39): both competitor LCDs
void showTime(long ms);                 // draws ms as mm:ss, rounded up; ms <= 0 shows 00:00
void showMessage(const char* text);     // status text, e.g. "Not connected", "Ready", "Time out"

// LED (#40)
enum class LedState { NotConnected, Connected, Ready, Running, Paused, Ended, Surrender };
void setLedState(LedState state);       // sets the color/blink from the table above; call every loop for blinking,
                                        // calling again with the same state keeps the blink going without restarting it

// Buttons (#41)
enum class Press { None, A, B };
Press pollButtons();                    // debounced; returns each press once

// Connection (#97): src/arena.h; the only code that touches Wi-Fi and the socket
void arenaBegin();                                 // Wi-Fi + socket, from config.h; once in setup()
void arenaLoop();                                  // every loop: Wi-Fi, reconnect, liveness, incoming frames
bool arenaConnected();                             // true between welcome and close
void onArenaState(void (*cb)(const ArenaState&));  // called on every valid `state`
bool arenaSendSurrender(char side);                // 'A' or 'B', with the last state's matchId; false if not connected
```

`ArenaState` (in `lib/ArenaLogic/src/arena_logic.h`) is one parsed `state`:

```cpp
enum class ArenaStatus : uint8_t { Idle, Ready, Running, Paused, Ended };
enum class EndReason   : uint8_t { None, TimeOut, OperatorEnded, SurrenderA, SurrenderB };
struct ArenaState {
  ArenaStatus status;
  char matchId[37];        // "" when null
  bool hasRemaining;       // false when remainingMs is null
  int32_t remainingMs;
  EndReason endReason;
  char robotA[33];         // "" when robots is null; longer names are cut on a UTF-8 boundary
  char robotB[33];
  uint32_t receivedAtMs;   // millis() when it arrived, the start point for the local countdown
};
```

The connection layer follows the [Handshake](#handshake), [Close codes](#close-codes) and [Disconnects](#disconnects) rules above, and ignores (and logs) malformed frames and unknown events. Each connect attempt blocks `arenaLoop()` while TCP and TLS are set up: normally under a second, at worst about 15 s (5 s TCP connect timeout plus 10 s TLS handshake timeout). That happens only while the box is already not connected.

The display only draws what it is given; it keeps no timer. The integration (#42) owns the countdown and joins the modules:

- On `state` it maps `status` / `endReason` to `setLedState` and `showMessage`, and resets the local countdown from `remainingMs`.
- Every loop while `ongoing`, it computes the time left (`remainingMs` minus the time since that `state` arrived) and passes it to `showTime`.
- On a press from `pollButtons()` it calls `arenaSendSurrender`, which drops the press when not connected.
- While `arenaConnected()` is false, it shows **not connected**.

How the text and time are laid out on the LCDs depends on the displays and is left to the firmware.
