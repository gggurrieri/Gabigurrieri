/* Pruebas del motor de renta fija.
   Uso:  node inversiones/tests/motor.js     (sale con código 1 si algo falla)

   No abren un navegador: el motor no toca la pantalla a propósito, así que
   se lo puede correr entero en medio segundo. Son de tres tipos:

     1. Contra la matemática — un bono cero cupón tiene respuestas que se
        calculan a mano, y el motor tiene que dar exactamente esas.
     2. Contra IOL — la TIR y la duration recalculadas desde el flujo
        tienen que coincidir con las que publica el broker. Es el control
        que detecta si una convención de días o un tipo de cambio están
        mal, que es donde se rompe todo en renta fija.
     3. Contra el sentido común — que una compra no deje el efectivo en
        negativo, que un cobro ya pasado no aparezca en el calendario.   */

const path = require('path');
const D = require(path.join(__dirname, '..', 'assets', 'datos.js'));
const M = require(path.join(__dirname, '..', 'assets', 'motor.js'));

let ok = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d ? ' → ' + d : '')); }
};
const cerca = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const pb = x => (x * 10000).toFixed(1) + ' pb';

const LIQ = D.LIQUIDACION;
const R = M.correr(D);

/* ==================================================================== */
console.log('\nValuación contra la matemática');
/* ==================================================================== */

/* Un pago de 110 dentro de un año exacto, descontado al 10%, vale 100. */
{
  const flujo = [[M.sumarDias(LIQ, 365), 110]];
  check('valor presente de un pago a un año al 10% da 100',
    cerca(M.valorPresente(flujo, 0.10, LIQ), 100, 1e-9),
    String(M.valorPresente(flujo, 0.10, LIQ)));

  check('la TIR de ese mismo flujo comprado a 100 da 10%',
    cerca(M.tir(flujo, 100, LIQ), 0.10, 1e-9),
    String(M.tir(flujo, 100, LIQ)));

  /* En un cero cupón la duration es el plazo: no hay pagos intermedios
     que la acorten. */
  const d = M.duration(flujo, 0.10, LIQ);
  check('la duration de un cero cupón a un año es 1', cerca(d.macaulay, 1, 1e-9));
  check('la duration modificada es la de Macaulay sobre (1+tasa)',
    cerca(d.modificada, 1 / 1.10, 1e-9));
}

/* TIR y valor presente son la misma ecuación leída en las dos
   direcciones: si se encadenan tiene que volver el precio de partida. */
{
  const flujo = [[M.sumarDias(LIQ, 180), 5], [M.sumarDias(LIQ, 365), 5],
                 [M.sumarDias(LIQ, 730), 105]];
  let vuelve = true;
  for (const precio of [80, 95, 100, 107, 120]) {
    const t = M.tir(flujo, precio, LIQ);
    if (!cerca(M.valorPresente(flujo, t, LIQ), precio, 1e-6)) vuelve = false;
  }
  check('precio → TIR → precio vuelve al mismo número en todo el rango', vuelve);
}

/* Un pago mensual capitalizado doce veces tiene que dar la tasa anual. */
check('la TEM de una tasa anual del 26% capitaliza de vuelta al 26%',
  cerca(Math.pow(1 + M.tem(0.26), 12) - 1, 0.26, 1e-12));

/* Un precio imposible no puede devolver una tasa inventada. */
check('un precio mayor a todo lo que el bono paga no devuelve TIR',
  M.tir([[M.sumarDias(LIQ, 365), 100]], 1e9, LIQ) === null);
check('un flujo sin pagos futuros no devuelve TIR',
  M.tir([[M.sumarDias(LIQ, -30), 100]], 90, LIQ) === null);

/* ==================================================================== */
console.log('\nTipo de cambio implícito');
/* ==================================================================== */

