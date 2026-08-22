/**
 * Carpeta de respaldo: deja en Descargas el documento fuente de cada cosa
 * que se citó, para que el abogado pueda comprobarla sin depender de esta
 * herramienta ni de que el sitio del organismo siga en pie.
 *
 * Dos formatos, según lo que publique cada fuente:
 *   - PDF cuando el organismo publica el documento (TC, CAM, doctrina abierta).
 *   - .docx generado desde el texto oficial cuando no hay PDF (PJUD, Dirección
 *     del Trabajo, Contraloría, Ley Chile). Cada uno lleva impresa la
 *     procedencia y el enlace, así que sigue siendo verificable.
 *
 * Nunca se guarda algo que no tenga origen público y citable: si un documento
 * no se puede traer, queda anotado en el índice como pendiente, con el motivo.
 * No se inventa el archivo ni se sustituye por un resumen.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { descargar } from '../lib/http.mjs';
import { crearDocx } from '../lib/docx.mjs';
import { verSentencia } from './pjud.mjs';
import { verDictamen } from './contraloria.mjs';
import { verDictamenDT } from './direcciontrabajo.mjs';
import { verNorma } from './leychile.mjs';

/** Windows y macOS usan "Downloads" en disco aunque la interfaz diga "Descargas". */
function carpetaDescargas() {
  if (process.env.RESPONSA_DESCARGAS) return process.env.RESPONSA_DESCARGAS;
  const casa = homedir();
  for (const n of ['Downloads', 'Descargas']) {
    const c = join(casa, n);
    if (existsSync(c)) return c;
  }
  return join(casa, 'Downloads');
}

/** Nombre de archivo seguro en Windows y macOS. */
function sanear(nombre, tope = 70) {
  return (
    String(nombre ?? '')
      .replace(/[<>:"/\\|?*]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/, '')
      .trim()
      .slice(0, tope) || 'documento'
  );
}

const hoy = () => new Date().toISOString().slice(0, 10);

/** Divide un texto largo en párrafos para el .docx. */
function aParrafos(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ texto: t, justificado: true }));
}

/** Encabezado común: de dónde salió el documento y cómo comprobarlo. */
function portada({ titulo, fuente, enlace, datos = [] }) {
  return [
    { texto: titulo, negrita: true, tamano: 14 },
    ...datos.filter(Boolean).map((d) => ({ texto: d })),
    { texto: `Fuente: ${fuente}`, cursiva: true, tamano: 9, color: '555555' },
    ...(enlace ? [{ texto: `Enlace: ${enlace}`, cursiva: true, tamano: 9, color: '555555' }] : []),
    {
      texto:
        'Documento reproducido desde la fuente oficial indicada. Recopilado con Responsa el ' +
        new Date().toLocaleDateString('es-CL') +
        '.',
      cursiva: true,
      tamano: 8,
      color: '777777',
    },
    { texto: '' },
  ];
}

/* -- Un documento por tipo -------------------------------------------- */

async function traerSentenciaPjud(d) {
  // Los resultados traen el rol como "61852-2024"; `verSentencia` lo pide partido.
  let { rol, era, tribunal = 'corte_suprema' } = d;
  if (!era && /^\s*\d+\s*-\s*\d{4}\s*$/.test(String(rol))) {
    [rol, era] = String(rol)
      .split('-')
      .map((x) => x.trim());
  }
  if (!rol || !era) throw new Error('Indica `rol` y `era` (o el rol completo "12345-2024").');

  // `verSentencia` devuelve el fallo aplanado en la raíz, no anidado.
  const f = await verSentencia({ rol, era, tribunal });
  if (!f?.encontrada) throw new Error(f?.mensaje ?? 'El fallo no se encontró en el buscador del PJUD.');
  return {
    nombre: sanear(`${f.tribunal} rol ${f.rol} (${f.fecha})`) + '.docx',
    enlace: f.url ?? f.url_corta ?? null,
    datos: crearDocx([
      ...portada({
        titulo: `${f.tribunal} - rol ${f.rol}`,
        fuente: 'Poder Judicial, Buscador Unificado de Jurisprudencia (juris.pjud.cl)',
        enlace: f.url ?? f.url_corta,
        datos: [
          f.caratulado && `Caratulado: ${f.caratulado}`,
          f.fecha && `Fecha: ${f.fecha}`,
          f.tipo_recurso && `Recurso: ${f.tipo_recurso}`,
          f.resultado && `Resultado: ${f.resultado}`,
          f.descriptores?.length && `Descriptores: ${f.descriptores.join('; ')}`,
        ],
      }),
      ...aParrafos(f.texto),
    ]),
  };
}

