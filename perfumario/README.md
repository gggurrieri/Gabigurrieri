# Perfumario

App web para tu colección de perfumes: qué tenés, qué ponerte hoy y qué significa
cada nota olfativa. Funciona sin conexión y guarda todo en el navegador: no hay
servidor, no hay cuenta, no hay datos que salgan del dispositivo.

## Cómo usarla

**En la compu:** abrí `perfumario/index.html` con doble clic.

**En el teléfono (recomendado):** publicá el repo en cualquier hosting estático —
por ejemplo GitHub Pages— entrá a `…/perfumario/` y usá "Agregar a pantalla de
inicio". Queda como una app nativa y funciona sin señal.

> Los datos viven en el `localStorage` del navegador donde la abriste. Si limpiás
> el navegador o cambiás de teléfono, se pierden: usá **Ajustes → Exportar copia**
> cada tanto. La app te lo recuerda sola si pasó una semana.

## Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Hoy** | Elegís temperatura, momento del día y ocasión, y te propone tres perfumes con un puntaje y las razones de cada uno. Un toque para registrar que te lo pusiste. |
| **Colección** | Alta, edición y borrado de perfumes con casa, concentración, familia, pirámide de notas, ml, precio, estaciones, ocasiones, duración, estela y puntaje. Buscador por nombre, casa o **nota**, filtro por familia y siete criterios de orden. **Carga rápida** para pegar una lista entera de una vez. |
| **Notas** | Diccionario de 96 notas y 11 familias explicadas, tu perfil olfativo (qué tenés contra qué usás) y comparador de parecidos entre perfumes de tu colección. |
| **Uso** | Usos del mes, ml gastados, el más puesto, costo por uso, rotación de los últimos 90 días, los que juntan polvo, los que se están por acabar e historial. |
| **Ajustes** | ml por aplicación, moneda, hemisferio, exportar/importar/borrar y seis perfumes de ejemplo para mirar la app con contenido. |

## Cómo decide qué recomendarte

Cada perfume arranca en 50 puntos y suma o resta según el contexto. La idea es que
**ninguna sugerencia aparezca sin explicación**: debajo de cada una se listan las
tres razones que más pesaron.

| Qué mira | Cómo pesa |
|---|---|
| Estación actual | +18 si coincide, −12 si lo marcaste para otra |
| Temperatura contra la familia | hasta −20, según cuánto se aleje del ideal de esa familia (un gourmand a 35° pierde, un cítrico a 5° también) |
| Momento del día | +12 si coincide, +4 si sirve para ambos, −10 si no |
| Ocasión | +14 si la tiene marcada, −8 si no |
| Estela contra el ambiente | −12 si deja mucha estela para la oficina o el gimnasio, +8 si la ocasión pide presencia |
| Rotación | +10 si hace más de tres semanas que no lo usás, −30 si ya te lo pusiste hoy |
| Tu puntaje | ±8 según las estrellas que le diste |
| Lo que queda en el frasco | −8 si queda 10 % o menos |

A eso se le suma lo que aprende de vos (se apaga en Ajustes).

El hemisferio importa: con la opción "Sur", diciembre es verano.

## Cómo aprende de tus elecciones

No hay nada mágico ni ninguna red neuronal: cuenta qué usaste en cada ocasión
durante los últimos seis meses y lo compara contra **lo que sería esperable si
eligieras al azar dentro de tu propia colección**. Si el 70 % de tus usos de
trabajo son amaderados pero los amaderados son solo el 30 % de lo que tenés, eso
es una preferencia y no una casualidad.

| Señal | Cómo pesa |
|---|---|
| Familia que elegís para esa ocasión | de −10 a +16, según la diferencia entre lo observado y lo esperable |
| Ese perfume en esa ocasión | +8 si ya lo elegiste 2 veces o más para lo mismo |
| Notas que se repiten en lo que usás | +6 si el perfume tiene 2 o más de tus notas más frecuentes |

Tres decisiones de producto detrás de esto:

