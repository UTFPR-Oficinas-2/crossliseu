# `/arena` protocol

The full contract (URL, envelope, every message, close codes, examples) is tracked in #32.
This file currently holds the decisions that other issues depend on.

## Decisions

### Surrender while the fight is paused (#30)

**Rule:** a `surrender` is valid only while the arena's current fight has `status: "running"`.
In any other status (`idle`, `waiting`, `paused`, `finished`) the server rejects it with an `error` and leaves the fight unchanged.

```json
{ "event": "surrender", "data": { "side": "A", "id": "b7c1" } }
```

Reply when the fight is paused:

```json
{
  "event": "error",
  "data": {
    "code": "fight_not_running",
    "message": "Surrender is only accepted while the fight is running",
    "ref": "b7c1"
  }
}
```

**Why:**

- A pause is a stop called by the operator (to fix a robot, check the arena, etc.). A button pressed during that time is more likely an accident or someone handling the robot than a real decision to give up.
- It keeps a single rule for the server and firmware: only a running fight can end by surrender, just like only a running fight can end by time.
- A competitor who really wants to give up can press the button again once the fight is resumed, or ask the operator to end it.

The ESP32 should not hide the buttons while paused; it sends the message and lets the server decide, since the server is the only source of truth.
