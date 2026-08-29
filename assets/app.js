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
    name: '', age: 32, birth: '', sex: 'm', height: 176,
    startWeight: 91, goalWeight: 83,
    startDate: today(), footballDay: 5, restDay: 6, hrMax: 0
  },
  sessions: [],   // {id,date,type,minutes,intensity,distance,jumps,rpe,mood,notes,kcal}
  weights: [],    // {date,kg}
  tests: [],      // {date,bike,jumps,plank}
  labs: [],       // {id,date,lugar,notas,values:{},aplicar,archivo}
  foods: [],      // {id,date,tipo,k,n,q,kcal,pr,gr,ch}
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
      labs: parsed.labs || [],
      foods: parsed.foods || [],
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
  let sogaA = p.ropeA
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
  let ligero = p.ropeB
    ? { type: 'soga', title: `Soga · ${p.ropeB.r} series + core`, minutes: minB,
        met: blendMet(p.ropeB.r * p.ropeB.on, minB), eve: true,
        detail: `${ropeText(p.ropeB)}. Después 2 vueltas del circuito de fuerza. Es la víspera del partido: si llegás cargado, cambiala por una caminata.` }
    : { type: 'movilidad', title: 'Movilidad y caminata', minutes: 30, optional: true, eve: true,
        detail: 'Víspera de partido en semana de descarga: nada de impacto. Caminata a paso vivo, movilidad de cadera y tobillo, y elongación de gemelos y cuádriceps.' };

  const futbol = { type: 'futbol', title: 'Fútbol', minutes: 60,
    detail: 'Tu partido de siempre. Entrá en calor 10 minutos antes de arrancar — es el día con más riesgo de tirón de toda la semana.' };

  const descanso = { type: 'descanso', title: 'Descanso total', minutes: 0, rest: true,
    detail: 'Día libre después del partido. El descanso no es lo que interrumpe el progreso: es donde pasa. Comé bien, hidratate y dormí.' };

  /* Ajustes por estudios: solo pueden suavizar el plan. */
  const fl = banderasPlan();
  if (fl.has('sinIntervalos') && !p.finalTest) {
    intervalos = { type: 'bici', title: `Bici suave · ${p.z2} min`, minutes: p.z2, ajuste: true,
      detail: 'Cambiado por tus estudios: en vez de intervalos, rodaje tranquilo a ritmo conversado. Volvé a los intervalos cuando el valor que lo motivó esté corregido.' };
  }
  if (fl.has('sinImpacto')) {
    const suave = (base, min) => ({ type: 'movilidad', title: 'Caminata o bici suave', minutes: min, ajuste: true,
      detail: 'Cambiado por tus estudios: sin impacto por ahora. Caminata a paso vivo o bici floja, lo que te resulte más cómodo.' });
    if (sogaA.type === 'soga') sogaA = suave(sogaA, Math.min(35, sogaA.minutes));
    if (ligero.type === 'soga') ligero = Object.assign(suave(ligero, Math.min(30, ligero.minutes)), { eve: true, optional: true });
  }

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
  return Math.round(10 * kg + 6.25 * p.height - 5 * edad() + (p.sex === 'm' ? 5 : -161));
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
/* La edad sale de la fecha de nacimiento si está cargada, así no se
   desactualiza sola. Los perfiles viejos siguen usando el número suelto. */
function edad() {
  const b = S.profile.birth;
  if (b && /^\d{4}-\d{2}-\d{2}$/.test(b)) {
    const d = fromISO(b), h = new Date();
    let a = h.getFullYear() - d.getFullYear();
    const m = h.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < d.getDate())) a--;
    if (a > 0 && a < 120) return a;
  }
  return Number(S.profile.age) || 32;
}
function hrMax() { return S.profile.hrMax || Math.round(208 - 0.7 * edad()); }

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
  const a = edad();
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
async function zipEntryStream(file) {
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
  const entries = [];
  let off = 0;
  for (let n = 0; n < count && off + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(off, true) !== 0x02014b50) break;
    const nameLen = cd.getUint16(off + 28, true);
    const extraLen = cd.getUint16(off + 30, true);
    const commentLen = cd.getUint16(off + 32, true);
    entries.push({
      name: dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + off + 46, nameLen)),
      method: cd.getUint16(off + 10, true),
      compressedSize: cd.getUint32(off + 20, true),
      size: cd.getUint32(off + 24, true),
      localOffset: cd.getUint32(off + 42, true)
    });
    off += 46 + nameLen + extraLen + commentLen;
  }

  /* Salud traduce el nombre del archivo al idioma del teléfono: export.xml
     en inglés, exportación.xml en español, y así. Por eso elegimos el XML
     más grande en vez de buscar un nombre fijo. Se descarta el documento
     clínico (…_cda.xml), que es otra cosa y a veces es el único que sobra. */
  const xmls = entries
    .filter(e => /\.xml$/i.test(e.name) && !/cda/i.test(e.name) && e.size > 0)
    .sort((a, b) => b.size - a.size);
  const found = xmls[0];
  if (!found) {
    const lista = entries.map(e => e.name).filter(Boolean).slice(0, 6).join(', ');
    throw new Error('El .zip no contiene ningún archivo XML de datos. '
      + (lista ? `Adentro hay: ${lista}. ¿Seguro que es el que genera Salud?` : 'Parece estar vacío.'));
  }
  if (found.compressedSize === 0xffffffff || found.size === 0xffffffff) {
    throw new Error('El archivo usa formato ZIP64. Descomprimilo en el teléfono y elegí el XML.');
  }

  const lh = new DataView(await file.slice(found.localOffset, found.localOffset + 30).arrayBuffer());
  if (lh.getUint32(0, true) !== 0x04034b50) throw new Error(`No pude ubicar «${found.name}» dentro del .zip.`);
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
  const stream = isZip ? await zipEntryStream(file) : file.stream();
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
  /* Se mide sobre la serie principal: sumando la tendencia, un solo peso
     daban dos puntos y el gráfico salía degenerado. */
  if (!series.length || series[0].points.length < 2) {
    return `<div class="empty">Cargá al menos dos pesos para ver la curva.</div>`;
  }
  const all = series.flatMap(s => s.points);
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
  { i: '🎽', t: 'Al día',          f: () => { const h = hitoActual(); return !!h && h.estado !== 'atrasado' && h.estado !== 'sin-datos'; } },
  { i: '📌', t: '4 hitos seguidos', f: () => {
      let r = 0;
      for (let w = 1; w <= 12; w++) {
        const e = estadoSemana(w);
        if (!e || !e.cerrada || e.estado === 'sin-datos') continue;
        r = (e.estado === 'atrasado') ? 0 : r + 1;
        if (r >= 4) return true;
      }
      return false;
    } },
  { i: '⚖️', t: '-2 kg',           f: s => s.lost >= 2 },
  { i: '📉', t: '-5 kg',           f: s => s.lost >= 5 },
  { i: '🎯', t: 'Meta alcanzada',  f: () => currentWeight() <= S.profile.goalWeight },
  { i: '🏆', t: 'Desafío completo', f: s => s.perfectWeeks >= 10 }
];


/* ==================== estudios de laboratorio ======================
   Esto NO interpreta ni diagnostica: guarda los valores, los compara con
   rangos de referencia habituales de adulto y traduce lo que está fuera de
   rango a implicancias de entrenamiento. Los rangos varían entre
   laboratorios; manda siempre el del informe. Y manda el médico.

   Los ajustes que puede hacer al plan solo lo vuelven más suave o menos
   riesgoso: nunca suben la carga. */

