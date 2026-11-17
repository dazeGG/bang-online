# Production deployment

The established deployment is <https://bang.dazinho.ru> on the shared VoiceRoom host (`daze@193.233.91.146`). The complete classic-game build is live: source `276ebba`, image `bang:20261117182607-276ebba`, database migrations 1–3. Subsequent receipt-only documentation commits do not change the deployed application source. See [SETUP_STATUS.md](SETUP_STATUS.md) for exact verified build receipts.

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

The script builds `linux/amd64` locally, transfers the image over SSH without a registry, uploads the deployment files, and waits for container health. The default host, directory, and domain are configured in the script; the Caddy site itself currently uses the fixed `bang.dazinho.ru` hostname. It retains the three lexically newest Bang image tags; the retained `recovery-schema3-276ebba` tag survives this pruning. Migrations are append-only; an application rollback does not roll back database migrations.

The complete-game update applied migration 3 (`durable_classic_matches`), widening room lifecycle and adding match snapshots, restrictive participant references and command receipts. Existing rooms, six/ten-character invitations and hashed seat credentials are preserved. Migrations 1 and 2 remain unchanged.

**After migration 3, an old image that only knows migrations 1/2 cannot be used for rollback:** the server rejects unknown schema versions at startup. Retaining an old image is therefore insufficient. Recovery requires an image that understands migration 3 and the persisted match schema/ruleset/catalog, with compatible code fixes if necessary. Never downgrade the schema, remove participant references or restore a clean volume to bypass this check. The retained `bang:recovery-schema3-276ebba` build was tested against local schema 3 and shipped before rollout. After migration, an isolated temporary Compose container using that tag started healthy against the production schema and returned HTTP 200 with `database: connected`; the temporary container was then stopped and removed. Its filesystem layers match the deployed build. Automated backups/restore drills remain separate unfinished operational work.

To select this verified compatible application build while preserving the existing database:

```bash
ssh daze@193.233.91.146 'cd ~/bang && BANG_IMAGE=bang:recovery-schema3-276ebba docker compose up -d --no-deps --wait bang-app'
```

Verify `/api/ready` afterwards. This is a manual application recovery procedure, not an automated rollback or a database restore. Review the retained compatible tag before each future update.

Before updating, run `npm run check` with actual PostgreSQL and inspect migration-upgrade, command-atomicity and restart tests. Deploy only a verified source revision; record its commit/image and public readiness separately. Startup's migration command runs before the app and does not drop/recreate existing game data.

## Inspect and stop

```bash
ssh daze@193.233.91.146 'cd ~/bang && docker compose ps'
ssh daze@193.233.91.146 'cd ~/bang && docker compose logs --tail 100 bang-app'
ssh daze@193.233.91.146 'cd ~/bang && docker compose stop'
ssh daze@193.233.91.146 'cd ~/bang && docker compose up -d --wait'
```

Stopping preserves rooms, seats, matches, pending decisions and receipts. While stopped, the public site returns an upstream error; no maintenance page is configured. Never use `down -v` for routine operations. Preserve the shared Caddy configuration, neighboring containers and the existing database volume.

## Verification and remaining work

The earlier lobby deployment was verified on 2026-11-17: HTTPS, database readiness, room creation, invitation join in a separate browser profile, readiness propagation, refresh restoration, and leaving both test seats. The public HTTP/Socket.IO smoke test also verified WebSocket upgrade and rejection of foreign origins and invalid seat tokens. Those checks do not prove gameplay deployment.

The complete-game deployment passed public HTTPS readiness and browser checks with two independent profiles and two test-only protocol peers: four ready seats, start, Bang from card details, pending-defense refresh/disconnect recovery without penalties, an explicit response, and host-confirmed abort with no winner retained after refresh. Public normal-victory completion was not claimed; a complete normal match was verified locally. The existing database container/volume and all 28 neighboring container names, IDs, images and states were unchanged. Combined Caddy configuration validation passed without reloading it. See [SETUP_STATUS.md](SETUP_STATUS.md) for exact receipts.

For future updates, repeat readiness and a controlled game/response/reconnect/terminal smoke check. Do not inspect unrelated private games or remove retained seats to clean up an active/terminal test room.

Real phone/tablet testing, request rate limiting, abandoned-room expiry, automated backups and restore verification, external monitoring, and automated application rollback remain open. This is a small private preview deployment.
