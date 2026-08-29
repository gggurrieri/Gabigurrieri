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

body  = re.search(r'<body[^>]*>(.*)</body>', html, re.S).group(1)
body  = re.sub(r'<script src="assets/app\.js"></script>', '', body)

out.write_text(
    f'<title>{title}</title>\n<style>\n{css}\n</style>\n{body.strip()}\n<script>\n{js}\n</script>\n',
    encoding='utf-8')
print(f'{out} · {out.stat().st_size // 1024} KB')
PY
