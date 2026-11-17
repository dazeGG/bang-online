#!/usr/bin/env bash
# Builds the image locally, ships it over SSH (no registry), and rolls out the stack.
# Usage: deploy/deploy.sh   (Git Bash on Windows or any POSIX shell with Docker and SSH)
set -euo pipefail

host="${DEPLOY_HOST:-daze@193.233.91.146}"
remote_dir="${DEPLOY_DIR:-bang}"
domain="${DEPLOY_DOMAIN:-bang.dazinho.ru}"

cd "$(dirname "$0")/.."
revision="$(git rev-parse --short HEAD)"
git diff --quiet HEAD || revision="${revision}-dirty"
image="bang:$(date -u +%Y%m%d%H%M%S)-${revision}"

echo "Building ${image}"
docker build --platform linux/amd64 -t "$image" .

echo "Shipping image to ${host}"
docker save "$image" | gzip | ssh "$host" 'gunzip | docker load'

ssh "$host" "mkdir -p ~/${remote_dir}"
scp -q deploy/compose.yaml "${host}:~/${remote_dir}/compose.yaml"
scp -q deploy/bang.caddy "${host}:~/${remote_dir}/bang.caddy"
ssh "$host" "bash -s -- '${remote_dir}' '${image}' 'https://${domain}'" < deploy/remote-deploy.sh