{
  const enDolares = D.INSTRUMENTOS.filter(i => i.moneda === 'USD' && i.vt != null);
  const fxs = enDolares.map(i => M.fxImplicito(i));
  const min = Math.min(...fxs), max = Math.max(...fxs);
  check('los ' + enDolares.length + ' bonos en dólares dan el mismo tipo de cambio',
    max - min < 0.01, 'entre ' + min.toFixed(4) + ' y ' + max.toFixed(4));
  check('y ese tipo de cambio es el que quedó escrito en la foto',
    cerca(fxs[0], D.FX, 0.01), fxs[0].toFixed(3) + ' vs ' + D.FX);
  check('un instrumento en pesos no se convierte', M.fxImplicito({ moneda: 'ARS' }) === 1);
}

/* ==================================================================== */
console.log('\nRecálculo contra lo que publica IOL');
/* ==================================================================== */

/* El control de fondo. Si estas dos pruebas pasan, el motor está
   descontando los flujos igual que el broker: misma convención de días,
   misma fecha de liquidación, mismo tipo de cambio. Si fallan, no hay
   señal que valga porque el número de partida está mal. */
{
  const buenos = R.instrumentos.filter(a => !a.sospechoso);
  const malas = buenos.filter(a => !cerca(a.tir, a.tirIol, 0.005));
  check('la TIR recalculada coincide con la de IOL en los ' + buenos.length + ' instrumentos sanos',
    malas.length === 0,
    malas.map(a => a.t + ' ' + pb(a.difTir)).join(', '));

  const peor = buenos.reduce((p, a) => Math.abs(a.difTir) > Math.abs(p.difTir) ? a : p, buenos[0]);
  check('y la peor diferencia queda abajo de 5 puntos básicos',
    Math.abs(peor.difTir) < 0.0005, peor.t + ' ' + pb(peor.difTir));

  const dmMalas = buenos.filter(a => !cerca(a.dm, a.dmIol, 0.05));
  check('la duration modificada también coincide', dmMalas.length === 0,
    dmMalas.map(a => a.t + ' ' + a.dm.toFixed(3) + ' vs ' + a.dmIol.toFixed(3)).join(', '));

  /* La paridad es precio sobre valor técnico: si no cierra, alguno de
     los dos campos de la foto se copió mal. */
  const parMalas = R.instrumentos.filter(a => a.paridad != null && !cerca(a.paridadCalc, a.paridad, 0.001));
  check('la paridad recalculada coincide con la de la foto', parMalas.length === 0,
    parMalas.map(a => a.t).join(', '));
}

/* ==================================================================== */
console.log('\nIntegridad de la foto');
/* ==================================================================== */

{
  const tickers = D.INSTRUMENTOS.map(i => i.t);
  check('no hay tickers repetidos', new Set(tickers).size === tickers.length);

  const sinFlujo = D.INSTRUMENTOS.filter(i => !i.flujo || !i.flujo.length);
  check('todos los instrumentos tienen flujo', sinFlujo.length === 0,
    sinFlujo.map(i => i.t).join(', '));

  const desordenados = D.INSTRUMENTOS.filter(i =>
    i.flujo.some((p, k) => k > 0 && p[0] <= i.flujo[k - 1][0]));
  check('los flujos vienen ordenados por fecha y sin repetir', desordenados.length === 0,
    desordenados.map(i => i.t).join(', '));

  const noNegativos = D.INSTRUMENTOS.filter(i => i.flujo.some(p => !(p[1] > 0)));
  check('ningún pago es cero o negativo', noNegativos.length === 0,
    noNegativos.map(i => i.t).join(', '));

  /* El último pago tiene que caer el día del vencimiento: si cae antes,
     al flujo le faltan pagos — que es exactamente lo que le pasa al
     GD30 y por eso está marcado. */
  const malVto = D.INSTRUMENTOS.filter(i => i.flujo[i.flujo.length - 1][0] !== i.vto);
  check('el último pago cae el día del vencimiento', malVto.length === 0,
    malVto.map(i => i.t).join(', '));

  const fechaMala = D.INSTRUMENTOS.filter(i =>
    i.flujo.some(p => !/^\d{4}-\d{2}-\d{2}$/.test(p[0])) || !/^\d{4}-\d{2}-\d{2}$/.test(i.vto));
  check('todas las fechas están en formato ISO', fechaMala.length === 0);

  const claseMala = D.INSTRUMENTOS.filter(i => !D.CLASES[i.clase] || !D.LEYES[i.ley]);
  check('toda clase y toda ley tienen su descripción', claseMala.length === 0,
    claseMala.map(i => i.t).join(', '));
}

