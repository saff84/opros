#!/usr/bin/env bash
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run with sudo bash scripts/install-docker-ubuntu.sh' >&2
  exit 1
fi
. /etc/os-release
if [ "$ID" != ubuntu ]; then echo 'This installer supports Ubuntu only.' >&2; exit 1; fi
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo 'Docker and Compose are already installed.'
  exit 0
fi
apt-get update
apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
release_codename="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
architecture="$(dpkg --print-architecture)"
cat > /etc/apt/sources.list.d/docker.sources <<SOURCE
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $release_codename
Components: stable
Architectures: $architecture
Signed-By: /etc/apt/keyrings/docker.asc
SOURCE
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
