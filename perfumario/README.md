# Perfumario

App web para tu colección de perfumes: qué tenés, qué ponerte hoy y qué significa
cada nota olfativa. Funciona sin conexión y guarda todo en el navegador: no hay
servidor, no hay cuenta, no hay datos que salgan del dispositivo.

## La colección viene adentro

`assets/coleccion.js` trae una colección cargada de fábrica: la primera vez que
abrís la app en un navegador entra sola, sin importar nada a mano. Después manda
lo que tengas guardado.

- **Si borrás todo desde Ajustes, no vuelve.** La app guarda el estado apenas
  arranca, así que la marca de "ya arrancó una vez" queda puesta. Un dato que
  resucita solo después de borrarlo es un bug, no una comodidad.
- **Se puede volver a cargar a pedido** con *Ajustes → Cargar mi colección*, que
  agrega únicamente lo que falte, comparando por nombre. Sirve si ya venías
  usando la app antes de que existiera este archivo.
- **Para cambiarla**, editá `assets/coleccion.js` (es un objeto JSON con la misma
  forma que la exportación).
- **Para publicar la app sin ninguna colección adentro**, borrá ese archivo y
  sacá su `<script>` del `index.html`: la app arranca vacía y no se rompe.

> Ojo con dónde la publicás: ese archivo viaja con la app. Si servís el repo por
> GitHub Pages, cualquiera que entre a la URL ve esa colección.

### Cómo se traduce una planilla de afuera

Los últimos ocho perfumes entraron desde una lista escrita con otros nombres de
campo. La traducción quedó anotada acá para que la próxima no haya que
adivinarla:

| Campo de afuera | Campo de la app | Regla |
|---|---|---|
| `fam: "acuatico"` | `familia: "acuatica"` | misma familia, en femenino |
| `min` / `max` (°C) | `estaciones` | entra la estación cuya temperatura típica cae dentro del rango: verano 28°, primavera 21°, otoño 18°, invierno 11° |
| `proy` 1–3 | `estela` 1–5 | 1→2, 2→3, 3→4; los extremos quedan libres para lo que de verdad no se siente o no se puede esconder |
| `ocasiones: ["diario","oficina","social"]` | `ocasiones: ["casual","trabajo","evento"]` | las seis de la app |
| `ocasiones: [… "noche" …]` | `momento: "noche"` | "noche" no es una ocasión, es un momento del día: iba en el campo equivocado |
| `muestra` / `mini` | `ml: 2` / `ml: 5` | estimados, corregilos desde la ficha |
| `nota` (prosa) | `salida` / `corazon` / `fondo` | las pirámides salen de esa misma frase, nota por nota; no se agregó ninguna que no estuviera escrita |

Los campos que la app todavía no usa (`juice`, el color del líquido, y
`tempMin` / `tempMax`) viajan igual dentro de cada ficha. La app ignora lo que no
conoce y el formulario de edición conserva esos campos, así que el dato no se
pierde por editar un perfume.

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
| **Hoy** | **Una** respuesta: un perfume, una razón, un botón para registrarlo. Lo único que se pregunta es qué vas a hacer; la temperatura, el momento y la estación se deducen y se muestran en una línea de texto. Las otras opciones quedan plegadas, y los controles finos detrás de "ajustar". Desde acá también se arma la valija de un viaje. |
| **Colección** | Alta, edición y borrado de perfumes con casa, concentración, familia, pirámide de notas, ml, precio, estaciones, ocasiones, duración, estela y puntaje. Buscador por nombre, casa o **nota**, filtro por familia y siete criterios de orden. **Carga rápida** para pegar una lista entera de una vez. |
| **Notas** | Diccionario de 112 notas y 11 familias explicadas, tu perfil olfativo (qué tenés contra qué usás), comparación de dos perfumes lado a lado y buscador de parecidos. |
| **Uso** | Usos del mes, ml gastados, el más puesto, costo por uso, rotación de los últimos 90 días, los que juntan polvo, los que se están por acabar e historial. Tocando un uso se corrige (fecha, perfume, aplicaciones, ocasión) y los ml del frasco se recalculan solos. |
| **Ajustes** | ml por aplicación, moneda, hemisferio, exportar/importar/borrar y seis perfumes de ejemplo para mirar la app con contenido. |

## Una pregunta, una respuesta

