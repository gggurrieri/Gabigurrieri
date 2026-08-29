#!/usr/bin/env bash
# Genera una versión de un solo archivo (CSS y JS embebidos, sin las etiquetas
# <html>/<head>/<body>) para publicarla como Artifact o pegarla donde haga falta.
# Uso: tools/build-artifact.sh [salida]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-dist/artifact.html}"
mkdir -p "$(dirname "$OUT")"

python3 - "$OUT" <<'PY'
import re, sys, pathlib
out = pathlib.Path(sys.argv[1])
html = pathlib.Path('index.html').read_text(encoding='utf-8')
css  = pathlib.Path('assets/styles.css').read_text(encoding='utf-8')
js   = pathlib.Path('assets/app.js').read_text(encoding='utf-8')

title = re.search(r'<title>(.*?)</title>', html, re.S).group(1)

# El artifact se publica sin <head>, así que el apple-touch-icon se emite
# como <link> con el PNG embebido: si el navegador lo ignora no molesta, y
# si lo respeta "Agregar a inicio" usa el ícono en vez de una captura.
icono = pathlib.Path('assets/icon-180.png')
link = ''
if icono.exists():
    import base64
    link = ('<link rel="apple-touch-icon" href="data:image/png;base64,'
            + base64.b64encode(icono.read_bytes()).decode() + '">\n')
body  = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body  = re.sub(r'<script src="assets/app\.js"></script>', '', body)

out.write_text(
    f'<title>{title}</title>\n{link}<style>\n{css}\n</style>\n{body.strip()}\n<script>\n{js}\n</script>\n',
    encoding='utf-8')
print(f'{out} · {out.stat().st_size // 1024} KB')
PY
