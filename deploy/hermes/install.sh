#!/usr/bin/env bash
# Installs the OpenInstaDM skill + `ig` helper for Hermes Agent.
# Asks for the agent key (hidden) and stores it as a curl header file.
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"

sudo apt-get install -y -qq jq >/dev/null
mkdir -p "$HOME/.local/bin" "$HERMES_HOME/skills/openinstadm"
install -m 755 "$SRC/ig" "$HOME/.local/bin/ig"
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
