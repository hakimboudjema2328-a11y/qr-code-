#!/usr/bin/env bash
# Comme KARIDZ : copie complète de l'app web admin dans les assets de l'APK.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="$ROOT/android/admin/src/main/assets/www"
rm -rf "$DST"; mkdir -p "$DST"
cp -R "$ROOT/admin-app/web/." "$DST/"
python3 "$ROOT/scripts/configure-web.py" "$DST"
echo "Assets de l'APK prêts : $(find "$DST" -type f | wc -l) fichiers"
