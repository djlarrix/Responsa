/**
 * Tribunal Constitucional — buscador de jurisprudencia.
 *
 * El buscador público (buscador.tcchile.cl) es una SPA que consume
 * `buscador-backend.tcchile.cl`, con un Paperless detrás para la búsqueda a
 * texto completo. Endpoints verificados el 15-ago-2026:
 *
 *   GET /api/extended/sentencias?page=N&filter={"search":…,"state":…,"dateRange":…}
 *   GET /api/extended/{id}/download        → PDF de la sentencia
 *   GET /api/buscadorexterno/ficha         → fichas de jurisprudencia analizada
 *
 * Ojo: el bundle del front expone una VITE_SECRET_KEY y un token de Paperless.
 * NO se usan aquí: son credenciales filtradas por descuido en un archivo
 * público, y los endpoints responden sin ellas.
 *
 * Lo que aporta frente al resto: `highlightParagraphs` devuelve los párrafos
 * exactos que coinciden con la consulta, no sólo el documento.
 */
import { pedir, aTextoPlano } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://buscador-backend.tcchile.cl/api';
const CABECERAS = {
  Accept: 'application/json',
  Origin: 'https://buscador.tcchile.cl',
  Referer: 'https://buscador.tcchile.cl/',
};

const filtro = (o) => encodeURIComponent(JSON.stringify(o));

/** Los custom_fields vienen por id; estos son los observados con valor útil. */
const CAMPOS = { 7: 'rol', 5: 'sumario', 4: 'requirente', 6: 'ministro' };

function campos(lista) {
  const out = {};
  for (const c of lista ?? []) {
    const nombre = CAMPOS[c.field];
    if (!nombre) continue;
    const v = String(c.value ?? '').trim();
    if (v && v !== 'nan' && !out[nombre]) out[nombre] = v;
  }
  return out;
}

/**
 * Los PDF del TC llevan folio impreso ("8 0000018 DIEZ Y OCHO"), y el OCR lo
 * arrastra al fragmento. Sin limpiarlo, el pasaje citado empieza con ruido.
 */
