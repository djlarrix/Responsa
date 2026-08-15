/**
 * Caché en disco. No es un lujo: la BCN devuelve 429 ("Service limit has been
 * reached") con poco tráfico, y el texto de las normas es enorme (Ley 19.496
 * son 300 KB de XML). Sin caché el servidor se vuelve inusable a la tercera
 * consulta.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DIR = process.env.RESPONSA_CACHE_DIR || join(homedir(), '.responsa', 'cache');

/**
 * Versión del formato de lo que se guarda. SUBIRLA cada vez que cambie la
 * FORMA de lo que devuelve una fuente (campos nuevos, limpieza de texto,
 * relevancia distinta).
 *
 * Sin esto, arreglar un parseo no arregla nada para quien ya tiene la respuesta
 * vieja en caché: sigue recibiendo el formato anterior hasta que venza el TTL,
 * que para las normas son siete días.
 */
const VERSION = 6;

let listo = false;
async function asegurarDir() {
  if (listo) return;
  await mkdir(DIR, { recursive: true });
  listo = true;
}

const ruta = (clave) =>
  join(DIR, createHash('sha256').update(`v${VERSION}:${clave}`).digest('hex').slice(0, 32) + '.json');

/**
 * Devuelve el valor cacheado o ejecuta `produce` y lo guarda.
 * @param {string} clave
 * @param {number} ttlSegundos
 * @param {() => Promise<any>} produce
 */
export async function conCache(clave, ttlSegundos, produce) {
  await asegurarDir();
  const f = ruta(clave);
  try {
    const crudo = JSON.parse(await readFile(f, 'utf8'));
    if (Date.now() - crudo.t < ttlSegundos * 1000) return crudo.v;
  } catch {
    // sin caché o corrupta: seguimos
  }
  const v = await produce();
  try {
    await writeFile(f, JSON.stringify({ t: Date.now(), v }), 'utf8');
  } catch {
    // si no se puede escribir, igual devolvemos el valor
  }
  return v;
}

/** Borra una entrada. Se usa cuando una sesión caducó y hay que renovarla. */
export async function invalidar(clave) {
  await asegurarDir();
  try {
    await rm(ruta(clave), { force: true });
  } catch {
    // si no se puede borrar, el TTL la vencerá igual
  }
}

export const CACHE_DIR = DIR;
