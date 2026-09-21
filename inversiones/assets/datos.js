/* =====================================================================
   Renta Fija · snapshot del mercado
   ---------------------------------------------------------------------
   Foto de la curva de renta fija argentina tomada de InvertirOnline el
   20/09/2026 al cierre, para liquidar el 21/09/2026.

   Por qué una foto y no una consulta en vivo: la app corre en el
   teléfono, sin servidor y sin claves. Pedirle datos a IOL desde el
   navegador expondría la credencial en el propio HTML. La foto se
   actualiza desde afuera (ver README) y la app queda solo con la
   cuenta, que es lo que se está poniendo a prueba.

   Unidades, que es donde se equivoca todo el mundo:

   - `precio` es el precio sucio (dirty price): lo que sale comprar
     100 nominales, intereses corridos incluidos. Siempre en PESOS,
     también para los bonos que pagan en dólares, porque así cotizan
     en BYMA.
   - `flujo` son los pagos futuros por cada 100 nominales ORIGINALES,
     en la moneda del bono: dólares para los hard dollar, pesos
     ajustados por CER para los CER, pesos para las letras.
   - `vn` es el nominal residual: cuánto queda vivo de esos 100
     originales después de las amortizaciones ya cobradas.

   O sea que en un bono en dólares el precio está en pesos y el flujo en
   dólares. Para compararlos hace falta el tipo de cambio implícito, que
   el motor despeja del valor técnico (ver motor.js → fxImplicito).
   ===================================================================== */
