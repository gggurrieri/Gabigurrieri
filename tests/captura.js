/* Cargar un entrenamiento desde una captura de pantalla.
   El OCR lo hace el teléfono («Texto en vivo»); acá se prueba que la app
   entienda el texto que sale de ahí, en los distintos órdenes en que puede
   venir, y que no se coma la altitud ni el reloj de la barra de estado.
   Uso:  node tests/captura.js                                            */
const path = require('path');
const { chromium, devices } = require('playwright');
let ok=0,fail=0;
const check=(n,c,d='')=>{ if(c){ok++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d?' → '+d:''));} };

const A = `14:12
Datos detallados
Distancia 10,59 km
Tiempo total 31:58
Tiempo de entrenamiento 31:58
Ritmo medio 03'01"/km
Mejor ritmo 02'02"/km
Velocidad promedio 19,88 km/h
Velocidad máxima 29,28 km/h
Altitud máx. -63 m
Menor altitud -105 m
Altitud media -75 m
Aumento de elevación 405 m
Pérdida de elevación 402 m
Quemado 332 kcal
Ritmo cardíaco promedio 133 lpm`;

const B = `14:12
Datos detallados
Distancia
10,59 km
Tiempo total
31:58
Tiempo de
entrenamiento
31:58
Ritmo medio
03'01"/km
Velocidad promedio
19,88 km/h
Altitud máx.
-63 m
Aumento de elevación
405 m
Quemado
332 kcal
Ritmo cardíaco
promedio
133 lpm`;

const C = `Ciclismo al aire libre
10,59
km
Distancia
31:58
Duración
332
kcal
Calorías
133
ppm
Frecuencia cardíaca media`;

const D = `Salto de cuerda
Datos detallados
Duración 12:30
Saltos 1.480
Saltos por minuto 118
Quemado 156 kcal
Ritmo cardíaco promedio 142 lpm
Ritmo cardíaco máximo 168 lpm`;

const E = `Outdoor Cycling
Distance 6.2 mi
Duration 45:10
Calories 402 kcal
Avg heart rate 128 bpm`;

/* Lo que copia «Texto en vivo» de la captura real: los datos mezclados con
   los carteles del mapa que quedan de fondo. */
const MAPA = `14:12
Datos detallados
Parque de la Memoria
Distancia 10,59 km
Parque Norte
Tiempo de entrenamiento 31:58
Mirador Costanera Norte
Velocidad promedio 19,88 km/h
Plaza Ernesto Jaimovich
Altitud máx. -63 m
Aumento de elevación 405 m
Estación 3 de Febrero
Quemado 332 kcal
Ritmo cardíaco promedio 133 lpm
Monumento los Españoles
Mapas Aviso legal`;