async function traerDictamenContraloria(d) {
  if (!d.unid) throw new Error('Indica el `unid` del dictamen (viene en los resultados de búsqueda).');
  const x = await verDictamen(d.unid);
  if (!x?.texto) throw new Error(`Contraloría no devolvió el texto del dictamen ${d.unid}.`);
  return {
    nombre: sanear(`Contraloria dictamen ${x.numero || d.unid}`) + '.docx',
    enlace: x.url ?? null,
    datos: crearDocx([
      ...portada({
        titulo: `Contraloría General de la República - Dictamen ${x.numero ?? ''}`.trim(),
        fuente: 'Contraloría General de la República, buscador de dictámenes',
        enlace: x.url,
        datos: [
          x.fecha && `Fecha: ${x.fecha}`,
          x.materia && `Materia: ${x.materia}`,
          x.descriptores && `Descriptores: ${x.descriptores}`,
          x.advertencia,
        ],
      }),
      ...aParrafos(x.texto),
    ]),
  };
}

async function traerDictamenDT(d) {
  if (!d.id) throw new Error('Indica el `id` del dictamen de la Dirección del Trabajo.');
  const x = await verDictamenDT(d.id);
  return {
    nombre: sanear(`DT dictamen ${x.numero || d.id}`) + '.docx',
    enlace: x.url ?? null,
    datos: crearDocx([
      ...portada({
        titulo: `Dirección del Trabajo - Dictamen ${x.numero ?? ''}`.trim(),
        fuente: 'Dirección del Trabajo, dictámenes y ordinarios',
        enlace: x.url,
        datos: [
          x.actuacion && `Actuación: ${x.actuacion}`,
          x.materia && `Materia: ${x.materia}`,
          x.resumen && `Resumen: ${x.resumen}`,
        ],
      }),
      ...aParrafos(x.texto),
    ]),
  };
}

async function traerNorma(d) {
  if (!d.idNorma) throw new Error('Indica el `idNorma` de Ley Chile.');
  const n = await verNorma(String(d.idNorma), d.articulo);
  // Los códigos vienen con el título del refundido completo (300+ caracteres);
  // `nombreComun` es "Código Civil", que es como se cita y como se rotula.
  const nombreNorma = n.nombreComun || n.titulo || `Norma ${d.idNorma}`;
  const cuerpo = d.articulo
    ? [{ texto: `Artículo ${d.articulo}`, negrita: true }, ...aParrafos(n.texto ?? '')]
    : n.indice_articulos
      ? [{ texto: `Índice de artículos: ${n.indice_articulos}` }]
      : [];
  return {
    nombre: sanear(`${nombreNorma} ${d.articulo ? 'art ' + d.articulo : ''}`) + '.docx',
    enlace: n.url ?? null,
    datos: crearDocx([
      ...portada({
        titulo: d.articulo ? `${nombreNorma}, artículo ${d.articulo}` : nombreNorma,
        fuente: 'Biblioteca del Congreso Nacional, Ley Chile',
        enlace: n.url ?? `https://www.bcn.cl/leychile/navegar?idNorma=${d.idNorma}`,
        datos: [
          n.organismo && `Organismo: ${n.organismo}`,
          n.publicacion && `Publicación: ${n.publicacion}`,
          n.derogada && 'ATENCIÓN: la norma figura DEROGADA.',
          n.derogado && `ATENCIÓN: el artículo ${d.articulo} figura DEROGADO.`,
        ],
      }),
      ...cuerpo,
    ]),
  };
}

/** PDF publicado por el organismo (TC, CAM, revista de acceso abierto). */
async function traerPdf(d, etiqueta) {
  const url = d.pdf || d.enlace_libre || d.url || d.enlace;
  if (!url) throw new Error(`Indica el enlace del ${etiqueta} (\`pdf\`, \`url\` o \`enlace_libre\`).`);
  const r = await descargar(url);
  if (!r.ok) throw new Error(`No se pudo descargar (${r.error}). Enlace: ${url}`);
  const esPdf = (r.tipo ?? '').includes('pdf') || r.datos.subarray(0, 4).toString('latin1') === '%PDF';
  if (!esPdf) {
    throw new Error(`El enlace no devolvió un PDF sino "${r.tipo || 'desconocido'}". Enlace: ${url}`);
  }
  return { nombre: sanear(d.titulo ?? etiqueta) + '.pdf', datos: r.datos, enlace: url };
}

const TRAEN = {
  sentencia_pjud: traerSentenciaPjud,
  sentencia_tc: (d) => traerPdf(d, 'fallo del Tribunal Constitucional'),
  laudo_cam: (d) => traerPdf(d, 'laudo del CAM'),
  doctrina: (d) => traerPdf(d, 'trabajo de doctrina'),
  dictamen_contraloria: traerDictamenContraloria,
  dictamen_dt: traerDictamenDT,
  norma: traerNorma,
};

export const TIPOS_DOCUMENTO = Object.keys(TRAEN);

/* -- Armado de la carpeta --------------------------------------------- */

