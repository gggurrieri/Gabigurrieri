# Pruebas

`e2e.js` recorre la app como un usuario, en un viewport de iPhone con eventos
táctiles reales: primer arranque, perfil, peso, registro manual, marcado del
plan, las dos vías de importación, filtros, borrado y copia de seguridad.
43 comprobaciones.

```
node tests/e2e.js      # sale con código 1 si algo falla
```

Necesita Playwright y los archivos de prueba que genera `fixtures.py`:

```
python3 tests/fixtures.py ./tmp     # crea los .zip, .gpx y .tcx de ejemplo
```

Los archivos de prueba reproducen lo que entregan Salud y Zepp de verdad:
exportación en español (`exportación.xml`) y en inglés, un export sin
entrenamientos, un `.zip` que no es de Salud, y actividades sueltas en GPX y
TCX. `caso-usuario.zip` reproduce el caso del primer uso, con la fecha de
inicio en hoy y el historial hacia atrás.
