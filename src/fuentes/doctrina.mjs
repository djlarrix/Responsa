/**
 * Doctrina académica chilena vía Crossref (API pública, sin clave).
 *
 * Buscar "cláusulas abusivas" en todo Crossref devuelve miles de artículos
 * colombianos y brasileños. La precisión viene de restringir la consulta a los
 * ISSN de revistas jurídicas chilenas, verificados uno por uno contra
 * api.crossref.org/journals el 15-ago-2026 (entre paréntesis, los trabajos
 * indexados al momento de verificar).
 *
 * Esto cubre doctrina ABIERTA. La doctrina de bases suscritas (vLex, Thomson
 * Reuters, LegalPublishing…) se conecta aparte: ver README, sección
 * "Doctrina de suscripción".
 */
import { pedir } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const CORREO = process.env.CROSSREF_MAILTO || 'responsa-mcp@example.org';

/** ISSN verificados de revistas jurídicas chilenas indexadas en Crossref. */
export const REVISTAS = [
  { issn: '0718-3437', nombre: 'Revista Chilena de Derecho (PUC)', obras: 664 },
  { issn: '0716-0747', nombre: 'Revista Chilena de Derecho (PUC, serie impresa)', obras: 55 },
  { issn: '0718-0012', nombre: 'Ius et Praxis (U. de Talca)', obras: 1033 },
  { issn: '0718-0950', nombre: 'Revista de Derecho (Valdivia, UACh)', obras: 777 },
  { issn: '0718-5200', nombre: 'Estudios Constitucionales (U. de Talca)', obras: 562 },
  { issn: '0718-0233', nombre: 'Revista Chilena de Derecho Privado (UDP)', obras: 957 },
  { issn: '0718-0853', nombre: 'Revista de Estudios de la Justicia (U. de Chile)', obras: 310 },
  { issn: '0719-0093', nombre: 'Revista Chilena de Derecho del Trabajo y de la Seguridad Social (U. de Chile)', obras: 351 },
  { issn: '0718-2457', nombre: 'Ars Boni et Aequi (UBO)', obras: 91 },
];

const CAMPOS = 'title,author,container-title,issued,DOI,URL,abstract,page,volume,issue';

function normalizar(it) {
  const anio = it.issued?.['date-parts']?.[0]?.[0] ?? null;
  const autores = (it.author ?? [])
    .map((a) => [a.family, a.given].filter(Boolean).join(', '))
    .filter(Boolean);
  const resumen = it.abstract
    ? String(it.abstract).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600)
    : '';
  return {
    titulo: it.title?.[0] ?? '(sin título)',
    autores,
    revista: it['container-title']?.[0] ?? '',
    anio,
    volumen: it.volume ?? '',
    numero: it.issue ?? '',
    paginas: it.page ?? '',
    doi: it.DOI ?? '',
    url: it.URL ?? (it.DOI ? `https://doi.org/${it.DOI}` : ''),
    resumen,
  };
}

/** Cita en formato chileno habitual para revistas. */
export function citarDoctrina(d) {
  const aut = d.autores.length ? d.autores.join('; ') : 'S/A';
  const partes = [d.revista, d.volumen && `vol. ${d.volumen}`, d.numero && `N° ${d.numero}`, d.anio && `(${d.anio})`, d.paginas && `pp. ${d.paginas}`]
    .filter(Boolean)
    .join(', ');
  return `${aut}, "${d.titulo}", ${partes}${d.doi ? `, DOI: ${d.doi}` : ''}.`;
}

const VACIAS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'o', 'a', 'un', 'una', 'por', 'para',
  'con', 'sin', 'sobre', 'the', 'of', 'and', 'que', 'al', 'su', 'sus', 'como', 'ante',
]);

const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Crossref devuelve el top-N de CADA revista aunque no tenga que ver con la
 * consulta, así que sin este filtro una búsqueda de "cláusulas abusivas"
 * arrastra artículos de cualquier tema. Se exige que el trabajo comparta al
 * menos un término de contenido con la consulta.
 */
