# Project brief

## Goal and agreed scope

Build a private online version of classic BANG! that friends can play from desktop, phone, and tablet browsers. Joining should be straightforward: follow an invitation link, choose a name, and take a seat.

The first release targets **4–7 players**, all base-game cards and characters, private rooms, clear action prompts, and reliable reconnects. The group usually has 4–7 participants and occasionally three or eight. The user explicitly chose to postpone Dodge City rather than expand the first release to cover those occasional counts.

Out of scope for the first release: Dodge City and other expansions, three/eight-player modes, custom player-count balancing, Redis, bots, public matchmaking, built-in voice/video, and native apps. Optional PWA installation can follow a reliable browser experience.

## Current implementation boundary

The initial setup provides:

- npm workspaces with strict TypeScript;
- a responsive React/Vite client with real connection status;
- a Fastify/Socket.IO server with liveness and database readiness checks;
- PostgreSQL connection configuration and local Docker Compose;
- shared transport contracts;
- a pure game-core foundation with classic limits and role distributions;
- lint, typecheck, test, and build commands.

Rooms, seat authentication, reconnect ownership, gameplay, match persistence tables/migrations, a production deployment, and an installable PWA are not implemented by this setup. A successful connection indicator proves connectivity only.

## Architecture decisions

- **Client:** React + Vite + TypeScript. Use responsive DOM/CSS controls with tap-first interactions, readable card details, and explicit response prompts.
- **Server:** Node.js 24 + Fastify + Socket.IO. Start with one server process and serialize commands within each room.
- **Storage:** PostgreSQL. Future accepted commands, deduplication results, and durable match state must be committed atomically before an authoritative acknowledgement.
- **Redis:** deferred. Introduce shared coordination infrastructure only when an actual multi-process deployment or measured requirement justifies it.
- **Packages:** keep public contracts separate from pure game rules and private server state. Avoid a speculative expansion/plugin framework.

Keep the ruleset version in future persisted matches. Match state must capture the shuffled deck, cards, roles, characters, living seats, current turn/phase, pending response/selection, and the defined timeout policy. Reopening an app must not reroll or reconstruct hidden state inconsistently.

## Rules and information model

The server owns shuffle, deal, validation, resolution, and victory checks. The browser submits an intent and displays only the resulting authorized view.

Public information includes characters, health, played equipment, living seat order, the sheriff's role, and roles revealed on elimination. A player's own hand and unrevealed role are private to that player. Other hands, unrevealed roles, draw-pile order, and seat credentials must never appear in unauthorized socket payloads, HTTP responses, logs, or reconnect data. Eliminated players and spectators do not gain access to private information during an ongoing match.

Treat responses outside the active player's turn as explicit phases/decisions. Relevant examples include defense against a shot, alternating discards in a duel, responses to mass attacks, ordered card selection, and rescue from lethal damage. Do not allow the next action to skip an unresolved effect.

The initial foundation is not a complete rules engine. Use the official base rules and FAQ to derive behavior tests as mechanics are implemented. Pay attention to changing distances after elimination, weapon range versus distance modifiers, card-specific exceptions, character abilities, and victory checks after effects resolve.

## Session and reconnect requirements

These are future acceptance requirements, not features already provided by the scaffold:

- A guest's seat is authenticated by an unguessable secret, never by display name or public room code alone.
- Refreshing or reconnecting restores only the authenticated player's seat and permitted state.
- A command has a unique identifier and expected state revision. Duplicate attempts cannot consume another card or apply damage twice.
- Socket reconnect recovery is an optimization; the application must also support an authenticated full state resynchronization.
- Mobile app switching, lock screens, background suspension, and Wi-Fi/mobile transitions are normal reconnect cases.
- Server time controls deadlines. The group-facing pause/disconnect policy must be explicit; the default preference is a friendly pause rather than a silent automatic loss.
- A server restart preserves accepted state and unfinished decisions once gameplay persistence is implemented.

## Implementation milestones

1. **Private lobby vertical slice:** create/join by link, names, secure guest-seat ownership, seat limits, readiness, and refresh/reconnect restoration. Persist the data needed for this milestone, with explicit migrations and relevant authorization/reconnect tests. A lobby may accept fewer than four waiting guests, while starting a classic match requires 4–7 ready players.
2. **First playable turn:** authoritative setup, hidden per-player views, draw/play/discard phases, a basic shot/defense interaction, and revisioned idempotent commands. Make a small complete flow before adding all card effects.
3. **Complete classic game:** all base cards and characters, out-of-turn effects, elimination, victory, and relevant official FAQ cases.
4. **Reliability and device verification:** persistence/restart recovery, interrupted responses, multiple tabs, network transitions, phone/tablet layouts, and deployment preparation.

Use focused tests and the repository checks at each milestone. Do not report complete classic BANG! based on a partial card subset or a UI-only prototype.

## References

- [Official base rules](https://www.dvgiochi.com/giochi/bang/download/Bang_rules_ENG.pdf).
- [Official BANG! FAQ](https://www.dvgiochi.com/giochi/bang/download/Bang%21_FAQ_ENG.pdf).
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/).
- [Socket.IO connection state recovery](https://socket.io/docs/v4/connection-state-recovery/).

Rules references should be pinned and any edition ambiguity recorded when the relevant behavior is implemented. Transport ordering and reconnect support do not replace application-level authorization, deduplication, or durable game state.
