/**
 * Dictámenes de la Dirección del Trabajo.
 *
 * El buscador oficial (`w3-search.php`) está caído: cuelga la conexión tanto
 * desde Node y curl como desde un navegador real, así que no es un bloqueo
 * antibot sino un endpoint roto. Lo que sí responde son las portadillas de
 * listado, y ahí está todo lo necesario.
 *
 * Estructura descubierta (verificada 15-ago-2026): los dictámenes se agrupan
 * por año, y los doce meses de un año son los `propertyvalue` CORRELATIVOS al
 * del año (año 2024 = 188794 → enero 188795 … diciembre 188806). Cada entrada
 * del listado trae número, fecha ISO, sumario completo en el atributo `title`
 * y un epígrafe con los descriptores temáticos.
 *
 * Con eso se arma un índice propio y se busca en local, que es lo que el
 * buscador oficial debería hacer y no hace. Cada mes queda cacheado 7 días.
 */
import { pedir } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://www.dt.gob.cl/legislacion/1624/';

/** propertyvalue del año → los meses son ese id + 1..12. Verificados en el sitio. */
export const ANIOS = {
  2026: 193891, 2025: 191853, 2024: 188794, 2023: 184682, 2022: 182142,
  2021: 179229, 2020: 176961, 2019: 172974, 2018: 166905, 2017: 161037,
  2016: 157851, 2015: 82250, 2014: 82237, 2013: 81431, 2012: 28505,
  2011: 28492, 2010: 27422, 2009: 27409, 2008: 27205, 2007: 26882,
  2006: 25598, 2005: 23874,
};

const decodificar = (s) =>
  String(s ?? '')
    .replace(/&#xA;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parsearMes(html) {
  const out = [];
  const re =
    /<p class="titulo aid-(\d+)[^"]*"><a href="(w3-article-\d+\.html)" title="([^"]*)"[^>]*>([^<]*)<\/a><\/p>\s*<p class="fecha[^"]*iso8601-(\d{8})[^"]*">[^<]*<\/p>\s*(?:<p class="epigrafe[^"]*">([^<]*)<\/p>)?/gi;
  let m;
  while ((m = re.exec(html))) {
    out.push({
      id: m[1],
      numero: decodificar(m[4]),
      fecha: `${m[5].slice(0, 4)}-${m[5].slice(4, 6)}-${m[5].slice(6, 8)}`,
      sumario: decodificar(m[3]),
      epigrafe: decodificar(m[6] ?? ''),
      url: BASE + m[2],
    });
  }
  return out;
}

/** Índice de un año completo (12 portadillas mensuales). Cacheado 7 días. */
async function indiceAnio(anio) {
  const pv = ANIOS[anio];
  if (!pv) throw new Error(`Sin datos para ${anio}. Años disponibles: ${Object.keys(ANIOS).join(', ')}`);

  return conCache(`dt:anio:${anio}`, 604800, async () => {
    const meses = await Promise.all(
      Array.from({ length: 12 }, (_, k) =>
        pedir(`${BASE}w3-propertyvalue-${pv + k + 1}.html`, { headers: { Accept: 'text/html' }, timeoutMs: 40000, intentos: 3 })
          .then((r) => ({ ok: r.ok, filas: r.ok ? parsearMes(r.texto) : [] }))
          .catch(() => ({ ok: false, filas: [] })),
      ),
    );

    // El mapa año→portadilla se dedujo de la numeración correlativa del sitio,
    // y en algunos años (2012, 2013) la portadilla mezcla documentos de otro.
    // Filtrar por la fecha real de cada dictamen hace que un id equivocado
    // produzca un año incompleto, nunca un dictamen atribuido al año que no es.
    const crudos = meses.flatMap((m) => m.filas);
    const todos = crudos.filter((d) => d.fecha.startsWith(String(anio)));
    const respondieron = meses.filter((m) => m.ok).length;

    // Un año sin ninguna portadilla que responda no es "un año sin dictámenes":
    // es una falla. Devolver [] en silencio haría leer el vacío como ausencia.
    if (!respondieron) {
      throw new Error(`Ninguna portadilla de ${anio} respondió en dt.gob.cl. Puede ser una caída del sitio; reintenta.`);
    }
    if (!todos.length) {
      throw new Error(
        crudos.length
          ? `Las portadillas de ${anio} sólo trajeron documentos de otros años: el mapa año→portadilla de la Dirección del Trabajo cambió.`
          : `Las portadillas de ${anio} respondieron pero sin dictámenes: la Dirección del Trabajo cambió su plantilla.`,
      );
    }
    return todos;
  });
}

const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const VACIAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'en', 'y', 'o', 'a', 'un', 'una', 'por', 'para', 'con', 'sin', 'sobre', 'que', 'al', 'su', 'sus']);

