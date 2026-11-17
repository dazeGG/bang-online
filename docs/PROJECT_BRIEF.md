# Project brief

## Outcome and scope

A private online classic BANG! match for **4–7 friends**, from a ready lobby through deal, all base cards and characters, elimination and victory. The implementation contains the complete 80-card physical deck (22 kinds), 16 characters, durable guest seats and recoverable pending decisions. The complete-game build is published at <https://bang.dazinho.ru>; exact deployed source, public browser evidence and remaining device/operational limits are recorded in [SETUP_STATUS.md](SETUP_STATUS.md).

Dodge City and other expansions, 3/8-player modes, Redis, bots, public matchmaking, built-in voice/video, accounts, spectators, native clients and PWA installation are outside this release. Finishing or aborting leaves a terminal room; the next match uses a new room.

## Stack and boundaries

- npm workspaces: React/Vite client in `apps/web`, Node.js 24/Fastify/Socket.IO in `apps/server`, public transport types in `packages/contracts`, pure rules in `packages/game-core`.
- PostgreSQL stores rooms, hashed guest-seat credentials, exact authoritative match snapshots, fixed participants and command receipts. No rules depend on React, sockets or database access.
- The server validates untrusted payloads and derives the actor from the authenticated seat. All room mutations share the room-row lock; game operations then lock the match in the same order.
- Setup and accepted transitions use injected randomness. Production uses Node `crypto.randomInt`; snapshots contain concrete outcomes, not a seed or homemade persisted random generator. A duplicate accepted command does not consume entropy.
- Accepted state, lifecycle and receipt commit atomically before acknowledgement. A retried ID with the same fingerprint returns its original receipt; a changed request conflicts. Receipts contain safe result metadata, never a historical private view.

## Rules baseline and decisions

The pinned baseline is the publisher's fourth-edition English rules plus the official English FAQ with 26 answers. [CLASSIC_RULES.md](CLASSIC_RULES.md) records sources, hashes, all 80 physical faces and named tests for every kind/character/FAQ case. The two Stagecoach 9-spades copies have different physical IDs.

Additional explicit decisions:

- Sid's eligible two-hand-card healing may interrupt another player's decision. Its ID, owner, remaining requirements and continuation survive the interrupt. The conflicting tournament restriction to Sid's own turn is not adopted.
- Gatling/Indians allow **local parallel response drafts**. Checks and consequences resolve clockwise from the seat after the initiator; changed defense availability invalidates a draft. A fresh current decision/revision is required for the actual command. Victory follows the entire mass effect. The response-order convention was selected by the users and is not presented as a printed base rule.
- Selected historical official clarifications cover recycling/order and Suzy/Gringo timing, as labelled in the coverage document. They do not import tournament abandonment timers.
- Brown cards enter discard before their effects resolve; a Stagecoach can recycle itself. Historical reveals and effect source references are metadata, not extra ownership zones.
- If both draw and discard sources are unavailable, the reducer returns a recoverable resource error without fabricating cards, failed checks, damage or victory. Synthetic exhaustion fixtures do not establish an official empty-source rule; a reachable legal unresolved case needs an explicit decision.

## Privacy

Characters, health, equipment, hand counts, living order, the sheriff and roles revealed by elimination are public. Each seat sees only its own hand and unrevealed role. Other hands/roles, deck order, private Kit inspection and credentials are excluded from per-seat projections, errors and logs. Eliminated players do not receive a reveal-all view.

A bounded log stores the latest 64 public resolution summaries by revision/ordinal. Disclosed faces have no hidden card instance IDs and do not assert present hand ownership. Public Black Jack/check disclosures survive a dropped event and restart. Private bonus draws remain private.

## Lifecycle and recovery

Room lifecycle is `lobby -> active -> finished | aborted`. The host starts only with 4–7 ready seats. Participant seats and host identity are fixed throughout active and terminal states; readiness, join, leave and kick cannot mutate them. Restrictive participant foreign keys also prevent direct seat deletion. Lobby-only host handover remains unchanged before start.

A required absent actor is awaited indefinitely, without damage, automatic decline, turn skipping or deadline. Unrelated absent seats do not block earlier decisions. A seat is present while any authenticated tab remains connected. Presence is derived from live sockets and does not alter the durable game revision.

The fixed host, even if eliminated, can explicitly abort an active match without a winner. Abort uses the same command/revision/transaction guarantees and cannot overwrite a committed victory. No disconnect-triggered host takeover or rematch/reset is included.

The snapshot stores schema/ruleset/catalog version, exact deck/zones, turn/phase, counters, serializable continuations, pending decisions, timeout policy and outcome. Reattach/sync reconstructs the authorized view without replaying effects. Unknown/corrupt state fails closed rather than redealing. Protocol 3 distinguishes game revision from room revision and orders same-revision presence by per-attachment delivery sequence.

The browser persists only an actually submitted envelope for retry with the same ID. An uncertain acknowledgement never causes a new-ID automatic replay. Prepared responses are separate local drafts and can be lost on refresh. Multi-tab outbox writes are coordinated with Web Locks; unsupported browsers show a read-only explanation. Existing six/ten-character invitations, `/r/` and legacy `/room/` routes and guest tokens are preserved.

## Verification and operations

Focused core tests cover mechanics and serialized choices; real PostgreSQL/store/socket tests cover atomicity, authorization, races, exact restart, retries and full legal matches for each player count. Client tests cover projection rendering, selection, outbox and preparation guards. Run `npm run check` with PostgreSQL available; a successful skipped local suite is insufficient database evidence. Browser and real-device checks are separate.

The established deployment is <https://bang.dazinho.ru>, with the isolated Bang app/database behind the shared Caddy. See [DEPLOYMENT.md](DEPLOYMENT.md). Migration 3 is append-only; recovery after it requires an image that understands schema 3. Preserve volumes and neighboring services. Backups/restore drills, request rate limiting, abandoned-room expiry, external monitoring and real iOS/Android confirmation remain operational follow-ups.