var RF_DATOS = (function () {
'use strict';

/* Fecha de la foto y fecha en que liquidan las operaciones. En renta
   fija todo se descuenta contra la de liquidación, no contra la del
   precio: son distintas y confundirlas corre la TIR varios puntos. */
const SNAPSHOT = '2026-09-20';
const LIQUIDACION = '2026-09-21';

/* Tipo de cambio implícito de IOL, despejado del valor técnico de
   cualquier bono en dólares: (valor técnico − corridos) / nominal
   residual. Da 1478,705 en los once bonos en dólares de la foto, lo
   que confirma que es el que usa el broker y no una casualidad. */
const FX = 1478.705;

/* ---------------------------------------------------------------------
   El universo. Campos que vienen de IOL tal cual:
     precio      dirty_price      · lo que pagás por 100 VN
     limpio      clean_price      · sin los intereses corridos
     corridos    accrued_interest · intereses devengados y no cobrados
     vt          technical_value  · capital vivo + corridos, "lo que vale
                                    el papel" si el emisor paga todo
     paridad     parity           · precio / valor técnico. Abajo de 1 el
                                    mercado lo compra con descuento
     tirIol      yields.tir       · la TIR que publica IOL
     dmIol       modified_duration· sensibilidad: cuánto cae el precio si
                                    la tasa sube 1 punto
     vn          nominal_value    · nominal residual

   `flujo` son pares [fecha, pago] con interés + amortización juntos.
   --------------------------------------------------------------------- */
const INSTRUMENTOS = [

  /* ---------- Letras en pesos a tasa fija (la parte corta) ---------- */
  { t: 'S30S6', nombre: 'Lecap 30/09/26', clase: 'letra', moneda: 'ARS', ley: '—',
    vto: '2026-09-30', precio: 116.917, limpio: 116.917, corridos: 16.658,
    vt: 116.658, paridad: 1.00222, tirIol: 0.238647, dmIol: 0.019907, vn: 100,
    flujo: [['2026-09-30', 117.535626]] },

  { t: 'S30O6', nombre: 'Lecap 30/10/26', clase: 'letra', moneda: 'ARS', ley: '—',
    vto: '2026-10-30', precio: 132.300, limpio: 132.300, corridos: 30.922,
    vt: 130.922, paridad: 1.01053, tirIol: 0.231640, dmIol: 0.086754, vn: 100,
    flujo: [['2026-10-30', 135.278250]] },

  /* IOL devuelve esta letra con los intereses corridos y el importe
     final disparados (5,9 millones de corridos sobre un precio de 124,
     `rate` 2,3 donde las hermanas traen 0,0255). El vencimiento, el
     precio y la TIR sí son creíbles, así que el flujo se reconstruye
     capitalizando el precio a esa TIR y el instrumento queda marcado.
     El motor lo excluye del ajuste de la curva. */
  { t: 'S30N6', nombre: 'Lecap 30/11/26', clase: 'letra', moneda: 'ARS', ley: '—',
    vto: '2026-11-30', precio: 124.215, limpio: 124.215, corridos: null,
    vt: null, paridad: null, tirIol: 0.262220, dmIol: 0.151939, vn: 100,
    flujo: [['2026-11-30', 129.916]], sospechoso: 'corridos',
    nota: 'IOL informa 5.892.788 de intereses corridos sobre un precio de 124,21. ' +
          'El flujo está reconstruido desde la TIR.' },

  /* ------------- Bonos CER: pesos + inflación (cero cupón) ---------- */
  { t: 'TZX27', nombre: 'Boncer cero cupón 30/06/27', clase: 'cer', moneda: 'ARS+CER', ley: 'local',
    vto: '2027-06-30', precio: 406.65, limpio: 406.65, corridos: 0,
    vt: 416.194, paridad: 0.977069, tirIol: 0.030482, dmIol: 0.749749, vn: 416.194,
    flujo: [['2027-06-30', 416.193884]] },

  { t: 'TZXD7', nombre: 'Boncer cero cupón 15/12/27', clase: 'cer', moneda: 'ARS+CER', ley: 'local',
    vto: '2027-12-15', precio: 282.35, limpio: 282.35, corridos: 0,
    vt: 307.696, paridad: 0.917627, tirIol: 0.072215, dmIol: 1.149840, vn: 307.696,
    flujo: [['2027-12-15', 307.695991]] },

  { t: 'TX28', nombre: 'Boncer 2028', clase: 'cer', moneda: 'ARS+CER', ley: 'local',
    vto: '2028-11-09', precio: 1768.00, limpio: 1752.740, corridos: 15.260,
    vt: 1864.982, paridad: 0.947998, tirIol: 0.073506, dmIol: 1.012819, vn: 1849.722,
    flujo: [['2026-11-09', 390.753747], ['2027-05-09', 386.591872], ['2027-11-09', 382.429998],
            ['2028-05-09', 378.268124], ['2028-11-09', 374.106250]] },

  /* ---------- Soberanos en dólares · ley argentina (Bonares) -------- */
  { t: 'AL29', nombre: 'Bonar 2029', clase: 'hd', moneda: 'USD', ley: 'local',
    vto: '2029-07-09', precio: 83120, limpio: 82942.56, corridos: 177.44,
    vt: 88899.76, paridad: 0.934986, tirIol: 0.055688, dmIol: 1.424638, vn: 60,
    flujo: [['2027-01-09', 10.30], ['2027-07-09', 10.25], ['2028-01-09', 10.20],
            ['2028-07-09', 10.15], ['2029-01-09', 10.10], ['2029-07-09', 10.05]] },

  { t: 'AL30', nombre: 'Bonar 2030', clase: 'hd', moneda: 'USD', ley: 'local',
    vto: '2030-07-09', precio: 85300, limpio: 85160.02, corridos: 139.98,
    vt: 94777.12, paridad: 0.900006, tirIol: 0.069705, dmIol: 1.831426, vn: 64,
    flujo: [['2027-01-11', 8.24], ['2027-07-12', 8.21], ['2028-01-10', 8.42],
            ['2028-07-10', 8.35], ['2029-01-10', 8.32], ['2029-07-09', 8.24],
            ['2030-01-09', 8.16], ['2030-07-09', 8.08]] },

  { t: 'AL35', nombre: 'Bonar 2035', clase: 'hd', moneda: 'USD', ley: 'local',
    vto: '2035-07-09', precio: 113690, limpio: 112470.07, corridos: 1219.93,
    vt: 149090.46, paridad: 0.762557, tirIol: 0.101646, dmIol: 4.910156, vn: 100,
    flujo: [['2027-01-09', 2.0625], ['2027-07-09', 2.0625], ['2028-01-09', 2.375],
            ['2028-07-09', 2.375], ['2029-01-09', 2.50], ['2029-07-09', 2.50],
            ['2030-01-09', 2.50], ['2030-07-09', 2.50], ['2031-01-09', 12.50],
            ['2031-07-09', 12.25], ['2032-01-09', 12.00], ['2032-07-09', 11.75],
            ['2033-01-09', 11.50], ['2033-07-09', 11.25], ['2034-01-09', 11.00],
            ['2034-07-09', 10.75], ['2035-01-09', 10.50], ['2035-07-09', 10.25]] },

  { t: 'AE38', nombre: 'Bonar 2038', clase: 'hd', moneda: 'USD', ley: 'local',
    vto: '2038-01-09', precio: 118220, limpio: 116741.29, corridos: 1478.71,
    vt: 149349.23, paridad: 0.791568, tirIol: 0.102660, dmIol: 4.172021, vn: 100,
    flujo: [['2027-01-09', 2.50], ['2027-07-09', 7.04], ['2028-01-09', 6.9265],
            ['2028-07-09', 6.813], ['2029-01-09', 6.6995], ['2029-07-09', 6.586],
            ['2030-01-09', 6.4725], ['2030-07-09', 6.359], ['2031-01-09', 6.2455],
            ['2031-07-09', 6.132], ['2032-01-09', 6.0185], ['2032-07-09', 5.905],
            ['2033-01-09', 5.7915], ['2033-07-09', 5.678], ['2034-01-09', 5.5645],
            ['2034-07-09', 5.451], ['2035-01-09', 5.3375], ['2035-07-09', 5.224],
            ['2036-01-09', 5.1105], ['2036-07-09', 4.997], ['2037-01-09', 4.8835],
            ['2037-07-09', 4.77], ['2038-01-09', 4.7765]] },

  { t: 'AL41', nombre: 'Bonar 2041', clase: 'hd', moneda: 'USD', ley: 'local',
    vto: '2041-07-09', precio: 105210, limpio: 104174.91, corridos: 1035.09,
    vt: 148905.62, paridad: 0.706555, tirIol: 0.103313, dmIol: 5.309022, vn: 100,
    flujo: [['2027-01-09', 1.75], ['2027-07-09', 1.75], ['2028-01-09', 5.32],
            ['2028-07-09', 5.257525], ['2029-01-09', 5.19505], ['2029-07-09', 5.132575],
            ['2030-01-09', 5.659425], ['2030-07-09', 5.5724063], ['2031-01-09', 5.4853875],
            ['2031-07-09', 5.3983688], ['2032-01-09', 5.31135], ['2032-07-09', 5.2243313],
            ['2033-01-09', 5.1373125], ['2033-07-09', 5.0502938], ['2034-01-09', 4.963275],
            ['2034-07-09', 4.8762563], ['2035-01-09', 4.7892375], ['2035-07-09', 4.7022188],
            ['2036-01-09', 4.6152], ['2036-07-09', 4.5281813], ['2037-01-09', 4.4411625],
            ['2037-07-09', 4.3541438], ['2038-01-09', 4.267125], ['2038-07-09', 4.1801063],
            ['2039-01-09', 4.0930875], ['2039-07-09', 4.0060688], ['2040-01-09', 3.91905],
            ['2040-07-09', 3.8320313], ['2041-01-09', 3.7450125], ['2041-07-09', 3.6979938]] },

  /* ------- Soberanos en dólares · ley Nueva York (Globales) --------- */

  /* El flujo que devuelve IOL para este bono queda a mitad de camino:
     arranca con 92 de nominal, amortiza 8 por período y termina en 28
     en la misma fecha en que el bono vence. Faltan pagos, así que la
     TIR que publica IOL (6,37%) está subestimada. Queda en el universo
     pero fuera de la curva, marcado. */
  { t: 'GD30', nombre: 'Global 2030', clase: 'hd', moneda: 'USD', ley: 'ny',
    vto: '2030-07-09', precio: 88300, limpio: 88095.94, corridos: 204.06,
    vt: 136244.95, paridad: 0.648097, tirIol: 0.063691, dmIol: 1.850870, vn: 92,
    flujo: [['2027-01-09', 8.345], ['2027-07-09', 8.315], ['2028-01-09', 8.665],
            ['2028-07-09', 8.595], ['2029-01-09', 8.525], ['2029-07-09', 8.455],
            ['2030-01-09', 8.385], ['2030-07-09', 8.315]],
    sospechoso: 'flujo',
    nota: 'El flujo de IOL termina con 28 de nominal vivo el día del vencimiento: ' +
          'faltan pagos y la TIR publicada queda subestimada.' },

  { t: 'GD35', nombre: 'Global 2035', clase: 'hd', moneda: 'USD', ley: 'ny',
    vto: '2035-07-09', precio: 120000, limpio: 118781.55, corridos: 1218.45,
    vt: 149088.98, paridad: 0.804888, tirIol: 0.090757, dmIol: 5.002352, vn: 100,
    flujo: [['2027-01-09', 2.06], ['2027-07-09', 2.06], ['2028-01-09', 2.38],
            ['2028-07-09', 2.38], ['2029-01-09', 2.50], ['2029-07-09', 2.50],
            ['2030-01-09', 2.50], ['2030-07-09', 2.50], ['2031-01-09', 12.50],
            ['2031-07-09', 12.25], ['2032-01-09', 12.00], ['2032-07-09', 11.75],
            ['2033-01-09', 11.50], ['2033-07-09', 11.25], ['2034-01-09', 11.00],
            ['2034-07-09', 10.75], ['2035-01-09', 10.50], ['2035-07-09', 10.25]] },

  { t: 'GD38', nombre: 'Global 2038', clase: 'hd', moneda: 'USD', ley: 'ny',
    vto: '2038-01-09', precio: 126400, limpio: 124921.29, corridos: 1478.71,
    vt: 149349.23, paridad: 0.846338, tirIol: 0.086968, dmIol: 4.356336, vn: 100,
    flujo: [['2027-01-09', 2.50], ['2027-07-09', 7.04], ['2028-01-09', 6.9265],
            ['2028-07-09', 6.813], ['2029-01-09', 6.6995], ['2029-07-09', 6.586],
            ['2030-01-09', 6.4725], ['2030-07-09', 6.359], ['2031-01-09', 6.2455],
            ['2031-07-09', 6.132], ['2032-01-09', 6.0185], ['2032-07-09', 5.905],
            ['2033-01-09', 5.7915], ['2033-07-09', 5.678], ['2034-01-09', 5.5645],
            ['2034-07-09', 5.451], ['2035-01-09', 5.3375], ['2035-07-09', 5.224],
            ['2036-01-09', 5.1105], ['2036-07-09', 4.997], ['2037-01-09', 4.8835],
            ['2037-07-09', 4.77], ['2038-01-09', 4.7765]] },

  { t: 'GD41', nombre: 'Global 2041', clase: 'hd', moneda: 'USD', ley: 'ny',
    vto: '2041-07-09', precio: 112000, limpio: 110964.91, corridos: 1035.09,
    vt: 148905.62, paridad: 0.752154, tirIol: 0.091746, dmIol: 5.505577, vn: 100,
    flujo: [['2027-01-09', 1.75], ['2027-07-09', 1.75], ['2028-01-09', 5.32],
            ['2028-07-09', 5.257525], ['2029-01-09', 5.19505], ['2029-07-09', 5.132575],
            ['2030-01-09', 5.659425], ['2030-07-09', 5.5724063], ['2031-01-09', 5.4853875],
            ['2031-07-09', 5.3983688], ['2032-01-09', 5.31135], ['2032-07-09', 5.2243313],
            ['2033-01-09', 5.1373125], ['2033-07-09', 5.0502938], ['2034-01-09', 4.963275],
            ['2034-07-09', 4.8762563], ['2035-01-09', 4.7892375], ['2035-07-09', 4.7022188],
            ['2036-01-09', 4.6152], ['2036-07-09', 4.5281813], ['2037-01-09', 4.4411625],
            ['2037-07-09', 4.3541438], ['2038-01-09', 4.267125], ['2038-07-09', 4.1801063],
            ['2039-01-09', 4.0930875], ['2039-07-09', 4.0060688], ['2040-01-09', 3.91905],
            ['2040-07-09', 3.8320313], ['2041-01-09', 3.7450125], ['2041-07-09', 3.6979938]] },

  { t: 'GD46', nombre: 'Global 2046', clase: 'hd', moneda: 'USD', ley: 'ny',
    vto: '2046-07-09', precio: 103450, limpio: 102340.84, corridos: 1109.16,
    vt: 135553.05, paridad: 0.763170, tirIol: 0.089891, dmIol: 6.002579, vn: 90.92,
    flujo: [['2027-01-09', 4.145225], ['2027-07-09', 4.0984063], ['2028-01-09', 4.1595625],
            ['2028-07-09', 4.1099063], ['2029-01-09', 4.316], ['2029-07-09', 4.25925],
            ['2030-01-09', 4.2025], ['2030-07-09', 4.14575], ['2031-01-09', 4.089],
            ['2031-07-09', 4.03225], ['2032-01-09', 3.9755], ['2032-07-09', 3.91875],
            ['2033-01-09', 3.862], ['2033-07-09', 3.80525], ['2034-01-09', 3.7485],
            ['2034-07-09', 3.69175], ['2035-01-09', 3.635], ['2035-07-09', 3.57825],
            ['2036-01-09', 3.5215], ['2036-07-09', 3.46475], ['2037-01-09', 3.408],
            ['2037-07-09', 3.35125], ['2038-01-09', 3.2945], ['2038-07-09', 3.23775],
            ['2039-01-09', 3.181], ['2039-07-09', 3.12425], ['2040-01-09', 3.0675],
            ['2040-07-09', 3.01075], ['2041-01-09', 2.954], ['2041-07-09', 2.89725],
            ['2042-01-09', 2.8405], ['2042-07-09', 2.78375], ['2043-01-09', 2.727],
            ['2043-07-09', 2.67025], ['2044-01-09', 2.6135], ['2044-07-09', 2.55675],
            ['2045-01-09', 2.50], ['2045-07-09', 2.44325], ['2046-01-09', 2.3865],
            ['2046-07-09', 2.44975]] },

  /* --------------------- Bopreal (BCRA, dólares) -------------------- */
  /* Lo emite el Banco Central, no el Tesoro: es otro deudor y cotiza en
     su propia curva. Por eso lleva emisor propio y no se compara contra
     los Bonares y Globales. */
  { t: 'BPOA7', nombre: 'Bopreal Serie 4 · 31/10/27', clase: 'hd', moneda: 'USD', ley: 'local',
    emisor: 'bcra',
    vto: '2027-10-31', precio: 159920, limpio: 157024.20, corridos: 2895.80,
    vt: 150766.33, paridad: 1.060714, tirIol: -0.020920, dmIol: 0.856467, vn: 100,
    flujo: [['2026-10-31', 2.50], ['2027-04-30', 52.50], ['2027-10-31', 51.25]] }
];

/* Cómo se muestra cada clase y qué riesgo carga. La etiqueta corta es la
   que entra en la tabla; el texto largo aparece al tocar la fila. */
const CLASES = {
  letra: { etiqueta: 'Letra', color: '#4FC3A1',
           texto: 'Tasa fija en pesos a menos de un año. Sabés exactamente cuántos pesos ' +
                  'cobrás y cuándo. El riesgo es que la inflación te coma el rendimiento.' },
  cer:   { etiqueta: 'CER', color: '#7EA6F5',
           texto: 'Ajusta por CER, el índice de inflación. Te protege de la inflación pero ' +
                  'no del dólar: si el peso se devalúa más rápido que los precios, perdés.' },
  hd:    { etiqueta: 'Dólar', color: '#E8B04B',
           texto: 'Paga en dólares (hard dollar). Cotiza en pesos, así que el precio mezcla ' +
                  'el riesgo del emisor con el tipo de cambio.' }
};

const LEYES = {
  local: { etiqueta: 'Ley ARG', texto: 'Si hay un default, se discute en tribunales argentinos.' },
  ny:    { etiqueta: 'Ley NY',  texto: 'Se discute en tribunales de Nueva York: históricamente ' +
                                       'más protección para el acreedor, por eso suele valer más.' },
  '—':   { etiqueta: '—', texto: '' }
};

return { SNAPSHOT, LIQUIDACION, FX, INSTRUMENTOS, CLASES, LEYES };
})();

/* El mismo archivo lo carga el navegador con una etiqueta <script> y lo
   carga node con require(), para poder probar el motor sin abrir una
   ventana. Por eso se publica en los dos lados. */
(typeof window !== 'undefined' ? window : globalThis).RF_DATOS = RF_DATOS;
if (typeof module !== 'undefined' && module.exports) module.exports = RF_DATOS;
