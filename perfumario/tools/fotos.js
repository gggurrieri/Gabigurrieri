/* Mete fotos de frascos dentro de assets/coleccion.js.

   Uso: node perfumario/tools/fotos.js <carpeta> [salida]
   La carpeta tiene un archivo por perfume, nombrado con su id: col001.jpg,
   col00g.jpg, etc. Cada foto se recorta cuadrada por el centro, se achica a
   256 px y se guarda como JPEG embebido en la ficha, en el campo "foto".

   Usa el mismo tamaño y la misma calidad que la app cuando uno saca la foto
   desde el teléfono: así una foto que viene en el build y una que sacaste vos
   pesan y se ven igual. Si cambian esos números, cambiarlos en los dos lados.

   Las originales no entran al repo. Solo entra la versión de 256 px, que es la
   que la app necesita: guardar un JPEG de 3 MB para mostrarlo en 44 px es
   pagar mil veces de más y llenar el localStorage del teléfono.           */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const LADO = 256, CALIDAD = 0.72;

(async () => {
  const dir = path.resolve(process.argv[2]);
  const destino = path.resolve(process.argv[3] || path.join(__dirname, '..', 'assets', 'coleccion.js'));

  const archivos = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp)$/i.test(f));
  if (!archivos.length) { console.error('No hay imágenes en ' + dir); process.exit(1); }

  global.window = {};
  require(destino);
  const perfumes = global.window.PERFUMARIO_COLECCION.perfumes;

  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const p = await b.newPage();
  await p.setContent('<body></body>');

  let puestas = 0, pesoTotal = 0;
  for (const archivo of archivos) {
    const id = archivo.replace(/\.[^.]+$/, '');
    const ficha = perfumes.find(x => x.id === id);
    if (!ficha) { console.error(`  ! ${archivo}: no hay ningún perfume con id ${id}`); continue; }

    const tipo = /\.png$/i.test(archivo) ? 'png' : (/\.webp$/i.test(archivo) ? 'webp' : 'jpeg');
    const b64 = fs.readFileSync(path.join(dir, archivo)).toString('base64');
    const foto = await p.evaluate(async ([datos, lado, calidad]) => {
      const img = new Image();
      img.src = datos;
      await img.decode();
      const corte = Math.min(img.width, img.height);
      const cv = document.createElement('canvas');
      cv.width = cv.height = lado;
      cv.getContext('2d').drawImage(
        img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, lado, lado);
      return cv.toDataURL('image/jpeg', calidad);
    }, [`data:image/${tipo};base64,${b64}`, LADO, CALIDAD]);

    ficha.foto = foto;
    puestas++; pesoTotal += foto.length;
    console.log(`  ✓ ${ficha.nombre.padEnd(28)} ${Math.round(foto.length / 1024)} KB`);
  }
  await b.close();

  const cabecera = fs.readFileSync(destino, 'utf8').split('window.PERFUMARIO_COLECCION')[0];
  fs.writeFileSync(destino,
    cabecera + 'window.PERFUMARIO_COLECCION = ' + JSON.stringify({ perfumes }, null, 2) + ';\n');

  const conFoto = perfumes.filter(x => x.foto).length;
  console.log(`\n${puestas} fotos cargadas · ${conFoto} de ${perfumes.length} perfumes con foto` +
              ` · ${Math.round(pesoTotal / 1024)} KB en total`);
})();
