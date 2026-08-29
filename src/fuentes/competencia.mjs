/**
 * Tribunal de Defensa de la Libre Competencia (TDLC).
 *
 * Era un punto ciego: en libre competencia —colusión, abuso de posición
 * dominante, operaciones de concentración— el criterio no lo fija la justicia
 * ordinaria sino el TDLC, y sus sentencias no están en el buscador del Poder
 * Judicial. Una consulta sobre la materia no encontraba nada.
 *
 * Su sitio es WordPress y expone la API REST estándar (`/wp-json/wp/v2/`) con
 * tipos propios: `tdlc-sentencias`, `tdlc-resoluciones` y `dictamenes` (los de
 * las antiguas comisiones antimonopolio, que siguen citándose).
 *
 * Dos particularidades que definen cómo se usa:
 *
 *   1. El TÍTULO es un resumen sustantivo del fallo, no un rótulo. Dice quién
 *      demandó a quién y qué se resolvió, así que buscar por título es buscar
 *      por contenido, y sirve para decidir sin abrir el PDF.
 *   2. El TEXTO no viene por la API: `content` llega vacío. El fallo está en un
 *      PDF enlazado desde su ficha. Por eso esta herramienta ubica y enlaza,
 *      pero NO entrega pasajes: quien quiera citar tiene que leer el PDF.
 *      Decirlo es parte de la respuesta, no una nota al pie.
 *
 * Y una trampa: el parámetro `search` de la API devuelve CERO en estos tipos,
 * aunque el buscador genérico del sitio sí encuentre. Como el catálogo entero
 * son 216 sentencias y 91 resoluciones —unos 100 KB—, se replica en caché y se
 * busca en local. Sale más rápido, no depende de un buscador que no funciona, y
 * permite ordenar por pertinencia en vez de por fecha.
 */
import { pedir, aTextoPlano } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://www.tdlc.cl/wp-json/wp/v2';

/** Qué publica el TDLC, y qué es cada cosa. */
export const COLECCIONES = {
  sentencias: {
    ruta: 'tdlc-sentencias',
    nombre: 'Sentencia del TDLC',
    que_es: 'Falla el caso contencioso: colusión, abuso de posición dominante, competencia desleal.',
    conducta: 'conducta-sent',
    industria: 'industria-sent',
  },
  resoluciones: {
    ruta: 'tdlc-resoluciones',
    nombre: 'Resolución del TDLC',
    que_es: 'Resuelve consultas y operaciones de concentración en procedimiento no contencioso.',
    conducta: 'conducta-resoluciones',
    industria: 'industria-resoluciones',
  },
  dictamenes: {
    ruta: 'dictamenes',
    nombre: 'Dictamen de las comisiones antimonopolio',
    que_es: 'Anteriores al TDLC (hasta 2004). Se siguen citando como precedente.',
    conducta: 'conducta',
    industria: 'industria',
  },
};

/**
 * Diccionario de una taxonomía: identificador interno -> nombre legible.
 *
 * Hace falta porque los títulos del TDLC nombran a las PARTES, no la conducta:
 * "Demanda de X contra Y". Buscar "colusión" sobre el título no encuentra nada,
 * aunque el tribunal haya clasificado el fallo justamente como colusión. La
 * materia vive en estas taxonomías, y sin ellas la herramienta parecería decir
 * que no hay jurisprudencia de colusión, que es exactamente el error que no se
 * puede cometer.
 */
async function terminos(taxonomia) {
  if (!taxonomia) return new Map();
  return conCache(`tdlc:tax:${taxonomia}`, 604800, async () => {
    const salida = [];
    for (let pagina = 1; pagina <= 5; pagina++) {
      const r = await pedir(`${BASE}/${taxonomia}?per_page=100&page=${pagina}&_fields=id,name`, {
        headers: { Accept: 'application/json' },
        timeoutMs: 30000,
        intentos: 2,
      });
      if (!r.ok) break;
      const j = JSON.parse(r.texto);
      if (!Array.isArray(j) || !j.length) break;
      salida.push(...j.map((t) => [t.id, t.name]));
      if (j.length < 100) break;
    }
    return salida;
  }).then((pares) => new Map(pares));
}

/** El PDF vive en la ficha, no en la API. Se cachea largo: no cambia. */
async function pdfDeLaFicha(url) {
  if (!url) return null;
  return conCache(`tdlc:pdf:${url}`, 2592000, async () => {
    const r = await pedir(url, { headers: { Accept: 'text/html' }, timeoutMs: 30000, intentos: 2 });
    if (!r.ok) return null;
    const m = r.texto.match(/href="([^"]+\.pdf)"/i);
    return m ? m[1] : null;
  });
}

