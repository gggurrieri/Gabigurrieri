/* =====================================================================
   Renta Fija · motor
   ---------------------------------------------------------------------
   Todo el cálculo vive acá y no toca la pantalla: ni un document, ni un
   localStorage. Así se puede probar desde node en medio segundo
   (tests/motor.js) en vez de abrir un navegador para ver si una TIR da
   bien.

   Lo que hace, en orden:
     1. valúa un flujo de fondos    → precio, TIR, duration
     2. revisa los datos de IOL     → recalcula y avisa si no cierran
     3. ajusta la curva del mercado → quién rinde de más y quién de menos
     4. lleva una cartera simulada  → compras, ventas, cobros, resultado
   ===================================================================== */
var RF_MOTOR = (function () {
'use strict';

/* ------------------------- fechas y formato ------------------------- */

const DIA = 86400000;
const fromISO = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const pad = n => String(n).padStart(2, '0');
const toISO = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
const dias = (a, b) => Math.round((fromISO(b) - fromISO(a)) / DIA);
const sumarDias = (iso, n) => toISO(fromISO(iso) + n * DIA);

/* Años entre dos fechas contando días reales sobre 365 (ACT/365, la
   convención que usa IOL para los soberanos argentinos). Existen otras
   —30/360, ACT/360— y cambian la TIR en algunas decenas de puntos
   básicos: por eso el motor recalcula y compara en vez de confiar. */
const anios = (a, b) => dias(a, b) / 365;

/* ------------------------ valuación de flujos ----------------------- */

/* Valor presente de un flujo a una tasa dada. Un flujo es una lista de
   pares [fecha, importe]; los pagos anteriores o iguales a la fecha de
   liquidación ya no se cobran y quedan afuera. */
function valorPresente(flujo, tasa, liq) {
  let vp = 0;
  for (const [fecha, importe] of flujo) {
    const t = anios(liq, fecha);
    if (t <= 0) continue;
    vp += importe / Math.pow(1 + tasa, t);
  }
  return vp;
}

/* TIR: la tasa que hace que el valor presente del flujo sea igual al
   precio. No se despeja, se busca. Bisección sobre [-0,95 ; 10]:
   lenta comparada con Newton pero no se escapa nunca, y acá se corren
   diecisiete bonos, no un millón.

   Devuelve null si el flujo no tiene pagos futuros o si ni siquiera
   cobrando todo se llega al precio (un bono que cotiza por encima de
   la suma de lo que paga: TIR negativa más allá del rango). */
function tir(flujo, precio, liq) {
  const futuros = flujo.filter(([f]) => anios(liq, f) > 0);
  if (!futuros.length || precio <= 0) return null;

  let lo = -0.95, hi = 10;
  if (valorPresente(futuros, lo, liq) < precio) return null;
  if (valorPresente(futuros, hi, liq) > precio) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (valorPresente(futuros, mid, liq) > precio) lo = mid; else hi = mid;
    if (hi - lo < 1e-12) break;
  }
  return (lo + hi) / 2;
}

/* Duration de Macaulay: el plazo promedio de los pagos, ponderado por
   cuánto pesa cada uno en el precio de hoy. Un bono con duration 5
   devuelve la plata, en promedio, dentro de 5 años.

   Duration modificada: cuánto cambia el precio, en porcentaje, si la
   tasa se mueve un punto. Es la medida de riesgo de tasa: con duration
   modificada 5, un punto más de tasa son 5% menos de precio. */
function duration(flujo, tasa, liq) {
  let vp = 0, suma = 0;
  for (const [fecha, importe] of flujo) {
    const t = anios(liq, fecha);
    if (t <= 0) continue;
    const actual = importe / Math.pow(1 + tasa, t);
    vp += actual;
    suma += t * actual;
  }
  if (vp <= 0) return { macaulay: null, modificada: null, vp: 0 };
  const macaulay = suma / vp;
  return { macaulay, modificada: macaulay / (1 + tasa), vp };
}

/* Vida promedio: lo mismo pero sin descontar. Sirve para explicar, no
   para medir riesgo. */
function vidaPromedio(flujo, liq) {
  let total = 0, suma = 0;
  for (const [fecha, importe] of flujo) {
    const t = anios(liq, fecha);
    if (t <= 0) continue;
    total += importe; suma += t * importe;
  }
  return total > 0 ? suma / total : null;
}

/* De tasa anual a mensual equivalente. La parte corta de la curva
   argentina se habla en TEM, no en TIR: "la lecap paga 1,8% mensual". */
const tem = tasaAnual => tasaAnual == null ? null : Math.pow(1 + tasaAnual, 1 / 12) - 1;

/* --------------------- moneda y tipo de cambio ---------------------- */

/* Un bono en dólares cotiza en pesos pero paga en dólares. El tipo de
   cambio que usa el broker no lo publica: queda despejado del valor
   técnico, que es capital vivo (en dólares) más intereses corridos (en
   pesos, como el precio):

       valor técnico = nominal residual × fx + corridos
       fx = (valor técnico − corridos) / nominal residual

   En la foto del 20/09 los once bonos en dólares dan 1478,705: el mismo
   número hasta el tercer decimal, así que la fórmula es la del broker y
   no una coincidencia. */
function fxImplicito(inst) {
  if (inst.moneda !== 'USD') return 1;
  if (inst.vt == null || inst.corridos == null || !inst.vn) return null;
  return (inst.vt - inst.corridos) / inst.vn;
}

/* El precio, que siempre viene en pesos, llevado a la moneda en la que
   está escrito el flujo. Sin este paso la TIR de un bono en dólares da
   un disparate. */
function precioEnMonedaDelFlujo(inst, fx) {
  return inst.moneda === 'USD' ? inst.precio / (fx || 1) : inst.precio;
}

/* ------------------------- análisis por bono ------------------------ */

/* Toma un instrumento de la foto y le calcula todo de nuevo, sin usar
   la TIR ni la duration que publica IOL salvo para compararlas.

   `alertas` es lo que no cierra. Que aparezca una no quiere decir que
   el bono sea malo: quiere decir que el dato no es confiable y que el
   bono no debería entrar en una decisión automática. */
function analizar(inst, liq) {
  const fx = fxImplicito(inst);
  const precio = precioEnMonedaDelFlujo(inst, fx);
  const t = tir(inst.flujo, precio, liq);
  const d = t == null ? { macaulay: null, modificada: null } : duration(inst.flujo, t, liq);

  const alertas = [];
  if (inst.sospechoso) alertas.push({ nivel: 'alto', campo: inst.sospechoso, texto: inst.nota });

  /* El control de fondo: si la TIR recalculada se aparta de la de IOL
     más de 50 puntos básicos, alguno de los dos está mirando otro flujo,
     otra convención de días u otro tipo de cambio. */
  let difTir = null;
  if (t != null && inst.tirIol != null) {
    difTir = t - inst.tirIol;
    if (Math.abs(difTir) > 0.005) alertas.push({
      nivel: 'medio', campo: 'tir',
      texto: 'La TIR recalculada da ' + (t * 100).toFixed(2) + '% y IOL publica ' +
             (inst.tirIol * 100).toFixed(2) + '%: ' +
             (Math.abs(difTir) * 10000).toFixed(0) + ' puntos básicos de diferencia.'
    });
  }

  /* Y el mismo control sobre la duration, que es la medida de riesgo:
     si no coincide, el tamaño de la posición se calcula mal. */
  let difDm = null;
  if (d.modificada != null && inst.dmIol != null) {
    difDm = d.modificada - inst.dmIol;
    if (Math.abs(difDm) > 0.25) alertas.push({
      nivel: 'medio', campo: 'duration',
      texto: 'La duration modificada da ' + d.modificada.toFixed(2) + ' contra ' +
             inst.dmIol.toFixed(2) + ' de IOL.'
    });
  }

  /* Paridad recalculada: precio sobre valor técnico. Abajo de 1, el
     mercado lo compra con descuento sobre lo que dice el contrato. */
  const paridad = (inst.vt && inst.vt > 0) ? inst.precio / inst.vt : null;

  return {
    ...inst,
    fx, precioMoneda: precio,
    tir: t, tem: tem(t), duration: d.macaulay, dm: d.modificada,
    vida: vidaPromedio(inst.flujo, liq),
    paridadCalc: paridad,
    difTir, difDm,
    diasAlVto: dias(liq, inst.vto),
    confiable: alertas.every(a => a.nivel !== 'alto'),
    alertas
  };
}

/* ------------------------- curva de mercado ------------------------- */

/* Mínimos cuadrados: la recta que mejor pasa por los puntos. Devuelve
   la ordenada, la pendiente y el R², que dice qué parte de la dispersión
   explica la recta (1 = los puntos están sobre la recta, 0 = no explica
   nada y la señal no vale). */
function recta(puntos) {
  const n = puntos.length;
  if (n < 2) return null;
  const mx = puntos.reduce((s, p) => s + p.x, 0) / n;
  const my = puntos.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of puntos) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) * (p.x - mx);
    syy += (p.y - my) * (p.y - my);
  }
  if (sxx === 0) return null;
  const b = sxy / sxx, a = my - b * mx;
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { a, b, r2, n, en: x => a + b * x };
}

