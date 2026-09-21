# Renta Fija

App web para aprender a leer una curva de bonos y probar una estrategia de renta
fija sin arriesgar plata. Toma una foto real del mercado argentino, recalcula cada
tasa desde el flujo de fondos, marca qué bonos se apartan de la curva de sus pares
y deja operar una cartera simulada.

No manda ninguna orden a ningún broker. No tiene servidor, no tiene cuenta y no
sale ningún dato del teléfono.

## Cómo usarla

**En la compu:** abrí `index.html` con doble clic.

**En el teléfono:** publicá la carpeta en cualquier hosting estático y usá
"Agregar a pantalla de inicio". Queda como una app nativa y funciona sin señal.

> Los datos viven en el `localStorage` del navegador donde la abriste. Si limpiás
> el navegador o cambiás de teléfono se pierden: usá **Ajustes → Exportar**.

## Qué hace

| Pestaña | Para qué sirve |
|---|---|
| **Hoy** | Valor de la cartera, señales del día, spread entre leyes y el control de calidad de los datos del broker. |
| **Curva** | El gráfico de tasa contra plazo con la recta ajustada. Cada punto es un bono; los que se apartan son la señal. |
| **Mercado** | Los 17 instrumentos con TIR, duration, paridad y desvío. Se ordena por cualquier columna y cada fila se abre con el detalle completo. |
| **Cartera** | Compra y venta simuladas, con comisiones reales. Posiciones, resultado y bitácora. |
| **Flujos** | Calendario de lo que la cartera va a cobrar, mes por mes. |
| **Ajustes** | Capital, comisiones, copia de seguridad y de cuándo es la foto. |

El signo de pregunta de arriba abre un glosario con veinte términos, cada uno con
su nombre en inglés: es el que van a usar el broker, la documentación de la API y
cualquiera que trabaje en esto.

## De dónde salen los datos

`assets/datos.js` es una foto de InvertirOnline del **20/09/2026 al cierre**, para
liquidar el 21/09. Son 17 instrumentos: 3 letras en pesos, 3 bonos CER, 10
soberanos en dólares (5 bajo ley argentina y 5 bajo ley de Nueva York) y 1 Bopreal
del Banco Central.

Es una foto y no una consulta en vivo por una razón concreta: la app corre en el
navegador del teléfono, y pedirle datos a IOL desde ahí dejaría la credencial
escrita en el propio HTML, a la vista de cualquiera que abra el inspector. La foto
se actualiza desde afuera y la app se queda solo con la cuenta.

### Para actualizar la foto

Los datos salen de la herramienta `get_fixed_income_analytics` de IOL, un ticker
por llamada. De la respuesta se copian `dirty_price`, `clean_price`,
`accrued_interest`, `technical_value`, `parity`, `yields.tir`,
`modified_duration`, `nominal_value` y el `cashflow` completo, sumando interés más
amortización de cada período en un solo importe.

Después se corre `node tests/motor.js`: si la TIR recalculada no coincide con la
que publica IOL, algo se copió mal.

## Cómo decide

### Primero recalcula todo

La app no le cree al broker: reconstruye cada TIR y cada duration descontando el
flujo de fondos desde cero, y recién después compara. En la foto actual las 17
coinciden con menos de un punto básico de diferencia, lo que confirma que está
usando la misma convención de días (ACT/365), la misma fecha de liquidación y el
mismo tipo de cambio.

Ese tipo de cambio no lo publica IOL: se despeja del valor técnico, y da 1478,705
en los once bonos en dólares. El mismo número hasta el tercer decimal en los once,
así que es el del broker y no una casualidad.

### Y avisa cuando un dato no cierra

Dos de los 17 instrumentos vienen rotos de la API, y quedan marcados:

- **S30N6** llega con 5.892.788 de intereses corridos sobre un precio de 124,21.
  El flujo está reconstruido desde la TIR.
- **GD30** llega con un flujo que termina con 28 de nominal vivo el mismo día que
  el bono vence: le faltan pagos, así que la TIR que publica IOL queda subestimada.

