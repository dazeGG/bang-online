# Bang!

A private browser-based adaptation of classic BANG! for friends. The first-release target is **4–7 players** on desktop, phone, and tablet browsers.

The implementation supports a **complete classic match**: private ready lobby, authoritative role/character/card setup, all **80 cards (22 kinds) and 16 characters**, out-of-turn decisions, elimination and victory. PostgreSQL stores exact match snapshots and command receipts atomically; reconnect and restart retain unfinished decisions. The saloon interface displays only each player's authorized hand and role. See [room and game protocol](docs/LOBBY.md) and [rules coverage](docs/CLASSIC_RULES.md).

Missing required players are awaited without timers or penalties. The fixed host can explicitly end an active match without a winner. After a finished or aborted match, create a new room. Dodge City, 3/8-player modes, bots, Redis and PWA installation remain outside this release.

**Publication status:** the complete classic-game build is live at <https://bang.dazinho.ru>. Deployed source `276ebba` passed local automated/browser/review gates and GitHub CI; public HTTPS checks verified ready/start, a play/response, refresh/disconnect recovery and host abort. See [verification status](docs/SETUP_STATUS.md) for exact evidence and device limits.

## Requirements

- Node.js 24 LTS and npm 11.
- Docker Desktop with the Linux container engine running, or an existing PostgreSQL instance. Rooms and games require PostgreSQL.
- A modern browser. The initial compatibility target is Chrome/Edge 111+, Firefox 114+, and Safari/iOS 16.4+, subject to real-device verification as features are added.

## Quick start

Run these commands in PowerShell:

```powershell
Set-Location 'E:\WORK\pet\Bang!'
npm ci
Copy-Item .env.example .env
npm run db:up
npm run db:check
npm run db:migrate
npm run dev
```

Copy `.env.example` only for a fresh checkout; preserve an existing `.env` and its local settings. The browser client opens at <http://localhost:5173>; the API listens at <http://localhost:3001>. The client uses Vite's same-origin proxy for API and Socket.IO traffic.

Open the client, create a room, and send the full invitation link (`https://bang.dazinho.ru/r/<CODE>`) to the other players. New codes contain six characters. Existing ten-character codes and `/room/<CODE>` invitations still work. To try several players on one computer, use separate browser profiles or private windows: tabs of one browser profile share the same seat by design.

With 4–7 ready players, the host selects «Начать партию». Choose cards for details and legal targets; response and selection panels appear for the required actor. Mass-attack responses can be prepared in parallel, while checks and consequences resolve clockwise. Changed defenses require a new choice; victory is evaluated after the whole mass effect.

The interface follows the approved saloon design: warm paper, walnut, original sunset artwork, and locally hosted Cyrillic fonts. Connection notices appear only when disconnected; readiness is shown per player. See [the design contract](DESIGN.md) and [visual verification](design-qa.md).

Without PostgreSQL the server still starts and liveness works, but room endpoints answer `503 unavailable`, and `/api/ready` and `db:check` fail. Without applied migrations `/api/ready` reports `migrations_pending`. A running Docker CLI alone is insufficient: Docker Desktop's engine must also be available for `db:up`.

## Commands

