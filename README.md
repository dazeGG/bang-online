# Bang!

A private browser-based adaptation of classic BANG! for friends. The first-release target is **4–7 players** on desktop, phone, and tablet browsers.

This repository currently provides a development scaffold: a responsive React client, a Fastify/Socket.IO server, shared TypeScript packages, PostgreSQL configuration, and automated checks. It does **not** yet implement lobbies, playable matches, guest-seat recovery, or durable game-state storage. PWA installation and a service worker are future options.

## Requirements

- Node.js 24 LTS and npm 11.
- Docker Desktop with the Linux container engine running, or an existing PostgreSQL instance, for database checks and future persistence work.
- A modern browser. The initial compatibility target is Chrome/Edge 111+, Firefox 114+, and Safari/iOS 16.4+, subject to real-device verification as features are added.

## Quick start

Run these commands in PowerShell:

```powershell
Set-Location 'E:\WORK\pet\Bang!'
npm ci
Copy-Item .env.example .env
npm run db:up
npm run db:check
npm run dev
```

Copy `.env.example` only for a fresh checkout; preserve an existing `.env` and its local settings. The browser client opens at <http://localhost:5173>; the API listens at <http://localhost:3001>. The client uses Vite's same-origin proxy for API and Socket.IO traffic.

The development client and server can run without PostgreSQL to inspect the scaffold. In that case, liveness remains available, but database readiness and `db:check` fail. A running Docker CLI alone is insufficient: Docker Desktop's engine must also be available for `db:up`.

## Commands

| Command             | Purpose                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`       | Build shared packages, then watch the shared packages, web client, and server. |
| `npm run lint`      | Run repository lint checks.                                                    |
| `npm run typecheck` | Check TypeScript across the workspaces.                                        |
| `npm test`          | Run the automated tests.                                                       |
| `npm run build`     | Build shared packages, server, and web assets.                                 |
| `npm run check`     | Run the complete configured verification sequence.                             |
| `npm run db:up`     | Start the local PostgreSQL container.                                          |
| `npm run db:down`   | Stop the local PostgreSQL container, preserving its volume.                    |
| `npm run db:check`  | Test the configured database connection.                                       |
| `npm start`         | Start the built API/server; build first.                                       |
| `npm run preview`   | Preview the built web client locally; start the API separately.                |

`start` and `preview` are local building blocks, not a production deployment configuration. A production deployment still needs HTTPS, routing of the client/API/socket endpoints, and operational database configuration.

## Configuration

Server scripts load the root `.env` through Node's native environment-file support. The template contains local development settings only.

| Variable           | Default / example                                 | Meaning                                                                |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------------- |
| `SERVER_HOST`      | `127.0.0.1`                                       | API bind address.                                                      |
| `SERVER_PORT`      | `3001`                                            | API and Socket.IO port.                                                |
| `WEB_ORIGIN`       | `http://localhost:5173`                           | Allowed browser origin for the socket connection.                      |
| `DATABASE_URL`     | `postgresql://bang:bang_dev@localhost:54329/bang` | PostgreSQL connection string.                                          |
| `LOG_LEVEL`        | `info`                                            | Server logging verbosity.                                              |
| `API_PROXY_TARGET` | `http://127.0.0.1:3001`                           | Vite's server-side proxy target; update it when changing the API port. |

Docker Compose uses PostgreSQL 18 with a named data volume. Its development port is bound to **127.0.0.1:54329**. The `bang` / `bang_dev` credentials are local development defaults, not production credentials. Do not commit `.env`.

- `GET /api/health` checks process liveness and returns the classic ruleset identifier.
- `GET /api/ready` checks database connectivity and returns HTTP 503 when the database is absent or unavailable.
- The socket connection sends server capabilities and supports a timestamp ping. This is a connectivity check, not a game protocol.

For a phone on the same LAN, expose the Vite development server with `--host 0.0.0.0`, set `WEB_ORIGIN` to the computer's LAN URL (for example, `http://192.168.1.10:5173`), and allow the chosen web port through the local firewall. Keep PostgreSQL bound to loopback. The browser still reaches the backend through Vite's proxy. Plain LAN HTTP is for local testing; installable PWA capabilities generally require HTTPS or localhost.

## Layout

```text
apps/
  web/             React/Vite browser client
  server/          Fastify, Socket.IO, and PostgreSQL connectivity
packages/
  contracts/       Shared public transport types and protocol constants
  game-core/       Framework-independent classic rules foundation
docs/
  PROJECT_BRIEF.md Agreed scope, architecture, and next milestones
  START_PROMPT.md  Russian handoff prompt for the next chat
```

Start with [the project brief](docs/PROJECT_BRIEF.md) and follow [the project instructions](AGENTS.md). See [setup verification](docs/SETUP_STATUS.md) for completed checks and the database verification gap. The next implementation milestone is a private lobby with secure guest seats and refresh/reconnect recovery, before a playable turn is introduced.
