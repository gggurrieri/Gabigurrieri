#!/usr/bin/env bash
# Arma perfumario/nativo/www con la app tal cual, sin pruebas ni herramientas.
# No hay compilación ni empaquetado: es la misma app que corre en el navegador,
# que es justamente lo que hace que no haya dos versiones que mantener.
set -euo pipefail
aca="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
raiz="$(dirname "$aca")"
dest="$raiz/nativo/www"

rm -rf "$dest"
mkdir -p "$dest"
cp "$raiz/index.html" "$dest/"
cp "$raiz/manifest.json" "$dest/"
cp -r "$raiz/assets" "$dest/"
# El service worker no va: adentro del envoltorio los archivos ya están en el
# dispositivo, y uno viejo en caché puede tapar una actualización de la tienda.

echo "www listo · $(du -sh "$dest" | cut -f1) · $(find "$dest" -type f | wc -l) archivos"
