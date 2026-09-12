#!/usr/bin/env bash
# Genera una versión de un solo archivo (CSS y JS embebidos, sin las etiquetas
# <html>/<head>/<body>) para publicarla como Artifact o pegarla donde haga falta.
# Uso: perfumario/tools/build-artifact.sh [salida]
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-../dist/perfumario.html}"
mkdir -p "$(dirname "$OUT")"

python3 - "$OUT" <<'PY'
import re, sys, pathlib
out   = pathlib.Path(sys.argv[1])
html  = pathlib.Path('index.html').read_text(encoding='utf-8')
css   = pathlib.Path('assets/styles.css').read_text(encoding='utf-8')
datos = pathlib.Path('assets/datos.js').read_text(encoding='utf-8')
app   = pathlib.Path('assets/app.js').read_text(encoding='utf-8')

title = re.search(r'<title>(.*?)</title>', html, re.S).group(1)
body  = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
# fuera los <script src> y el registro del service worker: en un solo archivo
# no hay rutas que cachear
body  = re.sub(r'<script src="assets/[^"]+"></script>', '', body)
body  = re.sub(r'<script>.*?serviceWorker.*?</script>', '', body, flags=re.S)

out.write_text(
    f'<title>{title}</title>\n<style>\n{css}\n</style>\n{body.strip()}\n'
    f'<script>\n{datos}\n</script>\n<script>\n{app}\n</script>\n',
    encoding='utf-8')
print(f'{out} · {out.stat().st_size // 1024} KB')
PY