La pantalla de uso diario pasó de **22 controles y 1.342 px** (dos pantallas de
scroll) a **una pantalla sin scroll**. El cambio fue de criterio, no de estética:
la app venía explicando su modelo en la pantalla principal —termómetro, momento,
tres tarjetas con tres razones cada una, nueve frases para elegir— cuando lo que
hace falta a las nueve de la noche es una respuesta.

- **Se pregunta solo lo que no se puede deducir**: qué vas a hacer. La
  temperatura viene del clima, el momento de la hora y la estación del
  calendario: van en una línea de texto, no en controles.
- **La ocasión se recuerda**: la próxima vez arranca donde la dejaste.
- **Una respuesta, redactada.** Dos o tres frases explicando por qué ese y no
  otro, una alternativa con la diferencia concreta ("si preferís el lado de
  naranja y pomelo") y cuántas aplicaciones y dónde. No hay nada en ese texto
  que el puntaje no haya usado: sale de los mismos datos, escrito como se lo
  contarías a alguien en vez de una lista de reglas cumplidas.
- Las otras opciones quedan plegadas, y el resto de los porqués, en la ficha.
- **Nada se eliminó.** Los controles finos se despliegan con "ajustar" y lo que
  la app aprendió se mudó a la pestaña Uso, que es donde se miran las
  estadísticas.

## Cómo decide qué recomendarte

El número grande de cada tarjeta es el **puntaje**, de 0 a 100, y lleva su
etiqueta debajo: sirve para comparar entre ellos, no como nota absoluta.

Cada perfume arranca en 50 puntos y suma o resta según el contexto. La idea es que
**ninguna sugerencia aparezca sin explicación**: debajo de cada una se listan las
tres razones que más pesaron.

| Qué mira | Cómo pesa |
|---|---|
| Estación actual | +18 si coincide, −12 si lo marcaste para otra, **pesado por la temperatura** (ver abajo) |
| Temperatura contra la familia | hasta −20, según cuánto se aleje del ideal de esa familia (un gourmand a 35° pierde, un cítrico a 5° también). Es la **sensación térmica**, no la del termómetro al sol |
| Humedad | con 75 % o más: −6 a los de mucha estela, +4 a los discretos. Con 30 % o menos: +5 a los que duran, −4 a los que se evaporan |
| Viento | desde 25 km/h: +5 a los de estela fuerte, −5 a los discretos |
| Momento del día | +12 si coincide, +8 si sirve para ambos (también coincide), −10 si no |
| Ocasión | +14 si la tiene marcada, −8 si no |
| Estela contra el ambiente | −12 si deja mucha estela para la oficina o el gimnasio, +8 si la ocasión pide presencia |
| Rotación | +10 si hace más de tres semanas que no lo usás |
| Lluvia | +6 si dura 8 horas o más, −6 si es de los que duran 5 o menos |
| Tu puntaje | ±8 según las estrellas que le diste; sin puntuar no castiga |
| Lo que queda en el frasco | −8 si queda 10 % o menos |

Lo que ya te pusiste hoy no se sugiere: es una regla dura, no un castigo de
puntaje. Cuando era un −30, los bonus del aprendizaje podían taparlo y la app
terminaba recomendando lo que ya tenías puesto. Solo vuelve a aparecer si sin él
no llegan a tres sugerencias.

**Se puntúa el día, no el instante.** Un perfume se aplica una vez y acompaña
ocho horas, así que de día la temperatura que importa no es la de ahora sino el
arco hasta la máxima. La app pide ese arco junto con el clima actual y mide
contra los dos extremos: gana el que cubre el trayecto, no el que brilla a las
ocho de la mañana. Esto salió de comparar la app con una recomendación hecha a
mano: con 4° a las 8:30 y 10° a la tarde, la app ponía cuarto a un amaderado que
era la mejor opción del día, porque lo juzgaba solo por el frío de la mañana.

El castigo por temperatura llega hasta 30 puntos (antes 20). Con el tope bajo,
"algo fuera de rango" y "completamente fuera" terminaban pareciéndose, y un
cítrico a 5° quedaba a un punto de un amaderado.

**La temperatura le gana al almanaque.** La estación es una aproximación al
clima; la temperatura *es* el clima. Si un día de primavera hay 5°, el almanaque
está mintiendo y no puede seguir valiendo 30 puntos de diferencia (+18 al que
dice "primavera", −12 al que dice "invierno") mientras el termómetro mueve 10.
El peso de la estación baja a medida que la temperatura se aleja de lo típico y
a los 15 grados de diferencia desaparece: ahí decide el termómetro solo. La
pantalla lo dice cuando pasa.

Esto salió de usarla: a 5° en primavera, para salir de noche, recomendaba tres
aromáticos frescos y dejaba los ámbar once puntos abajo.

**Sin puntuar no es lo mismo que puntuar mal.** Un perfume con 0 estrellas no
resta: 0 significa "todavía no lo puntuaste".

**Cuando empatan, lo dice.** Si las primeras sugerencias tienen el mismo puntaje
y las mismas razones, la app avisa que para ella son el mismo perfume y nombra el
dato que falta (notas sin cargar, sin puntuar) en vez de fingir un orden.

A eso se le suma lo que aprende de vos (se apaga en Ajustes).

El hemisferio importa: con la opción "Sur", diciembre es verano.

## El clima, automático

En **Ajustes → Clima** elegís una ciudad (o tocás "Usar mi ubicación") y la
temperatura del recomendador deja de cargarse a mano.

Los datos salen de [Open-Meteo](https://open-meteo.com): gratis, sin clave y con
CORS abierto (*Cross-Origin Resource Sharing*: el permiso que da un servidor para
que una página de otro dominio lea su respuesta), así que la app lo consulta
directo desde el navegador, sin backend propio. Dos llamadas:

- **Ninguna**, si la ciudad está en la lista de 65 que viaja dentro de la app
  (`assets/datos.js`): ahí las coordenadas ya están y elegirla funciona sin
  internet.
- `geocoding-api.open-meteo.com/v1/search` solo para las que no están en esa
  lista, con la escritura pausada 400 ms (*debounce*: esperar a que la persona
  deje de tipear antes de consultar, en lugar de una llamada por tecla).
- `api.open-meteo.com/v1/forecast` para la temperatura, la humedad y el estado del
  cielo (códigos WMO, el estándar meteorológico que traduce 3 a "nublado").

Reglas que sigue:

- **El dato dura 30 minutos.** Dentro de esa ventana usa el último que trajo, en
  vez de pedir uno nuevo en cada pantalla.
- **Tu dedo le gana a la API.** Si movés el control de temperatura, manda ese
  valor y la línea del clima lo aclara; "Actualizar" devuelve el dato real.
- **Nunca bloquea.** El pedido corta a los 8 segundos, y si falla (sin internet,
  API caída, o una política de seguridad que bloquee el pedido) lo dice y seguís a
  mano. El clima es una comodidad, no un requisito.
- **Sale solo la ciudad.** Se envían las coordenadas elegidas y nada más: tu
  colección no viaja a ningún lado.
- **La ubicación del dispositivo se nombra sin consultar a nadie.** En vez de
  guardar un "Mi ubicación" que no dice nada, se busca la ciudad más cercana de
  la lista incluida (distancia de Haversine): hasta 20 km se usa su nombre, hasta
  90 km se aclara que es una referencia ("cerca de…") y más lejos se muestran las
  coordenadas antes que inventar un lugar. No hay geocodificación inversa, así
  que tus coordenadas exactas no salen del teléfono.
- **El service worker no lo cachea.** Solo guarda los archivos propios; si
  cachearan el clima, la temperatura quedaría congelada en la primera consulta.

## La apertura

Al abrirla se dibuja el frasco, sube un vapor y entra la app: menos de un
segundo en total. Dos reglas que la hacen inofensiva:

- **No intercepta nada** (`pointer-events: none`): podés tocar la app mientras
  corre, no es una pantalla que haya que esperar.
- **Se saca sola del DOM** cuando termina, con un plazo de respaldo por si el
  navegador no dispara el evento de fin de animación. Un overlay invisible que
  queda puesto es una app que no responde.

Con `prefers-reduced-motion` activado no aparece, igual que el resto de las
animaciones.

## Cómo se actualiza

El service worker va **primero a la red** y usa la caché solo como respaldo
cuando no hay señal. Es a propósito: la primera versión hacía lo contrario
—caché primero, que es más rápido— y el efecto fue que un teléfono que ya había
abierto la app **no volvía a pedir los archivos nunca más**. Las correcciones se
publicaban y no llegaban.

Cada versión lleva un sello (`VERSION`, en `sw.js` y en `assets/app.js`) que se
ve en **Ajustes → Sobre la app**. Sirve para distinguir dos cosas que se
confunden todo el tiempo: "el cambio no llegó" y "el cambio no funciona". Al
publicar, hay que subir ese sello en los dos archivos.

> **En la vista previa embebida (Artifact) el clima no puede funcionar**: esa
> página corre dentro de un iframe que bloquea tanto los pedidos a otros dominios
> como el permiso de ubicación del navegador. La app lo detecta (`window.self !==
> window.top`) y lo dice con todas las letras, en vez de un "no pude" genérico:
> elegís la ciudad de la lista incluida y seguís con la temperatura a mano.
> Servida desde GitHub Pages, el clima y la ubicación funcionan normal.

**Todo el clima entra en la decisión, no solo la temperatura.** La consulta trae
sensación térmica, humedad, viento y estado del cielo, y las cuatro pesan:

- **Sensación térmica en vez de temperatura.** Es lo que la piel recibe, y ya
  tiene adentro el viento y la humedad. La pantalla muestra las dos ("1° de
  sensación · real 6°") para que se entienda de dónde sale el número que decide.
- **Humedad.** Con aire húmedo un perfume proyecta más de lo que uno quiere, y
  con aire seco se evapora antes. En una noche de verano a 26°, Layton (estela 5)
  es el segundo con 25 % de humedad y cae al cuarto con 88 %.
- **Viento.** Desde 25 km/h la estela liviana no llega a ningún lado.
- **Lluvia.** Sube el que aguanta, baja el liviano.

El dato vale 15 minutos, así que "hoy a la noche" usa el clima de hace un rato,
no el de la mañana. En el viaje pasa lo mismo por día: sensación térmica media,
humedad media y viento máximo de cada jornada.

## Comparar dos, lado a lado

En **Notas → Comparar dos** (o desde cualquier ficha, con *Comparar*) se enfrentan
dos perfumes: puntaje de hoy, familia, concentración, duración, estela,
estaciones, ocasiones, momento, tu puntaje, cuánto queda, precio por ml, costo
por uso, usos y último uso. En cada dato numérico se resalta cuál gana, y abajo
se separan las notas que comparten de las propias de cada uno.

Cierra con un veredicto, porque la pregunta real no es "cuál es mejor" sino
**cuál me pongo hoy**: se resuelve con el mismo puntaje de la pestaña Hoy y en el
contexto elegido ahí, así que cambiar la ocasión o la temperatura cambia el
resultado. Entrando desde una ficha, del otro lado se pone automáticamente el más
parecido de tu colección.

Si ponés el mismo perfume de los dos lados, te avisa en lugar de corregirte la
selección por atrás.

## Qué llevar de viaje

**Hoy → ✈️ Me voy de viaje**: destino, fechas, qué vas a hacer allá y cuántos
perfumes llevás. La app busca el **pronóstico diario del destino** (Open-Meteo da
hasta unos 15 días), calcula en qué estación está ese lugar —usa el hemisferio
del destino, no el tuyo— y arma la lista.

La parte interesante es cómo elige, porque **no es "los tres de mayor puntaje"**:
esos suelen parecerse entre sí y dejan días sin cubrir. Cada día × cada ocasión
del viaje es una casilla, y en cada vuelta entra el perfume que más sube las
casillas peor cubiertas (cobertura máxima por pasos). Así el segundo que entra es
el que tapa lo que el primero deja afuera.

Cada elegido muestra cuántos días cubre, para qué ocasiones, y **cuántos ml vas a
gastar** (días × aplicaciones). Avisa si no te alcanza lo que queda en el frasco,
y si el frasco pasa de 100 ml, que en cabina no entra.

Dos límites que se respetan en vez de disimularse: si no hay pronóstico (faltan
más de 15 días, o no hay internet) **se pide la temperatura esperada** en lugar de
inventar un clima; y si pedís tres pero con dos alcanza, lo dice, y no completa la
lista con un perfume que no sirve para ese viaje.

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
| La temperatura a la que usás esa familia | +5 si estás en esa temperatura, hasta −12 si te alejás más de 8 grados |

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

## Cargar las notas de un perfume

En el formulario, **📋 Pegar la pirámide** acepta el texto de las notas como
venga y lo reparte en salida, corazón y fondo. Entiende encabezados en español
("Notas de salida", "Corazón", "Fondo", "Base") y en inglés ("Top / Middle /
Base"), separa por comas, puntos, "y" o "and", y normaliza los nombres contra el
diccionario de la app, para que "vainilla" y "Vainilla" no queden como dos notas
distintas. Sin encabezados no adivina: manda todo al corazón y lo acomodás vos.

> **Por qué no se consume Fragrantica.** No tiene API pública, responde 403 a
> cualquier pedido automático y su `robots.txt` prohíbe explícitamente a los
> rastreadores de IA, con una reserva expresa de derechos bajo el artículo 4 de
> la directiva europea de copyright: las pirámides son su contenido editorial.
> Además, una app estática sin servidor propio no podría pedírselo igual (CORS).
> Pegar a mano lo que uno mismo consultó es otra cosa, y para eso está el botón.

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
├── sw.js               service worker: primero la red, caché de respaldo sin internet
├── assets/
│   ├── app.js          toda la lógica: estado, recomendador, vistas
│   ├── datos.js        familias, notas y catálogo de fragancias (solo lectura)
│   ├── coleccion.js    la colección que viene cargada de fábrica
│   ├── styles.css      estilos
│   └── icon*.png/svg   el ícono
├── tools/
│   ├── build-artifact.sh   arma la versión de un solo archivo
│   └── generar-iconos.js   rasteriza el SVG a los PNG que pide iOS
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

`tests/e2e.js` recorre la app como la usa su dueño, en un viewport de iPhone con eventos
táctiles reales: primer arranque, carga de ejemplos, sugerencias y cómo cambian con
el contexto, registro y borrado de usos con el descuento de ml, buscador y filtros,
alta desde el catálogo, ficha, diccionario de notas, estadísticas de uso, copia de
seguridad y borrado, más el aprendizaje (que aparezca, que se pueda apagar) y la
carga por lotes, y el clima con la API simulada (que llegue, que se pueda pisar a
mano, que la ciudad se encuentre sin red y que falle sin romper nada) y la
colección incluida (que entre sola, que no
resucite después de borrarla y que no se duplique), la corrección de un uso con
su recálculo de ml, el aprendizaje por temperatura y la descarga de la copia.
165 comprobaciones, incluidos candados que fallan si alguna nota usada en una
ficha quedó sin explicación en el diccionario, o si el ícono de "Agregar a
pantalla de inicio" vuelve a quedar liso (ya pasó una vez: salía negro).

```
node perfumario/tests/e2e.js      # sale con código 1 si algo falla
```

Necesita Playwright (`npm install playwright`). Si el Chromium que trae no está
disponible, pasale uno: `CHROME_PATH=/ruta/al/chrome node perfumario/tests/e2e.js`.

## Lo que falta

Ideas anotadas para las próximas vueltas:

- Un campo de devolución después del uso ("me lo elogiaron", "no duró nada") que
  alimente el puntaje; hoy eso queda en una nota libre que el modelo no lee.

- Usar `tempMin` / `tempMax` en el puntaje. Hoy la temperatura ideal sale de la
  familia (un cítrico luce a 27°, un ámbar a 10°), igual para todos los cítricos.
  Ocho fichas ya traen su propio rango: el día que el motor lo lea, el puntaje
  deja de ser por familia y pasa a ser por frasco.

- Duración en horas: están en 0 en buena parte de la colección. La app lo lee
  como "no lo sé" y no castiga, pero tampoco puede usarlo para decidir con
  lluvia o con aire seco.

- Una alerta cuando una ficha se contradice a sí misma. Maahir Legacy estuvo
  clasificado como ámbar de noche hasta que apareció su pirámide: es un fougère
  de lima, menta y musgo de roble. La idea obvia —comparar la familia declarada
  contra la familia de cada nota— se probó y no sirve: marca 13 de 30 fichas
  contando notas sueltas, 3 de 30 pesando el fondo por encima de la salida, y
  en ninguna de las dos versiones habría marcado justamente a Maahir Legacy.
  La regla que sí lo agarra es más angosta: una salida casi toda fresca
  (cítrica, verde, acuática o aromática) en un perfume declarado solo para
  frío. Con esa, la colección entera da un solo falso positivo, Layton, que
  abre fresco sobre una base cálida a propósito. Sin implementar: una alerta
  que grita seguido se aprende a ignorar, y todavía no está claro que una sola
  regla angosta justifique la pantalla.

- Foto del frasco en cada ficha.
- Lista de deseados con precio objetivo.
- Dividir un frasco en decants y seguirlos por separado.