/**
 * Busca dictámenes de la Dirección del Trabajo por texto.
 * @param {object} p
 * @param {string} p.consulta
 * @param {number} [p.desdeAnio] default: los últimos 3 años con datos
 * @param {number} [p.hastaAnio]
 * @param {number} [p.limite] default 10
 */
export async function buscarDictamenesDT({ consulta, desdeAnio, hastaAnio, limite = 10 }) {
  if (!consulta?.trim()) throw new Error('Falta la consulta.');

  const disponibles = Object.keys(ANIOS).map(Number).sort((a, b) => b - a);
  const hasta = hastaAnio ?? disponibles[0];
  const desde = desdeAnio ?? hasta - 2;
  const anios = disponibles.filter((a) => a >= desde && a <= hasta);
  if (!anios.length) throw new Error(`Sin años en el rango ${desde}-${hasta}. Disponibles: ${disponibles.join(', ')}`);

  const porAnio = await Promise.all(
    anios.map((a) => indiceAnio(a).then((filas) => ({ anio: a, filas })).catch((e) => ({ anio: a, filas: [], error: e.message }))),
  );
  const corpus = porAnio.flatMap((r) => r.filas);
  const fallidos = porAnio.filter((r) => r.error);

  // Si TODOS los años fallaron, es una caída, no una ausencia de dictámenes.
  if (!corpus.length && fallidos.length === anios.length) {
    throw new Error(`No se pudo construir el índice de la Dirección del Trabajo. ${fallidos[0].error}`);
  }

  const limpia = sinTildes(consulta);
  const terminos = [...new Set(limpia.split(/[^a-z0-9ñ°]+/).filter((t) => t.length > 2 && !VACIAS.has(t)))];
  // Pares consecutivos: "fuero maternal" debe pesar más que "fuero" y "maternal"
  // sueltos, si no un dictamen que menciona ambos por separado gana al que trata
  // exactamente la figura.
  const pares = terminos.slice(0, -1).map((t, i) => `${t} ${terminos[i + 1]}`);

  const puntuados = corpus
    .map((d) => {
      const heno = sinTildes(`${d.sumario} ${d.epigrafe} ${d.numero}`);
      const epi = sinTildes(d.epigrafe);
      // La DT ordena los descriptores por importancia: el primero es la materia
      // principal. Sin esto, un dictamen de epígrafe largo que roza el tema le
      // gana al que trata exactamente la figura consultada.
      const principal = sinTildes(d.epigrafe.split(';')[0] ?? '');

      let rel = terminos.filter((t) => heno.includes(t)).length + terminos.filter((t) => epi.includes(t)).length;
      rel += terminos.filter((t) => principal.includes(t)).length * 3;
      rel += pares.filter((par) => heno.includes(par)).length * 3;
      if (principal.includes(limpia) || pares.some((par) => principal.includes(par))) rel += 6;
      if (heno.includes(limpia)) rel += 5;

      // Penaliza epígrafes que abarcan muchas materias: son menos específicos.
      const materias = (d.epigrafe.match(/;/g) ?? []).length + 1;
      return { ...d, _rel: rel / (1 + Math.log2(Math.max(materias, 1))) };
    })
    .filter((d) => d._rel > 0)
    .sort((a, b) => b._rel - a._rel || b.fecha.localeCompare(a.fecha));

  const resultados = puntuados.slice(0, limite).map(({ _rel, ...d }) => ({
    ...d,
    organismo: 'Dirección del Trabajo',
  }));

  return {
    consulta,
    anios_consultados: anios,
    total_indexado: corpus.length,
    encontrados: resultados.length,
    resultados,
    fuente: `${BASE}w3-propertyvalue-22762.html`,
    ...(fallidos.length
      ? { advertencia: `No se pudo indexar ${fallidos.map((f) => f.anio).join(', ')}. Los resultados están incompletos.` }
      : {}),
    nota:
      'Índice construido desde las portadillas oficiales de la Dirección del Trabajo. ' +
      'Su buscador propio (w3-search.php) está caído, por eso la búsqueda se hace sobre este índice. ' +
      'El texto íntegro de cada dictamen está en su `url`.',
    ...(resultados.length
      ? {}
      : { sugerencia: `Sin coincidencias en ${anios.join(', ')}. Prueba términos más generales o amplía con \`desde_anio\` (hay datos desde 2005).` }),
  };
}

