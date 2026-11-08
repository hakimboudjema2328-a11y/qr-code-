#!/usr/bin/env python3
"""Contrôle syntaxique des sites statiques, sur le modèle du dépôt KARIDZ."""
from html.parser import HTMLParser
import json, pathlib, subprocess, tempfile
ROOT = pathlib.Path(__file__).resolve().parent.parent
class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.in_script=False; self.in_style=False; self.external=False; self.scripts=[]; self.current=[]; self.styles=[]; self.divs=0
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='div': self.divs+=1
        if tag=='script': self.in_script=True; self.external='src' in attrs; self.current=[]
        if tag=='style': self.in_style=True; self.current=[]
    def handle_endtag(self,tag):
        if tag=='div':
            self.divs-=1
            if self.divs<0: raise ValueError('Fermeture div inattendue')
        if tag=='script' and self.in_script:
            if not self.external: self.scripts.append(''.join(self.current))
            self.in_script=False; self.current=[]
        if tag=='style' and self.in_style:
            self.styles.append(''.join(self.current)); self.in_style=False; self.current=[]
    def handle_data(self,data):
        if self.in_script or self.in_style: self.current.append(data)
for app in ('site-public','admin-app'):
    web=ROOT/app/'web'; p=Page(); p.feed((web/'index.html').read_text(encoding='utf-8'))
    if p.divs: raise ValueError(f'{app}: div non équilibrées : {p.divs}')
    for style in p.styles:
        if style.count('{')!=style.count('}'): raise ValueError(f'{app}: accolades CSS non équilibrées')
    for script in p.scripts:
        with tempfile.NamedTemporaryFile('w',suffix='.js',encoding='utf-8') as f:
            f.write(script); f.flush(); subprocess.run(['node','--check',f.name],check=True)
    manifest=json.loads((web/'manifest.json').read_text(encoding='utf-8'))
    for icon in manifest.get('icons',[]):
        if not (web/icon['src']).exists(): raise ValueError(f'{app}: icône manquante')
    for name in ('vendor/supabase.js','fonts/dm-sans.woff2','fonts/outfit.woff2','supabase-config.js','sw.js'):
        if not (web/name).exists(): raise ValueError(f'{app}: fichier manquant : {name}')
    print(app,': HTML, CSS, scripts et manifest OK')
