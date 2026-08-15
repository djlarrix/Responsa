/**
 * Precarga en caché las normas más citadas del derecho chileno.
 *
 * El límite de servicio de la BCN no es sólo de frecuencia: pesa el tamaño.
 * Bajar el Código del Trabajo o el Código Civil completos, uno tras otro,
 * gatilla un 429 aunque se respete el intervalo entre peticiones. Como esas
 * normas cambian poco y el caché dura 7 días, conviene traerlas una vez, con
 * calma, y dejar el uso diario sin esperas ni topes.
 *
 *   npm run precargar
 *
 * Tarda varios minutos a propósito. Se puede interrumpir y retomar: lo ya
 * descargado queda en caché.
 */
import { verNorma } from '../src/fuentes/leychile.mjs';

const NORMAS = [
  ['172986', 'Código Civil'],
  ['207436', 'Código del Trabajo'],
  ['22740', 'Código de Procedimiento Civil'],
  ['1984', 'Código Penal'],
  ['176595', 'Código Procesal Penal'],
  ['1974', 'Código de Comercio'],
  ['25563', 'Código Orgánico de Tribunales'],
  ['6374', 'Código Tributario'],
  ['242302', 'Constitución Política'],
  ['61438', 'Ley 19.496 (consumidor)'],
  ['29526', 'Ley 18.101 (arrendamiento)'],
  ['29438', 'Ley 18.010 (operaciones de crédito)'],
  ['1058072', 'Ley 20.720 (insolvencia)'],
  ['28650', 'Ley 16.744 (accidentes del trabajo)'],
  ['141599', 'Ley 19.628 (vida privada)'],
  ['1209272', 'Ley 21.719 (datos personales)'],
  ['196640', 'Ley 19.799 (firma electrónica)'],
];

const ESPERA_MS = Number(process.env.PRECARGA_ESPERA_MS) || 8000;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Precargando ${NORMAS.length} normas (${ESPERA_MS / 1000}s entre cada una).\n`);

let ok = 0, ya = 0, fallo = 0;
for (const [id, nombre] of NORMAS) {
  const t0 = Date.now();
  try {
    const n = await verNorma(id);
    const ms = Date.now() - t0;
    // Si vino del caché responde en milisegundos; si bajó de la BCN, en segundos.
    if (ms < 400) { ya++; console.log(`  ya en caché   ${nombre} (${n.total_articulos} arts.)`); }
    else { ok++; console.log(`  descargada    ${nombre} (${n.total_articulos} arts., ${(ms / 1000).toFixed(1)}s)`); }
  } catch (e) {
    fallo++;
    console.log(`  FALLÓ         ${nombre}: ${e.message.slice(0, 80)}`);
    await espera(30000); // el límite se suelta en cosa de un minuto
    continue;
  }
  await espera(ESPERA_MS);
}

console.log(`\n${ok} descargadas, ${ya} ya estaban, ${fallo} fallaron.`);
if (fallo) console.log('Vuelve a correr el comando: retoma sólo lo que falta.');
process.exit(fallo ? 1 : 0);
