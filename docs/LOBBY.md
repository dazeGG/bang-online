# Private lobby and guest seats

This document describes the implemented private-lobby milestone: rooms, invitation links, guest seats, readiness, and refresh/reconnect restoration. Gameplay does not start yet.

## Model

| Concept    | Meaning                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room       | A private lobby identified by a 10-character **room code** (31-character readable alphabet, about 49 bits). The code is in the invitation link and is _not_ a credential.    |
| Seat       | One of at most seven places in a room, with a display name, a seat index (0–6), and a ready flag. Seat ids are public UUIDs, used for presence and host actions.             |
| Seat token | A 256-bit random secret returned **once**, when the seat is created. It is the only proof of seat ownership. PostgreSQL stores only its SHA-256 digest (`seats.token_hash`). |
| Host       | The room creator. When the host leaves, the role moves to the lowest occupied seat; the first guest to join an empty room becomes host.                                      |
| Revision   | `rooms.revision` increases with every accepted lobby mutation. Clients ignore views older than the one they hold. Presence-only updates may repeat a revision.               |

A waiting room may hold 1–7 seats. `canStart` is true only with 4–7 seats where every seat is ready (`canStartClassicMatch` in `packages/game-core`). Starting the match is the next milestone.

## Protocol

HTTP issues credentials; Socket.IO carries the authenticated session.

| Endpoint / event                       | Purpose                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /api/rooms` `{name}`             | Create a room and the host seat. `201` → `{roomCode, seatId, seatToken}` with `Cache-Control: no-store`.        |
| `POST /api/rooms/:code/seats` `{name}` | Take the lowest free seat. Errors: `404 room_not_found`, `409 room_full`, `409 name_taken`, `400 invalid_name`. |
| `GET /api/rooms/:code`                 | Invitation preview: seat count and whether the room is joinable. No names, ids, or secrets.                     |
| `lobby:attach` `{roomCode, seatToken}` | Authenticate the socket and return the full lobby view. Used after every connect/reconnect (full resync).       |
| `lobby:set-ready` `{ready}`            | Set (not toggle) readiness. Idempotent: repeating the same value does not change the revision.                  |
| `lobby:leave`                          | Delete the caller's seat. Every attached tab receives `lobby:closed {reason: 'left'}`.                          |
| `lobby:kick` `{seatId}`                | Host only, not self. The removed seat's tabs receive `lobby:closed {reason: 'kicked'}`.                         |
| `lobby:state` (server → client)        | Authoritative lobby view broadcast to attached sockets after each change and presence change.                   |

Mutating HTTP requests with a foreign `Origin` header are rejected (`403`), and the Socket.IO handshake already rejects foreign origins. All payloads are validated at runtime (`apps/server/src/lobby-validation.ts`); names are NFC-normalized, whitespace-collapsed, 1–24 code points, without control/format characters, and unique per room case-insensitively.

## Defined behavior

- **Refresh / reconnect / browser restart:** the browser keeps `{seatId, seatToken}` in `localStorage` under `bang:seat:<ROOM CODE>` and re-sends `lobby:attach` on every Socket.IO connect. The same seat, name, and readiness are restored; no duplicate seat is created. Seats and readiness are durable in PostgreSQL and survive a server restart.
- **Re-entry from the invitation link:** a browser that already holds a valid token for the room returns to its seat; otherwise it sees the join form. A rejected token is deleted locally and the join form is shown.
- **Multiple tabs:** tabs of one browser share the stored token and attach to the **same** seat. Every tab receives the same updates; a command from any tab applies to that seat; leaving or being removed revokes all tabs. The `storage` event lets an idle tab notice a join or leave made by another tab.
- **Wrong, malformed, or cross-room token:** `invalid_session`, with no lobby data and no room subscription. Unknown and malformed tokens are indistinguishable. A token is valid only together with its own room code.
- **Full room:** the eighth join gets `room_full`; concurrent joins are serialized by a `SELECT … FOR UPDATE` lock on the room row, so the limit and unique seat indexes hold under races (tested with 10 concurrent joins).
- **Presence:** a seat is `connected` while at least one socket is attached to it. Presence lives in process memory (single server process), not in PostgreSQL.
- **Secrets:** seat tokens appear only in the create/join response and the owner's `lobby:attach` request. They are never broadcast, logged, put in URLs, or stored in plain text.

## Moving a seat to another device (future, not implemented)

The same person on another device currently needs to join again under a different name, or the host removes the old seat. A safe later design, without accounts:

1. The seat owner requests a one-time **transfer code** over the authenticated socket.
2. The server stores only a hash of the code with a short expiry (for example 5 minutes) and a single-use flag.
3. The new device redeems the code; the server rotates the seat token in the same transaction, which revokes the old device, and returns the new token once.

Never derive seat ownership from a display name or from the room code.

## Known limits

- No request rate limiting or abandoned-room expiry yet.
- Presence is in memory; a multi-process deployment would need shared coordination (deferred together with Redis).
- Command ids and revision preconditions are not needed for the idempotent lobby commands; they are required for gameplay commands in the next milestone.
