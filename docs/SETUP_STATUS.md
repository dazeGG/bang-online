# Verification status

## Production lobby deployment — 2026-11-17

- Deployed at <https://bang.dazinho.ru> on the shared VoiceRoom host. The app and its separate PostgreSQL container are healthy; `/api/ready` returned HTTP 200 with `database: connected`. Caddy configuration validation passed.
- Production image: `bang:20261117150541-0558a30-dirty`. The image includes uncommitted workspace changes; no source commit was made. See [DEPLOYMENT.md](DEPLOYMENT.md) for operations.
- Fresh `npm run check` passed: ESLint, strict TypeScript, **85 tests in 6 files**, builds, and Prettier. PostgreSQL integration tests ran without skips.
- The public HTTPS HTTP/Socket.IO smoke check passed: create/join, foreign-origin rejection (403), WebSocket upgrade, readiness broadcast, authenticated re-attachment to the same seat, invalid-token rejection, and leaving both test seats.
- Browser checks in separate default/incognito profiles passed: create room with a Cyrillic name, open invitation and join, see each other's presence/readiness, reload both profiles without duplicate seats, retain readiness, and leave. The guest's seat id was unchanged after reload. No browser console errors were recorded during these flows. Both browser test seats were released afterwards.
- At the deployment check, app memory was about 96 MiB of its 192 MiB limit; PostgreSQL used about 39 MiB of its 160 MiB limit. These are a snapshot, not a load-test result.

Remaining gaps: real phone/tablet testing, automated backups and restore verification, external monitoring, abandoned-room expiry, and request rate limiting. Gameplay is not implemented. Earlier local-only verification gaps below describe the state before this deployment.

## Private lobby milestone — 2026-11-17

Verified on Windows with Node.js 24.18.0, npm 11.16.0, Docker Desktop 29.6.2, and PostgreSQL 18 from `compose.yaml`.

- `npm run db:up` and `npm run db:check` succeeded against the real PostgreSQL container. This is the first verified real database connection.
- `npm run db:migrate` applied migration 1 (`private_lobby`); a second run reported the schema up to date.
- `npm run check` passed: ESLint, strict TypeScript, 75 tests in 5 files, server/client builds, and Prettier. The 13 PostgreSQL integration tests ran against the real database (not skipped) in throwaway `test_<uuid>` schemas, which were dropped afterwards.
- Integration tests cover: migrations and readiness, room creation, invitation preview without names or secrets, name/room-code/origin validation, the 7-seat limit, 10 concurrent joins, attach without leaked tokens, wrong/malformed/cross-room tokens, refresh restoring the same seat and readiness, persistence across a server restart, multiple tabs on one seat with revocation on leave, the 4–7 ready start condition, and host-only removal with host hand-over.
- `npm run dev` smoke check through the Vite proxy: `/api/ready` returned `ready`; a room was created and joined with Cyrillic names; a duplicate name was rejected; a foreign origin received 403; `/room/<CODE>` served the SPA; a socket attach, readiness change, disconnect, and re-attach restored the same ready seat; a wrong token was rejected; the server log contained no seat tokens.

Not verified:

- No browser automation, visual inspection, or real phone/tablet testing of the new lobby UI was performed. The UI was verified by type checks, build, and the HTTP/socket smoke check only.
- `npm start` / `npm run preview` were not re-run for this milestone.
- On this machine `HTTP_PROXY`/`ALL_PROXY` point to a local proxy; bypass it (for example `NO_PROXY=*`) for local `curl` checks. Windows `curl` command-line arguments also mangle Cyrillic text, so use a UTF-8 file or Node for non-ASCII request bodies.

The local development database contains a few rooms created by the smoke check. They are harmless development data and were not deleted.

## Initial scaffold — 2026-11-17

- The scaffold passed `npm run check`, `docker compose config --quiet`, and HTTP/Socket.IO smoke checks for `npm run dev`, `npm start`, and `npm run preview`.
- At that time the Docker engine was not running and no real PostgreSQL connection was verified; that gap is closed above.

TypeScript is intentionally pinned to 6.0.3: the selected typescript-eslint release supports TypeScript below 6.1.0. Keep compiler and lint tooling compatible when upgrading dependencies.

The root `.env` contains only the development defaults copied from `.env.example` and is ignored by Git. Preserve local changes to it when continuing.

Next implementation: the first playable turn in `PROJECT_BRIEF.md`.
