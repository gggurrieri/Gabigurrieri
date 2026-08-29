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

const DEFAULTS = {
  profile: {
    name: '', age: 32, sex: 'm', height: 176,
    startWeight: 91, goalWeight: 83,
    startDate: today(), footballDay: 6
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
    if (!raw) return structuredClone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return {
      profile: Object.assign({}, DEFAULTS.profile, parsed.profile),
      sessions: parsed.sessions || [],
      weights: parsed.weights || [],
      tests: parsed.tests || [],
      done: parsed.done || {}
    };
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento local', e);
    return structuredClone(DEFAULTS);
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

/* Construye las 7 sesiones de una semana (índice 0 = lunes). */
function buildWeek(wn) {
  const p = WEEKS[wn - 1];
  const s = [];

  // Lunes — bici suave
  s.push({ type: 'bici', title: `Bici suave · ${p.z2} min`, minutes: p.z2,
    detail: `Ritmo cómodo y continuo (RPE 3-4): podés hablar de corrido todo el rato. Cadencia alta y ligera, no fuerces el plato.` });

  // Martes — soga + core
  const minA = p.ropeA ? ropeMinutes(p.ropeA) + 12 : 0;
  s.push(p.ropeA
    ? { type: 'soga', title: `Soga · ${p.ropeA.r} series + fuerza`, minutes: minA,
        met: blendMet(p.ropeA.r * p.ropeA.on, minA),
        detail: `5 min de entrada en calor (movilidad de tobillo y saltos sin soga). Después ${ropeText(p.ropeA)}. Cerrá con: ${CORE}` }
    : { type: 'fuerza', title: 'Fuerza y core', minutes: 25, detail: CORE });

  // Miércoles — descanso activo
  s.push({ type: 'movilidad', title: 'Descanso activo', minutes: 30, optional: true,
    detail: 'Caminata de 30-40 min a paso vivo, o movilidad y elongación. Es opcional pero suma muchísimo: es gasto calórico sin fatiga.' });

  // Jueves — intervalos de bici (o segunda salida suave / test)
  if (p.finalTest) {
    s.push({ type: 'bici', title: 'TEST · 12 minutos máximos', minutes: 35,
      detail: 'Calentá 15 min. Después andá 12 minutos a la máxima intensidad que puedas sostener sin explotar, y anotá los km recorridos en Progreso → Test de control. Aflojá 8 min al final.' });
  } else if (p.ints) {
    s.push({ type: 'bici', title: `Bici intervalos · ${intText(p.ints)}`, minutes: intMinutes(p.ints),
      detail: `12 min de calentamiento progresivo. Después ${intText(p.ints)} — en los tramos fuertes vas a RPE 7-8, en los suaves pedaleás casi sin resistencia. 6 min de vuelta a la calma.` });
  } else {
    s.push({ type: 'bici', title: `Bici suave · ${Math.round(p.z2 * 0.8)} min`, minutes: Math.round(p.z2 * 0.8),
      detail: 'Segunda salida tranquila de la semana. Todavía estamos construyendo base: sin intervalos, solo rodar.' });
  }

  // Viernes — soga corta + core (o movilidad)
  const minB = p.ropeB ? ropeMinutes(p.ropeB) + 10 : 0;
  s.push(p.ropeB
    ? { type: 'soga', title: `Soga · ${p.ropeB.r} series + core`, minutes: minB, optional: !!p.ropeBOpt,
        met: blendMet(p.ropeB.r * p.ropeB.on, minB),
        detail: `${ropeText(p.ropeB)}. Después 2 vueltas del circuito de fuerza. ${p.ropeBOpt ? 'Esta semana es opcional: si venís cargado, cambiala por una caminata.' : ''}` }
    : { type: 'movilidad', title: 'Movilidad y elongación', minutes: 25, optional: true,
        detail: 'Semana de descarga: nada de impacto. 20-25 min de movilidad de cadera, tobillo y columna, más elongación de gemelos y cuádriceps.' });

  // Sábado — bici larga
  s.push({ type: 'bici', title: `Bici larga · ${p.long} min`, minutes: p.long,
    detail: 'La sesión más importante de la semana para bajar de peso. Ritmo cómodo y constante de principio a fin. Llevá agua y, si pasás la hora, algo para comer.' });

  // Domingo — fútbol
  s.push({ type: 'futbol', title: 'Fútbol', minutes: 60,
    detail: 'Tu partido de siempre. Entrá en calor 10 minutos antes de arrancar — es el día con más riesgo de tirón de toda la semana.' });

  // Reubicar el fútbol al día elegido
  const fd = clamp(Number(S.profile.footballDay), 0, 6);
  if (fd !== 6) { const t = s[fd]; s[fd] = s[6]; s[6] = t; }

  return s.map((x, i) => Object.assign(x, { id: `w${wn}-${i}`, day: i, week: wn }));
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
    const req = buildWeek(w).filter(s => !s.optional);
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
  return `<article class="sess t-${s.type} ${done ? 'is-done' : ''} ${isToday ? 'is-today' : ''}">
    <div class="sess-ico">${ICON[s.type] || '•'}</div>
    <div class="sess-body">
      <div class="sess-day">${DAYS[s.day]}${isToday ? ' · hoy' : ''}</div>
      <div class="sess-title">${esc(s.title)}</div>
      <div class="sess-detail">${esc(s.detail)}</div>
      <div class="sess-meta">
        <span class="pill">≈ ${fmtMin(s.minutes)}</span>
        <span class="pill">≈ ${planKcal(s)} kcal</span>
        ${s.optional ? '<span class="pill opt">opcional</span>' : ''}
      </div>
    </div>
    <div class="sess-actions">
      <button class="check ${done ? 'on' : ''}" data-check="${s.id}" title="Marcar como hecha">✓</button>
      <button class="check" data-quick="${s.type}" data-min="${s.minutes}" title="Registrar sesión">＋</button>
    </div>
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
  const totalMin = sessions.filter(s => !s.optional).reduce((a, b) => a + b.minutes, 0);
  const totalKcal = sessions.filter(s => !s.optional).reduce((a, b) => a + planKcal(b), 0);

  $('#planDetail').innerHTML = `
    <div class="card">
      <div class="week-head">
        <h2>Semana ${p.w}</h2>
        <span class="badge-block">${esc(p.block)}${p.deload ? ' · descarga' : ''}${planWeek === cur ? ' · en curso' : ''}</span>
      </div>
      <p class="tip">${esc(p.tip)}</p>
      <div class="row-3">
        <div class="mini"><b>${sessions.filter(s => !s.optional).length}</b><span>sesiones clave</span></div>
        <div class="mini"><b>${Math.round(totalMin / 60 * 10) / 10} h</b><span>volumen</span></div>
        <div class="mini"><b>${totalKcal}</b><span>kcal aprox.</span></div>
      </div>
    </div>
    ${sessions.map(s => sessionCard(s, { todayIdx: planWeek === cur ? dowIndex(today()) : -1 })).join('')}`;
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
    bits.push(s.kcal + ' kcal');
    if (s.rpe) bits.push('RPE ' + s.rpe);
    return `<article class="entry">
      <div class="entry-ico">${ICON[s.type] || '•'}</div>
      <div class="entry-body">
        <div class="entry-title">${fmtDate(s.date)} · ${esc(bits.join(' · '))}</div>
        <div class="entry-sub">${esc(s.notes || (s.intensity ? 'Intensidad ' + s.intensity : ''))}</div>
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
  $('#kcalPreview').textContent = '≈ ' + kcal(type, int, min, currentWeight()) + ' kcal';
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

  ['#sesType', '#sesMin', '#sesInt'].forEach(sel =>
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
    S.sessions.push({
      id: Date.now(),
      date: $('#sesDate').value || today(),
      type, minutes, intensity,
      distance: Number($('#sesKm').value) || 0,
      jumps,
      rpe: Number($('#sesRpe').value),
      mood: Number($('#sesMood').value),
      notes: $('#sesNotes').value.trim(),
      kcal: kcal(type, intensity, minutes, currentWeight())
    });
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
      footballDay: Number($('#pFootball').value)
    });
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
    openModal('Copia de seguridad', json, null);
  });

  $('#btnImport').addEventListener('click', () => {
    openModal('Pegá acá tu copia', '', txt => {
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
    S = structuredClone(DEFAULTS);
    S.profile.startDate = today();
    save(); planWeek = null; render(); toast('Todo borrado');
  });
}

/* modal simple para exportar / importar texto */
function openModal(title, value, onConfirm) {
  const back = document.createElement('div');
  back.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.65);display:grid;place-items:center;padding:18px';
  back.innerHTML = `<div style="background:#1b1e25;border:1px solid #2c303a;border-radius:16px;padding:16px;width:100%;max-width:520px">
    <h2 style="font-size:15px;margin:0 0 10px">${esc(title)}</h2>
    <textarea id="modalText" style="width:100%;height:190px;background:#131519;color:#ece8e1;border:1px solid #2c303a;border-radius:10px;padding:10px;font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;resize:vertical">${esc(value)}</textarea>
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
document.addEventListener('DOMContentLoaded', init);
})();