/* Hacen falta cuatro bonos para que una recta signifique algo: con dos
   pasa exacta por los dos y todos los residuos dan cero, o sea que la
   señal diría "ninguno está barato" siempre. Con tres, un solo bono raro
   arrastra la recta entera. */
const MINIMO_CURVA = 4;

/* Y además la recta tiene que explicar algo. El R² mide qué parte de la
   diferencia de TIR entre los bonos se explica por la diferencia de
   plazo. Abajo de 0,6 la mayor parte es otra cosa —liquidez, quién lo
   tiene, un vencimiento incómodo— y el desvío contra la recta deja de
   ser una oportunidad para ser ruido con nombre técnico. */
const R2_MINIMO = 0.6;

/* Cada bono compite con los de su propia moneda, su propio emisor y su
   propia ley. Un bono en dólares del Tesoro y una lecap en pesos no se
   comparan: no es que uno rinda más, es que rinden cosas distintas.

   La ley entró en el grupo después de ver la primera corrida. Con una
   sola curva para todos los soberanos en dólares, los cinco Bonares
   salían "comprar" y los cinco Globales "vender", los diez a la vez.
   Eso no es una oportunidad: los Bonares se discuten en tribunales
   argentinos y por eso rinden de más, siempre, desde que existen. La
   señal estaba redescubriendo el riesgo legal y llamándolo ganga.

   Separadas, cada bono compite contra sus pares de verdad, y el spread
   entre las dos leyes pasa a medirse aparte (ver spreadLegislativo). */
