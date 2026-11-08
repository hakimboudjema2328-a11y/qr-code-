#!/usr/bin/env python3
"""Injecte uniquement des valeurs publiques dans une COPIE du site."""
import json, os, pathlib, re, sys
from urllib.parse import urlsplit
if len(sys.argv) != 2:
    raise SystemExit('Utilisation : configure-web.py <dossier-web-copié>')
target = pathlib.Path(sys.argv[1])
url = os.environ.get('SUPABASE_URL', '').strip().rstrip('/')
key = os.environ.get('SUPABASE_ANON_KEY', '').strip()
site = os.environ.get('PUBLIC_SITE_URL', 'https://qr-studio-2328.pages.dev').strip().rstrip('/')
def safe_origin(value):
    if not value: return ''
    u = urlsplit(value)
    if u.scheme != 'https' or not u.hostname or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment:
        raise SystemExit('Les URLs doivent être des origines HTTPS sans chemin ni identifiants.')
    if not re.fullmatch(r'[A-Za-z0-9.-]+', u.hostname) or '..' in u.hostname:
        raise SystemExit('Nom de domaine invalide.')
    try: port = u.port
    except ValueError: raise SystemExit('Port invalide.')
    return 'https://' + u.hostname.lower() + ((':' + str(port)) if port else '')
url = safe_origin(url)
site = safe_origin(site)
if key and (len(key) > 5000 or any(ch.isspace() for ch in key)):
    raise SystemExit('Clé publique Supabase invalide.')
if (url and not key) or (key and not url):
    raise SystemExit('Renseignez à la fois SUPABASE_URL et SUPABASE_ANON_KEY, ou aucun des deux.')
config = {'supabaseUrl': url, 'supabaseAnonKey': key, 'publicSiteUrl': site}
(target / 'supabase-config.js').write_text('// Configuration publique : aucun secret.\nwindow.QR_CONFIG = '+json.dumps(config,ensure_ascii=True)+';\n', encoding='utf-8')
# Autorise explicitement un domaine Supabase personnalisé dans la CSP de la copie.
if url:
    index = target / 'index.html'
    html = index.read_text(encoding='utf-8')
    html = html.replace('connect-src \'self\' https://*.supabase.co;', "connect-src 'self' https://*.supabase.co " + url + ';')
    index.write_text(html,encoding='utf-8')
print('Configuration publique préparée pour', target)
