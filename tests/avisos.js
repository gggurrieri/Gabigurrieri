/* Aviso de copia de seguridad, aviso de exceso de calorías y foto de la comida.
   Uso:  node tests/avisos.js                                              */
const path = require('path');
const { chromium, devices } = require('playwright');
let ok=0,fail=0;
const check=(n,c,d='')=>{ if(c){ok++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d?' → '+d:''));} };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent,
    permissions:['clipboard-write']});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')));
  const ir = async v => { await p.tap(`.tab[data-view="${v}"]`); await p.waitForTimeout(250); };

  console.log('\nA · Aviso de copia');
  check('sin datos no molesta', await p.evaluate(()=>document.querySelector('#avisoCopia').hidden));
  await ir('peso'); await p.fill('#wKg','91');
  await p.tap('#formWeight button[type=submit]'); await p.waitForTimeout(500);
  await ir('hoy');
  check('con datos y sin copia, avisa', !(await p.evaluate(()=>document.querySelector('#avisoCopia').hidden)));
  check('dice que no hay ninguna', /No tenés ninguna copia/.test(await p.textContent('#avisoCopia')));
  await p.tap('#avisoCopia'); await p.waitForTimeout(600);
  check('lleva a Ajustes y abre la copia', !!(await p.$('#modalText')));
  await p.tap('[data-close]'); await p.waitForTimeout(300);
  check('registra la fecha de la copia', !!(await db()).meta.ultimaCopia);
  check('el estado lo refleja', /hoy/.test(await p.textContent('#copiaEstado')));
  await ir('hoy');
  check('el aviso desaparece', await p.evaluate(()=>document.querySelector('#avisoCopia').hidden));

  // simular una copia vieja
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1'));
    const x=new Date(); x.setDate(x.getDate()-9);
    d.meta.ultimaCopia = x.toISOString().slice(0,10);
    localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(500);
  check('vuelve a avisar pasada la semana', !(await p.evaluate(()=>document.querySelector('#avisoCopia').hidden)));
  check('dice cuántos días pasaron', /Hace 9 días/.test(await p.textContent('#avisoCopia')),
        (await p.textContent('#avisoCopia')).trim().slice(0,50));

  console.log('\nB · Aviso de calorías');
  await ir('comida');
  check('sin pasarse no aparece', await p.evaluate(()=>document.querySelector('#avisoCalorias').hidden));
  const objetivo = await p.evaluate(() => {
    const t = document.querySelector('#comidaTotales').textContent.match(/de (\d+)/);
    return t ? Number(t[1]) : 0; });
  await p.tap('#btnManual'); await p.waitForTimeout(350);
  await p.fill('#manNombre','Día flojo'); await p.fill('#manKcal', String(objetivo + 450));
  await p.tap('#formManual button[type=submit]'); await p.waitForTimeout(700);
  await ir('comida');
  check('al pasarse aparece el aviso', !(await p.evaluate(()=>document.querySelector('#avisoCalorias').hidden)));
  const av = await p.textContent('#avisoCalorias');
  check('dice por cuánto', /Te pasaste por 4[45]\d kcal/.test(av), av.replace(/\s+/g,' ').trim().slice(0,60));
  check('encuadra con el promedio semanal', /promedio de la semana|promedio de los últimos/.test(av));
  const resto = await p.textContent('#comidaResto');
  check('el encabezado también lo dice', /por encima/.test(resto), resto);

  console.log('\nC · Foto de la comida');
  await ir('comida');
  await p.tap('#btnManual'); await p.waitForTimeout(350);
  await p.fill('#manNombre','Milanesa con puré'); await p.fill('#manKcal','700');
  await p.setInputFiles('#manFoto', path.resolve(__dirname, '..', 'assets', 'icon-512.png'));
  await p.waitForTimeout(700);
  check('muestra la vista previa', !(await p.evaluate(()=>document.querySelector('#manFotoPrev').hidden)));
  const esJpeg = await p.evaluate(()=>document.querySelector('#manFotoPrev').src.startsWith('data:image/jpeg'));
  check('la comprime a JPEG', esJpeg);
  await p.tap('#formManual button[type=submit]'); await p.waitForTimeout(900);
  await ir('comida');
  const conFoto = await p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1'))
    .foods.find(x=>x.n==='Milanesa con puré'));
  check('la entrada queda marcada con foto', conFoto && conFoto.foto===true);
  await p.waitForTimeout(500);
  const mini = await p.evaluate(() => { const i=document.querySelector('#comidaLista img[data-fotocomida]');
    return i && i.src.startsWith('data:image'); });
  check('la miniatura sale de IndexedDB', mini);
  const tam = await p.evaluate(() => { const i=document.querySelector('#comidaLista img[data-fotocomida]');
    return i ? Math.round(i.src.length/1024) : 0; });
  console.log(`     (la foto guardada pesa ${tam} KB)`);
  check('pesa poco', tam > 0 && tam < 400, `${tam} KB`);
  await p.tap(`[data-delcomida="${conFoto.id}"]`); await p.waitForTimeout(600);
  const huerfana = await p.evaluate(async (id) => {
    return new Promise(res => { const r = indexedDB.open('desafio12-archivos',1);
      r.onsuccess = () => { const g = r.result.transaction('files','readonly').objectStore('files').get('foto-'+id);
        g.onsuccess = () => res(g.result === undefined); g.onerror = () => res(false); };
      r.onerror = () => res(false); }); }, conFoto.id);
  check('borrar la comida borra su foto', huerfana);

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES: '+[...new Set(errs)].join(' | ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
