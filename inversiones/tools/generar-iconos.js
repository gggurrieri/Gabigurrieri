/* Rasteriza el SVG a PNG escalándolo al tamaño pedido.
   La versión anterior abría el SVG directo y el navegador lo recortaba:
   con viewport de 180 px se veía la esquina superior izquierda de una
   imagen de 1024, o sea, fondo vacío. */
/* Uso: node inversiones/tools/generar-iconos.js inversiones/assets/icon.svg inversiones/assets
   (necesita Playwright; con CHROME_PATH se le pasa un Chromium propio)        */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const svg = fs.readFileSync(process.argv[2], 'utf8');
  const dir = path.resolve(process.argv[3]);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  for (const size of [180, 512]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(`<style>html,body{margin:0;padding:0}
      svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await p.waitForTimeout(120);
    await p.screenshot({ path: path.join(dir, `icon-${size}.png`) });
    await p.close();
  }
  await b.close();
  console.log('íconos regenerados');
})();
