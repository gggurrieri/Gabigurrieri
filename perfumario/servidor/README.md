# El intermediario

La app no habla con Anthropic. Habla con esto, y esto habla con Anthropic.

## Por qué existe

Perfumario se publica como archivos estáticos (GitHub Pages) y se empaqueta en un
`.ipa`. En los dos casos **todo su JavaScript está en el dispositivo de quien la
usa**: se abre el inspector, o se descomprime el paquete, y se lee entero. Una
API key ahí adentro es una API key pública — Anthropic además escanea los repos
públicos y revoca automáticamente las que encuentra.

No hay forma de evitarlo desde el cliente. Hace falta un servidor. Este es el más
chico que resuelve el problema.

## Qué hace

1. Deja pasar solo a los orígenes de la lista (`ORIGENES`).
2. Cuenta cuántas consultas lleva hoy ese dispositivo y corta en `TOPE_DIARIO`.
3. Arma el pedido para que la colección quede en la parte **cacheada** del prompt
   y el clima en la parte que cambia.
4. Pide una respuesta con **forma fija** (la API valida el esquema; no es un
   "por favor devolveme JSON" en el prompt) y la devuelve.

No guarda nada de quien consulta. El contador es un número contra un
identificador que genera el propio teléfono al azar.

## Desplegarlo

Cloudflare Workers tiene un plan gratuito de 100.000 pedidos por día, que para
esto sobra. Hacen falta una cuenta de Cloudflare y una API key de Anthropic
(`https://console.anthropic.com` → Settings → API Keys).

```bash
cd perfumario/servidor
npm install

# 1. El espacio donde se cuentan las consultas por dispositivo.
npx wrangler kv namespace create LIMITES
#    Copiá el id que imprime y pegalo en wrangler.toml, en PEGAR_EL_ID_ACA.

# 2. Tu origen de GitHub Pages en ORIGENES, dentro de wrangler.toml.
#    "capacitor://localhost" ya está: es la app dentro del iPhone.

# 3. La clave. Esto la guarda cifrada en Cloudflare; no queda en ningún archivo.
npm run clave        # pega la key cuando la pida

# 4. Arriba.
npm run deploy
```

Te devuelve una dirección tipo `https://perfumario-ia.tu-cuenta.workers.dev`.
Esa es la que va en **Ajustes → Recomendar con Claude** dentro de la app.

Para probar sin desplegar: `npm run dev` levanta todo en `http://localhost:8787`
(la clave la toma de un archivo `.dev.vars` con `ANTHROPIC_API_KEY=...`, que está
en el `.gitignore`).

## Lo que cuesta

Con `claude-opus-5-5`, que es lo que trae configurado, y una colección de 25
perfumes:

| | tokens | precio | subtotal |
|---|---:|---:|---:|
| Reglas + colección, **leídos de caché** | ~4.000 | US$ 0,20 / millón | US$ 0,0008 |
| Clima, ocasión y candidatos | ~500 | US$ 4,00 / millón | US$ 0,0020 |
| La respuesta | ~400 | US$ 20,00 / millón | US$ 0,0080 |
| | | **por consulta** | **≈ US$ 0,011** |

Un centavo. Para vos solo, abriendo la app cinco veces por día, son unos **US$ 1,65
por mes**. Con mil personas haciendo lo mismo, **US$ 1.650 por mes** — y ese es el
número que importa antes de poner la app en la tienda.

Hay dos palancas, en este orden:

- **La caché ya está puesta.** Sin ella las reglas y la colección se cobrarían a
  US$ 4 el millón en vez de US$ 0,20, y cada consulta costaría tres veces más.
  Para que funcione, el bloque estable tiene que ser **byte por byte idéntico**
  entre una consulta y la siguiente; por eso el JSON se serializa con las claves
  ordenadas y no hay ninguna fecha adentro. Si `cacheLeido` vuelve en 0 consulta
  tras consulta, algo de ese bloque está cambiando.
- **El modelo.** Cambiar `MODELO` a `claude-haiku-5-5` en `wrangler.toml` lleva el
  costo a **≈ US$ 0,0004** por consulta: 40 veces más barato. Para "elegir entre
  25 cosas con criterios ya escritos y redactar dos frases" es una tarea donde la
  diferencia se nota poco. Probá las dos antes de decidir — es una línea.

La app además **cachea del lado del teléfono seis horas**: la misma colección con
el mismo clima y la misma ocasión no se vuelve a preguntar. En uso real eso baja
bastante el número de arriba.

## Dos decisiones que conviene conocer

**El motor local no se tocó.** `puntuar()` sigue calculando y sigue siendo lo
primero que se pinta. Claude recibe su puntaje y sus razones como señal, y puede
apartarse de ese orden solo si nombra la razón. Si Claude no contesta —sin señal,
tope agotado, servidor caído— lo que quedó en pantalla es una recomendación
completa. El fracaso de esta capa no se ve salvo que lo busques.

**No tiene reintento del lado del servidor por negativa de política.** La API
ofrece un parámetro `fallbacks` que reintenta en otro modelo cuando el primero
declina por seguridad, pero vive en una ruta distinta de la que usa
`messages.parse()`, que es la documentada para obtener JSON validado. Para
recomendaciones de perfume una negativa no es un modo de falla realista, y si
pasara, la app ya degrada al motor local como con cualquier otra respuesta que no
llega. Si algún día hiciera falta, está marcado en el código.
