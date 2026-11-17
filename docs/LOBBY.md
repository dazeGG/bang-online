# Private rooms, games and guest seats

The local implementation combines private lobbies with durable classic games. The current deployment boundary is recorded in [SETUP_STATUS.md](SETUP_STATUS.md).

## Ownership and lifecycle

| Concept        | Meaning                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room           | Six-character readable code in a full `/r/<CODE>` URL. Legacy ten-character codes and `/room/<CODE>` remain valid. A code permits requesting a free lobby seat; it does not prove ownership. |
| Seat           | Public UUID, display name, seat index 0–6 and readiness. Names are normalized and unique per room.                                                                                           |
| Token          | A 256-bit secret returned once on create/join. Only its SHA-256 digest is stored in PostgreSQL. Never place it in a URL or log.                                                              |
| Host           | Creator; lobby-only departure transfers ownership to the lowest occupied seat. After match start the host is fixed, including while offline or eliminated.                                   |
| Room revision  | Used for lobby state and the expected revision on start. It is distinct from the match revision.                                                                                             |
| Match revision | Starts at 1. Each accepted rules action or abort increases it once; presence and synchronization do not.                                                                                     |

Lifecycle is `lobby -> active -> finished | aborted`. A lobby supports up to seven seats and starts only with 4–7 ready players. After start, join/readiness/leave/kick are rejected, including an unchanged readiness request. Seats and host remain fixed through the terminal result; create a new room for the next match. Closing a page does not relinquish an active seat.

Migration 3 adds `matches`, `match_participants` and `game_command_receipts`. Participant foreign keys prevent deleting retained seats, including terminal participants. Snapshot JSON is not a substitute for these references.

## HTTP and lobby protocol

Protocol version is **3**. HTTP issues credentials; Socket.IO authenticates the seat.

| Endpoint / event                       | Purpose                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/rooms` `{name}`             | Create room and host seat; `201` returns `{roomCode,seatId,seatToken}` with no-store caching.                                            |
| `POST /api/rooms/:code/seats` `{name}` | Join a lobby's lowest free seat. Active/terminal rooms are closed to new joins.                                                          |
| `GET /api/rooms/:code`                 | Invitation preview: room status, seat count, capacity and joinability; no names, player IDs or secrets.                                  |
| `lobby:attach` `{roomCode,seatToken}`  | Authenticate and fully resynchronize. Returns seat ID and lobby metadata; active/terminal rooms also return a fresh private `game` view. |
| `lobby:set-ready` `{ready}`            | Lobby only. Setting the same value is idempotent; lifecycle is checked before the no-op path.                                            |
| `lobby:leave`                          | Lobby only. Delete own seat and revoke all tabs with `lobby:closed {reason:'left'}`.                                                     |
| `lobby:kick` `{seatId}`                | Lobby-only host action, excluding self; all removed-seat tabs receive `lobby:closed {reason:'kicked'}`.                                  |
| `lobby:state`                          | Identical public room metadata for all attached seats, including presence. No private game state.                                        |

Foreign browser origins are rejected for mutating HTTP and Socket.IO handshakes. Runtime validation normalizes names to NFC, collapses whitespace, restricts names to 1–24 code points without control/format characters and enforces case-insensitive room uniqueness. Room-row locks serialize concurrent joins and all lifecycle mutations.

## Game protocol

| Event          | Request / result                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `game:start`   | `{commandId,expectedRevision}`; fixed host, 4–7 ready seats; revision is the **room** revision.                                                                                                                                                        |
| `game:command` | `{commandId,expectedRevision,matchId,intent}`; revision is the **match** revision. Intent variants are draw, play, end_turn, respond, choose and sid_heal. Responses include a current decision ID; selections include ordered owned/allowed card IDs. |
| `game:abort`   | `{commandId,expectedRevision,matchId}`; fixed host only, even after elimination. Active match becomes aborted with no winners.                                                                                                                         |
| `game:sync`    | `{matchId?}`; returns the authenticated seat's fresh `game` projection.                                                                                                                                                                                |
| `game:state`   | Private projection emitted individually to each authenticated seat socket. Never broadcast a private view to the room.                                                                                                                                 |

Success receipts contain `{ok:true,commandId,revision,matchId,status}`. Rejections contain stable safe codes, with optional revision/match metadata. No historical private projection is retained in a receipt. Unknown fields, malformed/bounded IDs, invalid unions, targets, ownership and revisions are validated independently of TypeScript.

The server locks room then match, revalidates membership, and looks up the scoped accepted receipt before stale/lifecycle checks. Identical fingerprints return the original result without engine execution or entropy; changed payloads return `command_conflict`. New accepted state, room lifecycle and success receipt commit atomically before acknowledgement or publication. Failed transactions expose no speculative state. Synchronization recovers a dropped publication; unknown saved schema/ruleset/catalog or corrupt state fails closed without redealing.

Per-seat game views include own role/hand, public players/equipment/hand counts, turn/pending metadata, own legal choices, mass preparation, public face history, outcome and current presence. They exclude opponents' hidden hands/roles, deck order, private Kit inspection and credentials. Eliminated/terminal participants do not receive a reveal-all view. Public history is limited to the latest 64 revision/ordinal summaries and does not identify current hidden ownership.

Clients reject lower match revisions. Equal-revision presence uses monotonically increasing `deliverySequence` within an attachment. Reattachment resets its baseline while retaining the match revision floor.

## Waiting, interrupts and mass responses

Presence is live socket state, not durable connectivity flags: a seat remains connected while at least one authenticated tab exists. Missing **current required** actors are awaited indefinitely without damage, decline, skipping or timers. Missing unrelated/future responders do not stop earlier choices. Reconnect/restart restores exact pending state and derives waiting from new socket presence.

Sid's optional healing can interrupt another player's pending decision while preserving its ID, owner, remaining requirements and continuation. It does not create a mandatory Sid prompt.

Mass-response drafts are local and may be prepared in parallel. They reserve/consume nothing and perform no checks. Authoritative resolution proceeds clockwise beginning after the initiator. The current responder uses a fresh decision ID/revision; a changed own-defense guard clears the draft and requires a new choice. Victory is evaluated after the whole mass effect. This is an explicit user-selected application convention.

The host can confirm an abort while waiting or progressing. Its revision check prevents a stale abort from overwriting victory. Abort is terminal, durable, retryable and has no winner; disconnect never transfers that authority.

## Browser recovery

The existing `bang:seat:<ROOM CODE>` localStorage credentials restore the same seat after refresh, browser restart or reconnect. Invalid/malformed/cross-room tokens disclose no room state; existing credentials are not removed merely because the room is active or terminal. Multiple tabs intentionally share a seat.

Actually submitted game envelopes are stored separately per room/seat before sending. Timeout/unavailable outcomes retain the same ID and payload; reauthentication precedes retry. Definitive rejection clears the envelope, syncs and requires a new explicit choice. Short Web Locks serialize outbox writes across tabs; existing envelopes are adopted, and acknowledgements clear only the matching ID. Prepared drafts are not persisted. See [client details](../apps/web/README.md).

## Limits

Presence assumes one server process; Redis and distributed coordination are deferred. Safe cross-device seat transfer, request rate limiting, abandoned-room expiry and account recovery are not implemented. A separate device without the token cannot reclaim a retained active seat by name or invitation alone. Never infer ownership from a public code or display name.
