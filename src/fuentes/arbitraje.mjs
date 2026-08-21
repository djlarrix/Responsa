/**
 * Laudos arbitrales del CAM Santiago (Centro de Arbitraje y Mediación de la
 * Cámara de Comercio de Santiago).
 *
 * El CAM publica sus laudos anonimizados desde 1994 en dos índices — por
 * materia y por árbitro — como tabla HTML con enlace directo al PDF.
 * No hay API; se parsea el índice y se busca en local (verificado 15-ago-2026,
 * 382 PDFs publicados).
 *
 * IMPORTANTE: el CAM declara que los laudos son de su propiedad y que
 * reproducirlos en sitios externos requiere autorización previa. Por eso este
 * módulo INDEXA Y ENLAZA, pero no descarga ni reproduce el texto de los
 * laudos. La herramienta entrega la referencia y el PDF oficial para que se
 * lea en la fuente.
 */
import { pedir, aTextoPlano } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const INDICES = {
  materia: 'https://www.ccs.cl/camsantiago/sentencias-arbitrales/indice-por-materias/',
  arbitro: 'https://www.ccs.cl/camsantiago/sentencias-arbitrales/indice-por-arbitros/',
};

/** Descarga y parsea un índice del CAM. Cacheado 7 días: cambia poco. */
async function indice(tipo) {
  const url = INDICES[tipo];
  if (!url) throw new Error(`Índice desconocido: ${tipo}. Opciones: materia, arbitro.`);

  return conCache(`cam:indice:${tipo}`, 604800, async () => {
    const res = await pedir(url, { headers: { Accept: 'text/html' }, timeoutMs: 45000 });
    if (!res.ok) throw new Error(`El CAM Santiago respondió HTTP ${res.status}`);

    // <tr class="search"><th>MATERIA</th><td><a href="...pdf">ROL</a>…</td></tr>
    const filas = [];
    for (const m of res.texto.matchAll(/<tr class="search">([\s\S]*?)<\/tr>/gi)) {
      const bloque = m[1];
      const encabezado = aTextoPlano(bloque.match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1] ?? '');
      if (!encabezado) continue;
      const laudos = [...bloque.matchAll(/<a[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)].map((a) => ({
        rol: aTextoPlano(a[2]),
        pdf: a[1],
      }));
      if (laudos.length) filas.push({ [tipo]: encabezado, laudos });
    }
    if (!filas.length) throw new Error('El CAM Santiago cambió la estructura de su índice de laudos.');
    return filas;
  });
}

const sinTildes = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Busca laudos arbitrales del CAM por materia o por árbitro.
 * @param {object} p
 * @param {string} p.consulta texto a buscar (materia o nombre del árbitro)
 * @param {'materia'|'arbitro'} [p.por] índice a usar. Default materia.
 * @param {number} [p.limite] default 10
 */
export async function buscarLaudos({ consulta, por = 'materia', limite = 10 }) {
  if (!consulta?.trim()) throw new Error('Falta la consulta.');
  const filas = await indice(por);

  const terminos = sinTildes(consulta).split(/[^a-z0-9ñ.]+/).filter((t) => t.length > 2);
  const puntuadas = filas
    .map((f) => {
      const heno = sinTildes(f[por]);
      return { ...f, _rel: terminos.filter((t) => heno.includes(t)).length };
    })
    .filter((f) => f._rel > 0)
    .sort((a, b) => b._rel - a._rel);

  const resultados = puntuadas.slice(0, limite).map(({ _rel, ...f }) => ({
    [por]: f[por],
    laudos: f.laudos.map((l) => ({ rol: l.rol, tribunal: 'CAM Santiago (arbitraje)', pdf: l.pdf })),
  }));

  return {
    consulta,
    buscado_por: por,
    total_entradas_indice: filas.length,
    encontrados: resultados.length,
    resultados,
    fuente: INDICES[por],
    nota:
      'Laudos anonimizados publicados por el CAM Santiago. El texto está en el PDF enlazado: ' +
      'los laudos son propiedad del CAM y su reproducción externa requiere autorización, ' +
      'por eso se entrega el enlace oficial y no una copia del contenido.',
    ...(resultados.length ? {} : { sugerencia: 'Prueba términos más generales, o busca por árbitro con `por: "arbitro"`.' }),
  };
}

/** Lista las materias (o árbitros) disponibles en el índice del CAM. */
export async function listarMateriasArbitrales(por = 'materia') {
  const filas = await indice(por);
  // El índice completo son 781 materias: devolverlo entero cuesta ~18.000
  // tokens y casi nunca se necesita. Va una muestra, y para encontrar algo
  // concreto está `buscar_laudos_arbitrales`.
  const TOPE = 120;
  return {
    por,
    total: filas.length,
    total_laudos: filas.reduce((n, f) => n + f.laudos.length, 0),
    muestra: filas.slice(0, TOPE).map((f) => f[por]),
    ...(filas.length > TOPE ? { nota: `Se muestran ${TOPE} de ${filas.length}. Para encontrar una materia concreta usa buscar_laudos_arbitrales, que busca en todo el índice.` } : {}),
    fuente: INDICES[por],
  };
}
