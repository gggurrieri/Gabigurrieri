/* Estudios de laboratorio: carga, lectura de resultados, ajuste del plan y
   adjuntos.  Uso:  node tests/labs.js                                       */
const path = require('path');
const { chromium, devices } = require('playwright');
let ok=0,fail=0;
const check=(n,c,d='')=>{ if(c){ok++;console.log('  ✓ '+n);} else {fail++;console.log('  ✗ '+n+(d?' → '+d:''));} };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,
    isMobile:true,hasTouch:true,userAgent:devices['iPhone 13'].userAgent});
  const p = await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await p.evaluate(() => localStorage.clear());
  await p.reload(); await p.waitForTimeout(400);

  const irCuerpo = async () => { await p.tap('.tab[data-view="peso"]'); await p.waitForTimeout(250); };
  const cargar = async (vals, fecha) => {
    await irCuerpo();
    await p.tap('#btnNuevoLab'); await p.waitForTimeout(300);
    if (fecha) await p.fill('#labDate', fecha);
    for (const [k,v] of Object.entries(vals)) {
      if (['proteinasU','glucosaU','cetonasU','hematiesU','leucocitosU'].includes(k))
        await p.selectOption('#lab_'+k, String(v));
      else await p.fill('#lab_'+k, String(v));
    }
    await p.tap('#formLab button[type=submit]'); await p.waitForTimeout(600);
  };

  console.log('\nA · Todo en rango');
  await cargar({ hb:15.1, glucosa:88, trigliceridos:110, tsh:2.1, creatinina:1.0 }, '2026-08-15');
  let t = await p.textContent('#labList');
  check('dice que está todo en rango', /dentro de rango/.test(t));
  check('no muestra alerta', !(await p.$('.lab-alerta')));
  let plan = await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1')); return d.labs.length; });
  check('el estudio queda guardado', plan===1);

  console.log('\nB · Valores fuera de rango que suavizan el plan');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1')); d.labs=[]; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);
  await cargar({ hb:11.2, ferritina:12, trigliceridos:280, gpt:74, acidoUrico:8.1 }, '2026-08-20');
  t = await p.textContent('#labList');
  check('marca la hemoglobina baja', /Hemoglobina/.test(t) && /bajo/.test(t));
  check('marca los triglicéridos altos', /Triglicéridos/.test(t));
  check('explica qué significa para entrenar', /ritmo conversado|volumen aeróbico/.test(t));
  check('ofrece suavizar el plan', !!(await p.$('[data-aplicar]')));

  // la semana 1 no tiene intervalos ni en el plan original: hay que mirar una que sí
  await p.tap('.tab[data-view="plan"]'); await p.waitForTimeout(300);
  await p.tap('.week-nav button[data-week="4"]'); await p.waitForTimeout(300);
  const semana = await p.$$eval('#planDetail .sess', els => els.map(e => ({
    t: e.querySelector('.sess-title').textContent.trim(),
    ajuste: !!e.querySelector('.pill.ajuste') })));
  const intervalos = semana.filter(x => /intervalos/i.test(x.t)).length;
  const ajustadas = semana.filter(x => x.ajuste);
  check('saca los intervalos del plan', intervalos===0, `quedaron ${intervalos}`);
  check('marca las sesiones ajustadas', ajustadas.length>0, `n=${ajustadas.length}`);
  check('reemplaza la soga por algo sin impacto', !semana.some(x=>/^Soga/.test(x.t)),
        semana.map(x=>x.t).join(' | '));

  console.log('\nC · Desactivar el ajuste devuelve el plan original');
  await irCuerpo();
  await p.uncheck('[data-aplicar]'); await p.waitForTimeout(400);
  await p.tap('.tab[data-view="plan"]'); await p.waitForTimeout(300);
  await p.tap('.week-nav button[data-week="4"]'); await p.waitForTimeout(300);
  const semana2 = await p.$$eval('#planDetail .sess .sess-title', e=>e.map(x=>x.textContent.trim()));
  check('vuelven los intervalos', semana2.some(x=>/intervalos/i.test(x)), semana2.join(' | '));
  check('vuelve la soga', semana2.some(x=>/^Soga/.test(x)));

  console.log('\nD · Valor crítico');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1')); d.labs=[]; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);
  await cargar({ hb:8.4, potasio:2.6 }, '2026-08-25');
  check('muestra la alerta destacada', !!(await p.$('.lab-alerta')));
  const crit = await p.$$eval('.hallazgo.critico', e=>e.length);
  check('marca los hallazgos críticos', crit>=2, `n=${crit}`);
  t = await p.textContent('.lab-alerta');
  check('la alerta dice que no es un diagnóstico', /no es un diagnóstico/i.test(t));

  console.log('\nE · Riñón y la sugerencia de proteína');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1')); d.labs=[]; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);
  const antesProt = await (async()=>{ await irCuerpo(); return p.textContent('#protein'); })();
  await cargar({ creatinina:1.9, filtrado:52 }, '2026-08-26');
  const despues = await p.textContent('#protein');
  check('antes sugería gramos', /g\/día/.test(antesProt), antesProt);
  check('con el riñón comprometido pide consultar', /consultá/i.test(despues), despues);

  console.log('\nF · Comparación con el estudio anterior');
  await cargar({ trigliceridos:150 }, '2026-08-01');
  await cargar({ trigliceridos:210 }, '2026-08-28');
  t = await p.textContent('#labList');
  check('muestra el valor previo', /antes 150/.test(t), t.match(/antes [\d.]+ .?/)?.[0]||'no aparece');

  console.log('\nG · Adjuntar el informe');
  const fs = require('fs');
  fs.writeFileSync('/tmp/informe.png', fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'icon-180.png')));
  await irCuerpo();
  await p.tap('#btnNuevoLab'); await p.waitForTimeout(300);
  await p.fill('#labDate','2026-08-29');
  await p.setInputFiles('#labFile','/tmp/informe.png');
  await p.fill('#lab_hb','15.0');
  await p.tap('#formLab button[type=submit]'); await p.waitForTimeout(900);
  const img = await p.$('#labList img[data-foto]');
  check('guarda el adjunto', !!img);
  const cargada = await p.evaluate(() => { const i=document.querySelector('#labList img[data-foto]');
    return i && i.src.startsWith('data:image'); });
  check('lo muestra desde IndexedDB', cargada);

  console.log('\nH · Unidades y umbrales con valores reales');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1')); d.labs=[]; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400);
  await irCuerpo();
  await p.tap('#btnPegarLab'); await p.waitForTimeout(350);
  // Valores inventados, con la forma de un informe real: la mayoría en rango,
  // los glóbulos blancos en mil/mm³ como los informan los laboratorios de acá,
  // y cinco marcadores fuera de rango a propósito.
  await p.fill('#modalText', JSON.stringify({ date:'2026-06-06', lugar:'Laboratorio',
    values:{ hb:15.2, hto:45.1, gb:6.2, ferritina:88.0, glucosa:92, homa:0.9,
             colesterol:232, hdl:64, ldl:147, trigliceridos:118, got:24, gpt:26,
             creatinina:1.10, filtrado:86.0, acidoUrico:5.8, tsh:1.90,
             vitd:22, b12:410, sodio:140, potasio:5.7, magnesio:2.1 } }));
  await p.tap('[data-ok]'); await p.waitForTimeout(700);
  const marcados = await p.$$eval('#labList .hallazgo b', e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
  check('pegar valores agrega el estudio', marcados.length>0);
  check('no marca los glóbulos blancos normales (mil/mm³)',
        !marcados.some(x=>/Glóbulos/.test(x)), marcados.filter(x=>/Glóbulos/.test(x)).join());
  check('no marca hemoglobina, ferritina ni tiroides normales',
        !marcados.some(x=>/Hemoglobina|Ferritina|TSH/.test(x)));
  check('marca el potasio alto como crítico',
        await p.evaluate(() => [...document.querySelectorAll('.hallazgo.critico b')].some(e=>/Potasio/.test(e.textContent))));
  check('marca colesterol, LDL, filtrado y vitamina D',
        ['Colesterol total','LDL','Filtrado','Vitamina D'].every(k=>marcados.some(x=>x.includes(k))),
        marcados.join(' · '));
  check('son exactamente cinco hallazgos', marcados.length===5, `n=${marcados.length}`);

  console.log('\nI · Edad desde la fecha de nacimiento');
  await p.tap('#btnSettings'); await p.waitForTimeout(250);
  await p.fill('#pBirth','1987-04-22');
  await p.tap('#formProfile button[type=submit]'); await p.waitForTimeout(350);
  await p.tap('#btnSettings'); await p.waitForTimeout(250);
  const edad = await p.textContent('#pAgeShown');
  check('calcula la edad sola', /3[5-9] años/.test(edad), edad);

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES JS:\n  '+[...new Set(errs)].join('\n  ') : 'sin errores JS');
  await b.close();
  process.exit(fail?1:0);
})();
