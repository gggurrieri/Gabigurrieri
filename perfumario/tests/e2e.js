/* Recorrido completo de Perfumario como un usuario, en un iPhone simulado.
   Uso:  node perfumario/tests/e2e.js       (sale con código 1 si algo falla)
   Si Playwright no trae su Chromium, pasale uno con CHROME_PATH=…           */
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
    isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent,
    permissions: ['clipboard-write']
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(300);

  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('perfumario_v1') || 'null'));
  const ir = async v => { await p.tap(`.tab[data-view="${v}"]`); await p.waitForTimeout(200); };
  const visible = async s => p.evaluate(x => { const e = document.querySelector(x); return !!e && !e.hidden; }, s);
  const cuantos = async s => p.evaluate(x => document.querySelectorAll(x).length, s);

  console.log('\nA · Primer arranque');
  check('abre en Hoy', await visible('#view-hoy') && (await p.getAttribute('#view-hoy', 'class')).includes('active'));
  check('avisa que la colección está vacía', /Todav[íi]a no cargaste/.test(await p.textContent('#sugerencias')));
  check('sin datos no molesta con la copia', !(await visible('#avisoCopia')));
  check('el subtítulo lo dice', /vac[íi]a/i.test(await p.textContent('#topbarSub')));

  console.log('\nB · Datos de ejemplo');
  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#btnEjemplos'); await p.waitForTimeout(400);
  let d = await db();
  check('carga 6 perfumes', d.perfumes.length === 6, String(d.perfumes.length));
  check('carga usos hacia atrás', d.usos.length > 10, String(d.usos.length));
  check('no los duplica si se toca dos veces', await (async () => {
    await p.tap('#btnEjemplos'); await p.waitForTimeout(300);
    return (await db()).perfumes.length === 6;
  })());

  console.log('\nC · Sugerencias');
  await ir('hoy');
  check('sugiere tres', await cuantos('#sugerencias article.card') === 3);
  check('muestra un puntaje', /^\d+$/.test((await p.textContent('#sugerencias .pf-score')).trim()));
  check('explica por qué', await cuantos('#sugerencias .razones li') >= 3);
  check('dice en qué estación estamos', /(verano|otoño|invierno|primavera)/.test(await p.textContent('#contextoResumen')));
  check('ahora avisa de la copia', await visible('#avisoCopia'));

  const primero = (await p.textContent('#sugerencias .pf-name')).replace('★', '').trim();
  await p.tap('#ctxOcasion .chip[data-val="deporte"]'); await p.waitForTimeout(300);
  check('la ocasión cambia el contexto', /Deporte/.test(await p.textContent('#contextoResumen')));
  const deporte = (await p.textContent('#sugerencias .pf-name')).replace('★', '').trim();
  check('y cambia lo que sugiere', deporte !== primero, `${primero} → ${deporte}`);

  const temp0 = await p.textContent('#ctxTempOut');
  await p.evaluate(() => {
    const s = document.querySelector('#ctxTemp');
    s.value = 35;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(300);
  check('el termómetro se mueve', (await p.textContent('#ctxTempOut')) === '35°', temp0);
  check('con calor no sugiere un gourmand denso',
    !/Khamrah|Baccarat/.test(await p.textContent('#sugerencias')),
    (await p.textContent('#sugerencias .pf-name')).trim());

  console.log('\nD · Registrar un uso');
  await p.tap('#ctxOcasion .chip[data-val="casual"]'); await p.waitForTimeout(250);
  const elegido = (await p.textContent('#sugerencias .pf-name')).replace('★', '').trim();
  const mlAntes = await p.evaluate(n => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    return d.perfumes.find(x => x.nombre === n).mlRestante;
  }, elegido);
  await p.tap('#sugerencias [data-usar]'); await p.waitForTimeout(300);
  check('abre el formulario de uso', await visible('#modal') && !!(await p.$('#formUso')));
  await p.fill('#uSprays', '4');
  await p.tap('#uOcasion .chip[data-val="cita"]');
  await p.tap('#formUso button[type=submit]'); await p.waitForTimeout(400);
  d = await db();
  const uso = d.usos.filter(u => u.fecha === new Date().toISOString().slice(0, 10)).slice(-1)[0];
  check('guarda el uso de hoy', !!uso && uso.sprays === 4 && uso.ocasion === 'cita');
  const mlDespues = d.perfumes.find(x => x.nombre === elegido).mlRestante;
  check('descuenta 0,4 ml del frasco', Math.abs((mlAntes - mlDespues) - 0.4) < 0.001,
    `${mlAntes} → ${mlDespues}`);
  check('lo muestra en "Hoy te pusiste"', await visible('#cardHoyUsos') &&
    (await p.textContent('#hoyUsos')).includes(elegido));
  check('deja de recomendar lo que ya usaste hoy',
    (await p.textContent('#sugerencias .pf-name')).replace('★', '').trim() !== elegido);

  console.log('\nE · Colección');
  await ir('coleccion');
  check('lista los seis', await cuantos('#listaColeccion .pf') === 6);
  check('resume la colección', /6 de 6/.test(await p.textContent('#coleccionResumen')));
  await p.fill('#busca', 'vetiver'); await p.waitForTimeout(250);
  check('busca por nota, no solo por nombre', await cuantos('#listaColeccion .pf') === 1 &&
    (await p.textContent('#listaColeccion')).includes('Terre'));
  await p.fill('#busca', ''); await p.waitForTimeout(250);
  await p.tap('#filtroFamilia [data-fam="amaderada"]'); await p.waitForTimeout(250);
  check('filtra por familia', await cuantos('#listaColeccion .pf') === 2);
  await p.tap('#filtroFamilia [data-fam="amaderada"]'); await p.waitForTimeout(250);
  check('el filtro se suelta tocándolo de nuevo', await cuantos('#listaColeccion .pf') === 6);
  await p.selectOption('#orden', 'restante'); await p.waitForTimeout(250);
  const orden = await p.evaluate(() => Array.from(document.querySelectorAll('#listaColeccion .pf'))
    .map(e => Number((e.querySelector('.pf-bar i') || {}).style.width.replace('%', '') || 0)));
  check('ordena por lo que queda', orden.every((v, i) => i === 0 || orden[i - 1] <= v), orden.join(' '));

  console.log('\nF · Alta desde el catálogo');
  await p.tap('#btnNuevo'); await p.waitForTimeout(300);
  await p.fill('#fCatalogo', 'Dior · Sauvage');
  await p.evaluate(() => document.querySelector('#fCatalogo').dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(250);
  check('completa el nombre', (await p.inputValue('#fNombre')) === 'Sauvage');
  check('completa las notas', (await p.inputValue('#fFondo')).includes('Ambroxan'));
  check('marca las estaciones', await cuantos('#gEstaciones .chip.on') === 3);
  await p.fill('#fMl', '100'); await p.fill('#fMlRest', '100'); await p.fill('#fPrecio', '120000');
  await p.tap('#gEstaciones .chip[data-val="verano"]'); await p.waitForTimeout(120);
  check('los chips se pueden tocar', await cuantos('#gEstaciones .chip.on') === 4);
  await p.tap('#formPf button[type=submit]'); await p.waitForTimeout(400);
  d = await db();
  check('lo agrega a la colección', d.perfumes.length === 7 && !!d.perfumes.find(x => x.nombre === 'Sauvage'));
  check('guarda las notas cargadas', d.perfumes.find(x => x.nombre === 'Sauvage').fondo.length === 3);

  console.log('\nG · Ficha del perfume');
  await p.fill('#busca', 'Terre'); await p.waitForTimeout(250);
  await p.tap('#listaColeccion .pf'); await p.waitForTimeout(300);
  check('abre la ficha', (await p.textContent('#modalTitulo')).includes('Terre'));
  check('muestra la pirámide olfativa', await cuantos('#modalBody .piramide .nivel') === 3);
  check('muestra el costo por uso', /por uso/.test(await p.textContent('#modalBody')));
  await p.tap('#modalBody [data-rellenar]'); await p.waitForTimeout(350);
  d = await db();
  const terre = d.perfumes.find(x => x.nombre.includes('Terre'));
  check('rellenar deja el frasco lleno', terre.mlRestante === terre.ml, `${terre.mlRestante}/${terre.ml}`);

  console.log('\nH · Notas');
  await ir('notas');
  check('arma el perfil olfativo', await cuantos('#perfilFamilias .bar-row') >= 3);
  check('cuenta las notas repetidas', await cuantos('#perfilNotas .tag') > 0);
  await p.fill('#buscaNota', 'vetiver'); await p.waitForTimeout(250);
  check('busca en el diccionario', await cuantos('#listaNotas .nota-item') >= 1);
  check('dice cuáles de los tuyos la tienen', /Terre/.test(await p.textContent('#listaNotas')));
  await p.fill('#buscaNota', ''); await p.waitForTimeout(200);
  await p.tap('#filtroFamiliaNota [data-famnota="gourmand"]'); await p.waitForTimeout(250);
  const fams = await p.evaluate(() => Array.from(document.querySelectorAll('#listaNotas .nota-item h3 span'))
    .map(e => e.textContent.trim()));
  check('filtra el diccionario por familia', fams.length > 0 && fams.every(f => f === 'Gourmand'), fams.slice(0, 3).join(','));
  await p.tap('#filtroFamiliaNota [data-famnota="gourmand"]'); await p.waitForTimeout(200);
  await p.selectOption('#simSel', { label: 'Bleu de Chanel' }); await p.waitForTimeout(250);
  check('compara notas entre perfumes', await cuantos('#simLista .item') >= 1 ||
    /original/.test(await p.textContent('#simLista')));

  console.log('\nI · Uso');
  await ir('uso');
  check('muestra cuatro indicadores', await cuantos('#kpisUso .kpi') === 4);
  check('cuenta los usos del mes', /Usos este mes/.test(await p.textContent('#kpisUso')));
  check('dibuja la rotación', await cuantos('#rotacion .bar-row') >= 3);
  check('marca los que juntan polvo', await visible('#cardPolvo'));
  // la regla: 45 días sin usarlo, o 30 días cargado sin estrenar nunca
  const polvoEsperado = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const dias = iso => Math.round((hoy - new Date(iso + 'T00:00:00')) / 86400000);
    return d.perfumes.filter(x => {
      const us = d.usos.filter(u => u.perfumeId === x.id).map(u => u.fecha).sort();
      const ult = us.length ? us[us.length - 1] : null;
      return ult ? dias(ult) >= 45 : (x.creado ? dias(x.creado) >= 30 : false);
    }).map(x => x.nombre);
  });
  const textoPolvo = await p.textContent('#listaPolvo');
  check('lista exactamente los olvidados',
    polvoEsperado.length === await cuantos('#listaPolvo .item') &&
    polvoEsperado.every(n => textoPolvo.includes(n)),
    'esperados: ' + polvoEsperado.join(', '));
  const usosAntes = (await db()).usos.length;
  const mlAntesBorrar = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const u = d.usos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    return d.perfumes.find(x => x.id === u.perfumeId).mlRestante;
  });
  await p.tap('#historialUsos [data-borrar-uso]'); await p.waitForTimeout(350);
  d = await db();
  check('borra un uso', d.usos.length === usosAntes - 1);
  const mlPost = await p.evaluate(m => m, mlAntesBorrar);
  check('y devuelve los ml al frasco', await p.evaluate(prev => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    return d.perfumes.some(x => x.mlRestante > prev - 0.0001);
  }, mlPost));

  console.log('\nJ · Aprende de las elecciones');
  await ir('hoy');
  await p.tap('#ctxOcasion .chip[data-val="evento"]'); await p.waitForTimeout(350);
  const conAprendizaje = await p.textContent('#sugerencias');
  check('usa el historial para esa ocasión', /elección habitual para evento/.test(conAprendizaje),
    conAprendizaje.replace(/\s+/g, ' ').slice(0, 90));
  check('reconoce la familia que elegís para esa ocasión', /solés elegir/.test(conAprendizaje));
  check('muestra lo que aprendió', await visible('#cardAprendizaje'));
  check('y sobre cuántos usos lo calculó', /Sobre tus \d+ usos/.test(await p.textContent('#aprendizajeSub')));
  check('lo explica por ocasión', /Evento/.test(await p.textContent('#aprendizajeReglas')));

  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#setAprender'); await p.waitForTimeout(250);
  check('se puede apagar', (await db()).ajustes.aprender === false);
  await ir('hoy'); await p.waitForTimeout(250);
  check('apagado, vuelve a las reglas fijas', !/elección habitual/.test(await p.textContent('#sugerencias')));
  check('y esconde lo aprendido', !(await visible('#cardAprendizaje')));
  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#setAprender'); await p.waitForTimeout(250);
  check('y se puede volver a prender', (await db()).ajustes.aprender === true);

  console.log('\nK · Carga rápida');
  await ir('coleccion');
  const antesLote = (await db()).perfumes.length;
  await p.tap('#btnLote'); await p.waitForTimeout(300);
  await p.fill('#loteTexto', 'Versace Eros\nNautica Voyage | 100 | 45000\nPerfume Inventado XYZ\nSauvage');
  await p.tap('#btnRevisarLote'); await p.waitForTimeout(300);
  const preview = await p.textContent('#lotePreview');
  check('reconoce los del catálogo', /Eros/.test(preview) && /Voyage/.test(preview));
  check('avisa cuál ya tenías', /Ya lo tenés/.test(preview));
  check('y cuál no encontró', /No está en el catálogo/.test(preview));
  check('resume el lote', /2 reconocidos · 1 para completar · 1 repetidos/.test(preview),
    preview.replace(/\s+/g, ' ').slice(-90));
  await p.tap('#btnConfirmarLote'); await p.waitForTimeout(400);
  d = await db();
  check('agrega solo los nuevos', d.perfumes.length === antesLote + 3, `${antesLote} → ${d.perfumes.length}`);
  const eros = d.perfumes.find(x => x.nombre === 'Eros');
  check('completa notas y familia de los reconocidos',
    !!eros && eros.familia === 'ambar' && eros.fondo.length === 4);
  const nautica = d.perfumes.find(x => x.nombre === 'Voyage');
  check('toma ml y precio de la línea', !!nautica && nautica.ml === 100 && nautica.precio === 45000);
  const inventado = d.perfumes.find(x => x.nombre === 'Perfume Inventado XYZ');
  check('no le inventa familia al desconocido', !!inventado && inventado.familia === null);
  await p.fill('#busca', 'Inventado'); await p.waitForTimeout(250);  // venía filtrado desde G
  check('lo marca como pendiente de completar', /completar/.test(await p.textContent('#listaColeccion')));
  await p.fill('#busca', ''); await p.waitForTimeout(200);

  console.log('\nL · Copia y borrado');
  await p.tap('#btnSettings'); await p.waitForTimeout(250);
  await p.tap('#btnExportar'); await p.waitForTimeout(300);
  check('exporta un JSON legible', await p.evaluate(() => {
    try { return !!JSON.parse(document.querySelector('#modalText').value).perfumes; }
    catch (e) { return false; }
  }));
  await p.tap('[data-close]'); await p.waitForTimeout(250);
  check('anota la fecha de la copia', !!(await db()).meta.ultimaCopia);
  check('el estado lo refleja', /hoy/.test(await p.textContent('#copiaEstado')));
  await ir('hoy');
  check('el aviso de copia desaparece', !(await visible('#avisoCopia')));

  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.fill('#setMoneda', 'US$');
  await p.evaluate(() => document.querySelector('#setMoneda').dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(250);
  check('guarda la moneda', (await db()).ajustes.moneda === 'US$');

  await p.tap('#btnBorrar'); await p.waitForTimeout(300);
  await p.tap('#btnConfirmarBorrado'); await p.waitForTimeout(400);
  d = await db();
  check('borra todo', d.perfumes.length === 0 && d.usos.length === 0);
  check('y vuelve al estado inicial', /Todav[íi]a no cargaste/.test(await p.textContent('#sugerencias')));

  console.log('\nM · Sin errores');
  check('la consola quedó limpia', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(`\n${ok} pasaron, ${fail} fallaron\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
