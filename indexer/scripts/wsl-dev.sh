#!/usr/bin/env bash
# Runs the indexer from a WSL-native copy of this folder.
#
# Envio needs Linux (WSL on Windows) and Docker, and it is far too slow to run from the Windows
# drive (/mnt/c). So this copies the project (including .env) into ~/jagomoko-indexer and starts
# `envio dev` there. GraphQL ends up at http://localhost:8080/v1/graphql (dev secret: "testing").
#
#   from Windows, in indexer/:   bun run dev:wsl        (add -r to wipe and re-index after a schema change)
#   from a WSL shell:            bash indexer/scripts/wsl-dev.sh
#
# Needs: Docker Desktop with WSL integration on, Node 22+ and Bun in WSL, and indexer/.env filled in
# (run `bun run sync:deployment` first, and put your ENVIO_API_TOKEN in it).

# nvm is not safe to load under `set -eu`, so load it first.
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" >/dev/null; fi
set -euo pipefail

# WSL appends the Windows PATH, and the Windows node/npm shims on it break Linux tools. Keep only
# the Linux node (and the bun installed next to it).
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node 22+ is not installed in WSL." >&2
  exit 1
fi
export PATH="$(dirname "$NODE"):$HOME/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$HOME/jagomoko-indexer"

if [ ! -f "$SRC/.env" ]; then
  echo "indexer/.env is missing. Run 'bun run sync:deployment' in indexer/ and add ENVIO_API_TOKEN." >&2
  exit 1
fi

mkdir -p "$WORK"
rsync -a --delete --exclude node_modules --exclude generated --exclude build --exclude .envio/types.d.ts "$SRC/" "$WORK/"
cd "$WORK"
[ -d node_modules ] || bun install
export ENVIO_TUI=false
# extra arguments go to `envio dev`, e.g. `bun run dev:wsl -r` to wipe the indexed data and start over
# (needed after a schema change; it is all re-read from the chain)
exec bun run dev "$@"