const MARCADORES = [
  // ---- hemograma ----
  { g:'Hemograma', k:'hb', n:'Hemoglobina', u:'g/dL', ref:{m:[13.5,17.5], f:[12.0,15.5]},
    bajo:{ plan:'sinIntervalos', nota:'Menos oxígeno transportado a los músculos. La bici suave te va a costar más de lo esperado y los intervalos, mucho más. Hasta corregirlo conviene quedarse en ritmo conversado y no perseguir los tiempos del plan.' },
    alto:{ nota:'Puede deberse a deshidratación al momento del análisis, entre otras causas. Consultalo.' },
    critico:{ bajo:10 } },
  { g:'Hemograma', k:'hto', n:'Hematocrito', u:'%', ref:{m:[41,53], f:[36,46]},
    bajo:{ plan:'sinIntervalos', nota:'Acompaña a la hemoglobina baja: esperá más fatiga de la habitual al empezar.' },
    alto:{ nota:'Suele ir junto con deshidratación. Revisá cuánto tomás en el día.' } },
  { g:'Hemograma', k:'gb', n:'Glóbulos blancos', u:'mil/mm³', ref:{m:[3.8,11.0], f:[3.8,11.0]},
    alto:{ plan:'sinIntervalos', nota:'Puede indicar una infección en curso. No se entrena fuerte con una infección activa.' },
    bajo:{ nota:'Consultalo antes de seguir con el plan.' },
    critico:{ alto:20, bajo:2 } },

  // ---- hierro ----
  { g:'Hierro', k:'ferritina', n:'Ferritina', u:'ng/mL', ref:{m:[30,400], f:[15,150]},
    bajo:{ plan:'sinIntervalos', nota:'Reservas de hierro bajas: es de las causas más frecuentes de fatiga al retomar la actividad, incluso con hemoglobina normal. No suplementes por tu cuenta, el hierro de más es tóxico.' },
    alto:{ nota:'Puede reflejar inflamación además de sobrecarga de hierro. Consultalo.' } },
  { g:'Hierro', k:'hierro', n:'Hierro sérico', u:'µg/dL', ref:{m:[65,175], f:[50,170]},
    bajo:{ nota:'Miralo junto con la ferritina, que refleja mejor las reservas.' } },

  // ---- metabólico ----
  { g:'Metabólico', k:'glucosa', n:'Glucosa en ayunas', u:'mg/dL', ref:{m:[70,99], f:[70,99]},
    alto:{ nota:'El ejercicio aeróbico es de lo más efectivo que existe para esto: la salida larga es tu mejor herramienta. Si tomás medicación para la glucosa, consultá antes por el riesgo de hipoglucemia durante el ejercicio y llevá algo dulce encima.' },
    bajo:{ nota:'No entrenes en ayunas hasta revisarlo.' },
    critico:{ alto:250, bajo:60 } },
  { g:'Metabólico', k:'hba1c', n:'Hemoglobina glicosilada', u:'%', ref:{m:[4.0,5.6], f:[4.0,5.6]},
    alto:{ nota:'Refleja los últimos tres meses de glucemia. Entre 5,7 y 6,4 se considera prediabetes; 6,5 o más, diabetes. Es exactamente lo que este plan puede mejorar, pero consultalo.' },
    critico:{ alto:9 } },
  { g:'Metabólico', k:'insulina', n:'Insulina', u:'µU/mL', ref:{m:[2,25], f:[2,25]},
    alto:{ nota:'Suele acompañar a la resistencia a la insulina. Mejora con pérdida de peso y volumen aeróbico.' } },
  { g:'Metabólico', k:'homa', n:'HOMA', u:'', ref:{m:[0,1.0], f:[0,1.0]},
    alto:{ nota:'Entre 1 y 3,5 es zona dudosa; por encima de 3,5 se considera resistencia a la insulina. Es de los marcadores que mejor responden a bajar de peso y sumar volumen aeróbico.' } },

  // ---- lípidos ----
  { g:'Lípidos', k:'colesterol', n:'Colesterol total', u:'mg/dL', ref:{m:[0,200], f:[0,200]},
    alto:{ nota:'Mirá el desglose: lo que importa es la relación entre HDL y LDL, no el total solo.' } },
  { g:'Lípidos', k:'hdl', n:'Colesterol HDL', u:'mg/dL', ref:{m:[40,100], f:[50,100]},
    bajo:{ nota:'Es el que sube con el ejercicio aeróbico sostenido. Buen marcador para repetir en la semana 12.' } },
  { g:'Lípidos', k:'ldl', n:'Colesterol LDL', u:'mg/dL', ref:{m:[0,130], f:[0,130]},
    alto:{ nota:'Responde más a la alimentación que al entrenamiento, pero la pérdida de peso ayuda.' } },
  { g:'Lípidos', k:'trigliceridos', n:'Triglicéridos', u:'mg/dL', ref:{m:[0,150], f:[0,150]},
    alto:{ nota:'De todos los lípidos, es el que más responde al volumen aeróbico y a bajar de peso. Es muy probable que baje bastante en estas 12 semanas: repetilo al final, es de los cambios más motivantes de ver.' },
    critico:{ alto:500 } },

  // ---- hígado ----
  { g:'Hígado', k:'got', n:'GOT / AST', u:'U/L', ref:{m:[10,40], f:[10,35]},
    alto:{ nota:'Puede subir simplemente por haber entrenado los días previos: también sale del músculo, no solo del hígado.' } },
  { g:'Hígado', k:'gpt', n:'GPT / ALT', u:'U/L', ref:{m:[7,56], f:[7,45]},
    alto:{ nota:'Más específica del hígado. Con sobrepeso suele asociarse a hígado graso, que mejora justamente con pérdida de peso y ejercicio aeróbico. Evitá el alcohol y consultalo.' },
    critico:{ alto:200 } },
  { g:'Hígado', k:'ggt', n:'GGT', u:'U/L', ref:{m:[8,61], f:[5,36]},
    alto:{ nota:'Sensible al alcohol y al hígado graso.' } },
  { g:'Hígado', k:'ck', n:'CPK / CK', u:'U/L', ref:{m:[39,308], f:[26,192]},
    alto:{ plan:'sinImpacto', nota:'Refleja daño muscular; sube mucho tras entrenar fuerte o hacer algo desacostumbrado. Si además tenés dolor muscular intenso y orina oscura, no entrenes y consultá hoy mismo.' },
    critico:{ alto:1000 } },

  // ---- riñón ----
  { g:'Riñón', k:'creatinina', n:'Creatinina', u:'mg/dL', ref:{m:[0.7,1.3], f:[0.6,1.1]},
    alto:{ plan:'proteinaConCuidado', nota:'Antes de subir la proteína como sugiere la app, consultalo: con la función renal comprometida la recomendación cambia. En gente muy musculosa puede estar algo alta sin significar nada.' },
    critico:{ alto:2 } },
  { g:'Riñón', k:'urea', n:'Urea', u:'mg/dL', ref:{m:[15,45], f:[15,45]},
    alto:{ nota:'Puede reflejar deshidratación o mucha proteína en la dieta, además de función renal.' } },
  { g:'Riñón', k:'filtrado', n:'Filtrado glomerular', u:'mL/min', ref:{m:[90,200], f:[90,200]},
    bajo:{ plan:'proteinaConCuidado', nota:'Por debajo de 60 hay que revisar tanto la proteína como la hidratación en las salidas largas. Consultalo.' },
    critico:{ bajo:45 } },
  { g:'Riñón', k:'acidoUrico', n:'Ácido úrico', u:'mg/dL', ref:{m:[3.4,7.0], f:[2.4,6.0]},
    alto:{ plan:'sinImpacto', nota:'Riesgo de crisis de gota, y la deshidratación en las salidas largas puede desencadenarla. Tomá agua de sobra. Mientras esté alto conviene bajar el impacto de la soga.' } },

  // ---- tiroides ----
  { g:'Tiroides', k:'tsh', n:'TSH', u:'µUI/mL', ref:{m:[0.4,4.0], f:[0.4,4.0]},
    alto:{ plan:'sinIntervalos', nota:'Un hipotiroidismo puede explicar fatiga, frío y dificultad para bajar de peso pese a hacer todo bien. Es tratable y cambia mucho las cosas: consultalo.' },
    bajo:{ plan:'sinIntervalos', nota:'Un hipertiroidismo altera la frecuencia cardíaca y la tolerancia al ejercicio. Consultá antes de hacer trabajo intenso.' },
    critico:{ alto:10, bajo:0.1 } },
  { g:'Tiroides', k:'t4l', n:'T4 libre', u:'ng/dL', ref:{m:[0.8,1.8], f:[0.8,1.8]},
    bajo:{ nota:'Miralo junto con la TSH.' }, alto:{ nota:'Miralo junto con la TSH.' } },

  // ---- vitaminas e inflamación ----
  { g:'Vitaminas e inflamación', k:'vitd', n:'Vitamina D (25-OH)', u:'ng/mL', ref:{m:[30,100], f:[30,100]},
    bajo:{ nota:'Déficit muy frecuente. Se asocia a menos fuerza y peor recuperación. Andar en bici de día ayuda; si está muy baja, se corrige con suplementación indicada por tu médico.' } },
  { g:'Vitaminas e inflamación', k:'b12', n:'Vitamina B12', u:'pg/mL', ref:{m:[200,900], f:[200,900]},
    bajo:{ nota:'Puede dar fatiga y hormigueos. Consultalo.' } },
  { g:'Vitaminas e inflamación', k:'folato', n:'Ácido fólico', u:'ng/mL', ref:{m:[5.3,30], f:[5.3,30]},
    bajo:{ nota:'Puede dar fatiga. Consultalo.' } },
  { g:'Vitaminas e inflamación', k:'pcr', n:'PCR ultrasensible', u:'mg/L', ref:{m:[0,3], f:[0,3]},
    alto:{ plan:'sinIntervalos', nota:'Inflamación. Si es por una infección en curso, no es momento de entrenar fuerte. Si es persistente, el ejercicio y bajar de peso tienden a bajarla.' },
    critico:{ alto:10 } },

  // ---- iones ----
  { g:'Iones', k:'sodio', n:'Sodio', u:'mEq/L', ref:{m:[135,145], f:[135,145]},
    bajo:{ plan:'sinIntervalos', nota:'Importa para las salidas largas: tomar solo agua en sesiones de más de una hora puede bajarlo más. Consultalo.' },
    critico:{ bajo:130, alto:150 } },
  { g:'Iones', k:'magnesio', n:'Magnesio', u:'mg/dL', ref:{m:[1.6,2.6], f:[1.6,2.6]},
    bajo:{ nota:'Bajo se asocia a calambres, justo lo que aparece en las salidas largas y en la soga.' } },
  { g:'Iones', k:'potasio', n:'Potasio', u:'mEq/L', ref:{m:[3.5,5.1], f:[3.5,5.1]},
    bajo:{ plan:'sinIntervalos', nota:'Fuera de rango afecta al ritmo cardíaco. Consultá antes de hacer esfuerzos intensos.' },
    alto:{ plan:'sinIntervalos', nota:'Fuera de rango afecta al ritmo cardíaco, y el ejercicio intenso lo sube de forma transitoria. La causa más frecuente de un potasio algo alto es un artefacto de la extracción — hemólisis, torniquete apretado, abrir y cerrar la mano — así que lo primero es repetirlo. Hasta confirmarlo, consultá antes de hacer esfuerzos máximos.' },
    critico:{ bajo:3.0, alto:5.5 } },

  // ---- orina ----
  { g:'Orina', k:'densidad', n:'Densidad', u:'', ref:{m:[1.005,1.030], f:[1.005,1.030]},
    alto:{ nota:'Orina concentrada: estabas deshidratado al hacer el estudio. Es la variable más fácil de corregir de toda esta lista y la que más te va a cambiar cómo te sentís arriba de la bici.' } },
  { g:'Orina', k:'phU', n:'pH', u:'', ref:{m:[4.5,8.0], f:[4.5,8.0]} },
  { g:'Orina', k:'proteinasU', n:'Proteínas', u:'', cualitativo:true,
    alto:{ nota:'Puede aparecer transitoriamente después de ejercicio intenso, pero también marcar algo renal. Consultalo antes de seguir subiendo la carga.' } },
  { g:'Orina', k:'glucosaU', n:'Glucosa', u:'', cualitativo:true,
    alto:{ nota:'Glucosa en orina suele acompañar glucemias altas. Consultalo.' } },
  { g:'Orina', k:'cetonasU', n:'Cetonas', u:'', cualitativo:true,
    alto:{ nota:'Aparecen con ayuno prolongado o dietas muy bajas en carbohidratos. Si estás haciendo déficit, revisá que no sea demasiado agresivo.' } },
  { g:'Orina', k:'hematiesU', n:'Hematíes / sangre', u:'', cualitativo:true,
    alto:{ plan:'sinImpacto', nota:'Puede aparecer tras ejercicio intenso, pero hay que descartar otras causas. Consultalo antes de seguir.' } },
  { g:'Orina', k:'leucocitosU', n:'Leucocitos', u:'', cualitativo:true,
    alto:{ nota:'Puede indicar infección urinaria. Consultalo.' } }
];