/* ==================================================================== */
console.log('\nDetección de datos sucios');
/* ==================================================================== */

{
  const marcados = R.instrumentos.filter(a => a.sospechoso);
  check('la foto trae los dos instrumentos con datos rotos marcados',
    marcados.length === 2 && marcados.some(a => a.t === 'S30N6') && marcados.some(a => a.t === 'GD30'),
    marcados.map(a => a.t).join(', '));

  check('un instrumento marcado no se considera confiable',
    marcados.every(a => !a.confiable));

  check('y no da señal de compra ni de venta',
    marcados.every(a => a.señal === 'sin-dato' || a.señal === 'sin-curva'),
    marcados.map(a => a.t + ':' + a.señal).join(', '));

  /* Y sobre todo: no tienen que poder mover la recta contra la que se
     mide a los demás. */
  const ny = R.curvas['hd/tesoro/ny'];
  check('el bono con el flujo incompleto no entra en el ajuste de su curva',
    ny.total === 5 && ny.usados === 4, 'total ' + ny.total + ', usados ' + ny.usados);
}

/* ==================================================================== */
console.log('\nCurva y señales');
/* ==================================================================== */

{
  /* Propiedad de los mínimos cuadrados: la recta pasa por el punto
     promedio de la nube. Si esto falla, la regresión está mal. */
  const puntos = [{ x: 1, y: 2 }, { x: 2, y: 3.1 }, { x: 3, y: 4.2 }, { x: 4, y: 4.9 }];
  const r = M.recta(puntos);
  const mx = 2.5, my = puntos.reduce((s, p) => s + p.y, 0) / 4;
  check('la recta ajustada pasa por el promedio de los puntos', cerca(r.en(mx), my, 1e-9));
  check('el R² de una nube casi alineada es alto', r.r2 > 0.99, r.r2.toFixed(4));
  check('el R² de una recta exacta es 1',
    cerca(M.recta([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }]).r2, 1, 1e-12));
  check('con menos de dos puntos no hay recta', M.recta([{ x: 1, y: 1 }]) === null);

  /* Los residuos de una regresión suman cero por construcción: si la
     señal dijera que todos los bonos de un grupo están baratos, sería
     un error de método y no un mercado regalado. */
  const local = R.instrumentos.filter(a => M.grupoDe(a) === 'hd/tesoro/local' && a.confiable);
  const suma = local.reduce((s, a) => s + a.residuo, 0);
  check('los desvíos contra la curva suman cero dentro del grupo',
    cerca(suma, 0, 1e-9), pb(suma));

  check('la curva de ley argentina se ajusta con los cinco Bonares',
    R.curvas['hd/tesoro/local'].usados === 5);
  check('y explica la dispersión lo suficiente como para dar señal',
    R.curvas['hd/tesoro/local'].recta.r2 > M.R2_MINIMO && !R.curvas['hd/tesoro/local'].debil,
    'R² ' + R.curvas['hd/tesoro/local'].recta.r2.toFixed(3));

  check('la curva de ley Nueva York queda marcada como débil',
    R.curvas['hd/tesoro/ny'].debil,
    'R² ' + R.curvas['hd/tesoro/ny'].recta.r2.toFixed(3));
  check('y por eso ninguno de sus bonos da señal de operar',
    R.instrumentos.filter(a => a.ley === 'ny' && a.confiable)
      .every(a => a.señal === 'curva-debil'));

  /* La pendiente de una curva sana es positiva: a más plazo, más tasa. */
  check('la curva de ley argentina tiene pendiente positiva',
    R.curvas['hd/tesoro/local'].recta.b > 0,
    pb(R.curvas['hd/tesoro/local'].recta.b) + ' por año de duration');

  /* Grupos con pocos bonos no pueden dar señal: con dos puntos la recta
     pasa exacta y todos los desvíos darían cero. */
  check('un grupo con menos de cuatro bonos no arma curva',
    R.curvas['letra/tesoro'].recta === null && R.curvas['cer/tesoro'].recta === null);
  check('y sus instrumentos quedan sin señal',
    R.instrumentos.filter(a => a.clase !== 'hd').every(a => a.señal === 'sin-curva'));

  /* El Bopreal lo emite el Banco Central: no puede compararse contra
     los bonos del Tesoro aunque los dos paguen en dólares. */
  check('el Bopreal queda en su propio grupo, separado del Tesoro',
    R.curvas['hd/bcra/local'].total === 1 &&
    R.porTicker.BPOA7.señal === 'sin-curva');

  /* Ninguna señal puede salir de un desvío menor al umbral. */
  const chicas = R.instrumentos.filter(a =>
    (a.señal === 'comprar' || a.señal === 'vender') && Math.abs(a.residuo) <= M.UMBRAL);
  check('ninguna señal sale de un desvío por debajo del umbral', chicas.length === 0,
    chicas.map(a => a.t).join(', '));
}

