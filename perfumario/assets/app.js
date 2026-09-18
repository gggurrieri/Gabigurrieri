/* =====================================================================
   Perfumario
   Colección de perfumes, recomendador diario y enciclopedia de notas.
   Todo se guarda en localStorage: sin servidor, sin cuenta, sin red.
   ===================================================================== */
(function () {
'use strict';

const D = window.PERFUMARIO_DATOS;

/* Sirve para saber, mirando el teléfono, qué versión se está ejecutando.
   Sin esto, "no me aparece el cambio" es imposible de distinguir de
   "el cambio no funciona". Se actualiza junto con la del service worker. */
const VERSION = '2026-09-18.1';

/* ------------------------------ utils ------------------------------ */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const pad = n => String(n).padStart(2, '0');
const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => toISO(new Date());
const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysBetween = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const fmtFecha = iso => { const d = fromISO(iso); return `${d.getDate()} ${MESES[d.getMonth()]}`; };
const fmtHace = iso => {
  const n = daysBetween(iso, today());
  if (n === 0) return 'hoy';
  if (n === 1) return 'ayer';
  if (n < 30) return `hace ${n} días`;
  if (n < 60) return 'hace un mes';
  if (n < 365) return `hace ${Math.round(n / 30)} meses`;
  return `hace ${(n / 365).toFixed(1).replace('.0', '')} años`;
};
const num = (v, d) => { const n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : (d || 0); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const listar = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

/* structuredClone recién existe desde Safari 15.4; sin este respaldo la app
   no arranca en un iPhone más viejo. */
const clonar = o => (typeof structuredClone === 'function'
  ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/* ------------------------------ estado ----------------------------- */
const KEY = 'perfumario_v1';

const DEFAULTS = {
  perfumes: [],  // {id,nombre,casa,conc,familia,salida[],corazon[],fondo[],ml,mlRestante,
                 //  precio,comprado,longevidad,estela,estaciones[],ocasiones[],momento,rating,nota,creado}
  usos: [],      // {id,fecha,perfumeId,sprays,ocasion,momento,temp,nota}
  ajustes: { mlSpray: 0.1, moneda: '$', hemisferio: 'sur', aprender: true, clima: false, ocasion: 'casual' },
  meta: { version: 1, ultimaCopia: null,
          lugar: null,   // {nombre, lat, lon} elegido una vez en Ajustes
          clima: null }  // último dato traído: {temp, humedad, codigo, lugar, ts}
};

let S = clonar(DEFAULTS);

function cargar() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }

  if (raw) {
    try {
      const guardado = JSON.parse(raw);
      S = Object.assign(clonar(DEFAULTS), guardado);
      S.ajustes = Object.assign(clonar(DEFAULTS.ajustes), guardado.ajustes || {});
      S.meta = Object.assign(clonar(DEFAULTS.meta), guardado.meta || {});
    } catch (e) { S = clonar(DEFAULTS); }
    return;
  }

  /* Primer arranque en este navegador: si el build trae una colección, entra
     sola. Se guarda en el acto, así queda la marca de que la app ya arrancó:
     si después borrás todo, no resucita. */
  const semilla = window.PERFUMARIO_COLECCION;
  if (semilla && Array.isArray(semilla.perfumes) && semilla.perfumes.length) {
    S.perfumes = clonar(semilla.perfumes);
  }
  guardar();
}

/* La misma colección, a pedido: agrega solo lo que falte, comparando por
   nombre. Sirve si ya venías usando la app antes de que existiera la semilla. */
function cargarMiColeccion() {
  const semilla = (window.PERFUMARIO_COLECCION && window.PERFUMARIO_COLECCION.perfumes) || [];
  let n = 0;
  semilla.forEach(x => {
    if (S.perfumes.some(y => normaliza(y.nombre) === normaliza(x.nombre))) return;
    S.perfumes.push(Object.assign(clonar(x), { id: uid(), creado: today() }));
    n++;
  });
  guardar(); render();
  toast(n ? `Agregados ${n} perfumes` : 'Ya los tenías a todos');
}
function guardar() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar: el navegador está sin espacio'); }
}

/* --------------------------- dominio -------------------------------- */
const ESTACIONES = {
  verano:    { nombre: 'verano',    emoji: '🌞', temp: 28 },
  otono:     { nombre: 'otoño',     emoji: '🍂', temp: 18 },
  invierno:  { nombre: 'invierno',  emoji: '❄️', temp: 11 },
  primavera: { nombre: 'primavera', emoji: '🌱', temp: 21 }
};
/* las fichas guardan "otoño" con eñe; la clave interna va sin tilde */
const claveEstacion = e => (e === 'otoño' ? 'otono' : e);
const articuloEstacion = k => (k === 'primavera' ? 'la' : 'el');
const nombreEstacion = k => (k === 'otono' ? 'otoño' : k);

function estacionDe(fecha, hemisferio) {
  const m = fromISO(fecha).getMonth(); // 0 = enero
  const sur = ['verano','verano','otono','otono','otono','invierno',
               'invierno','invierno','primavera','primavera','primavera','verano'];
  const norte = ['invierno','invierno','primavera','primavera','primavera','verano',
                 'verano','verano','otono','otono','otono','invierno'];
  return ((hemisferio || S.ajustes.hemisferio) === 'norte' ? norte : sur)[m];
}
const estacionHoy = () => estacionDe(today());

/* temperatura en la que cada familia luce mejor; se usa para penalizar
   un gourmand a 35° o un cítrico a 4° */
const TEMP_IDEAL = {
  citrica: 27, acuatica: 27, verde: 22, floral: 21, almizclada: 20, aromatica: 19,
  amaderada: 16, chipre: 15, cuero: 11, ambar: 10, gourmand: 9
};

/* Un perfume cargado a las apuradas puede no tener familia todavía. Antes de
   inventarle una, se lo muestra sin clasificar: el dato falso ensucia el
   perfil olfativo y las sugerencias. */
const SIN_FAMILIA = { id: null, nombre: 'Sin clasificar', emoji: '❓', color: '#6b6478',
  desc: 'Todavía no le pusiste familia.', estaciones: [], momento: 'ambos' };
const familia = id => D.FAMILIAS.find(f => f.id === id) || SIN_FAMILIA;
const perfume = id => S.perfumes.find(p => p.id === id) || null;
const notasDe = p => [].concat(p.salida || [], p.corazon || [], p.fondo || []);

const usosDe = id => S.usos.filter(u => u.perfumeId === id);
function ultimoUso(id) {
  const u = usosDe(id);
  return u.length ? u.map(x => x.fecha).sort().slice(-1)[0] : null;
}
const porcRestante = p => (p.ml > 0 ? clamp(Math.round((p.mlRestante / p.ml) * 100), 0, 100) : 0);
function costoPorUso(p) {
  const n = usosDe(p.id).length;
  return (p.precio > 0 && n > 0) ? p.precio / n : null;
}

const OCASIONES = {
  trabajo: 'Trabajo', casual: 'Diario', salida: 'Salida',
  cita: 'Cita', evento: 'Evento', deporte: 'Deporte'
};
const MOMENTOS = { dia: 'Día', noche: 'Noche', ambos: 'Día y noche' };
/* Cómo se nombra cada ocasión dentro de una frase: "en trabajo" no lo dice
   nadie. */
const EN_OCASION = {
  trabajo: 'en la oficina', casual: 'para el día a día', salida: 'para una salida',
  cita: 'para una cita', evento: 'para un evento', deporte: 'para entrenar'
};

/* ------------------------------ clima ------------------------------
   Open-Meteo: gratis, sin clave y con CORS abierto, así que la app lo
   consulta directo desde el navegador. Se le mandan solo las coordenadas
   de la ciudad elegida. Si no hay red, o si la página corre con una
   política que bloquea pedidos externos, se sigue con la temperatura a
   mano: el clima es una comodidad, no un requisito.                    */
const CLIMA_API = 'https://api.open-meteo.com/v1/forecast';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const CLIMA_VIGENCIA = 15; // minutos que vale un dato antes de volver a pedirlo

/* códigos WMO, que es lo que devuelve la API */
const WMO = {
  0: ['Despejado', '☀️'], 1: ['Casi despejado', '🌤'], 2: ['Parcialmente nublado', '⛅'], 3: ['Nublado', '☁️'],
  45: ['Niebla', '🌫'], 48: ['Niebla con escarcha', '🌫'],
  51: ['Llovizna leve', '🌦'], 53: ['Llovizna', '🌦'], 55: ['Llovizna fuerte', '🌦'],
  56: ['Llovizna helada', '🌧'], 57: ['Llovizna helada', '🌧'],
  61: ['Lluvia leve', '🌧'], 63: ['Lluvia', '🌧'], 65: ['Lluvia fuerte', '🌧'],
  66: ['Lluvia helada', '🌧'], 67: ['Lluvia helada', '🌧'],
  71: ['Nieve leve', '🌨'], 73: ['Nieve', '🌨'], 75: ['Nieve fuerte', '🌨'], 77: ['Granos de nieve', '🌨'],
  80: ['Chaparrones', '🌦'], 81: ['Chaparrones', '🌦'], 82: ['Chaparrones fuertes', '🌦'],
  85: ['Chaparrones de nieve', '🌨'], 86: ['Chaparrones de nieve', '🌨'],
  95: ['Tormenta', '⛈'], 96: ['Tormenta con granizo', '⛈'], 99: ['Tormenta con granizo', '⛈']
};
const describirClima = c => WMO[c] || ['Sin datos del cielo', '🌡'];
/* códigos de llovizna, lluvia, chaparrón y tormenta */
const LLUVIA = [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99];
const estaLloviendo = c => LLUVIA.indexOf(c) >= 0;

/* El clima solo pesa en el puntaje si es reciente: un dato de ayer diciendo
   que llueve es peor que no tener dato. */
function climaParaPuntaje() {
  const c = S.meta.clima;
  if (!S.ajustes.clima || !c) return null;
  return minutosDesde(c.ts) <= 180 ? c : null;
}

const minutosDesde = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

/* Un pedido que no corta nunca deja la app colgada esperando. */
function pedirJSON(url, ms) {
  const ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
  const corte = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms || 8000);
  return fetch(url, ctrl ? { signal: ctrl.signal } : {})
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => { clearTimeout(corte); return j; })
    .catch(e => { clearTimeout(corte); throw e; });
}

const climaVigente = () => {
  const c = S.meta.clima;
  return (c && minutosDesde(c.ts) < CLIMA_VIGENCIA) ? c : null;
};

let climaPidiendo = false;

