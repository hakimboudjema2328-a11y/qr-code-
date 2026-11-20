#!/usr/bin/env bash
# Serveur local de tests uniquement : jamais utilisé pour le déploiement public.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/prepare-web.sh"
OUT="$ROOT/.output/testsite"
rm -rf "$OUT"; mkdir -p "$OUT/admin"
cp -R "$ROOT/.output/public/." "$OUT/"
cp -R "$ROOT/admin-app/web/." "$OUT/admin/"
python3 "$ROOT/scripts/configure-web.py" "$OUT/admin"
echo "Site et administration de test : $OUT"