function limpiarFolio(t) {
  return t
    // "8 0000018 DIEZ Y OCHO determinado sector…" → el folio va en cifras, en
    // ceros a la izquierda y deletreado en mayúsculas antes del texto real.
    .replace(/^\s*\d{1,4}\s+\d{4,8}\s+(?:[A-ZÁÉÍÓÚÑ]+\s+){1,10}(?=[a-záéíóúñ])/u, '')
    .replace(/^\s*\d{4,8}\s+(?:[A-ZÁÉÍÓÚÑ]+\s+){1,10}(?=[a-záéíóúñ])/u, '')
    .replace(/\s*\b0{3,}\d+\b\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizar(s) {
  const extra = campos(s.custom_fields);
  const parrafos = (s.highlightParagraphs ?? [])
    .map((p) => limpiarFolio(aTextoPlano(p.full ?? p.summary ?? '')))
    .filter((t) => t.length > 15);
  return {
    id: s.id,
    rol: s.rol ? `${s.rol}` : (extra.rol ?? ''),
    tribunal: 'Tribunal Constitucional',
    competencia: s.competencia ?? '',
    sigla: s.competenciaShortName ?? '',
    sumario: extra.sumario ?? '',
    reservada: s.es_reservada === 1,
    // Los párrafos que efectivamente coinciden con la consulta: es lo que
    // permite citar el pasaje pertinente y no "la sentencia habla del tema".
    parrafos_coincidentes: parrafos.slice(0, 8),
    coincidencias: s.highlightParagraphsAmount ?? parrafos.length,
    texto: aTextoPlano(s.content ?? ''),
    pdf: `${BASE}/extended/${s.id}/download`,
    url: `https://buscador.tcchile.cl/#/sentencia/${s.id}`,
  };
}

/**
 * Busca sentencias del Tribunal Constitucional a texto completo.
 * @param {object} p
 * @param {string} p.consulta
 * @param {number} [p.pagina] 1-based
 * @param {string} [p.desde] YYYY-MM-DD
 * @param {string} [p.hasta] YYYY-MM-DD
 * @param {boolean} [p.textoCompleto]
 */
export async function buscarSentenciasTC({ consulta, pagina = 1, desde, hasta, textoCompleto = false }) {
  if (!consulta?.trim()) throw new Error('Falta la consulta.');

  const rango = desde || hasta ? { from: desde ?? null, to: hasta ?? null } : null;
  const clave = `tc:buscar:${consulta}:${pagina}:${desde ?? ''}:${hasta ?? ''}`;

  return conCache(clave, 86400, async () => {
    const url = `${BASE}/extended/sentencias?page=${pagina}&filter=${filtro({ search: consulta, state: null, dateRange: rango })}`;
    const res = await pedir(url, { headers: CABECERAS, timeoutMs: 45000 });
    if (!res.ok) throw new Error(`El buscador del Tribunal Constitucional respondió HTTP ${res.status}. ${res.texto.slice(0, 200)}`);

    let j;
    try {
      j = JSON.parse(res.texto);
    } catch {
      throw new Error('El Tribunal Constitucional no devolvió JSON: su buscador pudo cambiar.');
    }
    if (j.status === 'error') throw new Error(`El Tribunal Constitucional rechazó la consulta: ${j.message}`);
    if (!j.data) throw new Error('El Tribunal Constitucional devolvió una respuesta sin `data`: su buscador cambió.');

    const resultados = (j.data.results ?? []).map(normalizar);
    // Las sentencias del TC son PDF completos: cinco llegaban a ~72.000 tokens.
  // Los párrafos coincidentes son lo que sirve para citar; el resto se pide
  // aparte cuando hace falta.
  if (textoCompleto !== true) {
    for (const r of resultados) {
      if (r.texto.length > 1200) {
        r.texto = r.texto.slice(0, 1200) + '…';
        r.texto_recortado = true;
      }
    }
  }

    return {
      total: j.data.count ?? 0,
      pagina,
      mostrados: resultados.length,
      paginas: j.meta?.last_page ?? null,
      tribunal: 'Tribunal Constitucional',
      resultados,
      como_verificar: 'Cada sentencia trae `pdf` (descarga directa del fallo) y `url` al buscador del TC: https://buscador.tcchile.cl',
    };
  });
}

/**
 * Fichas de jurisprudencia analizada del TC: resúmenes con metadatos
 * elaborados por el propio tribunal.
 */
export async function buscarFichasTC({ consulta, pagina = 1 }) {
  if (!consulta?.trim()) throw new Error('Falta la consulta.');
  return conCache(`tc:ficha:${consulta}:${pagina}`, 86400, async () => {
    const url = `${BASE}/buscadorexterno/ficha?page=${pagina}&filter=${filtro({ keyword: '', query: consulta, state: null, dateRange: null, category: null })}`;
    const res = await pedir(url, { headers: CABECERAS, timeoutMs: 45000 });
    if (!res.ok) throw new Error(`Las fichas del Tribunal Constitucional respondieron HTTP ${res.status}`);
    const j = JSON.parse(res.texto);

    const resultados = (j.data ?? []).map((f) => ({
      id: f.id,
      rol: f.folio ?? '',
      tribunal: 'Tribunal Constitucional',
      tipo: f.template?.complete_name ?? f.nombre ?? '',
      fecha: String(f.fecha_sentencia ?? '').slice(0, 10),
      estado: f.estado?.nombre ?? '',
      reservada: !!f.es_reservada,
      detalle: (f.detalle ?? [])
        .map((d) => aTextoPlano(d.valor ?? ''))
        .filter((v) => v && v !== 'nan')
        .slice(0, 6),
      url: `https://buscador.tcchile.cl/#/ficha/${f.id}`,
    }));

    return {
      total: j.meta?.total ?? resultados.length,
      pagina,
      mostrados: resultados.length,
      resultados,
      como_verificar: 'Fichas de jurisprudencia del Tribunal Constitucional: https://buscador.tcchile.cl',
    };
  });
}