/** Texto completo de un dictamen concreto. */
export async function verDictamenDT(id) {
  const limpio = String(id).replace(/\D/g, '');
  if (!limpio) throw new Error('Indica el id numérico del dictamen (viene en los resultados de búsqueda).');

  return conCache(`dt:dictamen:${limpio}`, 604800, async () => {
    const url = `${BASE}w3-article-${limpio}.html`;
    const res = await pedir(url, { headers: { Accept: 'text/html' }, timeoutMs: 40000 });
    if (!res.ok) throw new Error(`La Dirección del Trabajo respondió HTTP ${res.status} para el dictamen ${limpio}`);

    const h = res.texto;

    // El cuerpo del dictamen vive en este contenedor; sin acotarlo, el texto
    // sale con todo el menú del sitio pegado adelante.
    const inicio = h.indexOf('article_i__w3_ar_ArticuloCompleto_cuerpo_1');
    if (inicio < 0) {
      throw new Error(
        `No se encontró el cuerpo del dictamen ${limpio} en la página de la Dirección del Trabajo: ` +
          'pudo cambiar su plantilla. El texto está igualmente en ' + url,
      );
    }
    const bloque = h.slice(h.indexOf('>', inicio) + 1, h.indexOf('<!--end-box--', inicio));

    const texto = decodificar(
      bloque
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '),
    ).replace(/ ?\n ?/g, '\n');

    // La DT usa dos plantillas de cabecera según la época del dictamen:
    //   "ORDINARIO Nº 348 / ACTUACIÓN: / MATERIA: / RESUMEN:"  (reciente)
    //   "ORD.: 653 / MAT.: / RORD.:"                            (abreviada)
    // Se aceptan ambas para no perder la mitad del corpus.
    const CORTES = /ACTUACI[ÓO]N\.?:|MATERIA\.?:|MAT\.?:|RESUMEN\.?:|RORD\.?:|ANTECEDENTES\.?:|ANTS\.?:|FUENTES\.?:|Mediante presentaci/i;

    const entre = (etiqueta) => {
      const m = texto.match(etiqueta);
      if (!m) return '';
      const resto = texto.slice(m.index + m[0].length);
      const j = resto.search(CORTES);
      return (j > 0 ? resto.slice(0, j) : resto).trim();
    };

    // El número SÓLO se lee de la cabecera, o sea de lo que va antes de la
    // primera etiqueta del formulario. Buscarlo en todo el texto hacía que
    // apareciera el de un dictamen citado en el cuerpo: para ORD.N°095
    // devolvía "888" y para ORD.N°108 devolvía "45". Un número de dictamen
    // equivocado en una cita es precisamente lo que esta herramienta existe
    // para evitar, así que ante la duda no se devuelve ninguno.
    const finCabecera = texto.search(CORTES);
    const cabecera = texto.slice(0, finCabecera > 0 ? finCabecera : 500);

    // Acepta "ORD. N°88", "ORDINARIO N º : 04", "ORDINARIO Nº: 108", "ORD.: 653".
    const mNumero = cabecera.match(/\bORD(?:INARIO)?\s*\.?\s*:?\s*N?\s*[º°]?\s*:?\s*(\d{1,5}(?:\s*[/\-]\s*\d+)?)/i);
    const numero = mNumero ? mNumero[1].replace(/\s+/g, '') : '';

    const materia = entre(/(?:MATERIA|MAT)\.?\s*:\s*/i);
    const resumen = entre(/(?:RESUMEN|RORD)\.?\s*:\s*/i);

    // Parte de los dictámenes se publica sin la cabecera de formulario: el
    // documento parte directo en la materia. Conviene decirlo en vez de
    // devolver campos vacíos que parezcan un error de lectura.
    const sinCabecera = !numero && !materia && !resumen;

    return {
      id: limpio,
      organismo: 'Dirección del Trabajo',
      numero,
      actuacion: entre(/ACTUACI[ÓO]N\.?\s*:\s*/i),
      materia,
      resumen,
      ...(numero
        ? {}
        : { nota_numero: 'Este documento no trae el número en su cabecera. Usa el `numero` que entregó la búsqueda, que viene del listado oficial de la Dirección del Trabajo.' }),
      ...(sinCabecera
        ? { nota_formato: 'El dictamen se publicó sin cabecera estructurada (sin MATERIA ni RESUMEN). El contenido íntegro está en `texto`.' }
        : {}),
      texto: texto.slice(0, 30000),
      url,
    };
  });
}