- **Se explica solo.** Las razones aprendidas salen primero en cada sugerencia,
  marcadas con ✦ y en otro color, así se distingue qué vino de tu historial y
  qué de una regla fija. La tarjeta "Lo que aprendí de vos" muestra el modelo
  entero en palabras y sobre cuántos usos lo calculó.
- **Se calla si no sabe.** Con menos de 6 usos registrados no ajusta nada, y por
  ocasión pide al menos 3. Un modelo que opina con dos datos pierde la confianza
  de quien lo usa.
- **Se apaga.** Un interruptor en Ajustes lo desactiva y vuelve a las reglas
  fijas.

## Cargar muchos perfumes de una vez

**Colección → ⚡ Carga rápida**: pegás un nombre por línea y busca cada uno
contra el catálogo de 73 fragancias, ignorando acentos, puntuación y la
concentración (`Acqua di Gio EDT` y `acqua di giò` son lo mismo). Antes de
agregar nada muestra qué reconoció (✓ exacto, ≈ parecido), qué ya tenías y qué
no encontró. Lo que no está en el catálogo entra igual con el nombre y queda
marcado como **❓ completar familia**: no se le inventa una, porque un dato
falso ensucia el perfil olfativo y las sugerencias. Lo mismo con las notas: un
perfume sin pirámide queda marcado **❓ completar notas**, porque sin ellas no
entra en los parecidos ni en el perfil.

Opcional, separado con barras: `Nombre | ml | precio`.

## Cómo está hecha

HTML, CSS y JavaScript a mano, sin dependencias ni compilación. Cinco archivos:

```
perfumario/
├── index.html          la estructura de las pantallas
├── manifest.json       datos para instalarla en el teléfono (nombre, íconos, color)
├── sw.js               service worker: guarda la app en caché para que abra sin internet
├── assets/
│   ├── app.js          toda la lógica: estado, recomendador, vistas
│   ├── datos.js        familias, notas y catálogo de fragancias (solo lectura)
│   ├── styles.css      estilos
│   └── icon*.png/svg   el ícono
└── tests/e2e.js        prueba de punta a punta
```

Si trabajás con desarrolladores, estos son los términos que van a usar para hablar
de esta app:

- **PWA** (*Progressive Web App*, app web progresiva): una web que se instala en el
  teléfono y funciona sin conexión. Lo que la hace instalable es el `manifest.json`.
- **Service worker**: un script que queda corriendo aparte de la página e intercepta
  los pedidos de red para responder desde la caché. Es lo que la hace *offline first*
  (primero sin conexión).
- **localStorage**: el almacenamiento del navegador, clave-valor, atado a ese
  dispositivo. Acá la clave es `perfumario_v1`.
- **CRUD** (*Create, Read, Update, Delete*): las cuatro operaciones básicas sobre un
  registro. La pestaña Colección es un CRUD de perfumes.
- **State** (estado): el objeto en memoria con todos los datos de la app. Acá es `S`,
  y se serializa a JSON para guardarlo.
- **Render**: dibujar la pantalla a partir del estado. Cada cambio guarda y vuelve a
  renderizar, así la pantalla nunca queda desincronizada de los datos.

## Pruebas

`tests/e2e.js` recorre la app como una usuaria, en un viewport de iPhone con eventos
táctiles reales: primer arranque, carga de ejemplos, sugerencias y cómo cambian con
el contexto, registro y borrado de usos con el descuento de ml, buscador y filtros,
alta desde el catálogo, ficha, diccionario de notas, estadísticas de uso, copia de
seguridad y borrado, más el aprendizaje (que aparezca, que se pueda apagar) y la
carga por lotes. 76 comprobaciones.

```
node perfumario/tests/e2e.js      # sale con código 1 si algo falla
```

Necesita Playwright (`npm install playwright`). Si el Chromium que trae no está
disponible, pasale uno: `CHROME_PATH=/ruta/al/chrome node perfumario/tests/e2e.js`.

## Lo que falta

Ideas anotadas para las próximas vueltas:

- Traer la temperatura real por geolocalización en vez de cargarla a mano.
- Foto del frasco en cada ficha.
- Lista de deseados con precio objetivo.
- Dividir un frasco en decants y seguirlos por separado.