/**
 * @param {object} p
 * @param {string} p.asunto rotula la carpeta
 * @param {Array<object>} p.documentos {tipo, titulo, ...identificadores}
 * @param {string} [p.consulta] la pregunta que originó la investigación
 */
export async function armarExpediente({ asunto, documentos, consulta }) {
  if (!asunto || !String(asunto).trim()) throw new Error('Indica el `asunto` para rotular la carpeta.');
  if (!Array.isArray(documentos) || documentos.length === 0) {
    throw new Error('Indica al menos un documento en `documentos`.');
  }
  if (documentos.length > 40) {
    throw new Error(
      `Son ${documentos.length} documentos: pide como máximo 40 por carpeta para no dejarla a medias.`,
    );
  }
  const desconocidos = [...new Set(documentos.map((d) => d?.tipo).filter((t) => !TRAEN[t]))];
  if (desconocidos.length) {
    throw new Error(
      `Tipo de documento no reconocido: ${desconocidos.join(', ')}. Opciones: ${TIPOS_DOCUMENTO.join(', ')}.`,
    );
  }

  const base = carpetaDescargas();
  let carpeta = join(base, sanear(`Responsa - ${asunto} - ${hoy()}`, 90));
  // Dos investigaciones del mismo asunto el mismo día no deben pisarse.
  if (existsSync(carpeta)) {
    for (let i = 2; i < 100; i++) {
      const alt = `${carpeta} (${i})`;
      if (!existsSync(alt)) {
        carpeta = alt;
        break;
      }
    }
  }
  await mkdir(carpeta, { recursive: true });

  // En serie a propósito: el control de ritmo por host ya limita, y una ráfaga
  // paralela contra la BCN o el PJUD termina en 429 y en carpeta incompleta.
  const guardados = [];
  const pendientes = [];
  let n = 0;
  for (const d of documentos) {
    n++;
    const rotulo = d.titulo || `${d.tipo} ${d.rol ?? d.id ?? d.unid ?? d.idNorma ?? ''}`.trim();
    try {
      const doc = await TRAEN[d.tipo](d);
      const nombre = `${String(n).padStart(2, '0')} - ${doc.nombre}`;
      await writeFile(join(carpeta, nombre), doc.datos);
      guardados.push({ archivo: nombre, titulo: rotulo, enlace: doc.enlace ?? null });
    } catch (e) {
      pendientes.push({ titulo: rotulo, motivo: String(e?.message ?? e) });
    }
  }

  // Índice: qué hay en la carpeta, de dónde salió cada cosa y qué faltó.
  const indice = [
    { texto: 'Respaldo de fuentes', negrita: true, tamano: 16 },
    { texto: asunto, tamano: 12 },
    ...(consulta ? [{ texto: `Consulta: ${consulta}`, cursiva: true, tamano: 10 }] : []),
    {
      texto: `Recopilado el ${new Date().toLocaleDateString('es-CL')} con Responsa.`,
      tamano: 10,
      color: '555555',
    },
    { texto: '' },
    { texto: `Documentos en esta carpeta (${guardados.length})`, negrita: true, tamano: 12 },
  ];
  for (const g of guardados) {
    indice.push({ texto: g.archivo, negrita: true });
    indice.push({ texto: g.titulo });
    if (g.enlace) indice.push({ texto: g.enlace, cursiva: true, tamano: 9, color: '555555' });
  }
  if (pendientes.length) {
    indice.push({ texto: '' });
    indice.push({ texto: `No se pudieron descargar (${pendientes.length})`, negrita: true, tamano: 12 });
    indice.push({
      texto:
        'Estos documentos no quedaron en la carpeta y no están reemplazados por nada. ' +
        'Hay que buscarlos en la fuente antes de citarlos.',
      cursiva: true,
      tamano: 10,
    });
    for (const p of pendientes) indice.push({ texto: `- ${p.titulo}: ${p.motivo}` });
  }
  indice.push({ texto: '' });
  indice.push({
    texto:
      'Los .docx reproducen el texto oficial publicado por el organismo, con la procedencia y el enlace ' +
      'impresos en la primera página. Los .pdf son el archivo tal como lo publica la fuente.',
    cursiva: true,
    tamano: 9,
    color: '555555',
  });
  await writeFile(join(carpeta, '00 - Indice.docx'), crearDocx(indice));

  return {
    carpeta,
    guardados: guardados.length,
    archivos: guardados.map((g) => g.archivo),
    ...(pendientes.length ? { no_descargados: pendientes } : {}),
    aviso: pendientes.length
      ? `Quedó ${pendientes.length === 1 ? '1 documento' : `${pendientes.length} documentos`} sin descargar, ` +
        'anotado en "00 - Indice.docx". Dile al usuario cuál faltó: no debe darlo por respaldado.'
      : undefined,
  };
}
