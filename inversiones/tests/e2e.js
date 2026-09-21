/* Recorrido completo de Renta Fija como un usuario, en un iPhone simulado.
   Uso:  node inversiones/tests/e2e.js      (sale con código 1 si algo falla)
   Si Playwright no trae su Chromium, pasale uno con CHROME_PATH=…

   Las pruebas del motor (tests/motor.js) verifican que los números estén
   bien. Estas verifican otra cosa: que lo que se ve en la pantalla sea
   ese número y no otro, que tocar un botón haga lo que dice, y que el
   estado sobreviva a recargar la página.                                */

const path = require('path');
const { chromium, devices } = require('playwright');

let ok = 0, fail = 0;
const check = (n, c, d = '') => {
  if (c) { ok++; console.log('  ✓ ' + n); }
  else { fail++; console.log('  ✗ ' + n + (d ? ' → ' + d : '')); }
};

(async () => {
  const opciones = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};
  const b = await chromium.launch(opciones);
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3,
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(300);

  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('rentafija_v1') || 'null'));
  const ir = async v => { await p.tap(`.tab[data-vista="${v}"]`); await p.waitForTimeout(200); };
  const txt = async s => (await p.textContent(s) || '').replace(/\s+/g, ' ').trim();
  /* offsetParent no sirve acá: en un elemento con position fixed —el
     modal del glosario— siempre da null aunque esté a la vista. Se mide
     el rectángulo, que funciona para los dos casos. */
  const visible = async s => p.evaluate(x => {
    const e = document.querySelector(x);
    if (!e || e.hidden) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, s);

  /* ================================================================== */
  console.log('\nArranque');
  /* ================================================================== */

  check('la app abre en Hoy', await visible('#v-hoy'));
  check('el subtítulo dice de cuándo es la foto',
    /20 sep 26.*17 instrumentos/.test(await txt('#subtitulo')), await txt('#subtitulo'));
  check('la cartera arranca con el capital entero',
    (await txt('#kpiValor')) === '$1,00 M', await txt('#kpiValor'));
  check('sin operar, el resultado es cero',
    (await txt('#kpiResultado')) === '+0,00%', await txt('#kpiResultado'));
  check('sin posiciones no hay duration', (await txt('#kpiDuration')) === '—');
  check('el pie dice cuánto hay en efectivo',
    /\$0,00 invertidos · \$1,00 M en efectivo/.test(await txt('#pieEfectivo')),
    await txt('#pieEfectivo'));

  /* ================================================================== */
  console.log('\nSeñales y control de datos');
  /* ================================================================== */

  {
    const señales = await p.$$eval('#señales .señal', ns =>
      ns.map(n => n.querySelector('.señal-tic').textContent + ':' + n.className));
    check('aparece la señal de compra del AE38',
      señales.some(s => s.startsWith('AE38') && /comprar/.test(s)), señales.join(' '));
    check('y la de venta del AL29',
      señales.some(s => s.startsWith('AL29') && /vender/.test(s)), señales.join(' '));
    check('los bonos de curva floja no aparecen como señal',
      !señales.some(s => /^GD3[58]|^GD4/.test(s)), señales.join(' '));

    /* Que la explicación diga el número correcto, no uno cualquiera. */
    const textoAe38 = await p.$$eval('#señales .señal', ns => {
      const n = ns.find(x => x.querySelector('.señal-tic').textContent === 'AE38');
      return n ? n.textContent.replace(/\s+/g, ' ') : '';
    });
    check('la señal explica contra qué tasa se compara',
      /Rinde 10,27% y la curva de Dólares · ley argentina le asigna 9,44%/.test(textoAe38),
      textoAe38.slice(0, 120));
    check('y muestra el desvío en puntos básicos', /\+83 pb/.test(textoAe38));
  }

  {
    const alertas = await p.$$eval('#alertas .alerta', ns => ns.map(n => n.textContent));
    check('las dos alertas de datos rotos están a la vista', alertas.length === 2, String(alertas.length));
    check('una es la letra con los corridos disparados',
      alertas.some(a => /S30N6/.test(a) && /5\.892\.788/.test(a)));
    check('la otra es el global con el flujo incompleto',
      alertas.some(a => /GD30/.test(a) && /faltan pagos/.test(a)));
  }

  {
    const pares = await p.$$eval('#legislativo .señal', ns => ns.map(n => n.textContent.replace(/\s+/g, ' ')));
    check('los cuatro pares Bonar/Global están listados', pares.length === 4, String(pares.length));
    check('el par con el dato dudoso se marca como tal',
      pares.some(x => /AL30 \/ GD30/.test(x) && /dato dudoso/.test(x)));
    check('el promedio de spreads sale publicado',
      /127 pb/.test(await txt('#legislativo')), await txt('#legislativo'));
  }

  /* ================================================================== */
  console.log('\nCurva');
  /* ================================================================== */

  await ir('curva');
  check('la vista de curva se muestra', await visible('#v-curva'));
  check('hay un gráfico dibujado', (await p.$$('#grafico svg circle')).length > 0);

  {
    const grupos = await p.$$eval('#selectorCurva .chip', ns => ns.map(n => n.textContent));
    check('solo se ofrecen los grupos que llegaron a armar curva',
      grupos.length === 2 && grupos.some(g => /ley argentina/.test(g)) &&
      grupos.some(g => /Nueva York/.test(g)), grupos.join(' | '));

    const pie = await txt('#pieCurva');
    check('el pie dice cuánto explica la recta y con cuántos bonos',
      /explica el 93%/.test(pie) && /5 de 5 bonos/.test(pie), pie);
    check('y cuánta tasa agrega cada año de plazo', /121 pb/.test(pie), pie);
  }

  /* El grupo de ley Nueva York tiene que avisar que no sirve para operar. */
  await p.tap('#selectorCurva .chip:nth-child(2)');
  await p.waitForTimeout(200);
  {
    const pie = await txt('#pieCurva');
    check('la curva floja avisa que no da señal',
      /Es poco/.test(pie) && /no da señal/.test(pie), pie);
    check('el bono con el dato roto se dibuja hueco, fuera del ajuste',
      await p.$eval('#grafico [data-t="GD30"] circle', c => c.getAttribute('fill') === 'none'));
  }

  await p.tap('#selectorCurva .chip:nth-child(1)');
  await p.waitForTimeout(200);

  /* Tocar un punto resalta el bono. */
  await p.tap('#grafico [data-t="AE38"]');
  await p.waitForTimeout(200);
  check('tocar un punto del gráfico lo resalta',
    await p.$eval('#grafico [data-t="AE38"]', n => n.classList.contains('sel')));

  /* ================================================================== */
  console.log('\nMercado');
  /* ================================================================== */

  await ir('mercado');
  check('la tabla lista los 17 instrumentos',
    (await p.$$('#tablaMercado tbody tr[data-t]')).length === 17);
  check('viene ordenada por TIR de mayor a menor',
    (await p.$eval('#tablaMercado tbody tr[data-t] .tic', n => n.textContent)) === 'S30N6');

  await p.tap('#tablaMercado th[data-orden="dm"]');
  await p.waitForTimeout(150);
  check('se puede reordenar por duration',
    (await p.$eval('#tablaMercado tbody tr[data-t] .tic', n => n.textContent)) === 'GD46');

  await p.tap('.chip[data-filtro="letra"]');
  await p.waitForTimeout(150);
  check('el filtro de letras deja tres',
    (await p.$$('#tablaMercado tbody tr[data-t]')).length === 3);

  await p.tap('.chip[data-filtro="señal"]');
  await p.waitForTimeout(150);
  check('el filtro de señales deja los dos con señal',
    (await p.$$('#tablaMercado tbody tr[data-t]')).length === 2);

  await p.tap('.chip[data-filtro="todos"]');
  await p.waitForTimeout(150);

  /* El detalle de una fila. */
  await p.tap('#tablaMercado tbody tr[data-t="AL30"]');
  await p.waitForTimeout(200);
  {
    const det = (await txt('.detalle')) || '';
    check('el detalle se abre al tocar la fila', det.length > 50);
    check('muestra el precio en pesos y en dólares',
      /\$85\.300,00 por cada 100 nominales/.test(det) && /US\$ 57,69/.test(det), det.slice(0, 160));
    check('y el tipo de cambio implícito que usó', /1\.478,71/.test(det));
    check('traduce la duration a plata', /un punto de tasa mueve 1,8% el precio/.test(det), det.slice(0, 400));
    check('muestra el retorno a doce meses partido en sus dos partes',
      /A 12 meses/.test(det) && /devengamiento/.test(det) && /recorrido/.test(det));
  }

  /* ================================================================== */
  console.log('\nComprar');
  /* ================================================================== */

  await ir('cartera');
  check('la vista de cartera se muestra', await visible('#v-cartera'));
  check('arranca sin posiciones', /Todavía no hay posiciones/.test(await txt('#posiciones')));
  check('el botón de confirmar arranca apagado',
    await p.$eval('#btnOperar', n => n.disabled));

  await p.selectOption('#opBono', 'AL30');
  await p.tap('.chip[data-pct="0.5"]');
  await p.waitForTimeout(200);
  {
    const previa = await txt('#previa');
    /* 500.000 pesos, a 853 por nominal, dejando afuera 0,5% de comisión
       más 0,01% de mercado más IVA: entran 582 y sobran 490. */
    check('la previa dice cuántos nominales entran',
      /Nominales\s*582\b/.test(previa), previa);
    check('y separa las comisiones del monto de la operación',
      /Monto\s*\$496\.446,00/.test(previa) && /Comisiones \+ IVA\s*\$3\.063,57/.test(previa), previa);

    /* Lo que sale del efectivo no puede pasarse del medio millón que se
       puso: ese es el error clásico de no descontar la comisión antes. */
    const sale = Number((previa.match(/Sale del efectivo\s*\$([\d.]+),/) || [])[1].replace(/\./g, ''));
    check('y lo que sale del efectivo no se pasa de lo que se puso',
      sale > 0 && sale <= 500000, String(sale));
    check('el botón se habilita', !(await p.$eval('#btnOperar', n => n.disabled)));
  }

  await p.tap('#btnOperar');
  await p.waitForTimeout(300);

  {
    const s = await db();
    check('la compra quedó guardada', s.posiciones.length === 1 && s.posiciones[0].t === 'AL30');
    check('el efectivo bajó exactamente lo que decía la previa',
      Math.abs((1000000 - s.efectivo) - s.posiciones[0].costo) < 0.01,
      'efectivo ' + s.efectivo.toFixed(2) + ' costo ' + s.posiciones[0].costo.toFixed(2));
    check('y nunca quedó en negativo', s.efectivo >= 0, String(s.efectivo));
    check('la operación entró en la bitácora',
      s.operaciones.length === 1 && s.operaciones[0].lado === 'compra');
    check('la posición aparece en pantalla', /AL30/.test(await txt('#posiciones')));
  }

  /* Comprar más del mismo bono promedia el costo, no crea otra fila. */
  await p.fill('#opMonto', '100000');
  await p.waitForTimeout(150);
  await p.tap('#btnOperar');
  await p.waitForTimeout(300);
  {
    const s = await db();
    check('comprar de nuevo el mismo bono suma a la posición que ya estaba',
      s.posiciones.length === 1 && s.posiciones[0].nominales > 585, String(s.posiciones[0].nominales));
    check('y deja las dos operaciones en la bitácora', s.operaciones.length === 2);
  }

  /* No se puede gastar más de lo que hay. */
  await p.fill('#opMonto', '99999999');
  await p.waitForTimeout(150);
  check('gastar más efectivo del que hay queda bloqueado',
    await p.$eval('#btnOperar', n => n.disabled));
  check('y la app explica por qué', /No alcanza/.test(await txt('#previa')), await txt('#previa'));

  /* ================================================================== */
  console.log('\nCartera y flujos');
  /* ================================================================== */

  await ir('hoy');
  check('el total de la cartera sigue cerca del capital después de operar',
    /\$99[0-9],[0-9]+ mil|\$1,00 M|\$99[0-9]\.[0-9]{3}/.test(await txt('#kpiValor')), await txt('#kpiValor'));
  check('ahora sí hay duration de cartera', (await txt('#kpiDuration')) === '1,83',
    await txt('#kpiDuration'));
  check('el resultado refleja lo que costó operar',
    (await txt('#kpiResultado')).startsWith('-'), await txt('#kpiResultado'));

  await ir('flujos');
  {
    const cal = await txt('#calendario');
    check('el calendario se llenó con los cobros del AL30', /AL30/.test(cal));
    check('dice cuántos cobros y cuánta plata', /cobros en los próximos tres años/.test(cal), cal.slice(0, 90));
    check('el primer cobro es el de enero de 2027', /enero 2027/.test(cal));
    check('los cobros en dólares muestran también el importe original',
      (await p.$$('#calendario .cobro-monto span')).length > 0);
  }

  /* ================================================================== */
  console.log('\nVender');
  /* ================================================================== */

  await ir('cartera');
  await p.selectOption('#opLado', 'venta');
  await p.waitForTimeout(150);
  check('al vender, el campo pasa a pedir nominales',
    /Nominales a vender/.test(await txt('#lblMonto')), await txt('#lblMonto'));

  await p.selectOption('#opBono', 'AL30');
  await p.tap('.chip[data-pct="0.5"]');
  await p.waitForTimeout(200);
  {
    const previa = await txt('#previa');
    check('la previa de venta muestra el resultado de la parte que se vende',
      /Resultado/.test(previa), previa);
    check('y aclara cuántos nominales de cuántos',
      /Nominales\s*\d+ de \d+/.test(previa), previa);
  }

  const antes = await db();
  await p.tap('#btnOperar');
  await p.waitForTimeout(300);
  {
    const s = await db();
    check('la venta bajó los nominales a la mitad',
      s.posiciones[0].nominales === Math.floor(antes.posiciones[0].nominales / 2),
      s.posiciones[0].nominales + ' vs ' + antes.posiciones[0].nominales);
    check('el efectivo subió', s.efectivo > antes.efectivo);
    check('el costo de la posición bajó en proporción',
      Math.abs(s.posiciones[0].costo / antes.posiciones[0].costo -
               s.posiciones[0].nominales / antes.posiciones[0].nominales) < 0.001);
    check('la venta quedó anotada con su resultado',
      s.operaciones[0].lado === 'venta' && typeof s.operaciones[0].resultado === 'number');
  }

  /* Vender todo cierra la posición. */
  await p.fill('#opMonto', '999999');
  await p.waitForTimeout(150);
  await p.tap('#btnOperar');
  await p.waitForTimeout(300);
  {
    const s = await db();
    check('vender más de lo que hay vende lo que hay y cierra la posición',
      s.posiciones.length === 0, JSON.stringify(s.posiciones));
    check('y no deja nominales negativos dando vueltas',
      s.operaciones.every(o => o.nominales > 0));
  }

  /* ================================================================== */
  console.log('\nAjustes y persistencia');
  /* ================================================================== */

  await ir('ajustes');
  check('la info de la foto está a la vista',
    /17 instrumentos, 15 con el dato sano/.test(await txt('#infoFoto')), await txt('#infoFoto'));

  /* Subir la comisión tiene que cambiar la previa: es el punto de todo
     el ejercicio en la parte corta de la curva. */
  await ir('cartera');
  await p.selectOption('#opLado', 'compra');
  await p.selectOption('#opBono', 'S30S6');
  await p.fill('#opMonto', '100000');
  await p.waitForTimeout(200);
  const comisionBaja = await txt('#previa');

  await ir('ajustes');
  await p.fill('#cfgCompra', '2');
  await p.dispatchEvent('#cfgCompra', 'change');
  await p.waitForTimeout(250);
  await ir('cartera');
  await p.selectOption('#opBono', 'S30S6');
  await p.fill('#opMonto', '100000');
  await p.waitForTimeout(200);
  {
    const comisionAlta = await txt('#previa');
    check('subir la comisión al 2% cambia lo que entra en la previa',
      comisionAlta !== comisionBaja, comisionAlta.slice(0, 80));
    const nominalesDe = t => Number(((t.match(/Nominales\s*([\d.]+)/) || [])[1] || '0').replace(/\./g, ''));
    const n1 = nominalesDe(comisionBaja), n2 = nominalesDe(comisionAlta);
    check('y entran menos nominales que antes', n2 < n1, n2 + ' vs ' + n1);
  }

  /* La copia de seguridad. */
  await ir('ajustes');
  await p.fill('#cfgCompra', '0.5');
  await p.dispatchEvent('#cfgCompra', 'change');
  await p.waitForTimeout(200);
  await p.tap('#btnExportar');
  await p.waitForTimeout(200);
  const copia = await p.inputValue('#areaCopia');
  check('exportar devuelve un JSON con las operaciones', (() => {
    try { const s = JSON.parse(copia); return s.operaciones.length >= 4; } catch (e) { return false; }
  })(), copia.slice(0, 60));

  /* Y que todo sobreviva a cerrar y volver a abrir. */
  const antesRecarga = await db();
  await p.reload();
  await p.waitForTimeout(400);
  {
    const s = await db();
    check('el estado sobrevive a recargar la página',
      JSON.stringify(s) === JSON.stringify(antesRecarga));
    check('y la app vuelve a abrir en Hoy', await visible('#v-hoy'));
  }

  /* Reiniciar. */
  p.on('dialog', d => d.accept());
  await ir('ajustes');
  await p.tap('#btnReiniciar');
  await p.waitForTimeout(400);
  {
    const s = await db();
    check('reiniciar deja la simulación en cero',
      s.posiciones.length === 0 && s.operaciones.length === 0 && s.efectivo === s.capital,
      JSON.stringify({ p: s.posiciones.length, o: s.operaciones.length, e: s.efectivo }));
  }

  /* ================================================================== */
  console.log('\nGlosario');
  /* ================================================================== */

  await p.tap('#btnAyuda');
  await p.waitForTimeout(250);
  check('el glosario se abre', await visible('#modal'));
  {
    const terminos = await p.$$eval('#modalCuerpo .termino b', ns => ns.map(n => n.textContent));
    check('tiene los veinte términos', terminos.length === 20, String(terminos.length));
    check('cada uno trae su nombre en inglés al lado',
      (await p.$$('#modalCuerpo .termino .en')).length === terminos.length);
    check('están los que aparecen en las pantallas',
      ['TIR', 'Duration', 'Punto básico', 'Paridad', 'R²'].every(t => terminos.includes(t)),
      terminos.join(', '));
  }
  await p.tap('#btnCerrar');
  await p.waitForTimeout(200);
  check('y se cierra', !(await visible('#modal')));

  /* ================================================================== */
  console.log('\nSin errores de consola');
  /* ================================================================== */
  check('ninguna pantalla tiró un error de JavaScript', errs.length === 0, errs.join(' | '));

  await b.close();
  console.log('\n' + ok + ' pasaron, ' + fail + ' fallaron\n');
  process.exit(fail ? 1 : 0);
})();
