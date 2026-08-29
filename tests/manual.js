/* Carga manual de calorías y corrección de un plato ya registrado.
   Uso:  node tests/manual.js                                              */
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
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')).foods);

  console.log('\nA · Cargar algo que no está en la base');
  await ir();
  await p.tap('#btnManual'); await p.waitForTimeout(350);
  check('se abre el formulario', !(await p.evaluate(()=>document.querySelector('#formManual').hidden)));
  await p.fill('#manNombre','Guiso de mi vieja');
  await p.fill('#manPorcion','1 plato hondo');
  await p.fill('#manKcal','620'); await p.fill('#manPr','32'); await p.fill('#manGr','24');
  await p.tap('#formManual button[type=submit]'); await p.waitForTimeout(600);
  let f = await db();
  check('lo guarda', f.length===1, `n=${f.length}`);
  check('con las calorías tipeadas', f[0].kcal===620, `${f[0].kcal}`);
  check('con proteína y grasa', f[0].pr===32 && f[0].gr===24);
  check('queda marcado como manual', f[0].manual===true && f[0].k==='');
  check('se cierra al guardar', await p.evaluate(()=>document.querySelector('#formManual').hidden));
  check('aparece en la lista del día', /Guiso de mi vieja/.test(await p.textContent('#comidaLista')));
  const tot = await p.textContent('#comidaTotales');
  check('suma al total del día', /620 kcal/.test(tot), tot.replace(/\s+/g,' ').slice(0,60));

  console.log('\nB · Solo calorías, sin macros');
  await ir(); await p.tap('#btnManual'); await p.waitForTimeout(300);
  await p.fill('#manNombre','Empanada del kiosco'); await p.fill('#manKcal','300');
  await p.tap('#formManual button[type=submit]'); await p.waitForTimeout(600);
  f = await db();
  const emp = f.find(x=>x.n==='Empanada del kiosco');
  check('acepta solo calorías', emp && emp.kcal===300, emp?`${emp.kcal}`:'no está');
  check('los macros quedan en cero, no inventados', emp.pr===0 && emp.gr===0 && emp.ch===0);

  console.log('\nC · La cantidad escala lo cargado a mano');
  await ir();
  const id = await p.evaluate(() => {
    const f = JSON.parse(localStorage.getItem('desafio90_v1')).foods.find(x=>x.n==='Guiso de mi vieja');
    return f.id; });
  await p.tap(`[data-qmas="${id}"]`); await p.waitForTimeout(450);
  f = await db();
  const g = f.find(x=>x.id===id);
  check('media porción más escala las calorías', g.q===1.5 && g.kcal===930, `q=${g.q} kcal=${g.kcal}`);
  check('y también la proteína', g.pr===48, `${g.pr}`);
  await p.tap(`[data-qmenos="${id}"]`); await p.waitForTimeout(400);

  console.log('\nD · Corregir un plato de la base');
  await ir();
  await p.fill('#comidaTexto','un pote chico de granola sin azucar');
  await p.tap('#formComida button[type=submit]'); await p.waitForTimeout(600);
  await ir();
  const idG = await p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1'))
    .foods.find(x=>x.k==='granola_sa').id);
  const antes = (await db()).find(x=>x.id===idG);
  await p.tap(`[data-editcomida="${idG}"]`); await p.waitForTimeout(400);
  check('abre el formulario en modo corrección',
        (await p.textContent('#manualTitulo'))==='Corregir este plato');
  const precargado = await p.inputValue('#manKcal');
  check('viene precargado con el valor por porción', Number(precargado)===180, precargado);
  await p.fill('#manKcal','240');
  await p.tap('#formManual button[type=submit]'); await p.waitForTimeout(600);
  const despues = (await db()).find(x=>x.id===idG);
  check('guarda la corrección respetando la cantidad',
        Math.abs(despues.kcal - 240*antes.q) < 0.01, `q=${despues.q} kcal=${despues.kcal}`);
  check('no duplica la entrada', (await db()).filter(x=>x.id===idG).length===1);

  console.log('\nE · Validación');
  await ir(); await p.tap('#btnManual'); await p.waitForTimeout(300);
  const n0 = (await db()).length;
  await p.fill('#manNombre','Sin calorías');
  await p.evaluate(() => document.querySelector('#formManual').requestSubmit());
  await p.waitForTimeout(400);
  check('no guarda sin calorías', (await db()).length===n0);

  console.log('\nF · Persistencia');
  await p.reload(); await p.waitForTimeout(500); await ir();
  check('sobrevive a recargar', /Guiso de mi vieja/.test(await p.textContent('#comidaLista')));

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES: '+[...new Set(errs)].join(' | ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
