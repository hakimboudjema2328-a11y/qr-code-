#!/usr/bin/env bash
# Seul le site client est publié. L'administration est embarquée dans les applications.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.output/public"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$ROOT/site-public/web/." "$OUT/"
python3 "$ROOT/scripts/configure-web.py" "$OUT"
# Redirection temporaire vers le résolveur public : ce dernier vérifie à chaque
# ouverture si le QR et le client existent toujours et ne met jamais en cache.
python3 - "$OUT" <<'PY'
import json, pathlib, re, sys
out=pathlib.Path(sys.argv[1])
config=(out/'supabase-config.js').read_text(encoding='utf-8')
match=re.search(r'window\.QR_CONFIG\s*=\s*(\{.*\});',config)
if not match: raise SystemExit('Configuration publique illisible.')
url=json.loads(match.group(1))['supabaseUrl']
if url:
    (out/'_redirects').write_text('/r/* '+url+'/functions/v1/qr-resolve/:splat 302\n',encoding='utf-8')
else:
    print('Sans SUPABASE_URL : redirection QR indisponible dans cet aperçu local.')
PY
test ! -e "$OUT/admin" || { echo 'Erreur : administration présente dans le site public.' >&2; exit 1; }
echo "Cloudflare Pages (site client uniquement) : $OUT"