/** Trae el catálogo completo de una colección. Se cachea un día. */
async function catalogo(coleccion) {
  const col = COLECCIONES[coleccion];
  const [conductas, industrias] = await Promise.all([terminos(col.conducta), terminos(col.industria)]);
  return conCache(`tdlc:catalogo:${coleccion}`, 86400, async () => {
    const items = [];
    // De a 100, que es el máximo de la API. Tres peticiones para las sentencias.
    for (let pagina = 1; pagina <= 20; pagina++) {
      const campos = ['id', 'date', 'link', 'title', col.conducta, col.industria].filter(Boolean).join(',');
      const url = `${BASE}/${col.ruta}?per_page=100&page=${pagina}&orderby=date&order=desc&_fields=${campos}`;
      const r = await pedir(url, { headers: { Accept: 'application/json' }, timeoutMs: 45000, intentos: 2 });
      if (!r.ok) {
        if (items.length) break; // Se acabaron las páginas.
        throw new Error(`El sitio del TDLC respondió HTTP ${r.status} al pedir ${col.ruta}.`);
      }
      let j;
      try {
        j = JSON.parse(r.texto);
      } catch {
        throw new Error('El TDLC no devolvió JSON: su sitio pudo cambiar de estructura.');
      }
      if (!Array.isArray(j)) throw new Error('El TDLC devolvió algo que no es una lista: su API cambió.');
      items.push(...j.map((x) => normalizar(x, col, conductas, industrias)));
      if (j.length < 100) break;
    }
    if (!items.length) throw new Error(`El TDLC devolvió el catálogo de ${col.ruta} vacío.`);
    return items;
  });
}

/**
 * El título del TDLC es un resumen del fallo, no un rótulo: dice quién demandó
 * a quién y qué se resolvió. Se separa el número del resumen para que la cita
 * salga limpia y el resumen se pueda leer solo.
 */
function normalizar(x, col, conductas, industrias) {
  const nombresDe = (ids, dic) =>
    (Array.isArray(ids) ? ids : []).map((id) => dic.get(id)).filter(Boolean);
  const titulo = aTextoPlano(x.title?.rendered ?? '').trim();
  const m = titulo.match(/^((?:Sentencia|Resoluci[óo]n|Dictamen)\s*N[°º]?\s*[\d./-]+)\s*:?\s*(.*)$/i);
  return {
    identificador: m ? m[1].replace(/\s+/g, ' ') : null,
    resumen: m ? m[2].trim() : titulo,
    fecha: String(x.date ?? '').slice(0, 10),
    // Clasificación del propio tribunal: es donde vive la materia.
    conducta: nombresDe(x[col.conducta], conductas),
    industria: nombresDe(x[col.industria], industrias),
    url: x.link ?? null,
  };
}

/**
 * Cómo lo dice un abogado, y cómo lo clasifica el TDLC.
 *
 * El tribunal no usa la palabra "colusión" en ninguna parte: sus 37 fallos de
 * carteles están clasificados como "Acuerdo o práctica concertada". Sin esta
 * traducción, la consulta más obvia de la materia devolvía cero, que es lo peor
 * que puede hacer: parecería que no hay jurisprudencia de colusión en Chile.
 *
 * Se agrega la forma del tribunal a la consulta en vez de reemplazarla, para
 * que quien busque por el nombre técnico siga encontrando lo suyo.
 */
const SINONIMOS = [
  [/colusi[oó]n|cartel|carteles/i, 'acuerdo o practica concertada'],
  [/fusi[oó]n|adquisici[oó]n de empresa|concentraci[oó]n/i, 'operacion de concentracion'],
  [/precios? predatorios?|predaci[oó]n/i, 'practica predatoria'],
  [/estrangulamiento de m[aá]rgenes|precios? abusivos?/i, 'abuso de posicion dominante'],
  [/reparto de mercado|fijaci[oó]n de precios/i, 'acuerdo o practica concertada'],
];

/** Traduce la consulta al vocabulario del tribunal, sin perder la original. */
function conVocabulario(consulta) {
  const extras = SINONIMOS.filter(([re]) => re.test(consulta)).map(([, t]) => t);
  return { extras, hubo: extras.length > 0 };
}

const sinTildes = (t) =>
  String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Puntúa por cuántos términos de la consulta aparecen en el resumen.
 *
 * Se exige que estén TODOS los términos con contenido: en libre competencia la
 * diferencia entre "abuso de posición dominante" y cualquier fallo que mencione
 * "abuso" es justamente el resto de la frase.
 */
function puntuar(item, palabras) {
  const heno = sinTildes(
    [item.identificador, item.resumen, ...(item.conducta ?? []), ...(item.industria ?? [])].filter(Boolean).join(' '),
  );
  let puntos = 0;
  for (const t of palabras) {
    if (!heno.includes(t)) return 0;
    puntos += 1;
    // La frase exacta vale más que las palabras sueltas.
    if (heno.includes(palabras.join(' '))) puntos += 0.5;
  }
  return puntos;
}

/**
 * Busca en la jurisprudencia de libre competencia.
 *
 * @param {object} p
 * @param {string} p.consulta términos a buscar
 * @param {'sentencias'|'resoluciones'|'dictamenes'} [p.coleccion] default sentencias
 * @param {number} [p.limite] 1..20
 * @param {string} [p.desde] año mínimo, p.ej. "2015"
 */
