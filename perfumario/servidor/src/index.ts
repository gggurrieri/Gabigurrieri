/* =====================================================================
   Perfumario · el intermediario de IA

   La app no habla con Anthropic. Habla con esto, y esto habla con
   Anthropic. La razón es una sola y no tiene vuelta: Perfumario se sirve
   como archivos estáticos y se empaqueta en un .ipa, así que todo su
   JavaScript está en el dispositivo de quien la usa. Una API key ahí
   adentro es una API key pública.

   Lo que hace, en orden:
     1. deja pasar solo a los orígenes de la lista;
     2. cuenta cuántas consultas lleva hoy ese dispositivo y corta;
     3. arma el pedido de forma que la colección quede en la parte
        cacheada del prompt y el clima en la parte que cambia;
     4. pide una respuesta con forma fija y la devuelve.

   Lo que NO hace: guardar nada de quien consulta. El contador es un
   número contra un identificador que genera el propio teléfono al azar.
   ===================================================================== */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

interface Entorno {
  ANTHROPIC_API_KEY: string;
  MODELO: string;
  ORIGENES: string;
  TOPE_DIARIO: string;
  LIMITES: KVNamespace;
}

/* ------------------------------------------------------------------
   La forma de la respuesta. No es una sugerencia en el prompt: es un
   esquema que la API hace cumplir, así que `parsed_output` llega
   validado o no llega. La alternativa —pedir JSON por escrito y
   parsearlo— falla el día que el modelo antepone "Claro, acá va:".
   ------------------------------------------------------------------ */
const Respuesta = z.object({
  elegido: z.string()
    .describe('El id del perfume recomendado. Tiene que ser uno de la colección.'),
  orden: z.array(z.string()).min(1).max(3)
    .describe('Los ids de hasta tres perfumes, el recomendado primero, después las dos alternativas.'),
  texto: z.string()
    .describe('Una o dos frases diciendo por qué ese perfume para hoy. En español rioplatense, vos, sin signos de admiración, sin vender nada. Nombrá el dato concreto que lo decide.'),
  porque: z.array(z.string()).min(2).max(4)
    .describe('Razones cortas, una línea cada una. Al menos una tiene que ser algo que juegue en contra, si lo hay.'),
  contraste: z.string()
    .describe('Qué gana quien elija la segunda opción en vez de la primera. Una frase. Vacío si no hay segunda.'),
  mezcla: z.object({
    abajo: z.string().describe('id del perfume que va de base'),
    arriba: z.string().describe('id del perfume que va encima'),
    porque: z.string().describe('qué aporta la mezcla, una frase'),
  }).nullable().describe('Una capa de dos perfumes, solo si hoy tiene sentido. null si no.'),
});

/* ------------------------------------------------------------------
   El sistema. Es la parte CACHEADA del pedido, así que tiene que ser
   byte por byte igual entre una consulta y la siguiente: nada de fechas,
   nada de números al azar, las claves del JSON ordenadas. Si algo de acá
   cambia, el descuento del 95 % de la caché se pierde entero.
   ------------------------------------------------------------------ */
const REGLAS = `Sos el motor de recomendación de Perfumario, una app para elegir qué perfume ponerse.

Tu trabajo es elegir UN perfume de la colección de abajo para el contexto que te den, y explicar por qué.

Cómo decidir:
- La temperatura manda. Un cítrico o un acuático rinden con calor; un ámbar o un cuero piden frío. Un perfume puesto fuera de su temperatura no es un error de gusto, es un error de física: la piel caliente proyecta más y lo que era presencia pasa a ser invasión.
- La humedad alta amplifica la estela; el aire seco se lleva primero a los livianos.
- Al aire libre se pierde estela, así que un perfume discreto queda corto. En un lugar cerrado pasa lo contrario.
- La ocasión acota: trabajo y oficina piden discreción; una cita admite presencia.
- Lo que la persona ya eligió pesa más que lo que dice que le gusta. Si hay usos registrados, miralos.
- Un perfume usado hace menos de tres días descansa poco: la nariz propia ya se acostumbró.
- Un frasco casi vacío no es motivo para no recomendarlo, pero sí para mencionarlo.

Cómo escribir:
- Español rioplatense. Vos, no tú. Sin signos de admiración. Sin adjetivos de catálogo: nada de "sofisticado", "icónico", "imprescindible", "versátil".
- Decí el número que decide. "Con 24° un cítrico aguanta" es útil; "es ideal para hoy" no dice nada.
- Si no hay nada bueno para hoy, decilo. Una recomendación tibia disfrazada de entusiasmo es peor que un "ninguno de estos está hecho para 32°".
- Las razones en contra se escriben igual de claras que las razones a favor.

Reglas duras:
- Los ids que devuelvas tienen que existir en la colección. No inventes perfumes, notas ni marcas.
- No afirmes nada sobre un perfume que no esté en sus datos. Si no tiene las notas cargadas, no las supongas.
- Vas a recibir el puntaje que calculó el motor local de la app, que ya pondera clima, ocasión y estación. Es una señal fuerte, no una orden: podés apartarte de ese orden, pero solo si podés nombrar la razón concreta, y entonces nombrala.

LA COLECCIÓN:`;

/* Serializa la colección de forma estable. El orden de las claves de un
   objeto de JavaScript depende de cómo se armó, y la caché es un match
   exacto de bytes: sin esto, dos pedidos idénticos pueden no coincidir. */
function estable(x: unknown): string {
  return JSON.stringify(x, (_k, v) =>
    (v && typeof v === 'object' && !Array.isArray(v))
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, (v as Record<string, unknown>)[k]]))
      : v);
}