const grupoDe = inst => inst.clase + '/' + (inst.emisor || 'tesoro') +
                        (inst.clase === 'hd' ? '/' + inst.ley : '');

/* La curva: para cada grupo, la recta de TIR contra duration modificada.
   A más plazo, más tasa — esa es la pendiente. Lo que interesa no es la
   recta sino lo que sobra: un bono que rinde más de lo que su plazo
   explica está barato respecto de sus pares. */
function ajustarCurvas(analizados) {
  const grupos = {};
  for (const a of analizados) {
    const g = grupoDe(a);
    (grupos[g] = grupos[g] || []).push(a);
  }

  const curvas = {};
  for (const [g, lista] of Object.entries(grupos)) {
    /* Solo los confiables ajustan la recta. Los sospechosos se miden
       contra ella igual, pero no la mueven. */
    const base = lista.filter(a => a.confiable && a.tir != null && a.dm != null);
    const r = base.length >= MINIMO_CURVA ? recta(base.map(a => ({ x: a.dm, y: a.tir }))) : null;
    curvas[g] = {
      grupo: g, total: lista.length, usados: base.length, recta: r,
      /* Una recta que no explica la dispersión no sirve para decir quién
         está barato: el desvío contra ella es casi todo ruido. Pasado
         ese punto el motor prefiere no dar señal antes que dar una mala. */
      debil: !!r && r.r2 < R2_MINIMO
    };
  }
  return curvas;
}

