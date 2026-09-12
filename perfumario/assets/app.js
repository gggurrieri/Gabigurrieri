/* =====================================================================
   Perfumario
   Colección de perfumes, recomendador diario y enciclopedia de notas.
   Todo se guarda en localStorage: sin servidor, sin cuenta, sin red.
   ===================================================================== */
(function () {
'use strict';

const D = window.PERFUMARIO_DATOS;

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
  ajustes: { mlSpray: 0.1, moneda: '$', hemisferio: 'sur', aprender: true, clima: false },
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

function estacionDe(fecha) {
  const m = fromISO(fecha).getMonth(); // 0 = enero
  const sur = ['verano','verano','otono','otono','otono','invierno',
               'invierno','invierno','primavera','primavera','primavera','verano'];
  const norte = ['invierno','invierno','primavera','primavera','primavera','verano',
                 'verano','verano','otono','otono','otono','invierno'];
  return (S.ajustes.hemisferio === 'norte' ? norte : sur)[m];
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

/* ------------------------------ clima ------------------------------
   Open-Meteo: gratis, sin clave y con CORS abierto, así que la app lo
   consulta directo desde el navegador. Se le mandan solo las coordenadas
   de la ciudad elegida. Si no hay red, o si la página corre con una
   política que bloquea pedidos externos, se sigue con la temperatura a
   mano: el clima es una comodidad, no un requisito.                    */
const CLIMA_API = 'https://api.open-meteo.com/v1/forecast';
const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const CLIMA_VIGENCIA = 30; // minutos que vale un dato antes de volver a pedirlo

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
  const url = `${CLIMA_API}?latitude=${encodeURIComponent(lugar.lat)}&longitude=${encodeURIComponent(lugar.lon)}` +
    '&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto';

  return pedirJSON(url).then(d => {
    const c = d && d.current;
    if (!c || typeof c.temperature_2m !== 'number') throw new Error('respuesta sin temperatura');
    S.meta.clima = {
      temp: c.temperature_2m, humedad: c.relative_humidity_2m,
      codigo: c.weather_code, lugar: lugar.nombre, ts: new Date().toISOString()
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
  ctx.temp = c.temp;
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

function usarUbicacion() {
  if (!navigator.geolocation) { avisoUbicacion('Este navegador no da la ubicación.'); return; }
  avisoUbicacion('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(
    pos => fijarLugar('Mi ubicación', pos.coords.latitude.toFixed(3), pos.coords.longitude.toFixed(3)),
    err => {
      // 1 = permiso denegado, que es lo que pasa siempre dentro de un iframe
      if (err && err.code === 1 && enVistaPrevia())
        avisoUbicacion('Esta vista previa no permite la ubicación. Elegí tu ciudad de la lista de abajo.');
      else if (err && err.code === 1)
        avisoUbicacion('No diste permiso de ubicación. Elegí tu ciudad de la lista de abajo.');
      else
        avisoUbicacion('No pude ubicarte. Elegí tu ciudad de la lista de abajo.');
    },
    { timeout: 10000, maximumAge: 600000 }
  );
}

function avisoUbicacion(txt) {
  const e = $('#avisoUbicacion');
  if (e) { e.textContent = txt; e.hidden = false; }
  toast(txt);
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
  const vacio = { activo: false, ocFam: {}, ocPerf: {}, totOc: {}, share: {}, notasTop: [], usos: 0 };
  if (!S.ajustes.aprender || !S.perfumes.length) return vacio;

  const corte = addDays(today(), -VENTANA_APRENDIZAJE);
  const usos = S.usos.filter(u => u.fecha >= corte && perfume(u.perfumeId));
  if (usos.length < MIN_USOS_MODELO) return Object.assign(vacio, { usos: usos.length });

  // participación de cada familia en la colección = lo esperable al azar
  const share = {};
  S.perfumes.forEach(x => { const k = x.familia || 'sin'; share[k] = (share[k] || 0) + 1; });
  Object.keys(share).forEach(k => { share[k] = share[k] / S.perfumes.length; });

  const ocFam = {}, ocPerf = {}, totOc = {}, notas = {};
  usos.forEach(u => {
    const x = perfume(u.perfumeId), oc = u.ocasion || 'casual';
    totOc[oc] = (totOc[oc] || 0) + 1;
    ocFam[oc + '|' + (x.familia || 'sin')] = (ocFam[oc + '|' + (x.familia || 'sin')] || 0) + 1;
    ocPerf[oc + '|' + x.id] = (ocPerf[oc + '|' + x.id] || 0) + 1;
    notasDe(x).forEach(n => { const k = n.toLowerCase(); notas[k] = (notas[k] || 0) + 1; });
  });

  const notasTop = Object.keys(notas).map(n => ({ n, c: notas[n] }))
    .filter(x => x.c >= Math.max(2, Math.round(usos.length * 0.25)))
    .sort((a, b) => b.c - a.c).slice(0, 10);

  return { activo: true, ocFam, ocPerf, totOc, share, notasTop, usos: usos.length };
}

/* Puntaje de un perfume para el contexto actual.
   Devuelve {score, razones:[{txt, bien}]} para poder explicar la sugerencia:
   una recomendación que no se explica no se usa. */
function puntuar(p, m) {
  m = m || { activo: false };
  const est = estacionHoy();
  const razones = [];
  let score = 50;

  // estación
  const estaciones = (p.estaciones || []).map(claveEstacion);
  if (estaciones.length) {
    if (estaciones.includes(est)) {
      score += 18;
      razones.push({ txt: `Va con ${articuloEstacion(est)} ${nombreEstacion(est)}`, bien: true });
    } else {
      score -= 12;
      razones.push({ txt: `Lo marcaste para ${estaciones.map(nombreEstacion).join(' y ')}`, bien: false });
    }
  }

  // temperatura
  const ideal = TEMP_IDEAL[p.familia] != null ? TEMP_IDEAL[p.familia] : 18;
  const dif = Math.abs(ctx.temp - ideal);
  score -= Math.min(20, dif * 1.2);
  if (dif <= 4) razones.push({ txt: `${familia(p.familia).nombre} rinde bien con ${Math.round(ctx.temp)}°`, bien: true });
  else if (dif >= 12) razones.push({
    txt: ctx.temp > ideal ? `Con ${Math.round(ctx.temp)}° se puede volver pesado` : `Con ${Math.round(ctx.temp)}° se va a sentir poco`,
    bien: false });

  // momento del día
  const mom = p.momento || 'ambos';
  if (mom === ctx.momento) { score += 12; razones.push({ txt: `Lo tenés anotado para ${MOMENTOS[mom].toLowerCase()}`, bien: true }); }
  else if (mom === 'ambos') score += 4;
  else { score -= 10; razones.push({ txt: `Lo anotaste para ${MOMENTOS[mom].toLowerCase()}`, bien: false }); }

  // ocasión
  const oc = p.ocasiones || [];
  if (oc.length) {
    if (oc.includes(ctx.ocasion)) { score += 14; razones.push({ txt: `Sirve para ${OCASIONES[ctx.ocasion].toLowerCase()}`, bien: true }); }
    else score -= 8;
  }
  // estela según el lugar: en la oficina o haciendo deporte, mejor discreto
  const estela = p.estela || 3;
  if (ctx.ocasion === 'trabajo' || ctx.ocasion === 'deporte') {
    if (estela >= 5) { score -= 12; razones.push({ txt: 'Deja mucha estela para ese ambiente', bien: false }); }
    else if (estela <= 2) score += 5;
  }
  if (ctx.ocasion === 'evento' || ctx.ocasion === 'cita') {
    if (estela >= 4) { score += 8; razones.push({ txt: 'Tiene la presencia que pide la ocasión', bien: true }); }
  }

  // rotación: premia lo olvidado, castiga repetir
  const ult = ultimoUso(p.id);
  if (!ult) { score += 8; razones.push({ txt: 'Todavía no lo estrenaste', bien: true }); }
  else {
    const d = daysBetween(ult, today());
    if (d === 0) { score -= 30; razones.push({ txt: 'Es el que usaste hoy', bien: false }); }
    else if (d <= 2) { score -= 12; razones.push({ txt: `Lo usaste ${fmtHace(ult)}`, bien: false }); }
    else if (d >= 21) { score += 10; razones.push({ txt: `No lo usás desde ${fmtHace(ult)}`, bien: true }); }
  }

  // gusto personal y frasco
  if (p.rating) score += (p.rating - 3) * 4;
  const pct = porcRestante(p);
  if (p.ml > 0 && pct <= 10) { score -= 8; razones.push({ txt: `Queda ${pct} %: guardalo para algo que valga`, bien: false }); }

  // lo aprendido de tus elecciones anteriores
  if (m.activo) {
    const oc = ctx.ocasion, tot = m.totOc[oc] || 0;
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
  return S.perfumes
    .filter(p => !(p.ml > 0 && p.mlRestante <= 0))
    .map(p => Object.assign({ p }, puntuar(p, m)))
    .sort((a, b) => b.score - a.score || a.p.nombre.localeCompare(b.p.nombre))
    .slice(0, n || 3);
}

function renderHoy() {
  ctxInicial();
  const est = estacionHoy();
  $('#ctxTemp').value = ctx.temp;
  $('#ctxTempOut').textContent = Math.round(ctx.temp) + '°';
  $$('#ctxMomento .chip').forEach(c => c.classList.toggle('on', c.dataset.val === ctx.momento));
  $$('#ctxOcasion .chip').forEach(c => c.classList.toggle('on', c.dataset.val === ctx.ocasion));
  $('#contextoResumen').textContent =
    `${ESTACIONES[est].emoji} Estamos en ${nombreEstacion(est)} · ${MOMENTOS[ctx.momento]} · ${OCASIONES[ctx.ocasion]}`;
  renderClima();
  traerClima();

  const modelo = modeloAprendido();
  const cont = $('#sugerencias');
  if (!S.perfumes.length) {
    cont.innerHTML = `<div class="vacio">Todavía no cargaste ningún perfume.<br>
      Andá a <b>Colección → Agregar</b>, o cargá seis de ejemplo desde Ajustes.</div>`;
  } else {
    cont.innerHTML = sugerir(3, modelo).map((s, i) => fichaSugerencia(s, i)).join('');
  }
  renderAprendizaje(modelo);

  // lo que ya te pusiste hoy
  const hoy = S.usos.filter(u => u.fecha === today());
  $('#cardHoyUsos').hidden = !hoy.length;
  $('#hoyUsos').innerHTML = hoy.map(u => {
    const p = perfume(u.perfumeId);
    return `<div class="item"><div class="it-main">
        <div class="it-name">${esc(p ? p.nombre : 'Perfume borrado')}</div>
        <div class="it-sub">${u.sprays} aplicaciones · ${OCASIONES[u.ocasion] || '—'}</div>
      </div>
      <div class="it-act"><button data-borrar-uso="${u.id}" aria-label="Borrar uso">🗑</button></div></div>`;
  }).join('');

  avisoCopia();
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
  l.innerHTML =
    `${emo} <b>${Math.round(c.temp)}°</b> · ${esc(txt)} en ${esc(c.lugar)} · ` +
    `${mins < 1 ? 'recién' : 'hace ' + mins + ' min'} ` +
    `<button class="link" id="btnRefrescarClima">Actualizar</button>` +
    (ctx.manual ? ` <span class="hint">· estás usando ${Math.round(ctx.temp)}° a mano</span>` : '') +
    (c.humedad >= 70 ? `<div class="hint">Humedad ${c.humedad} %: proyecta más de lo normal, con dos aplicaciones alcanza.</div>` : '');
}

function fichaSugerencia(s, i) {
  const p = s.p, f = familia(p.familia);
  // primero lo aprendido: es lo que distingue esta sugerencia de una regla fija
  const ordenadas = s.razones.slice().sort((a, b) => (b.aprendido ? 1 : 0) - (a.aprendido ? 1 : 0));
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
      <div class="pf-right"><div class="pf-score">${s.score}</div>${p.ml > 0 ? pct + ' %' : ''}</div>
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
      ${us.slice(0, 8).map(u => `<div class="item"><div class="it-main">
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

/* -------------------------- registrar uso -------------------------- */
function abrirUso(id) {
  const p = perfume(id);
  if (!p) return;
  ctxInicial();
  abrirModal('Registrar uso', `
    <p class="sub">${esc(p.nombre)} · ${esc(p.casa)}</p>
    <form id="formUso">
      <div class="field-row">
        <label class="field"><span>Fecha</span><input type="date" id="uFecha" value="${today()}" max="${today()}"></label>
        <label class="field"><span>Aplicaciones</span><input type="number" id="uSprays" min="1" max="20" step="1" value="3"></label>
      </div>
      <div class="field">
        <span>Ocasión</span>
        <div class="chips" id="uOcasion">${Object.keys(OCASIONES).map(k =>
          `<button type="button" class="chip${ctx.ocasion === k ? ' on' : ''}" data-val="${k}">${OCASIONES[k]}</button>`).join('')}</div>
      </div>
      <label class="field"><span>Nota (opcional)</span><input id="uNota" placeholder="Duró poco, me lo elogiaron, etc."></label>
      <p class="hint">Cada aplicación descuenta ${S.ajustes.mlSpray} ml del frasco. Lo cambiás en Ajustes.</p>
      <div class="btn-row"><button type="submit" class="btn btn-accent">Guardar uso</button></div>
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
    if (p.ml > 0) p.mlRestante = clamp(p.mlRestante - sprays * S.ajustes.mlSpray, 0, p.ml);
    guardar(); cerrarModal(); render();
    const pct = porcRestante(p);
    toast(p.ml > 0 && pct <= 15
      ? `Anotado. Ojo: queda ${pct} % de ${p.nombre}`
      : `Anotado: ${p.nombre}`);
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
      <div class="pf-score">${x.pct}%</div>
    </div>`).join('')
    : `<div class="vacio">No comparte notas con ningún otro de tu colección: es tu perfume más original.</div>`;
}

/* =============================== USO ================================ */
function renderUso() {
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
    <div class="pf-score">${porcRestante(p)}%</div></div>`).join('');

  const hist = S.usos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 20);
  $('#historialUsos').innerHTML = hist.length ? hist.map(u => {
    const p = perfume(u.perfumeId);
    return `<div class="item"><div class="it-main">
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
  const c = S.meta.clima;
  $('#lugarActual').textContent = S.meta.lugar
    ? `${S.meta.lugar.nombre}${c ? ` · ${Math.round(c.temp)}° hace ${minutosDesde(c.ts)} min` : ' · todavía sin datos'}`
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
    <div class="btn-row"><button class="btn btn-accent" id="btnCopiar">Copiar al portapapeles</button></div>`);
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
    ctx.ocasion = c.dataset.val; renderHoy();
  });
  $('#avisoCopia').addEventListener('click', () => { ir('ajustes'); exportar(); });

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
        const u = S.usos[i], p = perfume(u.perfumeId);
        if (p && p.ml > 0) p.mlRestante = clamp(p.mlRestante + u.sprays * S.ajustes.mlSpray, 0, p.ml);
        S.usos.splice(i, 1); guardar();
        if (!$('#modal').hidden) cerrarModal();
        render(); toast('Uso borrado');
      }
      return;
    }

    if (e.target.closest('#btnActivarClima')) { ir('ajustes'); $('#buscaCiudad').focus(); return; }
    if (e.target.closest('#btnRefrescarClima')) { ctx.manual = false; traerClima(true); return; }

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
cargar();
conectar();
ir('hoy');

})();
