/* =====================================================================
   Renta Fija
   Simulador de cartera de bonos y letras sobre una foto real del
   mercado. Todo se guarda en localStorage: sin servidor, sin cuenta,
   sin red. No manda ninguna orden a ningún broker.

   Acá vive solo la pantalla. La matemática está en motor.js, aparte, y
   se prueba sola desde node.
   ===================================================================== */
(function () {
'use strict';

const D = window.RF_DATOS;
const M = window.RF_MOTOR;

/* Sirve para saber, mirando el teléfono, qué versión se está ejecutando.
   Sin esto, "no me aparece el cambio" es imposible de distinguir de
   "el cambio no funciona". Se actualiza junto con la del service worker. */
const VERSION = '2026-09-21.1';

/* ------------------------------ utils ------------------------------ */

const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio',
               'agosto','septiembre','octubre','noviembre','diciembre'];
const MES3 = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const fmtFecha = iso => {
  const [y, m, d] = iso.split('-').map(Number);
  return d + ' ' + MES3[m - 1] + ' ' + String(y).slice(2);
};

/* Pesos. Arriba del millón se abrevia: en una pantalla de teléfono,
   "$1,25 M" se lee y "$1.250.000" hay que contarlo con el dedo. */
const fmtPesos = (n, decimales) => {
  if (n == null || !isFinite(n)) return '—';
  const signo = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e6 && decimales !== 'completo') return signo + '$' + (a / 1e6).toFixed(2).replace('.', ',') + ' M';
  if (a >= 1e3 && decimales !== 'completo') return signo + '$' + Math.round(a).toLocaleString('es-AR');
  return signo + '$' + a.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtPct = (n, dec) => n == null || !isFinite(n) ? '—'
  : (n * 100).toFixed(dec == null ? 2 : dec).replace('.', ',') + '%';

/* Los desvíos de tasa se hablan en puntos básicos: un punto básico es
   una centésima de punto porcentual. "Ochenta y tres pb" es 0,83%. */
const fmtPb = n => n == null || !isFinite(n) ? '—'
  : (n >= 0 ? '+' : '') + Math.round(n * 10000) + ' pb';

const fmtNum = (n, dec) => n == null || !isFinite(n) ? '—'
  : n.toLocaleString('es-AR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });

const signoClase = n => n > 0 ? 'pos' : n < 0 ? 'neg' : '';

/* --------------------------- estado guardado ------------------------ */

const LLAVE = 'rentafija_v1';

const inicial = () => ({
  version: 1,
  capital: 1000000,
  efectivo: 1000000,
  posiciones: [],        /* { t, nominales, costo } */
  operaciones: [],       /* { fecha, lado, t, nominales, precio, monto, costos, efectivo } */
  comisiones: { ...M.COMISIONES }
});

let S = cargar();

function cargar() {
  try {
    const crudo = localStorage.getItem(LLAVE);
    if (!crudo) return inicial();
    const s = JSON.parse(crudo);
    /* Una copia vieja o a medias no puede dejar la app en blanco: se
       completa con los valores de arranque lo que falte. */
    return { ...inicial(), ...s, comisiones: { ...M.COMISIONES, ...(s.comisiones || {}) } };
  } catch (e) { return inicial(); }
}

function guardar() {
  try { localStorage.setItem(LLAVE, JSON.stringify(S)); }
  catch (e) { /* modo privado o disco lleno: la sesión sigue en memoria */ }
}

/* ------------------------- la corrida del motor --------------------- */

/* Se calcula una sola vez al arrancar: la foto no cambia mientras la
   app está abierta, así que recalcular en cada render sería tirar
   trabajo a la basura. */
const R = M.correr(D);

const NOMBRE_SEÑAL = {
  comprar: 'Comprar', vender: 'Vender', neutral: 'En línea',
  'sin-curva': 'Sin curva', 'sin-dato': 'Dato dudoso', 'curva-debil': 'Curva floja'
};

const COLOR_SEÑAL = {
  comprar: 'var(--verde)', vender: 'var(--rojo)', neutral: 'var(--texto3)',
  'sin-curva': 'var(--texto3)', 'sin-dato': 'var(--ambar)', 'curva-debil': 'var(--texto3)'
};

/* El nombre legible de un grupo de curva, que internamente es una clave
   del tipo "hd/tesoro/local". */
function nombreGrupo(clave) {
  const [clase, emisor, ley] = clave.split('/');
  const base = { letra: 'Letras en pesos', cer: 'Bonos CER', hd: 'Dólares' }[clase] || clase;
  if (emisor === 'bcra') return 'Bopreal (Banco Central)';
  if (ley === 'local') return base + ' · ley argentina';
  if (ley === 'ny') return base + ' · ley Nueva York';
  return base;
}

/* ============================== HOY ================================= */

function renderHoy() {
  const v = M.valuarCartera(S.posiciones, R.porTicker);
  const total = v.valor + S.efectivo;
  const dur = M.durationCartera(v.filas);

  $('#kpiValor').textContent = fmtPesos(total);
  const res = $('#kpiResultado');
  const ganancia = total - S.capital;
  res.textContent = (ganancia >= 0 ? '+' : '') + fmtPct(S.capital > 0 ? ganancia / S.capital : 0);
  res.className = 'kpi-val ' + signoClase(ganancia);
  $('#kpiDuration').textContent = dur == null ? '—' : fmtNum(dur, 2);

  const invertido = total > 0 ? v.valor / total : 0;
  $('#barraInvertido').style.width = (invertido * 100).toFixed(1) + '%';
  $('#pieEfectivo').textContent =
    fmtPesos(v.valor) + ' invertidos · ' + fmtPesos(S.efectivo) + ' en efectivo' +
    (dur == null ? '' : ' · un punto más de tasa mueve la cartera ' + fmtPct(dur / 100, 1));

  renderSeñales();
  renderLegislativo();
  renderAlertas();
}

function renderSeñales() {
  const con = R.instrumentos
    .filter(a => a.señal === 'comprar' || a.señal === 'vender')
    .sort((a, b) => Math.abs(b.residuo) - Math.abs(a.residuo));

  if (!con.length) {
    $('#señales').innerHTML = '<div class="vacio">Ningún bono se aparta de la curva de sus pares ' +
      'más de ' + fmtPb(M.UMBRAL).replace('+', '') + '. Sin señal es una respuesta válida: ' +
      'operar por debajo de ese desvío se lo comen las comisiones.</div>';
    return;
  }

  $('#señales').innerHTML = con.map(a => {
    const arriba = a.señal === 'comprar';
    return `<div class="señal ${a.señal}">
      <div class="señal-cuerpo">
        <div class="señal-tit">
          <span class="señal-tic">${esc(a.t)}</span>
          <span class="señal-nom">${esc(a.nombre)}</span>
        </div>
        <p class="señal-txt">Rinde ${fmtPct(a.tir)} y la curva de ${esc(nombreGrupo(a.curva.grupo))}
          le asigna ${fmtPct(a.esperada)} para su plazo:
          ${arriba ? 'paga de más, está barato' : 'paga de menos, está caro'}.</p>
      </div>
      <div class="señal-val">
        <strong class="${arriba ? 'pos' : 'neg'}">${fmtPb(a.residuo)}</strong>
        <span>${NOMBRE_SEÑAL[a.señal]}</span>
      </div>
    </div>`;
  }).join('');
}

function renderLegislativo() {
  const L = R.legislativo;
  if (!L.pares.length) { $('#legislativo').innerHTML = '<div class="vacio">Sin pares.</div>'; return; }

  $('#legislativo').innerHTML =
    `<p class="explica">Promedio de los pares sanos: <b>${fmtPb(L.promedio).replace('+', '')}</b>.</p>` +
    L.pares.map(p => `<div class="señal">
      <div class="señal-cuerpo">
        <div class="señal-tit">
          <span class="señal-tic">${esc(p.local.t)} / ${esc(p.ny.t)}</span>
          <span class="señal-nom">vence ${fmtFecha(p.vto)}</span>
        </div>
        <p class="señal-txt">${p.confiable
          ? 'El de ley argentina rinde ' + fmtPb(p.spread).replace('+', '') + ' más, ' +
            (Math.abs(p.desvio) < 0.002 ? 'en línea con el resto de los pares.'
              : p.desvio > 0 ? 'por encima del promedio: el mercado le pide más a este vencimiento.'
                             : 'por debajo del promedio.')
          : 'Uno de los dos tiene el dato dudoso, así que el par no entra en el promedio.'}</p>
      </div>
      <div class="señal-val">
        <strong>${fmtPb(p.spread).replace('+', '')}</strong>
        <span>${p.confiable ? fmtPb(p.desvio) + ' vs prom.' : 'sin promediar'}</span>
      </div>
    </div>`).join('');
}

function renderAlertas() {
  const con = R.instrumentos.filter(a => a.alertas.length);
  if (!con.length) {
    $('#alertas').innerHTML = '<div class="vacio">Los ' + R.instrumentos.length +
      ' instrumentos cierran: la TIR recalculada coincide con la del broker.</div>';
    return;
  }
  $('#alertas').innerHTML = con.map(a => a.alertas.map(al =>
    `<div class="alerta ${al.nivel}">
      <b>${esc(a.t)} · ${esc(a.nombre)}</b>
      <p>${esc(al.texto)}</p>
    </div>`).join('')).join('') +
    `<p class="pie">Los ${R.instrumentos.length - con.length} restantes cierran contra el broker
     con menos de un punto básico de diferencia.</p>`;
}

/* ============================= CURVA ================================ */

/* Solo se grafican los grupos que llegaron a armar recta: dibujar dos
   puntos y una línea que pasa exacto por los dos sería una curva
   inventada. */
const GRUPOS_GRAFICABLES = Object.keys(R.curvas).filter(g => R.curvas[g].recta);
let grupoActivo = GRUPOS_GRAFICABLES[0];
let tickerActivo = null;

function renderSelectorCurva() {
  $('#selectorCurva').innerHTML = GRUPOS_GRAFICABLES.map(g =>
    `<button class="chip ${g === grupoActivo ? 'activo' : ''}" data-grupo="${esc(g)}">${esc(nombreGrupo(g))}</button>`
  ).join('');
}

/* El gráfico se dibuja a mano en SVG. No hay ninguna librería: son
   cuatro ejes, diez puntos y una recta, y bajar 300 KB para eso haría
   que la app deje de abrir sin conexión. */
function renderCurva() {
  const c = R.curvas[grupoActivo];
  const puntos = R.instrumentos.filter(a => M.grupoDe(a) === grupoActivo && a.dm != null);

  const W = 340, H = 220, ML = 40, MR = 12, MT = 14, MB = 30;
  const xs = puntos.map(p => p.dm), ys = puntos.map(p => p.tir);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  /* Un margen del 12% para que ningún punto quede pegado al borde. */
  const px = (x1 - x0) * 0.12 || 0.5, py = (y1 - y0) * 0.12 || 0.01;
  const ax = x0 - px, bx = x1 + px, ay = y0 - py, by = y1 + py;

  const X = v => ML + (v - ax) / (bx - ax) * (W - ML - MR);
  const Y = v => MT + (1 - (v - ay) / (by - ay)) * (H - MT - MB);

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tasa contra plazo">`;

  /* Guías horizontales de tasa. */
  for (let k = 0; k <= 4; k++) {
    const v = ay + (by - ay) * k / 4, y = Y(v);
    svg += `<line class="gr-guia" x1="${ML}" y1="${y.toFixed(1)}" x2="${W - MR}" y2="${y.toFixed(1)}"/>`;
    svg += `<text class="gr-txt" x="${ML - 5}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmtPct(v, 1)}</text>`;
  }
  /* Y de plazo. */
  for (let k = 0; k <= 3; k++) {
    const v = ax + (bx - ax) * k / 3, x = X(v);
    svg += `<text class="gr-txt" x="${x.toFixed(1)}" y="${H - 12}" text-anchor="middle">${v.toFixed(1)}</text>`;
  }
  svg += `<text class="gr-txt" x="${(ML + W - MR) / 2}" y="${H - 1}" text-anchor="middle">duration modificada (años)</text>`;
  svg += `<line class="gr-eje" x1="${ML}" y1="${MT}" x2="${ML}" y2="${H - MB}"/>`;
  svg += `<line class="gr-eje" x1="${ML}" y1="${H - MB}" x2="${W - MR}" y2="${H - MB}"/>`;

  /* La recta ajustada, recortada al área de trazado: extendida hasta el
     borde del rango se escapa por arriba del marco y queda flotando
     sobre el título. */
  svg += `<defs><clipPath id="areaTrazado">
    <rect x="${ML}" y="${MT}" width="${W - ML - MR}" height="${H - MT - MB}"/>
  </clipPath></defs>`;
  svg += `<line class="gr-recta" clip-path="url(#areaTrazado)"
          x1="${X(ax).toFixed(1)}" y1="${Y(c.recta.en(ax)).toFixed(1)}"
          x2="${X(bx).toFixed(1)}" y2="${Y(c.recta.en(bx)).toFixed(1)}"/>`;

  /* Y los bonos. El que no es confiable se dibuja hueco: está en el
     gráfico para que se vea dónde cae, pero no ajustó la recta.

     Las etiquetas van arriba del punto salvo que ahí ya haya otra: en
     la parte larga de la curva los bonos se amontonan y dos nombres
     pisados no se leen ni se tocan. */
  const puestas = [];
  const ordenados = puntos.slice().sort((a, b) => a.dm - b.dm);
  for (const p of ordenados) {
    const x = X(p.dm), y = Y(p.tir), col = COLOR_SEÑAL[p.señal];
    const sel = p.t === tickerActivo ? ' sel' : '';

    let ty = y - 9;
    if (puestas.some(q => Math.abs(q.x - x) < 30 && Math.abs(q.y - ty) < 11)) ty = y + 16;
    puestas.push({ x, y: ty });

    svg += `<g class="gr-punto${sel}" data-t="${esc(p.t)}">
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.5"
        fill="${p.confiable ? col : 'none'}" stroke="${p.confiable ? '' : col}"
        style="${p.confiable ? '' : 'stroke-width:1.8'}"/>
      <text class="gr-tic" x="${x.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle">${esc(p.t)}</text>
    </g>`;
  }
  svg += '</svg>';
  $('#grafico').innerHTML = svg;

  $('#pieCurva').innerHTML = c.debil
    ? `La recta explica el ${fmtPct(c.recta.r2, 0)} de la diferencia de tasas entre estos bonos.
       Es poco: lo que sobra es ruido, así que el grupo no da señal.`
    : `La recta explica el ${fmtPct(c.recta.r2, 0)} de la diferencia de tasas.
       Cada año más de plazo son ${fmtPb(c.recta.b).replace('+', '')} más de tasa.
       Ajustada con ${c.usados} de ${c.total} bonos.`;

  renderDetalleCurva(puntos);
}

function renderDetalleCurva(puntos) {
  const orden = puntos.slice().sort((a, b) => (b.residuo || 0) - (a.residuo || 0));
  $('#detalleCurva').innerHTML = orden.map(p => {
    const sel = p.t === tickerActivo;
    return `<div class="señal ${p.señal}" data-t="${esc(p.t)}" style="${sel ? 'border-color:var(--texto2)' : ''}">
      <div class="señal-cuerpo">
        <div class="señal-tit">
          <span class="señal-tic">${esc(p.t)}</span>
          <span class="señal-nom">${esc(p.nombre)}</span>
        </div>
        <p class="señal-txt">TIR ${fmtPct(p.tir)} · duration ${fmtNum(p.dm, 2)} ·
          paridad ${fmtPct(p.paridadCalc, 1)}${p.confiable ? '' : ' · fuera del ajuste'}</p>
      </div>
      <div class="señal-val">
        <strong class="${signoClase(p.residuo)}">${fmtPb(p.residuo)}</strong>
        <span>${NOMBRE_SEÑAL[p.señal]}</span>
      </div>
    </div>`;
  }).join('');
}

/* ============================ MERCADO =============================== */

let filtro = 'todos';
let ordenCampo = 'tir', ordenAsc = false;
let abierta = null;

function instrumentosFiltrados() {
  let l = R.instrumentos.slice();
  if (filtro === 'señal') l = l.filter(a => a.señal === 'comprar' || a.señal === 'vender');
  else if (filtro !== 'todos') l = l.filter(a => a.clase === filtro);

  l.sort((a, b) => {
    const x = a[ordenCampo], y = b[ordenCampo];
    if (x == null && y == null) return 0;
    if (x == null) return 1;   /* los vacíos siempre al final */
    if (y == null) return -1;
    const cmp = typeof x === 'string' ? x.localeCompare(y) : x - y;
    return ordenAsc ? cmp : -cmp;
  });
  return l;
}

function renderMercado() {
  const lista = instrumentosFiltrados();
  const cuerpo = $('#tablaMercado tbody');

  cuerpo.innerHTML = lista.map(a => {
    const fila = `<tr data-t="${esc(a.t)}" class="${abierta === a.t ? 'abierta' : ''}">
      <td><span class="punto-señal" style="background:${COLOR_SEÑAL[a.señal]}"></span
          ><span class="tic">${esc(a.t)}</span><span class="nom">${esc(a.nombre)}</span></td>
      <td class="num">${fmtPct(a.tir)}</td>
      <td class="num">${fmtNum(a.dm, 2)}</td>
      <td class="num">${fmtPct(a.paridadCalc, 1)}</td>
      <td class="num ${signoClase(a.residuo)}">${a.residuo == null ? '—' : fmtPb(a.residuo)}</td>
    </tr>`;
    return fila + (abierta === a.t ? filaDetalle(a) : '');
  }).join('');

  $$('#tablaMercado th').forEach(th => {
    th.classList.toggle('orden', th.dataset.orden === ordenCampo);
    th.classList.toggle('asc', th.dataset.orden === ordenCampo && ordenAsc);
  });

  $('#pieMercado').textContent = lista.length + ' de ' + R.instrumentos.length +
    ' instrumentos. Tocá una fila para ver el detalle.';
}

function filaDetalle(a) {
  const ret = M.retornoHorizonte(a, a.tir, R.liq, 12, a.curva);
  const clase = D.CLASES[a.clase], ley = D.LEYES[a.ley];

  return `<tr class="detalle"><td colspan="5">
    <dl>
      <dt>Precio</dt><dd>${fmtPesos(a.precio, 'completo')} por cada 100 nominales</dd>
      ${a.moneda === 'USD' ? `<dt>En dólares</dt><dd>US$ ${fmtNum(a.precioMoneda, 2)}
        (tipo de cambio implícito ${fmtPesos(a.fx, 'completo')})</dd>` : ''}
      <dt>Vence</dt><dd>${fmtFecha(a.vto)} · faltan ${fmtNum(a.diasAlVto)} días</dd>
      <dt>TIR</dt><dd>${fmtPct(a.tir)} anual · ${fmtPct(a.tem)} mensual</dd>
      <dt>Duration</dt><dd>${fmtNum(a.duration, 2)} años · un punto de tasa mueve
        ${fmtPct(a.dm / 100, 1)} el precio</dd>
      <dt>Paridad</dt><dd>${fmtPct(a.paridadCalc, 1)} del valor técnico</dd>
      <dt>Pagos</dt><dd>${a.flujo.length} · el primero el ${fmtFecha(a.flujo[0][0])}</dd>
      ${ret ? `<dt>A 12 meses</dt><dd>${fmtPct(ret.total)} si la curva no se mueve
        (${fmtPct(ret.carry)} de devengamiento ${ret.rolldown >= 0 ? '+' : '−'}
        ${fmtPct(Math.abs(ret.rolldown))} de recorrido)</dd>` : ''}
    </dl>
    <p>${esc(clase.texto)}${ley.texto ? ' ' + esc(ley.texto) : ''}</p>
    ${a.alertas.map(al => `<p style="color:var(--ambar)">⚠ ${esc(al.texto)}</p>`).join('')}
  </td></tr>`;
}

/* ============================ CARTERA =============================== */

function renderSelectorBono() {
  const sel = $('#opBono');
  const previo = sel.value;
  sel.innerHTML = R.instrumentos.map(a =>
    `<option value="${esc(a.t)}">${esc(a.t)} · ${esc(a.nombre)} · ${fmtPct(a.tir)}</option>`
  ).join('');
  if (previo) sel.value = previo;
}

/* La previa: qué pasa exactamente si se confirma. Se recalcula con cada
   tecla, porque el número que importa —cuántos nominales entran— no es
   obvio: el precio es por 100 y las comisiones se descuentan antes. */
function renderPrevia() {
  const t = $('#opBono').value;
  const lado = $('#opLado').value;
  const inst = R.porTicker[t];
  const monto = parseFloat($('#opMonto').value) || 0;
  const caja = $('#previa');
  const btn = $('#btnOperar');
  btn.disabled = true;
  if (!inst) { caja.innerHTML = ''; return; }

  if (lado === 'compra') {
    if (monto <= 0) { caja.innerHTML = '<p class="error">Poné cuánto querés invertir.</p>'; return; }
    if (monto > S.efectivo) {
      caja.innerHTML = `<p class="error">No alcanza: hay ${fmtPesos(S.efectivo)} en efectivo.</p>`;
      return;
    }
    const op = M.simularCompra(inst, monto, S.comisiones);
    if (!op) {
      caja.innerHTML = `<p class="error">No alcanza ni para un nominal
        (${fmtPesos(inst.precio / 100, 'completo')} cada uno).</p>`;
      return;
    }
    caja.innerHTML = `<dl>
      <dt>Nominales</dt><dd>${fmtNum(op.nominales)}</dd>
      <dt>Monto</dt><dd>${fmtPesos(op.monto, 'completo')}</dd>
      <dt>Comisiones + IVA</dt><dd>${fmtPesos(op.costos.total, 'completo')}</dd>
      <dt class="total">Sale del efectivo</dt><dd class="total">${fmtPesos(op.total, 'completo')}</dd>
      <dt>Queda sin usar</dt><dd>${fmtPesos(monto - op.total, 'completo')}</dd>
    </dl>`;
    btn.disabled = false;
    btn.dataset.op = JSON.stringify({ lado, t, nominales: op.nominales });
  } else {
    const pos = S.posiciones.find(p => p.t === t);
    if (!pos) { caja.innerHTML = '<p class="error">No tenés este bono en cartera.</p>'; return; }
    const nominales = Math.min(Math.floor(monto) || pos.nominales, pos.nominales);
    if (nominales <= 0) { caja.innerHTML = '<p class="error">Poné cuántos nominales vender.</p>'; return; }

    const op = M.simularVenta(inst, nominales, S.comisiones);
    /* El resultado de la venta se mide contra el costo promedio de la
       posición, no contra el total: se puede vender una parte. */
    const costoParte = pos.costo * nominales / pos.nominales;
    const resultado = op.total - costoParte;
    caja.innerHTML = `<dl>
      <dt>Nominales</dt><dd>${fmtNum(nominales)} de ${fmtNum(pos.nominales)}</dd>
      <dt>Monto</dt><dd>${fmtPesos(op.monto, 'completo')}</dd>
      <dt>Comisiones + IVA</dt><dd>−${fmtPesos(op.costos.total, 'completo')}</dd>
      <dt class="total">Entra al efectivo</dt><dd class="total">${fmtPesos(op.total, 'completo')}</dd>
      <dt>Resultado</dt><dd class="${signoClase(resultado)}">${fmtPesos(resultado, 'completo')}</dd>
    </dl>`;
    btn.disabled = false;
    btn.dataset.op = JSON.stringify({ lado, t, nominales });
  }
}

function operar() {
  let plan;
  try { plan = JSON.parse($('#btnOperar').dataset.op || 'null'); } catch (e) { return; }
  if (!plan) return;
  const inst = R.porTicker[plan.t];
  if (!inst) return;

  if (plan.lado === 'compra') {
    /* El costo se recalcula acá sobre los nominales que se confirman, y
       se vuelve a comparar contra el efectivo. La previa ya lo había
       hecho, pero entre que se dibujó y que se tocó el botón puede
       haberse operado en otra pestaña con la misma app abierta. */
    const monto = plan.nominales * inst.precio / 100;
    const costos = M.costos(monto, 'compra', S.comisiones);
    const total = monto + costos.total;
    if (total > S.efectivo + 1e-6) return;

    S.efectivo -= total;
    const pos = S.posiciones.find(p => p.t === plan.t);
    if (pos) { pos.nominales += plan.nominales; pos.costo += total; }
    else S.posiciones.push({ t: plan.t, nominales: plan.nominales, costo: total });

    S.operaciones.unshift({ fecha: new Date().toISOString(), lado: 'compra', t: plan.t,
      nominales: plan.nominales, precio: inst.precio, monto, costos: costos.total, total });
  } else {
    const pos = S.posiciones.find(p => p.t === plan.t);
    if (!pos || plan.nominales > pos.nominales) return;
    const op = M.simularVenta(inst, plan.nominales, S.comisiones);
    const costoParte = pos.costo * plan.nominales / pos.nominales;

    S.efectivo += op.total;
    pos.nominales -= plan.nominales;
    pos.costo -= costoParte;
    if (pos.nominales <= 0) S.posiciones = S.posiciones.filter(p => p !== pos);

    S.operaciones.unshift({ fecha: new Date().toISOString(), lado: 'venta', t: plan.t,
      nominales: plan.nominales, precio: inst.precio, monto: op.monto,
      costos: op.costos.total, total: op.total, resultado: op.total - costoParte });
  }

  guardar();
  $('#opMonto').value = '';
  renderTodo();
}

function renderCartera() {
  const v = M.valuarCartera(S.posiciones, R.porTicker);

  $('#posiciones').innerHTML = v.filas.length
    ? v.filas.map(f => `<div class="pos-fila">
        <div class="pos-cuerpo">
          <span class="pos-tic">${esc(f.t)}</span>
          <p class="pos-det">${fmtNum(f.nominales)} nominales ·
            compra ${fmtPesos(f.precioPromedio, 'completo')} · hoy ${fmtPesos(f.inst.precio, 'completo')}</p>
        </div>
        <div class="pos-val">
          <strong>${fmtPesos(f.valor)}</strong>
          <span class="${signoClase(f.resultado)}">${f.resultado >= 0 ? '+' : ''}${fmtPct(f.resultadoPct)}</span>
        </div>
      </div>`).join('') +
      `<p class="pie">Total invertido ${fmtPesos(v.valor)} ·
        resultado <span class="${signoClase(v.resultado)}">${fmtPesos(v.resultado)}</span> ·
        efectivo ${fmtPesos(S.efectivo)}</p>`
    : '<div class="vacio">Todavía no hay posiciones. El efectivo está en ' +
      fmtPesos(S.efectivo) + '.</div>';

  $('#bitacora').innerHTML = S.operaciones.length
    ? '<div class="tarjeta">' + S.operaciones.slice(0, 40).map(o => `<div class="op">
        <span class="op-lado ${o.lado}">${o.lado === 'compra' ? 'Compra' : 'Venta'}</span>
        <div class="op-cuerpo">
          <p><b>${esc(o.t)}</b> · ${fmtNum(o.nominales)} nominales</p>
          <p class="op-sub">${fmtPesos(o.precio, 'completo')} por 100 ·
            ${fmtPesos(o.costos, 'completo')} de costos${
            o.resultado != null ? ' · resultado <span class="' + signoClase(o.resultado) + '">' +
            fmtPesos(o.resultado, 'completo') + '</span>' : ''}</p>
        </div>
        <span class="op-monto">${o.lado === 'compra' ? '−' : '+'}${fmtPesos(o.total)}</span>
      </div>`).join('') + '</div>'
    : '<div class="vacio">Sin operaciones.</div>';

  renderSelectorBono();
  renderPrevia();
}

/* ============================= FLUJOS =============================== */

function renderFlujos() {
  const v = M.valuarCartera(S.posiciones, R.porTicker);
  const cobros = M.calendarioCobros(v.filas, R.liq, 36);

  if (!cobros.length) {
    $('#calendario').innerHTML = '<div class="vacio">Sin posiciones no hay nada que cobrar. ' +
      'Comprá algo en Cartera y el calendario se llena solo.</div>';
    return;
  }

  /* Agrupados por mes, que es como se mira un calendario de cobros. */
  const porMes = {};
  for (const c of cobros) {
    const k = c.fecha.slice(0, 7);
    (porMes[k] = porMes[k] || []).push(c);
  }

  const total = cobros.reduce((s, c) => s + c.pesos, 0);
  let html = `<p class="explica">${cobros.length} cobros en los próximos tres años,
    ${fmtPesos(total)} en total a valores de hoy.</p>`;

  for (const [mes, lista] of Object.entries(porMes)) {
    const [y, m] = mes.split('-').map(Number);
    const suma = lista.reduce((s, c) => s + c.pesos, 0);
    html += `<h3 class="mes">${MESES[m - 1]} ${y} · ${fmtPesos(suma)}</h3>`;
    html += lista.map(c => `<div class="cobro">
      <div class="cobro-dia">
        <strong>${Number(c.fecha.slice(8, 10))}</strong>
        <span>${MES3[m - 1]}</span>
      </div>
      <div class="cobro-cuerpo">
        <b>${esc(c.t)}</b>
        <p>${esc(c.nombre)}</p>
      </div>
      <div class="cobro-monto">
        ${fmtPesos(c.pesos)}
        ${c.convertido ? `<span>US$ ${fmtNum(c.importe, 2)}</span>` : ''}
      </div>
    </div>`).join('');
  }
  $('#calendario').innerHTML = html;
}

/* ============================ AJUSTES =============================== */

function renderAjustes() {
  $('#cfgCapital').value = S.capital;
  $('#cfgCompra').value  = (S.comisiones.compra * 100).toFixed(3);
  $('#cfgVenta').value   = (S.comisiones.venta * 100).toFixed(3);
  $('#cfgMercado').value = (S.comisiones.mercado * 100).toFixed(3);
  $('#cfgIva').value     = (S.comisiones.iva * 100).toFixed(0);

  const sanos = R.instrumentos.filter(a => a.confiable).length;
  $('#infoFoto').innerHTML =
    `Precios de InvertirOnline del ${fmtFecha(D.SNAPSHOT)} al cierre, para liquidar el
     ${fmtFecha(D.LIQUIDACION)}. ${R.instrumentos.length} instrumentos, ${sanos} con el dato sano.
     Tipo de cambio implícito ${fmtPesos(D.FX, 'completo')}. Versión ${VERSION}.`;
}

function aplicarAjustes() {
  const num = (id, div) => {
    const v = parseFloat($(id).value);
    return isFinite(v) && v >= 0 ? v / div : null;
  };
  const cap = parseFloat($('#cfgCapital').value);
  if (isFinite(cap) && cap >= 0) S.capital = cap;

  const c = { compra: num('#cfgCompra', 100), venta: num('#cfgVenta', 100),
              mercado: num('#cfgMercado', 100), iva: num('#cfgIva', 100) };
  for (const k of Object.keys(c)) if (c[k] != null) S.comisiones[k] = c[k];
  guardar();
  renderTodo();
}

function reiniciar() {
  if (!confirm('Se borran las posiciones y la bitácora, y todo el capital vuelve a efectivo. ¿Seguimos?')) return;
  const capital = S.capital, comisiones = S.comisiones;
  S = { ...inicial(), capital, efectivo: capital, comisiones };
  guardar();
  renderTodo();
}

/* =========================== GLOSARIO =============================== */

/* Cada término con su nombre en inglés al lado: es el que van a usar
   los devs, los informes del broker y la documentación de la API. */
const TERMINOS = [
  ['TIR', 'yield to maturity (YTM)',
   'Lo que rinde por año si lo comprás hoy y lo tenés hasta el vencimiento, cobrando ' +
   'todo y reinvirtiendo los cupones a esa misma tasa. Es la medida estándar para ' +
   'comparar bonos distintos.'],
  ['Duration', 'duration',
   'El plazo promedio de los pagos, ponderado por cuánto pesa cada uno. Un bono con ' +
   'duration 5 te devuelve la plata, en promedio, dentro de 5 años.'],
  ['Duration modificada', 'modified duration',
   'Cuánto se mueve el precio si la tasa se mueve un punto. Con duration modificada 5, ' +
   'un punto más de tasa son 5% menos de precio. Es la medida de riesgo.'],
  ['Punto básico', 'basis point (bp o bps)',
   'Una centésima de punto porcentual. 100 puntos básicos son 1%. Se usa porque decir ' +
   '"subió 0,25%" se confunde con "subió un cuarto por ciento del precio".'],
  ['Paridad', 'parity',
   'Precio sobre valor técnico. Abajo de 100% el mercado compra con descuento sobre lo ' +
   'que dice el contrato: desconfía de que se pague todo.'],
  ['Valor técnico', 'technical value',
   'Lo que vale el papel si el emisor paga todo: capital que queda vivo más los intereses ' +
   'ya devengados.'],
  ['Precio sucio y limpio', 'dirty price / clean price',
   'El sucio incluye los intereses corridos, el limpio no. Pagás el sucio; los bonos se ' +
   'cotizan en limpio para poder compararlos sin que el momento del cupón ensucie.'],
  ['Intereses corridos', 'accrued interest',
   'El cupón que se viene devengando desde el último pago. Si comprás a mitad de camino ' +
   'se los pagás al vendedor, porque después cobrás el cupón entero.'],
  ['Devengamiento', 'carry',
   'Lo que rinde la posición solo por el paso del tiempo, sin que se mueva nada.'],
  ['Recorrido de curva', 'roll-down',
   'La ganancia extra de que el bono se vaya acortando: al perder plazo cae a una parte ' +
   'más barata de la curva y el precio sube.'],
  ['Nominal residual', 'residual / outstanding nominal',
   'Cuánto queda vivo de cada 100 de capital original, después de las amortizaciones ' +
   'ya cobradas.'],
  ['Amortización', 'principal repayment',
   'La devolución del capital. Un bono que amortiza en cuotas te va devolviendo la plata ' +
   'antes del vencimiento.'],
  ['Cupón', 'coupon',
   'El interés que paga el bono en cada fecha pactada.'],
  ['Hard dollar', 'hard dollar',
   'Bono que paga en dólares de verdad, no en pesos ajustados por el dólar.'],
  ['CER', 'CER-linked / inflation-linked',
   'El capital se ajusta por inflación. Te cubre de la inflación, no del dólar.'],
  ['Lecap', 'zero-coupon bill',
   'Letra capitalizable: no paga cupones, te devuelve todo junto al vencimiento.'],
  ['Spread', 'spread',
   'La diferencia de tasa entre dos cosas. Acá, entre un bono y su par de la otra ley.'],
  ['R²', 'R-squared / coefficient of determination',
   'Qué parte de la dispersión explica la recta ajustada. Cerca de 1, los bonos están ' +
   'alineados y el que se aparta es una señal. Cerca de 0, la recta no dice nada.'],
  ['Paper trading', 'paper trading',
   'Operar simulado, anotando en un papel, para probar una estrategia sin arriesgar plata.'],
  ['Snapshot', 'snapshot',
   'Una foto de los datos en un instante. Lo contrario de una consulta en vivo.']
];

function renderGlosario() {
  $('#modalCuerpo').innerHTML = TERMINOS.map(([es, en, txt]) =>
    `<div class="termino">
      <b>${esc(es)}</b>
      <span class="en">${esc(en)}</span>
      <p>${esc(txt)}</p>
    </div>`).join('');
}

/* ============================= eventos ============================== */

function irA(vista) {
  $$('.vista').forEach(v => { v.hidden = v.id !== 'v-' + vista; });
  $$('.tab').forEach(t => t.classList.toggle('activo', t.dataset.vista === vista));
  window.scrollTo(0, 0);
}

function renderTodo() {
  $('#subtitulo').textContent = 'Foto del ' + fmtFecha(D.SNAPSHOT) + ' · ' +
    R.instrumentos.length + ' instrumentos';
  renderHoy();
  renderSelectorCurva();
  renderCurva();
  renderMercado();
  renderCartera();
  renderFlujos();
  renderAjustes();
}

document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) return irA(tab.dataset.vista);

  const grupo = e.target.closest('[data-grupo]');
  if (grupo) { grupoActivo = grupo.dataset.grupo; tickerActivo = null;
               renderSelectorCurva(); renderCurva(); return; }

  const chipFiltro = e.target.closest('[data-filtro]');
  if (chipFiltro) {
    filtro = chipFiltro.dataset.filtro;
    $$('[data-filtro]').forEach(c => c.classList.toggle('activo', c === chipFiltro));
    return renderMercado();
  }

  const th = e.target.closest('#tablaMercado th');
  if (th) {
    if (ordenCampo === th.dataset.orden) ordenAsc = !ordenAsc;
    else { ordenCampo = th.dataset.orden; ordenAsc = th.dataset.orden === 't'; }
    return renderMercado();
  }

  const fila = e.target.closest('#tablaMercado tbody tr[data-t]');
  if (fila) { abierta = abierta === fila.dataset.t ? null : fila.dataset.t; return renderMercado(); }

  /* Tocar un punto del gráfico o una fila del detalle resalta el bono
     en los dos lados a la vez. */
  const punto = e.target.closest('.gr-punto, #detalleCurva [data-t]');
  if (punto) {
    tickerActivo = tickerActivo === punto.dataset.t ? null : punto.dataset.t;
    return renderCurva();
  }

  const atajo = e.target.closest('[data-pct]');
  if (atajo) {
    const pct = parseFloat(atajo.dataset.pct);
    if ($('#opLado').value === 'compra') {
      $('#opMonto').value = Math.floor(S.efectivo * pct);
    } else {
      const pos = S.posiciones.find(p => p.t === $('#opBono').value);
      $('#opMonto').value = pos ? Math.floor(pos.nominales * pct) : 0;
    }
    return renderPrevia();
  }

  if (e.target.closest('#btnOperar')) return operar();
  if (e.target.closest('#btnReiniciar')) return reiniciar();
  if (e.target.closest('#btnAyuda')) { renderGlosario(); $('#modal').hidden = false; return; }
  if (e.target.closest('#btnCerrar') || e.target.id === 'modal') { $('#modal').hidden = true; return; }

  if (e.target.closest('#btnExportar')) {
    $('#areaCopia').value = JSON.stringify(S);
    $('#areaCopia').select();
    return;
  }
  if (e.target.closest('#btnImportar')) {
    try {
      const s = JSON.parse($('#areaCopia').value);
      if (!s || typeof s !== 'object') throw new Error('formato');
      S = { ...inicial(), ...s, comisiones: { ...M.COMISIONES, ...(s.comisiones || {}) } };
      guardar(); renderTodo();
      $('#areaCopia').value = '';
      alert('Copia importada.');
    } catch (err) { alert('Esa copia no se entiende. Tiene que ser el texto que sale de Exportar.'); }
    return;
  }
});

/* El lado de la operación cambia qué significa el campo de al lado: en
   una compra son pesos, en una venta son nominales. */
$('#opLado').addEventListener('change', () => {
  const venta = $('#opLado').value === 'venta';
  $('#lblMonto').firstChild.textContent = venta ? 'Nominales a vender' : 'Monto en pesos';
  $('#opMonto').value = '';
  renderPrevia();
});

$('#opBono').addEventListener('change', renderPrevia);
$('#opMonto').addEventListener('input', renderPrevia);
$$('#v-ajustes input').forEach(i => i.addEventListener('change', aplicarAjustes));

renderTodo();
irA('hoy');

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

})();