/* Umbral de señal: 50 puntos básicos. Abajo de eso el desvío es ruido
   —el spread de compra y venta de un soberano argentino ya se come esa
   diferencia— y operar por ruido es perder plata en comisiones. */
const UMBRAL = 0.005;

/* La señal de cada bono: cuánto rinde de más (o de menos) respecto de
   lo que la curva de su grupo predice para su plazo.

     residuo > +50 pb  →  barato, rinde de más            → comprar
     residuo < −50 pb  →  caro, rinde de menos            → vender
     entre medio       →  en línea con sus pares          → nada

   Un bono barato puede estar barato por algo (menos volumen, peor ley,
   un vencimiento incómodo). La señal abre la pregunta, no la cierra. */
function señalar(analizados, curvas) {
  return analizados.map(a => {
    const c = curvas[grupoDe(a)];
    if (!c || !c.recta || a.tir == null || a.dm == null) {
      return { ...a, curva: null, esperada: null, residuo: null, señal: 'sin-curva' };
    }
    const esperada = c.recta.en(a.dm);
    const residuo = a.tir - esperada;

    /* El desvío se calcula y se muestra siempre, porque explica; pero
       solo se convierte en señal cuando el dato del bono cierra y la
       recta de su grupo tiene con qué respaldarla. */
    let señal;
    if (!a.confiable) señal = 'sin-dato';
    else if (c.debil) señal = 'curva-debil';
    else if (residuo > UMBRAL) señal = 'comprar';
    else if (residuo < -UMBRAL) señal = 'vender';
    else señal = 'neutral';

    return { ...a, curva: c, esperada, residuo, señal };
  });
}

/* ----------------------- el spread por ley -------------------------- */

/* Los soberanos en dólares vienen de a pares: el mismo vencimiento y el
   mismo flujo, uno bajo ley argentina (Bonar) y otro bajo ley de Nueva
   York (Global). Lo único distinto es dónde se discute un default.

   La diferencia de TIR entre los dos es el precio que el mercado le
   pone a esa diferencia, y se mueve: se abre cuando aumenta el miedo a
   una reestructuración y se cierra cuando baja. Es la comparación más
   limpia de toda la curva argentina, porque no hay ninguna otra
   variable en el medio.

   Un spread muy por encima del promedio de los pares dice que ese Bonar
   está barato contra su Global — o que el mercado sabe algo de ese
   vencimiento en particular. */
function spreadLegislativo(analizados) {
  const hd = analizados.filter(a => a.clase === 'hd' && (a.emisor || 'tesoro') === 'tesoro');
  const porVto = {};
  for (const a of hd) (porVto[a.vto] = porVto[a.vto] || []).push(a);

  const pares = [];
  for (const [vto, lista] of Object.entries(porVto)) {
    const local = lista.find(a => a.ley === 'local');
    const ny = lista.find(a => a.ley === 'ny');
    if (!local || !ny || local.tir == null || ny.tir == null) continue;
    pares.push({
      vto, local, ny,
      spread: local.tir - ny.tir,
      confiable: local.confiable && ny.confiable
    });
  }
  pares.sort((a, b) => a.vto < b.vto ? -1 : 1);

  const buenos = pares.filter(p => p.confiable);
  const promedio = buenos.length
    ? buenos.reduce((s, p) => s + p.spread, 0) / buenos.length : null;

  return {
    pares: pares.map(p => ({ ...p, desvio: promedio == null ? null : p.spread - promedio })),
    promedio, usados: buenos.length
  };
}

/* ----------------------- retorno a un horizonte --------------------- */