Ninguno de los dos puede dar señal ni mover la recta contra la que se miden los
demás. Un bot que no chequea esto compra el GD30 convencido de que rinde 6,37%.

### Después compara cada bono contra sus pares

Para cada grupo —misma clase, mismo emisor y misma ley— ajusta la recta de tasa
contra duration. Lo que interesa no es la recta sino lo que sobra: un bono que
rinde más de lo que su plazo explica está barato respecto de sus pares.

La ley entró en el agrupamiento después de ver la primera corrida. Con una sola
curva para todos los soberanos en dólares, los cinco Bonares salían "comprar" y los
cinco Globales "vender", los diez a la vez. Eso no es una oportunidad: los Bonares
se discuten en tribunales argentinos y por eso rinden de más, siempre. La señal
estaba redescubriendo el riesgo legal y llamándolo ganga.

### Y se calla cuando no tiene con qué hablar

La señal solo sale si se cumplen las cuatro condiciones:

1. El dato del bono cierra contra el broker.
2. Su grupo tiene **al menos 4 bonos**. Con dos la recta pasa exacta por los dos y
   todos los desvíos darían cero.
3. La recta explica **al menos el 60%** de la dispersión (R²). Por debajo de eso,
   el desvío es ruido con nombre técnico.
4. El desvío supera los **50 puntos básicos**. Menos que eso se lo come el spread
   de compra y venta.

En la foto actual eso deja dos señales de diecisiete instrumentos: AE38 barato
83 pb y AL29 caro 55 pb. Las letras y los bonos CER no llegan a cuatro por grupo y
la curva de ley Nueva York explica solo el 43%, así que ninguno da señal.

Que no haya señal es una respuesta, no una falla.

### Aparte: el spread entre leyes

Cada Bonar y su Global pagan lo mismo el mismo día; lo único distinto es dónde se
reclama si el país no paga. La diferencia de tasa entre los dos es la comparación
más limpia de toda la curva, porque no hay ninguna otra variable en el medio. En la
foto promedia 127 puntos básicos sobre tres pares sanos.

## Estructura

```
inversiones/
  index.html            las seis pantallas
  assets/
    datos.js            la foto del mercado: 17 instrumentos con su flujo completo
    motor.js            todo el cálculo, sin tocar la pantalla
    app.js              la interfaz
    styles.css
  tests/
    motor.js            78 comprobaciones, corren en node
    e2e.js              80 comprobaciones, recorren la app en un iPhone simulado
  tools/
    generar-iconos.js
```

El motor no toca el DOM ni el `localStorage` a propósito: así se lo puede correr
entero en medio segundo desde node, en vez de abrir un navegador para ver si una
TIR da bien.

## Pruebas

```
node tests/motor.js     # el cálculo: TIR, duration, curva, comisiones, cartera
node tests/e2e.js       # la app entera como un usuario, en un iPhone simulado
```

Las dos salen con código 1 si algo falla. La de extremo a extremo necesita
Playwright; con `CHROME_PATH` se le pasa un Chromium propio.

Las del motor son de tres tipos: contra la matemática (un bono cero cupón tiene
respuestas que se calculan a mano), contra IOL (la TIR recalculada tiene que
coincidir con la del broker) y contra el sentido común (que una compra no deje el
efectivo en negativo, que un cobro ya pasado no aparezca en el calendario).

## Lo que todavía no hace

- **Precios en vivo.** Hoy es una foto de un día. Para seguir una estrategia hace
  falta una serie, y para eso la actualización tiene que correr afuera del
  navegador.
- **Backtesting.** Con una sola foto no se puede medir cómo habría andado la
  estrategia. Hace falta historial de precios.
- **Cobrar los cupones en la simulación.** El calendario muestra qué se va a
  cobrar, pero la cartera simulada todavía no acredita esos pagos ni los reinvierte.
- **Órdenes reales.** A propósito: la app no manda nada al broker.

## Aviso

Esto es una simulación con fines de aprendizaje. No es asesoramiento financiero, no
manda órdenes y los precios son de un solo día: no reflejan el mercado de ahora.