/* Con la fecha en el encabezado, y el texto pegado sin saltos de línea. */
const FECHA = `Ciclismo al aire libre 12 de septiembre de 2026, 08:30`;
const UNA_LINEA = `Distancia 10,59 km Tiempo de entrenamiento 31:58 Quemado 332 kcal Ritmo cardíaco promedio 133 lpm`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(400);
  await p.tap('.tab[data-view="log"]'); await p.waitForTimeout(250);

  /* Pega un texto y devuelve lo que quedó en la previsualización. */
  const pegar = async txt => {
    await p.tap('#btnPegarCaptura');
    await p.waitForSelector('#modalText', {timeout:5000});
    await p.fill('#modalText', txt);
    await p.click('[data-ok]');
    await p.waitForTimeout(250);
    return {
      nota: (await p.$('.import-note')) ? await p.textContent('.import-note') : '',
      fila: (await p.$('.entry.imported')) ? await p.textContent('.entry.imported') : '',
      toast: (await p.$('#toast')) ? await p.textContent('#toast') : ''
    };
  };
  const limpiar = async () => { const x = await p.$('#btnClearImport'); if (x) { await x.click(); await p.waitForTimeout(150); } };

  console.log('\nA · etiqueta y valor en la misma línea');
  let r = await pegar(A);
  check('lee la distancia', /10\.59 km/.test(r.nota), r.nota);
  check('lee la duración', /32 min/.test(r.nota), r.nota);
  check('lee las calorías del reloj', /332 kcal/.test(r.nota), r.nota);
  check('lee el pulso medio', /133 ppm/.test(r.nota), r.nota);
  check('NO toma el reloj de la barra de estado como duración', !/14'|\b14 /.test(r.nota), r.nota);
  check('NO toma la elevación como distancia', !/405|402|-63|-105/.test(r.nota), r.nota);
  check('NO confunde el ritmo por km con el pulso', !/(^|[^0-9])[23] ppm/.test(r.nota), r.nota);
  check('reconoce que es bici', /🚴/.test(r.fila), r.fila);
  check('avisa que la fecha hay que ponerla', /la captura no trae la fecha/.test(r.fila), r.fila);
  check('ofrece el campo de fecha', !!(await p.$('.imp-date')));
  check('las calorías quedan marcadas como del reloj', /del reloj/.test(r.fila), r.fila);
  await limpiar();

  console.log('\nB · etiqueta partida en dos renglones, valor aparte');
  r = await pegar(B);
  check('lee la distancia igual', /10\.59 km/.test(r.nota), r.nota);
  check('lee la duración igual', /32 min/.test(r.nota), r.nota);
  check('arma el pulso con la etiqueta cortada', /133 ppm/.test(r.nota), r.nota);
  check('sigue ignorando la altitud', !/405|-63/.test(r.nota), r.nota);
  await limpiar();

  console.log('\nC · tarjeta de resumen: número arriba, etiqueta abajo');
  r = await pegar(C);
  check('lee la distancia con la unidad en otra línea', /10\.59 km/.test(r.nota), r.nota);
  check('lee la duración', /32 min/.test(r.nota), r.nota);
  check('lee las calorías', /332 kcal/.test(r.nota), r.nota);
  check('lee el pulso', /133 ppm/.test(r.nota), r.nota);
  await limpiar();

  console.log('\nD · soga, con el conteo de saltos del reloj');
  r = await pegar(D);
  check('lo reconoce como soga', /🪢/.test(r.fila), r.fila);
  check('usa los saltos medidos y no la estimación', /1\.480 saltos/.test(r.nota), r.nota);
  check('NO toma los saltos por minuto como total', !/118 saltos/.test(r.nota), r.nota);
  check('lee el pulso medio', /142 ppm/.test(r.nota), r.nota);
  check('lee el pulso máximo', /máximo 168/.test(r.nota), r.nota);
  await limpiar();

  console.log('\nE · la misma pantalla en inglés y en millas');
  r = await pegar(E);
  check('convierte las millas a km', /9\.98 km/.test(r.nota), r.nota);
  check('lee la duración', /45 min/.test(r.nota), r.nota);
  check('lee las calorías', /402 kcal/.test(r.nota), r.nota);
  check('lee el pulso', /128 ppm/.test(r.nota), r.nota);
  check('lo reconoce como bici', /🚴/.test(r.fila), r.fila);
  await limpiar();

  console.log('\nF · textos que no son un entrenamiento');
  r = await pegar('Buenos Aires\nParque de la Memoria\nMapas · Aviso legal');
  check('avisa que no hay números', /ningún número/.test(r.toast), r.toast);
  check('no agrega ninguna fila', !r.fila, r.fila);
  r = await pegar('Distancia 10,59 km\nQuemado 332 kcal');
  check('sin duración no inventa la sesión', /ninguna duración/.test(r.toast), r.toast);
  check('tampoco agrega fila', !r.fila, r.fila);

  console.log('\nF2 · la captura real, con los carteles del mapa mezclados');
  r = await pegar(MAPA);
  check('encuentra los datos entre el ruido del mapa', /10\.59 km/.test(r.nota) && /332 kcal/.test(r.nota), r.nota);
  check('lee el pulso', /133 ppm/.test(r.nota), r.nota);
  check('NO toma «Estación 3 de Febrero» como fecha', !/fecha 3 feb/i.test(r.nota), r.nota);
  check('la fecha queda en hoy', new RegExp(new Date().getDate() + ' ').test(r.fila), r.fila);
  await limpiar();

  console.log('\nF3 · fecha en el encabezado y pegado sin saltos de línea');
  r = await pegar(UNA_LINEA);
  check('entiende todo en una sola línea', /10\.59 km/.test(r.nota) && /32 min/.test(r.nota), r.nota);
  check('y el pulso también', /133 ppm/.test(r.nota), r.nota);
  await limpiar();
  r = await pegar(FECHA + '\n' + UNA_LINEA);
  check('toma la fecha del encabezado', /fecha.*12 sep/i.test(r.nota), r.nota);
  check('la fila muestra esa fecha', /12 sep/.test(r.fila), r.fila);
  check('y pide confirmarla en vez de avisar que falta', /confirmá la fecha/.test(r.fila), r.fila);
  await limpiar();

  console.log('\nG · guardar la sesión con la fecha corregida');
  r = await pegar(A);
  await p.fill('.imp-date', '2026-09-12');
  await p.tap('#btnAddImported'); await p.waitForTimeout(600);
  const ses = await p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')).sessions);
  check('queda una sola sesión', ses.length === 1, 'n=' + ses.length);
  const s = ses[0] || {};
  check('respeta la fecha que puse a mano', s.date === '2026-09-12', s.date);
  check('guarda los minutos', s.minutes === 32, String(s.minutes));
  check('guarda la distancia', s.distance === 10.59, String(s.distance));
  check('guarda el pulso', s.hrAvg === 133, String(s.hrAvg));
  check('usa las calorías del reloj', s.kcal === 332, String(s.kcal));
  check('deja el origen a la vista', s.source === 'captura', s.source);
  await p.waitForTimeout(200);
  check('el registro dice de dónde salió', /de una captura/.test(await p.textContent('#logList')));

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES: '+[...new Set(errs)].join(' | ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