const GRUPOS = [...new Set(MARCADORES.map(m => m.g))];
const marcador = k => MARCADORES.find(m => m.k === k);
const refDe = m => (m.ref ? (m.ref[S.profile.sex] || m.ref.m) : null);

/* Devuelve cómo cae un valor: dentro de rango, bajo, alto, y si cruza un
   umbral en el que corresponde parar y consultar antes de entrenar. */
function evaluarValor(m, v) {
  if (v === '' || v == null) return null;
  if (m.cualitativo) {
    const positivo = String(v) !== 'neg';
    return { estado: positivo ? 'alto' : 'ok', critico: false };
  }
  const n = Number(v);
  if (!isFinite(n)) return null;
  const r = refDe(m);
  const c = m.critico || {};
  const critico = (c.bajo != null && n < c.bajo) || (c.alto != null && n > c.alto);
  let estado = 'ok';
  if (r && n < r[0]) estado = 'bajo';
  else if (r && n > r[1]) estado = 'alto';
  return { estado, critico };
}

function hallazgos(est) {
  const out = [];
  MARCADORES.forEach(m => {
    const v = est.values[m.k];
    const e = evaluarValor(m, v);
    if (!e || e.estado === 'ok') return;
    const info = m[e.estado] || {};
    out.push({ m, valor: v, estado: e.estado, critico: e.critico,
               nota: info.nota || '', plan: info.plan || '' });
  });
  return out.sort((a, b) => (b.critico ? 1 : 0) - (a.critico ? 1 : 0));
}

function ultimoEstudio() {
  if (!S.labs || !S.labs.length) return null;
  return S.labs.slice().sort((a, b) => a.date < b.date ? 1 : -1)[0];
}

/* Banderas que el plan respeta, solo del estudio más reciente y solo si
   está marcado para aplicarse. */
function banderasPlan() {
  const est = ultimoEstudio();
  const set = new Set();
  if (!est || est.aplicar === false) return set;
  hallazgos(est).forEach(h => { if (h.plan) set.add(h.plan); });
  return set;
}
function hayAlerta() {
  const est = ultimoEstudio();
  return est ? hallazgos(est).some(h => h.critico) : false;
}


/* ==================== hitos de peso por semana ====================
   El desafío reparte la bajada total en las 12 semanas de forma pareja.
   Se compara contra una banda, no contra un número exacto: el peso de un
   día concreto tiene ruido de sobra —agua, comida, hora— y exigir un valor
   puntual convierte una semana buena en una decepción. */
const TOLERANCIA = 1.0;   // kg de margen a cada lado

function bajadaTotal() {
  const p = S.profile;
  const t = p.startWeight - p.goalWeight;
  return t > 0 ? t : 0;
}
/* Peso objetivo al día d del desafío (0 = arranque, 84 = final). */
function objetivoDia(d) {
  return S.profile.startWeight - bajadaTotal() * (clamp(d, 0, 84) / 84);
}
const objetivoSemana = n => objetivoDia(n * 7);

/* Último peso registrado hasta el cierre de la semana n. */
function pesoHastaSemana(n) {
  const fin = addDays(S.profile.startDate, n * 7 - 1);
  const c = S.weights.filter(w => w.date <= fin).sort((a, b) => a.date < b.date ? 1 : -1);
  return c.length ? c[0] : null;
}

/* Estado de una semana ya cerrada, o de la que está en curso. */
function estadoSemana(n) {
  if (!bajadaTotal()) return null;
  const obj = objetivoSemana(n);
  const reg = pesoHastaSemana(n);
  const cerrada = daysBetween(S.profile.startDate, today()) >= n * 7;
  if (!reg) return { n, obj, cerrada, estado: 'sin-datos' };
  const dif = reg.kg - obj;
  let estado;
  if (dif <= -TOLERANCIA) estado = 'adelantado';
  else if (dif <= TOLERANCIA) estado = 'en-camino';
  else estado = 'atrasado';
  return { n, obj, cerrada, estado, kg: reg.kg, dif, fecha: reg.date };
}

function hitoActual() {
  const n = currentWeek();
  const e = estadoSemana(n);
  if (!e) return null;
  const p = S.profile;
  const bajado = p.startWeight - currentWeight();
  const deberia = p.startWeight - objetivoSemana(n);
  return Object.assign(e, { bajado, deberia });
}

const TEXTO_ESTADO = {
  'adelantado': 'Vas por delante del objetivo',
  'en-camino': 'Estás en el objetivo de la semana',
  'atrasado': 'Vas por detrás del objetivo',
  'sin-datos': 'Todavía no registraste tu peso'
};

/* El consejo cambia según dónde estés parado, y las tres primeras semanas
   llevan una advertencia aparte: al empezar a entrenar los músculos retienen
   agua y la balanza puede quedarse quieta aunque estés perdiendo grasa. */
function consejoHito(h) {
  if (!h) return '';
  if (h.n <= 3) {
    return 'Ojo con las primeras semanas: al empezar a entrenar los músculos retienen agua y '
      + 'glucógeno, y la balanza puede quedarse quieta o hasta subir aunque estés perdiendo grasa. '
      + 'Mirá la línea de tendencia, no el número del día.';
  }
  if (h.estado === 'atrasado') {
    return 'Entrenando quemás entre 2.600 y 4.000 kcal por semana, que son unos 400 gramos. '
      + 'El resto sale de la comida: si el peso no se mueve, la palanca está ahí, no en sumar sesiones. '
      + 'Antes de cambiar nada, fijate que estés haciendo la salida larga completa.';
  }
  if (h.estado === 'adelantado') {
    return 'Vas bien, pero no aceleres: bajar más rápido que un kilo por semana suele costar músculo '
      + 'además de grasa, y eso baja tu metabolismo justo cuando lo necesitás alto.';
  }
  return 'Vas justo donde tenés que ir. Sostener esto once semanas más es todo el desafío.';
}


/* ====================== nutrición ==========================
   Base de alimentos de consumo habitual en Argentina, medidos en porciones
   reales —un mate, una milanesa, un pote de yogur— porque nadie pesa lo que
   come. Los valores son aproximados por definición: una milanesa casera y
   una de rotisería no se parecen. Sirven para ver tendencias y órdenes de
   magnitud, no para contar gramos.
   Formato: [clave, nombre, porción, kcal, proteína, grasa, carbohidratos, sinónimos] */
