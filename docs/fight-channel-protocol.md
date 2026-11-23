# `/fights` WebSocket protocol

The contract between the browser (operator screen, referee screen) and the API for following a match live. It replaces polling `GET /matches/:id/state`: the server pushes a `state` frame on every committed change of the match. The `/arena` box protocol is separate (see [arena-protocol.md](./arena-protocol.md)) and unchanged.

## Connection

| | |
| --- | --- |
| Path | `/fights` |
| Who connects | Browsers. The server never dials out. |
| Frames | Text frames, one JSON object `{ "event": string, "data": any }` each |
| Max frame size | 4 KiB; larger frames close the socket with `1009` |
| Auth deadline | The first frame must arrive within 5 s |

A socket follows exactly one match. To follow another, open another socket.

## Frames

### Client to server

`auth` must be the first frame. A second `auth` is an `error`, not a re-subscription.

```json
{ "event": "auth", "data": { "matchId": "<uuid>", "token": "<credential>", "name": "optional" } }
```

- `token` is the operator's login JWT, or (once #18 lands) a referee credential.
- `name` is optional; it is for referee credentials, whose verifier may want a display name.

### Server to client

| Event | When | `data` |
| --- | --- | --- |
| `state` | Right after a successful `auth` (a full snapshot), then on every committed change of the match | The same shape as `GET /matches/:id/state`: `status`, `matchId`, `remainingMs`, `endReason`, `robots`, `score` (`{ A, B }`, each side's points summed over the three referees; never one referee's partial). The `/arena` `state` is the same without `score` |
| `ping` | Every 10 s on a subscribed socket | `null` |
| `error` | A frame the server refuses; the socket stays open | `{ "code": string, "message": string }` |

**Operator extras.** A socket authenticated as an operator receives the same `state` plus `closed`, `hasSelectedArena` and `winnerSide`. Referees get only the public shape.

**Snapshots.** Every subscribe starts with a full `state`; there is no resume or diff. A socket's last frame is never older than the last committed change, including a change that lands while the first snapshot is being read.

**Heartbeat.** Browsers can't see WebSocket-level pings, so a subscribed socket gets `{"event":"ping","data":null}` every `PING_INTERVAL_MS` (10 s). Clients ignore the frame; its job is to be traffic. If no frame of any kind arrives for 3 x `PING_INTERVAL_MS` (30 s), the connection is half-open: close it and reconnect.

**Error codes** (`data.code`): `bad_frame` (binary, not JSON, or no non-empty string `event`), `unknown_event`, `invalid_data` (reserved for events added later, such as #18's scores; not sent today), `not_authenticated` (any frame before `auth`), `already_authenticated`.

## Close codes

| Code | Reason | Meaning | Client action |
| --- | --- | --- | --- |
| `4001` | `bad_credentials` | The credential was refused: the token is missing, malformed, expired, rejected, or its user no longer exists. Only a refusal gets `4001`; a server fault while checking is `1011` | Terminal. Do not retry; log the operator out. |
| `4002` | `auth_timeout` | No `auth` within 5 s | Retry with backoff |
| `4005` | `match_not_found` | The match doesn't exist, was deleted while subscribed, or `matchId` isn't a UUID | Terminal. Do not retry; show "match not found". It never means "log out". |
| `1001` | `server_shutdown` | The server is restarting | Retry with backoff |
| `1013` | `server_busy` | Too many credential checks at once | Retry with backoff |
| `1011` | `internal_error` | The server failed while checking or subscribing | Retry with backoff |
| `1009` | | Frame over 4 KiB | Retried with backoff like any other non-terminal code (only `4001` and `4005` are terminal). A well-behaved client never sends a frame over 4 KiB |

Any other close (network drop, no frame for 30 s) is retried too.

### Reconnecting

Retry with exponential backoff and jitter (the shipped client starts at 500 ms, doubles each attempt up to a 10 s cap, and applies ±20% jitter to each wait), so that a server restart doesn't bring every browser back in lockstep. The backoff resets once a `state` frame arrives. The client's watchdog closes and reconnects after 30 s with no frame of any kind. Every reconnect re-sends `auth` and gets a fresh snapshot, so nothing needs replaying. There is no polling fallback on the operator screen: while disconnected, show it as stale.

## Access and verifiers

`auth` is checked by a `FightAccessRegistry`: it asks each registered `FightAccessVerifier` in turn and the first non-null answer wins.

```ts
interface FightAccessVerifier {
    verify(credential: { matchId: string; token: string; name: string | null }): Promise<FightAccess | null>;
}
type FightAccess = { role: 'operator'; userId: string } | { role: 'referee'; name: string };
```

The built-in `JwtFightAccessVerifier` accepts the operator's login JWT (and requires the user to still exist). A verifier that returns `null` means "not mine"; one that throws is logged and the others are still tried. If one accepts, it wins. If none accepts and none threw, the socket closes with `4001`; if none accepts and one threw, the check fails as a server fault and the socket closes with `1011` (retried by the client), never `4001`.

**Referees.** A referee first joins over HTTP (`POST /referee/join` with the match's shared token and a name, which seats them), then sends `auth` with `{ matchId, token, name }`: the shared token and that name. `RefereeFightAccessVerifier` (registered like the JWT verifier) accepts it when the name holds a seat on that `matchId` and the match is live and not closed, and returns `{ role: 'referee', name }`; it never seats anybody. A referee socket gets the same `state` as the public view.

**No match ownership check.** The channel does not check that the operator owns, or is otherwise allowed to see, the match: any operator JWT can watch any match, matching the public `GET /matches/:id/state?view=operator`. A verifier that needs to restrict access (such as a referee credential tied to one match) must check `credential.matchId` itself.

**Checked once, at `auth`.** The credential is verified only when the socket authenticates; a subscribed socket is never re-checked. An operator socket keeps receiving state after its JWT expires (harmless today: the operator view is public over HTTP) until it reconnects. A verifier whose credentials can be revoked while sockets are open (such as #18's referee token, which stops working once the fight is confirmed) must close those sockets itself, or add a re-check/close hook to this seam.