function traerClima(forzar) {
  const lugar = S.meta.lugar;
  if (!S.ajustes.clima || !lugar || climaPidiendo) return Promise.resolve();
  if (!forzar && climaVigente()) return Promise.resolve();
  if (navigator.onLine === false) { climaEstado('Sin conexión: queda el último dato.'); return Promise.resolve(); }

  climaPidiendo = true;
  climaEstado('Consultando el clima…');
  /* Se pide el arco del día además del instante: un perfume se aplica una vez
     y acompaña ocho horas, así que la pregunta real no es qué temperatura hace
     ahora sino entre qué temperaturas vas a estar. */
  const url = `${CLIMA_API}?latitude=${encodeURIComponent(lugar.lat)}&longitude=${encodeURIComponent(lugar.lon)}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m' +
    '&daily=apparent_temperature_max,apparent_temperature_min&timezone=auto&forecast_days=1';

  return pedirJSON(url).then(d => {
    const c = d && d.current;
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('respuesta sin temperatura');
    S.meta.clima = {
      temp: c.temperature_2m,
      /* La sensación térmica es lo que la piel recibe de verdad: ya tiene
         adentro el viento y la humedad. Es la que se usa para puntuar. */
      sensacion: (typeof c.apparent_temperature === 'number') ? c.apparent_temperature : c.temperature_2m,
      humedad: c.relative_humidity_2m,
      codigo: c.weather_code, viento: c.wind_speed_10m,
      lugar: lugar.nombre, ts: new Date().toISOString(),
      maxDia: (d.daily && d.daily.apparent_temperature_max) ? d.daily.apparent_temperature_max[0] : null,
      minDia: (d.daily && d.daily.apparent_temperature_min) ? d.daily.apparent_temperature_min[0] : null
    };
    guardar();
    aplicarTempDelClima();
    if (vistaActual === 'hoy') renderHoy();
    else if (vistaActual === 'ajustes') renderAjustes();
  }).catch(() => {
    climaEstado(enVistaPrevia()
      ? 'Esta vista previa bloquea los pedidos al clima. Abrila publicada, o movés la temperatura a mano.'
      : 'No pude traer el clima (¿sin internet?). Movés la temperatura a mano.');
  }).then(() => { climaPidiendo = false; });
}

/* No pisa la temperatura si la moviste vos: tu dedo gana sobre la API. */
function aplicarTempDelClima() {
  const c = S.meta.clima;
  if (!S.ajustes.clima || !c || ctx.manual) return;
  ctx.temp = (typeof c.sensacion === 'number') ? c.sensacion : c.temp;
}

function climaEstado(txt) {
  const l = $('#climaLinea');
  if (l) l.textContent = txt;
}

/* Dentro de un iframe (la vista previa publicada) el navegador bloquea tanto
   la ubicación como los pedidos a otros dominios. Saberlo permite decir qué
   pasa en vez de un "no pude" genérico. */
const enVistaPrevia = () => { try { return window.self !== window.top; } catch (e) { return true; } };

/* Primero la lista que viaja con la app: instantánea y sin depender de nada.
   La API solo entra si acá no hay nada. */
function buscarCiudadLocal(q) {
  const n = normaliza(q);
  if (!n) return [];
  return (D.CIUDADES || [])
    .filter(c => normaliza(c.n).includes(n) || normaliza(c.p).includes(n))
    .slice(0, 6)
    .map(c => ({ name: c.n, admin1: c.p, country: '', latitude: c.lat, longitude: c.lon, local: true }));
}

function buscarCiudad(q) {
  const locales = buscarCiudadLocal(q);
  if (locales.length) return Promise.resolve(locales);
  return pedirJSON(`${GEO_API}?name=${encodeURIComponent(q)}&count=5&language=es&format=json`)
    .then(d => (d && d.results) || []);
}

function fijarLugar(nombre, lat, lon) {
  S.meta.lugar = { nombre, lat, lon };
  S.ajustes.clima = true;
  S.meta.clima = null;
  ctx.manual = false;
  guardar();
  renderAjustes();
  toast(`Clima de ${nombre}`);
  traerClima(true);
}

/* Qué ciudad de la lista incluida cae más cerca de unas coordenadas.
   Fórmula de Haversine: distancia sobre la esfera, que para estas escalas
   alcanza y sobra. Sirve para ponerle nombre a la ubicación del dispositivo
   sin mandársela a ningún servicio de geocodificación inversa. */
function ciudadMasCercana(lat, lon) {
  const R = 6371; // km
  const rad = x => x * Math.PI / 180;
  let mejor = null;
  (D.CIUDADES || []).forEach(c => {
    const dLat = rad(c.lat - lat), dLon = rad(c.lon - lon);
    const a = Math.pow(Math.sin(dLat / 2), 2) +
      Math.cos(rad(lat)) * Math.cos(rad(c.lat)) * Math.pow(Math.sin(dLon / 2), 2);
    const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    if (!mejor || km < mejor.km) mejor = { c: c, km: Math.round(km) };
  });
  return mejor;
}

/* "Mi ubicación" no dice nada: el clima se lee mejor con un nombre. Si la
   ciudad más cercana está lejos, se dice que es una referencia, y si no hay
   ninguna cerca se muestran las coordenadas antes que inventar un lugar. */
function nombrarUbicacion(lat, lon) {
  const cerca = ciudadMasCercana(lat, lon);
  if (cerca && cerca.km <= 20) return cerca.c.n;
  if (cerca && cerca.km <= 90) return `cerca de ${cerca.c.n}`;
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function usarUbicacion() {
  if (!navigator.geolocation) { avisoUbicacion('Este navegador no da la ubicación.'); return; }
  avisoUbicacion('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      avisoUbicacion('');
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      fijarLugar(nombrarUbicacion(lat, lon), lat.toFixed(3), lon.toFixed(3));
    },
    err => avisoUbicacion(textoErrorUbicacion(err)),
    { timeout: 10000, maximumAge: 600000 }
  );
}

/* El código 1 (permiso denegado) tapa dos situaciones muy distintas: que la
   persona haya dicho que no, o que el navegador ni haya preguntado porque el
   sistema le tiene cortada la ubicación. Decir solo "no diste permiso" manda a
   buscar un cartel que nunca apareció, así que se explican las dos, y en iOS
   se nombran las pantallas reales. */
function textoErrorUbicacion(err) {
  const codigo = err && err.code;
  if (codigo === 1 && enVistaPrevia())
    return 'Esta vista previa no permite la ubicación. Elegí tu ciudad de la lista de abajo.';
  if (codigo === 1) {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return iOS
      ? 'Safari no entregó la ubicación. Si no viste ningún cartel, está cortada desde el sistema: Ajustes → Privacidad y seguridad → Localización → Safari, en "Al usar la app". Si dijiste que no, se reabre en la barra de direcciones: tocá "aA" → Ajustes del sitio web → Ubicación → Preguntar. Mientras tanto, elegí tu ciudad acá abajo.'
      : 'El navegador no entregó la ubicación. Habilitala para este sitio desde el candado de la barra de direcciones, o elegí tu ciudad acá abajo.';
  }
  if (codigo === 2) return 'El dispositivo no pudo ubicarte ahora (pasa bajo techo o con poca señal). Probá de nuevo o elegí tu ciudad acá abajo.';
  if (codigo === 3) return 'Tardó demasiado en ubicarte. Probá de nuevo o elegí tu ciudad acá abajo.';
  return 'No pude ubicarte. Elegí tu ciudad acá abajo.';
}

/* El aviso vive en la pantalla, no en un globito: es un texto que hay que
   poder leer dos veces y seguir paso a paso. */
function avisoUbicacion(txt) {
  const e = $('#avisoUbicacion');
  if (!e) return;
  e.textContent = txt;
  e.hidden = !txt;
}

/* --------------------------- navegación ---------------------------- */
let vistaActual = 'hoy';

function ir(v) {
  vistaActual = v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
  window.scrollTo(0, 0);
  render();
}

function abrirModal(titulo, html) {
  $('#modalTitulo').textContent = titulo;
  $('#modalBody').innerHTML = html;
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}
function cerrarModal() {
  $('#modal').hidden = true;
  $('#modalBody').innerHTML = '';
  document.body.style.overflow = '';
}

let toastT = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ============================== HOY ================================= */
/* contexto: lo que la persona elige antes de pedir una sugerencia */
const ctx = { temp: null, momento: null, ocasion: 'casual', manual: false };

function momentoPorHora() {
  const h = new Date().getHours();
  return (h >= 7 && h < 19) ? 'dia' : 'noche';
}
function ctxInicial() {
  if (ctx.temp === null) ctx.temp = ESTACIONES[estacionHoy()].temp;
  if (ctx.momento === null) ctx.momento = momentoPorHora();
  if (!ctx.elegida && S.ajustes.ocasion) { ctx.ocasion = S.ajustes.ocasion; ctx.elegida = true; }
  aplicarTempDelClima();
}

/* Lo que la app aprende de tus elecciones.

   No hay nada mágico: cuenta qué usaste en cada ocasión durante los últimos
   seis meses y lo compara contra lo que sería esperable si eligieras al azar
   dentro de tu propia colección. Si el 70 % de tus usos de trabajo son
   amaderados pero los amaderados son solo el 30 % de lo que tenés, eso es una
   preferencia y no una casualidad. Esa diferencia (observado − esperado) es
   todo el modelo, y es la que se puede explicar en una línea.                */
const VENTANA_APRENDIZAJE = 180; // días
const MIN_USOS_MODELO = 6;       // menos que esto no alcanza para concluir nada
const MIN_USOS_OCASION = 3;

function modeloAprendido() {
  const vacio = { activo: false, ocFam: {}, ocPerf: {}, totOc: {}, share: {}, notasTop: [], tempFam: {}, usos: 0 };
  if (!S.ajustes.aprender || !S.perfumes.length) return vacio;

  const corte = addDays(today(), -VENTANA_APRENDIZAJE);
  const usos = S.usos.filter(u => u.fecha >= corte && perfume(u.perfumeId));
  if (usos.length < MIN_USOS_MODELO) return Object.assign(vacio, { usos: usos.length });

  // participación de cada familia en la colección = lo esperable al azar
  const share = {};
  S.perfumes.forEach(x => { const k = x.familia || 'sin'; share[k] = (share[k] || 0) + 1; });
  Object.keys(share).forEach(k => { share[k] = share[k] / S.perfumes.length; });

  const ocFam = {}, ocPerf = {}, totOc = {}, notas = {}, temps = {};
  usos.forEach(u => {
    const x = perfume(u.perfumeId), oc = u.ocasion || 'casual';
    totOc[oc] = (totOc[oc] || 0) + 1;
    ocFam[oc + '|' + (x.familia || 'sin')] = (ocFam[oc + '|' + (x.familia || 'sin')] || 0) + 1;
    ocPerf[oc + '|' + x.id] = (ocPerf[oc + '|' + x.id] || 0) + 1;
    notasDe(x).forEach(n => { const k = n.toLowerCase(); notas[k] = (notas[k] || 0) + 1; });
    if (typeof u.temp === 'number') {
      const k = x.familia || 'sin';
      (temps[k] = temps[k] || []).push(u.temp);
    }
  });

  /* A qué temperatura usás cada familia. Con menos de tres usos el promedio
     es ruido, así que esa familia no opina. */
  const tempFam = {};
  Object.keys(temps).forEach(k => {
    const a = temps[k];
    if (a.length >= MIN_USOS_OCASION) tempFam[k] = { media: a.reduce((s, v) => s + v, 0) / a.length, n: a.length };
  });

  const notasTop = Object.keys(notas).map(n => ({ n, c: notas[n] }))
    .filter(x => x.c >= Math.max(2, Math.round(usos.length * 0.25)))
    .sort((a, b) => b.c - a.c).slice(0, 10);

  return { activo: true, ocFam, ocPerf, totOc, share, notasTop, tempFam, usos: usos.length };
}

/* Puntaje de un perfume para el contexto actual.
   Devuelve {score, razones:[{txt, bien}]} para poder explicar la sugerencia:
   una recomendación que no se explica no se usa. */
function contextoActual() {
  const cl = climaParaPuntaje();
  const c = {
    temp: ctx.temp, momento: ctx.momento, ocasion: ctx.ocasion,
    estacion: estacionHoy(),
    lluvia: !!(cl && estaLloviendo(cl.codigo)),
    humedad: cl ? cl.humedad : null,
    viento: cl ? cl.viento : null
  };
  /* De día, lo que viene por delante es el arco hasta la máxima; de noche, la
     temperatura ya no sube. Si tocaste el termómetro a mano, manda tu número. */
  if (cl && !ctx.manual && ctx.momento === 'dia' &&
      typeof cl.maxDia === 'number' && cl.maxDia > ctx.temp + 2) {
    c.arco = [ctx.temp, cl.maxDia];
  }
  return c;
}

function puntuar(p, m, c) {
  m = m || { activo: false };
  c = c || contextoActual();
  const est = c.estacion;
  const razones = [];
  let score = 50;

  /* Estación, pero pesada por la temperatura real.

     La estación es una aproximación al clima; la temperatura ES el clima. Si
     un día de primavera hay 5°, el almanaque está mintiendo y no puede seguir
     valiendo 30 puntos de diferencia (+18 al que dice "primavera", −12 al que
     dice "invierno") mientras el termómetro apenas mueve 10. Cuanto más se
     aleja la temperatura de lo típico de la estación, menos pesa la estación,
     hasta desaparecer. */
  const estaciones = (p.estaciones || []).map(claveEstacion);
  const tipica = ESTACIONES[est].temp;
  const pesoEstacion = clamp(1 - Math.abs(c.temp - tipica) / 15, 0, 1);
  if (estaciones.length && pesoEstacion > 0.15) {
    if (estaciones.includes(est)) {
      score += 18 * pesoEstacion;
      razones.push({ txt: `Va con ${articuloEstacion(est)} ${nombreEstacion(est)}`, bien: true });
    } else {
      score -= 12 * pesoEstacion;
      razones.push({ txt: `Lo marcaste para ${estaciones.map(nombreEstacion).join(' y ')}`, bien: false });
    }
  }

  /* Temperatura. Con arco, se mide contra los dos extremos del día: así gana
     el que cubre todo el trayecto y no el que brilla en un solo momento.
     El castigo llega hasta 30 (antes 20): con tope bajo, "algo fuera de rango"
     y "completamente fuera" terminaban pareciéndose. */
  const ideal = TEMP_IDEAL[p.familia] != null ? TEMP_IDEAL[p.familia] : 18;
  const puntos = (c.arco && c.arco.length) ? c.arco : [c.temp];
  const difs = puntos.map(t => Math.abs(t - ideal));
  const dif = difs.reduce((a, b) => a + b, 0) / difs.length;
  score -= Math.min(30, dif * 1.2);

  const rango = c.arco
    ? `${Math.round(Math.min.apply(null, c.arco))}° a ${Math.round(Math.max.apply(null, c.arco))}°`
    : `${Math.round(c.temp)}°`;
  if (dif <= 4) razones.push({
    txt: c.arco ? `${familia(p.familia).nombre} cubre el arco del día, de ${rango}`
                : `${familia(p.familia).nombre} rinde bien con ${rango}`, bien: true });
  else if (dif >= 12) razones.push({
    txt: (puntos[0] > ideal ? `Con ${rango} se puede volver pesado` : `Con ${rango} se va a sentir poco`),
    bien: false });

  // momento del día (un viaje tiene mañanas y noches: ahí no se evalúa)
  const mom = p.momento || 'ambos';
  if (!c.sinMomento) {
  if (mom === c.momento) { score += 12; razones.push({ txt: `Lo tenés anotado para ${MOMENTOS[mom].toLowerCase()}`, bien: true }); }
  /* "Día y noche" TAMBIÉN coincide con el momento: antes sumaba 4 contra 12 y
     un perfume versátil perdía ocho puntos contra uno especializado por ser
     más flexible, que es al revés de lo que uno quiere. Se queda algo abajo
     del especialista, no ocho puntos abajo. */
  else if (mom === 'ambos') { score += 8; razones.push({ txt: 'Sirve de día y de noche', bien: true }); }
  else { score -= 10; razones.push({ txt: `Lo anotaste para ${MOMENTOS[mom].toLowerCase()}`, bien: false }); }
  }

  // ocasión
  const oc = p.ocasiones || [];
  if (oc.length) {
    if (oc.includes(c.ocasion)) { score += 14; razones.push({ txt: `Sirve para ${OCASIONES[c.ocasion].toLowerCase()}`, bien: true }); }
    else score -= 8;
  }
  // estela según el lugar: en la oficina o haciendo deporte, mejor discreto
  const estela = p.estela || 3;
  if (c.ocasion === 'trabajo' || c.ocasion === 'deporte') {
    if (estela >= 5) { score -= 12; razones.push({ txt: 'Deja mucha estela para ese ambiente', bien: false }); }
    else if (estela <= 2) score += 5;
  }
  if (c.ocasion === 'evento' || c.ocasion === 'cita') {
    if (estela >= 4) { score += 8; razones.push({ txt: 'Tiene la presencia que pide la ocasión', bien: true }); }
  }

  // rotación: premia lo olvidado, castiga repetir (en un viaje da igual)
  const ult = c.sinRotacion ? null : ultimoUso(p.id);
  if (c.sinRotacion) { /* nada */ }
  else if (!ult) { score += 8; razones.push({ txt: 'Todavía no lo estrenaste', bien: true }); }
  else {
    const d = daysBetween(ult, today());
    if (d === 0) { score -= 30; razones.push({ txt: 'Es el que usaste hoy', bien: false }); }
    else if (d <= 2) { score -= 12; razones.push({ txt: `Lo usaste ${fmtHace(ult)}`, bien: false }); }
    else if (d >= 21) { score += 10; razones.push({ txt: `No lo usás desde ${fmtHace(ult)}`, bien: true }); }
  }

  // gusto personal y frasco
  // 0 significa "todavía no lo puntuaste", no "es malo": no castiga
  if (p.rating >= 1) score += (p.rating - 3) * 4;
  const pct = porcRestante(p);
  if (p.ml > 0 && pct <= 10) { score -= 8; razones.push({ txt: `Queda ${pct} %: guardalo para algo que valga`, bien: false }); }

  // lluvia: los frescos livianos no sobreviven al agua
  if (c.lluvia) {
    const dur = p.longevidad || 0;
    if (dur >= 8) { score += 6; razones.push({ txt: 'Llueve y este aguanta', bien: true, clima: true }); }
    else if (dur && dur <= 5) { score -= 6; razones.push({ txt: 'Con lluvia, uno tan liviano se va enseguida', bien: false, clima: true }); }
  }

  /* Humedad y viento cambian cómo se comporta un perfume en la piel, no solo
     cómo se siente el día: con humedad alta proyecta más de lo que uno quiere,
     con aire seco se evapora antes, y con viento la estela liviana no llega a
     ningún lado. Venían en la respuesta del clima y no se usaban. */
  const estelaP = p.estela || 3;
  const duraP = p.longevidad || 0;

  if (typeof c.humedad === 'number') {
    if (c.humedad >= 75) {
      if (estelaP >= 4) { score -= 6; razones.push({ txt: `Con ${Math.round(c.humedad)} % de humedad va a proyectar de más`, bien: false, clima: true }); }
      else if (estelaP <= 2) { score += 4; razones.push({ txt: 'La humedad lo va a levantar justo lo necesario', bien: true, clima: true }); }
    } else if (c.humedad <= 30) {
      if (duraP >= 8) { score += 5; razones.push({ txt: 'Con el aire seco, este igual aguanta', bien: true, clima: true }); }
      else if (duraP && duraP <= 5) { score -= 4; razones.push({ txt: 'Con el aire seco se evapora enseguida', bien: false, clima: true }); }
    }
  }

  if (typeof c.viento === 'number' && c.viento >= 25) {
    if (estelaP >= 4) { score += 5; razones.push({ txt: `Con viento de ${Math.round(c.viento)} km/h, este se sostiene`, bien: true, clima: true }); }
    else if (estelaP <= 2) { score -= 5; razones.push({ txt: `Con viento de ${Math.round(c.viento)} km/h no se va a sentir`, bien: false, clima: true }); }
  }

  // lo aprendido de tus elecciones anteriores
  if (m.activo) {
    const oc = c.ocasion, tot = m.totOc[oc] || 0;
    if (tot >= MIN_USOS_OCASION) {
      const fam = p.familia || 'sin';
      const obs = (m.ocFam[oc + '|' + fam] || 0) / tot;
      const esp = m.share[fam] || 0;
      const b = clamp(Math.round((obs - esp) * 40), -10, 16);
      score += b;
      if (b >= 5) razones.push({
        txt: `Para ${OCASIONES[oc].toLowerCase()} solés elegir ${familia(fam).nombre.toLowerCase()}`,
        bien: true, aprendido: true });
      else if (b <= -5) razones.push({
        txt: `Casi nunca elegís ${familia(fam).nombre.toLowerCase()} para ${OCASIONES[oc].toLowerCase()}`,
        bien: false, aprendido: true });

      const veces = m.ocPerf[oc + '|' + p.id] || 0;
      if (veces >= 2) {
        score += 8;
        razones.push({ txt: `Es tu elección habitual para ${OCASIONES[oc].toLowerCase()}: ${veces} veces`,
                       bien: true, aprendido: true });
      }
    }
    // la temperatura a la que usás esa familia
    const tf = (m.tempFam || {})[p.familia || 'sin'];
    if (tf) {
      const dif = c.temp - tf.media;
      if (Math.abs(dif) >= 8) {
        score -= Math.min(12, 3 + (Math.abs(dif) - 8) * 1.2);
        razones.push({ txt: `Lo usás con ${Math.round(tf.media)}° y hoy hay ${Math.round(c.temp)}°`,
                       bien: false, aprendido: true });
      } else if (Math.abs(dif) <= 3) {
        score += 5;
        razones.push({ txt: 'Es la temperatura a la que solés usarlo', bien: true, aprendido: true });
      }
    }

    // notas que se repiten en lo que realmente usás
    if (m.notasTop.length) {
      const mias = notasDe(p).map(n => n.toLowerCase());
      const coinciden = m.notasTop.filter(x => mias.includes(x.n)).map(x => x.n);
      if (coinciden.length >= 2) {
        score += 6;
        razones.push({ txt: `Tiene ${coinciden.slice(0, 2).join(' y ')}, de lo que más te ponés`,
                       bien: true, aprendido: true });
      }
    }
  }

  return { score: Math.round(clamp(score, 0, 100)), razones };
}

function sugerir(n, m) {
  m = m || modeloAprendido();
  const cuantos = n || 3;
  const disponibles = S.perfumes.filter(p => !(p.ml > 0 && p.mlRestante <= 0));

  /* Lo que ya te pusiste hoy queda afuera, no castigado: con el aprendizaje
     encendido, los bonus podían tapar el castigo y volvía a recomendarte lo
     que ya tenías puesto. Solo vuelve si sin él no llegan a tres. */
  const usadosHoy = {};
  S.usos.filter(u => u.fecha === today()).forEach(u => { usadosHoy[u.perfumeId] = true; });
  const frescos = disponibles.filter(p => !usadosHoy[p.id]);
  const base = frescos.length >= cuantos ? frescos : disponibles;

  /* Con puntajes iguales no se sortea: primero lo que vos puntuaste mejor, y
     después aquello de lo que la app sabe más (notas cargadas). Recomendar un
     perfume del que no conoce ni las notas es recomendar a ciegas. */
  const info = x => (notasDe(x).length ? 1 : 0);
  return base
    .map(p => Object.assign({ p }, puntuar(p, m)))
    .sort((a, b) => b.score - a.score
      || (b.p.rating || 0) - (a.p.rating || 0)
      || info(b.p) - info(a.p)
      || a.p.nombre.localeCompare(b.p.nombre))
    .slice(0, cuantos);
}

function renderHoy() {
  ctxInicial();
  const est = estacionHoy();
  $('#ctxTemp').value = ctx.temp;
  $('#ctxTempOut').textContent = Math.round(ctx.temp) + '°';
  $$('#ctxMomento .chip').forEach(c => c.classList.toggle('on', c.dataset.val === ctx.momento));
  $$('#ctxOcasion .chip').forEach(c => c.classList.toggle('on', c.dataset.val === ctx.ocasion));

  /* Todo lo que la app puede deducir sola va en una línea de texto: no son
     decisiones que haya que tomar antes de que te conteste. */
  const c = climaParaPuntaje();
  const [cielo, emo] = c ? describirClima(c.codigo) : ['', ''];
  const desvío = Math.abs(ctx.temp - ESTACIONES[est].temp);
  $('#contextoLinea').innerHTML =
    `${c ? emo : ESTACIONES[est].emoji} <b>${Math.round(ctx.temp)}°</b>` +
    (c ? ` ${esc(cielo.toLowerCase())} en ${esc(c.lugar)}` : '') +
    ` · ${MOMENTOS[ctx.momento].toLowerCase()} de ${nombreEstacion(est)}` +
    (desvío >= 10 ? ' · mando por la temperatura, no por la estación' : '') +
    ` <button class="link" id="btnAjustarContexto">ajustar</button>`;

  const modelo = modeloAprendido();
  const lista = S.perfumes.length ? sugerir(3, modelo) : [];

  if (!lista.length) {
    $('#respuesta').innerHTML = `<div class="vacio">Todavía no cargaste ningún perfume.<br>
      Andá a <b>Colección → Agregar</b>, o cargá los de ejemplo desde Ajustes.</div>`;
    $('#sugerencias').innerHTML = '';
    $('#otras').hidden = true;
  } else {
    $('#respuesta').innerHTML = fichaPrincipal(lista[0], lista[1], contextoActual());
    $('#sugerencias').innerHTML = lista.slice(1).map(x => fichaSugerencia(x)).join('');
    $('#otras').hidden = lista.length < 2;
    const otras = $('#otras summary');
    if (otras) otras.textContent = `Ver otras ${lista.length - 1} opciones`;
  }

  avisoEmpate(lista);

  const hoy = S.usos.filter(u => u.fecha === today());
  $('#cardHoyUsos').hidden = !hoy.length;
  $('#hoyUsos').innerHTML = hoy.map(u => {
    const p = perfume(u.perfumeId);
    return `<div class="item" data-editar-uso="${u.id}" role="button" tabindex="0"><div class="it-main">
        <div class="it-name">${esc(p ? p.nombre : 'Perfume borrado')}</div>
        <div class="it-sub">${u.sprays} aplicaciones · ${OCASIONES[u.ocasion] || '—'} · tocá para corregir</div>
      </div>
      <div class="it-act"><button data-borrar-uso="${u.id}" aria-label="Borrar uso">🗑</button></div></div>`;
  }).join('');

  renderClima();
  traerClima();
  avisoCopia();
}

/* Cuántas aplicaciones y dónde. El frío frena la proyección y pide una más;
   la humedad alta la multiplica y pide una menos; un espacio cerrado —oficina,
   gimnasio— también. */
function dosis(p, c) {
  const estela = p.estela || 3;
  let n = 3;
  if (estela >= 4) n -= 1;
  if (estela <= 2) n += 1;
  if (typeof c.temp === 'number' && c.temp <= 10) n += 1;
  if (typeof c.humedad === 'number' && c.humedad >= 75) n -= 1;
  if (c.ocasion === 'trabajo' || c.ocasion === 'deporte') n -= 1;
  n = clamp(n, 2, 5);

  const frio = typeof c.temp === 'number' && c.temp <= 10;
  const donde = (c.ocasion === 'trabajo' || c.ocasion === 'deporte')
    ? 'en el cuello, sobre la piel'
    : (frio ? 'en cuello y pecho, sobre la piel y no sobre el abrigo'
            : 'en cuello y muñecas');
  return `${n} aplicacion${n === 1 ? '' : 'es'} ${donde}.`;
}

/* La respuesta contada en dos o tres frases, como se la explicarías a alguien,
   en vez de una lista de reglas que se cumplieron. Sale de los mismos datos:
   no hay nada acá que el puntaje no haya usado. */
function redactar(s, c) {
  const p = s.p, f = familia(p.familia);
  const fam = f.nombre.toLowerCase();
  const arco = c.arco
    ? `${Math.round(Math.min.apply(null, c.arco))}° a ${Math.round(Math.max.apply(null, c.arco))}° a lo largo del día`
    : null;
  const frases = [];

  const ideal = TEMP_IDEAL[p.familia] != null ? TEMP_IDEAL[p.familia] : 18;
  const puntos = c.arco || [c.temp];
  const dif = puntos.reduce((a, t) => a + Math.abs(t - ideal), 0) / puntos.length;
  const clima = arco ? `De ${arco}` : `Con ${Math.round(c.temp)}°`;
  if (dif <= 5) {
    frases.push(arco
      ? `${clima}: su perfil ${fam} cubre todo el arco sin quedarse corto ni pesar.`
      : `${clima}, un ${fam} está justo en su punto.`);
  } else if (dif <= 11) {
    frases.push(`${clima}: no es su temperatura ideal, pero aguanta.`);
  } else {
    frases.push(`${clima}: le queda lejos su punto justo, y aun así es lo mejor que tenés hoy.`);
  }

  const estela = p.estela || 3;
  const donde = EN_OCASION[c.ocasion] || `para ${OCASIONES[c.ocasion].toLowerCase()}`;
  if (c.ocasion === 'trabajo' || c.ocasion === 'deporte') {
    frases.push(estela >= 4
      ? `Ojo ${donde}: proyecta fuerte para un espacio cerrado, aplicá poco.`
      : `${donde.charAt(0).toUpperCase() + donde.slice(1)} no invade el espacio cerrado.`);
  } else if (c.ocasion === 'evento' || c.ocasion === 'cita') {
    frases.push(estela >= 4
      ? `${donde.charAt(0).toUpperCase() + donde.slice(1)} tiene la presencia que la ocasión pide.`
      : `${donde.charAt(0).toUpperCase() + donde.slice(1)} es discreto: se siente de cerca, no a distancia.`);
  } else if ((p.ocasiones || []).includes(c.ocasion)) {
    frases.push(`Lo tenés anotado justo ${donde}.`);
  }

  const aprendida = s.razones.find(r => r.aprendido && r.bien);
  if (aprendida) frases.push(esc(aprendida.txt) + '.');

  const razonClima = s.razones.find(r => r.clima);
  if (razonClima && frases.length < 3) frases.push(esc(razonClima.txt) + '.');

  return frases.slice(0, 3).join(' ');
}

function fichaPrincipal(s, alternativa, c) {
  const p = s.p, f = familia(p.familia);
  const pct = porcRestante(p);
  return `<article class="hero">
    <div class="hero-eyebrow">${f.emoji} ${esc(f.nombre)}${p.conc ? ' · ' + esc(p.conc) : ''}</div>
    <h2 class="hero-name">${esc(p.nombre)}</h2>
    <div class="hero-house">${esc(p.casa)}</div>
    <p class="hero-texto">${redactar(s, c)}</p>
    ${alternativa ? `<p class="hero-alt"><b>Alternativa:</b> ${esc(alternativa.p.nombre)},
      ${esc(contraste(alternativa, s))}.</p>` : ''}
    <p class="hero-alt"><b>Aplicación:</b> ${esc(dosis(p, c))}</p>
    <div class="hero-pie">
      <button class="btn btn-accent" data-usar="${p.id}">Me lo pongo</button>
      <div class="hero-dato">
        <div><b style="color:var(--accent)">${s.score}</b> de puntaje</div>
        ${p.ml > 0 ? `<div>${pct} % del frasco</div>` : ''}
      </div>
    </div>
    <div class="hero-pie" style="margin-top:8px">
      <button class="btn" data-ficha="${p.id}">Ver por qué, y la ficha</button>
    </div>
  </article>`;
}

function renderClima() {
  const l = $('#climaLinea');
  if (!S.ajustes.clima || !S.meta.lugar) {
    l.innerHTML = `<button class="link" id="btnActivarClima">📍 Traer la temperatura sola</button>`;
    return;
  }
  const c = S.meta.clima;
  if (!c) { l.textContent = 'Consultando el clima…'; return; }
  const [txt, emo] = describirClima(c.codigo);
  const mins = minutosDesde(c.ts);
  const sens = (typeof c.sensacion === 'number') ? c.sensacion : c.temp;
  const difSens = Math.abs(sens - c.temp) >= 2;
  l.innerHTML =
    `${emo} <b>${Math.round(sens)}°</b>${difSens ? ' de sensación' : ''} · ${esc(txt)} en ${esc(c.lugar)} · ` +
    `${mins < 1 ? 'recién' : 'hace ' + mins + ' min'} ` +
    `<button class="link" id="btnRefrescarClima">Actualizar</button>` +
    `<div class="hint">${difSens ? `Real ${Math.round(c.temp)}° · ` : ''}humedad ${c.humedad} %` +
      (typeof c.viento === 'number' ? ` · viento ${Math.round(c.viento)} km/h` : '') +
      `. Todo esto entra en el puntaje.</div>` +
    (ctx.manual ? `<div class="hint">Estás usando ${Math.round(ctx.temp)}° a mano: la humedad y el viento igual cuentan.</div>` : '') +
    (c.humedad >= 75 ? `<div class="hint">Humedad alta: los de mucha estela proyectan más de lo que querés.</div>` : '') +
    (c.humedad <= 30 ? `<div class="hint">Aire seco: los livianos se evaporan antes.</div>` : '') +
    (estaLloviendo(c.codigo) ? `<div class="hint">Llueve: los frescos livianos se van enseguida.</div>` : '') +
    (c.viento >= 25 ? `<div class="hint">Viento fuerte: la estela se dispersa.</div>` : '');
}

/* Tres tarjetas con el mismo puntaje y las mismas razones no son una
   recomendación: son la app diciendo "no sé". Conviene admitirlo y decir qué
   dato falta para poder diferenciarlos. */
/* Qué gana uno si elige la alternativa: la diferencia concreta contra la
   principal, no un "también está bueno". */
function contraste(alt, principal) {
  const a = alt.p, b = principal.p;
  const ea = a.estela || 3, eb = b.estela || 3;
  if (a.familia && b.familia && a.familia !== b.familia)
    return `si preferís un ${familia(a.familia).nombre.toLowerCase()} en vez de un ${familia(b.familia).nombre.toLowerCase()}`;
  if (ea < eb) return 'si lo querés más discreto';
  if (ea > eb) return 'si querés más presencia';
  if ((a.longevidad || 0) - (b.longevidad || 0) >= 2) return 'si necesitás que dure más';

  /* Misma familia y misma presencia: lo que los separa son las notas. */
  const otras = new Set(notasDe(b).map(n => n.toLowerCase()));
  const propias = notasDe(a).filter(n => !otras.has(n.toLowerCase()));
  if (propias.length) return `si preferís el lado de ${propias.slice(0, 2).join(' y ').toLowerCase()}`;
  if (!notasDe(a).length) return 'otro del mismo palo, aunque todavía sin notas cargadas';
  return `otro ${familia(a.familia).nombre.toLowerCase()} para variar`;
}

function avisoEmpate(sugerencias) {
  const av = $('#avisoEmpate');
  if (!av) return;
  if (sugerencias.length < 2) { av.hidden = true; return; }

  const firma = s => s.razones.map(r => r.txt).sort().join('|');
  const empatados = sugerencias.filter(s =>
    Math.abs(s.score - sugerencias[0].score) <= 2 && firma(s) === firma(sugerencias[0]));

  if (empatados.length < 2) { av.hidden = true; return; }

  const sinNotas = empatados.filter(s => !notasDe(s.p).length).length;
  const sinPuntaje = empatados.filter(s => !s.p.rating).length;
  const falta = [];
  if (sinNotas) falta.push(`${sinNotas} no ${sinNotas === 1 ? 'tiene' : 'tienen'} las notas cargadas`);
  if (sinPuntaje) falta.push(`${sinPuntaje} ${sinPuntaje === 1 ? 'está' : 'están'} sin puntuar`);

  av.hidden = false;
  av.innerHTML = `Empata en ${empatados[0].score} con ${empatados.length - 1} más` +
    (falta.length ? `: ${falta.join(' y ')}` : '') +
    `. Puntualos y los voy a poder separar.`;
}

function fichaSugerencia(s, i) {
  const p = s.p, f = familia(p.familia);
  /* Orden: primero lo aprendido (es lo que distingue esta sugerencia de una
     regla fija), después lo que pasa hoy afuera, y al final el resto. */
  const peso = r => (r.aprendido ? 2 : (r.clima ? 1 : 0));
  const ordenadas = s.razones.slice().sort((a, b) => peso(b) - peso(a));
  const razones = ordenadas.slice(0, 3).map(r =>
    `<li${r.aprendido ? ' class="aprendida"' : ''}>${r.aprendido ? '✦' : (r.bien ? '✓' : '·')} <b>${esc(r.txt)}</b></li>`).join('');
  const pct = porcRestante(p);
  return `<article class="card">
    <div class="pf" data-ficha="${p.id}" role="button" tabindex="0">
      <div class="pf-mark" style="border-color:${f.color}33">${f.emoji}</div>
      <div class="pf-main">
        <div class="pf-name">${i === 0 ? '★ ' : ''}${esc(p.nombre)}</div>
        <div class="pf-house">${esc(p.casa)}${p.conc ? ' · ' + esc(p.conc) : ''}</div>
        <ul class="razones">${razones}</ul>
      </div>
      <div class="pf-right">
        <div class="pf-score">${s.score}</div><div class="pf-score-cap">puntaje</div>
        ${p.ml > 0 ? `<div>${pct} %</div>` : ''}</div>
    </div>
    <div class="btn-row">
      <button class="btn btn-accent" data-usar="${p.id}">Me lo pongo</button>
      <button class="btn" data-ficha="${p.id}">Ver ficha</button>
    </div>
  </article>`;
}

/* Muestra el modelo en palabras. Si no se puede leer, no se puede confiar:
   por eso se listan las reglas y se dice sobre cuántos usos se calcularon. */
function renderAprendizaje(m) {
  const card = $('#cardAprendizaje');
  if (!m.activo) {
    card.hidden = true;
    if (S.ajustes.aprender && S.perfumes.length && m.usos != null && m.usos > 0) {
      card.hidden = false;
      $('#aprendizajeSub').textContent =
        `Con ${m.usos} uso${m.usos === 1 ? '' : 's'} registrado${m.usos === 1 ? '' : 's'} todavía no alcanza. ` +
        `Desde ${MIN_USOS_MODELO} empiezo a ajustar las sugerencias a lo que elegís.`;
      $('#aprendizajeReglas').innerHTML = '';
    }
    return;
  }

  const reglas = [];
  Object.keys(m.totOc).forEach(oc => {
    if (m.totOc[oc] < MIN_USOS_OCASION) return;
    let mejor = null;
    Object.keys(m.share).forEach(fam => {
      const c = m.ocFam[oc + '|' + fam] || 0;
      if (!c) return;
      const dif = (c / m.totOc[oc]) - (m.share[fam] || 0);
      if (!mejor || dif > mejor.dif) mejor = { fam, c, dif };
    });
    if (mejor && mejor.dif > 0.05) reglas.push(
      `<div class="linea"><span>${OCASIONES[oc]}</span><b>${esc(familia(mejor.fam).nombre.toLowerCase())} · ${mejor.c} de ${m.totOc[oc]}</b></div>`);
  });
  Object.keys(m.tempFam || {}).forEach(fam => {
    const t = m.tempFam[fam];
    reglas.push(`<div class="linea"><span>${esc(familia(fam).nombre)}</span><b>lo usás con ${Math.round(t.media)}° · ${t.n} usos</b></div>`);
  });
  if (m.notasTop.length) reglas.push(
    `<div class="linea"><span>Notas que repetís</span><b>${esc(m.notasTop.slice(0, 3).map(x => x.n).join(', '))}</b></div>`);

  card.hidden = !reglas.length;
  $('#aprendizajeSub').textContent =
    `Sobre tus ${m.usos} usos de los últimos ${Math.round(VENTANA_APRENDIZAJE / 30)} meses. Lo apagás en Ajustes.`;
  $('#aprendizajeReglas').innerHTML = reglas.join('');
}

function avisoCopia() {
  const av = $('#avisoCopia');
  const hayDatos = S.perfumes.length > 0;
  const ult = S.meta.ultimaCopia;
  const viejo = ult ? daysBetween(ult, today()) >= 7 : true;
  if (!hayDatos || !viejo) { av.hidden = true; return; }
  av.hidden = false;
  av.innerHTML = ult
    ? `Hace ${daysBetween(ult, today())} días que no exportás una copia. Si limpiás el navegador, se pierde todo. <b>Exportar ahora →</b>`
    : `No tenés ninguna copia de tus datos. Si limpiás el navegador, se pierde todo. <b>Exportar ahora →</b>`;
}

/* ============================== VIAJE ===============================
   "Qué me pongo hoy" y "qué me llevo siete días" son preguntas distintas:
   la segunda no se resuelve eligiendo los tres perfumes de mayor puntaje,
   porque suelen parecerse entre sí y dejan días sin cubrir. Se resuelve
   cubriendo el viaje: cada día y cada ocasión es una casilla a tapar, y
   cada perfume se elige por lo que agrega sobre los ya elegidos.        */
let viaje = { lugar: null, dias: null };

function abrirViaje() {
  const d1 = addDays(today(), 7), d2 = addDays(today(), 12);
  viaje = { lugar: null, dias: null };
  abrirModal('Me voy de viaje', `
    <p class="sub">Decime adónde y cuándo y armo la valija: busco el pronóstico del destino y elijo los que cubren todo el viaje.</p>
    <form id="formViaje">
      <label class="field"><span>Destino</span>
        <input type="search" id="vDestino" placeholder="Bariloche, Madrid, Río…" autocomplete="off"></label>
      <div id="vResultados" class="stack-sm"></div>
      <p class="hint" id="vElegido" hidden></p>

      <div class="field-row">
        <label class="field"><span>Desde</span><input type="date" id="vDesde" value="${d1}"></label>
        <label class="field"><span>Hasta</span><input type="date" id="vHasta" value="${d2}"></label>
      </div>

      <div class="field"><span>Qué vas a hacer allá</span>
        <div class="chips" id="vOcasiones">${Object.keys(OCASIONES).map(k =>
          `<button type="button" class="chip${(k === 'casual' || k === 'salida') ? ' on' : ''}" data-val="${k}">${OCASIONES[k]}</button>`).join('')}</div>
      </div>

      <label class="field"><span>Cuántos llevás</span>
        <select id="vCuantos">
          <option value="1">1</option><option value="2" selected>2</option>
          <option value="3">3</option><option value="4">4</option>
        </select></label>

      <div class="btn-row"><button type="submit" class="btn btn-accent">Armar la valija</button></div>
    </form>
    <div id="vSalida"></div>`);

  let buscando = null;
  $('#vDestino').addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(buscando);
    if (q.length < 3) { $('#vResultados').innerHTML = ''; return; }
    buscando = setTimeout(() => {
      $('#vResultados').innerHTML = '<p class="hint">Buscando…</p>';
      buscarCiudad(q).then(res => {
        $('#vResultados').innerHTML = res.length
          ? res.map(r => `<button type="button" class="item" data-lat="${r.latitude}" data-lon="${r.longitude}"
              data-nombre="${esc(r.name)}"><div class="it-main"><div class="it-name">${esc(r.name)}</div>
              <div class="it-sub">${esc([r.admin1, r.country].filter(Boolean).join(' · '))}</div></div></button>`).join('')
          : '<p class="hint">No encontré ese destino.</p>';
      }).catch(() => { $('#vResultados').innerHTML = '<p class="hint">No pude buscar el destino. ¿Hay internet?</p>'; });
    }, 400);
  });

  $('#vResultados').addEventListener('click', e => {
    const b = e.target.closest('[data-lat]');
    if (!b) return;
    viaje.lugar = { nombre: b.dataset.nombre, lat: Number(b.dataset.lat), lon: Number(b.dataset.lon) };
    $('#vResultados').innerHTML = '';
    $('#vDestino').value = viaje.lugar.nombre;
    const e2 = $('#vElegido');
    e2.hidden = false;
    e2.textContent = `Destino: ${viaje.lugar.nombre} · ${viaje.lugar.lat.toFixed(2)}, ${viaje.lugar.lon.toFixed(2)}`;
  });

  $('#vOcasiones').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c) c.classList.toggle('on');
  });

  $('#formViaje').addEventListener('submit', e => { e.preventDefault(); armarValija(); });
}

function diasDelViaje(desde, hasta) {
  const dias = [];
  for (let f = desde; f <= hasta && dias.length < 14; f = addDays(f, 1)) dias.push(f);
  return dias;
}

function armarValija(tempAMano) {
  const salida = $('#vSalida');
  if (!viaje.lugar) { salida.innerHTML = '<div class="vacio">Elegí un destino de la lista.</div>'; return; }

  const desde = $('#vDesde').value || today();
  const hasta = $('#vHasta').value || desde;
  if (hasta < desde) { salida.innerHTML = '<div class="vacio">La vuelta no puede ser antes de la ida.</div>'; return; }

  const ocasiones = $$('#vOcasiones .chip.on').map(c => c.dataset.val);
  if (!ocasiones.length) { salida.innerHTML = '<div class="vacio">Marcá al menos una cosa que vayas a hacer.</div>'; return; }
  if (!S.perfumes.length) { salida.innerHTML = '<div class="vacio">Primero cargá tu colección.</div>'; return; }

  const cuantos = num($('#vCuantos').value, 2);
  const fechas = diasDelViaje(desde, hasta);

  if (typeof tempAMano === 'number') {
    pintarValija(fechas.map(f => ({ fecha: f, media: tempAMano, lluvia: false })),
                 ocasiones, cuantos, { estimado: true });
    return;
  }

  salida.innerHTML = '<p class="hint">Buscando el pronóstico del destino…</p>';
  const url = `${CLIMA_API}?latitude=${viaje.lugar.lat}&longitude=${viaje.lugar.lon}` +
    '&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,' +
    'relative_humidity_2m_mean,wind_speed_10m_max,precipitation_sum,weather_code&timezone=auto' +
    `&start_date=${desde}&end_date=${hasta}`;

  pedirJSON(url, 12000).then(d => {
    const dd = d && d.daily;
    if (!dd || !dd.time || !dd.time.length) throw new Error('sin pronóstico');
    /* Igual que en Hoy: para decidir manda la sensación térmica, que ya trae
       adentro el viento y la humedad. Si el destino no la devuelve, se cae a
       la temperatura real. */
    const sens = (arr, i, respaldo) =>
      (arr && typeof arr[i] === 'number') ? arr[i] : respaldo;
    const dias = dd.time.map((f, i) => ({
      fecha: f,
      media: (sens(dd.apparent_temperature_max, i, dd.temperature_2m_max[i]) +
              sens(dd.apparent_temperature_min, i, dd.temperature_2m_min[i])) / 2,
      max: dd.temperature_2m_max[i], min: dd.temperature_2m_min[i],
      humedad: dd.relative_humidity_2m_mean ? dd.relative_humidity_2m_mean[i] : null,
      viento: dd.wind_speed_10m_max ? dd.wind_speed_10m_max[i] : null,
      lluvia: (dd.precipitation_sum[i] || 0) >= 1 || estaLloviendo(dd.weather_code[i])
    }));
    pintarValija(dias, ocasiones, cuantos, { estimado: false });
  }).catch(() => {
    /* Más de dos semanas adelante no hay pronóstico, y sin red tampoco.
       En vez de inventar un clima, se pide la temperatura esperada. */
    const estimada = ESTACIONES[estacionDe(desde, viaje.lugar.lat < 0 ? 'sur' : 'norte')].temp;
    salida.innerHTML = `
      <div class="viaje-resumen">
        No hay pronóstico para esas fechas (el pronóstico llega hasta unos 15 días) o no hay internet.
        Poné la temperatura que esperás y lo calculo igual.
        <div class="temp-row" style="margin-top:10px">
          <input type="range" id="vTemp" min="-5" max="42" step="1" value="${estimada}">
          <output id="vTempOut">${estimada}°</output>
        </div>
        <div class="btn-row"><button class="btn btn-accent" id="vCalcular">Calcular con eso</button></div>
      </div>`;
    $('#vTemp').addEventListener('input', ev => { $('#vTempOut').textContent = ev.target.value + '°'; });
    $('#vCalcular').addEventListener('click', () => armarValija(num($('#vTemp').value, estimada)));
  });
}

function pintarValija(dias, ocasiones, cuantos, opciones) {
  const hemi = viaje.lugar.lat < 0 ? 'sur' : 'norte';
  const m = modeloAprendido();
  const candidatos = S.perfumes.filter(p => !(p.ml > 0 && p.mlRestante <= 0));

  // una casilla por cada día y cada ocasión del viaje
  const casillas = [];
  dias.forEach(d => ocasiones.forEach(oc => casillas.push({ dia: d, oc })));

  const puntajes = candidatos.map(p => casillas.map(cs => puntuar(p, m, {
    temp: cs.dia.media, ocasion: cs.oc, momento: 'ambos',
    estacion: estacionDe(cs.dia.fecha, hemi), lluvia: cs.dia.lluvia,
    humedad: cs.dia.humedad, viento: cs.dia.viento,
    sinMomento: true, sinRotacion: true
  }).score));

  /* Elección por cobertura: en cada vuelta gana el que más sube el puntaje
     de las casillas todavía mal cubiertas, no el que tiene mejor promedio.
     Así el segundo que entra es el que tapa lo que el primero no tapaba. */
  const mejorPorCasilla = casillas.map(() => 0);
  const elegidos = [];
  while (elegidos.length < Math.min(cuantos, candidatos.length)) {
    let mejorIdx = -1, mejorGanancia = 0;
    puntajes.forEach((fila, i) => {
      if (elegidos.some(e => e.i === i)) return;
      let ganancia = 0;
      fila.forEach((sc, j) => { if (sc > mejorPorCasilla[j]) ganancia += sc - mejorPorCasilla[j]; });
      if (ganancia > mejorGanancia) { mejorGanancia = ganancia; mejorIdx = i; }
    });
    if (mejorIdx < 0) break;
    puntajes[mejorIdx].forEach((sc, j) => { if (sc > mejorPorCasilla[j]) mejorPorCasilla[j] = sc; });
    elegidos.push({ i: mejorIdx, p: candidatos[mejorIdx] });
  }

  /* Si uno solo ya cubría todo, la cobertura no agrega a nadie más. Si pediste
     llevar más, se completan por promedio... pero solo con los que de verdad
     sirven para ese viaje: rellenar hasta el número pedido con un perfume que
     puntúa 20 es darte una recomendación que no recomienda nada. */
  const MINIMO_ACOMPANANTE = 45;
  let porCobertura = elegidos.length;
  if (elegidos.length < Math.min(cuantos, candidatos.length)) {
    const resto = candidatos.map((p, i) => ({ i, p, prom: puntajes[i].reduce((a, b) => a + b, 0) / puntajes[i].length }))
      .filter(x => !elegidos.some(e => e.i === x.i) && x.prom >= MINIMO_ACOMPANANTE)
      .sort((a, b) => b.prom - a.prom);
    while (elegidos.length < Math.min(cuantos, candidatos.length) && resto.length)
      elegidos.push(resto.shift());
  }

  // cada casilla se la queda el elegido que mejor puntúa ahí
  elegidos.forEach(e => {
    e.dias = {}; e.ocasiones = {}; e.casillas = 0;
    // el puntaje que se muestra es el promedio sobre TODO el viaje, igual para
    // todos: el promedio de las casillas asignadas daba 0 a los acompañantes
    e.prom = puntajes[e.i].reduce((a, b) => a + b, 0) / puntajes[e.i].length;
  });
  casillas.forEach((cs, j) => {
    let duenio = null;
    elegidos.forEach(e => { if (!duenio || puntajes[e.i][j] > puntajes[duenio.i][j]) duenio = e; });
    if (!duenio) return;
    duenio.dias[cs.dia.fecha] = true;
    duenio.ocasiones[cs.oc] = true;
    duenio.casillas++;
  });

  const temps = dias.map(d => d.media);
  const conLluvia = dias.filter(d => d.lluvia).length;
  const humedades = dias.map(d => d.humedad).filter(h => typeof h === 'number');
  const humedadMedia = humedades.length
    ? Math.round(humedades.reduce((a, b) => a + b, 0) / humedades.length) : null;
  const estacionAllá = estacionDe(dias[0].fecha, hemi);
  const mlPorDia = 3 * S.ajustes.mlSpray;

  const resumen = `<div class="viaje-resumen">
    <b>${esc(viaje.lugar.nombre)}</b> · ${dias.length} día${dias.length === 1 ? '' : 's'},
    del ${fmtFecha(dias[0].fecha)} al ${fmtFecha(dias[dias.length - 1].fecha)}.<br>
    ${opciones.estimado
      ? `Sin pronóstico: calculado con <b>${Math.round(temps[0])}°</b> que pusiste vos.`
      : `De <b>${Math.round(Math.min.apply(null, dias.map(d => d.min)))}°</b> a <b>${Math.round(Math.max.apply(null, dias.map(d => d.max)))}°</b>` +
        `${conLluvia ? `, con lluvia ${conLluvia} día${conLluvia === 1 ? '' : 's'}` : ', sin lluvia'}` +
        `${humedadMedia != null ? `, humedad ${humedadMedia} %` : ''}. Decido por la sensación térmica.`}
    Allá es <b>${nombreEstacion(estacionAllá)}</b>.
  </div>`;

  const tarjetas = elegidos.map(e => {
    const p = e.p, f = familia(p.familia);
    const diasCubiertos = Object.keys(e.dias).length;
    const ocasionesCubiertas = Object.keys(e.ocasiones).map(o => OCASIONES[o].toLowerCase());
    const mlNecesarios = diasCubiertos * mlPorDia;
    const alertas = [];
    if (p.ml > 0 && p.mlRestante < mlNecesarios)
      alertas.push(`Te quedan ${Math.round(p.mlRestante * 10) / 10} ml y vas a usar unos ${Math.round(mlNecesarios * 10) / 10}.`);
    if (p.ml > 100)
      alertas.push(`El frasco es de ${p.ml} ml: en cabina solo entran envases de hasta 100 ml.`);
    const acompania = elegidos.indexOf(e) >= porCobertura;
    return `<div class="pf" data-ficha="${p.id}" role="button" tabindex="0">
      <div class="pf-mark" style="border-color:${f.color}33">${f.emoji}</div>
      <div class="pf-main">
        <div class="pf-name">${esc(p.nombre)}</div>
        <div class="pf-house">${esc(p.casa)}${p.conc ? ' · ' + esc(p.conc) : ''}</div>
        <div class="cubre">
          <span>${acompania ? 'de compañía' : diasCubiertos + ' de ' + dias.length + ' días'}</span>
          ${ocasionesCubiertas.map(o => `<span>${esc(o)}</span>`).join('')}
          ${diasCubiertos ? `<span>~${Math.round(mlNecesarios * 10) / 10} ml</span>` : ''}
        </div>
        ${alertas.map(a => `<div class="alerta">${esc(a)}</div>`).join('')}
      </div>
      <div class="pf-right">
        <div class="pf-score">${Math.round(e.prom)}</div><div class="pf-score-cap">puntaje</div></div>
    </div>`;
  }).join('');

  $('#vSalida').innerHTML = resumen + `<div class="valija">${tarjetas ||
    '<div class="vacio">Ninguno de tu colección sirve para ese viaje.</div>'}</div>
    <p class="hint">El puntaje va de 0 a 100 y es el promedio de todos los días y ocasiones del viaje: sirve para comparar entre ellos, no como nota.
    Se eligen por cobertura: el segundo es el que tapa lo que el primero deja afuera, no el segundo de la lista.${
      elegidos.length > porCobertura ? ` Con ${porCobertura} te alcanzaba para todo el viaje; el resto va por gusto.` : ''}${
      elegidos.length < cuantos ? ` Te muestro ${elegidos.length} y no ${cuantos}: el resto de tu colección no suma nada para este viaje.` : ''}</p>`;
}

/* ============================ COLECCIÓN ============================= */
const filtros = { texto: '', familia: '', orden: 'reciente', soloDisponibles: false };

function renderColeccion() {
  // chips de familia, solo las que tenés
  const usadas = D.FAMILIAS.filter(f => S.perfumes.some(p => p.familia === f.id));
  $('#filtroFamilia').innerHTML = [{ id: '', nombre: 'Todas', emoji: '🗂' }].concat(usadas)
    .map(f => `<button class="chip${filtros.familia === f.id ? ' on' : ''}" data-fam="${f.id}">${f.emoji} ${esc(f.nombre)}</button>`)
    .join('');

  const lista = filtrarColeccion();
  const total = S.perfumes.length;
  const ml = S.perfumes.reduce((a, p) => a + (p.mlRestante || 0), 0);
  const invertido = S.perfumes.reduce((a, p) => a + (p.precio || 0), 0);
  $('#coleccionResumen').textContent = total
    ? `${lista.length} de ${total} · ${Math.round(ml)} ml en casa · ${S.ajustes.moneda}${Math.round(invertido).toLocaleString('es-AR')} invertidos`
    : '';

  $('#listaColeccion').innerHTML = lista.length
    ? lista.map(fichaLista).join('')
    : `<div class="vacio">${total ? 'Ningún perfume coincide con el filtro.' : 'Tu colección está vacía.<br>Tocá <b>+ Agregar</b> para cargar el primero.'}</div>`;
}

function filtrarColeccion() {
  const t = filtros.texto.trim().toLowerCase();
  let lista = S.perfumes.filter(p => {
    if (filtros.familia && p.familia !== filtros.familia) return false;
    if (filtros.soloDisponibles && p.ml > 0 && p.mlRestante <= 0) return false;
    if (!t) return true;
    const heno = [p.nombre, p.casa, p.conc, familia(p.familia).nombre]
      .concat(notasDe(p)).join(' ').toLowerCase();
    return heno.includes(t);
  });
  const ordenes = {
    nombre: (a, b) => a.nombre.localeCompare(b.nombre),
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    usos: (a, b) => usosDe(b.id).length - usosDe(a.id).length,
    restante: (a, b) => porcRestante(a) - porcRestante(b),
    reciente: (a, b) => String(b.creado || '').localeCompare(String(a.creado || '')),
    olvidados: (a, b) => {
      const ua = ultimoUso(a.id), ub = ultimoUso(b.id);
      if (!ua && !ub) return 0;
      if (!ua) return -1;
      if (!ub) return 1;
      return ua.localeCompare(ub);
    },
    costo: (a, b) => {
      const ca = costoPorUso(a), cb = costoPorUso(b);
      if (ca == null && cb == null) return 0;
      if (ca == null) return 1;
      if (cb == null) return -1;
      return cb - ca;
    }
  };
  return lista.sort(ordenes[filtros.orden] || ordenes.reciente);
}

function estrellas(n) {
  const r = Math.round(n || 0);
  return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
}

/* Un perfume sin familia o sin notas no participa del perfil olfativo, de los
   parecidos ni de lo que se aprende de las notas: conviene que se vea. */
function etiquetaFamilia(p, f) {
  if (!p.familia) return '❓ completar familia';
  if (!notasDe(p).length) return `${esc(f.nombre)} · ❓ completar notas`;
  return esc(f.nombre);
}

function fichaLista(p) {
  const f = familia(p.familia);
  const pct = porcRestante(p);
  const ult = ultimoUso(p.id);
  const n = usosDe(p.id).length;
  const cpu = costoPorUso(p);
  return `<div class="pf" data-ficha="${p.id}" role="button" tabindex="0">
    <div class="pf-mark" style="border-color:${f.color}33">${f.emoji}</div>
    <div class="pf-main">
      <div class="pf-name">${esc(p.nombre)}</div>
      <div class="pf-house">${esc(p.casa)}${p.conc ? ' · ' + esc(p.conc) : ''}</div>
      <div class="pf-meta">
        <span class="pill fam" style="border-color:${f.color}55">${etiquetaFamilia(p, f)}</span>
        <span class="pill">${n} uso${n === 1 ? '' : 's'}</span>
        <span class="pill">${ult ? fmtHace(ult) : 'sin estrenar'}</span>
        ${cpu != null ? `<span class="pill">${S.ajustes.moneda}${Math.round(cpu).toLocaleString('es-AR')}/uso</span>` : ''}
      </div>
      ${p.ml > 0 ? `<div class="pf-bar"><i style="width:${pct}%"></i></div>` : ''}
    </div>
    <div class="pf-right">
      <div class="stars">${estrellas(p.rating)}</div>
      ${p.ml > 0 ? `<div>${Math.round(p.mlRestante)} / ${p.ml} ml</div>` : ''}
    </div>
  </div>`;
}

/* ------------------------------ ficha ------------------------------ */
function abrirFicha(id) {
  const p = perfume(id);
  if (!p) return;
  const f = familia(p.familia);
  const pct = porcRestante(p);
  const us = usosDe(p.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const cpu = costoPorUso(p);
  const nivel = (t, arr) => (arr && arr.length)
    ? `<div class="nivel"><span>${t}</span><div>${arr.map(n => `<span class="tag" data-nota="${esc(n)}">${esc(n)}</span>`).join('')}</div></div>` : '';

  abrirModal(p.nombre, `
    <p class="sub">${esc(p.casa)}${p.conc ? ' · ' + esc(p.conc) : ''} · ${f.emoji} ${esc(f.nombre)}</p>
    <div class="stars" style="font-size:15px">${estrellas(p.rating)}</div>

    <div class="piramide">
      ${nivel('Salida', p.salida)}${nivel('Corazón', p.corazon)}${nivel('Fondo', p.fondo)}
    </div>

    <section class="card" style="margin-top:14px">
      ${p.ml > 0 ? `<div class="linea"><span>Queda</span><b>${Math.round(p.mlRestante)} de ${p.ml} ml (${pct} %)</b></div>` : ''}
      ${p.precio ? `<div class="linea"><span>Precio</span><b>${S.ajustes.moneda}${p.precio.toLocaleString('es-AR')}${p.ml ? ` · ${S.ajustes.moneda}${(p.precio / p.ml).toFixed(0)}/ml` : ''}</b></div>` : ''}
      ${cpu != null ? `<div class="linea"><span>Costo por uso</span><b>${S.ajustes.moneda}${Math.round(cpu).toLocaleString('es-AR')}</b></div>` : ''}
      <div class="linea"><span>Usos</span><b>${us.length}${us.length ? ` · último ${fmtHace(us[0].fecha)}` : ''}</b></div>
      ${p.comprado ? `<div class="linea"><span>Comprado</span><b>${fmtFecha(p.comprado)} de ${fromISO(p.comprado).getFullYear()}</b></div>` : ''}
      <div class="linea"><span>Estaciones</span><b>${(p.estaciones || []).map(nombreEstacion).join(', ') || '—'}</b></div>
      <div class="linea"><span>Ocasiones</span><b>${(p.ocasiones || []).map(o => OCASIONES[o]).join(', ') || '—'}</b></div>
      <div class="linea"><span>Momento</span><b>${MOMENTOS[p.momento || 'ambos']}</b></div>
      <div class="linea"><span>Duración / estela</span><b>${p.longevidad || '?'} h · ${'▮'.repeat(p.estela || 0)}${'▯'.repeat(5 - (p.estela || 0))}</b></div>
    </section>

    ${p.nota ? `<section class="card"><h2>Tus notas</h2><p class="hint" style="margin-top:6px">${esc(p.nota)}</p></section>` : ''}

    ${us.length ? `<section class="card"><h2>Historial</h2><div class="stack-sm" style="margin-top:10px">
      ${us.slice(0, 8).map(u => `<div class="item" data-editar-uso="${u.id}" role="button" tabindex="0"><div class="it-main">
        <div class="it-name">${fmtFecha(u.fecha)} · ${OCASIONES[u.ocasion] || '—'}</div>
        <div class="it-sub">${u.sprays} aplicaciones${u.temp != null ? ` · ${Math.round(u.temp)}°` : ''}${u.nota ? ' · ' + esc(u.nota) : ''}</div>
      </div><div class="it-act"><button data-borrar-uso="${u.id}" aria-label="Borrar uso">🗑</button></div></div>`).join('')}
    </div></section>` : ''}

    <div class="btn-row">
      <button class="btn btn-accent" data-usar="${p.id}">Registrar uso</button>
      <button class="btn" data-editar="${p.id}">Editar</button>
    </div>
    <div class="btn-row">
      <button class="btn" data-rellenar="${p.id}">Rellené el frasco</button>
      <button class="btn" data-comparar="${p.id}">Comparar</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-danger" data-borrar="${p.id}">Borrar</button>
    </div>`);
}

/* ---------------------------- formulario --------------------------- */
function abrirFormulario(id) {
  const p = id ? perfume(id) : null;
  const v = p || {
    nombre: '', casa: '', conc: 'EDP', familia: 'amaderada',
    salida: [], corazon: [], fondo: [], ml: 100, mlRestante: 100,
    precio: 0, comprado: today(), longevidad: 7, estela: 3,
    estaciones: [], ocasiones: [], momento: 'ambos', rating: 4, nota: ''
  };
  const chip = (grupo, val, txt, on) =>
    `<button type="button" class="chip${on ? ' on' : ''}" data-grupo="${grupo}" data-val="${val}">${txt}</button>`;

  abrirModal(p ? 'Editar perfume' : 'Nuevo perfume', `
    <form id="formPf">
      ${p ? '' : `<label class="field">
        <span>Buscar en el catálogo (opcional)</span>
        <input list="dlCatalogo" id="fCatalogo" placeholder="Ej: Bleu de Chanel" autocomplete="off">
        <datalist id="dlCatalogo">${D.CATALOGO.map(c =>
          `<option value="${esc(c.casa)} · ${esc(c.nombre)}"></option>`).join('')}</datalist>
      </label>
      <p class="hint" style="margin:-4px 0 12px">Elegí uno y se completan familia, notas y estaciones. Después editás lo que quieras.</p>`}

      <div class="field-row">
        <label class="field"><span>Nombre</span><input id="fNombre" required value="${esc(v.nombre)}"></label>
        <label class="field"><span>Casa</span><input id="fCasa" value="${esc(v.casa)}"></label>
      </div>

      <div class="field-row">
        <label class="field"><span>Concentración</span>
          <select id="fConc">${['EDC','EDT','EDP','Parfum','Cologne','Otro']
            .map(c => `<option${v.conc === c ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>Familia</span>
          <select id="fFamilia">
            <option value=""${!v.familia ? ' selected' : ''}>❓ Sin clasificar</option>
            ${D.FAMILIAS.map(f =>
            `<option value="${f.id}"${v.familia === f.id ? ' selected' : ''}>${f.emoji} ${esc(f.nombre)}</option>`).join('')}</select></label>
      </div>

      <label class="field"><span>Notas de salida (separadas por coma)</span>
        <input id="fSalida" list="dlNotas" value="${esc((v.salida || []).join(', '))}"></label>
      <label class="field"><span>Notas de corazón</span>
        <input id="fCorazon" list="dlNotas" value="${esc((v.corazon || []).join(', '))}"></label>
      <label class="field"><span>Notas de fondo</span>
        <input id="fFondo" list="dlNotas" value="${esc((v.fondo || []).join(', '))}"></label>
      <datalist id="dlNotas">${D.NOTAS.map(n => `<option value="${esc(n.n)}"></option>`).join('')}</datalist>

      <div class="btn-row" style="margin:-4px 0 12px">
        <button type="button" class="btn mini" id="btnPegarPiramide">📋 Pegar la pirámide</button>
      </div>
      <div id="zonaPiramide" hidden>
        <label class="field"><span>Pegá las notas como vengan</span>
          <textarea id="textoPiramide" style="min-height:110px" placeholder="Notas de salida: bergamota, pimienta rosa&#10;Corazón: lavanda, geranio&#10;Fondo: ambroxan, cedro"></textarea></label>
        <div class="btn-row" style="margin-top:-4px">
          <button type="button" class="btn btn-accent" id="btnAplicarPiramide">Repartir en los tres campos</button>
        </div>
        <p class="hint">Entiende "salida / corazón / fondo" y "top / middle / base". Sin encabezados, pone todo en corazón y lo acomodás vos.</p>
      </div>

      <div class="field-row">
        <label class="field"><span>Tamaño (ml)</span><input type="number" id="fMl" min="0" step="1" value="${v.ml}"></label>
        <label class="field"><span>Queda (ml)</span><input type="number" id="fMlRest" min="0" step="1" value="${Math.round(v.mlRestante)}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Precio (${esc(S.ajustes.moneda)})</span><input type="number" id="fPrecio" min="0" step="1" value="${v.precio || ''}"></label>
        <label class="field"><span>Comprado</span><input type="date" id="fComprado" value="${v.comprado || ''}"></label>
      </div>

      <div class="field">
        <span>Estaciones</span>
        <div class="chips" id="gEstaciones">${Object.keys(ESTACIONES).map(k =>
          chip('estaciones', k, ESTACIONES[k].emoji + ' ' + nombreEstacion(k),
               (v.estaciones || []).map(claveEstacion).includes(k))).join('')}</div>
      </div>
      <div class="field">
        <span>Ocasiones</span>
        <div class="chips" id="gOcasiones">${Object.keys(OCASIONES).map(k =>
          chip('ocasiones', k, OCASIONES[k], (v.ocasiones || []).includes(k))).join('')}</div>
      </div>
      <div class="field">
        <span>Momento</span>
        <div class="chips" id="gMomento">${Object.keys(MOMENTOS).map(k =>
          chip('momento', k, MOMENTOS[k], (v.momento || 'ambos') === k)).join('')}</div>
      </div>

      <div class="field-row">
        <label class="field"><span>Duración (horas)</span><input type="number" id="fLong" min="0" max="24" step="1" value="${v.longevidad || ''}"></label>
        <label class="field"><span>Estela (1 a 5)</span><input type="number" id="fEstela" min="1" max="5" step="1" value="${v.estela || 3}"></label>
      </div>
      <label class="field"><span>Puntaje (0 a 5)</span><input type="number" id="fRating" min="0" max="5" step="1" value="${v.rating != null ? v.rating : 4}"></label>
      <label class="field"><span>Tus notas</span><textarea id="fNota" placeholder="A qué te recuerda, cuándo lo usás, qué te dijeron…">${esc(v.nota || '')}</textarea></label>

      <div class="btn-row">
        <button type="submit" class="btn btn-accent">${p ? 'Guardar cambios' : 'Agregar a la colección'}</button>
      </div>
    </form>`);

  // chips de selección múltiple / única
  // el listener va en el form (se crea de nuevo cada vez), no en #modalBody,
  // que se reutiliza entre modales y acumularía un listener por apertura
  $('#formPf').addEventListener('click', e => {
    const c = e.target.closest('.chip[data-grupo]');
    if (!c) return;
    if (c.dataset.grupo === 'momento') {
      $$('#gMomento .chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
    } else c.classList.toggle('on');
  });

  $('#btnPegarPiramide').addEventListener('click', () => {
    const z = $('#zonaPiramide');
    z.hidden = !z.hidden;
    if (!z.hidden) $('#textoPiramide').focus();
  });

  $('#btnAplicarPiramide').addEventListener('click', () => {
    const r = parsearPiramide($('#textoPiramide').value);
    const total = r.salida.length + r.corazon.length + r.fondo.length;
    if (!total) { toast('No encontré notas en ese texto'); return; }
    if (r.salida.length) $('#fSalida').value = r.salida.join(', ');
    if (r.corazon.length) $('#fCorazon').value = r.corazon.join(', ');
    if (r.fondo.length) $('#fFondo').value = r.fondo.join(', ');
    $('#zonaPiramide').hidden = true;
    toast(r.sinEncabezados
      ? `${total} notas al corazón: movelas a salida o fondo si hace falta`
      : `${total} notas repartidas`);
  });

  const cat = $('#fCatalogo');
  if (cat) cat.addEventListener('change', () => {
    const elegido = D.CATALOGO.find(c => `${c.casa} · ${c.nombre}` === cat.value);
    if (!elegido) return;
    $('#fNombre').value = elegido.nombre;
    $('#fCasa').value = elegido.casa;
    $('#fConc').value = elegido.conc;
    $('#fFamilia').value = elegido.familia;
    $('#fSalida').value = elegido.salida.join(', ');
    $('#fCorazon').value = elegido.corazon.join(', ');
    $('#fFondo').value = elegido.fondo.join(', ');
    $('#fLong').value = elegido.longevidad;
    $('#fEstela').value = elegido.estela;
    $$('#gEstaciones .chip').forEach(x =>
      x.classList.toggle('on', elegido.estaciones.map(claveEstacion).includes(x.dataset.val)));
    $$('#gOcasiones .chip').forEach(x =>
      x.classList.toggle('on', elegido.ocasiones.includes(x.dataset.val)));
    $$('#gMomento .chip').forEach(x => x.classList.toggle('on', x.dataset.val === elegido.momento));
    toast('Campos completados: revisalos y ajustá lo que quieras');
  });

  $('#formPf').addEventListener('submit', e => {
    e.preventDefault();
    const marcados = g => $$(`#${g} .chip.on`).map(x => x.dataset.val);
    const ml = num($('#fMl').value, 0);
    const datos = {
      nombre: $('#fNombre').value.trim() || 'Sin nombre',
      casa: $('#fCasa').value.trim(),
      conc: $('#fConc').value,
      familia: $('#fFamilia').value || null,
      salida: listar($('#fSalida').value),
      corazon: listar($('#fCorazon').value),
      fondo: listar($('#fFondo').value),
      ml,
      mlRestante: clamp(num($('#fMlRest').value, ml), 0, ml || 9999),
      precio: num($('#fPrecio').value, 0),
      comprado: $('#fComprado').value || null,
      longevidad: num($('#fLong').value, 0),
      estela: clamp(num($('#fEstela').value, 3), 1, 5),
      estaciones: marcados('gEstaciones').map(nombreEstacion),
      ocasiones: marcados('gOcasiones'),
      momento: marcados('gMomento')[0] || 'ambos',
      rating: clamp(num($('#fRating').value, 0), 0, 5),
      nota: $('#fNota').value.trim()
    };
    if (p) Object.assign(p, datos);
    else S.perfumes.push(Object.assign({ id: uid(), creado: today() }, datos));
    guardar(); cerrarModal(); render();
    toast(p ? 'Cambios guardados' : `${datos.nombre} entró a la colección`);
  });
}

/* --------------------- pegar una pirámide -------------------------
   Las fichas de notas se leen en cualquier lado, pero copiarlas a mano en
   tres campos es tedioso. Esto acepta el texto pegado tal cual venga —en
   español o inglés, con o sin encabezados— y lo reparte en salida, corazón
   y fondo. Los nombres se normalizan contra el diccionario de la app para
   que "vainilla" y "Vainilla" no queden como dos notas distintas.       */
const ENCABEZADOS = [
  { k: 'salida',  re: /(notas?\s+(de\s+)?)?(salida|cabeza|top|head)\b/i },
  { k: 'corazon', re: /(notas?\s+(de\s+)?)?(coraz[oó]n|medias?|middle|heart)\b/i },
  { k: 'fondo',   re: /(notas?\s+(de\s+)?)?(fondo|base|bottom|dry\s*down)\b/i }
];

function separarNotas(t) {
  return String(t)
    .replace(/[•·;]/g, ',')
    .replace(/\s+y\s+/gi, ',')
    .replace(/\s+and\s+/gi, ',')
    .split(',')
    .map(x => x.replace(/^[\s\-–—*]+|[\s.]+$/g, '').trim())
    .filter(x => x && x.length <= 40);
}

function canonizarNota(n) {
  const k = normaliza(n);
  const hit = D.NOTAS.find(x => normaliza(x.n) === k);
  if (hit) return hit.n;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function parsearPiramide(texto) {
  const res = { salida: [], corazon: [], fondo: [] };
  let actual = null, sueltas = [];

  String(texto).replace(/\r/g, '').split('\n').forEach(linea => {
    const t = linea.trim();
    if (!t) return;
    const enc = ENCABEZADOS.find(e => e.re.test(t));
    if (enc) {
      actual = enc.k;
      const resto = t.split(/[:：]/).slice(1).join(':');
      if (resto.trim()) res[actual] = res[actual].concat(separarNotas(resto));
      return;
    }
    if (actual) res[actual] = res[actual].concat(separarNotas(t));
    else sueltas = sueltas.concat(separarNotas(t));
  });

  // sin encabezados no se puede adivinar el nivel: va todo al corazón
  const vacio = !res.salida.length && !res.corazon.length && !res.fondo.length;
  if (vacio && sueltas.length) res.corazon = sueltas;

  ['salida', 'corazon', 'fondo'].forEach(k => {
    res[k] = res[k].map(canonizarNota)
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 12);
  });
  res.sinEncabezados = vacio && sueltas.length > 0;
  return res;
}

/* -------------------------- carga rápida --------------------------- */
/* Cargar veinte perfumes uno por uno con el formulario largo no lo hace
   nadie. Acá se pegan los nombres y se buscan contra el catálogo; lo que no
   aparece entra igual, con el nombre, y queda marcado para completar.       */

/* Compara sin acentos, sin puntuación y sin la concentración, que la gente
   escribe de cualquier manera: "Acqua di Gio EDT" y "acqua di giò" son lo
   mismo. */
function normaliza(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/\b(edt|edp|edc|eau de toilette|eau de parfum|eau de cologne|parfum|perfume|cologne)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function buscarEnCatalogo(linea) {
  const n = normaliza(linea);
  if (!n) return null;
  const exacto = D.CATALOGO.find(c => normaliza(c.nombre) === n || normaliza(c.casa + ' ' + c.nombre) === n);
  if (exacto) return { c: exacto, exacto: true };
  const parecidos = D.CATALOGO.filter(c => {
    const nn = normaliza(c.nombre);
    return nn.length >= 4 && (n.includes(nn) || nn.includes(n));
  }).sort((a, b) => normaliza(b.nombre).length - normaliza(a.nombre).length);
  return parecidos.length ? { c: parecidos[0], exacto: false } : null;
}

function parsearLote(texto) {
  return texto.split('\n').map(l => l.trim()).filter(Boolean).map(linea => {
    const partes = linea.split('|').map(x => x.trim());
    const nombre = partes[0];
    const hallado = buscarEnCatalogo(nombre);
    const ref = hallado ? hallado.c.nombre : nombre;
    return {
      linea: nombre,
      c: hallado ? hallado.c : null,
      exacto: !!(hallado && hallado.exacto),
      ml: partes[1] ? num(partes[1], 100) : 100,
      precio: partes[2] ? num(partes[2], 0) : 0,
      repetido: S.perfumes.some(x => normaliza(x.nombre) === normaliza(ref))
    };
  });
}

let lotePendiente = [];

function abrirLote() {
  abrirModal('Carga rápida', `
    <p class="sub">Pegá un perfume por línea. Busco cada uno en el catálogo de ${D.CATALOGO.length}
      fragancias y completo familia, notas, estaciones y ocasiones.</p>
    <label class="field">
      <textarea id="loteTexto" style="min-height:150px" placeholder="Bleu de Chanel&#10;Lattafa Khamrah | 100 | 70000&#10;Acqua di Giò"></textarea>
    </label>
    <p class="hint">Opcional, separado con barras: <code>Nombre | ml | precio</code>.</p>
    <div class="btn-row"><button class="btn btn-accent" id="btnRevisarLote">Revisar</button></div>
    <div id="lotePreview"></div>`);

  $('#btnRevisarLote').addEventListener('click', () => {
    lotePendiente = parsearLote($('#loteTexto').value);
    const nuevos = lotePendiente.filter(x => !x.repetido);
    const reconocidos = nuevos.filter(x => x.c).length;
    const acompletar = nuevos.length - reconocidos;
    const repetidos = lotePendiente.length - nuevos.length;

    $('#lotePreview').innerHTML = !lotePendiente.length
      ? `<div class="vacio">No escribiste ningún nombre.</div>`
      : `<h2 class="section-title">${nuevos.length} para agregar</h2>
        <div class="stack-sm">${lotePendiente.map(x => `<div class="item">
          <div class="it-main">
            <div class="it-name">${esc(x.c ? x.c.nombre : x.linea)}</div>
            <div class="it-sub">${x.repetido ? 'Ya lo tenés: se saltea'
              : x.c ? `${x.exacto ? '✓' : '≈'} ${esc(x.c.casa)} · ${esc(x.c.conc)} · ${esc(familia(x.c.familia).nombre)}`
                    : 'No está en el catálogo: entra con el nombre y lo completás después'}</div>
          </div>
          <div class="pf-mark" style="width:34px;height:34px;font-size:15px">${x.repetido ? '⏭' : (x.c ? familia(x.c.familia).emoji : '❓')}</div>
        </div>`).join('')}</div>
        <p class="hint">${reconocidos} reconocidos · ${acompletar} para completar · ${repetidos} repetidos.</p>
        ${nuevos.length ? `<div class="btn-row"><button class="btn btn-accent" id="btnConfirmarLote">Agregar ${nuevos.length} a la colección</button></div>` : ''}`;

    const btn = $('#btnConfirmarLote');
    if (btn) btn.addEventListener('click', () => {
      let n = 0;
      lotePendiente.filter(x => !x.repetido).forEach(x => {
        const c = x.c;
        S.perfumes.push({
          id: uid(), creado: today(),
          nombre: c ? c.nombre : x.linea,
          casa: c ? c.casa : '',
          conc: c ? c.conc : 'EDP',
          familia: c ? c.familia : null,
          salida: c ? c.salida.slice() : [],
          corazon: c ? c.corazon.slice() : [],
          fondo: c ? c.fondo.slice() : [],
          ml: x.ml, mlRestante: x.ml,
          precio: x.precio, comprado: null,
          longevidad: c ? c.longevidad : 0,
          estela: c ? c.estela : 3,
          estaciones: c ? c.estaciones.slice() : [],
          ocasiones: c ? c.ocasiones.slice() : [],
          momento: c ? c.momento : 'ambos',
          rating: 0, nota: ''
        });
        n++;
      });
      guardar(); cerrarModal(); render();
      toast(`Agregados ${n} perfumes`);
    });
  });
}

/* --------------------------- usos ---------------------------------- */
/* Todo cambio de un uso mueve los ml del frasco. Centralizarlo acá evita que
   editar deje el nivel del frasco mintiendo. */
function aplicarMl(perfumeId, sprays, signo) {
  const p = perfume(perfumeId);
  if (p && p.ml > 0) p.mlRestante = clamp(p.mlRestante + signo * sprays * S.ajustes.mlSpray, 0, p.ml);
}

/* -------------------------- registrar uso -------------------------- */
function abrirUso(id, usoId) {
  const editando = usoId ? S.usos.find(u => u.id === usoId) : null;
  const p = perfume(editando ? editando.perfumeId : id);
  if (!p) return;
  ctxInicial();
  const ocElegida = editando ? editando.ocasion : ctx.ocasion;
  abrirModal(editando ? 'Editar uso' : 'Registrar uso', `
    <p class="sub">${esc(p.nombre)} · ${esc(p.casa)}</p>
    <form id="formUso">
      ${editando ? `<label class="field"><span>Perfume</span>
        <select id="uPerfume">${S.perfumes.map(x =>
          `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>` : ''}
      <div class="field-row">
        <label class="field"><span>Fecha</span><input type="date" id="uFecha" value="${editando ? editando.fecha : today()}" max="${today()}"></label>
        <label class="field"><span>Aplicaciones</span><input type="number" id="uSprays" min="1" max="20" step="1" value="${editando ? editando.sprays : 3}"></label>
      </div>
      <div class="field">
        <span>Ocasión</span>
        <div class="chips" id="uOcasion">${Object.keys(OCASIONES).map(k =>
          `<button type="button" class="chip${ocElegida === k ? ' on' : ''}" data-val="${k}">${OCASIONES[k]}</button>`).join('')}</div>
      </div>
      <label class="field"><span>Nota (opcional)</span><input id="uNota" value="${esc(editando ? (editando.nota || '') : '')}" placeholder="Duró poco, me lo elogiaron, etc."></label>
      <p class="hint">Cada aplicación descuenta ${S.ajustes.mlSpray} ml del frasco. Lo cambiás en Ajustes.</p>
      <div class="btn-row"><button type="submit" class="btn btn-accent">${editando ? 'Guardar cambios' : 'Guardar uso'}</button></div>
      ${editando ? `<div class="btn-row"><button type="button" class="btn btn-danger" data-borrar-uso="${editando.id}">Borrar este uso</button></div>` : ''}
    </form>`);

  $('#uOcasion').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    $$('#uOcasion .chip').forEach(x => x.classList.remove('on'));
    c.classList.add('on');
  });

  $('#formUso').addEventListener('submit', e => {
    e.preventDefault();
    const sprays = clamp(num($('#uSprays').value, 1), 1, 20);
    const oc = ($('#uOcasion .chip.on') || {}).dataset;
    const destinoId = $('#uPerfume') ? $('#uPerfume').value : p.id;

    if (editando) {
      // deshacer el descuento viejo antes de aplicar el nuevo
      aplicarMl(editando.perfumeId, editando.sprays, +1);
      editando.perfumeId = destinoId;
      editando.fecha = $('#uFecha').value || editando.fecha;
      editando.sprays = sprays;
      editando.ocasion = oc ? oc.val : editando.ocasion;
      editando.nota = $('#uNota').value.trim();
      aplicarMl(destinoId, sprays, -1);
    } else {
      S.usos.push({
        id: uid(),
        fecha: $('#uFecha').value || today(),
        perfumeId: p.id,
        sprays,
        ocasion: oc ? oc.val : ctx.ocasion,
        momento: ctx.momento,
        temp: ctx.temp,
        nota: $('#uNota').value.trim()
      });
      aplicarMl(p.id, sprays, -1);
    }

    guardar(); cerrarModal(); render();
    const destino = perfume(destinoId) || p;
    const pct = porcRestante(destino);
    toast(editando ? 'Uso actualizado'
      : (destino.ml > 0 && pct <= 15 ? `Anotado. Ojo: queda ${pct} % de ${destino.nombre}`
                                     : `Anotado: ${destino.nombre}`));
  });
}

/* ============================== NOTAS =============================== */
const filtroNotas = { texto: '', familia: '' };

function contarNotas(fuente) {
  const cuenta = {};
  fuente.forEach(p => notasDe(p).forEach(n => { cuenta[n] = (cuenta[n] || 0) + 1; }));
  return Object.keys(cuenta).map(n => ({ n, c: cuenta[n] })).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n));
}

function renderNotas() {
  // --- perfil olfativo: qué tenés y qué usás de verdad
  const total = S.perfumes.length;
  const porFam = D.FAMILIAS.map(f => {
    const tiene = S.perfumes.filter(p => p.familia === f.id);
    const usos = S.usos.filter(u => { const p = perfume(u.perfumeId); return p && p.familia === f.id; }).length;
    return { f, tiene: tiene.length, usos };
  }).filter(x => x.tiene > 0).sort((a, b) => b.tiene - a.tiene);

  const totalUsos = S.usos.length;
  if (!total) {
    $('#perfilSub').textContent = 'Cargá algunos perfumes y acá vas a ver qué familias y qué notas te gustan.';
    $('#perfilFamilias').innerHTML = '';
    $('#perfilNotas').innerHTML = '';
  } else {
    const dom = porFam[0];
    const masUsada = porFam.slice().sort((a, b) => b.usos - a.usos)[0];
    let sub = `${total} perfume${total === 1 ? '' : 's'}: mandan los ${dom.f.nombre.toLowerCase()}s.`;
    if (totalUsos >= 5 && masUsada && masUsada.f.id !== dom.f.id) {
      sub += ` Pero el que más te ponés es ${masUsada.f.nombre.toLowerCase()}: tenés una colección que no coincide con tu uso.`;
    }
    $('#perfilSub').textContent = sub;
    $('#perfilFamilias').innerHTML = porFam.map(x => barra(
      `${x.f.emoji} ${x.f.nombre}`,
      `${x.tiene} en la colección · ${x.usos} uso${x.usos === 1 ? '' : 's'}`,
      total ? (x.tiene / total) * 100 : 0, x.f.color)).join('');
    $('#perfilNotas').innerHTML = contarNotas(S.perfumes).slice(0, 12)
      .map(x => `<span class="tag" data-nota="${esc(x.n)}"><b>${esc(x.n)}</b> ${x.c}</span>`).join('');
  }

  // --- diccionario
  $('#filtroFamiliaNota').innerHTML = [{ id: '', nombre: 'Todas', emoji: '🗂' }].concat(D.FAMILIAS)
    .map(f => `<button class="chip${filtroNotas.familia === f.id ? ' on' : ''}" data-famnota="${f.id}">${f.emoji} ${esc(f.nombre)}</button>`).join('');

  const t = filtroNotas.texto.trim().toLowerCase();
  const notas = D.NOTAS.filter(n =>
    (!filtroNotas.familia || n.f === filtroNotas.familia) &&
    (!t || n.n.toLowerCase().includes(t) || n.d.toLowerCase().includes(t)));

  $('#listaNotas').innerHTML = notas.length ? notas.map(n => {
    const f = familia(n.f);
    const mios = S.perfumes.filter(p => notasDe(p).some(x => x.toLowerCase() === n.n.toLowerCase()));
    return `<article class="nota-item">
      <h3><i class="fam-dot" style="background:${f.color}"></i>${esc(n.n)}
        <span style="font-weight:400;color:var(--muted);font-size:12px">${esc(f.nombre)}</span></h3>
      <p>${esc(n.d)}</p>
      ${mios.length ? `<div class="mios">En tu colección: ${mios.map(p => esc(p.nombre)).join(' · ')}</div>` : ''}
    </article>`;
  }).join('') : `<div class="vacio">Ninguna nota coincide con la búsqueda.</div>`;

  // --- parecidos
  const sel = $('#simSel');
  const previo = sel.value;
  sel.innerHTML = S.perfumes.length
    ? S.perfumes.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')
    : '<option value="">—</option>';
  if (previo && S.perfumes.some(p => p.id === previo)) sel.value = previo;
  renderParecidos();
  renderComparar();
}

/* ------------------------- comparar dos ---------------------------- */
/* La pregunta real no es "cuál es mejor" sino "cuál de estos dos me pongo
   hoy", así que además de la ficha enfrentada se resuelve con el mismo
   puntaje que usa la pestaña Hoy, en el contexto elegido ahí.           */
let comparando = { a: null, b: null };

function renderComparar() {
  const selA = $('#cmpA'), selB = $('#cmpB');
  const lista = S.perfumes;

  if (lista.length < 2) {
    selA.innerHTML = selB.innerHTML = '<option value="">—</option>';
    $('#cmpSalida').innerHTML = '<div class="vacio">Con dos perfumes cargados se pueden comparar.</div>';
    return;
  }

  /* Solo se elige por vos la primera vez o si el perfume ya no existe. Si
     ponés el mismo de los dos lados, se respeta y se avisa: cambiarte la
     selección por atrás es peor que no comparar nada. */
  const existe = id => lista.some(x => x.id === id);
  if (!existe(comparando.a)) comparando.a = lista[0].id;
  if (!existe(comparando.b)) comparando.b = (lista.find(x => x.id !== comparando.a) || lista[0]).id;

  const opciones = sel => lista.map(x =>
    `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${esc(x.nombre)}</option>`).join('');
  selA.innerHTML = opciones(comparando.a);
  selB.innerHTML = opciones(comparando.b);

  const a = perfume(comparando.a), b = perfume(comparando.b);
  if (!a || !b) return;
  if (a.id === b.id) {
    $('#cmpSalida').innerHTML = '<div class="vacio">Elegí dos distintos.</div>';
    return;
  }
  $('#cmpSalida').innerHTML = tablaComparacion(a, b);
}

/* Compara un dato numérico marcando cuál gana. `mejor` dice si conviene el
   más alto o el más bajo; sin dato de alguno, no gana nadie. */
function filaNum(lbl, va, vb, fmt, mejor, ceroVale) {
  const hay = v => typeof v === 'number' && isFinite(v) && (ceroVale ? v >= 0 : v > 0);
  let ga = '', gb = '';
  if (hay(va) && hay(vb) && va !== vb) {
    const aGana = mejor === 'alto' ? va > vb : va < vb;
    ga = aGana ? ' class="gana"' : '';
    gb = aGana ? '' : ' class="gana"';
  }
  return `<div class="cmp-fila"><span>${esc(lbl)}</span>
    <div${ga}>${hay(va) ? fmt(va) : '—'}</div><div${gb}>${hay(vb) ? fmt(vb) : '—'}</div></div>`;
}
function filaTxt(lbl, ta, tb) {
  return `<div class="cmp-fila"><span>${esc(lbl)}</span>
    <div>${ta || '—'}</div><div>${tb || '—'}</div></div>`;
}

function tablaComparacion(a, b) {
  const m = modeloAprendido();
  const pa = puntuar(a, m), pb = puntuar(b, m);
  const sim = similitud(a, b);
  const moneda = S.ajustes.moneda;
  const plata = v => moneda + Math.round(v).toLocaleString('es-AR');
  const soloDe = (x, y) => {
    const otras = new Set(notasDe(y).map(n => n.toLowerCase()));
    return notasDe(x).filter(n => !otras.has(n.toLowerCase()));
  };
  const chips = arr => arr.length
    ? arr.map(n => `<span class="tag" data-nota="${esc(n)}">${esc(n)}</span>`).join('')
    : '<span class="hint">—</span>';

  const ganador = pa.score === pb.score ? null : (pa.score > pb.score ? a : b);
  const razonGanadora = (ganador === a ? pa : pb).razones.filter(r => r.bien)[0];

  return `<div class="cmp">
    <div class="cmp-head"><span></span>
      <b>${esc(a.nombre)}<br><span>${esc(a.casa)}</span></b>
      <b>${esc(b.nombre)}<br><span>${esc(b.casa)}</span></b></div>
    ${filaNum('Puntaje hoy', pa.score, pb.score, v => v, 'alto')}
    ${filaTxt('Familia', esc(familia(a.familia).nombre), esc(familia(b.familia).nombre))}
    ${filaTxt('Concentración', esc(a.conc || ''), esc(b.conc || ''))}
    ${filaNum('Duración', a.longevidad, b.longevidad, v => v + ' h', 'alto')}
    ${filaTxt('Estela', '▮'.repeat(a.estela || 0) + '▯'.repeat(5 - (a.estela || 0)),
              '▮'.repeat(b.estela || 0) + '▯'.repeat(5 - (b.estela || 0)))}
    ${filaTxt('Estaciones', (a.estaciones || []).map(nombreEstacion).join(', '),
              (b.estaciones || []).map(nombreEstacion).join(', '))}
    ${filaTxt('Ocasiones', (a.ocasiones || []).map(o => OCASIONES[o]).join(', '),
              (b.ocasiones || []).map(o => OCASIONES[o]).join(', '))}
    ${filaTxt('Momento', MOMENTOS[a.momento || 'ambos'], MOMENTOS[b.momento || 'ambos'])}
    ${filaNum('Tu puntaje', a.rating, b.rating, v => estrellas(v), 'alto')}
    ${filaNum('Queda', a.ml ? porcRestante(a) : 0, b.ml ? porcRestante(b) : 0, v => v + ' %', 'alto')}
    ${filaNum('Precio por ml', a.ml && a.precio ? a.precio / a.ml : 0, b.ml && b.precio ? b.precio / b.ml : 0, plata, 'bajo')}
    ${filaNum('Costo por uso', costoPorUso(a), costoPorUso(b), plata, 'bajo')}
    ${filaNum('Usos', usosDe(a.id).length, usosDe(b.id).length, v => v, 'alto', true)}
    ${filaTxt('Último uso', ultimoUso(a.id) ? fmtHace(ultimoUso(a.id)) : 'sin estrenar',
              ultimoUso(b.id) ? fmtHace(ultimoUso(b.id)) : 'sin estrenar')}
  </div>

  <div class="cmp-notas">
    <h3>Comparten ${sim.comunes.length} de ${new Set(notasDe(a).concat(notasDe(b)).map(n => n.toLowerCase())).size} notas · ${sim.pct} % de parecido</h3>
    <div class="tags">${chips(sim.comunes.map(n =>
      notasDe(a).find(x => x.toLowerCase() === n) || n))}</div>
    <h3>Solo ${esc(a.nombre)}</h3><div class="tags">${chips(soloDe(a, b))}</div>
    <h3>Solo ${esc(b.nombre)}</h3><div class="tags">${chips(soloDe(b, a))}</div>
  </div>

  <div class="cmp-veredicto">
    ${ganador
      ? `Para ${OCASIONES[ctx.ocasion].toLowerCase()}, ${MOMENTOS[ctx.momento].toLowerCase()} y ${Math.round(ctx.temp)}°: <b>${esc(ganador.nombre)}</b>, ${Math.max(pa.score, pb.score)} contra ${Math.min(pa.score, pb.score)}.${razonGanadora ? ' ' + esc(razonGanadora.txt) + '.' : ''}`
      : `Empatan en ${pa.score} para el contexto de hoy: elegí por gusto.`}
    <div class="hint">El contexto se cambia en la pestaña Hoy.</div>
  </div>`;
}

function barra(lbl, val, pct, color) {
  return `<div class="bar-row">
    <div class="bar-lbl">${esc(lbl)}</div><div class="bar-val">${esc(val)}</div>
    <div class="bar-track"><i style="width:${clamp(pct, 2, 100)}%${color ? `;background:${color}` : ''}"></i></div>
  </div>`;
}

/* Similitud de Jaccard: notas en común sobre el total de notas distintas.
   Es la medida más simple que capta "se parecen" sin inventar nada. */
function similitud(a, b) {
  const A = new Set(notasDe(a).map(n => n.toLowerCase()));
  const B = new Set(notasDe(b).map(n => n.toLowerCase()));
  if (!A.size || !B.size) return { pct: 0, comunes: [] };
  const comunes = [...A].filter(n => B.has(n));
  const union = new Set([...A, ...B]).size;
  return { pct: Math.round((comunes.length / union) * 100), comunes };
}

function renderParecidos() {
  const id = $('#simSel').value;
  const base = perfume(id);
  const cont = $('#simLista');
  if (!base) { cont.innerHTML = `<div class="vacio">Cargá al menos dos perfumes para comparar.</div>`; return; }
  const otros = S.perfumes.filter(p => p.id !== base.id)
    .map(p => Object.assign({ p }, similitud(base, p)))
    .filter(x => x.pct > 0)
    .sort((a, b) => b.pct - a.pct).slice(0, 5);
  cont.innerHTML = otros.length ? otros.map(x => `<div class="item" data-ficha="${x.p.id}" role="button" tabindex="0">
      <div class="it-main">
        <div class="it-name">${esc(x.p.nombre)}</div>
        <div class="it-sub">Comparten ${x.comunes.length}: ${esc(x.comunes.slice(0, 4).join(', '))}</div>
      </div>
      <div class="pf-right"><div class="pf-score">${x.pct}%</div><div class="pf-score-cap">parecido</div></div>
    </div>`).join('')
    : `<div class="vacio">No comparte notas con ningún otro de tu colección: es tu perfume más original.</div>`;
}

/* =============================== USO ================================ */
function renderUso() {
  renderAprendizaje(modeloAprendido());
  const hoyISO = today();
  const desdeMes = hoyISO.slice(0, 7);
  const delMes = S.usos.filter(u => u.fecha.slice(0, 7) === desdeMes);
  const ml = delMes.reduce((a, u) => a + u.sprays * S.ajustes.mlSpray, 0);

  const conteo = {};
  S.usos.filter(u => daysBetween(u.fecha, hoyISO) <= 90)
    .forEach(u => { conteo[u.perfumeId] = (conteo[u.perfumeId] || 0) + 1; });
  const ranking = Object.keys(conteo).map(id => ({ p: perfume(id), c: conteo[id] }))
    .filter(x => x.p).sort((a, b) => b.c - a.c);

  const conCosto = S.perfumes.map(costoPorUso).filter(c => c != null);
  const cpuProm = conCosto.length ? conCosto.reduce((a, b) => a + b, 0) / conCosto.length : null;

  $('#kpisUso').innerHTML = [
    ['Usos este mes', delMes.length],
    ['ml gastados', ml ? ml.toFixed(1) : '0'],
    ['El más puesto', ranking.length ? ranking[0].p.nombre : '—'],
    ['Costo por uso', cpuProm != null ? S.ajustes.moneda + Math.round(cpuProm).toLocaleString('es-AR') : '—']
  ].map(([t, v]) => `<div class="kpi"><b style="${String(v).length > 9 ? 'font-size:14px' : ''}">${esc(String(v))}</b><span>${t}</span></div>`).join('');

  const totalR = ranking.reduce((a, x) => a + x.c, 0);
  $('#rotacionSub').textContent = ranking.length
    ? `${totalR} usos en los últimos 90 días, repartidos en ${ranking.length} de tus ${S.perfumes.length} perfumes.`
    : 'Todavía no registraste ningún uso.';
  $('#rotacion').innerHTML = ranking.slice(0, 10).map(x => barra(
    x.p.nombre, `${x.c} uso${x.c === 1 ? '' : 's'} · ${Math.round((x.c / totalR) * 100)} %`,
    (x.c / ranking[0].c) * 100, familia(x.p.familia).color)).join('');

  // juntando polvo
  const polvo = S.perfumes.map(p => ({ p, ult: ultimoUso(p.id) }))
    .filter(x => {
      if (x.ult) return daysBetween(x.ult, hoyISO) >= 45;
      return x.p.creado ? daysBetween(x.p.creado, hoyISO) >= 30 : false;
    })
    .sort((a, b) => (a.ult || '0').localeCompare(b.ult || '0'));
  $('#cardPolvo').hidden = !polvo.length;
  $('#listaPolvo').innerHTML = polvo.map(x => `<div class="item" data-ficha="${x.p.id}" role="button" tabindex="0">
    <div class="it-main"><div class="it-name">${esc(x.p.nombre)}</div>
      <div class="it-sub">${x.ult ? 'Último uso ' + fmtHace(x.ult) : 'Sin estrenar desde que lo cargaste'}</div></div>
    <div class="it-act"><button data-usar="${x.p.id}" aria-label="Registrar uso">✓</button></div></div>`).join('');

  // se acaban
  const acabando = S.perfumes.filter(p => p.ml > 0 && porcRestante(p) <= 15 && p.mlRestante > 0)
    .sort((a, b) => porcRestante(a) - porcRestante(b));
  $('#cardAcabando').hidden = !acabando.length;
  $('#listaAcabando').innerHTML = acabando.map(p => `<div class="item" data-ficha="${p.id}" role="button" tabindex="0">
    <div class="it-main"><div class="it-name">${esc(p.nombre)}</div>
      <div class="it-sub">${Math.round(p.mlRestante)} ml · ${porcRestante(p)} % del frasco</div></div>
    <div class="pf-right"><div class="pf-score">${porcRestante(p)}%</div><div class="pf-score-cap">del frasco</div></div></div>`).join('');

  const hist = S.usos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);
  $('#historialUsos').innerHTML = hist.length ? hist.map(u => {
    const p = perfume(u.perfumeId);
    return `<div class="item" data-editar-uso="${u.id}" role="button" tabindex="0"><div class="it-main">
      <div class="it-name">${esc(p ? p.nombre : 'Perfume borrado')}</div>
      <div class="it-sub">${fmtFecha(u.fecha)} · ${OCASIONES[u.ocasion] || '—'} · ${u.sprays} aplicaciones</div>
    </div><div class="it-act"><button data-borrar-uso="${u.id}" aria-label="Borrar uso">🗑</button></div></div>`;
  }).join('') : `<div class="vacio">Cuando registres usos van a aparecer acá.</div>`;
}

/* ============================= AJUSTES ============================== */
function renderAjustes() {
  $('#setMlSpray').value = S.ajustes.mlSpray;
  $('#setMoneda').value = S.ajustes.moneda;
  $('#setHemisferio').value = S.ajustes.hemisferio;
  $('#setAprender').checked = S.ajustes.aprender !== false;
  $('#setClima').checked = !!S.ajustes.clima;
  const ver = $('#versionApp');
  if (ver) ver.textContent = 'Versión ' + VERSION;
  const c = S.meta.clima;
  $('#lugarActual').textContent = S.meta.lugar
    ? `${S.meta.lugar.nombre} (${S.meta.lugar.lat}, ${S.meta.lugar.lon})` +
      (c ? ` · ${Math.round(c.temp)}° hace ${minutosDesde(c.ts)} min` : ' · todavía sin datos')
    : 'Sin ubicación: la temperatura se carga a mano.';
  const hay = !!(window.PERFUMARIO_COLECCION && (window.PERFUMARIO_COLECCION.perfumes || []).length);
  $('#btnMiColeccion').hidden = !hay;
  const u = S.meta.ultimaCopia;
  $('#copiaEstado').textContent = u
    ? `Última copia: ${fmtHace(u)} (${fmtFecha(u)}).`
    : 'Nunca exportaste una copia.';
}

function exportar() {
  const texto = JSON.stringify(S, null, 2);
  abrirModal('Copia de seguridad', `
    <p class="sub">Copiá este texto y guardalo donde quieras (mail, notas, Drive). Para restaurarlo, usá “Importar copia”.</p>
    <label class="field"><textarea id="modalText" readonly style="min-height:180px;font-family:ui-monospace,monospace;font-size:11px">${esc(texto)}</textarea></label>
    <div class="btn-row">
      <button class="btn btn-accent" id="btnCopiar">Copiar al portapapeles</button>
      <button class="btn" id="btnDescargar">Descargar archivo</button>
    </div>`);
  $('#btnDescargar').addEventListener('click', descargarCopia);
  $('#btnCopiar').addEventListener('click', async () => {
    const ta = $('#modalText');
    try {
      await navigator.clipboard.writeText(ta.value);
      toast('Copiado');
    } catch (e) {
      ta.removeAttribute('readonly'); ta.select();
      toast('Seleccionalo y copialo a mano');
    }
    S.meta.ultimaCopia = today(); guardar(); renderAjustes(); avisoCopia();
  });
  S.meta.ultimaCopia = today(); guardar(); renderAjustes();
}

/* Copiar y pegar un JSON largo desde el teléfono es incómodo; un archivo se
   guarda en Archivos o se manda por mail de una.

   Dos caminos: dentro de la vista publicada, el navegador no deja que la
   página baje un archivo por su cuenta, y hay que pedírselo al anfitrión
   (la capacidad "downloads", que muestra su propia confirmación). En un
   navegador común, el enlace de toda la vida.                          */
function descargarCopia() {
  const nombre = `perfumario-${today()}.json`;
  const texto = JSON.stringify(S, null, 2);

  const anotarCopia = () => {
    S.meta.ultimaCopia = today(); guardar(); renderAjustes(); avisoCopia();
    toast('Copia descargada');
  };

  const porElAnfitrion = () => {
    if (!(window.claude && typeof window.claude.use === 'function')) return Promise.resolve(false);
    return Promise.resolve(window.claude.use('downloads'))
      .then(dl => dl ? Promise.resolve(dl.save({ filename: nombre, data: texto })).then(() => true) : false)
      .catch(() => false);
  };

  const porElNavegador = () => {
    try {
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) { return false; }
  };

  porElAnfitrion().then(listo => {
    if (listo) { anotarCopia(); return; }
    if (!enVistaPrevia() && porElNavegador()) { anotarCopia(); return; }
    toast('No pude descargar acá: copiá el texto');
  });
}

function importar() {
  abrirModal('Importar copia', `
    <p class="sub">Pegá acá el texto de una copia. Reemplaza todo lo que tengas guardado ahora.</p>
    <label class="field"><textarea id="modalText" placeholder='{"perfumes": …}' style="min-height:180px;font-family:ui-monospace,monospace;font-size:11px"></textarea></label>
    <div class="btn-row"><button class="btn btn-accent" id="btnConfirmarImp">Importar</button></div>`);
  $('#btnConfirmarImp').addEventListener('click', () => {
    let datos;
    try { datos = JSON.parse($('#modalText').value); }
    catch (e) { toast('Ese texto no es una copia válida'); return; }
    if (!datos || !Array.isArray(datos.perfumes)) { toast('A la copia le faltan los perfumes'); return; }
    S = Object.assign(clonar(DEFAULTS), datos);
    S.ajustes = Object.assign(clonar(DEFAULTS.ajustes), datos.ajustes || {});
    S.meta = Object.assign(clonar(DEFAULTS.meta), datos.meta || {});
    guardar(); cerrarModal(); render();
    toast(`Importados ${S.perfumes.length} perfumes y ${S.usos.length} usos`);
  });
}

function borrarTodo() {
  abrirModal('Borrar todo', `
    <p class="sub">Se van ${S.perfumes.length} perfumes y ${S.usos.length} usos. No hay vuelta atrás.</p>
    <div class="btn-row">
      <button class="btn" data-close>Mejor no</button>
      <button class="btn btn-danger" id="btnConfirmarBorrado">Sí, borrar todo</button>
    </div>`);
  $('#btnConfirmarBorrado').addEventListener('click', () => {
    S = clonar(DEFAULTS); guardar(); cerrarModal(); ir('hoy');
    toast('Listo, quedó vacío');
  });
}

/* Seis del catálogo con datos verosímiles y algunos usos hacia atrás,
   para poder mirar la app con contenido antes de cargar lo propio. */
function cargarEjemplos() {
  const elegidos = ['Bleu de Chanel', 'Acqua di Giò Profumo', 'Terre d’Hermès',
                    'Baccarat Rouge 540', 'Light Blue', 'Khamrah'];
  const precios = [180000, 165000, 150000, 480000, 95000, 70000];
  const mls = [100, 75, 100, 70, 100, 100];
  let nuevos = 0;
  elegidos.forEach((nombre, i) => {
    const c = D.CATALOGO.find(x => x.nombre === nombre);
    if (!c || S.perfumes.some(p => p.nombre === nombre)) return;
    const id = uid();
    S.perfumes.push({
      id, creado: addDays(today(), -60 + i * 7),
      nombre: c.nombre, casa: c.casa, conc: c.conc, familia: c.familia,
      salida: c.salida, corazon: c.corazon, fondo: c.fondo,
      ml: mls[i], mlRestante: mls[i] * (0.3 + (i % 4) * 0.2),
      precio: precios[i], comprado: addDays(today(), -120 + i * 10),
      longevidad: c.longevidad, estela: c.estela,
      estaciones: c.estaciones, ocasiones: c.ocasiones, momento: c.momento,
      rating: 5 - (i % 3), nota: ''
    });
    nuevos++;
    /* Usos repartidos hacia atrás. El quinto queda sin estrenar y el sexto
       abandonado hace más de dos meses, para que se vean las secciones de
       "juntando polvo" y de rotación con algo real adentro. */
    const cuantos = i === 4 ? 0 : 6 - i;
    const viejo = i === 5 ? 70 : 0;
    for (let k = 0; k < cuantos; k++) {
      S.usos.push({
        id: uid(), fecha: addDays(today(), -(k * 9 + i * 3 + 1 + viejo)), perfumeId: id,
        sprays: 3, ocasion: c.ocasiones[0] || 'casual', momento: c.momento,
        temp: ESTACIONES[estacionHoy()].temp, nota: ''
      });
    }
  });
  guardar(); render();
  toast(nuevos ? `Cargados ${nuevos} perfumes de ejemplo` : 'Ya los tenías cargados');
}

/* ============================== render ============================== */
function render() {
  const n = S.perfumes.length;
  const mes = S.usos.filter(u => u.fecha.slice(0, 7) === today().slice(0, 7)).length;
  $('#topbarSub').textContent = n
    ? `${n} perfume${n === 1 ? '' : 's'} · ${mes} uso${mes === 1 ? '' : 's'} este mes`
    : 'Tu colección, todavía vacía';
  if (vistaActual === 'hoy') renderHoy();
  if (vistaActual === 'coleccion') renderColeccion();
  if (vistaActual === 'notas') renderNotas();
  if (vistaActual === 'uso') renderUso();
  if (vistaActual === 'ajustes') renderAjustes();
}

/* ============================== eventos ============================= */
function conectar() {
  $$('.tab').forEach(t => t.addEventListener('click', () => ir(t.dataset.view)));
  $('#btnSettings').addEventListener('click', () => ir(vistaActual === 'ajustes' ? 'hoy' : 'ajustes'));

  // contexto de Hoy
  $('#ctxTemp').addEventListener('input', e => {
    ctx.temp = num(e.target.value, 20);
    ctx.manual = true;   // a partir de acá manda lo que elegiste vos
    $('#ctxTempOut').textContent = Math.round(ctx.temp) + '°';
  });
  $('#ctxTemp').addEventListener('change', renderHoy);
  $('#ctxMomento').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    ctx.momento = c.dataset.val; renderHoy();
  });
  $('#ctxOcasion').addEventListener('click', e => {
    const c = e.target.closest('.chip'); if (!c) return;
    ctx.ocasion = c.dataset.val;
    ctx.elegida = true;
    S.ajustes.ocasion = c.dataset.val;   // la próxima vez arranca donde la dejaste
    guardar();
    renderHoy();
  });
  $('#avisoCopia').addEventListener('click', () => { ir('ajustes'); exportar(); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#btnAjustarContexto')) return;
    const card = $('#cardContexto');
    card.hidden = !card.hidden;
    if (!card.hidden) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('#btnViaje').addEventListener('click', abrirViaje);

  // colección
  $('#btnNuevo').addEventListener('click', () => abrirFormulario(null));
  $('#btnLote').addEventListener('click', abrirLote);
  $('#busca').addEventListener('input', e => { filtros.texto = e.target.value; renderColeccion(); });
  $('#orden').addEventListener('change', e => { filtros.orden = e.target.value; renderColeccion(); });
  $('#soloDisponibles').addEventListener('change', e => { filtros.soloDisponibles = e.target.checked; renderColeccion(); });
  $('#filtroFamilia').addEventListener('click', e => {
    const c = e.target.closest('[data-fam]'); if (!c) return;
    filtros.familia = c.dataset.fam === filtros.familia ? '' : c.dataset.fam;
    renderColeccion();
  });

  // notas
  $('#buscaNota').addEventListener('input', e => { filtroNotas.texto = e.target.value; renderNotas(); });
  $('#filtroFamiliaNota').addEventListener('click', e => {
    const c = e.target.closest('[data-famnota]'); if (!c) return;
    filtroNotas.familia = c.dataset.famnota === filtroNotas.familia ? '' : c.dataset.famnota;
    renderNotas();
  });
  $('#simSel').addEventListener('change', renderParecidos);
  $('#cmpA').addEventListener('change', e => { comparando.a = e.target.value; renderComparar(); });
  $('#cmpB').addEventListener('change', e => { comparando.b = e.target.value; renderComparar(); });

  // ajustes
  $('#setMlSpray').addEventListener('change', e => {
    S.ajustes.mlSpray = clamp(num(e.target.value, 0.1), 0.01, 1); guardar(); renderAjustes();
  });
  $('#setMoneda').addEventListener('change', e => {
    S.ajustes.moneda = e.target.value.trim() || '$'; guardar(); render();
  });
  $('#setAprender').addEventListener('change', e => {
    S.ajustes.aprender = e.target.checked; guardar();
    toast(e.target.checked ? 'Vuelvo a mirar tu historial' : 'Sugerencias solo por reglas fijas');
  });
  $('#setHemisferio').addEventListener('change', e => {
    S.ajustes.hemisferio = e.target.value; guardar(); toast(`Ahora estás en ${nombreEstacion(estacionHoy())}`);
  });
  $('#setClima').addEventListener('change', e => {
    S.ajustes.clima = e.target.checked; guardar();
    if (e.target.checked && !S.meta.lugar) toast('Elegí una ciudad o usá tu ubicación');
    else if (e.target.checked) { ctx.manual = false; traerClima(true); }
    renderAjustes();
  });
  $('#btnUbicacion').addEventListener('click', usarUbicacion);

  let buscandoCiudad = null;
  $('#buscaCiudad').addEventListener('input', e => {
    const q = e.target.value.trim();
    clearTimeout(buscandoCiudad);
    if (q.length < 3) { $('#ciudadResultados').innerHTML = ''; return; }
    // esperar a que deje de escribir: una consulta por tecla es maltratar la API
    buscandoCiudad = setTimeout(() => {
      $('#ciudadResultados').innerHTML = '<p class="hint">Buscando…</p>';
      buscarCiudad(q).then(res => {
        $('#ciudadResultados').innerHTML = res.length
          ? res.map(r => `<button class="item" data-lat="${r.latitude}" data-lon="${r.longitude}"
              data-nombre="${esc(r.name)}${r.admin1 ? ', ' + esc(r.admin1) : ''}">
              <div class="it-main"><div class="it-name">${esc(r.name)}</div>
              <div class="it-sub">${esc([r.admin1, r.country].filter(Boolean).join(' · '))}</div></div></button>`).join('')
          : '<p class="hint">No encontré esa ciudad.</p>';
      }).catch(() => {
        $('#ciudadResultados').innerHTML = enVistaPrevia()
          ? '<p class="hint">Esa ciudad no está en la lista incluida, y esta vista previa no deja consultar el buscador online.</p>'
          : '<p class="hint">No pude buscar esa ciudad. ¿Hay internet?</p>';
      });
    }, 400);
  });
  $('#ciudadResultados').addEventListener('click', e => {
    const b = e.target.closest('[data-lat]');
    if (!b) return;
    fijarLugar(b.dataset.nombre, b.dataset.lat, b.dataset.lon);
    $('#buscaCiudad').value = ''; $('#ciudadResultados').innerHTML = '';
  });

  $('#btnExportar').addEventListener('click', exportar);
  $('#btnImportar').addEventListener('click', importar);
  $('#btnBorrar').addEventListener('click', borrarTodo);
  $('#btnEjemplos').addEventListener('click', cargarEjemplos);
  $('#btnMiColeccion').addEventListener('click', cargarMiColeccion);

  // modal
  $('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) cerrarModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) cerrarModal(); });

  // acciones que viven dentro de listas y fichas
  document.addEventListener('click', e => {
    const usar = e.target.closest('[data-usar]');
    if (usar) { e.stopPropagation(); abrirUso(usar.dataset.usar); return; }

    const editar = e.target.closest('[data-editar]');
    if (editar) { abrirFormulario(editar.dataset.editar); return; }

    const borrar = e.target.closest('[data-borrar]');
    if (borrar) { confirmarBorrado(borrar.dataset.borrar); return; }

    const comparar = e.target.closest('[data-comparar]');
    if (comparar) {
      const id = comparar.dataset.comparar;
      comparando.a = id;
      // arranca contra el más parecido: es la comparación que uno quiere ver
      const base = perfume(id);
      const rival = S.perfumes.filter(x => x.id !== id)
        .map(x => ({ x, pct: similitud(base, x).pct }))
        .sort((p, q) => q.pct - p.pct)[0];
      comparando.b = rival ? rival.x.id : null;
      cerrarModal(); ir('notas');
      const card = $('#cardComparar');
      if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const rellenar = e.target.closest('[data-rellenar]');
    if (rellenar) {
      const p = perfume(rellenar.dataset.rellenar);
      if (p) { p.mlRestante = p.ml; guardar(); cerrarModal(); render(); toast(`${p.nombre}: frasco lleno otra vez`); }
      return;
    }

    const bu = e.target.closest('[data-borrar-uso]');
    if (bu) {
      e.stopPropagation();
      const i = S.usos.findIndex(u => u.id === bu.dataset.borrarUso);
      if (i >= 0) {
        const u = S.usos[i];
        aplicarMl(u.perfumeId, u.sprays, +1);
        S.usos.splice(i, 1); guardar();
        if (!$('#modal').hidden) cerrarModal();
        render(); toast('Uso borrado');
      }
      return;
    }

    if (e.target.closest('#btnActivarClima')) { ir('ajustes'); $('#buscaCiudad').focus(); return; }
    if (e.target.closest('#btnRefrescarClima')) { ctx.manual = false; traerClima(true); return; }

    // el editar-uso va DESPUÉS del borrar: el botón de borrar vive dentro de la
    // fila editable, y si se evalúa primero la fila, el tacho deja de borrar
    const eu = e.target.closest('[data-editar-uso]');
    if (eu) { abrirUso(null, eu.dataset.editarUso); return; }

    const nota = e.target.closest('[data-nota]');
    if (nota) {
      cerrarModal();
      filtros.texto = nota.dataset.nota;
      $('#busca').value = nota.dataset.nota;
      ir('coleccion');
      return;
    }

    const ficha = e.target.closest('[data-ficha]');
    if (ficha) abrirFicha(ficha.dataset.ficha);
  });

  // accesibilidad: las tarjetas se abren también con Enter
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const f = e.target.closest && e.target.closest('[data-ficha]');
    if (f) { e.preventDefault(); abrirFicha(f.dataset.ficha); }
  });
}

function confirmarBorrado(id) {
  const p = perfume(id);
  if (!p) return;
  const n = usosDe(id).length;
  abrirModal('Borrar perfume', `
    <p class="sub">Se va ${esc(p.nombre)}${n ? ` y sus ${n} usos registrados` : ''}. No hay vuelta atrás.</p>
    <div class="btn-row">
      <button class="btn" data-close>Mejor no</button>
      <button class="btn btn-danger" id="btnConfDel">Sí, borrar</button>
    </div>`);
  $('#btnConfDel').addEventListener('click', () => {
    S.perfumes = S.perfumes.filter(x => x.id !== id);
    S.usos = S.usos.filter(u => u.perfumeId !== id);
    guardar(); cerrarModal(); render(); toast('Borrado');
  });
}

/* =============================== init =============================== */
/* La apertura se saca del DOM cuando termina: si queda, es un elemento
   invisible tapando la pantalla para siempre. */
(function cerrarApertura() {
  const sp = document.getElementById('splash');
  if (!sp) return;
  const chau = () => { if (sp.parentNode) sp.parentNode.removeChild(sp); };
  sp.addEventListener('animationend', e => { if (e.animationName === 'splashSale') chau(); });
  setTimeout(chau, 2000);   // por si el navegador no dispara el evento
})();

cargar();
conectar();
ir('hoy');

})();