const ALIMENTOS = [
  // --- infusiones y bebidas ---
  ['mate','Mate amargo','1 mate cebado',3,0.3,0,0.5,'yerba amargo'],
  ['mate_dulce','Mate dulce','1 mate cebado',28,0.3,0,7,'yerba azucarado'],
  ['mate_cocido','Mate cocido','1 taza',5,0.3,0,1,''],
  ['cafe','Café solo','1 pocillo',2,0.2,0,0,'expreso negro'],
  ['cafe_leche','Café con leche','1 taza',100,5,5,8,'cortado grande'],
  ['cortado','Cortado','1 taza chica',70,3.4,3.5,5,''],
  ['te','Té','1 taza',2,0,0,0,'infusion'],
  ['leche','Leche entera','1 vaso',124,6.4,6.6,9.6,''],
  ['leche_desc','Leche descremada','1 vaso',74,6.8,1,9.8,'leche light'],
  ['agua','Agua','1 vaso',0,0,0,0,'soda'],
  ['gaseosa','Gaseosa','1 vaso',105,0,0,26,'coca sprite refresco'],
  ['gaseosa_light','Gaseosa light','1 vaso',1,0,0,0,'coca zero sin azucar'],
  ['jugo','Jugo de naranja','1 vaso',90,1.4,0.4,21,'exprimido'],
  ['cerveza','Cerveza','1 porrón',140,1.6,0,11,'birra chop'],
  ['vino','Vino','1 copa',125,0.1,0,4,'tinto blanco malbec'],
  ['fernet','Fernet con coca','1 vaso',220,0,0,26,'gancia aperitivo'],
  ['licuado','Licuado de banana','1 vaso',220,8,6,34,'batido'],
  // --- desayuno y merienda ---
  ['granola_sa','Granola sin azúcar','1 pote chico',180,5,8,22,'cereal avena'],
  ['granola','Granola','1 pote chico',195,4.5,7,28,'cereal'],
  ['avena','Avena','3 cucharadas',113,4,2,20,'porridge'],
  ['yogur','Yogur natural','1 pote',110,9,3,12,''],
  ['yogur_desc','Yogur descremado','1 pote',85,9,1,12,'light'],
  ['yogur_cereal','Yogur con cereal','1 pote',180,8,4,28,''],
  ['pan','Pan francés','1 unidad',160,5,1,33,'flauta mignon felipe'],
  ['pan_lactal','Pan lactal','1 rebanada',75,2.5,1,13,'molde'],
  ['tostada','Tostada','1 unidad',70,2.4,1,12,'tostadas'],
  ['gall_agua','Galletitas de agua','4 unidades',120,2.5,4,18,'crackers'],
  ['gall_dulces','Galletitas dulces','4 unidades',180,2,7,28,'obleas'],
  ['medialuna','Medialuna','1 unidad',180,3.5,9,22,'croissant'],
  ['factura','Factura','1 unidad',200,4,10,24,'bola fraile vigilante'],
  ['queso_untable','Queso untable','1 cucharada',45,1.5,4,1,'crema philadelphia'],
  ['ddl','Dulce de leche','1 cucharada',65,1,1.5,12,''],
  ['mermelada','Mermelada','1 cucharada',50,0,0,13,'jalea'],
  ['manteca','Manteca','1 cucharadita',60,0,6.7,0,'mantequilla'],
  ['miel','Miel','1 cucharada',64,0,0,17,''],
  ['azucar','Azúcar','1 cucharadita',20,0,0,5,''],
  // --- huevos y quesos ---
  ['huevo','Huevo duro','1 unidad',78,6.3,5.3,0.6,'hervido'],
  ['huevo_frito','Huevo frito','1 unidad',92,6.3,7,0.6,'revuelto'],
  ['queso_cremoso','Queso cremoso','1 feta',90,6,7,1,'port salut'],
  ['queso_rallado','Queso rallado','1 cucharada',25,2,1.8,0.2,'parmesano'],
  ['ricota','Ricota','2 cucharadas',87,6,6,1.5,''],
  ['muzzarella','Muzzarella','1 porción',140,12,10,1.5,'mozzarella'],
  // --- carnes ---
  ['mila_carne','Milanesa de carne al horno','1 unidad',330,28,18,14,'milanga'],
  ['mila_frita','Milanesa frita','1 unidad',450,28,28,18,'milanga'],
  ['mila_pollo','Milanesa de pollo al horno','1 unidad',300,30,12,14,'milanga'],
  ['bife','Bife a la plancha','1 unidad',280,40,13,0,'carne nalga cuadril'],
  ['bife_chorizo','Bife de chorizo','1 unidad',460,44,30,0,'ojo'],
  ['asado','Asado de tira','1 porción',500,38,38,0,'costilla parrilla'],
  ['vacio','Vacío','1 porción',420,40,28,0,'parrilla'],
  ['chorizo','Chorizo','1 unidad',300,13,27,2,'parrilla'],
  ['morcilla','Morcilla','1 unidad',250,10,22,3,''],
  ['pechuga','Pechuga de pollo','1 porción',250,46,6,0,'pollo suprema'],
  ['pollo_muslo','Pata muslo de pollo','1 unidad',280,26,19,0,'pollo'],
  ['hamburguesa','Hamburguesa casera','1 medallón',250,20,18,2,'burger'],
  ['hamburguesa_full','Hamburguesa completa','1 unidad',550,28,30,40,'burger doble'],
  ['pancho','Pancho','1 unidad',300,10,17,26,'hot dog salchicha'],
  ['merluza','Merluza','1 filete',140,28,3,0,'pescado'],
  ['salmon','Salmón','1 porción',310,34,18,0,'pescado'],
  ['atun','Atún al natural','1 lata',130,29,1,0,'pescado'],
  ['bondiola','Bondiola de cerdo','1 porción',340,32,23,0,'cerdo'],
  ['jamon','Jamón cocido','2 fetas',60,9,2.5,1,'fiambre'],
  ['salame','Salame','5 fetas',150,8,13,0.5,'fiambre'],
  // --- guarniciones ---
  ['fideos','Fideos','1 plato',260,9,1.5,52,'pasta tallarines'],
  ['fideos_salsa','Fideos con salsa','1 plato',350,11,6,60,'pasta tuco'],
  ['noquis','Ñoquis','1 plato',380,10,6,70,'pasta'],
  ['ravioles','Ravioles con salsa','1 plato',450,18,14,62,'pasta sorrentinos'],
  ['arroz','Arroz','1 plato',260,5,0.6,57,''],
  ['papa','Papa hervida','1 mediana',130,3,0.2,30,''],
  ['pure','Puré de papas','1 plato',220,4,7,35,''],
  ['papas_fritas','Papas fritas','1 porción',450,5,22,58,''],
  ['batata','Batata','1 mediana',130,2,0.2,31,'boniato'],
  ['polenta','Polenta','1 plato',200,4,1,44,''],
  ['lentejas','Lentejas','1 plato',320,18,6,50,'guiso legumbres'],
  ['porotos','Porotos','1 plato',300,17,2,52,'legumbres'],
  ['garbanzos','Garbanzos','1 plato',330,17,5,55,'legumbres'],
  ['choclo','Choclo','1 unidad',130,4,1.5,28,'maiz'],
  // --- verduras ---
  ['ensalada','Ensalada mixta','1 plato',45,2,0.3,9,'verduras'],
  ['tomate','Tomate','1 unidad',22,1,0.2,5,''],
  ['zanahoria','Zanahoria','1 unidad',30,0.7,0.2,7,''],
  ['brocoli','Brócoli','1 porción',35,3,0.4,7,'verdura'],
  ['zapallo','Zapallo','1 porción',45,1,0.1,11,'calabaza'],
  ['palta','Palta','media unidad',160,2,15,9,'aguacate'],
  ['aceite','Aceite de oliva','1 cucharada',120,0,13.5,0,''],
  ['mayonesa','Mayonesa','1 cucharada',95,0.2,10,0.5,''],
  ['ketchup','Ketchup','1 cucharada',20,0.2,0,5,'salsa'],
  // --- platos ---
  ['empanada','Empanada de carne','1 unidad',280,12,16,22,''],
  ['empanada_jq','Empanada de jamón y queso','1 unidad',270,11,15,22,''],
  ['empanada_humita','Empanada de humita','1 unidad',260,8,13,27,''],
  ['pizza','Porción de pizza','1 porción',280,12,11,33,'muzzarella'],
  ['tarta','Tarta de verdura','1 porción',300,11,17,25,''],
  ['sandwich_miga','Sándwich de miga','2 triples',240,9,10,28,''],
  ['tostado','Tostado de jamón y queso','1 unidad',350,18,16,32,'carlitos'],
  ['choripan','Choripán','1 unidad',480,17,30,35,''],
  // --- frutas ---
  ['banana','Banana','1 unidad',105,1.3,0.4,27,'fruta'],
  ['manzana','Manzana','1 unidad',95,0.5,0.3,25,'fruta'],
  ['naranja','Naranja','1 unidad',62,1.2,0.2,15,'fruta'],
  ['mandarina','Mandarina','1 unidad',47,0.7,0.3,12,'fruta'],
  ['pera','Pera','1 unidad',100,0.6,0.2,27,'fruta'],
  ['uvas','Uvas','1 taza',104,1,0.2,27,'fruta'],
  ['frutillas','Frutillas','1 taza',50,1,0.5,12,'fruta'],
  ['kiwi','Kiwi','1 unidad',42,0.8,0.4,10,'fruta'],
  ['durazno','Durazno','1 unidad',59,1.4,0.4,14,'fruta'],
  // --- snacks y dulces ---
  ['alfajor','Alfajor simple','1 unidad',220,3,9,32,''],
  ['alfajor_triple','Alfajor triple','1 unidad',350,5,16,48,''],
  ['chocolate','Chocolate','1 barra',220,3,13,24,''],
  ['barrita','Barrita de cereal','1 unidad',110,1.5,3,20,''],
  ['mani','Maní','1 puñado',170,7,14,6,'frutos secos'],
  ['almendras','Almendras','1 puñado',175,6,15,6,'frutos secos'],
  ['nueces','Nueces','1 puñado',200,5,20,4,'frutos secos'],
  ['papitas','Papas fritas de paquete','1 paquete chico',270,3,17,26,'snack'],
  ['helado','Helado','1 bocha',130,2.5,7,15,''],
  ['flan','Flan con dulce de leche','1 porción',300,8,10,45,'postre'],
  ['torta','Torta','1 porción',350,5,15,50,'postre budin']
];