/* ==================================================================== */
console.log('\nSpread entre las dos leyes');
/* ==================================================================== */

{
  const L = R.legislativo;
  check('se arman los cuatro pares Bonar / Global que comparten vencimiento',
    L.pares.length === 4, L.pares.map(p => p.local.t + '/' + p.ny.t).join(' '));

  check('cada par comparte vencimiento y no comparte ley',
    L.pares.every(p => p.local.vto === p.ny.vto && p.local.ley === 'local' && p.ny.ley === 'ny'));

  check('el par con un bono de dato dudoso no entra en el promedio',
    L.usados === 3 && L.pares.find(p => p.local.t === 'AL30').confiable === false);

  /* El bono bajo ley argentina tiene que rendir más que su par bajo ley
     de Nueva York: es peor papel, tiene que pagar más. Si el spread
     diera negativo, o el mercado está raro o el dato está mal. */
  check('todos los spreads son positivos, como corresponde al riesgo legal',
    L.pares.every(p => p.spread > 0),
    L.pares.map(p => p.local.t + ' ' + pb(p.spread)).join(', '));

  check('los desvíos contra el spread promedio suman cero entre los pares sanos',
    cerca(L.pares.filter(p => p.confiable).reduce((s, p) => s + p.desvio, 0), 0, 1e-9));
}

/* ==================================================================== */
console.log('\nRetorno a un horizonte');
/* ==================================================================== */

