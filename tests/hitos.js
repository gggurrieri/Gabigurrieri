/* Hitos de peso por semana: objetivos, estados y avisos.
   Uso:  node tests/hitos.js                                              */
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
  const iso = d => d.toISOString().slice(0,10);
  const sembrar = async (diasDesdeInicio, pesos) => {
    await p.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
    await p.evaluate(([dias, pesos]) => {
      const iso = d => d.toISOString().slice(0,10);
      const s = new Date(); s.setDate(s.getDate() - dias);
      const w = pesos.map(([off, kg]) => { const d=new Date(s); d.setDate(d.getDate()+off); return {date:iso(d), kg}; });
      localStorage.setItem('desafio90_v1', JSON.stringify({
        profile:{name:'Gabi',birth:'1987-04-22',age:37,sex:'m',height:176,startWeight:91,
                 goalWeight:83,startDate:iso(s),footballDay:5,restDay:6,hrMax:0},
        sessions:[],weights:w,tests:[],labs:[],done:{}}));
    }, [diasDesdeInicio, pesos]);
    await p.reload(); await p.waitForTimeout(400);
    await p.tap('.tab[data-view="peso"]'); await p.waitForTimeout(300);
  };

  console.log('\nA · Objetivos que reparte el plan');
  await sembrar(14, [[0,91]]);
  const objs = await p.$$eval('.hitos div span', e=>e.map(x=>x.textContent.trim()));
  console.log('   ' + objs.join(' · '));
  check('doce hitos, uno por semana', objs.length===12, `n=${objs.length}`);
  check('la semana 2 pide unos 1,3 kg menos', objs[1]==='89,7', objs[1]);
  check('la semana 12 llega a la meta', objs[11]==='83,0', objs[11]);

  console.log('\nB · Atrasado');
  await sembrar(28, [[0,91],[27,90.5]]);   // semana 4: objetivo 88,3
  let t = await p.textContent('#hitoAhora');
  check('marca que va por detrás', /por detrás/.test(t), t.slice(0,80));
  check('dice cuánto falta', /te faltan <b>|te faltan /.test(await p.innerHTML('#hitoAhora')));
  check('el consejo apunta a la comida', /comida/.test(await p.textContent('#hitoConsejo')));
  check('la barra lateral en color de atraso', await p.evaluate(()=>document.querySelector('.hito-estado').className.includes('e-atrasado')));
  const leg = await p.evaluate(() => {
    const e = document.querySelector('.hito-estado em'), cs = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    return { texto: e.textContent.trim(), color: cs.color, fondo: cs.backgroundColor, ancho: Math.round(b.width) };
  });
  check('el estado se lee como texto, no como una barra',
        leg.fondo === 'rgba(0, 0, 0, 0)' && leg.color !== leg.fondo,
        `color ${leg.color} sobre ${leg.fondo}`);

  console.log('\nC · En camino');
  await sembrar(28, [[0,91],[27,88.4]]);
  t = await p.textContent('#hitoAhora');
  check('reconoce que está en objetivo', /en el objetivo/.test(t), t.slice(0,70));

  console.log('\nD · Adelantado');
  await sembrar(28, [[0,91],[27,86.5]]);
  t = await p.textContent('#hitoAhora');
  check('marca que va por delante', /por delante/.test(t), t.slice(0,70));
  check('advierte de no acelerar', /no aceleres/.test(await p.textContent('#hitoConsejo')));

  console.log('\nE · Primeras semanas: aviso del agua');
  await sembrar(10, [[0,91],[9,91.3]]);
  check('avisa del agua y el glucógeno', /retienen agua/.test(await p.textContent('#hitoConsejo')));

  console.log('\nF · Sin peso registrado');
  await sembrar(21, []);
  t = await p.textContent('#hitoAhora');
  check('pide registrar el peso', /Registrá tu peso/.test(t), t.slice(0,70));

  console.log('\nG · Semanas cerradas quedan marcadas');
  await sembrar(35, [[6,90.2],[13,89.4],[20,88.6],[27,88.0],[34,87.2]]);
  const marcas = await p.$$eval('.hitos div', e=>e.map(x=>x.className));
  check('las cumplidas quedan en verde', marcas.filter(c=>c.includes('h-ok')).length>=4,
        marcas.map((c,i)=>`S${i+1}:${c||'-'}`).join(' '));
  check('la semana en curso queda resaltada', marcas.some(c=>c.includes('h-hoy')));

  console.log('\nH · En Hoy y en el gráfico');
  const mini = await p.textContent('#hitoHoy');
  check('el resumen aparece en Hoy', /Semana \d+:/.test(mini), mini.trim().slice(0,60));
  const lineas = await p.$$eval('#weightChart path[stroke]', e=>e.map(x=>x.getAttribute('stroke-dasharray')||'sólida'));
  check('el gráfico suma la línea del plan', lineas.filter(x=>x!=='sólida').length>=1, lineas.join(', '));

  console.log('\nI · Meta igual al peso inicial');
  await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('desafio90_v1'));
    d.profile.goalWeight=d.profile.startWeight; localStorage.setItem('desafio90_v1',JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(400); await p.tap('.tab[data-view="peso"]'); await p.waitForTimeout(300);
  check('sin bajada por delante oculta la tarjeta', await p.evaluate(()=>document.querySelector('#hitoCard').hidden));

  console.log('\n' + '─'.repeat(46));
  console.log(`${ok} pasaron · ${fail} fallaron`);
  console.log(errs.length ? 'ERRORES JS:\n  '+[...new Set(errs)].join('\n  ') : 'sin errores JS');
  await b.close(); process.exit(fail?1:0);
})();