export async function buscarCompetencia({ consulta, coleccion = 'sentencias', limite = 5, desde } = {}) {
  if (!String(consulta ?? '').trim()) {
    throw new Error(
      'Falta la consulta. Indica los términos a buscar, como los usaría el propio tribunal: ' +
        '"colusión", "abuso de posición dominante", "operación de concentración", "competencia desleal".',
    );
  }
  const col = COLECCIONES[coleccion];
  if (!col) {
    throw new Error(`Colección desconocida: "${coleccion}". Opciones: ${Object.keys(COLECCIONES).join(', ')}.`);
  }
  const n = Math.min(Math.max(Number(limite) || 5, 1), 20);

  const todos = await catalogo(coleccion);
  const palabras = sinTildes(consulta).split(/\s+/).filter((t) => t.length >= 3);
  if (!palabras.length) {
    throw new Error('La consulta no tiene ninguna palabra buscable. Usa términos de al menos tres letras.');
  }

  const enFecha = todos.filter((x) => !desde || (x.fecha && x.fecha.slice(0, 4) >= String(desde)));
  const ordenar = (lista) =>
    lista
      .filter((c) => c.puntos > 0)
      // A igual pertinencia, primero lo más reciente.
      .sort((a, b) => b.puntos - a.puntos || String(b.x.fecha).localeCompare(String(a.x.fecha)));

  let candidatos = ordenar(enFecha.map((x) => ({ x, puntos: puntuar(x, palabras) })));

  // Si la consulta literal no encuentra nada, se reintenta con el vocabulario
  // del propio tribunal. "Colusión" no existe para el TDLC: son "acuerdos o
  // prácticas concertadas".
  const { extras, hubo } = conVocabulario(consulta);
  let traducida = null;
  if (!candidatos.length && hubo) {
    for (const alterna of extras) {
      const otras = sinTildes(alterna).split(/\s+/).filter((t) => t.length >= 3);
      // La traducción SUMA, no reemplaza: "cartel de las farmacias" tiene que
      // seguir prefiriendo los fallos de farmacias entre los de colusión, y no
      // devolver los mismos que "colusión" a secas.
      const restantes = palabras.filter((w) => !otras.includes(w));
      const intento = ordenar(
        enFecha.map((x) => {
          const base = puntuar(x, otras);
          if (!base) return { x, puntos: 0 };
          const heno = sinTildes(
            [x.identificador, x.resumen, ...(x.conducta ?? []), ...(x.industria ?? [])].filter(Boolean).join(' '),
          );
          const extra = restantes.filter((w) => heno.includes(w)).length;
          return { x, puntos: base + extra * 2 };
        }),
      );
      if (intento.length) {
        candidatos = intento;
        traducida = alterna;
        break;
      }
    }
  }

  const resultados = [];
  for (const { x } of candidatos.slice(0, n)) {
    resultados.push({ ...x, tipo: col.nombre, pdf: await pdfDeLaFicha(x.url) });
  }

  return {
    tribunal: 'Tribunal de Defensa de la Libre Competencia',
    coleccion,
    que_es: col.que_es,
    total: candidatos.length,
    revisados: todos.length,
    mostrados: resultados.length,
    ...(traducida
      ? {
          nota_busqueda:
            `El TDLC no usa ese término: clasifica esta materia como "${traducida}", y por ahí se buscó. ` +
            'Dilo al presentar los resultados.',
        }
      : {}),
    resultados,
    ...(resultados.length === 0
      ? {
          sin_datos: true,
          sugerencia:
            `Ninguno de los ${todos.length} documentos de esta colección menciona todos esos términos. ` +
            'Prueba con menos palabras, o con una de las conductas que el propio tribunal usa para ' +
            'clasificar (van en `conductas_del_tribunal`). También puedes cambiar de colección: las ' +
            'resoluciones resuelven consultas y operaciones de concentración, y los dictámenes son ' +
            'anteriores a 2004.',
          // Que se vea el vocabulario real evita el segundo intento a ciegas.
          conductas_del_tribunal: [...new Set(todos.flatMap((x) => x.conducta ?? []))]
            .sort()
            .slice(0, 25),
        }
      : {}),
    como_citar:
      'Se cita por su identificador: "TDLC, Sentencia N° 216/2026". El `resumen` es el que publica el ' +
      'propio tribunal y dice qué se resolvió.',
    advertencia:
      'El texto del fallo NO viene en esta respuesta: el TDLC sólo lo publica en PDF. Para citar un ' +
      'considerando hay que abrir el `pdf`. No atribuyas al fallo nada que no esté en el `resumen`.',
  };
}

/** Chequeo de salud: que la API siga en pie y devolviendo lo esperado. */
export async function saludCompetencia() {
  const r = await buscarCompetencia({ consulta: 'colusión', limite: 1 });
  if (!r.resultados.length) throw new Error('El TDLC no devolvió sentencias para una consulta que siempre tiene.');
  return `${r.total} sentencias sobre colusión; la más reciente ${r.resultados[0].identificador ?? '(sin número)'}`;
}