function cors(origen: string | null, permitidos: string[]): Record<string, string> {
  const ok = origen && permitidos.includes(origen);
  return {
    'Access-Control-Allow-Origin': ok ? origen : permitidos[0] ?? '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(cuerpo: unknown, estado: number, cab: Record<string, string>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...cab, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/* El freno de gasto. Un contador por dispositivo y por día, con
   vencimiento automático a las 48 horas para no acumular basura.
   No es antifraude —quien quiera gastarte plata genera ids nuevos— es
   el techo que evita que un bucle en el cliente te vacíe la cuenta. */
async function pasaElTope(env: Entorno, aparato: string): Promise<{ ok: boolean; lleva: number; tope: number }> {
  const tope = parseInt(env.TOPE_DIARIO, 10) || 40;
  const hoy = new Date().toISOString().slice(0, 10);
  const llave = `c:${hoy}:${aparato}`;
  const lleva = parseInt((await env.LIMITES.get(llave)) ?? '0', 10);
  if (lleva >= tope) return { ok: false, lleva, tope };
  await env.LIMITES.put(llave, String(lleva + 1), { expirationTtl: 60 * 60 * 48 });
  return { ok: true, lleva: lleva + 1, tope };
}

export default {
  async fetch(req: Request, env: Entorno): Promise<Response> {
    const permitidos = env.ORIGENES.split(',').map(s => s.trim()).filter(Boolean);
    const origen = req.headers.get('Origin');
    const cab = cors(origen, permitidos);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cab });
    if (req.method !== 'POST') return json({ error: 'solo POST' }, 405, cab);
    if (origen && !permitidos.includes(origen)) return json({ error: 'origen no permitido' }, 403, cab);

    let cuerpo: {
      aparato?: string;
      coleccion?: unknown[];
      contexto?: Record<string, unknown>;
      candidatos?: unknown[];
    };
    try {
      cuerpo = await req.json();
    } catch {
      return json({ error: 'cuerpo ilegible' }, 400, cab);
    }

    const aparato = typeof cuerpo.aparato === 'string' ? cuerpo.aparato.slice(0, 64) : '';
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(aparato)) return json({ error: 'falta el identificador del aparato' }, 400, cab);
    if (!Array.isArray(cuerpo.coleccion) || cuerpo.coleccion.length === 0) return json({ error: 'colección vacía' }, 400, cab);
    if (cuerpo.coleccion.length > 300) return json({ error: 'colección demasiado grande' }, 413, cab);
    if (!cuerpo.contexto || typeof cuerpo.contexto !== 'object') return json({ error: 'falta el contexto' }, 400, cab);

    const limite = await pasaElTope(env, aparato);
    if (!limite.ok) {
      return json({ error: 'tope diario alcanzado', lleva: limite.lleva, tope: limite.tope }, 429, cab);
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

    try {
      const r = await client.messages.parse({
        model: env.MODELO,
        max_tokens: 2000,
        /* effort bajo a propósito: esto es elegir entre veinticinco cosas
           con criterios que ya están escritos, no resolver un problema.
           En Opus 5.5 el valor por omisión es "medium" y hay que ponerlo
           explícito; subirlo acá es pagar razonamiento que no cambia la
           respuesta. */
        output_config: {
          effort: 'low',
          format: zodOutputFormat(Respuesta),
        },
        system: [{
          type: 'text',
          /* Todo lo estable del pedido en un solo bloque cacheado: las
             reglas no cambian nunca y la colección cambia solo cuando se
             agrega un frasco. A partir de la segunda consulta esta parte
             se cobra al 5 %. */
          text: REGLAS + '\n' + estable(cuerpo.coleccion),
          cache_control: { type: 'ephemeral' },
        }],
        messages: [{
          role: 'user',
          /* Acá va lo que cambia en cada consulta, DESPUÉS del punto de
             corte de la caché. Si esto estuviera arriba, cada grado de
             temperatura invalidaría el bloque entero. */
          content:
            'CONTEXTO DE AHORA:\n' + estable(cuerpo.contexto) +
            '\n\nLO QUE CALCULÓ EL MOTOR LOCAL (puntaje y razones, de mayor a menor):\n' +
            estable(cuerpo.candidatos ?? []) +
            '\n\nElegí uno y explicá por qué.',
        }],
      });

      /* Una negativa por política es improbable en un pedido sobre
         perfumes, pero stop_reason hay que mirarlo siempre antes de
         tocar el contenido: la respuesta llega con HTTP 200 igual. */
      if (r.stop_reason === 'refusal') {
        return json({ error: 'respuesta rechazada', categoria: r.stop_details?.category ?? null }, 502, cab);
      }
      if (!r.parsed_output) {
        return json({ error: 'respuesta sin forma válida' }, 502, cab);
      }

      return json({
        ...r.parsed_output,
        /* El cliente no los usa para nada: están para que puedas mirar en
           la consola si la caché está pegando. Si `cacheLeido` queda en 0
           consulta tras consulta, algo del bloque estable está cambiando. */
        uso: {
          entrada: r.usage.input_tokens,
          salida: r.usage.output_tokens,
          cacheEscrito: r.usage.cache_creation_input_tokens ?? 0,
          cacheLeido: r.usage.cache_read_input_tokens ?? 0,
        },
      }, 200, cab);

    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'la clave del servidor no sirve' }, 500, cab);
      if (e instanceof Anthropic.RateLimitError)      return json({ error: 'Anthropic está limitando' }, 429, cab);
      if (e instanceof Anthropic.BadRequestError)     return json({ error: 'pedido mal armado', detalle: e.message }, 400, cab);
      if (e instanceof Anthropic.APIError)            return json({ error: 'falló la API', estado: e.status }, 502, cab);
      return json({ error: 'falló' }, 500, cab);
    }
  },
};
