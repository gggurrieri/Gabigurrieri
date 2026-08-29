/* =====================================================================
   Desafío 90 · Bici + Soga
   App de entrenamiento y seguimiento. Todo se guarda en localStorage.
   ===================================================================== */
(function () {
'use strict';

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

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
// Lunes = 0 … Domingo = 6
const dowIndex = iso => (fromISO(iso).getDay() + 6) % 7;
const mondayOf = iso => addDays(iso, -dowIndex(iso));

function fmtDate(iso) {
  const d = fromISO(iso);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${DAYS_SHORT[dowIndex(iso)]} ${d.getDate()} ${meses[d.getMonth()]}`;
}
function fmtSecs(s) {
  if (s >= 60 && s % 60 === 0) return (s / 60) + "'";
  if (s > 60) return Math.floor(s / 60) + "'" + pad(s % 60) + '"';
  return s + '"';
}
function fmtMin(m) {
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------ estado ----------------------------- */
const KEY = 'desafio90_v1';

/* structuredClone recién existe desde Safari 15.4; sin este respaldo la app
   no arranca en un iPhone con iOS más viejo. */
const clonar = o => (typeof structuredClone === 'function'
  ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

const DEFAULTS = {
  profile: {
    name: '', age: 32, sex: 'm', height: 176,
    startWeight: 91, goalWeight: 83,
    startDate: today(), footballDay: 5, restDay: 6, hrMax: 0
  },
  sessions: [],   // {id,date,type,minutes,intensity,distance,jumps,rpe,mood,notes,kcal}
  weights: [],    // {date,kg}
  tests: [],      // {date,bike,jumps,plank}
  done: {}        // {"w1-0": true}
};

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clonar(DEFAULTS);
    const parsed = JSON.parse(raw);
    const prof = Object.assign({}, DEFAULTS.profile, parsed.profile);
    if (parsed.profile && parsed.profile.restDay == null) {
      // Antes el fútbol caía el domingo y no había día de descanso fijo.
      prof.footballDay = 5; prof.restDay = 6;
    }
    return {
      profile: prof,
      sessions: parsed.sessions || [],
      weights: parsed.weights || [],
      tests: parsed.tests || [],
      done: parsed.done || {}
    };
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento local', e);
    return clonar(DEFAULTS);
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast('No se pudo guardar (almacenamiento lleno o bloqueado)'); }
}

/* ------------------------- plan de 12 semanas ---------------------- */
/* on/off en segundos. r = repeticiones. */
const WEEKS = [
  { w: 1,  block: 'Adaptación',  z2: 30, long: 35, ints: null,
    ropeA: { r: 6, on: 30, off: 60 }, ropeB: { r: 6, on: 30, off: 60 }, ropeBOpt: true,
    tip: 'Objetivo de esta semana: aparecer. Nada más. Terminá cada sesión con la sensación de que podías hacer un poco más — esa es exactamente la dosis correcta al arrancar.' },
  { w: 2,  block: 'Adaptación',  z2: 35, long: 40, ints: { r: 5, on: 60, off: 120 },
    ropeA: { r: 8, on: 30, off: 60 }, ropeB: { r: 6, on: 40, off: 60 },
    tip: 'Entran los primeros intervalos en bici. "Fuerte" no es esprintar: es un ritmo que podrías sostener 5 minutos y no más.' },
  { w: 3,  block: 'Adaptación',  deload: true, z2: 30, long: 45, ints: null,
    ropeA: { r: 8, on: 30, off: 60 }, ropeB: null,
    tip: 'Semana de descarga. Baja la intensidad pero sube el rodaje largo: es el que más grasa moviliza y el que menos te castiga.' },
  { w: 4,  block: 'Construcción', z2: 40, long: 50, ints: { r: 6, on: 60, off: 120 },
    ropeA: { r: 8, on: 45, off: 60 }, ropeB: { r: 8, on: 45, off: 60 },
    tip: 'Empieza el bloque fuerte. Dormir 7-8 horas ahora vale tanto como una sesión extra.' },
  { w: 5,  block: 'Construcción', z2: 40, long: 55, ints: { r: 8, on: 60, off: 120 },
    ropeA: { r: 10, on: 45, off: 60 }, ropeB: { r: 8, on: 60, off: 60 },
    tip: 'Primera vez con series de 1 minuto completo de soga. Si los gemelos protestan, acortá la serie antes que perder la técnica.' },
  { w: 6,  block: 'Construcción', deload: true, z2: 35, long: 45, ints: { r: 5, on: 60, off: 120 },
    ropeA: { r: 8, on: 45, off: 75 }, ropeB: null, test: 'medio',
    tip: 'Descarga y punto de control: repetí el test y pesate. Mitad del camino.' },
  { w: 7,  block: 'Intensidad',  z2: 45, long: 60, ints: { r: 6, on: 120, off: 120 },
    ropeA: { r: 3, on: 180, off: 90 }, ropeB: { r: 10, on: 45, off: 45 },
    tip: 'Los bloques de 3 minutos de soga son el salto de calidad del plan. Ritmo constante, bajito, sin apurar.' },
  { w: 8,  block: 'Intensidad',  z2: 45, long: 65, ints: { r: 8, on: 120, off: 120 },
    ropeA: { r: 4, on: 180, off: 90 }, ropeB: { r: 12, on: 45, off: 45 },
    tip: 'La semana más exigente hasta acá. Si tenés que sacar algo, sacá la sesión de fuerza, no la bici larga.' },
  { w: 9,  block: 'Intensidad',  deload: true, z2: 40, long: 50, ints: { r: 5, on: 120, off: 120 },
    ropeA: { r: 3, on: 180, off: 120 }, ropeB: null,
    tip: 'Descarga antes del bloque final. Aprovechá para estirar y hacer un poco de movilidad de cadera y tobillo.' },
  { w: 10, block: 'Pico',        z2: 50, long: 70, ints: { r: 5, on: 240, off: 180 },
    ropeA: { r: 4, on: 180, off: 75 }, ropeB: { r: 15, on: 40, off: 40 },
    tip: 'Intervalos de 4 minutos: los más rentables para la resistencia. Arrancá conservador, el último tiene que ser el más fuerte.' },
  { w: 11, block: 'Pico',        z2: 50, long: 75, ints: { r: 6, on: 240, off: 180 },
    ropeA: { r: 5, on: 180, off: 75 }, ropeB: { r: 4, on: 240, off: 90 },
    tip: 'Pico de volumen del desafío. Comé bien e hidratate: esta semana no se improvisa.' },
  { w: 12, block: 'Cierre',      z2: 40, long: 60, ints: null, finalTest: true,
    ropeA: { r: 3, on: 120, off: 90 }, ropeB: null,
    tip: 'Semana de tests. Bajá el volumen, descansá bien y medí todo: peso, 12 minutos en bici, saltos en 1 minuto y plancha.' }
];

const CORE = 'Circuito de fuerza, 3 vueltas: sentadillas x15 · flexiones (pueden ser con las manos elevadas) x8-12 · puente de glúteos x15 · plancha 30-45" · superman x12. Descansá 60" entre vueltas.';

const ICON = { bici: '🚴', soga: '🪢', futbol: '⚽', fuerza: '💪', movilidad: '🚶', descanso: '😴', otro: '✳️' };

function ropeText(x) {
  return `${x.r} × ${fmtSecs(x.on)} saltando / ${fmtSecs(x.off)} de pausa (${fmtSecs(x.r * x.on)} de salto total)`;
}
function ropeMinutes(x) { return Math.round(x.r * (x.on + x.off) / 60) + 5; }
/* MET promedio de una sesión: solo el tiempo saltando vale 11,8; las pausas,
   la entrada en calor y el circuito de fuerza valen ~4,5. */
function blendMet(jumpSecs, totalMin) {
  const jm = jumpSecs / 60;
  return (jm * 11.8 + Math.max(0, totalMin - jm) * 4.5) / totalMin;
}
function intText(x) {
  return `${x.r} × ${fmtSecs(x.on)} fuerte / ${fmtSecs(x.off)} suave`;
}
function intMinutes(x) { return Math.round(12 + x.r * (x.on + x.off) / 60 + 6); }

/* Construye las 7 sesiones de una semana (índice 0 = lunes).

   La semana se ordena alrededor de dos días fijos que elegís vos: el del
   partido y el de descanso total. Los cinco días restantes se llenan en este
   orden, arrancando el día siguiente al descanso, para que nunca queden dos
   sesiones duras pegadas y la víspera del partido sea siempre suave. */
function buildWeek(wn) {
  const p = WEEKS[wn - 1];

  const suave = { type: 'bici', title: `Bici suave · ${p.z2} min`, minutes: p.z2,
    detail: 'Ritmo cómodo y continuo (RPE 3-4): podés hablar de corrido todo el rato. Cadencia alta y ligera, no fuerces el plato.' };

  const minA = p.ropeA ? ropeMinutes(p.ropeA) + 12 : 0;
  const sogaA = p.ropeA
    ? { type: 'soga', title: `Soga · ${p.ropeA.r} series + fuerza`, minutes: minA,
        met: blendMet(p.ropeA.r * p.ropeA.on, minA),
        detail: `5 min de entrada en calor (movilidad de tobillo y saltos sin soga). Después ${ropeText(p.ropeA)}. Cerrá con: ${CORE}` }
    : { type: 'fuerza', title: 'Fuerza y core', minutes: 25, detail: CORE };

  const larga = { type: 'bici', title: `Bici larga · ${p.long} min`, minutes: p.long,
    detail: 'La sesión más importante de la semana para bajar de peso. Ritmo cómodo y constante de principio a fin. Llevá agua y, si pasás la hora, algo para comer.' };

  let intervalos;
  if (p.finalTest) {
    intervalos = { type: 'bici', title: 'TEST · 12 minutos máximos', minutes: 35,
      detail: 'Calentá 15 min. Después andá 12 minutos a la máxima intensidad que puedas sostener sin explotar, y anotá los km recorridos en Progreso → Test de control. Aflojá 8 min al final.' };
  } else if (p.ints) {
    intervalos = { type: 'bici', title: `Bici intervalos · ${intText(p.ints)}`, minutes: intMinutes(p.ints),
      detail: `12 min de calentamiento progresivo. Después ${intText(p.ints)} — en los tramos fuertes vas a RPE 7-8, en los suaves pedaleás casi sin resistencia. 6 min de vuelta a la calma.` };
  } else {
    intervalos = { type: 'bici', title: `Bici suave · ${Math.round(p.z2 * 0.8)} min`, minutes: Math.round(p.z2 * 0.8),
      detail: 'Segunda salida tranquila de la semana. Todavía estamos construyendo base: sin intervalos, solo rodar.' };
  }

  const minB = p.ropeB ? ropeMinutes(p.ropeB) + 10 : 0;
  const ligero = p.ropeB
    ? { type: 'soga', title: `Soga · ${p.ropeB.r} series + core`, minutes: minB,
        met: blendMet(p.ropeB.r * p.ropeB.on, minB), eve: true,
        detail: `${ropeText(p.ropeB)}. Después 2 vueltas del circuito de fuerza. Es la víspera del partido: si llegás cargado, cambiala por una caminata.` }
    : { type: 'movilidad', title: 'Movilidad y caminata', minutes: 30, optional: true, eve: true,
        detail: 'Víspera de partido en semana de descarga: nada de impacto. Caminata a paso vivo, movilidad de cadera y tobillo, y elongación de gemelos y cuádriceps.' };

  const futbol = { type: 'futbol', title: 'Fútbol', minutes: 60,
    detail: 'Tu partido de siempre. Entrá en calor 10 minutos antes de arrancar — es el día con más riesgo de tirón de toda la semana.' };

  const descanso = { type: 'descanso', title: 'Descanso total', minutes: 0, rest: true,
    detail: 'Día libre después del partido. El descanso no es lo que interrumpe el progreso: es donde pasa. Comé bien, hidratate y dormí.' };

  const fd = clamp(Number(S.profile.footballDay), 0, 6);
  let rd = clamp(Number(S.profile.restDay), 0, 6);
  if (rd === fd) rd = (fd + 1) % 7;

  const week = new Array(7);
  week[fd] = futbol;
  week[rd] = descanso;

  const roles = [suave, sogaA, larga, intervalos, ligero];
  let i = 0;
  for (let k = 1; k <= 7 && i < roles.length; k++) {
    const d = (rd + k) % 7;
    if (!week[d]) week[d] = roles[i++];
  }

  return week.map((x, idx) => Object.assign({}, x, { id: `w${wn}-${idx}`, day: idx, week: wn }));
}

function currentWeek() {
  const d = daysBetween(S.profile.startDate, today());
  return clamp(Math.floor(d / 7) + 1, 1, 12);
}
function currentDay() {
  return clamp(daysBetween(S.profile.startDate, today()) + 1, 1, 84);
}

/* ----------------------------- cálculos ---------------------------- */
const MET = { bici: 7.0, soga: 11.8, futbol: 8.0, fuerza: 5.0, movilidad: 3.5, otro: 6.0 };
const INT_MULT = { suave: 0.8, moderado: 1.0, fuerte: 1.28 };

function kcal(type, intensity, minutes, kg) {
  const met = (MET[type] || 6) * (INT_MULT[intensity] || 1);
  return Math.round(met * kg * (minutes / 60));
}
function currentWeight() {
  if (S.weights.length) {
    const sorted = S.weights.slice().sort((a, b) => a.date < b.date ? 1 : -1);
    return sorted[0].kg;
  }
  return S.profile.startWeight;
}
function bmi(kg) { const h = S.profile.height / 100; return kg / (h * h); }
function bmiLabel(v) {
  if (v < 18.5) return 'bajo peso';
  if (v < 25) return 'normal';
  if (v < 30) return 'sobrepeso';
  return 'obesidad';
}
function bmr(kg) {
  const p = S.profile;
  return Math.round(10 * kg + 6.25 * p.height - 5 * p.age + (p.sex === 'm' ? 5 : -161));
}
/* Gasto base (sin entrenar) + promedio real de lo que estás entrenando.
   Se separa así para no contar dos veces las calorías de las sesiones. */
function baseExpenditure(kg) { return Math.round(bmr(kg) * 1.35); }
function avgTrainingKcal(days) {
  const from = addDays(today(), -(days - 1));
  const sum = S.sessions.filter(s => s.date >= from).reduce((a, b) => a + (b.kcal || 0), 0);
  return Math.round(sum / days);
}
function tdee(kg) { return baseExpenditure(kg) + avgTrainingKcal(14); }

/* ---- frecuencia cardíaca ----
   Sin FC máxima medida se estima con Tanaka (208 - 0,7 x edad), más fiable
   que el viejo 220 - edad para mayores de 30. */
function hrMax() { return S.profile.hrMax || Math.round(208 - 0.7 * S.profile.age); }

const ZONES = [
  { n: 1, name: 'Recuperación', lo: 0.50, hi: 0.60, color: 'var(--movilidad)',
    use: 'Caminatas y vuelta a la calma. No entrena, pero acelera la recuperación.' },
  { n: 2, name: 'Base aeróbica', lo: 0.60, hi: 0.70, color: 'var(--bici)',
    use: 'Tu zona principal: la bici suave y la larga van acá. Es donde más grasa usás como combustible.' },
  { n: 3, name: 'Aeróbico fuerte', lo: 0.70, hi: 0.80, color: 'var(--good)',
    use: 'Ritmo sostenido incómodo. Aparece sola en la bici larga y en el fútbol.' },
  { n: 4, name: 'Umbral', lo: 0.80, hi: 0.90, color: 'var(--soga)',
    use: 'Los tramos fuertes de los intervalos y las series largas de soga.' },
  { n: 5, name: 'Máximo', lo: 0.90, hi: 1.01, color: 'var(--accent)',
    use: 'Solo picos cortos. Si vivís acá, estás entrenando de más.' }
];

function zoneOf(hr) {
  const r = hr / hrMax();
  if (r < ZONES[0].lo) return 0;
  for (let i = ZONES.length - 1; i >= 0; i--) if (r >= ZONES[i].lo) return i + 1;
  return 0;
}

/* Calorías a partir del pulso medio (Keytel et al., 2005). Bastante más
   ajustado que los METs cuando el reloj te dio la FC real de la sesión. */
function kcalFromHr(hrAvg, minutes, kg) {
  const a = S.profile.age;
  const perMin = S.profile.sex === 'm'
    ? (-55.0969 + 0.6309 * hrAvg + 0.1988 * kg + 0.2017 * a) / 4.184
    : (-20.4022 + 0.4472 * hrAvg - 0.1263 * kg + 0.0740 * a) / 4.184;
  return Math.max(0, Math.round(perMin * minutes));
}

/* Orden de preferencia: lo que midió el reloj, después el pulso medio, y
   como último recurso los METs. Respetar el número del reloj evita que la
   app y Zepp muestren cifras distintas de la misma sesión. */
function sessionKcal(o, kg) {
  kg = kg || currentWeight();
  if (o.watchKcal) return o.watchKcal;
  if (o.hrAvg) return kcalFromHr(o.hrAvg, o.minutes, kg);
  return kcal(o.type, o.intensity, o.minutes, kg);
}
function kcalSource(o) {
  if (o.watchKcal) return 'del reloj';
  if (o.hrAvg) return 'por pulso';
  return '';
}

/* Media móvil por ventana de días reales (x = día del desafío), no por
   cantidad de registros: si te pesás salteado la tendencia sigue siendo correcta. */
function movingAvg(points, winDays) {
  return points.map(pt => {
    const slice = points.filter(q => q.x <= pt.x && q.x > pt.x - winDays);
    return { x: pt.x, y: slice.reduce((a, b) => a + b.y, 0) / slice.length };
  });
}

function stats() {
  const st = { count: S.sessions.length, minutes: 0, kcal: 0, km: 0, jumps: 0, byType: {} };
  S.sessions.forEach(s => {
    st.minutes += s.minutes || 0;
    st.kcal += s.kcal || 0;
    st.km += s.distance || 0;
    st.jumps += s.jumps || 0;
    st.byType[s.type] = (st.byType[s.type] || 0) + 1;
  });
  st.streak = streak();
  st.lost = S.profile.startWeight - currentWeight();
  st.perfectWeeks = perfectWeeks();
  return st;
}
function datesWithSession() { return new Set(S.sessions.map(s => s.date)); }
function streak() {
  const set = datesWithSession();
  if (!set.size) return 0;
  let d = today(), n = 0;
  if (!set.has(d)) d = addDays(d, -1);
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
function perfectWeeks() {
  // semanas del plan con todas las sesiones no opcionales marcadas
  let n = 0;
  for (let w = 1; w <= 12; w++) {
    const req = buildWeek(w).filter(s => !s.optional && !s.rest);
    if (req.length && req.every(s => S.done[s.id])) n++;
  }
  return n;
}
function weekSummary() {
  const mon = mondayOf(today());
  const ses = S.sessions.filter(s => s.date >= mon && s.date <= addDays(mon, 6));
  return {
    count: ses.length,
    minutes: ses.reduce((a, b) => a + (b.minutes || 0), 0),
    kcal: ses.reduce((a, b) => a + (b.kcal || 0), 0)
  };
}

/* -------------------- importar actividades del reloj ----------------
   Zepp exporta cada actividad como GPX, TCX o FIT. Leemos los dos formatos
   XML; el binario FIT necesitaría una librería y queda afuera a propósito
   para que la app siga sin dependencias. */

function byLocal(root, name) {
  const out = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) out.push(all[i]);
  return out;
}
const num = (el, d) => { const v = el && parseFloat(el.textContent); return isFinite(v) ? v : (d || 0); };

const SPORT_MAP = [
  [/(cycl|bik|ride|bici|spin)/i, 'bici'],
  [/(rope|skip|soga|salt)/i, 'soga'],
  [/(soccer|football|f[uú]tbol)/i, 'futbol'],
  [/(strength|weight|gym|fuerza|elliptical)/i, 'fuerza'],
  [/(walk|hik|camin)/i, 'movilidad']
];
function guessType(label, km, minutes) {
  for (const [re, t] of SPORT_MAP) if (re.test(label || '')) return t;
  if (km > 3 && minutes > 0) {
    const kmh = km / (minutes / 60);
    if (kmh >= 9 && kmh <= 50) return 'bici';
  }
  return 'otro';
}

function haversine(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const la1 = a.lat * rad, la2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Acumula segundos por zona a partir de una serie de {t, hr}. */
function zonesFromSamples(samples) {
  const secs = [0, 0, 0, 0, 0];
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].t - samples[i - 1].t) / 1000;
    if (!(dt > 0) || dt > 120) continue;
    const hr = samples[i - 1].hr;
    if (!hr) continue;
    const z = zoneOf(hr);
    if (z) secs[z - 1] += dt;
  }
  return secs.map(v => Math.round(v / 60));
}
function hrStats(samples) {
  let sum = 0, n = 0, max = 0;
  samples.forEach(s => { if (s.hr) { sum += s.hr; n++; if (s.hr > max) max = s.hr; } });
  return { avg: n ? Math.round(sum / n) : 0, max };
}

function parseGpx(doc, fileName) {
  const pts = byLocal(doc, 'trkpt');
  if (!pts.length) return null;
  let km = 0, prev = null;
  const samples = [];
  pts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat')), lon = parseFloat(pt.getAttribute('lon'));
    const tEl = byLocal(pt, 'time')[0];
    const t = tEl ? Date.parse(tEl.textContent) : NaN;
    const hrEl = byLocal(pt, 'hr')[0];
    const hr = hrEl ? parseInt(hrEl.textContent, 10) : 0;
    if (isFinite(lat) && isFinite(lon)) {
      const cur = { lat, lon };
      if (prev) km += haversine(prev, cur);
      prev = cur;
    }
    if (isFinite(t)) samples.push({ t, hr });
  });
  if (!samples.length) return null;
  const minutes = Math.max(1, Math.round((samples[samples.length - 1].t - samples[0].t) / 60000));
  const label = (byLocal(doc, 'type')[0] || byLocal(doc, 'name')[0] || {}).textContent || fileName;
  const hs = hrStats(samples);
  return {
    date: toISO(new Date(samples[0].t)), minutes,
    distance: Math.round(km * 10) / 10,
    hrAvg: hs.avg, hrMax: hs.max,
    zones: zonesFromSamples(samples),
    type: guessType(label, km, minutes),
    label: (label || '').trim() || fileName, origin: 'reloj', file: fileName
  };
}

function parseTcx(doc, fileName) {
  const act = byLocal(doc, 'Activity')[0];
  if (!act) return null;
  const laps = byLocal(act, 'Lap');
  let secs = 0, meters = 0, cal = 0, hrWeighted = 0, hrTime = 0, maxHr = 0;
  laps.forEach(l => {
    const t = num(byLocal(l, 'TotalTimeSeconds')[0]);
    secs += t;
    meters += num(byLocal(l, 'DistanceMeters')[0]);
    cal += num(byLocal(l, 'Calories')[0]);
    const avg = num(byLocal(byLocal(l, 'AverageHeartRateBpm')[0] || l, 'Value')[0]);
    if (avg) { hrWeighted += avg * t; hrTime += t; }
    const mx = num(byLocal(byLocal(l, 'MaximumHeartRateBpm')[0] || l, 'Value')[0]);
    if (mx > maxHr) maxHr = mx;
  });
  const samples = [];
  byLocal(act, 'Trackpoint').forEach(tp => {
    const t = Date.parse((byLocal(tp, 'Time')[0] || {}).textContent || '');
    const hrNode = byLocal(tp, 'HeartRateBpm')[0];
    const hr = hrNode ? num(byLocal(hrNode, 'Value')[0]) : 0;
    if (isFinite(t)) samples.push({ t, hr });
  });
  const hs = hrStats(samples);
  const startTxt = (byLocal(act, 'Id')[0] || {}).textContent
    || (laps[0] && laps[0].getAttribute('StartTime')) || '';
  const start = Date.parse(startTxt);
  if (!secs && samples.length) secs = (samples[samples.length - 1].t - samples[0].t) / 1000;
  const minutes = Math.max(1, Math.round(secs / 60));
  const km = Math.round(meters / 100) / 10;
  const label = act.getAttribute('Sport') || fileName;
  return {
    date: toISO(isFinite(start) ? new Date(start) : (samples[0] ? new Date(samples[0].t) : new Date())),
    minutes, distance: km,
    hrAvg: hs.avg || (hrTime ? Math.round(hrWeighted / hrTime) : 0),
    hrMax: Math.max(maxHr, hs.max),
    zones: zonesFromSamples(samples),
    watchKcal: Math.round(cal) || 0,
    type: guessType(label, km, minutes),
    label: label.trim() || fileName, origin: 'reloj', file: fileName
  };
}

function parseTrackFile(fileName, text) {
  let doc;
  try { doc = new DOMParser().parseFromString(text, 'application/xml'); }
  catch (e) { return null; }
  if (!doc || doc.getElementsByTagName('parsererror').length) return null;
  const root = (doc.documentElement && doc.documentElement.localName || '').toLowerCase();
  if (root === 'gpx') return parseGpx(doc, fileName);
  if (root === 'trainingcenterdatabase') return parseTcx(doc, fileName);
  return null;
}

/* ---------------- exportación de Salud (Apple Health) ----------------
   Salud entrega un .zip con un export.xml que puede pesar cientos de MB:
   todo lo que registró el teléfono desde siempre. Por eso no se carga
   entero en memoria — se descomprime y se recorre de a trozos, quedándonos
   solo con los entrenamientos y los pesos.

   El zip se abre con DecompressionStream, que ya viene en el navegador, así
   que sigue sin hacer falta ninguna librería. */

const HK_ACTIVITY = [
  [/Cycling/i, 'bici'],
  [/JumpRope/i, 'soga'],
  [/Soccer/i, 'futbol'],
  [/StrengthTraining|CoreTraining|Flexibility|Yoga|Pilates/i, 'fuerza'],
  [/Walking|Hiking/i, 'movilidad']
];
function hkType(t) {
  for (const [re, v] of HK_ACTIVITY) if (re.test(t || '')) return v;
  return 'otro';
}
function hkLabel(t) {
  return String(t || '').replace(/^HKWorkoutActivityType/, '') || 'Entrenamiento';
}
function tagAttrs(tag) {
  const o = {}; const re = /([\w:]+)="([^"]*)"/g; let m;
  while ((m = re.exec(tag))) o[m[1]] = m[2];
  return o;
}
const toMinutes = (v, u) => !v ? 0 : /sec/i.test(u || '') ? v / 60 : /h/i.test(u || '') ? v * 60 : v;
const toKm      = (v, u) => !v ? 0 : /mi/i.test(u || '') ? v * 1.609344 : v;
/* Las fechas vienen como "2026-08-24 18:30:00 -0300"; los primeros diez
   caracteres ya son la fecha local del registro. */
const hkDate = v => (String(v || '').slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) || [''])[0];

function parseWorkout(block, fileName) {
  const head = block.slice(0, block.indexOf('>') + 1);
  const a = tagAttrs(head);
  const date = hkDate(a.startDate);
  if (!date) return null;

  let minutes = Math.round(toMinutes(parseFloat(a.duration), a.durationUnit));
  let km = toKm(parseFloat(a.totalDistance), a.totalDistanceUnit);
  let kcal = parseFloat(a.totalEnergyBurned) || 0;
  let hrAvg = 0, hrMax = 0;

  // Desde iOS 15 la distancia, la energía y el pulso viajan en hijos
  // <WorkoutStatistics> en vez de en los atributos del propio <Workout>.
  const st = /<WorkoutStatistics\s[^>]*\/?>/g; let m;
  while ((m = st.exec(block))) {
    const s2 = tagAttrs(m[0]);
    const t = s2.type || '';
    if (/Distance/i.test(t)) km = km || toKm(parseFloat(s2.sum), s2.unit);
    else if (/ActiveEnergyBurned/i.test(t)) kcal = kcal || Math.round(parseFloat(s2.sum) || 0);
    else if (/HeartRate/i.test(t)) {
      hrAvg = Math.round(parseFloat(s2.average) || 0);
      hrMax = Math.round(parseFloat(s2.maximum) || 0);
    }
  }
  if (!minutes) return null;

  return {
    date, minutes,
    distance: Math.round(km * 10) / 10,
    watchKcal: Math.round(kcal) || 0,
    hrAvg, hrMax, zones: null,
    type: hkType(a.workoutActivityType),
    label: hkLabel(a.workoutActivityType) + (a.sourceName ? ' · ' + a.sourceName : ''),
    origin: 'salud', file: fileName
  };
}

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';
function scanWeights(text, out) {
  let i = 0;
  while ((i = text.indexOf(BODY_MASS, i)) !== -1) {
    const open = text.lastIndexOf('<Record', i);
    const close = text.indexOf('>', i);
    if (open === -1 || close === -1) { i += BODY_MASS.length; continue; }
    const a = tagAttrs(text.slice(open, close + 1));
    const date = hkDate(a.startDate);
    let kg = parseFloat(a.value);
    if (date && isFinite(kg)) {
      if (/lb/i.test(a.unit || '')) kg *= 0.45359237;
      out.push({ date, kg: Math.round(kg * 10) / 10 });
    }
    i = close + 1;
  }
}

/* Recorre un trozo de texto y devuelve lo que quedó a medias para el
   siguiente. TAIL protege los registros cortados por el borde del trozo. */
const TAIL = 600;
function consumeChunk(buf, workouts, weights, fileName, final) {
  let p = 0;
  for (;;) {
    const wi = buf.indexOf('<Workout ', p);
    if (wi === -1) break;
    const headEnd = buf.indexOf('>', wi);
    if (headEnd === -1) break;
    const selfClosing = buf[headEnd - 1] === '/';
    let end;
    if (selfClosing) {
      end = headEnd + 1;
    } else {
      const close = buf.indexOf('</Workout>', headEnd);
      if (close === -1) break;
      end = close + 10;
    }
    scanWeights(buf.slice(p, wi), weights);
    const w = parseWorkout(buf.slice(wi, end), fileName);
    if (w) workouts.push(w);
    p = end;
  }
  const wi = buf.indexOf('<Workout ', p);
  const safe = final ? buf.length : Math.max(p, (wi === -1 ? buf.length - TAIL : wi));
  scanWeights(buf.slice(p, Math.max(p, safe)), weights);
  return final ? '' : buf.slice(Math.max(p, safe > p ? safe : p));
}

/* --- lectura del .zip sin librerías --- */
async function zipEntryStream(file, nameRe) {
  const tailLen = Math.min(file.size, 66560);
  const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('El archivo no parece un .zip válido.');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('El .zip usa formato ZIP64. Descomprimilo en el teléfono y elegí el export.xml.');
  }

  const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  let off = 0, found = null;
  for (let n = 0; n < count && off + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(off, true) !== 0x02014b50) break;
    const nameLen = cd.getUint16(off + 28, true);
    const extraLen = cd.getUint16(off + 30, true);
    const commentLen = cd.getUint16(off + 32, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + off + 46, nameLen));
    if (!found && nameRe.test(name)) {
      found = {
        name,
        method: cd.getUint16(off + 10, true),
        compressedSize: cd.getUint32(off + 20, true),
        localOffset: cd.getUint32(off + 42, true)
      };
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  if (!found) throw new Error('No encontré el export.xml dentro del .zip.');

  const lh = new DataView(await file.slice(found.localOffset, found.localOffset + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('El .zip está dañado.');
  const start = found.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const blob = file.slice(start, start + found.compressedSize);
  if (found.method === 0) return blob.stream();
  if (found.method !== 8) throw new Error('El .zip usa una compresión que no puedo leer.');
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tu navegador no puede abrir .zip. Descomprimilo y elegí el export.xml.');
  }
  return blob.stream().pipeThrough(new DecompressionStream('deflate-raw'));
}

async function readHealthExport(file, onProgress) {
  const isZip = /\.zip$/i.test(file.name);
  const stream = isZip ? await zipEntryStream(file, /export\.xml$/i) : file.stream();
  const reader = stream.getReader();
  const dec = new TextDecoder('utf-8');
  const workouts = [], weights = [];
  let buf = '', bytes = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    buf += dec.decode(value, { stream: true });
    buf = consumeChunk(buf, workouts, weights, file.name, false);
    if (onProgress && bytes - last > 4e6) { last = bytes; onProgress(bytes); await new Promise(r => setTimeout(r)); }
  }
  buf += dec.decode();
  consumeChunk(buf, workouts, weights, file.name, true);
  return { workouts, weights, bytes };
}

function isDuplicate(c) {
  return S.sessions.some(x => x.date === c.date && Math.abs(x.minutes - c.minutes) <= 2 && x.type === c.type);
}

/* ------------------------------ gráficos --------------------------- */
function lineChart(series, opts) {
  opts = opts || {};
  const W = 320, H = 150, ml = 34, mr = 8, mt = 12, mb = 22;
  const all = series.flatMap(s => s.points);
  if (all.length < 2) {
    return `<div class="empty">Cargá al menos dos pesos para ver la curva.</div>`;
  }
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  if (opts.goal != null) { y0 = Math.min(y0, opts.goal); y1 = Math.max(y1, opts.goal); }
  const padY = Math.max(0.6, (y1 - y0) * 0.15);
  y0 -= padY; y1 += padY;
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  const px = x => ml + (x1 === x0 ? 0 : (x - x0) / (x1 - x0)) * (W - ml - mr);
  const py = y => mt + (1 - (y - y0) / (y1 - y0)) * (H - mt - mb);

  let g = '';
  for (let i = 0; i <= 3; i++) {
    const v = y0 + (y1 - y0) * i / 3, y = py(v);
    g += `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${W - mr}" y2="${y.toFixed(1)}" stroke="#2c303a" stroke-width="1"/>`;
    g += `<text x="${ml - 5}" y="${(y + 3.5).toFixed(1)}" fill="#93949e" font-size="9" text-anchor="end">${v.toFixed(1)}</text>`;
  }
  if (opts.goal != null && opts.goal >= y0 && opts.goal <= y1) {
    const y = py(opts.goal);
    g += `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${W - mr}" y2="${y.toFixed(1)}" stroke="#5cd68a" stroke-width="1.4" stroke-dasharray="4 4"/>`;
    g += `<text x="${W - mr}" y="${(y - 4).toFixed(1)}" fill="#5cd68a" font-size="9" text-anchor="end">meta</text>`;
  }
  series.forEach(s => {
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1)).join(' ');
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`;
    if (s.dots) s.points.forEach(p => { g += `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="2.6" fill="${s.color}"/>`; });
  });
  const lab = (opts.labels || []);
  lab.forEach(l => {
    g += `<text x="${px(l.x).toFixed(1)}" y="${H - 5}" fill="#93949e" font-size="9" text-anchor="middle">${esc(l.text)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

function barChart(items) {
  const W = 320, H = 130, ml = 26, mr = 6, mt = 10, mb = 20;
  if (!items.length) return `<div class="empty">Todavía no hay datos.</div>`;
  const max = Math.max.apply(null, items.map(i => i.value)) || 1;
  const bw = (W - ml - mr) / items.length;
  let g = '';
  for (let i = 0; i <= 2; i++) {
    const v = max * i / 2, y = mt + (1 - i / 2) * (H - mt - mb);
    g += `<line x1="${ml}" y1="${y.toFixed(1)}" x2="${W - mr}" y2="${y.toFixed(1)}" stroke="#2c303a" stroke-width="1"/>`;
    g += `<text x="${ml - 4}" y="${(y + 3.5).toFixed(1)}" fill="#93949e" font-size="9" text-anchor="end">${Math.round(v)}</text>`;
  }
  items.forEach((it, i) => {
    const h = (it.value / max) * (H - mt - mb);
    const x = ml + i * bw + bw * 0.18, w = bw * 0.64;
    const y = mt + (H - mt - mb) - h;
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="2.5" fill="${it.current ? '#ff6a2b' : '#8a3d1c'}"/>`;
    if (items.length <= 14 || i % 2 === 0)
      g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 5}" fill="#93949e" font-size="8.5" text-anchor="middle">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
}

/* ------------------------------ logros ----------------------------- */
const BADGES = [
  { i: '🚦', t: 'Arranque',        f: s => s.count >= 1 },
  { i: '🔥', t: '7 días seguidos', f: s => s.streak >= 7 },
  { i: '⚡', t: '14 de racha',     f: s => s.streak >= 14 },
  { i: '🏔️', t: '30 de racha',     f: s => s.streak >= 30 },
  { i: '🚴', t: '100 km',          f: s => s.km >= 100 },
  { i: '🛣️', t: '300 km',          f: s => s.km >= 300 },
  { i: '🌍', t: '500 km',          f: s => s.km >= 500 },
  { i: '🪢', t: '10.000 saltos',   f: s => s.jumps >= 10000 },
  { i: '🌀', t: '50.000 saltos',   f: s => s.jumps >= 50000 },
  { i: '⏱️', t: '25 horas',        f: s => s.minutes >= 1500 },
  { i: '⌛', t: '50 horas',        f: s => s.minutes >= 3000 },
  { i: '💯', t: '100 sesiones',    f: s => s.count >= 100 },
  { i: '📅', t: 'Semana perfecta', f: s => s.perfectWeeks >= 1 },
  { i: '🗓️', t: '4 semanas ok',    f: s => s.perfectWeeks >= 4 },
  { i: '⚖️', t: '-2 kg',           f: s => s.lost >= 2 },
  { i: '📉', t: '-5 kg',           f: s => s.lost >= 5 },
  { i: '🎯', t: 'Meta alcanzada',  f: () => currentWeight() <= S.profile.goalWeight },
  { i: '🏆', t: 'Desafío completo', f: s => s.perfectWeeks >= 10 }
];

/* ------------------------------ render ----------------------------- */
function render() {
  renderTopbar();
  renderToday();
  renderPlan();
  renderLog();
  renderWeight();
  renderProgress();
  renderProfile();
}

function renderTopbar() {
  const p = S.profile, w = currentWeight();
  const left = Math.max(0, w - p.goalWeight);
  $('#topbarSub').textContent = p.name
    ? `${p.name} · ${left > 0.05 ? left.toFixed(1) + ' kg para la meta' : '¡meta alcanzada!'}`
    : (left > 0.05 ? `${left.toFixed(1)} kg para la meta` : '¡meta alcanzada!');
}

function planKcal(s) {
  const w = currentWeight();
  if (s.met) return Math.round(s.met * w * (s.minutes / 60));
  return kcal(s.type, s.type === 'movilidad' ? 'suave' : 'moderado', s.minutes, w);
}

function sessionCard(s, opts) {
  opts = opts || {};
  const done = !!S.done[s.id];
  const isToday = opts.todayIdx === s.day;
  const meta = s.rest ? '' : `<div class="sess-meta">
        <span class="pill">≈ ${fmtMin(s.minutes)}</span>
        <span class="pill">≈ ${planKcal(s)} kcal</span>
        ${s.eve ? '<span class="pill eve">víspera de partido</span>' : ''}
        ${s.optional ? '<span class="pill opt">opcional</span>' : ''}
      </div>`;
  const actions = s.rest ? '' : `<div class="sess-actions">
      <button class="check ${done ? 'on' : ''}" data-check="${s.id}" title="Marcar como hecha">✓</button>
      <button class="check" data-quick="${s.type}" data-min="${s.minutes}" title="Registrar sesión">＋</button>
    </div>`;
  return `<article class="sess t-${s.type} ${done ? 'is-done' : ''} ${isToday ? 'is-today' : ''} ${s.rest ? 'is-rest' : ''}">
    <div class="sess-ico">${ICON[s.type] || '•'}</div>
    <div class="sess-body">
      <div class="sess-day">${DAYS[s.day]}${isToday ? ' · hoy' : ''}</div>
      <div class="sess-title">${esc(s.title)}</div>
      <div class="sess-detail">${esc(s.detail)}</div>
      ${meta}
    </div>
    ${actions}
  </article>`;
}

function renderToday() {
  const p = S.profile, w = currentWeight(), st = stats(), day = currentDay(), wn = currentWeek();

  const pct = clamp(day / 84, 0, 1);
  const C = 2 * Math.PI * 52;
  $('#ringProgress').style.strokeDashoffset = String(C * (1 - pct));
  $('#ringDay').textContent = String(clamp(day, 1, 84));
  $('.ring-label span').textContent = 'de 84 días';

  $('#statWeight').textContent = w.toFixed(1) + ' kg';
  const diff = w - p.startWeight;
  $('#statLost').textContent = (diff > 0 ? '+' : '') + diff.toFixed(1) + ' kg';
  $('#statLost').style.color = diff <= 0 ? 'var(--good)' : 'var(--danger)';
  $('#statStreak').textContent = st.streak + (st.streak === 1 ? ' día' : ' días');

  const ws = weekSummary();
  $('#statWeekSessions').textContent = String(ws.count);
  $('#statWeekMin').textContent = ws.minutes + "'";

  const wk = WEEKS[wn - 1];
  $('#todayWeekNum').textContent = String(wn);
  $('#todayBlock').textContent = wk.block + (wk.deload ? ' · descarga' : '');
  $('#todayTip').textContent = wk.tip;

  const todayIdx = dowIndex(today());
  const sessions = buildWeek(wn);
  const ordered = sessions.slice(todayIdx).concat(sessions.slice(0, todayIdx));
  $('#todayList').innerHTML = ordered.map(s => sessionCard(s, { todayIdx })).join('');

  $('#quickGrid').innerHTML = [
    { t: 'bici', m: 45, l: 'Bici' },
    { t: 'soga', m: 20, l: 'Soga' },
    { t: 'futbol', m: 60, l: 'Fútbol' },
    { t: 'fuerza', m: 25, l: 'Fuerza' },
    { t: 'movilidad', m: 35, l: 'Caminata' }
  ].map(q => `<button data-quick="${q.t}" data-min="${q.m}"><span>${ICON[q.t]}</span>${q.l}</button>`).join('');
}

let planWeek = null;
function renderPlan() {
  const cur = currentWeek();
  if (planWeek == null) planWeek = cur;

  $('#weekNav').innerHTML = WEEKS.map(w =>
    `<button data-week="${w.w}" class="${w.w === planWeek ? 'active' : ''} ${w.deload ? 'deload' : ''}">
       ${w.w}<small>${w.deload ? 'desc' : w.block.slice(0, 4).toLowerCase()}</small>
     </button>`).join('');

  const p = WEEKS[planWeek - 1];
  const sessions = buildWeek(planWeek);
  const key = sessions.filter(s => !s.optional && !s.rest);
  const totalMin = key.reduce((a, b) => a + b.minutes, 0);
  const totalKcal = key.reduce((a, b) => a + planKcal(b), 0);

  $('#planDetail').innerHTML = `
    <div class="card">
      <div class="week-head">
        <h2>Semana ${p.w}</h2>
        <span class="badge-block">${esc(p.block)}${p.deload ? ' · descarga' : ''}${planWeek === cur ? ' · en curso' : ''}</span>
      </div>
      <p class="tip">${esc(p.tip)}</p>
      <div class="row-3">
        <div class="mini"><b>${key.length}</b><span>sesiones clave</span></div>
        <div class="mini"><b>${Math.round(totalMin / 60 * 10) / 10} h</b><span>volumen</span></div>
        <div class="mini"><b>${totalKcal}</b><span>kcal aprox.</span></div>
      </div>
    </div>
    ${sessions.map(s => sessionCard(s, { todayIdx: planWeek === cur ? dowIndex(today()) : -1 })).join('')}`;
}

let pending = [];
let pendingWeights = [];
let importNote = '';
const MAX_ROWS = 40;

function renderImport() {
  const box = $('#importPreview');
  const nuevosPesos = pendingWeights.filter(w => !S.weights.some(x => x.date === w.date));
  if (!pending.length && !nuevosPesos.length) {
    box.innerHTML = importNote ? `<p class="import-note">${esc(importNote)}</p>` : '';
    return;
  }
  const opts = [['bici','🚴 Bici'],['soga','🪢 Soga'],['futbol','⚽ Fútbol'],
                ['fuerza','💪 Fuerza'],['movilidad','🚶 Caminata'],['otro','✳️ Otro']];
  box.innerHTML = (importNote ? `<p class="import-note">${esc(importNote)}</p>` : '')
    + pending.slice(0, MAX_ROWS).map((c, i) => {
    const dup = isDuplicate(c);
    const bits = [fmtMin(c.minutes)];
    if (c.distance) bits.push(c.distance + ' km');
    if (c.hrAvg) bits.push(c.hrAvg + ' ppm medio');
    if (c.hrMax) bits.push('máx ' + c.hrMax);
    bits.push(sessionKcal(c) + ' kcal' + (kcalSource(c) ? ' ' + kcalSource(c) : ''));
    return `<article class="entry imported ${dup ? 'is-dup' : ''}">
      <div class="entry-ico">${ICON[c.type] || '•'}</div>
      <div class="entry-body">
        <div class="entry-title">${fmtDate(c.date)} · ${esc(bits.join(' · '))}</div>
        <div class="entry-sub">${esc(c.label)}${dup ? ' · ya la tenías cargada' : ''}</div>
        <select class="imp-type" data-i="${i}">
          ${opts.map(o => `<option value="${o[0]}"${o[0] === c.type ? ' selected' : ''}>${o[1]}</option>`).join('')}
        </select>
      </div>
      <button class="entry-del" data-drop="${i}" aria-label="Descartar">×</button>
    </article>`;
  }).join('')
    + (pending.length > MAX_ROWS
        ? `<p class="muted small">…y ${pending.length - MAX_ROWS} entrenamientos más, que también se van a agregar.</p>` : '')
    + (nuevosPesos.length
        ? `<article class="entry"><div class="entry-ico">⚖️</div><div class="entry-body">
             <div class="entry-title">${nuevosPesos.length} registro${nuevosPesos.length > 1 ? 's' : ''} de peso</div>
             <div class="entry-sub">de ${fmtDate(nuevosPesos[0].date)} a ${fmtDate(nuevosPesos[nuevosPesos.length - 1].date)}</div>
           </div></article>` : '')
    + `<div class="btn-row">
      <button class="btn primary" id="btnAddImported" type="button">Agregar${pending.length ? ' ' + pending.length + (pending.length === 1 ? ' sesión' : ' sesiones') : ''}${nuevosPesos.length ? (pending.length ? ' y ' : ' ') + nuevosPesos.length + ' peso' + (nuevosPesos.length > 1 ? 's' : '') : ''}</button>
      <button class="btn" id="btnClearImport" type="button">Descartar todo</button>
    </div>`;
}

let logFilter = 'all';
function renderLog() {
  const list = S.sessions.slice().sort((a, b) => (a.date === b.date ? b.id - a.id : (a.date < b.date ? 1 : -1)));
  const filtered = logFilter === 'all' ? list : list.filter(s => s.type === logFilter);
  $('#logCount').textContent = filtered.length ? `· ${filtered.length}` : '';
  $('#logList').innerHTML = filtered.length ? filtered.map(s => {
    const bits = [fmtMin(s.minutes)];
    if (s.distance) bits.push(s.distance + ' km');
    if (s.jumps) bits.push(s.jumps.toLocaleString('es-AR') + ' saltos');
    if (s.hrAvg) bits.push(s.hrAvg + ' ppm');
    bits.push(s.kcal + ' kcal');
    if (s.rpe) bits.push('RPE ' + s.rpe);
    return `<article class="entry">
      <div class="entry-ico">${ICON[s.type] || '•'}</div>
      <div class="entry-body">
        <div class="entry-title">${fmtDate(s.date)} · ${esc(bits.join(' · '))}</div>
        <div class="entry-sub">${esc(s.notes || (s.intensity ? 'Intensidad ' + s.intensity : ''))}${s.source === 'reloj' ? ' · ⌚ del reloj' : s.source === 'salud' ? ' · ❤️ de Salud' : ''}</div>
      </div>
      <button class="entry-del" data-del="${s.id}" aria-label="Borrar">×</button>
    </article>`;
  }).join('') : `<div class="empty">Todavía no registraste nada. Empezá por la primera salida en bici.</div>`;
}

function renderWeight() {
  const p = S.profile, w = currentWeight();
  const sorted = S.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const pts = sorted.map(x => ({ x: daysBetween(p.startDate, x.date), y: x.kg }));
  const labels = pts.length > 1
    ? [{ x: pts[0].x, text: fmtDate(sorted[0].date) }, { x: pts[pts.length - 1].x, text: fmtDate(sorted[sorted.length - 1].date) }]
    : [];
  $('#weightChart').innerHTML = lineChart([
    { points: pts, color: '#4ec9e8', width: 1.6, dots: pts.length <= 40 },
    { points: movingAvg(pts, 7), color: '#ff6a2b', width: 2.4 }
  ], { goal: p.goalWeight, labels });

  $('#wStart').textContent = p.startWeight.toFixed(1);
  $('#wNow').textContent = w.toFixed(1);
  $('#wGoal').textContent = p.goalWeight.toFixed(1);

  const b = bmi(w), bg = bmi(p.goalWeight);
  $('#bmiNow').textContent = `${b.toFixed(1)} (${bmiLabel(b)})`;
  $('#bmiGoal').textContent = `${bg.toFixed(1)} (${bmiLabel(bg)})`;
  const basal = bmr(w), entren = avgTrainingKcal(14), gasto = tdee(w);
  $('#bmr').textContent = basal.toLocaleString('es-AR') + ' kcal';
  $('#tdee').textContent = gasto.toLocaleString('es-AR') + ' kcal'
    + (entren ? ` (${baseExpenditure(w).toLocaleString('es-AR')} base + ${entren} de entrenamiento)` : '');
  $('#target').textContent = (gasto - 550).toLocaleString('es-AR') + ' kcal/día';
  $('#protein').textContent = Math.round(w * 1.6) + ' g/día';

  $('#weightList').innerHTML = sorted.length
    ? sorted.slice().reverse().map((x, i, arr) => {
        const prev = arr[i + 1];
        const d = prev ? x.kg - prev.kg : 0;
        const tag = prev ? `<span class="muted small">${d > 0 ? '+' : ''}${d.toFixed(1)} kg</span>` : '<span class="muted small">inicio</span>';
        return `<article class="entry"><div class="entry-ico">⚖️</div>
          <div class="entry-body"><div class="entry-title">${x.kg.toFixed(1)} kg ${tag}</div>
          <div class="entry-sub">${fmtDate(x.date)}</div></div>
          <button class="entry-del" data-delw="${x.date}" aria-label="Borrar">×</button></article>`;
      }).join('')
    : `<div class="empty">Registrá tu peso de hoy para tener el punto de partida.</div>`;
}

function renderProgress() {
  const st = stats();
  $('#totals').innerHTML = `
    <div><b>${st.count}</b><span>sesiones</span></div>
    <div><b>${Math.round(st.minutes / 60)}</b><span>horas</span></div>
    <div><b>${Math.round(st.km)}</b><span>km en bici</span></div>
    <div><b>${st.jumps.toLocaleString('es-AR')}</b><span>saltos</span></div>
    <div><b>${st.kcal.toLocaleString('es-AR')}</b><span>kcal quemadas</span></div>
    <div><b>${st.perfectWeeks}</b><span>semanas perfectas</span></div>`;

  // heatmap: 13 semanas terminando en la semana actual
  const end = addDays(mondayOf(today()), 6);
  const start = addDays(end, -(13 * 7 - 1));
  const perDay = {};
  S.sessions.forEach(s => { perDay[s.date] = (perDay[s.date] || 0) + (s.minutes || 0); });
  let cells = '';
  for (let i = 0; i < 13 * 7; i++) {
    const d = addDays(start, i), m = perDay[d] || 0;
    const lvl = m === 0 ? 0 : m < 25 ? 1 : m < 45 ? 2 : m < 70 ? 3 : 4;
    cells += `<i class="h${lvl}" title="${fmtDate(d)}: ${m ? m + ' min' : 'sin actividad'}"></i>`;
  }
  $('#heatmap').innerHTML = cells;

  // minutos por semana (últimas 12)
  const bars = [];
  for (let k = 11; k >= 0; k--) {
    const mon = addDays(mondayOf(today()), -7 * k);
    const sun = addDays(mon, 6);
    const min = S.sessions.filter(s => s.date >= mon && s.date <= sun)
      .reduce((a, b) => a + (b.minutes || 0), 0);
    bars.push({ label: fromISO(mon).getDate() + '/' + (fromISO(mon).getMonth() + 1), value: min, current: k === 0 });
  }
  $('#weekChart').innerHTML = barChart(bars);

  renderZones();

  $('#badges').innerHTML = BADGES.map(b =>
    `<div class="badge ${b.f(st) ? 'on' : ''}"><b>${b.i}</b><span>${esc(b.t)}</span></div>`).join('');

  const ts = S.tests.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  $('#testList').innerHTML = ts.length ? ts.map(t => {
    const bits = [];
    if (t.bike) bits.push(`${t.bike} km en 12'`);
    if (t.jumps) bits.push(`${t.jumps} saltos en 1'`);
    if (t.plank) bits.push(`plancha ${t.plank}"`);
    return `<article class="entry"><div class="entry-ico">🧪</div>
      <div class="entry-body"><div class="entry-title">${esc(bits.join(' · ') || 'Test')}</div>
      <div class="entry-sub">${fmtDate(t.date)}</div></div>
      <button class="entry-del" data-delt="${t.date}" aria-label="Borrar">×</button></article>`;
  }).join('') : '';
}

function renderZones() {
  const hm = hrMax();
  $('#hrMaxLabel').textContent = `FC máx ${hm} ppm${S.profile.hrMax ? '' : ' (estimada)'}`;

  const mon = mondayOf(today());
  const week = S.sessions.filter(s => s.date >= mon && s.zones);
  const tot = [0, 0, 0, 0, 0];
  week.forEach(s => s.zones.forEach((m, i) => { tot[i] += m; }));
  const sum = tot.reduce((a, b) => a + b, 0);

  $('#zoneWeek').innerHTML = sum
    ? `<div class="zone-bar">${tot.map((m, i) =>
         m ? `<span style="flex:${m};background:${ZONES[i].color}" title="Z${i + 1}: ${m} min"></span>` : ''
       ).join('')}</div>
       <p class="muted small" style="margin-top:7px">${sum} min con pulso registrado esta semana · ${tot[1]} min en Z2, tu zona de base.</p>`
    : `<p class="muted small">Importá una actividad con pulso desde el reloj y acá vas a ver cuánto tiempo pasaste en cada zona.</p>`;

  $('#zoneTable').innerHTML = ZONES.map(z =>
    `<div class="zone-row">
       <i style="background:${z.color}"></i>
       <div>
         <b>Z${z.n} · ${esc(z.name)}</b>
         <span class="muted small">${Math.round(z.lo * hm)}-${Math.round(Math.min(z.hi, 1) * hm)} ppm · ${esc(z.use)}</span>
       </div>
     </div>`).join('');
}

function renderProfile() {
  const p = S.profile;
  $('#pName').value = p.name || '';
  $('#pAge').value = p.age;
  $('#pHeight').value = p.height;
  $('#pSex').value = p.sex;
  $('#pStart').value = p.startWeight;
  $('#pGoal').value = p.goalWeight;
  $('#pDate').value = p.startDate;
  $('#pFootball').value = String(p.footballDay);
  $('#pRest').value = String(p.restDay);
  $('#pHrMax').value = p.hrMax || '';
}

/* ----------------------------- interacción ------------------------- */
function showView(name) {
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  window.scrollTo(0, 0);
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

function updateKcalPreview() {
  const type = $('#sesType').value;
  const min = Number($('#sesMin').value) || 0;
  const int = $('#sesInt').value;
  const hr = Number($('#sesHrAvg').value) || 0;
  $('#kcalPreview').textContent = '≈ ' + sessionKcal({ type, intensity: int, minutes: min, hrAvg: hr })
    + ' kcal' + (hr ? ' por pulso' : '');
  $('.f-bici').style.display = type === 'bici' ? '' : 'none';
  $('.f-soga').style.display = type === 'soga' ? '' : 'none';
}

function bind() {
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  $('#btnSettings').addEventListener('click', () => showView('ajustes'));

  // marcar hecha / registrar rápido (delegación global)
  document.addEventListener('click', e => {
    const chk = e.target.closest('[data-check]');
    if (chk) {
      const id = chk.dataset.check;
      if (S.done[id]) delete S.done[id]; else S.done[id] = true;
      save(); renderToday(); renderPlan(); renderProgress();
      return;
    }
    const q = e.target.closest('[data-quick]');
    if (q) {
      $('#sesType').value = q.dataset.quick;
      $('#sesMin').value = q.dataset.min || '';
      $('#sesDate').value = today();
      updateKcalPreview();
      showView('log');
      $('#sesMin').focus();
      return;
    }
    const wk = e.target.closest('[data-week]');
    if (wk) { planWeek = Number(wk.dataset.week); renderPlan(); return; }

    const del = e.target.closest('[data-del]');
    if (del) {
      S.sessions = S.sessions.filter(s => String(s.id) !== del.dataset.del);
      save(); renderLog(); renderToday(); renderProgress(); toast('Sesión borrada');
      return;
    }
    const dw = e.target.closest('[data-delw]');
    if (dw) {
      S.weights = S.weights.filter(x => x.date !== dw.dataset.delw);
      save(); renderWeight(); renderToday(); renderTopbar(); toast('Registro borrado');
      return;
    }
    const dt = e.target.closest('[data-delt]');
    if (dt) {
      S.tests = S.tests.filter(x => x.date !== dt.dataset.delt);
      save(); renderProgress(); return;
    }
    const chip = e.target.closest('.chip');
    if (chip) {
      $$('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      logFilter = chip.dataset.f;
      renderLog();
    }
  });

  // --- importar la exportación de Salud ---
  $('#btnPickHealth').addEventListener('click', () => $('#fileHealth').click());
  $('#fileHealth').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const box = $('#importPreview');
    const mb = n => (n / 1048576).toFixed(0);
    box.innerHTML = `<div class="import-progress"><i></i><span id="impProg">Leyendo ${esc(f.name)}…</span></div>`;
    try {
      const res = await readHealthExport(f, b => {
        const el = $('#impProg');
        if (el) el.textContent = `Leyendo ${esc(f.name)} · ${mb(b)} MB`;
      });
      const desde = S.profile.startDate;
      const total = res.workouts.length;
      const viejos = res.workouts.filter(w => w.date < desde).length;
      pending = res.workouts.filter(w => w.date >= desde).sort((a, b) => a.date < b.date ? -1 : 1);
      pendingWeights = res.weights.filter(w => w.date >= desde)
        .sort((a, b) => a.date < b.date ? -1 : 1);

      const leido = `Leí ${mb(res.bytes)} MB de ${esc(f.name)} y encontré ${total} entrenamiento${total === 1 ? '' : 's'} en total. `;
      if (!total) {
        // Ni un solo entrenamiento: casi siempre es que Salud no los tiene.
        importNote = leido + 'Salud no tiene ningún entrenamiento guardado. '
          + 'Revisá que en Zepp esté activada la sincronización con Apple Salud (Perfil → Ajustes → Apple Salud) '
          + 'y que hayas elegido el .zip que genera Salud, no otro archivo. Mientras tanto podés traer las '
          + 'actividades una por una en TCX desde Zepp.'
          + (pendingWeights.length
              ? ` Los ${pendingWeights.length} registro${pendingWeights.length === 1 ? '' : 's'} de peso sí están y los podés agregar igual.`
              : '');
      } else if (!pending.length && !pendingWeights.length) {
        importNote = leido + `Todos son anteriores al ${fmtDate(desde)}, el inicio de tu desafío, así que no traje ninguno. `
          + 'Si querés incluirlos, cambiá la fecha de inicio en Ajustes y volvé a importar.';
      } else {
        importNote = leido
          + `Traigo ${pending.length} desde el ${fmtDate(desde)}`
          + (pendingWeights.length ? ` y ${pendingWeights.length} registro${pendingWeights.length === 1 ? '' : 's'} de peso` : '')
          + '.'
          + (viejos ? ` Los ${viejos} anteriores a esa fecha quedaron afuera.` : '');
      }
      renderImport();
    } catch (err) {
      pending = []; pendingWeights = [];
      importNote = 'No pude leer el archivo: ' + err.message;
      renderImport();
    }
  });

  // --- importar actividades del reloj ---
  $('#btnPickTrack').addEventListener('click', () => $('#fileTrack').click());
  $('#fileTrack').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    let malos = 0;
    for (const f of files) {
      let parsed = null;
      try { parsed = parseTrackFile(f.name, await f.text()); }
      catch (err) { parsed = null; }
      if (parsed) pending.push(parsed); else malos++;
    }
    pending.sort((a, b) => a.date < b.date ? -1 : 1);
    importNote = '';
    renderImport();
    if (malos) toast(`${malos} archivo${malos > 1 ? 's' : ''} sin datos legibles (¿es .fit?)`);
    else if (pending.length) toast(`${pending.length} actividad${pending.length > 1 ? 'es' : ''} lista${pending.length > 1 ? 's' : ''}`);
  });

  document.addEventListener('change', e => {
    const sel = e.target.closest('.imp-type');
    if (!sel) return;
    pending[Number(sel.dataset.i)].type = sel.value;
    renderImport();
  });

  document.addEventListener('click', e => {
    const drop = e.target.closest('[data-drop]');
    if (drop) { pending.splice(Number(drop.dataset.drop), 1); renderImport(); return; }
    if (e.target.closest('#btnClearImport')) { pending = []; pendingWeights = []; importNote = ''; renderImport(); return; }
    if (e.target.closest('#btnAddImported')) {
      let nuevas = 0, repetidas = 0;
      pending.forEach(c => {
        if (isDuplicate(c)) { repetidas++; return; }
        const o = {
          id: Date.now() + nuevas,
          date: c.date, type: c.type, minutes: c.minutes,
          intensity: c.hrAvg ? (zoneOf(c.hrAvg) >= 4 ? 'fuerte' : zoneOf(c.hrAvg) <= 2 ? 'suave' : 'moderado') : 'moderado',
          distance: c.distance || 0,
          jumps: c.type === 'soga' ? Math.round(c.minutes * 0.6 * 110) : 0,
          hrAvg: c.hrAvg || 0, hrMax: c.hrMax || 0, watchKcal: c.watchKcal || 0,
          zones: c.zones && c.zones.some(Boolean) ? c.zones : null,
          rpe: c.hrAvg ? clamp(Math.round(zoneOf(c.hrAvg) * 2), 1, 10) : 6,
          mood: 3, notes: c.label || '', source: c.origin || 'reloj'
        };
        o.kcal = sessionKcal(o);
        S.sessions.push(o);
        nuevas++;
      });
      let pesos = 0;
      pendingWeights.forEach(w => {
        if (S.weights.some(x => x.date === w.date)) return;
        S.weights.push(w); pesos++;
      });
      pending = []; pendingWeights = []; importNote = '';
      save(); render(); renderImport();
      if (pesos) toast(`${pesos} registro${pesos > 1 ? 's' : ''} de peso agregado${pesos > 1 ? 's' : ''}`);
      toast(nuevas
        ? `${nuevas} sesión${nuevas > 1 ? 'es' : ''} agregada${nuevas > 1 ? 's' : ''}${repetidas ? ` · ${repetidas} repetida${repetidas > 1 ? 's' : ''} omitida${repetidas > 1 ? 's' : ''}` : ''}`
        : 'Ya las tenías todas cargadas');
    }
  });

  ['#sesType', '#sesMin', '#sesInt', '#sesHrAvg'].forEach(sel =>
    $(sel).addEventListener('input', updateKcalPreview));
  $('#sesRpe').addEventListener('input', e => { $('#rpeOut').textContent = e.target.value; });

  $('#formSession').addEventListener('submit', e => {
    e.preventDefault();
    const type = $('#sesType').value;
    const minutes = Number($('#sesMin').value);
    if (!minutes) return;
    const intensity = $('#sesInt').value;
    let jumps = Number($('#sesJumps').value) || 0;
    if (type === 'soga' && !jumps) jumps = Math.round(minutes * 0.6 * 110); // ~60% del tiempo saltando
    const o = {
      id: Date.now(),
      date: $('#sesDate').value || today(),
      type, minutes, intensity,
      distance: Number($('#sesKm').value) || 0,
      jumps,
      hrAvg: Number($('#sesHrAvg').value) || 0,
      hrMax: Number($('#sesHrMax').value) || 0,
      rpe: Number($('#sesRpe').value),
      mood: Number($('#sesMood').value),
      notes: $('#sesNotes').value.trim(),
      source: 'manual'
    };
    o.kcal = sessionKcal(o);
    S.sessions.push(o);
    save();
    e.target.reset();
    $('#sesDate').value = today();
    $('#sesRpe').value = 6; $('#rpeOut').textContent = '6';
    updateKcalPreview();
    render();
    toast('¡Sesión guardada! 💪');
    showView('hoy');
  });

  $('#formWeight').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('#wDate').value || today();
    const kg = Number($('#wKg').value);
    if (!kg) return;
    S.weights = S.weights.filter(x => x.date !== date);
    S.weights.push({ date, kg });
    save(); $('#wKg').value = '';
    render(); toast('Peso registrado');
  });

  $('#formTest').addEventListener('submit', e => {
    e.preventDefault();
    const date = $('#tDate').value || today();
    S.tests = S.tests.filter(x => x.date !== date);
    S.tests.push({
      date,
      bike: Number($('#tBike').value) || 0,
      jumps: Number($('#tJump').value) || 0,
      plank: Number($('#tPlank').value) || 0
    });
    save(); e.target.reset(); $('#tDate').value = today();
    renderProgress(); toast('Test guardado');
  });

  $('#formProfile').addEventListener('submit', e => {
    e.preventDefault();
    Object.assign(S.profile, {
      name: $('#pName').value.trim(),
      age: Number($('#pAge').value) || 32,
      height: Number($('#pHeight').value) || 176,
      sex: $('#pSex').value,
      startWeight: Number($('#pStart').value) || 91,
      goalWeight: Number($('#pGoal').value) || 83,
      startDate: $('#pDate').value || today(),
      footballDay: Number($('#pFootball').value),
      restDay: Number($('#pRest').value),
      hrMax: Number($('#pHrMax').value) || 0
    });
    if (S.profile.restDay === S.profile.footballDay) {
      S.profile.restDay = (S.profile.footballDay + 1) % 7;
      toast('El descanso no puede caer el día del partido: lo moví al día siguiente');
    }
    save(); render(); toast('Perfil actualizado');
  });

  $('#btnExport').addEventListener('click', () => {
    const json = JSON.stringify(S, null, 2);
    if (navigator.clipboard) navigator.clipboard.writeText(json).catch(() => {});
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `desafio90-${today()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { /* algunos navegadores bloquean la descarga */ }
    openModal('Copia de seguridad', json,
      'Ya está copiada en el portapapeles: pegala en una nota, un mail o donde la tengas a mano. ' +
      'Si abriste la app desde tu propia carpeta, además se descargó como archivo .json.');
  });

  $('#btnImport').addEventListener('click', () => {
    openModal('Restaurar una copia', '',
      'Pegá el contenido de una copia anterior, o elegí el archivo .json que exportaste. ' +
      'Esto reemplaza todo lo que tengas cargado ahora.', txt => {
      try {
        const data = JSON.parse(txt);
        if (!data || typeof data !== 'object') throw new Error('formato');
        S = {
          profile: Object.assign({}, DEFAULTS.profile, data.profile),
          sessions: data.sessions || [], weights: data.weights || [],
          tests: data.tests || [], done: data.done || {}
        };
        save(); render(); toast('Datos importados');
      } catch (err) { toast('El texto no es una copia válida'); }
    });
    $('#fileImport').click();
  });

  $('#fileImport').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const ta = $('#modalText'); if (ta) { ta.value = r.result; } };
    r.readAsText(f);
    e.target.value = '';
  });

  $('#btnReset').addEventListener('click', () => {
    if (!confirm('Esto borra todas tus sesiones, pesos y tests. ¿Seguro?')) return;
    S = clonar(DEFAULTS);
    S.profile.startDate = today();
    save(); planWeek = null; render(); toast('Todo borrado');
  });
}

/* modal simple para exportar / importar texto */
function openModal(title, value, note, onConfirm) {
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:18px';
  back.innerHTML = `<div style="background:#1b1e25;border:1px solid #2c303a;border-radius:16px;padding:16px;width:100%;max-width:520px">
    <h2 style="font-size:15px;margin:0 0 6px">${esc(title)}</h2>
    <p style="font-size:12.5px;color:#93949e;margin:0 0 10px">${esc(note || '')}</p>
    <textarea id="modalText" style="width:100%;height:190px;background:#131519;color:#ece8e1;border:1px solid #2c303a;border-radius:10px;padding:10px;font:16px/1.45 ui-monospace,Menlo,Consolas,monospace;resize:vertical">${esc(value)}</textarea>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn" data-close>Cerrar</button>
      ${onConfirm ? '<button class="btn primary" data-ok>Importar</button>' : ''}
    </div></div>`;
  back.addEventListener('click', e => {
    if (e.target === back || e.target.closest('[data-close]')) back.remove();
    if (e.target.closest('[data-ok]')) { onConfirm($('#modalText').value); back.remove(); }
  });
  document.body.appendChild(back);
  if (!onConfirm) $('#modalText').select();
}

/* ------------------------------- init ------------------------------ */
function init() {
  $('#sesDate').value = today();
  $('#wDate').value = today();
  $('#tDate').value = today();
  bind();
  updateKcalPreview();
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