/* Cuánto rinde la posición si se la sostiene N meses y la TIR no se
   mueve. Es el retorno "sin que pase nada": lo que devenga el bono solo
   por el paso del tiempo (carry) más lo que gana al acortarse el plazo
   y caer a una parte más barata de la curva (rolldown).

   Es la pregunta que de verdad importa en renta fija, más que la TIR:
   la TIR es el rendimiento si lo tenés hasta el final, y casi nadie lo
   tiene hasta el final. */
function retornoHorizonte(inst, tasa, liq, meses, curva) {
  if (tasa == null) return null;
  const futuro = sumarDias(liq, Math.round(meses * 30.4375));

  const precioHoy = valorPresente(inst.flujo, tasa, liq);
  if (precioHoy <= 0) return null;

  /* Los cupones cobrados en el medio se reinvierten a la misma tasa
     hasta la fecha de horizonte. */
  let cobrado = 0;
  for (const [fecha, importe] of inst.flujo) {
    if (dias(liq, fecha) > 0 && dias(futuro, fecha) <= 0) {
      cobrado += importe * Math.pow(1 + tasa, anios(fecha, futuro));
    }
  }

  /* Y el bono se revende. A qué tasa: si hay curva, a la que la curva
     le asigna a su nueva duration, más corta que la de hoy. Si no hay
     curva, a la misma tasa de hoy. */
  let tasaSalida = tasa;
  if (curva && curva.recta) {
    const dFuturo = duration(inst.flujo, tasa, futuro).modificada;
    if (dFuturo != null) tasaSalida = curva.recta.en(dFuturo);
  }
  const precioSalida = valorPresente(inst.flujo, tasaSalida, futuro);

  const total = (cobrado + precioSalida) / precioHoy - 1;
  const soloCarry = (cobrado + valorPresente(inst.flujo, tasa, futuro)) / precioHoy - 1;

  return {
    meses, total, carry: soloCarry, rolldown: total - soloCarry,
    tasaSalida, cobrado, precioHoy, precioSalida,
    anualizado: Math.pow(1 + total, 12 / meses) - 1
  };
}

/* --------------------------- la cartera ----------------------------- */

/* Comisiones de IOL para renta fija, como porcentajes sobre el monto.
   Salen del tarifario y se pueden cambiar en Ajustes: cada broker cobra
   distinto y el resultado de una estrategia corta se decide ahí. */
const COMISIONES = { compra: 0.005, venta: 0.005, mercado: 0.0001, iva: 0.21 };

/* Lo que cuesta operar, por encima del precio del bono. El IVA se paga
   sobre la comisión del broker y sobre el derecho de mercado, no sobre
   el monto: es un error caro confundirlo. */
function costos(monto, lado, com) {
  const c = com || COMISIONES;
  const comision = monto * (lado === 'compra' ? c.compra : c.venta);
  const mercado = monto * c.mercado;
  const iva = (comision + mercado) * c.iva;
  return { comision, mercado, iva, total: comision + mercado + iva };
}

/* Una compra: cuántos nominales entran con el efectivo disponible.
   Se compra por nominales enteros —el mercado no negocia fracciones— y
   el precio está expresado por cada 100, de ahí la división. */
function simularCompra(inst, pesos, com) {
  const precioPorNominal = inst.precio / 100;
  const c = com || COMISIONES;
  /* Del bruto hay que dejar afuera las comisiones antes de ver cuántos
     nominales entran, si no el efectivo queda en negativo. */
  const factor = 1 + (c.compra + c.mercado) * (1 + c.iva);
  const nominales = Math.floor(pesos / (precioPorNominal * factor));
  if (nominales <= 0) return null;
  const monto = nominales * precioPorNominal;
  const k = costos(monto, 'compra', c);
  return { nominales, monto, costos: k, total: monto + k.total, precioPorNominal };
}

function simularVenta(inst, nominales, com) {
  const precioPorNominal = inst.precio / 100;
  const monto = nominales * precioPorNominal;
  const k = costos(monto, 'venta', com);
  return { nominales, monto, costos: k, total: monto - k.total, precioPorNominal };
}

