/**
 * Contraloría General de la República — jurisprudencia administrativa (dictámenes).
 *
 * La base es una aplicación Lotus Domino. Pese a que el formulario declara
 * method="post", el botón Buscar arma una URL y navega: el POST devuelve
 * "Form processed" y nada más. La consulta real es GET sobre
 * `FormConsultaWeb2k?OpenForm&...&hpbb=SI` (verificado 15-ago-2026).
 *
 * El detalle trae algo que no da ningún otro buscador chileno: el ESTADO del
 * dictamen (si fue reconsiderado, aclarado, confirmado, complementado). Un
 * dictamen reconsiderado ya no sirve para fundar nada, así que ese dato es
 * tanto o más importante que el texto.
 */
import { pedir, aTextoPlano } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://www.contraloria.cl/appinf/LegisJuri/DictamenesGeneralesMunicipales.nsf/';

/** Domino responde en Latin-1; sin esto los acentos llegan rotos. */
async function pedirLatin1(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: BASE,
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  let texto = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  // Si aparecen caracteres de reemplazo, era Latin-1.
  if (texto.includes('�')) texto = new TextDecoder('latin1').decode(buf);
  return { ok: res.ok, status: res.status, texto };
}

const campo = (html, etiqueta) => {
  const re = new RegExp(`${etiqueta}[\\s\\S]{0,400}?<td[^>]*>([\\s\\S]*?)</td>`, 'i');
  return aTextoPlano(html.match(re)?.[1] ?? '');
};

/**
 * Busca dictámenes de la CGR.
 * @param {object} p
 * @param {string} [p.texto] texto libre
 * @param {string} [p.numero] número de dictamen
 * @param {'Cualquiera'|'Generales'|'Municipales'} [p.materia]
 * @param {string} [p.desde] DD/MM/AAAA
 * @param {string} [p.hasta] DD/MM/AAAA
 * @param {number} [p.limite] 1..100
 */
export async function buscarDictamenes(p = {}) {
  const limite = Math.min(Math.max(p.limite ?? 10, 1), 100);
  const clave = `cgr:buscar:${JSON.stringify(p)}`;

  return conCache(clave, 86400, async () => {
    const q =
      `FormConsultaWeb2k?OpenForm` +
      `&TextoLibre=${encodeURIComponent(p.texto ?? '')}` +
      `&NumeroDictamen=${encodeURIComponent(p.numero ?? '')}` +
      `&Materia=${encodeURIComponent(p.materia ?? 'Cualquiera')}` +
      `&FechaDesde=${encodeURIComponent(p.desde ?? '')}` +
      `&FechaHasta=${encodeURIComponent(p.hasta ?? '')}` +
      `&desde=1&dpp=&porPagina=${limite}&Orden=1&hpbb=SI`;

    const res = await pedirLatin1(BASE + q);
    if (!res.ok) throw new Error(`Contraloría respondió HTTP ${res.status}`);
    const html = res.texto;

    const total = Number((html.match(/Se han encontrado\s*([\d.]+)\s*dict/i)?.[1] ?? '0').replace(/\./g, ''));

    // Cada fila: <tr id="UNID"> nº | fecha | <a>identificador</a> | descriptores
    const resultados = [];
    const re = /<tr id="([0-9A-F]{32})"[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = re.exec(html)) && resultados.length < limite) {
      const unid = m[1];
      const celdas = [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => aTextoPlano(c[1]));
      if (celdas.length < 4) continue;
      resultados.push({
        unid,
        fecha: celdas[1],
        numero: celdas[2],
        descriptores: celdas[3],
        url: `${BASE}cgrDetalleDictamenNVDA?OpenForm&UNID=${unid}`,
      });
    }

    return {
      total,
      mostrados: resultados.length,
      resultados,
      como_verificar: 'Base de Dictámenes de la Contraloría General de la República: https://www.contraloria.cl/web/cgr/buscar-jurisprudencia',
    };
  });
}

/** Detalle completo de un dictamen, incluido su estado y sus fuentes legales. */
export async function verDictamen(unid, { textoCompleto = true } = {}) {
  // El UNID de Domino son 32 caracteres hexadecimales. Con cualquier otra cosa
  // la Contraloría devuelve una página genérica cuyo texto se colaba como si
  // fuera la materia de un dictamen real, con vigente_aparente en true.
  if (!/^[0-9A-F]{32}$/i.test(String(unid ?? '').trim())) {
    throw new Error(
      `"${unid}" no es un identificador de dictamen válido (deben ser 32 caracteres hexadecimales). ` +
        'Tómalo del campo `unid` que entrega buscar_dictamenes.',
    );
  }

  return conCache(`cgr:dictamen:${unid}:${textoCompleto}`, 604800, async () => {
    const res = await pedirLatin1(`${BASE}cgrDetalleDictamenNVDA?OpenForm&UNID=${unid}`);
    if (!res.ok) throw new Error(`Contraloría respondió HTTP ${res.status} para el dictamen ${unid}`);
    const html = res.texto;

    // El estado dice si el criterio sigue vigente. Un dictamen reconsiderado no
    // sirve para fundar: por eso se devuelve siempre, no como dato opcional.
    const estado = {};
    for (const e of ['Nuevo', 'Reactivado', 'Alterado', 'Aclarado', 'Aplicado', 'Complementado', 'Confirmado', 'Reconsiderado']) {
      const v = campo(html, e === 'Nuevo' ? 'N u e vo' : e);
      if (v) estado[e.toLowerCase()] = /^SI$/i.test(v.trim());
    }

    const plano = aTextoPlano(html.replace(/<script[\s\S]*?<\/script>/gi, ' '));
    const entre = (a, b) => {
      const i = plano.indexOf(a);
      if (i < 0) return '';
      const j = b ? plano.indexOf(b, i + a.length) : -1;
      return plano.slice(i + a.length, j > 0 ? j : i + a.length + 1500).trim();
    };

    let texto = '';
    if (textoCompleto) {
      const r = await pedirLatin1(`${BASE}CompletoDictamenJSON?OpenAgent&unid=${unid}`);
      try {
        texto = aTextoPlano(JSON.parse(r.texto).textocompleto ?? '');
      } catch {
        texto = '';
      }
    }

    return {
      unid,
      numero: campo(html, 'Número Dictamen') || entre('Número Dictamen', 'Fecha'),
      fecha: entre('Fecha', 'Carácter'),
      estado,
      vigente_aparente: !estado.reconsiderado,
      descriptores: entre('DESCRIPTORES', 'DICTAMENES RELACIONADOS'),
      dictamenes_relacionados: entre('DICTAMENES RELACIONADOS', 'FUENTES LEGALES'),
      fuentes_legales: entre('FUENTES LEGALES', 'MATERIA'),
      materia: entre('MATERIA', 'DOCUMENTO COMPLETO'),
      texto,
      url: `${BASE}cgrDetalleDictamenNVDA?OpenForm&UNID=${unid}`,
      advertencia: estado.reconsiderado
        ? 'Este dictamen figura como RECONSIDERADO: su criterio pudo ser reemplazado. Verificar el dictamen posterior antes de citarlo.'
        : undefined,
    };
  });
}