function relevancia(d, terminos) {
  const heno = sinTildes(`${d.titulo} ${d.resumen}`);
  return terminos.filter((t) => heno.includes(t)).length;
}

async function crossref(url) {
  const res = await pedir(url, { headers: { Accept: 'application/json' }, timeoutMs: 25000 });
  if (!res.ok) throw new Error(`Crossref respondió HTTP ${res.status}`);
  return JSON.parse(res.texto);
}

/**
 * Busca doctrina en revistas jurídicas chilenas.
 * @param {object} p
 * @param {string} p.consulta
 * @param {number} [p.limite] resultados totales (default 8)
 * @param {number} [p.desdeAnio] filtra por año de publicación
 * @param {string[]} [p.issn] restringe a ciertas revistas
 */
export async function buscarDoctrina({ consulta, limite = 8, desdeAnio, issn }) {
  if (!consulta?.trim()) throw new Error('Falta la consulta.');
  const revistas = issn?.length ? REVISTAS.filter((r) => issn.includes(r.issn)) : REVISTAS;
  const clave = `crossref:${consulta}:${limite}:${desdeAnio ?? ''}:${revistas.map((r) => r.issn).join(',')}`;

  return conCache(clave, 86400, async () => {
    // Se consulta revista por revista: Crossref no permite filtrar por varios
    // ISSN en una sola query manteniendo la relevancia por revista.
    const porRevista = Math.max(3, Math.ceil(limite / 2));
    const filtroAnio = desdeAnio ? `&filter=from-pub-date:${desdeAnio}-01-01` : '';
    const tareas = revistas.map(async (r) => {
      try {
        const j = await crossref(
          `https://api.crossref.org/journals/${r.issn}/works?query=${encodeURIComponent(consulta)}` +
            `&rows=${porRevista}&select=${CAMPOS}${filtroAnio}&mailto=${encodeURIComponent(CORREO)}`,
        );
        return (j.message?.items ?? []).map((it) => ({ ...normalizar(it), _revista: r.nombre, _score: it.score ?? 0 }));
      } catch {
        return [];
      }
    });

    const todos = (await Promise.all(tareas)).flat();
    const vistos = new Set();
    const unicos = todos.filter((d) => (d.doi && !vistos.has(d.doi) ? (vistos.add(d.doi), true) : !d.doi));

    const terminos = [...new Set(sinTildes(consulta).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 3 && !VACIAS.has(t)))];
    const puntuados = unicos.map((d) => ({ ...d, _rel: terminos.length ? relevancia(d, terminos) : 1 }));
    const pertinentes = puntuados.filter((d) => d._rel > 0);

    // Antes, si nada era pertinente se devolvían igual los mejores por score
    // con una advertencia. Un listado con aviso al margen es demasiado fácil de
    // citar como si viniera al caso: mejor no devolver nada y decirlo.
    if (!pertinentes.length) {
      return {
        consulta,
        revistas_consultadas: revistas.length,
        encontrados: 0,
        resultados: [],
        sugerencia:
          'Ningún trabajo de las revistas indexadas trata este tema. Prueba términos más generales o la ' +
          'denominación doctrinal habitual. No hay doctrina que citar sobre esto en las fuentes abiertas disponibles.',
        nota: 'Doctrina de acceso abierto indexada en Crossref. No incluye manuales, tratados ni bases de suscripción.',
      };
    }

    const salida = pertinentes
      .sort((a, b) => b._rel - a._rel || b._score - a._score || (b.anio ?? 0) - (a.anio ?? 0))
      .slice(0, limite)
      .map(({ _score, _revista, _rel, ...d }) => ({ ...d, cita: citarDoctrina(d) }));

    return {
      consulta,
      revistas_consultadas: revistas.length,
      encontrados: salida.length,
      resultados: salida,
      nota: 'Doctrina de acceso abierto indexada en Crossref. No incluye manuales, tratados ni bases de suscripción.',
    };
  });
}
