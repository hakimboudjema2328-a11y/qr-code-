#!/usr/bin/env python3
"""Embarque l'interface admin configurée (valeurs publiques uniquement) dans l'EXE."""
import os, pathlib, shutil, subprocess, sys, tempfile, zipfile
root = pathlib.Path(__file__).resolve().parent.parent
if not os.environ.get('SUPABASE_URL') or not os.environ.get('SUPABASE_ANON_KEY'):
    raise SystemExit('SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour l’application.')
output = root / 'windows' / 'Admin' / 'www.zip'
with tempfile.TemporaryDirectory(prefix='massify-admin-') as tmp:
    web = pathlib.Path(tmp) / 'www'
    shutil.copytree(root / 'admin-app' / 'web', web)
    subprocess.run([sys.executable, str(root / 'scripts' / 'configure-web.py'), str(web)], check=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file in sorted(web.rglob('*')):
            if file.is_file(): z.write(file, file.relative_to(web).as_posix())
print('Interface locale Windows préparée.')
