# Setup verification

Verified on 2026-11-17 on Windows with Node.js 24.18.0 and npm 11.16.0.

- `npm run check` passed: ESLint, strict TypeScript, 28 tests across 3 test files, server/client builds, and Prettier.
- `docker compose config --quiet` passed.
- `npm run dev` started the shared-package watcher, Vite, and Fastify successfully.
- An HTTP/Socket.IO smoke check through `http://localhost:5173` passed: HTML, proxied liveness, server capabilities, and ping acknowledgement.
- `npm start` and `npm run preview` also passed a local smoke check against the compiled server and built frontend, including static assets, proxied API requests, and a WebSocket-only connection. Test services were stopped afterward.
- The real readiness endpoint returned HTTP 503 with `database: unavailable`, as expected without a running database.
- `npm run db:check` failed with the expected database-unavailable message. Docker CLI is installed, but the Linux Docker engine was not running during setup. A successful real PostgreSQL connection has **not** been verified. Readiness success is covered by an injected test dependency only.
- Browser rendering, device compatibility, gameplay, and production deployment have not been verified. No browser automation or visual inspection was performed for the setup.

The root `.env` contains only the development defaults copied from `.env.example` and is ignored by Git. Preserve local changes to it when continuing.

TypeScript is intentionally pinned to 6.0.3: the selected typescript-eslint release supports TypeScript below 6.1.0. Keep compiler and lint tooling compatible when upgrading dependencies.

Next implementation: the private-lobby/guest-seat/reconnect milestone in `PROJECT_BRIEF.md`. Start the database and verify connectivity before implementing persistence. The initial scaffold contains no room or match schema to migrate.
