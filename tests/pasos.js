/* Pasos y pulso en reposo: desduplicación de fuentes y pantalla.
   Uso:  node tests/pasos.js [directorio-de-fixtures]                       */
const path = require('path');
const { chromium, devices } = require('playwright');
const fs = require('fs');
const SP = (process.argv[2] || path.join(__dirname, '..', 'tmp')).replace(/\/?$/, '/');
const esperado = JSON.parse(fs.readFileSync(SP+'pasos-esperado.json','utf8'));
let ok=0,fail=0;
const check=(n,c,d='')=>{ if(c){ok++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d?' → '+d:''));} };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => { localStorage.clear(); });
  await p.reload(); await p.waitForTimeout(400);
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1'));
    d.profile.startDate='2026-08-10'; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);

  await p.tap('.tab[data-view="log"]'); await p.waitForTimeout(250);
  await p.setInputFiles('#fileHealth', SP+'pasos.zip');
  await p.waitForSelector('#btnAddImported',{timeout:30000}); await p.waitForTimeout(400);
  const nota = await p.textContent('.import-note');
  check('la nota menciona los días de actividad', /días de pasos y pulso/.test(nota), nota);
  check('aparece la fila de resumen', /días de actividad diaria/.test(await p.textContent('#importPreview')));
  await p.tap('#btnAddImported'); await p.waitForTimeout(900);

  const daily = await p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')).daily);
  const fechas = Object.keys(daily).sort();
  check('guarda los 20 días', fechas.length===20, `n=${fechas.length}`);

  const totalApp = fechas.reduce((a,f)=>a+(daily[f].pasos||0),0);
  const totalOk = Object.values(esperado).reduce((a,b)=>a+b,0);
  check('NO suma las dos fuentes', totalApp===totalOk, `app ${totalApp} · correcto ${totalOk}`);
  const primerDia = fechas[0];
  check('toma la fuente con más pasos', daily[primerDia].pasos===esperado[primerDia],
        `${daily[primerDia].pasos} vs ${esperado[primerDia]}`);
  check('la mediana resuelve el pulso de dos fuentes', daily[primerDia].fcRep===63,
        `fcRep=${daily[primerDia].fcRep}`);

  await p.tap('.tab[data-view="progreso"]'); await p.waitForTimeout(500);
  check('la tarjeta aparece', !(await p.evaluate(()=>document.querySelector('#diarioCard').hidden)));
  const res = await p.textContent('#diarioResumen');
  check('muestra el promedio de pasos', /\d\.\d{3}/.test(res), res.replace(/\s+/g,' ').trim());
  check('muestra el pulso en reposo con su variación', /ppm/.test(res) && /↓/.test(res), res.replace(/\s+/g,' ').trim());
  check('dibuja la curva de pulso', !!(await p.$('#diarioFc svg')));
  check('dibuja las barras de pasos', !!(await p.$('#diarioPasos svg')));

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES: '+[...new Set(errs)].join(' | ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