| Command              | Purpose                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`        | Build shared packages, then watch the shared packages, web client, and server. |
| `npm run lint`       | Run repository lint checks.                                                    |
| `npm run typecheck`  | Check TypeScript across the workspaces.                                        |
| `npm test`           | Run the automated tests.                                                       |
| `npm run build`      | Build shared packages, server, and web assets.                                 |
| `npm run check`      | Run the complete configured verification sequence.                             |
| `npm run db:up`      | Start the local PostgreSQL container.                                          |
| `npm run db:down`    | Stop the local PostgreSQL container, preserving its volume.                    |
| `npm run db:check`   | Test the configured database connection.                                       |
| `npm run db:migrate` | Apply pending PostgreSQL migrations (idempotent, safe to repeat).              |
| `npm start`          | Start the built API/server; build first.                                       |
| `npm run preview`    | Preview the built web client locally; start the API separately.                |

`start` and `preview` are local building blocks. The production Docker image serves the client, API, and Socket.IO from one process behind HTTPS. The complete classic-game deployment is at <https://bang.dazinho.ru>. See [deployment operations](docs/DEPLOYMENT.md).

## Configuration

Server scripts load the root `.env` through Node's native environment-file support. The template contains local development settings only.

| Variable            | Default / example                                 | Meaning                                                                          |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `SERVER_HOST`       | `127.0.0.1`                                       | API bind address.                                                                |
| `SERVER_PORT`       | `3001`                                            | API and Socket.IO port.                                                          |
| `WEB_ORIGIN`        | `http://localhost:5173`                           | Allowed browser origin for the socket connection.                                |
| `DATABASE_URL`      | `postgresql://bang:bang_dev@localhost:54329/bang` | PostgreSQL connection string.                                                    |
| `LOG_LEVEL`         | `info`                                            | Server logging verbosity.                                                        |
| `TEST_DATABASE_URL` | _(unset)_                                         | Optional database for integration tests; defaults to `DATABASE_URL`.             |
| `API_PROXY_TARGET`  | `http://127.0.0.1:3001`                           | Vite's server-side proxy target; update it when changing the API port.           |
| `WEB_DIST_DIR`      | _(unset)_                                         | Absolute path to built client assets; set automatically in the production image. |

Docker Compose uses PostgreSQL 18 with a named data volume. Its development port is bound to **127.0.0.1:54329**. The `bang` / `bang_dev` credentials are local development defaults, not production credentials. Do not commit `.env`.

- `GET /api/health` checks process liveness and returns the classic ruleset identifier.
- `GET /api/ready` checks database connectivity and applied migrations, and returns HTTP 503 when the database is absent, unavailable, or not migrated.
- `POST /api/rooms`, `POST /api/rooms/:code/seats`, `GET /api/rooms/:code`, and the `lobby:*` Socket.IO events implement the lobby; see [docs/LOBBY.md](docs/LOBBY.md).
- Protocol 3 adds authenticated `game:start`, `game:command`, `game:sync`, `game:abort` and private per-seat `game:state` delivery. Match revisions differ from lobby revisions.

## Database and tests

Migrations live in `apps/server/src/migrations.ts` as an append-only list; `npm run db:migrate` applies pending ones atomically under an advisory lock and records them in `schema_migrations`. Never edit an applied migration — add a new one. The server does not migrate automatically on startup.

Migration 3 adds durable matches, restrictive participant references and command receipts. Existing invitations and seat tokens remain valid. After migration 3, older images that only know migrations 1/2 reject the schema: application recovery requires a schema-3-compatible build, with no database downgrade or volume reset.

`npm test` loads `DATABASE_URL` (or `TEST_DATABASE_URL`) from the root `.env`. PostgreSQL integration tests create a random `test_<uuid>` schema, migrate it, and drop it afterwards; they never touch application tables. When the database is unreachable, these tests are **skipped** with a warning locally and **fail** in CI (`CI` set). A green local run without the warning is the only proof that the database paths were exercised.

For a phone on the same LAN, expose the Vite development server with `--host 0.0.0.0`, set `WEB_ORIGIN` to the computer's LAN URL, and allow the chosen web port through the local firewall. Keep PostgreSQL bound to loopback. Use trusted HTTPS for playable device tests: the cross-tab command outbox uses Web Locks, available in secure contexts (including localhost). On unsupported or insecure browsers, game mutations are disabled with a visible message. See [client recovery and browser support](apps/web/README.md).

## Layout

```text
apps/
  web/             React/Vite browser client
  server/          Fastify, Socket.IO, authenticated room/game stores and migrations
packages/
  contracts/       Shared public transport types and protocol constants
  game-core/       Framework-independent complete classic rules and projections
docs/
  PROJECT_BRIEF.md Agreed scope, architecture, and next milestones
  LOBBY.md         Lobby protocol, seat ownership, and reconnect behavior
  CLASSIC_RULES.md Pinned sources, physical catalog, card/character/FAQ coverage
  START_PROMPT.md  Handoff prompt for the next chat
```

Start with [the project brief](docs/PROJECT_BRIEF.md) and follow [the project instructions](AGENTS.md). See [verification status](docs/SETUP_STATUS.md) for completed checks and remaining device/operational gaps.
