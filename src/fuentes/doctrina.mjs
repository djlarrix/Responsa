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
 * Comprueba, por DOI, que el trabajo sea de acceso abierto y obtiene su enlace
 * libre directo.
 *
 * Crossref entrega el DOI, pero un DOI resuelve a la página del editor, que
 * puede estar tras un muro de pago, caída, o simplemente no existir. Devolver
 * eso como "fuente" obliga a creer sin poder comprobar, que es justo lo que
 * esta herramienta existe para evitar.
 *
 * OpenAlex expone `open_access.is_oa` y el PDF libre en `best_oa_location`.
 * Lo que no tenga enlace libre comprobable no se devuelve.
 */
async function accesoLibre(doi) {
  if (!doi) return null;
  return conCache(`openalex:oa:${doi}`, 2592000, async () => {
    const res = await pedir(
      `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?mailto=${encodeURIComponent(CORREO)}`,
      { headers: { Accept: 'application/json' }, timeoutMs: 20000, intentos: 2 },
    );
    if (!res.ok) return { en_openalex: false };
    try {
      const j = JSON.parse(res.texto);
      const oa = j.open_access ?? {};
      const mejor = j.best_oa_location ?? {};
      return {
        en_openalex: true,
        es_abierto: oa.is_oa === true,
        tipo_acceso: oa.oa_status ?? null,
        enlace: mejor.pdf_url || oa.oa_url || mejor.landing_page_url || null,
      };
    } catch {
      return { en_openalex: false };
    }
  });
}

/** Comprueba que el enlace responda de verdad y sea legible sin pagar. */
async function enlaceServible(url) {
  if (!url) return false;
  try {
    const res = await pedir(url, { headers: { Accept: '*/*' }, timeoutMs: 20000, intentos: 1 });
    if (!res.ok) return false;
    // Una página de venta o de login no es acceso libre.
    const muro = /add to cart|purchase this article|subscribe to (view|read)|comprar art[íi]culo|iniciar sesi[óo]n para/i;
    return !(res.texto && res.texto.length < 60000 && muro.test(res.texto));
  } catch {
    return false;
  }
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

    // Se pide un poco más de lo necesario porque los que no tengan enlace
    // libre comprobable se van a descartar.
    const candidatos = pertinentes
      .sort((a, b) => b._rel - a._rel || b._score - a._score || (b.anio ?? 0) - (a.anio ?? 0))
      .slice(0, limite * 3);

    // Se comprueban por tandas y se corta al juntar los que hacen falta:
    // verificar los 24 candidatos cuando bastan 8 es tiempo regalado, y son
    // dos peticiones por candidato.
    const utiles = [];
    let descartados = 0;
    for (let i = 0; i < candidatos.length && utiles.length < limite; i += limite) {
      const tanda = await Promise.all(
        candidatos.slice(i, i + limite).map(async (d) => {
          const oa = await accesoLibre(d.doi);
          if (!oa?.es_abierto || !oa.enlace) return { d, ok: false };
          if (!(await enlaceServible(oa.enlace))) return { d, ok: false };
          return { d, ok: true, oa };
        }),
      );
      for (const c of tanda) {
        if (c.ok) utiles.push(c);
        else descartados++;
      }
    }
    utiles.length = Math.min(utiles.length, limite);

    if (!utiles.length) {
      return {
        consulta,
        revistas_consultadas: revistas.length,
        encontrados: 0,
        resultados: [],
        descartados_sin_enlace_libre: descartados,
        sugerencia:
          `Se encontraron ${descartados} trabajos sobre el tema, pero ninguno con enlace libre comprobable, ` +
          'así que no se devuelven: no podrías verificarlos. Prueba otros términos.',
        nota: 'Sólo se devuelve doctrina cuyo texto completo se puede abrir y leer sin pagar.',
      };
    }

    const salida = utiles.map(({ d, oa }) => {
      const { _score, _revista, _rel, ...limpio } = d;
      return {
        ...limpio,
        // El enlace que de verdad abre el texto completo, gratis y comprobado.
        enlace_libre: oa.enlace,
        tipo_acceso: oa.tipo_acceso,
        cita: citarDoctrina(limpio),
      };
    });

    return {
      consulta,
      revistas_consultadas: revistas.length,
      encontrados: salida.length,
      resultados: salida,
      ...(descartados ? { descartados_sin_enlace_libre: descartados } : {}),
      nota:
        'Cada trabajo trae `enlace_libre`: el texto completo, gratis, comprobado al momento de la consulta. ' +
        'Lo que no se puede abrir y leer no se devuelve. No incluye manuales, tratados ni bases de suscripción.',
    };
  });
}
