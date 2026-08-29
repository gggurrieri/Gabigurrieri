/* Recorrido de extremo a extremo de la app, en un viewport de iPhone y con
   eventos táctiles reales.  Uso:  node tests/e2e.js [directorio-de-fixtures]
   Los fixtures se generan con  python3 tests/fixtures.py <directorio>       */
const path = require('path');
const { chromium, devices } = require('playwright');
const SP = (process.argv[2] || path.join(__dirname, '..', 'tmp')).replace(/\/?$/, '/');
const APP = 'file://' + path.resolve(__dirname, '..', 'index.html');

let ok=0, fail=0; const fallos=[];
function check(nombre, cond, detalle='') {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
  else { fail++; fallos.push(nombre+(detalle?` → ${detalle}`:'')); console.log(`  ✗ ${nombre}${detalle?' → '+detalle:''}`); }
}
const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('desafio90_v1')||'null'));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent,locale:'es-AR'});
  const p = await ctx.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  const ir = async v => { if(v==='ajustes') await p.tap('#btnSettings'); else await p.tap(`.tab[data-view="${v}"]`); await p.waitForTimeout(220); };

  // ─────────── A · primer arranque, sin ningún dato ───────────
  console.log('\nA · Primer arranque');
  await p.goto(APP);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);
  for (const v of ['hoy','plan','log','peso','progreso','ajustes']) {
    await ir(v);
    const vacio = await p.evaluate(() => {
      const s = document.querySelector('.view:not([hidden])');
      return { alto: s.getBoundingClientRect().height, txt: s.textContent.length };
    });
    check(`vista ${v} renderiza`, vacio.alto > 100 && vacio.txt > 50, `alto=${Math.round(vacio.alto)}`);
  }
  const d0 = await db(p);
  check('el estado inicial queda persistido', d0 !== null,
        'localStorage vacío: la fecha de inicio se recalcula en cada apertura');
  const perfilUI = await p.evaluate(() => ({
    ini: document.querySelector('#pStart').value, meta: document.querySelector('#pGoal').value,
    fut: document.querySelector('#pFootball').value, des: document.querySelector('#pRest').value,
    fecha: document.querySelector('#pDate').value }));
  check('perfil por defecto: 91→83 kg', perfilUI.ini==='91' && perfilUI.meta==='83');
  check('fútbol sábado, descanso domingo', perfilUI.fut==='5' && perfilUI.des==='6');

  // ─────────── B · perfil ───────────
  console.log('\nB · Perfil');
  await ir('ajustes');
  await p.fill('#pName','Gabi'); await p.fill('#pBirth','1987-04-22');
  await p.selectOption('#pFootball','3');            // jueves
  await p.selectOption('#pRest','4');                // viernes
  await p.tap('#formProfile button[type=submit]'); await p.waitForTimeout(400);
  await ir('plan');
  const semana = await p.$$eval('#planDetail .sess', els => els.map(e => ({
    d: e.querySelector('.sess-day').textContent.trim().split(' ')[0],
    t: e.querySelector('.sess-title').textContent.trim() })));
  const jue = semana.find(x=>x.d==='Jueves'), vie = semana.find(x=>x.d==='Viernes');
  check('el plan mueve el fútbol al jueves', jue && jue.t==='Fútbol', jue&&jue.t);
  check('el descanso queda el viernes', vie && vie.t==='Descanso total', vie&&vie.t);
  await ir('ajustes');
  await p.selectOption('#pFootball','5'); await p.selectOption('#pRest','6');
  await p.tap('#formProfile button[type=submit]'); await p.waitForTimeout(350);

  // ─────────── C · peso ───────────
  console.log('\nC · Peso');
  await ir('peso');
  await p.fill('#wKg','90.4'); await p.tap('#formWeight button[type=submit]'); await p.waitForTimeout(350);
  const hoyTxt = await p.textContent('#wNow');
  check('el peso de hoy se refleja', hoyTxt.trim()==='90.4', hoyTxt);
  const curva1 = await p.$('#weightChart svg');
  check('con un solo peso avisa que faltan datos', !curva1);
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1'));
    d.weights.push({date:'2026-08-20',kg:91.2}); localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400); await ir('peso');
  check('con dos pesos dibuja la curva', !!(await p.$('#weightChart svg')));
  const imc = await p.textContent('#bmiNow');
  check('IMC calculado', /2\d\.\d/.test(imc), imc);

  // ─────────── D · registro manual ───────────
  console.log('\nD · Registro manual');
  await ir('log');
  await p.selectOption('#sesType','bici'); await p.fill('#sesMin','50'); await p.fill('#sesKm','18');
  const kcalPrev = await p.textContent('#kcalPreview');
  await p.tap('#formSession button[type=submit]'); await p.waitForTimeout(450);
  let d = await db(p);
  check('la sesión se guarda', d.sessions.length===1, `n=${d.sessions.length}`);
  check('calcula calorías', d.sessions[0].kcal>200, `${d.sessions[0].kcal} · vista previa ${kcalPrev}`);
  const vistaTrasGuardar = await p.evaluate(()=>document.querySelector('.view:not([hidden])').id);
  check('tras guardar vuelve a Hoy', vistaTrasGuardar==='view-hoy', vistaTrasGuardar);
  await ir('log');
  const enBitacora = await p.$$eval('#logList .entry', e=>e.length);
  check('aparece en la bitácora', enBitacora===1, `filas=${enBitacora}`);
  await ir('progreso');
  const totales = await p.textContent('#totals');
  check('suma en los totales', /18|1\b/.test(totales));

  // ─────────── E · marcar el plan ───────────
  console.log('\nE · Marcar sesiones del plan');
  await ir('plan');
  await p.tap('#planDetail .sess:not(.is-rest) .check'); await p.waitForTimeout(250);
  d = await db(p);
  check('la marca se guarda', Object.keys(d.done).length===1);
  await p.reload(); await p.waitForTimeout(400); await ir('plan');
  const marcadas = await p.$$eval('#planDetail .check.on', e=>e.length);
  check('la marca sobrevive a recargar', marcadas===1, `n=${marcadas}`);

  // ─────────── F · importar Salud con el perfil recién creado ───────────
  console.log('\nF · Importar Salud sin tocar la fecha de inicio (caso del primer uso)');
  await ir('log');
  await p.setInputFiles('#fileHealth', SP+'exportacion-es.zip');
  await p.waitForSelector('.import-note',{timeout:40000}); await p.waitForTimeout(300);
  const notaF = (await p.textContent('.import-note')).trim();
  const btnF = await p.$('#btnAddImported');
  console.log(`     nota: ${notaF}`);
  check('ofrece elegir desde cuándo traer', !!(await p.$('#impRango')));
  check('avisa cuántos quedaron fuera del rango', /Quedan \d+ fuera del rango/.test(notaF), notaF);
  const opciones = await p.$$eval('#impRango option', o=>o.map(x=>x.textContent.trim()));
  console.log('     rangos: ' + opciones.join(' | '));
  await p.selectOption('#impRango','todo'); await p.waitForTimeout(350);
  const conTodo = await p.$$eval('#importPreview .entry', e=>e.length);
  check('ampliar el rango trae más', conTodo>1, `filas=${conTodo}`);

  // ─────────── G · importar con la fecha de inicio corrida ───────────
  console.log('\nG · Importar Salud con el desafío empezado hace un mes');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1'));
    d.profile.startDate='2026-08-10'; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400); await ir('log');
  await p.setInputFiles('#fileHealth', SP+'exportacion-es.zip');
  await p.waitForSelector('#btnAddImported',{timeout:40000});
  const antes = (await db(p)).sessions.length;
  await p.tap('#btnAddImported'); await p.waitForTimeout(700);
  d = await db(p);
  check('agrega las sesiones importadas', d.sessions.length>antes, `${antes} → ${d.sessions.length}`);
  check('agrega los pesos importados', d.weights.length>=8, `n=${d.weights.length}`);
  const filas = await p.$$eval('#logList .entry', e=>e.length);
  check('las importadas se ven en la bitácora', filas===d.sessions.length, `${filas} filas vs ${d.sessions.length} sesiones`);
  const conOrigen = await p.$$eval('#logList .entry-sub', e=>e.filter(x=>/Salud/.test(x.textContent)).length);
  check('se distinguen por origen', conOrigen>0, `n=${conOrigen}`);
  await ir('peso');
  check('los pesos importados llegan a la curva', !!(await p.$('#weightChart svg')));
  const hist = await p.$$eval('#weightList .entry', e=>e.length);
  check('los pesos aparecen en el historial', hist>=8, `n=${hist}`);
  await ir('progreso');
  const tot2 = await p.textContent('#totals');
  check('los totales incluyen lo importado', !/^\s*0/.test(tot2));

  // ─────────── H · TCX y zonas ───────────
  console.log('\nH · Archivo suelto del reloj');
  await ir('log');
  await p.setInputFiles('#fileTrack', SP+'zepp/soga-otro-dia.tcx');
  await p.waitForSelector('#btnAddImported',{timeout:15000});
  await p.tap('#btnAddImported'); await p.waitForTimeout(500);
  d = await db(p);
  const conZonas = d.sessions.filter(s=>s.zones).length;
  check('el TCX guarda las zonas de pulso', conZonas>=1, `n=${conZonas}`);

  // ─────────── I · filtros ───────────
  console.log('\nI · Filtros de la bitácora');
  await ir('log');
  await p.tap('.chip[data-f="soga"]'); await p.waitForTimeout(250);
  const soloSoga = await p.$$eval('#logList .entry-ico', e=>e.every(x=>x.textContent.includes('🪢')));
  check('el filtro deja solo soga', soloSoga);
  await p.tap('.chip[data-f="all"]'); await p.waitForTimeout(200);

  // ─────────── J · borrar ───────────
  console.log('\nJ · Borrar una sesión');
  const nAntes = (await db(p)).sessions.length;
  await p.tap('#logList .entry-del'); await p.waitForTimeout(400);
  check('borra una sola', (await db(p)).sessions.length===nAntes-1);

  // ─────────── K · copia de seguridad ───────────
  console.log('\nK · Exportar e importar la copia');
  const snapshot = JSON.stringify(await db(p));
  await ir('ajustes');
  await p.tap('#btnExport'); await p.waitForTimeout(400);
  const texto = await p.inputValue('#modalText');
  check('la copia contiene los datos', texto.length>500 && JSON.parse(texto).sessions.length>0);
  await p.tap('[data-close]'); await p.waitForTimeout(200);
  await p.tap('#btnReset'); await p.waitForTimeout(300);
  check('el borrado pide confirmación propia', !!(await p.$('[data-si]')));
  await p.tap('[data-si]'); await p.waitForTimeout(400);
  const trasReset = await db(p);
  check('borrar todo vacía las sesiones', !trasReset || trasReset.sessions.length===0,
        trasReset?`quedan ${trasReset.sessions.length}`:'');
  await ir('ajustes');
  await p.tap('#btnImport'); await p.waitForTimeout(400);
  await p.fill('#modalText', snapshot);
  await p.tap('[data-ok]'); await p.waitForTimeout(600);
  const restaurado = await db(p);
  check('la copia restaura todo', restaurado.sessions.length===JSON.parse(snapshot).sessions.length,
        `${restaurado.sessions.length} vs ${JSON.parse(snapshot).sessions.length}`);

  // ─────────── L · el selector de rango no se desincroniza ───────────
  console.log('\nL · Selector de rango');
  await p.goto(APP);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);
  await ir('log');
  await p.setInputFiles('#fileHealth', SP+'caso-usuario.zip');
  await p.waitForSelector('#impRango',{timeout:30000}); await p.waitForTimeout(300);
  await p.evaluate(() => { document.querySelector('#impRango').dataset.marca='original'; });
  for (const r of ['todo','90','365','inicio','todo']) { await p.selectOption('#impRango', r); await p.waitForTimeout(120); }
  await p.selectOption('.imp-type','soga'); await p.waitForTimeout(200);
  const mismo = await p.evaluate(() => { const s=document.querySelector('#impRango'); return s && s.dataset.marca==='original'; });
  check('el selector sobrevive a los re-render', mismo);
  const coherente = await p.evaluate(() => {
    const s = document.querySelector('#impRango');
    const dice = parseInt(s.selectedOptions[0].textContent.split('·').pop().trim(),10);
    return { dice, filas: document.querySelectorAll('#impBody .entry.imported').length, valor: s.value };
  });
  check('el número del selector coincide con las filas', coherente.dice===coherente.filas,
        `dice ${coherente.dice}, hay ${coherente.filas}`);
  await p.selectOption('#impRango','inicio'); await p.waitForTimeout(300);
  const vacioMsg = await p.textContent('#impBody .empty').catch(()=>'');
  check('el rango sin resultados lo explica', /rango/.test(vacioMsg), vacioMsg||'sin mensaje');
  const sinBoton = await p.$('#btnAddImported');
  check('sin resultados no ofrece agregar', !sinBoton);

  // ─────────── M · los campos quedan parejos y adentro del módulo ───────────
  console.log('\nM · Campos de formulario');
  await p.goto(APP);
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);
  for (const v of ['log','peso','progreso','ajustes']) {
    await ir(v);
    if (v==='peso') { await p.tap('#btnNuevoLab'); await p.waitForTimeout(300); }
    const r = await p.evaluate(() => {
      const campos = [...document.querySelectorAll('.view:not([hidden]) input, .view:not([hidden]) select')]
        .filter(el => !el.hidden && el.type!=='file' && el.type!=='range' && el.getBoundingClientRect().width);
      const alturas = [...new Set(campos.map(el => Math.round(el.getBoundingClientRect().height)))];
      const fuera = campos.filter(el => {
        const c = el.closest('.card'); if (!c) return false;
        const cs = getComputedStyle(c), b = el.getBoundingClientRect(), k = c.getBoundingClientRect();
        return b.right > k.right - parseFloat(cs.paddingRight) + 1 || b.left < k.left + parseFloat(cs.paddingLeft) - 1;
      }).map(el => el.id || el.type);
      const fechas = campos.filter(el => el.type==='date')
        .map(el => getComputedStyle(el).textAlign);
      return { alturas, fuera, fechas, n: campos.length };
    });
    check(`${v}: todos los campos con la misma altura`, r.alturas.length===1, `alturas ${r.alturas.join(', ')}px`);
    check(`${v}: ningún campo se sale del módulo`, r.fuera.length===0, r.fuera.join(', '));
    if (r.fechas.length)
      check(`${v}: las fechas alinean como el resto`, r.fechas.every(a=>a==='left'||a==='start'), r.fechas.join(', '));
  }

  // ─────────── N · ícono de "Agregar a inicio" ───────────
  console.log('\nN · Ícono de pantalla de inicio');
  const artifact = 'file://' + path.resolve(__dirname, '..', 'dist', 'artifact.html');
  const fs2 = require('fs');
  if (fs2.existsSync(path.resolve(__dirname, '..', 'dist', 'artifact.html'))) {
    await p.goto(artifact); await p.waitForTimeout(900);
    const ico = await p.evaluate(() => {
      const l = document.head.querySelector('link[rel="apple-touch-icon"]');
      return l ? { padre: l.parentElement.tagName, png: l.href.startsWith('data:image/png'),
                   sizes: l.getAttribute('sizes'), kb: Math.round(l.href.length/1024) } : null;
    });
    check('el build sin <head> propio inserta el ícono', !!ico, 'no se insertó');
    if (ico) {
      check('queda dentro del <head>', ico.padre==='HEAD', ico.padre);
      check('es un PNG, que es lo único que acepta iOS', ico.png);
      check('declara 180x180', ico.sizes==='180x180', ico.sizes);
    }
  }
  await p.goto(APP); await p.waitForTimeout(600);
  const unico = await p.evaluate(() => document.head.querySelectorAll('link[rel="apple-touch-icon"]').length);
  check('con <head> propio no lo duplica', unico===1, `hay ${unico}`);

  console.log('\n' + '─'.repeat(50));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  if (fallos.length) { console.log('\nFALLOS:'); fallos.forEach(f=>console.log('  · '+f)); }
  if (errs.length) { console.log('\nERRORES JS:'); [...new Set(errs)].forEach(e=>console.log('  · '+e)); }
  await b.close();
  process.exit(fail?1:0);
})();
