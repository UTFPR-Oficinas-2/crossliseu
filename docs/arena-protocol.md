# `/arena` WebSocket protocol

The contract between an arena's ESP32 box and the API. The firmware (`firmware/`) and the gateway (`apps/api`) are built against this document, so a change here is a change to both.

## Roles

- **The server owns the match.** Status, timer, end reason and whether a surrender counts are decided only by the server.
- **The box owns the physical arena.** It shows the timer and the light color to the competitors and reports give-up button presses. It never decides anything about the match.
- **The box is optional.** A match can be started, run and ended from the web app with no box connected. Start is never blocked by an offline arena, and a box that drops mid-match does not affect the match (see [Disconnects](#disconnects)).
- **Only competitors use the box.** Admins and referees use the web app; their actions reach the box only as a new `state`.

## Connection

| | |
| --- | --- |
| Path | `/arena` |
| Production URL | `wss://ediasv.dev/crossliseu/api/arena` |
| Who connects | Always the box. The server never dials out. |
| Frames | Text frames, one JSON object each |
| Protocol version | `1` |

### Identity

Each physical arena box is flashed with its `deviceId` and `token`. They come from the `arenas` table (#33), which is not tied to a championship, so a box is flashed once and works for every event. The values live in a firmware config file that is **not committed**. Swapping the ESP32 inside a box means flashing the new chip with the same values.

### Handshake

1. The box opens the socket and sends `hello`.
2. The server checks `deviceId` and `token`:
   - valid: it replies `welcome`, then immediately a `state`.
   - invalid: it closes with `4001`.
3. If no valid `hello` arrives within 5 s of opening the socket, the server closes with `4002`.

Until `welcome` arrives, the box shows **not connected**, even if the socket is open.

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
{ "event": "hello", "data": { "deviceId": "arena-01", "token": "k3V9...q7", "protocol": 1 } }
```

#### `surrender`

Sent on every give-up button press, without checking the local state. The server decides whether it counts.

| Field | Type | Notes |
| --- | --- | --- |
| `side` | `"A"` \| `"B"` | Which competitor's button was pressed |
| `matchId` | string \| null | The `matchId` from the last `state` the box received |

```json
{ "event": "surrender", "data": { "side": "B", "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33" } }
```

A surrender counts only when the arena's current match is `running` **and** `matchId` matches it. `matchId` stops a late press from landing on the next match. In any other case (paused, ready, ended, no match, wrong `matchId`) the server replies with `error` (`surrender_rejected`) and the match stays as it is. A paused match cannot be surrendered (decided in #30).

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
| `status` | `"idle"` \| `"ready"` \| `"running"` \| `"paused"` \| `"ended"` | See [Statuses](#statuses) |
| `matchId` | string \| null | `null` only when `idle` |
| `remainingMs` | integer \| null | Time left on the match clock when the message was sent; `null` only when `idle` |
| `endReason` | `"time_out"` \| `"admin_ended"` \| `"gave_up_A"` \| `"gave_up_B"` \| null | Set only when `ended` |
| `robots` | `{ "A": { "name": string }, "B": { "name": string } }` \| null | `null` only when `idle`; the box may show the names |

The score is never sent: competitors do not see it on the box.

Examples:

```json
{ "event": "state", "data": { "status": "idle", "matchId": null, "remainingMs": null, "endReason": null, "robots": null } }
```

```json
{ "event": "state", "data": {
  "status": "ready",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 180000,
  "endReason": null,
  "robots": { "A": { "name": "Tritura" }, "B": { "name": "Ferrugem" } }
} }
```

```json
{ "event": "state", "data": {
  "status": "running",
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
  "status": "ended",
  "matchId": "6f1c2a9e-0b7d-4a51-9d0e-2c8f4e1a7b33",
  "remainingMs": 61530,
  "endReason": "gave_up_B",
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
| `invalid_data` | `data` is missing a field or has a wrong type |
| `surrender_rejected` | The surrender does not count (see [`surrender`](#surrender)) |

```json
{ "event": "error", "data": { "code": "surrender_rejected", "message": "Match is paused" } }
```

## Statuses

`status` describes the arena, not only the match. The box adds one local state of its own, **not connected**, which no message carries.

| Box shows | `status` | Meaning | Give-up buttons |
| --- | --- | --- | --- |
| Not connected | (local) | No `welcome` yet: booting, retrying or rejected | Dropped |
| Connected | `idle` | Online, no match open on this arena | Sent, rejected |
| Ready | `ready` | A match is open on this arena, waiting for Start | Sent, rejected |
| Running | `running` | The match clock is running | Sent, may end the match |
| Paused | `paused` | The admin paused the match; clock frozen | Sent, rejected |
| Ended | `ended` | The match is over; `endReason` says why | Sent, rejected |

Transitions, all driven by the server:

- `idle → ready`: the admin opens a match on this arena.
- `ready → running`, `running ⇄ paused`: the admin starts, pauses and resumes.
- `running → ended`: the clock reaches zero (`time_out`), a valid surrender (`gave_up_A` / `gave_up_B`), or the admin ends it (`admin_ended`).
- `paused → ended`: only the admin can end a paused match (`admin_ended`).
- `ended → ready` or `ended → idle`: the admin opens the next match on this arena, or leaves it with none. The box keeps showing the result until then.

Mapping to the API's match status (`MatchState` in `apps/api/src/modules/matches/entities/match.entity.ts`): `ready` = `waiting`, `running` = `running`, `paused` = `paused`, `ended` = `finished`. `idle` has no match.

If the admin later corrects an end reason in the web app (for example from `admin_ended` to a give-up after a box was offline), the box is not told; it only reflects live matches.

## Timer

- The box runs its own countdown. The server does **not** stream the time.
- Every `state` carries `remainingMs`, and the box resets its countdown to that value on each one. Start, pause, resume and reconnect each send a `state`, so every screen resyncs at those moments.
- `remainingMs` is the value when the server sent the message; network delay is ignored.
- While `paused`, `ready` or `ended`, the box shows `remainingMs` frozen.
- **The server decides when time is up.** When the box's own countdown reaches zero, it shows `0:00` and waits. It switches to ended only when the server sends `state` with `status: "ended"`. This avoids the box declaring the end while a surrender is still in flight.

## Close codes

WebSocket close codes 4000–4999 are reserved for applications; these are ours. The box uses them to decide how to retry.

| Code | Sent by server when | Box should |
| --- | --- | --- |
| `4001` | `deviceId` / `token` is wrong | Show "not connected" (bad config) and retry every 60 s |
| `4002` | No valid `hello` within 5 s of opening | Retry with normal backoff |
| `4003` | A newer connection with the same `deviceId` replaced this one | **Stop retrying** until rebooted, so two boxes do not keep replacing each other |
| `4004` | `protocol` version is not supported | Show "not connected" (update firmware) and retry every 60 s |

Any other close (network loss, server restart, close code `1001`, `1006`, ...) is handled with normal backoff.

## Disconnects

- **Detection.** The server sends a WebSocket ping every 10 s and drops a box that does not answer within 10 s. The arena is shown offline in the web app as soon as its socket closes.
- **During a match the box is ignored.** The match keeps running on the server. Competitors cannot give up; if they want to, the admin ends the match and later corrects the end reason in the web app.
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
| Ended (`time_out`, `admin_ended`) | Blue |
| Ended (`gave_up_A`, `gave_up_B`) | Red |

## Firmware modules

The firmware is split so the display, LED, button and network parts can be built separately and joined in #42. Each module exposes these functions:

```cpp
// Display (#39): both competitor LCDs
void showTime(long ms);                 // draws the clock as m:ss; ms <= 0 shows 0:00
void showMessage(const char* text);     // status text, e.g. "Not connected", "Ready", "Time out"

// LED (#40)
enum class LedState { NotConnected, Connected, Ready, Running, Paused, Ended, GaveUp };
void setLedState(LedState state);       // sets the color/blink from the table above; call every loop for blinking

// Buttons (#41)
enum class Press { None, A, B };
Press pollButtons();                    // debounced; returns each press once
```

The network module (#42) owns the socket and calls these: on `state` it maps `status` / `endReason` to `setLedState` and `showMessage`, resets the local countdown from `remainingMs`; on a press from `pollButtons()` it sends `surrender` if connected and drops it otherwise. What exactly the screens show is left to the firmware.