{
  /* En un cero cupón sostenido hasta el vencimiento, el retorno del
     período tiene que ser exactamente la TIR: no hay nada más. */
  const flujo = [[M.sumarDias(LIQ, 365), 110]];
  const inst = { flujo };
  const r = M.retornoHorizonte(inst, 0.10, LIQ, 12, null);
  check('un cero cupón sostenido hasta el final rinde su TIR',
    cerca(r.total, 0.10, 1e-6), (r.total * 100).toFixed(4) + '%');

  check('el retorno se parte en devengamiento y recorrido de curva',
    cerca(r.carry + r.rolldown, r.total, 1e-12));

  /* Sin curva no hay recorrido: el bono se revende a la misma tasa. */
  check('sin curva, todo el retorno es devengamiento',
    cerca(r.rolldown, 0, 1e-12));

  /* A mitad de camino tiene que haber rendido menos que al final. */
  const medio = M.retornoHorizonte(inst, 0.10, LIQ, 6, null);
  check('a la mitad del plazo rindió menos que al final',
    medio.total > 0 && medio.total < r.total,
    (medio.total * 100).toFixed(2) + '% vs ' + (r.total * 100).toFixed(2) + '%');

  check('el anualizado de medio año casi duplica el del período',
    cerca(medio.anualizado, Math.pow(1 + medio.total, 2) - 1, 1e-9));

  /* Y sobre un bono de verdad, con su curva: el número tiene que ser
     finito y razonable, no un infinito ni un NaN. */
  const al35 = R.porTicker.AL35;
  const rr = M.retornoHorizonte(al35, al35.tir, LIQ, 12, al35.curva);
  check('el retorno a doce meses del AL35 da un número razonable',
    rr && isFinite(rr.total) && rr.total > -0.5 && rr.total < 0.5,
    rr ? (rr.total * 100).toFixed(2) + '% (devengamiento ' + (rr.carry * 100).toFixed(2) +
         '% + curva ' + (rr.rolldown * 100).toFixed(2) + '%)' : 'null');
}

/* ==================================================================== */
console.log('\nComisiones y operaciones');
/* ==================================================================== */

{
  const c = M.costos(100000, 'compra');
  check('la comisión del broker se cobra sobre el monto',
    cerca(c.comision, 100000 * M.COMISIONES.compra, 1e-9));
  /* El error caro: el IVA va sobre la comisión, no sobre el monto
     operado. Sobre el monto serían veintiún mil pesos en vez de ciento
     siete. */
  check('el IVA se calcula sobre la comisión y el derecho de mercado, no sobre el monto',
    cerca(c.iva, (c.comision + c.mercado) * M.COMISIONES.iva, 1e-9),
    c.iva.toFixed(2));
  check('el costo total es la suma de las tres partes',
    cerca(c.total, c.comision + c.mercado + c.iva, 1e-9));

  /* Una compra nunca puede gastar más efectivo del que hay. */
  const al30 = R.porTicker.AL30;
  let respeta = true, alguna = false;
  for (const efectivo of [1000, 50000, 100000, 250000, 1e6, 5e6]) {
    const op = M.simularCompra(al30, efectivo);
    if (!op) continue;
    alguna = true;
    if (op.total > efectivo + 1e-9) respeta = false;
  }
  check('ninguna compra gasta más efectivo del disponible', respeta && alguna);

  check('se compran nominales enteros',
    Number.isInteger(M.simularCompra(al30, 1e6).nominales));

  check('si no alcanza ni para un nominal, no hay operación',
    M.simularCompra(al30, 10) === null);

  /* Comprar y vender en el acto, al mismo precio, tiene que perder
     exactamente lo que cuesta operar dos veces. Es la prueba de que las
     comisiones no se están comiendo ni de más ni de menos. */
  {
    const compra = M.simularCompra(al30, 1e6);
    const venta = M.simularVenta(al30, compra.nominales);
    const perdida = compra.total - venta.total;
    check('comprar y vender al mismo precio pierde justo el costo de operar',
      cerca(perdida, compra.costos.total + venta.costos.total, 1e-6),
      '$' + perdida.toFixed(2));
  }

  /* Con comisión cero no se pierde nada en el ida y vuelta. */
  {
    const sin = { compra: 0, venta: 0, mercado: 0, iva: 0 };
    const compra = M.simularCompra(al30, 1e6, sin);
    const venta = M.simularVenta(al30, compra.nominales, sin);
    check('sin comisiones, el ida y vuelta no pierde nada',
      cerca(compra.total, venta.total, 1e-9));
  }
}

/* ==================================================================== */
console.log('\nCartera');
/* ==================================================================== */