const COMIDAS = [['desayuno','Desayuno'],['almuerzo','Almuerzo'],
                 ['merienda','Merienda'],['cena','Cena'],['snack','Snack']];

const normalizar = t => String(t || '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9\/ ]/g, ' ').replace(/\s+/g, ' ').trim();

const VACIAS = new Set(['de','del','con','sin','y','e','un','una','unos','unas','el','la','los','las',
  'mi','me','al','a','en','por','para','o','u','poco','poquito','mucho','algo','tomo','comi','desayuno',
  'almuerzo','merienda','cena','tome','comer','plato','vaso','taza','pote','unidad','porcion']);

const CANTIDADES = { 'medio':0.5, 'media':0.5, '1/2':0.5, 'un':1, 'una':1, 'dos':2, 'tres':3,
  'cuatro':4, 'cinco':5, 'seis':6, 'doble':2 };
const TAMANOS = { 'chico':0.7, 'chica':0.7, 'chiquito':0.7, 'pequeno':0.7, 'mini':0.6,
  'grande':1.4, 'grandote':1.5, 'enorme':1.6 };

/* Los plurales se comparan en singular: "dos medialunas" tiene que
   encontrar "Medialuna". */
const singular = w => (w.length > 4 && w.endsWith('es')) ? w.slice(0, -2)
                    : (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w;

const significativas = t => normalizar(t).split(' ').filter(w => w && !VACIAS.has(w)
  && !(w in CANTIDADES) && !(w in TAMANOS) && !/^\d+$/.test(w));

/* Puntúa cuántas palabras del fragmento aparecen en el alimento, y descuenta
   por cada palabra del alimento que el fragmento no menciona: sin ese castigo
   "banana" caía en "Licuado de banana", que la contiene. */
function puntuar(pal, a) {
  const tokens = significativas(a[1] + ' ' + a[7]).map(singular);
  const campo = normalizar(a[1] + ' ' + a[7]);
  const usados = new Set();
  let punto = 0;
  pal.forEach(w0 => {
    const w = singular(w0);
    const i = tokens.indexOf(w);
    if (i >= 0) { punto += 2 + Math.min(w.length, 8) / 8; usados.add(w); return; }
    if (w.length >= 4 && campo.includes(w0)) { punto += 1.2; return; }
    const pref = tokens.find(t => t.length >= 5 && w.length >= 5
      && (t.startsWith(w.slice(0, 5)) || w.startsWith(t.slice(0, 5))));
    if (pref) { punto += 1.4; usados.add(pref); }
  });
  const propias = significativas(a[1]).map(singular);
  const sobran = propias.filter(t => !usados.has(t)).length;
  return { punto: punto - sobran * 0.35, usados };
}

function buscarAlimento(fragmento) {
  const pal = significativas(fragmento);
  if (!pal.length) return null;
  let mejor = null, mejorPunto = 0;
  ALIMENTOS.forEach(a => {
    const r = puntuar(pal, a);
    if (r.punto > mejorPunto) { mejorPunto = r.punto; mejor = a; }
  });
  return mejorPunto >= 1.5 ? mejor : null;
}

/* Un mismo fragmento puede traer más de un alimento: "milanesa de pollo con
   puré" son dos. Se extrae el mejor, se sacan las palabras que consumió y se
   vuelve a buscar en lo que queda. "Café con leche" sobrevive entero porque
   la primera pasada se lleva las dos palabras. */
function extraerAlimentos(fragmento) {
  let pal = significativas(fragmento);
  const salida = [];
  for (let vuelta = 0; vuelta < 4 && pal.length; vuelta++) {
    let mejor = null, mejorPunto = 0, mejorUsados = null;
    ALIMENTOS.forEach(a => {
      const r = puntuar(pal, a);
      if (r.punto > mejorPunto) { mejorPunto = r.punto; mejor = a; mejorUsados = r.usados; }
    });
    if (!mejor || mejorPunto < 1.5) break;
    salida.push(mejor);
    const antes = pal.length;
    pal = pal.filter(w => !mejorUsados.has(singular(w)));
    if (pal.length === antes) break;
  }
  return salida;
}

/* Divide el texto en fragmentos y traduce cada uno a alimentos con su cantidad. */
function interpretarComida(texto) {
  const partes = String(texto || '').split(/,| y | mas | \+ |\+/i).map(x => x.trim()).filter(Boolean);
  const items = [], sinReconocer = [];
  partes.forEach(fr => {
    const encontrados = extraerAlimentos(fr);
    if (!encontrados.length) { if (significativas(fr).length) sinReconocer.push(fr); return; }
    let q = 1, esc = 1;
    normalizar(fr).split(' ').forEach(w => {
      if (w in CANTIDADES) q = CANTIDADES[w];
      else if (/^\d+$/.test(w)) q = Math.min(20, Number(w));
      if (w in TAMANOS) esc = TAMANOS[w];
    });
    // La cantidad se aplica al primero: "dos milanesas con puré" son dos
    // milanesas y un puré, no dos de cada cosa.
    encontrados.forEach((a, i) => items.push({ a, q: i === 0 ? Math.round(q * esc * 100) / 100 : 1 }));
  });
  return { items, sinReconocer };
}

const nutrDe = (a, q) => ({ kcal: a[3]*q, pr: a[4]*q, gr: a[5]*q, ch: a[6]*q });

function comidasDe(fecha) {
  return (S.foods || []).filter(f => f.date === fecha);
}
function totalesDe(fecha) {
  const t = { kcal:0, pr:0, gr:0, ch:0 };
  comidasDe(fecha).forEach(f => { t.kcal += f.kcal; t.pr += f.pr; t.gr += f.gr; t.ch += f.ch; });
  return t;
}
/* Objetivos del día: las calorías ya las calcula la app, la proteína respeta
   la bandera renal de los estudios, y la grasa se toma como el 28% del total. */
function objetivosDia() {
  const w = currentWeight();
  const kcal = Math.max(1200, tdee(w) - 550);
  const riñon = banderasPlan().has('proteinaConCuidado');
  return { kcal, pr: riñon ? null : Math.round(w * 1.6), gr: Math.round(kcal * 0.28 / 9) };
}
function frecuentes(n) {
  const cuenta = {};
  (S.foods || []).forEach(f => { cuenta[f.k] = (cuenta[f.k] || 0) + 1; });
  return Object.entries(cuenta).sort((a,b) => b[1]-a[1]).slice(0, n)
    .map(([k]) => ALIMENTOS.find(a => a[0] === k)).filter(Boolean);
}
const momentoDelDia = () => {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 15) return 'almuerzo';
  if (h < 19) return 'merienda';
  if (h < 23) return 'cena';
  return 'snack';
};

/* ------------------------------ render ----------------------------- */
function render() {
  renderTopbar();
  renderToday();
  renderPlan();
  renderLog();
  renderWeight();
  renderProgress();
  renderHitos();
  renderComida();
  renderLabs();
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
        ${s.ajuste ? '<span class="pill ajuste">ajustado por tus estudios</span>' : ''}
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
let lastScan = null;          // última exploración de un archivo de Salud
let importRango = 'inicio';
const MAX_ROWS = 40;

const RANGOS = [
  ['inicio', 'el inicio del desafío'],
  ['90',     'los últimos 3 meses'],
  ['365',    'el último año'],
  ['todo',   'siempre']
];
function rangoDesde(r) {
  if (r === 'todo') return '0000-01-01';
  if (r === '90') return addDays(today(), -90);
  if (r === '365') return addDays(today(), -365);
  return S.profile.startDate;
}
function cuentaEn(r) {
  if (!lastScan) return 0;
  const d = rangoDesde(r);
  return lastScan.workouts.filter(w => w.date >= d).length;
}

/* Re-filtra lo ya leído del archivo: cambiar el rango no vuelve a abrirlo. */
function aplicarRango(r) {
  if (!lastScan) return;
  importRango = r;
  const desde = rangoDesde(r);
  const orden = (a, b) => a.date < b.date ? -1 : 1;
  pending = lastScan.workouts.filter(w => w.date >= desde).sort(orden);
  pendingWeights = lastScan.weights.filter(w => w.date >= desde).sort(orden);

  const total = lastScan.workouts.length;
  const cabeza = `Leí ${lastScan.mb} MB de ${lastScan.nombre}: ${total} entrenamiento${total === 1 ? '' : 's'} en total. `;
  if (!total) {
    importNote = cabeza + 'Salud no tiene ninguno guardado. Revisá que en Zepp esté activada la '
      + 'sincronización con Apple Salud (Perfil → Ajustes → Apple Salud) y que hayas elegido el .zip '
      + 'que genera Salud. Mientras tanto podés traer las actividades una por una en TCX desde Zepp.'
      + (pendingWeights.length ? ` Los ${pendingWeights.length} registros de peso sí están.` : '');
  } else if (!pending.length && !pendingWeights.length) {
    importNote = cabeza + `Ninguno es posterior al ${fmtDate(desde)}. Ampliá el rango acá abajo para traerlos.`;
  } else {
    const fuera = total - pending.length;
    importNote = cabeza + `Listos para agregar: ${pending.length}`
      + (pendingWeights.length ? ` y ${pendingWeights.length} registro${pendingWeights.length === 1 ? '' : 's'} de peso` : '')
      + '.'
      + (fuera ? ` Quedan ${fuera} fuera del rango: ampliá abajo si los querés.` : '');
  }
  renderImport();
}

let headFor = null;

/* El selector de rango vive en su propio contenedor y NO se reconstruye
   cuando cambian las filas. Rehacerlo con innerHTML mientras el usuario lo
   está tocando destruye el elemento en pleno gesto: en iOS el selector
   puede quedar mostrando una opción que la app nunca llegó a aplicar. */
function renderRangoSelector() {
  const head = $('#impHead');
  if (!head) return;
  if (!lastScan) { head.innerHTML = ''; headFor = null; return; }
  if (headFor === lastScan) {
    const sel = $('#impRango');
    if (sel && sel.value !== importRango) sel.value = importRango;
    return;
  }
  headFor = lastScan;
  head.innerHTML = `<label class="import-rango">Traer desde
    <select id="impRango">${RANGOS.map(([v, t]) =>
      `<option value="${v}"${v === importRango ? ' selected' : ''}>${t} · ${cuentaEn(v)}</option>`).join('')}</select>
  </label>`;
}

function filaImportada(c, i) {
  const opts = [['bici','🚴 Bici'],['soga','🪢 Soga'],['futbol','⚽ Fútbol'],
                ['fuerza','💪 Fuerza'],['movilidad','🚶 Caminata'],['otro','✳️ Otro']];
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
}

function renderImport() {
  const box = $('#importPreview');
  if (!box) return;
  if (!$('#impHead')) box.innerHTML = '<div id="impHead"></div><div id="impBody" class="stack"></div>';
  renderRangoSelector();

  const body = $('#impBody');
  const nuevosPesos = pendingWeights.filter(w => !S.weights.some(x => x.date === w.date));
  const nota = importNote ? `<p class="import-note">${esc(importNote)}</p>` : '';

  if (!pending.length && !nuevosPesos.length) {
    // Estado explícito: sin esto la tarjeta se corta y parece que se rompió.
    body.innerHTML = nota + (lastScan
      ? `<div class="empty">No hay nada para agregar en este rango. Elegí uno más amplio en «Traer desde».</div>`
      : '');
    return;
  }

  body.innerHTML = nota
    + pending.slice(0, MAX_ROWS).map(filaImportada).join('')
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

function renderComida() {
  const cont = $('#comidaLista');
  if (!cont) return;
  const fecha = $('#comidaDate').value || today();
  $('#comidaFecha').textContent = fecha === today() ? 'hoy' : fmtDate(fecha);

  const t = totalesDe(fecha), obj = objetivosDia();
  const r = Math.round;
  const barra = (val, meta, invertido) => {
    const pct = meta ? Math.min(100, val / meta * 100) : 0;
    const cls = !meta ? '' : (val > meta * 1.05 ? (invertido ? ' ok' : ' pasado')
                : (val >= meta * 0.9 ? ' ok' : ''));
    return `<div class="barra${cls}"><i style="width:${pct.toFixed(0)}%"></i></div>`;
  };

  const resto = obj.kcal - t.kcal;
  $('#comidaResto').textContent = resto >= 0
    ? `te quedan ${r(resto)} kcal` : `${r(-resto)} kcal por encima`;

  $('#comidaTotales').innerHTML =
    `<div class="macro"><b>${r(t.kcal)} kcal</b><span>de ${r(obj.kcal)}</span></div>
     ${barra(t.kcal, obj.kcal)}
     <div class="macro"><b>${r(t.pr)} g de proteína</b><span>${obj.pr ? 'de ' + obj.pr : 'sin objetivo: revisá el riñón'}</span></div>
     ${barra(t.pr, obj.pr, true)}
     <div class="macro-min">
       <div><b>${r(t.gr)} g</b><span>grasa · sugerido ${obj.gr}</span></div>
       <div><b>${r(t.ch)} g</b><span>carbohidratos</span></div>
     </div>`;

  const delDia = comidasDe(fecha);
  if (!delDia.length) {
    cont.innerHTML = `<div class="empty">Todavía no cargaste nada de ${fecha === today() ? 'hoy' : 'ese día'}.</div>`;
  } else {
    cont.innerHTML = COMIDAS.map(([k, etiqueta]) => {
      const items = delDia.filter(f => f.tipo === k);
      if (!items.length) return '';
      const sub = items.reduce((a, b) => a + b.kcal, 0);
      return `<div class="grupo-comida">
        <h3><span>${etiqueta}</span><span>${r(sub)} kcal</span></h3>
        ${items.map(f => `<article class="plato">
          <div class="plato-body">
            <b>${esc(f.n)}</b>
            <span>${esc(f.porcion)} · ${r(f.kcal)} kcal · ${f.pr.toFixed(1)} g prot · ${f.gr.toFixed(1)} g grasa</span>
          </div>
          <div class="cant">
            <button type="button" data-qmenos="${f.id}" aria-label="Menos">−</button>
            <b>${f.q}</b>
            <button type="button" data-qmas="${f.id}" aria-label="Más">+</button>
          </div>
          <button class="entry-del" data-delcomida="${f.id}" aria-label="Borrar">×</button>
        </article>`).join('')}
      </div>`;
    }).join('');
  }

  const frec = frecuentes(8);
  $('#frecuentesCard').hidden = !frec.length;
  $('#frecuentes').innerHTML = frec.map(a =>
    `<button type="button" data-frec="${a[0]}">${esc(a[1])}</button>`).join('');
}

function agregarAlimento(a, q, tipo, fecha) {
  const n = nutrDe(a, q);
  S.foods.push({ id: 'c' + Date.now() + Math.round(Math.random() * 999),
    date: fecha, tipo, k: a[0], n: a[1], porcion: a[2], q,
    kcal: n.kcal, pr: n.pr, gr: n.gr, ch: n.ch });
}
function recalcular(f) {
  const a = ALIMENTOS.find(x => x[0] === f.k);
  if (!a) return;
  const n = nutrDe(a, f.q);
  f.kcal = n.kcal; f.pr = n.pr; f.gr = n.gr; f.ch = n.ch;
}

function renderHitos() {
  const card = $('#hitoCard'), mini = $('#hitoHoy');
  if (!card) return;
  const h = hitoActual();
  if (!h) {                       // sin bajada por delante no hay nada que repartir
    card.hidden = true; if (mini) mini.hidden = true;
    return;
  }
  card.hidden = false;
  $('#hitoSemana').textContent = `semana ${h.n} de 12`;

  const kg = v => v.toFixed(1).replace('.', ',');
  const clase = 'e-' + h.estado;
  const falta = h.dif == null ? null : Math.abs(h.dif);

  $('#hitoAhora').innerHTML = `<div class="hito-estado ${clase}">
      <b>${kg(h.obj)} kg</b><em>${esc(TEXTO_ESTADO[h.estado])}</em>
    </div>
    <p class="hito-detalle">${h.estado === 'sin-datos'
      ? `Para esta altura del desafío tendrías que estar en <b>${kg(h.obj)} kg</b>, o sea <b>${kg(h.deberia)} kg</b> menos que al empezar. Registrá tu peso para ver cómo vas.`
      : `Estás en <b>${kg(h.kg)} kg</b>: ${h.dif > 0
          ? `te faltan <b>${kg(falta)} kg</b> para el objetivo de esta semana.`
          : `vas <b>${kg(falta)} kg</b> por debajo del objetivo.`} Bajaste ${kg(h.bajado)} de los ${kg(h.deberia)} previstos hasta acá.`}</p>`;

  $('#hitoGrilla').innerHTML = WEEKS.map(w => {
    const e = estadoSemana(w.w);
    let cls = '';
    if (w.w === h.n) cls = 'h-hoy';
    else if (e.cerrada && e.estado && e.estado !== 'sin-datos')
      cls = (e.estado === 'atrasado') ? 'h-no' : 'h-ok';
    return `<div class="${cls}" title="Semana ${w.w}: ${kg(e.obj)} kg">
      <b>S${w.w}</b><span>${kg(e.obj)}</span></div>`;
  }).join('');

  $('#hitoConsejo').textContent = consejoHito(h);

  if (mini) {
    mini.hidden = false;
    mini.className = `card hito-mini ${clase}`;
    mini.innerHTML = `<i></i><div>
      <b>Semana ${h.n}: ${kg(h.obj)} kg</b>
      <span>${h.estado === 'sin-datos' ? 'Registrá tu peso para ver cómo vas'
        : (h.dif > 0 ? `te faltan ${kg(falta)} kg` : `vas ${kg(falta)} kg por debajo`)}</span>
    </div>`;
  }
}

function renderWeight() {
  const p = S.profile, w = currentWeight();
  const sorted = S.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const pts = sorted.map(x => ({ x: daysBetween(p.startDate, x.date), y: x.kg }));
  const labels = pts.length > 1
    ? [{ x: pts[0].x, text: fmtDate(sorted[0].date) }, { x: pts[pts.length - 1].x, text: fmtDate(sorted[sorted.length - 1].date) }]
    : [];
  // Línea del plan, acotada al tramo que abarcan los registros para no
  // aplastar la curva real contra el borde izquierdo del gráfico.
  const plan = bajadaTotal() && pts.length > 1
    ? [{ x: pts[0].x, y: objetivoDia(pts[0].x) },
       { x: pts[pts.length - 1].x, y: objetivoDia(pts[pts.length - 1].x) }]
    : [];
  $('#weightChart').innerHTML = lineChart([
    { points: pts, color: '#4ec9e8', width: 1.6, dots: pts.length <= 40 },
    { points: movingAvg(pts, 7), color: '#ff6a2b', width: 2.4 },
    { points: plan, color: '#93949e', width: 1.6, dash: '5 5' }
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
  const riñon = banderasPlan().has('proteinaConCuidado');
  $('#protein').textContent = riñon
    ? 'consultá antes de subirla'
    : Math.round(w * 1.6) + ' g/día';
  $('#protein').style.color = riñon ? 'var(--soga)' : '';

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


/* --------- archivos adjuntos de los estudios (IndexedDB) ----------
   localStorage no aguanta una foto de un informe: los archivos van a
   IndexedDB, y se guardan como data URL para poder mostrarlos sin depender
   de blob:, que algunos contextos embebidos bloquean. */
const DB_ARCHIVOS = 'desafio12-archivos';
function conArchivos(fn) {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('sin IndexedDB'));
    const req = indexedDB.open(DB_ARCHIVOS, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onerror = () => rej(req.error);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction('files', 'readwrite');
        const r = fn(tx.objectStore('files'));
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    };
  });
}
const guardarArchivo = (id, dataUrl) => conArchivos(st => st.put(dataUrl, id));
const leerArchivo = id => conArchivos(st => st.get(id));
const borrarArchivo = id => conArchivos(st => st.delete(id));
const aDataUrl = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

/* ------------------------- estudios: pantalla --------------------- */
const CUALI = [['neg','Negativo'],['+','+'],['++','++'],['+++','+++']];

function renderLabCampos() {
  const cont = $('#labCampos');
  if (!cont) return;
  cont.innerHTML = GRUPOS.map(g => `<div class="lab-grupo"><h3>${esc(g)}</h3>${
    MARCADORES.filter(m => m.g === g).map(m => {
      const r = refDe(m);
      const ayuda = m.cualitativo ? 'negativo es lo esperable'
        : (r ? `${r[0]}–${r[1]}${m.u ? ' ' + m.u : ''}` : '');
      const campo = m.cualitativo
        ? `<select id="lab_${m.k}">${CUALI.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}</select>`
        : `<input type="number" step="any" inputmode="decimal" id="lab_${m.k}" placeholder="—">`;
      return `<div class="lab-fila"><label for="lab_${m.k}">${esc(m.n)}<small>${esc(ayuda)}</small></label>${campo}</div>`;
    }).join('')}</div>`).join('');
}

function flechaPrevio(est, m) {
  const previos = S.labs.filter(x => x.date < est.date && x.values[m.k] != null && x.values[m.k] !== '')
    .sort((a, b) => a.date < b.date ? 1 : -1);
  if (!previos.length || m.cualitativo) return '';
  const antes = Number(previos[0].values[m.k]), ahora = Number(est.values[m.k]);
  if (!isFinite(antes) || !isFinite(ahora) || antes === ahora) return '';
  return ` <span class="muted small">(antes ${antes}${ahora < antes ? ' ↓' : ' ↑'})</span>`;
}

function renderLabs() {
  const cont = $('#labList');
  if (!cont) return;

  const alerta = $('#labAlert');
  if (alerta) {
    alerta.innerHTML = hayAlerta()
      ? `<div class="lab-alerta"><i>⚠️</i><div>
           <b>Hay un valor que conviene revisar antes de entrenar</b>
           <span>Alguno de tus resultados está bastante fuera de rango. No es un diagnóstico
           — puede tener explicaciones inocentes — pero es motivo para hablar con tu médico antes
           de seguir sumando carga. Mientras tanto el plan queda suavizado.</span>
         </div></div>` : '';
  }

  const orden = S.labs.slice().sort((a, b) => a.date < b.date ? 1 : -1);
  if (!orden.length) {
    cont.innerHTML = `<div class="empty">Todavía no cargaste ningún estudio. Si tenés uno reciente,
      cargalo: cambia bastante cómo leer el cansancio de las primeras semanas.</div>`;
    return;
  }

  cont.innerHTML = orden.map(est => {
    const hs = hallazgos(est);
    const conPlan = hs.filter(h => h.plan).length;
    const cuerpo = hs.length
      ? hs.map(h => `<div class="hallazgo ${h.critico ? 'critico' : ''}">
          <i></i><div class="hallazgo-txt">
            <b>${esc(h.m.n)}: ${esc(String(h.valor))}${h.m.u ? ' ' + esc(h.m.u) : ''}
              <em>${h.estado === 'bajo' ? 'bajo' : (h.m.cualitativo ? 'positivo' : 'alto')}</em>
              ${flechaPrevio(est, h.m)}</b>
            <p>${esc(h.nota)}</p>
          </div></div>`).join('')
      : `<div class="lab-ok">Todos los valores que cargaste están dentro de rango.</div>`;

    const ajuste = conPlan ? `<label class="lab-adj">
        <input type="checkbox" data-aplicar="${est.id}"${est.aplicar === false ? '' : ' checked'}>
        Suavizar el plan mientras tanto (menos intensidad o menos impacto, nunca más carga)
      </label>` : '';

    const archivo = est.archivo
      ? (/^image\//.test(est.archivo.tipo)
          ? `<img class="lab-foto" data-foto="${est.archivo.id}" alt="Informe adjunto">`
          : `<div class="lab-archivo">📎 ${esc(est.archivo.nombre)} · ${Math.round(est.archivo.tam / 1024)} KB</div>`)
      : '';

    return `<article class="lab-card" data-lab="${est.id}">
      <div class="lab-head">
        <div><b>${fmtDate(est.date)}</b><br><span>${esc(est.lugar || 'Estudio de laboratorio')}${
          hs.length ? ` · ${hs.length} valor${hs.length > 1 ? 'es' : ''} fuera de rango` : ''}</span></div>
        <button class="entry-del" data-dellab="${est.id}" aria-label="Borrar">×</button>
      </div>
      ${cuerpo}
      ${est.notas ? `<p class="muted small" style="margin-top:11px">${esc(est.notas)}</p>` : ''}
      ${archivo}
      ${ajuste}
    </article>`;
  }).join('');

  // las fotos se traen de IndexedDB después de pintar
  $$('#labList img[data-foto]').forEach(img => {
    leerArchivo(img.dataset.foto).then(d => { if (d) img.src = d; }).catch(() => {});
  });
}

function renderProfile() {
  const p = S.profile;
  $('#pName').value = p.name || '';
  $('#pBirth').value = p.birth || '';
  $('#pAgeShown').textContent = edad() + ' años';
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
    const fq = e.target.closest('[data-frec]');
    if (fq) {
      const a = ALIMENTOS.find(x => x[0] === fq.dataset.frec);
      if (a) {
        agregarAlimento(a, 1, $('#comidaTipo').value, $('#comidaDate').value || today());
        save(); render(); toast(a[1]);
      }
      return;
    }
    const qm = e.target.closest('[data-qmas]'), qn = e.target.closest('[data-qmenos]');
    if (qm || qn) {
      const id = (qm || qn).dataset[qm ? 'qmas' : 'qmenos'];
      const f = S.foods.find(x => x.id === id);
      if (f) {
        f.q = Math.round((f.q + (qm ? 0.5 : -0.5)) * 100) / 100;
        if (f.q <= 0) S.foods = S.foods.filter(x => x.id !== id);
        else recalcular(f);
        save(); render();
      }
      return;
    }
    const dc = e.target.closest('[data-delcomida]');
    if (dc) {
      S.foods = S.foods.filter(x => x.id !== dc.dataset.delcomida);
      save(); render(); toast('Borrado');
      return;
    }
    const dl = e.target.closest('[data-dellab]');
    if (dl) {
      const id = dl.dataset.dellab;
      S.labs = S.labs.filter(x => x.id !== id);
      borrarArchivo(id).catch(() => {});
      save(); render(); toast('Estudio borrado');
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
      lastScan = { workouts: res.workouts, weights: res.weights, mb: mb(res.bytes), nombre: f.name };
      // Si nada entra en el rango por defecto, se abre al que sí trae algo.
      let r = 'inicio';
      if (!cuentaEn(r)) r = ['90', '365', 'todo'].find(x => cuentaEn(x)) || 'inicio';
      aplicarRango(r);
    } catch (err) {
      pending = []; pendingWeights = []; lastScan = null; headFor = null;
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
    importNote = ''; lastScan = null; headFor = null;
    renderImport();
    if (malos) toast(`${malos} archivo${malos > 1 ? 's' : ''} sin datos legibles (¿es .fit?)`);
    else if (pending.length) toast(`${pending.length} actividad${pending.length > 1 ? 'es' : ''} lista${pending.length > 1 ? 's' : ''}`);
  });

  const alCambiar = e => {
    const ap = e.target.closest('[data-aplicar]');
    if (ap) {
      const est = S.labs.find(x => x.id === ap.dataset.aplicar);
      if (est) { est.aplicar = ap.checked; save(); renderToday(); renderPlan(); renderWeight(); }
      return;
    }
    const rango = e.target.closest('#impRango');
    if (rango) { if (rango.value !== importRango) aplicarRango(rango.value); return; }
    const sel = e.target.closest('.imp-type');
    if (!sel) return;
    pending[Number(sel.dataset.i)].type = sel.value;
    renderImport();
  };
  document.addEventListener('change', alCambiar);
  document.addEventListener('input', alCambiar);

  document.addEventListener('click', e => {
    const drop = e.target.closest('[data-drop]');
    if (drop) { pending.splice(Number(drop.dataset.drop), 1); renderImport(); return; }
    if (e.target.closest('#btnClearImport')) { pending = []; pendingWeights = []; importNote = ''; lastScan = null; headFor = null; renderImport(); return; }
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
      pending = []; pendingWeights = []; importNote = ''; lastScan = null; headFor = null;
      save(); render(); renderImport();
      // Para que se vea dónde quedaron, en vez de dejar la pantalla igual.
      const lista = $('#logList');
      if (lista && nuevas) lista.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // --- comida ---
  $('#comidaTipo').innerHTML = COMIDAS.map(([k, t]) => `<option value="${k}">${t}</option>`).join('');
  $('#comidaTipo').value = momentoDelDia();
  $('#comidaDate').value = today();
  $('#comidaDate').addEventListener('change', renderComida);

  $('#formComida').addEventListener('submit', e => {
    e.preventDefault();
    const texto = $('#comidaTexto').value.trim();
    if (!texto) return;
    const { items, sinReconocer } = interpretarComida(texto);
    if (!items.length) {
      toast('No reconocí ningún alimento en eso');
      return;
    }
    const tipo = $('#comidaTipo').value, fecha = $('#comidaDate').value || today();
    items.forEach(i => agregarAlimento(i.a, i.q, tipo, fecha));
    save(); render();
    $('#comidaTexto').value = '';
    const leidos = items.map(i => i.a[1] + (i.q !== 1 ? ' ×' + i.q : '')).join(' · ');
    toast(sinReconocer.length ? `${leidos} · no reconocí «${sinReconocer[0]}»` : leidos);
  });

  // --- estudios de laboratorio ---
  renderLabCampos();
  $('#btnNuevoLab').addEventListener('click', () => {
    const f = $('#formLab');
    f.hidden = false;
    $('#labDate').value = today();
    f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#btnCerrarLab').addEventListener('click', () => { $('#formLab').hidden = true; });

  /* Pegar un estudio ya tipeado: suma, nunca reemplaza lo que ya tenés.
     Sirve para no cargar veinte valores a mano en el teléfono. */
  $('#btnPegarLab').addEventListener('click', () => {
    openModal('Pegar valores de un estudio', '',
      'Pegá acá el estudio en formato JSON: {"date":"2026-06-06","lugar":"...","values":{"hb":16.3, ...}}. '
      + 'Se agrega a los que ya tengas, no borra nada. Acepta también una lista de estudios.',
      txt => {
        let datos;
        try { datos = JSON.parse(txt); }
        catch (e) { toast('Eso no es un JSON válido'); return; }
        const lista = Array.isArray(datos) ? datos : [datos];
        const validos = lista.filter(x => x && typeof x === 'object' && x.values && typeof x.values === 'object');
        if (!validos.length) { toast('No encontré ningún estudio con valores'); return; }
        let n = 0;
        validos.forEach((x, i) => {
          const values = {};
          Object.entries(x.values).forEach(([k, v]) => { if (marcador(k) && v !== '' && v != null) values[k] = v; });
          if (!Object.keys(values).length) return;
          S.labs.push({
            id: 'lab' + Date.now() + i,
            date: /^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : today(),
            lugar: String(x.lugar || '').slice(0, 60),
            notas: String(x.notas || '').slice(0, 140),
            values, aplicar: true, archivo: null
          });
          n++;
        });
        if (!n) { toast('Ninguno de esos valores coincide con los marcadores'); return; }
        save(); render();
        toast(`${n} estudio${n > 1 ? 's' : ''} agregado${n > 1 ? 's' : ''}`);
        $('#labList').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
  });

  $('#formLab').addEventListener('submit', async e => {
    e.preventDefault();
    const values = {};
    MARCADORES.forEach(m => {
      const el = $('#lab_' + m.k);
      if (!el) return;
      const v = el.value;
      if (v === '' || (m.cualitativo && v === 'neg')) return;
      values[m.k] = m.cualitativo ? v : Number(v);
    });
    const est = {
      id: 'lab' + Date.now(),
      date: $('#labDate').value || today(),
      lugar: $('#labLugar').value.trim(),
      notas: $('#labNotas').value.trim(),
      values, aplicar: true, archivo: null
    };
    const f = $('#labFile').files[0];
    if (f) {
      try {
        const url = await aDataUrl(f);
        await guardarArchivo(est.id, url);
        est.archivo = { id: est.id, nombre: f.name, tipo: f.type, tam: f.size };
      } catch (err) {
        toast('No pude guardar el archivo, pero sí los valores');
      }
    }
    S.labs.push(est);
    save();
    e.target.reset(); $('#formLab').hidden = true; renderLabCampos();
    render();
    const n = hallazgos(est).length;
    toast(n ? `Estudio guardado · ${n} valor${n > 1 ? 'es' : ''} fuera de rango` : 'Estudio guardado · todo en rango');
    $('#labList').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('#formProfile').addEventListener('submit', e => {
    e.preventDefault();
    Object.assign(S.profile, {
      name: $('#pName').value.trim(),
      birth: $('#pBirth').value || '',
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
          tests: data.tests || [], labs: data.labs || [],
          foods: data.foods || [], done: data.done || {}
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
    confirmar('¿Borrar todo?',
      'Se van a perder todas tus sesiones, pesos y tests. Si no exportaste una copia, no hay vuelta atrás.',
      () => {
        S = clonar(DEFAULTS);
        S.profile.startDate = today();
        save(); planWeek = null; pending = []; pendingWeights = []; lastScan = null; headFor = null;
        render(); renderImport(); toast('Todo borrado');
      });
  });
}

/* Diálogo de confirmación propio: los cuadros nativos del navegador
   quedan bloqueados cuando la página se embebe, y ahí el botón no haría
   nada sin avisar. */
function confirmar(titulo, texto, onOk) {
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:18px';
  back.innerHTML = `<div style="background:#1b1e25;border:1px solid #2c303a;border-radius:16px;padding:18px;width:100%;max-width:400px">
    <h2 style="font-size:15px;margin:0 0 8px">${esc(titulo)}</h2>
    <p style="font-size:13px;color:#93949e;margin:0 0 16px">${esc(texto)}</p>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" data-no>Cancelar</button>
      <button class="btn danger" data-si>Borrar todo</button>
    </div></div>`;
  back.addEventListener('click', e => {
    if (e.target === back || e.target.closest('[data-no]')) back.remove();
    if (e.target.closest('[data-si]')) { back.remove(); onOk(); }
  });
  document.body.appendChild(back);
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


/* --------- ícono de "Agregar a inicio" ----------
   iOS lo toma de un <link rel="apple-touch-icon"> que esté en el <head>, y
   solo acepta PNG. Publicada como artifact, la página se sirve sin nuestro
   <head>, así que iOS caía en el favicon y mostraba un emoji. Se inserta en
   tiempo de ejecución: la marca se rasteriza a PNG en un canvas, que es la
   única forma de tener el ícono real sin un <head> propio. */
const MARCA_SVG = '<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Desafio Bici + Soga"> <defs> <linearGradient id="ringGrad" x1="0%" y1="100%" x2="100%" y2="0%"> <stop offset="0%" stop-color="#6B4E1A"/> <stop offset="100%" stop-color="#FBEFD6"/> </linearGradient> </defs> <rect width="1024" height="1024" fill="#0A0A0A"/> <circle cx="512" cy="512" r="385.5" fill="none" stroke="#221B0E" stroke-width="60"/> <circle cx="512" cy="512" r="385.5" fill="none" stroke="url(#ringGrad)" stroke-width="60" stroke-linecap="round" stroke-dasharray="1508 2422" transform="rotate(-90 512 512)"/> <path d="M331,647 C421,647 407,467 512,467 C617,467 602,361 708,361" fill="none" stroke="#F7E4B8" stroke-width="27" stroke-linecap="round"/> <circle cx="708" cy="361" r="60" fill="#E9C27A" opacity="0.2"/> <circle cx="708" cy="361" r="30" fill="#FBEFD6"/> </svg>';

function ponerIconoDeInicio() {
  if (document.querySelector('link[rel="apple-touch-icon"]')) return;
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 180;
        const g = c.getContext('2d');
        // iOS recorta el ícono con su propia máscara y compone lo transparente
        // sobre blanco: se entrega un cuadrado lleno, sin esquinas caladas.
        g.fillStyle = '#0A0A0B'; g.fillRect(0, 0, 180, 180);
        g.drawImage(img, 0, 0, 180, 180);
        const png = c.toDataURL('image/png');
        [['apple-touch-icon', '180x180'], ['icon', '180x180']].forEach(([rel, sizes]) => {
          const l = document.createElement('link');
          l.rel = rel; l.setAttribute('sizes', sizes); l.type = 'image/png'; l.href = png;
          document.head.appendChild(l);
        });
      } catch (e) { /* sin canvas se queda como estaba */ }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(MARCA_SVG);
  } catch (e) { /* idem */ }
}

/* ------------------------------- init ------------------------------ */
function init() {
  /* Sin esto el estado vive solo en memoria hasta la primera acción, y la
     fecha de inicio del desafío se recalcula a "hoy" en cada apertura. */
  if (!localStorage.getItem(KEY)) save();
  ponerIconoDeInicio();
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
