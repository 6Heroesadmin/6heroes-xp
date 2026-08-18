#!/usr/bin/env python3
"""
6Heroes Font-Umbau: ersetzt in jeder HTML-Datei im Repo alle Google-Fonts-
Einbindungen durch <link rel="stylesheet" href="/fonts.css">.

Behandelt drei Formen:
  1. <link rel="preconnect" ... fonts.googleapis.com ...>
  2. <link rel="preconnect" ... fonts.gstatic.com ...>
  3. <link ... fonts.googleapis.com/css2?... rel="stylesheet">
  4. @import url('https://fonts.googleapis.com/css2?...');  (im <style>)

Regel:
  - Alle <link>-Google-Font-Zeilen einer Datei werden entfernt und durch
    GENAU EINE <link rel="stylesheet" href="/fonts.css"> ersetzt (an der Stelle
    des ersten Treffers).
  - Jedes @import wird durch @import url('/fonts.css'); ersetzt (bleibt im <style>).
  - Dateien ohne Google-Fonts bleiben unberührt.
Idempotent: mehrfach laufen lassen ändert nichts mehr.
"""
import re, sys, pathlib

LINK_TAG = '<link rel="stylesheet" href="/fonts.css">'
IMPORT_RULE = "@import url('/fonts.css');"

# ein <link ...> das googleapis ODER gstatic enthält (preconnect oder stylesheet)
re_link = re.compile(r'[ \t]*<link\b[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>[ \t]*\n?', re.I)
# @import ... googleapis ... ;
re_import = re.compile(r"[ \t]*@import\s+url\(\s*['\"]?https://fonts\.googleapis\.com/css2\?[^)]*\)\s*;?[ \t]*\n?", re.I)

def process(text: str):
    changed = False

    # ---- @import zuerst (im <style>) ----
    if re_import.search(text):
        # erstes @import -> ersetzen, weitere -> entfernen
        state = {'first': True}
        def imp_sub(m):
            if state['first']:
                state['first'] = False
                return "  " + IMPORT_RULE + "\n"
            return ""
        text = re_import.sub(imp_sub, text)
        changed = True

    # ---- <link>-Google-Fonts ----
    if re_link.search(text):
        state = {'first': True}
        def link_sub(m):
            if state['first']:
                state['first'] = False
                return LINK_TAG + "\n"
            return ""
        text = re_link.sub(link_sub, text)
        changed = True

    return text, changed

def main():
    root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    html = sorted(root.rglob("*.html"))
    touched, skipped = [], []
    for p in html:
        # fonts.css selbst und node_modules o.ä. auslassen
        if p.name == "fonts.css":
            continue
        src = p.read_text(encoding="utf-8")
        new, changed = process(src)
        # Sicherheit: nach dem Umbau darf keine Google-Font-Referenz mehr übrig sein
        if changed:
            if re.search(r'fonts\.(googleapis|gstatic)\.com', new, re.I):
                print(f"  WARN: {p.name} hat noch Google-Referenzen nach Ersetzung!", file=sys.stderr)
            p.write_text(new, encoding="utf-8")
            touched.append(p.name)
        else:
            skipped.append(p.name)
    print(f"Geändert: {len(touched)} Dateien")
    for n in touched: print("  ~", n)
    print(f"Unverändert (keine Google-Fonts): {len(skipped)} Dateien")

if __name__ == "__main__":
    main()