{
  const posiciones = [
    { t: 'AL30', nominales: 1000, costo: 800000 },
    { t: 'AL35', nominales: 500, costo: 600000 }
  ];
  const v = M.valuarCartera(posiciones, R.porTicker);

  check('la cartera valúa las dos posiciones', v.filas.length === 2);
  check('el valor es la suma de las posiciones a precio de hoy',
    cerca(v.valor, 1000 * R.porTicker.AL30.precio / 100 + 500 * R.porTicker.AL35.precio / 100, 1e-6));
  check('el resultado es el valor de hoy menos lo que se pagó',
    cerca(v.resultado, v.valor - v.costo, 1e-9));
  check('el precio promedio de compra sale del costo y los nominales',
    cerca(v.filas[0].precioPromedio, 800000 / 1000 * 100, 1e-9));

  /* La duration de la cartera pondera por plata, no por cantidad de
     bonos: una posición chica en un bono largo no la estira. */
  const dur = M.durationCartera(v.filas);
  const dms = v.filas.map(f => f.inst.dm);
  check('la duration de la cartera queda entre la del bono más corto y la del más largo',
    dur > Math.min(...dms) && dur < Math.max(...dms),
    dur.toFixed(2) + ' entre ' + Math.min(...dms).toFixed(2) + ' y ' + Math.max(...dms).toFixed(2));

  check('una posición en un ticker que no existe se ignora sin romper',
    M.valuarCartera([{ t: 'NOEXISTE', nominales: 10, costo: 100 }], R.porTicker).filas.length === 0);
  check('una cartera vacía no divide por cero',
    M.valuarCartera([], R.porTicker).resultadoPct === 0);

  /* Calendario de cobros. */
  const cal = M.calendarioCobros(v.filas, LIQ, 24);
  check('el calendario trae cobros de las dos posiciones',
    new Set(cal.map(e => e.t)).size === 2);
  check('viene ordenado por fecha',
    cal.every((e, k) => k === 0 || e.fecha >= cal[k - 1].fecha));
  check('no incluye pagos anteriores a la liquidación',
    cal.every(e => e.fecha > LIQ));
  check('ni pagos más allá del horizonte pedido',
    cal.every(e => M.dias(e.fecha, M.sumarDias(LIQ, Math.round(24 * 30.4375))) >= 0));
  check('los cobros en dólares se convierten a pesos y quedan marcados',
    cal.every(e => e.moneda !== 'USD' || (e.convertido && e.pesos > e.importe)));

  /* Un cobro concreto, calculado a mano: el AL30 paga 8,24 por cada 100
     nominales el 11/01/2027, o sea 82,40 dólares sobre 1000 nominales. */
  const primero = cal.find(e => e.t === 'AL30');
  check('el primer cobro del AL30 son 82,40 dólares sobre mil nominales',
    cerca(primero.importe, 82.40, 1e-9) && primero.fecha === '2027-01-11',
    primero.importe.toFixed(2) + ' el ' + primero.fecha);
}

/* ==================================================================== */
console.log('\nLa corrida completa');
/* ==================================================================== */

{
  check('analiza los ' + D.INSTRUMENTOS.length + ' instrumentos de la foto',
    R.instrumentos.length === D.INSTRUMENTOS.length);
  check('todos entran en el índice por ticker',
    Object.keys(R.porTicker).length === D.INSTRUMENTOS.length);
  check('ninguno se queda sin TIR', R.instrumentos.every(a => a.tir != null));
  check('ninguno se queda sin duration', R.instrumentos.every(a => a.dm != null));
  check('toda señal es una de las cinco previstas',
    R.instrumentos.every(a =>
      ['comprar', 'vender', 'neutral', 'sin-curva', 'sin-dato', 'curva-debil'].includes(a.señal)));
  check('no hay ningún NaN dando vueltas',
    R.instrumentos.every(a => [a.tir, a.dm, a.duration, a.vida, a.precioMoneda]
      .every(x => x == null || isFinite(x))));
}

console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron\n');
process.exit(fail ? 1 : 0);
