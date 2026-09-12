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
  p.on('console', m => {
    // net::ERR_FAILED es el corte de red que simula la prueba del clima, no un bug
    if (m.type() === 'error' && !/net::ERR_FAILED/.test(m.text())) errs.push(m.text());
  });

  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(300);

  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('perfumario_v1') || 'null'));
  const ir = async v => { await p.tap(`.tab[data-view="${v}"]`); await p.waitForTimeout(200); };
  const visible = async s => p.evaluate(x => { const e = document.querySelector(x); return !!e && !e.hidden; }, s);
  // razones de la tarjeta de un perfume concreto: '' si no entró en el podio
  const razonesDe = async nombre => p.evaluate(n => {
    const card = Array.from(document.querySelectorAll('#sugerencias .pf'))
      .find(e => e.querySelector('.pf-name').textContent.includes(n));
    return card ? card.querySelector('.razones').textContent.replace(/\s+/g, ' ').trim() : '';
  }, nombre);
  const termometro = async grados => {
    await p.evaluate(g => {
      const s = document.querySelector('#ctxTemp');
      s.value = g;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, grados);
    await p.waitForTimeout(400);
  };
  const cuantos = async s => p.evaluate(x => document.querySelectorAll(x).length, s);

  console.log('\nA · La colección viene en el build');
  /* Cuántos trae la semilla lo dice la semilla, no un número escrito acá: si
     se agrega o se saca un perfume, la prueba sigue midiendo lo que importa
     (que entre completa) en vez de romperse por el conteo. */
  const enElBuild = await p.evaluate(() =>
    ((window.PERFUMARIO_COLECCION || { perfumes: [] }).perfumes || []).length);
  check('la carga sola en el primer arranque',
    enElBuild > 0 && (await db()).perfumes.length === enElBuild,
    `${(await db()).perfumes.length} guardados vs ${enElBuild} en el build`);
  check('y sugiere sin que cargues nada', await cuantos('#sugerencias article.card') === 3);
  check('no le inventa usos', (await db()).usos.length === 0);

  // candado: una nota que aparece en una ficha y no está en el diccionario es
  // una nota que no se puede tocar para leer qué es
  const notasHuerfanas = await p.evaluate(() => {
    const { NOTAS, CATALOGO } = window.PERFUMARIO_DATOS;
    const dic = new Set(NOTAS.map(n => n.n.toLowerCase()));
    const propias = (window.PERFUMARIO_COLECCION || { perfumes: [] }).perfumes;
    const faltan = new Set();
    CATALOGO.concat(propias).forEach(p => []
      .concat(p.salida || [], p.corazon || [], p.fondo || [])
      .forEach(n => { if (!dic.has(n.toLowerCase())) faltan.add(n); }));
    return Array.from(faltan);
  });
  check('toda nota usada está explicada en el diccionario', notasHuerfanas.length === 0,
    notasHuerfanas.join(', '));

  // candado: el ícono de "Agregar a pantalla de inicio" no puede ser un cuadrado
  // liso. Ya pasó una vez: el generador recortaba el SVG en vez de escalarlo
  // se pasa como data: URL porque un PNG traído por file:// ensucia el canvas
  // y el navegador prohíbe leerle los píxeles
  const iconoB64 = require('fs').readFileSync(
    path.resolve(__dirname, '..', 'assets', 'icon-180.png')).toString('base64');
  const dibujo = await p.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const fondo = [d[0], d[1], d[2]];
    let distintos = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - fondo[0]) + Math.abs(d[i+1] - fondo[1]) + Math.abs(d[i+2] - fondo[2]) > 30) distintos++;
    }
    return { lado: c.width, porcentaje: Math.round((distintos / (d.length / 4)) * 100) };
  }, iconoB64);
  check('el ícono tiene algo dibujado, no es un cuadrado liso',
    dibujo.lado === 180 && dibujo.porcentaje >= 5, JSON.stringify(dibujo));

  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#btnBorrar'); await p.waitForTimeout(300);
  await p.tap('#btnConfirmarBorrado'); await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(400);
  check('si la borrás, no resucita al recargar', (await db()).perfumes.length === 0);

  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#btnMiColeccion'); await p.waitForTimeout(400);
  check('se puede volver a cargar a pedido', (await db()).perfumes.length === enElBuild);
  await p.tap('#btnMiColeccion'); await p.waitForTimeout(350);
  check('y no la duplica', (await db()).perfumes.length === enElBuild);

  await p.tap('#btnBorrar'); await p.waitForTimeout(300);
  await p.tap('#btnConfirmarBorrado'); await p.waitForTimeout(400);  // el resto corre en vacío

  console.log('\nB · Primer arranque');
  check('abre en Hoy', await visible('#view-hoy') && (await p.getAttribute('#view-hoy', 'class')).includes('active'));
  check('avisa que la colección está vacía', /Todav[íi]a no cargaste/.test(await p.textContent('#sugerencias')));
  check('sin datos no molesta con la copia', !(await visible('#avisoCopia')));
  check('el subtítulo lo dice', /vac[íi]a/i.test(await p.textContent('#topbarSub')));

  console.log('\nC · Datos de ejemplo');
  await p.tap('#btnSettings'); await p.waitForTimeout(200);
  await p.tap('#btnEjemplos'); await p.waitForTimeout(400);
  let d = await db();
  check('carga 6 perfumes', d.perfumes.length === 6, String(d.perfumes.length));
  check('carga usos hacia atrás', d.usos.length > 10, String(d.usos.length));
  check('no los duplica si se toca dos veces', await (async () => {
    await p.tap('#btnEjemplos'); await p.waitForTimeout(300);
    return (await db()).perfumes.length === 6;
  })());

  console.log('\nD · Sugerencias');
  await ir('hoy');
  check('sugiere tres', await cuantos('#sugerencias article.card') === 3);
  check('muestra un puntaje', /^\d+$/.test((await p.textContent('#sugerencias .pf-score')).trim()));
  check('y dice que es un puntaje',
    (await p.textContent('#sugerencias .pf-score-cap')).trim() === 'puntaje');
  check('explica por qué', await cuantos('#sugerencias .razones li') >= 3);
  check('dice en qué estación estamos', /(verano|otoño|invierno|primavera)/.test(await p.textContent('#contextoResumen')));
  check('ahora avisa de la copia', await visible('#avisoCopia'));

  // fijar el momento: si no, la prueba depende de la hora a la que se corra
  await p.tap('#ctxMomento .chip[data-val="dia"]'); await p.waitForTimeout(250);
  const ranking = () => p.evaluate(() => Array.from(document.querySelectorAll('#sugerencias .pf'))
    .map(e => e.querySelector('.pf-name').textContent.replace('★', '').trim() + ':' +
              e.querySelector('.pf-score').textContent.trim()).join(' | '));
  const casual = await ranking();
  await p.tap('#ctxOcasion .chip[data-val="deporte"]'); await p.waitForTimeout(300);
  check('la ocasión cambia el contexto', /Deporte/.test(await p.textContent('#contextoResumen')));
  const deporte = await ranking();
  check('y cambia lo que sugiere', deporte !== casual, `${casual} → ${deporte}`);

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

  console.log('\nE · Registrar un uso');
  await p.tap('#ctxOcasion .chip[data-val="salida"]'); await p.waitForTimeout(250);
  await p.tap('#ctxMomento .chip[data-val="noche"]'); await p.waitForTimeout(250);
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

  console.log('\nF · Colección');
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

  console.log('\nG · Alta desde el catálogo');
  await p.tap('#btnNuevo'); await p.waitForTimeout(300);
  await p.fill('#fCatalogo', 'Dior · Sauvage');
  await p.evaluate(() => document.querySelector('#fCatalogo').dispatchEvent(new Event('change', { bubbles: true })));
  await p.waitForTimeout(250);
  check('completa el nombre', (await p.inputValue('#fNombre')) === 'Sauvage');
  check('completa las notas', (await p.inputValue('#fFondo')).includes('Ambroxan'));
  check('marca las estaciones', await cuantos('#gEstaciones .chip.on') === 3);

  // pegar la pirámide tal como se lee en cualquier ficha
  await p.tap('#btnPegarPiramide'); await p.waitForTimeout(250);
  await p.fill('#textoPiramide',
    'Notas de Salida: bergamota, PIMIENTA ROSA\nCorazón: lavanda y geranio\nBase: ambroxan, cedro, labdanum');
  await p.tap('#btnAplicarPiramide'); await p.waitForTimeout(350);
  check('reparte la pirámide pegada en los tres campos',
    (await p.inputValue('#fSalida')) === 'Bergamota, Pimienta rosa' &&
    (await p.inputValue('#fCorazon')) === 'Lavanda, Geranio' &&
    (await p.inputValue('#fFondo')) === 'Ambroxan, Cedro, Labdanum',
    [await p.inputValue('#fSalida'), await p.inputValue('#fCorazon'), await p.inputValue('#fFondo')].join(' / '));
  check('y normaliza los nombres contra el diccionario',
    (await p.inputValue('#fSalida')).includes('Pimienta rosa'));

  // en inglés y sin encabezados
  await p.tap('#btnPegarPiramide'); await p.waitForTimeout(200);
  await p.fill('#textoPiramide', 'Top Notes: lemon\nMiddle Notes: jasmine\nBase Notes: vetiver');
  await p.tap('#btnAplicarPiramide'); await p.waitForTimeout(300);
  check('entiende también top / middle / base',
    (await p.inputValue('#fCorazon')) === 'Jasmine' && (await p.inputValue('#fFondo')) === 'Vetiver',
    [await p.inputValue('#fCorazon'), await p.inputValue('#fFondo')].join(' / '));

  await p.tap('#btnPegarPiramide'); await p.waitForTimeout(200);
  await p.fill('#textoPiramide', 'vainilla, haba tonka, sándalo');
  await p.tap('#btnAplicarPiramide'); await p.waitForTimeout(300);
  check('sin encabezados manda todo al corazón',
    (await p.inputValue('#fCorazon')) === 'Vainilla, Haba tonka, Sándalo',
    await p.inputValue('#fCorazon'));

  // dejar la ficha como la esperaba el resto de la sección
  await p.fill('#fSalida', 'Bergamota, Pimienta rosa');
  await p.fill('#fCorazon', 'Pimienta negra, Lavanda, Geranio');
  await p.fill('#fFondo', 'Ambroxan, Cedro, Labdanum');
  await p.fill('#fMl', '100'); await p.fill('#fMlRest', '100'); await p.fill('#fPrecio', '120000');
  await p.tap('#gEstaciones .chip[data-val="verano"]'); await p.waitForTimeout(120);
  check('los chips se pueden tocar', await cuantos('#gEstaciones .chip.on') === 4);
  await p.tap('#formPf button[type=submit]'); await p.waitForTimeout(400);
  d = await db();
  check('lo agrega a la colección', d.perfumes.length === 7 && !!d.perfumes.find(x => x.nombre === 'Sauvage'));
  check('guarda las notas cargadas', d.perfumes.find(x => x.nombre === 'Sauvage').fondo.length === 3);

  console.log('\nH · Ficha del perfume');
  await p.fill('#busca', 'Terre'); await p.waitForTimeout(250);
  await p.tap('#listaColeccion .pf'); await p.waitForTimeout(300);
  check('abre la ficha', (await p.textContent('#modalTitulo')).includes('Terre'));
  check('muestra la pirámide olfativa', await cuantos('#modalBody .piramide .nivel') === 3);
  check('muestra el costo por uso', /por uso/.test(await p.textContent('#modalBody')));
  await p.tap('#modalBody [data-rellenar]'); await p.waitForTimeout(350);
  d = await db();
  const terre = d.perfumes.find(x => x.nombre.includes('Terre'));
  check('rellenar deja el frasco lleno', terre.mlRestante === terre.ml, `${terre.mlRestante}/${terre.ml}`);

  console.log('\nI · Notas');
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

  console.log('\nJ · Uso');
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

  console.log('\nK · Aprende de las elecciones');
  await ir('hoy');
  await p.tap('#ctxOcasion .chip[data-val="evento"]'); await p.waitForTimeout(250);
  await p.tap('#ctxMomento .chip[data-val="noche"]'); await p.waitForTimeout(250);
  await termometro(21);   // la temperatura de esos usos, para comparar peras con peras
  const razonesBaccarat = await razonesDe('Baccarat');
  check('usa el historial para esa ocasión', /elección habitual para evento/.test(razonesBaccarat),
    razonesBaccarat.slice(0, 90) || 'no entró al podio');
  check('reconoce la familia que elegís para esa ocasión', /solés elegir/.test(razonesBaccarat));
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

  console.log('\nL · Carga rápida');
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

  console.log('\nM · Clima automático');
  // la API se simula: la prueba no puede depender de que haya red ni del tiempo real
  let climaFalla = false;
  const respuesta = cuerpo => ({ status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(cuerpo) });
  let llamadasGeo = 0, climaCodigo = 3, climaViento = 8, climaHumedad = 80, viajeFalla = false;
  await p.route('**/geocoding-api.open-meteo.com/**', r => {
    llamadasGeo++;
    return r.fulfill(respuesta({
      results: [{ name: 'Trenque Lauquen', latitude: -35.97, longitude: -62.73,
                  country: 'Argentina', admin1: 'Provincia de Buenos Aires' }] }));
  });
  await p.route('**/api.open-meteo.com/v1/forecast**', r => {
    if (climaFalla) return r.abort();
    // el pedido del viaje trae daily y un rango de fechas; el de hoy, current
    if (/daily=/.test(r.request().url())) {
      if (viajeFalla) return r.abort();
      const u = new URL(r.request().url());
      const desde = u.searchParams.get('start_date'), hasta = u.searchParams.get('end_date');
      const dias = [];
      for (let f = new Date(desde + 'T00:00:00'); f <= new Date(hasta + 'T00:00:00'); f.setDate(f.getDate() + 1))
        dias.push(f.toISOString().slice(0, 10));
      return r.fulfill(respuesta({ daily: {
        time: dias,
        temperature_2m_max: dias.map((_, i) => 8 + (i % 3)),
        temperature_2m_min: dias.map(() => -1),
        apparent_temperature_max: dias.map((_, i) => 5 + (i % 3)),
        apparent_temperature_min: dias.map(() => -5),
        relative_humidity_2m_mean: dias.map(() => 78),
        wind_speed_10m_max: dias.map(() => 32),
        precipitation_sum: dias.map((_, i) => (i === 1 ? 6 : 0)),
        weather_code: dias.map((_, i) => (i === 1 ? 63 : 1))
      } }));
    }
    return r.fulfill(respuesta({ current: { temperature_2m: 11.3, apparent_temperature: 8.2,
      relative_humidity_2m: climaHumedad, weather_code: climaCodigo, wind_speed_10m: climaViento } }));
  });

  await p.tap('#btnSettings'); await p.waitForTimeout(250);
  check('arranca sin ubicación', /Sin ubicación/.test(await p.textContent('#lugarActual')));

  // el permiso denegado se explica, y sin globito encima
  await p.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_ok, err) => err && err({ code: 1 });
    document.querySelector('#toast').hidden = true;   // puede quedar uno de antes
  });
  await p.tap('#btnUbicacion'); await p.waitForTimeout(400);
  const avisoUb = await p.textContent('#avisoUbicacion');
  check('explica el permiso denegado y ofrece salida',
    /no entregó la ubicación/.test(avisoUb) && /elegí tu ciudad/i.test(avisoUb), avisoUb.slice(0, 80));
  check('y no lo repite en un globito', await p.evaluate(() => document.querySelector('#toast').hidden));

  // con permiso, la ubicación del dispositivo tiene que tener nombre
  await p.evaluate(() => {
    navigator.geolocation.getCurrentPosition = ok =>
      ok({ coords: { latitude: -38.0055, longitude: -57.5426 } });   // Mar del Plata
  });
  await p.tap('#btnUbicacion'); await p.waitForTimeout(900);
  const lugarGeo = (await db()).meta.lugar;
  check('le pone nombre a la ubicación del GPS, no "Mi ubicación"',
    !!lugarGeo && lugarGeo.nombre === 'Mar del Plata', JSON.stringify(lugarGeo));
  check('y muestra las coordenadas guardadas',
    /-38\.0\d+, -57\.5\d+/.test(await p.textContent('#lugarActual')), await p.textContent('#lugarActual'));

  // en el medio del campo no inventa una ciudad
  await p.evaluate(() => {
    navigator.geolocation.getCurrentPosition = ok =>
      ok({ coords: { latitude: -47.5, longitude: -70.5 } });          // Santa Cruz profunda
  });
  await p.tap('#btnUbicacion'); await p.waitForTimeout(900);
  check('lejos de toda ciudad, muestra coordenadas',
    /^-47\.50, -70\.50$/.test((await db()).meta.lugar.nombre), (await db()).meta.lugar.nombre);
  await p.fill('#buscaCiudad', 'Rosario'); await p.waitForTimeout(900);
  check('encuentra la ciudad', await cuantos('#ciudadResultados [data-lat]') === 1);
  check('sin consultar la API: la lista viaja en la app', llamadasGeo === 0, String(llamadasGeo));

  await p.fill('#buscaCiudad', 'Trenque Lauquen'); await p.waitForTimeout(900);
  check('para una que no está incluida, recién ahí consulta', llamadasGeo === 1, String(llamadasGeo));
  check('y la ofrece', /Trenque Lauquen/.test(await p.textContent('#ciudadResultados')));

  await p.fill('#buscaCiudad', 'Rosario'); await p.waitForTimeout(900);
  await p.tap('#ciudadResultados [data-lat]'); await p.waitForTimeout(600);
  d = await db();
  check('guarda la ubicación elegida', !!d.meta.lugar && /Rosario/.test(d.meta.lugar.nombre));
  check('prende el clima solo', d.ajustes.clima === true);
  check('trae la temperatura', !!d.meta.clima && Math.round(d.meta.clima.temp) === 11,
    JSON.stringify(d.meta.clima));
  check('y también la sensación térmica', Math.round(d.meta.clima.sensacion) === 8,
    String(d.meta.clima.sensacion));

  await ir('hoy');
  const linea = await p.textContent('#climaLinea');
  check('la muestra en Hoy', /Nublado en Rosario/.test(linea), linea.replace(/\s+/g, ' ').slice(0, 70));
  check('decide por la sensación, no por la temperatura al sol',
    (await p.textContent('#ctxTempOut')) === '8°', await p.textContent('#ctxTempOut'));
  check('muestra la real al lado', /Real 11°/.test(linea), linea.replace(/\s+/g, ' ').slice(0, 80));
  check('y avisa por la humedad alta', /Humedad alta/.test(linea));
  check('la humedad entra en las razones',
    /humedad va a proyectar de más|humedad lo va a levantar/.test(await p.textContent('#sugerencias')),
    (await p.textContent('#sugerencias')).replace(/\s+/g, ' ').slice(0, 90));

  await p.evaluate(() => {
    const s = document.querySelector('#ctxTemp');
    s.value = 31;
    s.dispatchEvent(new Event('input', { bubbles: true }));
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.waitForTimeout(350);
  check('lo que ponés a mano le gana a la API', (await p.textContent('#ctxTempOut')) === '31°');
  check('y lo dice', /a mano/.test(await p.textContent('#climaLinea')));
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(600);
  check('actualizar vuelve al dato real', (await p.textContent('#ctxTempOut')) === '8°');

  // aire seco: cambia a quién conviene
  climaHumedad = 22;
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(700);
  check('con aire seco lo dice', /Aire seco/.test(await p.textContent('#climaLinea')));
  check('y lo usa para elegir',
    /aire seco/i.test(await p.textContent('#sugerencias')),
    (await p.textContent('#sugerencias')).replace(/\s+/g, ' ').slice(0, 90));
  climaHumedad = 80;
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(600);

  // llueve y sopla: el dato ya estaba y no se usaba
  climaCodigo = 63; climaViento = 30;
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(700);
  const conLluvia = await p.textContent('#climaLinea');
  check('avisa que llueve', /Llueve: los frescos livianos/.test(conLluvia), conLluvia.replace(/\s+/g,' ').slice(0,70));
  check('y que hay viento', /viento 30 km\/h/i.test(conLluvia) && /Viento fuerte/.test(conLluvia),
    conLluvia.replace(/\s+/g, ' ').slice(0, 110));
  check('el viento entra en las razones de las sugerencias',
    /viento de 30 km\/h/i.test(await p.textContent('#sugerencias')),
    (await p.textContent('#sugerencias')).replace(/\s+/g, ' ').slice(0, 90));
  check('la lluvia entra en las razones de las sugerencias',
    /Llueve y este aguanta|se va enseguida/.test(await p.textContent('#sugerencias')),
    (await p.textContent('#sugerencias')).replace(/\s+/g, ' ').slice(0, 90));
  climaCodigo = 3; climaViento = 8;
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(600);

  climaFalla = true;
  await p.tap('#btnRefrescarClima'); await p.waitForTimeout(700);
  check('si la API falla, lo dice sin romperse', /No pude traer el clima/.test(await p.textContent('#climaLinea')));
  check('y las sugerencias siguen ahí', await cuantos('#sugerencias article.card') === 3);
  climaFalla = false;

  console.log('\nM2 · Valija para un viaje');
  await ir('hoy');
  await p.tap('#btnViaje'); await p.waitForTimeout(400);
  check('abre el formulario de viaje', !!(await p.$('#formViaje')));

  await p.tap('#formViaje button[type=submit]'); await p.waitForTimeout(300);
  check('sin destino no arma nada', /Elegí un destino/.test(await p.textContent('#vSalida')));

  await p.fill('#vDestino', 'Bariloche'); await p.waitForTimeout(900);
  check('encuentra el destino', await cuantos('#vResultados [data-lat]') >= 1);
  await p.tap('#vResultados [data-lat]'); await p.waitForTimeout(300);
  check('lo deja elegido', /Destino: San Carlos de Bariloche/.test(await p.textContent('#vElegido')));

  const d1 = new Date(); d1.setDate(d1.getDate() + 3);
  const d2 = new Date(); d2.setDate(d2.getDate() + 7);
  const iso = d => d.toISOString().slice(0, 10);
  await p.fill('#vDesde', iso(d1)); await p.fill('#vHasta', iso(d2));
  await p.selectOption('#vCuantos', '2');
  await p.tap('#formViaje button[type=submit]'); await p.waitForTimeout(1200);

  const resumen = await p.textContent('.viaje-resumen');
  check('resume el viaje con el pronóstico real', /5 días/.test(resumen) && /-1°/.test(resumen), resumen.replace(/\s+/g,' ').slice(0,110));
  check('cuenta los días de lluvia', /lluvia 1 día/.test(resumen), resumen.replace(/\s+/g,' ').slice(0,110));
  check('dice en qué estación está el destino', /invierno|primavera|verano|otoño/.test(resumen));
  check('el viaje también decide por la sensación térmica',
    /Decido por la sensación térmica/.test(resumen) && /humedad 78 %/.test(resumen),
    resumen.replace(/\s+/g, ' ').slice(0, 130));
  check('elige dos perfumes', await cuantos('.valija .pf') === 2);
  check('dice cuántos días cubre cada uno o que va de compañía',
    /de 5 días|de compañía/.test(await p.textContent('.valija')));
  check('estima los ml que vas a gastar', /~\d+(\.\d+)? ml/.test(await p.textContent('.valija')));
  const elegidosViaje = await p.evaluate(() => Array.from(document.querySelectorAll('.valija .pf-name')).map(e => e.textContent.trim()));
  check('y no repite el mismo dos veces', elegidosViaje[0] !== elegidosViaje[1], elegidosViaje.join(' | '));

  // sin pronóstico disponible, se pide la temperatura y se calcula igual
  viajeFalla = true;
  await p.tap('#formViaje button[type=submit]'); await p.waitForTimeout(1000);
  check('sin pronóstico ofrece poner la temperatura', !!(await p.$('#vTemp')));
  await p.tap('#vCalcular'); await p.waitForTimeout(700);
  check('y arma la valija igual', await cuantos('.valija .pf') === 2);
  check('avisando que es una estimación tuya', /pusiste vos/.test(await p.textContent('.viaje-resumen')));
  viajeFalla = false;
  await p.tap('.sheet-head [data-close]'); await p.waitForTimeout(300);   // el fondo queda tapado por la hoja

  console.log('\nN · Corregir un uso');
  await ir('uso');
  const usoPrevio = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const u = d.usos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const p = d.perfumes.find(x => x.id === u.perfumeId);
    return { id: u.id, sprays: u.sprays, ocasion: u.ocasion, perfume: p.nombre, ml: p.mlRestante };
  });
  await p.tap('#historialUsos .item'); await p.waitForTimeout(400);
  check('el uso se abre para editar', /Editar uso/.test(await p.textContent('#modalTitulo')));
  check('viene con lo que habías puesto', (await p.inputValue('#uSprays')) === String(usoPrevio.sprays));
  check('deja cambiar de perfume', !!(await p.$('#uPerfume')));
  await p.fill('#uSprays', String(usoPrevio.sprays + 2));
  await p.tap('#uOcasion .chip[data-val="evento"]');
  await p.tap('#formUso button[type=submit]'); await p.waitForTimeout(500);
  const usoNuevo = await p.evaluate(id => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const u = d.usos.find(x => x.id === id);
    const p = d.perfumes.find(x => x.id === u.perfumeId);
    return { sprays: u.sprays, ocasion: u.ocasion, ml: p.mlRestante, usos: d.usos.length };
  }, usoPrevio.id);
  check('guarda los cambios sin duplicar', usoNuevo.sprays === usoPrevio.sprays + 2 && usoNuevo.ocasion === 'evento');
  check('y corrige los ml del frasco', Math.abs((usoPrevio.ml - usoNuevo.ml) - 0.2) < 0.001,
    `${usoPrevio.ml} → ${usoNuevo.ml}`);

  console.log('\nO · Aprende de la temperatura');
  // historial a medida: un gourmand usado siempre con frío, un cítrico con calor
  const protagonistas = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const gour = d.perfumes.find(x => x.familia === 'gourmand');
    const cit = d.perfumes.find(x => x.familia === 'citrica');
    const iso = n => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    // colección chica a propósito: así el podio no depende de lo que se acumuló
    // en las secciones anteriores y la prueba mide lo que dice medir
    d.perfumes = [gour, cit, d.perfumes.find(x => x.familia === 'amaderada')].filter(Boolean);
    d.usos = [];
    for (let i = 0; i < 4; i++) {
      d.usos.push({ id: 'g' + i, fecha: iso(i * 4 + 1), perfumeId: gour.id, sprays: 3,
                    ocasion: 'salida', momento: 'noche', temp: 9, nota: '' });
      d.usos.push({ id: 'c' + i, fecha: iso(i * 4 + 2), perfumeId: cit.id, sprays: 3,
                    ocasion: 'casual', momento: 'dia', temp: 28, nota: '' });
    }
    d.ajustes.clima = false;
    localStorage.setItem('perfumario_v1', JSON.stringify(d));
    return { gour: gour.nombre, cit: cit.nombre };
  });
  await p.reload(); await p.waitForTimeout(500);
  await p.tap('#ctxOcasion .chip[data-val="casual"]'); await p.waitForTimeout(250);
  await termometro(9);
  const conFrio = await razonesDe(protagonistas.gour);
  check('con frío reconoce que es su temperatura',
    /Es la temperatura a la que solés usarlo/.test(conFrio), conFrio.slice(0, 90) || 'no entró al podio');
  check('y lo explica en la tarjeta', /lo usás con 9°/.test(await p.textContent('#aprendizajeReglas')),
    (await p.textContent('#aprendizajeReglas')).replace(/\s+/g, ' ').slice(0, 120));

  await termometro(30);
  const conCalor = await razonesDe(protagonistas.gour);
  check('con 30° avisa que no es la temperatura en que lo usás',
    conCalor === '' || /Lo usás con 9° y hoy hay 30°/.test(conCalor), conCalor.slice(0, 90));
  const conCalorCitrico = await razonesDe(protagonistas.cit);
  check('y el cítrico que usás con calor sí entra', conCalorCitrico !== '');

  console.log('\nO2 · El termómetro le gana al almanaque');
  // dos perfumes iguales salvo familia y estación: uno marcado para HOY,
  // el otro para otra estación. La prueba se arma sola cualquier día del año.
  const duelo = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const sur = ['verano','verano','otono','otono','otono','invierno',
                 'invierno','invierno','primavera','primavera','primavera','verano'];
    const est = sur[new Date().getMonth()];
    const nombre = { otono: 'otoño' };
    const otra = { verano: 'invierno', invierno: 'verano', otono: 'primavera', primavera: 'otoño' }[est];
    const base = { ml: 100, mlRestante: 100, precio: 0, comprado: null, longevidad: 8, estela: 3,
                   ocasiones: ['salida'], momento: 'ambos', rating: 0, nota: '',
                   salida: [], corazon: [], fondo: [], creado: d.perfumes[0].creado };
    d.perfumes = [
      Object.assign({ id: 'frio', nombre: 'Abrigado', casa: 'Test', conc: 'EDP',
                      familia: 'ambar', estaciones: [otra] }, base),
      Object.assign({ id: 'fresco', nombre: 'Liviano', casa: 'Test', conc: 'EDT',
                      familia: 'citrica', estaciones: [nombre[est] || est] }, base)
    ];
    d.usos = []; d.ajustes.clima = false;
    localStorage.setItem('perfumario_v1', JSON.stringify(d));
    const tipica = { verano: 28, otono: 18, invierno: 11, primavera: 21 }[est];
    return { est, tipica };
  });
  await p.reload(); await p.waitForTimeout(500);
  await p.tap('#ctxOcasion .chip[data-val="salida"]'); await p.waitForTimeout(250);

  await termometro(duelo.tipica);
  check('con la temperatura normal de la estación, manda el almanaque',
    (await p.textContent('#sugerencias .pf-name')).includes('Liviano'),
    await p.textContent('#sugerencias .pf-name'));

  await termometro(Math.max(-5, duelo.tipica - 16));
  check('con 16 grados menos, manda el termómetro',
    (await p.textContent('#sugerencias .pf-name')).includes('Abrigado'),
    await p.textContent('#sugerencias .pf-name'));
  check('y el contexto avisa que la temperatura no es la de la estación',
    /mando por la temperatura/.test(await p.textContent('#contextoResumen')),
    await p.textContent('#contextoResumen'));

  console.log('\nO3 · Empates y datos faltantes');
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    const clon = (id, nombre) => Object.assign({}, d.perfumes[0], { id, nombre });
    d.perfumes = [clon('a', 'Gemelo uno'), clon('b', 'Gemelo dos')];
    localStorage.setItem('perfumario_v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForTimeout(500);
  check('avisa cuando empatan y son indistinguibles', await visible('#avisoEmpate'));
  const textoEmpate = await p.textContent('#avisoEmpate');
  check('y dice qué dato falta para diferenciarlos',
    /notas cargadas|sin puntuar/.test(textoEmpate), textoEmpate.replace(/\s+/g, ' ').slice(0, 90));

  // sin puntuar no puede ser lo mismo que puntuar bajo
  const sinYcon = await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    d.perfumes[1].rating = 3;   // puntaje neutro
    localStorage.setItem('perfumario_v1', JSON.stringify(d));
    return true;
  });
  await p.reload(); await p.waitForTimeout(500);
  const puntajes = await p.evaluate(() => Array.from(document.querySelectorAll('#sugerencias .pf-score'))
    .map(e => Number(e.textContent.trim())));
  check('un perfume sin puntuar no arranca castigado', sinYcon && puntajes[0] === puntajes[1],
    puntajes.join(' vs '));

  // esta sección ensució la colección con dos clones: se deja una con
  // variedad, porque las secciones que siguen comparan perfumes distintos
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('perfumario_v1'));
    d.perfumes = [
      Object.assign({}, d.perfumes[0], { id: 'x1', nombre: 'Abrigado', familia: 'ambar',
        estaciones: ['invierno'], longevidad: 9, estela: 4, rating: 4, precio: 100000,
        salida: ['Cardamomo'], corazon: ['Cuero'], fondo: ['Vainilla'] }),
      Object.assign({}, d.perfumes[0], { id: 'x2', nombre: 'Liviano', familia: 'citrica',
        estaciones: ['verano'], longevidad: 4, estela: 2, rating: 2, precio: 40000,
        salida: ['Limón'], corazon: ['Neroli'], fondo: ['Almizcle blanco'] })
    ];
    localStorage.setItem('perfumario_v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForTimeout(500);

  console.log('\nP · Descargar la copia');
  await p.tap('#btnSettings'); await p.waitForTimeout(250);
  await p.tap('#btnExportar'); await p.waitForTimeout(350);
  check('ofrece bajar el archivo', !!(await p.$('#btnDescargar')));
  const descarga = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.tap('#btnDescargar');
  const archivo = await descarga;
  check('baja un .json con la fecha', !!archivo && /^perfumario-\d{4}-\d{2}-\d{2}\.json$/.test(archivo.suggestedFilename()),
    archivo ? archivo.suggestedFilename() : 'no bajó nada');
  await p.tap('[data-close]'); await p.waitForTimeout(250);
  await ir('hoy');   // el engranaje alterna: si quedamos en Ajustes, la sección que sigue lo cierra

  console.log('\nQ · Comparar dos');
  await ir('notas');
  const nombresCmp = await p.evaluate(() => ({
    a: document.querySelector('#cmpA').selectedOptions[0].textContent,
    b: document.querySelector('#cmpB').selectedOptions[0].textContent
  }));
  check('arranca con dos distintos', nombresCmp.a !== nombresCmp.b, JSON.stringify(nombresCmp));
  check('enfrenta las dos fichas', await cuantos('#cmpSalida .cmp-fila') >= 12);
  check('marca quién gana en cada dato', await cuantos('#cmpSalida .gana') > 0);
  check('separa las notas compartidas de las propias',
    /Comparten \d+ de \d+ notas/.test(await p.textContent('#cmpSalida')));
  const veredicto = await p.textContent('#cmpSalida .cmp-veredicto');
  check('cierra con un veredicto para el contexto de hoy',
    new RegExp(`${nombresCmp.a}|${nombresCmp.b}|Empatan`).test(veredicto), veredicto.replace(/\s+/g, ' ').slice(0, 80));

  // el mismo dos veces no compara nada
  await p.selectOption('#cmpB', { label: nombresCmp.a }); await p.waitForTimeout(300);
  check('avisa si elegís el mismo dos veces', /Elegí dos distintos/.test(await p.textContent('#cmpSalida')));

  // y el contexto de Hoy manda sobre el veredicto
  await p.selectOption('#cmpA', { index: 0 });
  await p.selectOption('#cmpB', { index: 1 }); await p.waitForTimeout(300);
  const antes = await p.textContent('#cmpSalida .cmp-veredicto');
  await ir('hoy');
  await p.tap('#ctxOcasion .chip[data-val="deporte"]'); await p.waitForTimeout(250);
  await ir('notas');
  const despues = await p.textContent('#cmpSalida .cmp-veredicto');
  check('el veredicto sigue el contexto', antes !== despues && /deporte/.test(despues),
    despues.replace(/\s+/g, ' ').slice(0, 70));

  // entrada desde la ficha, contra el más parecido
  await ir('coleccion');
  await p.fill('#busca', ''); await p.waitForTimeout(200);
  await p.tap('#listaColeccion .pf'); await p.waitForTimeout(350);
  const elegidoCmp = (await p.textContent('#modalTitulo')).trim();
  await p.tap('#modalBody [data-comparar]'); await p.waitForTimeout(500);
  check('desde la ficha abre la comparación', await visible('#view-notas'));
  check('y lo pone de un lado',
    (await p.evaluate(() => document.querySelector('#cmpA').selectedOptions[0].textContent)) === elegidoCmp,
    elegidoCmp);

  console.log('\nR · Copia y borrado');
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
  // sin versión a la vista no se puede distinguir "no llegó el cambio" de
  // "el cambio no anda"
  check('muestra qué versión está corriendo',
    /Versión \d{4}-\d{2}-\d{2}/.test(await p.textContent('#versionApp')),
    await p.textContent('#versionApp'));

  await p.tap('#btnBorrar'); await p.waitForTimeout(300);
  await p.tap('#btnConfirmarBorrado'); await p.waitForTimeout(400);
  d = await db();
  check('borra todo', d.perfumes.length === 0 && d.usos.length === 0);
  check('y vuelve al estado inicial', /Todav[íi]a no cargaste/.test(await p.textContent('#sugerencias')));

  console.log('\nS · Sin errores');
  check('la consola quedó limpia', errs.length === 0, errs.slice(0, 3).join(' | '));

  await b.close();
  console.log(`\n${ok} pasaron, ${fail} fallaron\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
