#!/usr/bin/env bash
# Le site public et l'administration restent autonomes comme dans le dépôt de référence.
# La publication Cloudflare assemble les deux sous la même origine /admin/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.output/public"
rm -rf "$OUT"; mkdir -p "$OUT/admin"
cp -R "$ROOT/site-public/web/." "$OUT/"
cp -R "$ROOT/admin-app/web/." "$OUT/admin/"
python3 "$ROOT/scripts/configure-web.py" "$OUT"
python3 "$ROOT/scripts/configure-web.py" "$OUT/admin"
echo "Cloudflare Pages : $OUT"
