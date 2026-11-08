#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/scripts/check-html.py"
"$ROOT/node_modules/.bin/deno" check "$ROOT/supabase/functions/qr-checkout/index.ts" "$ROOT/supabase/functions/qr-order/index.ts" "$ROOT/supabase/functions/chargily-webhook/index.ts" "$ROOT/supabase/functions/qr-admin-auth/index.ts"
