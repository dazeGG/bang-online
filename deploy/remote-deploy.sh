#!/usr/bin/env bash
# Runs on the production host. Arguments: <dir under $HOME> <image> <public origin>.
set -euo pipefail

dir="$HOME/$1"
image="$2"
origin="$3"
caddy_container="voiceroom-caddy-1"
sites_dir="$HOME/VoiceRoom/config/caddy/sites.d"
caddyfile=(--config /etc/caddy/Caddyfile --adapter caddyfile)

cd "$dir"
umask 077

# Secrets are generated once on the host and never leave it.
if [ ! -f .env ]; then
  printf 'POSTGRES_PASSWORD=%s\nWEB_ORIGIN=%s\n' "$(openssl rand -hex 24)" "$origin" > .env
fi
{ grep -v '^BANG_IMAGE=' .env || true; echo "BANG_IMAGE=${image}"; } > .env.next
mv .env.next .env

docker compose up -d --wait --wait-timeout 120
docker compose ps --format '{{.Service}}: {{.Status}}'

# Install the site on VoiceRoom's Caddy only after a successful validation.
if ! cmp -s bang.caddy "$sites_dir/bang.caddy"; then
  previous=""
  if [ -f "$sites_dir/bang.caddy" ]; then
    previous="$(mktemp)"
    cp "$sites_dir/bang.caddy" "$previous"
  fi
  cp bang.caddy "$sites_dir/bang.caddy"
  if ! docker exec "$caddy_container" caddy validate "${caddyfile[@]}" > /dev/null; then
    echo "Caddy rejected bang.caddy; restoring the previous site file." >&2
    if [ -n "$previous" ]; then cp "$previous" "$sites_dir/bang.caddy"; else rm -f "$sites_dir/bang.caddy"; fi
    exit 1
  fi
  docker exec "$caddy_container" caddy reload "${caddyfile[@]}"
  echo "Caddy site updated."
fi

# Keep the three newest Bang images for rollback.
docker image ls bang --format '{{.Tag}}' | sort -r | tail -n +4 | sed 's/^/bang:/' | xargs -r docker image rm > /dev/null || true

echo "deployed ${image}"
