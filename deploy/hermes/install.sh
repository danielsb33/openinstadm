#!/usr/bin/env bash
# Installs the OpenInstaDM skill + `ig` helper for Hermes Agent.
# Asks for the agent key (hidden) and stores it as a curl header file.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

sudo apt-get install -y -qq jq ffmpeg file python3 >/dev/null
# Cloudflare quick tunnels give ig-reel a temporary public https URL for videos.
if ! command -v cloudflared >/dev/null; then
  arch="$(dpkg --print-architecture)"
  curl -fsSL -o /tmp/cloudflared.deb \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch.deb"
  sudo dpkg -i /tmp/cloudflared.deb >/dev/null
  rm -f /tmp/cloudflared.deb
fi
mkdir -p "$HOME/.local/bin" "$HERMES_HOME/skills/openinstadm"
install -m 755 "$SRC/ig" "$HOME/.local/bin/ig"
install -m 755 "$SRC/ig-reel" "$HOME/.local/bin/ig-reel"
install -m 755 "$SRC/igq" "$HOME/.local/bin/igq"

# Scheduled Reels: a user timer runs `igq run` every minute (needs linger so
# it keeps running with nobody logged in).
mkdir -p "$HOME/.config/systemd/user"
install -m 644 "$SRC/igq.service" "$SRC/igq.timer" "$HOME/.config/systemd/user/"
sudo loginctl enable-linger "$USER"
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user daemon-reload
systemctl --user enable --now igq.timer
install -m 644 "$SRC/SKILL.md" "$HERMES_HOME/skills/openinstadm/SKILL.md"

HEADER_FILE="$HERMES_HOME/openinstadm.header"
if [[ ! -s "$HEADER_FILE" ]]; then
  read -rp "Pega la AGENT_API_KEY de OpenInstaDM y pulsa Enter: " key
  umask 077
  printf 'Authorization: Bearer %s\n' "$key" > "$HEADER_FILE"
  unset key
fi
chmod 600 "$HEADER_FILE"

echo "Probando conexión..."
if "$HOME/.local/bin/ig" GET /api/instagram/accounts | jq -er '.data.instagramAccounts[] | "  - \(.username) (id \(.id))"'; then
  echo "OPENINSTADM_OK"
else
  echo "La prueba falló: revisa la clave y las variables de Vercel." >&2
  exit 1
fi
