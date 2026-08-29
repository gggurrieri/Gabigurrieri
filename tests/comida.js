/* Nutrición: interpretación del texto, totales del día y edición.
   Uso:  node tests/comida.js                                             */
const path = require('path');
const { chromium, devices } = require('playwright');
let ok=0,fail=0;
const check=(n,c,d='')=>{ if(c){ok++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d?' → '+d:''));} };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);
  const ir = async () => { await p.tap('.tab[data-view="comida"]'); await p.waitForTimeout(250); };
  const cargar = async (texto, tipo) => {
    await ir();
    if (tipo) await p.selectOption('#comidaTipo', tipo);
    await p.fill('#comidaTexto', texto);
    await p.tap('#formComida button[type=submit]');
    await p.waitForTimeout(450);
  };
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')).foods);

  console.log('\nA · El ejemplo del usuario');
  await cargar('un pote chico de granola sin azucar y mate', 'desayuno');
  let f = await db();
  check('carga los dos alimentos', f.length===2, `n=${f.length}`);
  check('aplica el tamaño chico', f[0].q===0.7, `q=${f[0].q}`);
  check('calcula calorías', Math.round(f[0].kcal+f[1].kcal)===129, `${Math.round(f[0].kcal+f[1].kcal)}`);
  const tot = await p.textContent('#comidaTotales');
  check('muestra kcal, proteína y grasa', /kcal/.test(tot) && /proteína/.test(tot) && /grasa/.test(tot));
  check('agrupa bajo Desayuno', /Desayuno/.test(await p.textContent('#comidaLista')));

  console.log('\nB · Frase compuesta');
  await cargar('milanesa de pollo con pure y ensalada', 'almuerzo');
  f = await db();
  const nombres = f.map(x=>x.n);
  check('separa los tres platos', nombres.includes('Milanesa de pollo al horno')
        && nombres.includes('Puré de papas') && nombres.includes('Ensalada mixta'), nombres.join(' | '));

  console.log('\nC · Cantidad y plural');
  await cargar('dos medialunas', 'merienda');
  f = await db();
  const med = f.find(x=>x.k==='medialuna');
  check('entiende el plural con cantidad', med && med.q===2, med?`q=${med.q}`:'no encontrada');
  check('duplica las calorías', med && Math.round(med.kcal)===360, med?Math.round(med.kcal):'');

  console.log('\nD · Objetivo del día');
  const resto1 = await p.textContent('#comidaResto');
  check('dice cuánto queda', /te quedan \d+ kcal/.test(resto1), resto1);
  await cargar('asado, papas fritas, dos cervezas y flan', 'cena');
  await cargar('choripan y pizza', 'cena');
  const resto2 = await p.textContent('#comidaResto');
  check('avisa cuando se pasa', /por encima/.test(resto2), resto2);
  const clase = await p.evaluate(()=>document.querySelector('.barra').className);
  check('la barra cambia de color al pasarse', clase.includes('pasado'), clase);

  console.log('\nE · Ajustar y borrar');
  await ir();
  const idPrimero = await p.evaluate(() => document.querySelector('#comidaLista [data-qmas]').dataset.qmas);
  const previo = (await db()).find(x => x.id === idPrimero);
  const antes = (await db()).length;
  await p.tap('#comidaLista [data-qmas]'); await p.waitForTimeout(350);
  let post = (await db()).find(x => x.id === idPrimero);
  check('el botón + sube media porción', Math.abs(post.q - (previo.q + 0.5)) < 0.001,
        `${previo.q} → ${post.q}`);
  check('recalcula las calorías en proporción',
        Math.abs(post.kcal - previo.kcal / previo.q * post.q) < 0.5,
        `${Math.round(previo.kcal)} → ${Math.round(post.kcal)}`);
  await p.tap('#comidaLista [data-qmenos]'); await p.waitForTimeout(350);
  post = (await db()).find(x => x.id === idPrimero);
  check('el botón − la vuelve atrás', Math.abs(post.q - previo.q) < 0.001, `q=${post.q}`);
  await p.tap('#comidaLista .entry-del'); await p.waitForTimeout(350);
  check('borra un plato', (await db()).length===antes-1);

  console.log('\nF · Frecuentes');
  await ir();
  const chips = await p.$$eval('#frecuentes button', e=>e.map(x=>x.textContent.trim()));
  check('ofrece los repetidos', chips.length>0, chips.join(', '));
  const n1 = (await db()).length;
  await p.tap('#frecuentes button'); await p.waitForTimeout(400);
  check('se agregan de un toque', (await db()).length===n1+1);

  console.log('\nG · Nada reconocible');
  const n2 = (await db()).length;
  await cargar('asdfgh qwerty', 'snack');
  check('no inventa alimentos', (await db()).length===n2);

  console.log('\nH · Otro día');
  await ir();
  await p.fill('#comidaDate', '2026-01-15'); await p.waitForTimeout(400);
  check('el día vacío se muestra vacío', /Todavía no cargaste/.test(await p.textContent('#comidaLista')));

  console.log('\nI · Persistencia');
  await p.reload(); await p.waitForTimeout(500); await ir();
  check('sobrevive a recargar', (await db()).length>0);

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES JS:\n  '+[...new Set(errs)].join('\n  ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
