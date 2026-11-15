#!/usr/bin/env python3
# Neural Arena — tout le jeu en une seule page, pour le partager sans hébergement :  python3 outils/page-unique.py sortie.html
# La page n'a ni doctype ni <head> (l'hébergeur les pose) ; les sources du worker y sont glissées en texte, et l'application le monte de là.
import re, sys, pathlib
d = pathlib.Path(__file__).resolve().parent.parent
lire = lambda n: (d / n).read_text(encoding='utf-8')
page = lire('index.html')
corps = page[page.index('<body>') + 6:page.index('<script src="sim.js">')]
sim, travail = lire('sim.js'), '\n'.join(l for l in lire('train-worker.js').splitlines() if 'importScripts' not in l)
for nom, t in (('sim.js', sim), ('train-worker.js', travail)): assert '</script' not in t and '<!--' not in t, nom
sortie = ('<title>Neural Arena</title>\n<style>\n:root { color-scheme: dark; }\n' + lire('style.css') + '</style>\n' + corps
  + '<script type="text/plain" id="src-sim">' + sim + '</script>\n<script type="text/plain" id="src-worker">' + travail + '</script>\n'
  + ''.join('<script>\n' + lire(n) + '</script>\n' for n in ('sim.js', 'rendu.js', 'compte.js', 'app.js')))
pathlib.Path(sys.argv[1]).write_text(sortie, encoding='utf-8')
print(sys.argv[1], len(sortie) // 1024, 'Ko')
