# Production deployment

The private lobby is available at <https://bang.dazinho.ru> on the shared VoiceRoom host (`daze@193.233.91.146`). Gameplay is not implemented yet.

## Layout and limits

- `Dockerfile` builds the workspace locally. One Node.js process serves the built client, API, and Socket.IO. Startup applies pending migrations before starting the server; container health checks use `/api/ready`.
- `deploy/compose.yaml` runs `bang-app` and a separate PostgreSQL 18 instance under `~/bang`. Memory limits are 192 MiB for the app and 160 MiB for PostgreSQL. Logs rotate at 5 MiB, keeping three files per container.
- No host ports are published. PostgreSQL uses the stack's private network. The app also joins `voiceroom_default` so the existing Caddy can reach `bang-app:3001`.
- `deploy/bang.caddy` is installed at `~/VoiceRoom/config/caddy/sites.d/bang.caddy`. Caddy handles HTTPS, WebSocket proxying, compression, and security headers. The remote deploy script validates the combined configuration before reloading it.
- Credentials are generated once on the host in `~/bang/.env` with restrictive permissions. Never copy or print that file. Persistent data lives in the Compose `db-data` volume.

## Update

From the repository root in Git Bash (or another POSIX shell with Docker and SSH):

```bash
bash deploy/deploy.sh
```

The script builds `linux/amd64` locally, transfers the image over SSH without a registry, uploads the deployment files, and waits for container health. The default host, directory, and domain are configured in the script; the Caddy site itself currently uses the fixed `bang.dazinho.ru` hostname. It retains the three newest Bang images for rollback. Migrations are append-only; an application rollback does not roll back database migrations.

The saloon update applies migration 2 for six-character room codes while retaining existing ten-character rooms. After migration 2, images that only know migration 1 reject the newer schema at startup; use an image that understands migration 2 rather than attempting a database downgrade.

## Inspect and stop

```bash
ssh daze@193.233.91.146 'cd ~/bang && docker compose ps'
ssh daze@193.233.91.146 'cd ~/bang && docker compose logs --tail 100 bang-app'
ssh daze@193.233.91.146 'cd ~/bang && docker compose stop'
ssh daze@193.233.91.146 'cd ~/bang && docker compose up -d --wait'
```

Stopping preserves rooms and seats. While stopped, the public site returns an upstream error; no maintenance page is configured. Never use `down -v` for routine operations.

## Verification and remaining work

Deployment was verified on 2026-11-17: HTTPS, database readiness, room creation, invitation join in a separate browser profile, readiness propagation, refresh restoration, and leaving both test seats. The public HTTP/Socket.IO smoke test also verified WebSocket upgrade and rejection of foreign origins and invalid seat tokens. See [SETUP_STATUS.md](SETUP_STATUS.md).

Real phone/tablet testing, request rate limiting, abandoned-room expiry, automated backups and restore verification, external monitoring, and automated application rollback remain open. This is a small private preview deployment.