/* Valuación de la cartera a los precios de la foto. `costo` es lo que
   se pagó (comisiones incluidas): el resultado no tapado es la
   diferencia contra lo que vale hoy. */
function valuarCartera(posiciones, porTicker) {
  let valor = 0, costo = 0;
  const filas = [];
  for (const p of posiciones) {
    const inst = porTicker[p.t];
    if (!inst) continue;
    const actual = p.nominales * inst.precio / 100;
    const resultado = actual - p.costo;
    filas.push({
      ...p, inst, valor: actual, resultado,
      resultadoPct: p.costo > 0 ? resultado / p.costo : 0,
      precioPromedio: p.nominales > 0 ? p.costo / p.nominales * 100 : 0
    });
    valor += actual; costo += p.costo;
  }
  return {
    filas, valor, costo, resultado: valor - costo,
    resultadoPct: costo > 0 ? (valor - costo) / costo : 0
  };
}

/* Duration de la cartera: el promedio de las duration de cada posición
   ponderado por cuánta plata hay en cada una. Es el número que dice
   cuánto se mueve la cartera entera si la tasa se mueve un punto. */
function durationCartera(filas) {
  let valor = 0, suma = 0;
  for (const f of filas) {
    if (f.inst.dm == null) continue;
    valor += f.valor; suma += f.valor * f.inst.dm;
  }
  return valor > 0 ? suma / valor : null;
}

/* El calendario de cobros: qué paga la cartera y cuándo, hasta el
   horizonte pedido. Los bonos en dólares se pasan a pesos al tipo de
   cambio implícito de hoy, que es un supuesto fuerte y por eso viaja
   marcado en cada fila. */
function calendarioCobros(filas, liq, hastaMeses) {
  const limite = sumarDias(liq, Math.round((hastaMeses || 24) * 30.4375));
  const eventos = [];
  for (const f of filas) {
    for (const [fecha, importe] of f.inst.flujo) {
      if (dias(liq, fecha) <= 0 || dias(fecha, limite) < 0) continue;
      const enMoneda = importe * f.nominales / 100;
      eventos.push({
        fecha, t: f.t, nombre: f.inst.nombre, moneda: f.inst.moneda,
        importe: enMoneda,
        pesos: f.inst.moneda === 'USD' ? enMoneda * (f.inst.fx || 1) : enMoneda,
        convertido: f.inst.moneda === 'USD'
      });
    }
  }
  eventos.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);
  return eventos;
}

/* --------------------------- la corrida ----------------------------- */

/* El pipeline completo: de la foto cruda a instrumentos analizados,
   con curva y señal. Una sola puerta de entrada para la app y para las
   pruebas, así las dos miran exactamente lo mismo. */
function correr(datos, liq) {
  const fecha = liq || datos.LIQUIDACION;
  const analizados = datos.INSTRUMENTOS.map(i => analizar(i, fecha));
  const curvas = ajustarCurvas(analizados);
  const conSeñal = señalar(analizados, curvas);
  const porTicker = {};
  for (const a of conSeñal) porTicker[a.t] = a;
  return {
    liq: fecha, instrumentos: conSeñal, curvas, porTicker,
    legislativo: spreadLegislativo(conSeñal)
  };
}

return {
  dias, sumarDias, anios, toISO,
  valorPresente, tir, duration, vidaPromedio, tem,
  fxImplicito, precioEnMonedaDelFlujo,
  analizar, recta, ajustarCurvas, señalar, grupoDe,
  retornoHorizonte, spreadLegislativo,
  COMISIONES, MINIMO_CURVA, UMBRAL, R2_MINIMO,
  costos, simularCompra, simularVenta,
  valuarCartera, durationCartera, calendarioCobros,
  correr
};
})();

(typeof window !== 'undefined' ? window : globalThis).RF_MOTOR = RF_MOTOR;
if (typeof module !== 'undefined' && module.exports) module.exports = RF_MOTOR;
