/**
 * Banco de pruebas en vivo contra las fuentes reales.
 *
 * No son tests unitarios: verifican que ocho servicios de terceros sigan
 * respondiendo y con la forma esperada. Es lo que hay que correr cuando algo
 * se ve raro, y de tanto en tanto aunque no se vea raro.
 *
 *   npm run prueba          todo
 *   npm run prueba -- rapida   sólo el chequeo de salud (unos 12 s)
 */
import { buscarSentencias, buscarEnTodos, verSentencia } from '../src/fuentes/pjud.mjs';
import { buscarSentenciasTC, buscarFichasTC } from '../src/fuentes/tconstitucional.mjs';
import { buscarDictamenesDT, verDictamenDT } from '../src/fuentes/direcciontrabajo.mjs';
import { buscarNormas, verNorma, resolverCita } from '../src/fuentes/leychile.mjs';
import { buscarDoctrina } from '../src/fuentes/doctrina.mjs';
import { buscarDictamenes, verDictamen } from '../src/fuentes/contraloria.mjs';
import { consultarEstadistica } from '../src/fuentes/estadisticas.mjs';
import { buscarLaudos, listarMateriasArbitrales } from '../src/fuentes/arbitraje.mjs';
import { valorEconomico } from '../src/fuentes/valores.mjs';
import { enlaceConsultaCausas } from '../src/fuentes/causas.mjs';
import { armarExpediente } from '../src/fuentes/expediente.mjs';
import { crearDocx } from '../src/lib/docx.mjs';
import { verificarFuentes } from '../src/lib/salud.mjs';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

let ok = 0, fallos = 0;
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`  OK     ${n}${d ? '  ' + d : ''}`); }
  else { fallos++; console.log(`  FALLA  ${n}${d ? '  ' + d : ''}`); }
};
const seccion = (t) => console.log(`\n=== ${t} ===`);
const fallo = (e) => { fallos++; console.log('  FALLA  excepción:', e.message); };

/** Extrae word/document.xml de un .docx para poder comprobar su contenido. */
function documentoXml(buf) {
  const nombre = Buffer.from('word/document.xml');
  const pos = buf.indexOf(nombre);
  const cabecera = pos - 30; // el nombre va justo después de la cabecera local
  const comprimido = buf.readUInt32LE(cabecera + 18);
  const extra = buf.readUInt16LE(cabecera + 28);
  const inicio = pos + nombre.length + extra;
  return inflateRawSync(buf.subarray(inicio, inicio + comprimido)).toString('utf8');
}

// ---------- Chequeo de salud ----------
seccion('Salud de las fuentes');
const salud = await verificarFuentes();
for (const r of salud.resultados) check(r.fuente, r.estado === 'ok', r.detalle ?? r.problema);
console.log(`  (${salud.ms_total} ms)`);

if (process.argv.includes('rapida')) {
  console.log(`\n──────────────\n${ok} OK, ${fallos} fallas\n`);
  process.exit(fallos > 0 ? 1 : 0);
}

// ---------- Jurisprudencia ----------
seccion('Jurisprudencia: campos exigidos (rol, tribunal, fecha, link, normas)');
try {
  const r = await buscarSentencias({ texto: 'nulidad del despido', limite: 3, textoCompleto: false });
  const s = r.resultados[0];
  check('trae rol', !!s.rol, s.rol);
  check('trae tribunal', !!s.tribunal, s.tribunal);
  check('trae fecha válida', /^\d{4}-\d{2}-\d{2}$/.test(s.fecha), s.fecha);
  check('trae permalink', !!s.url, s.url_corta ?? s.url);
  check('trae cita armada', (s.cita?.length ?? 0) > 20);
  check('trae normas aplicadas con enlace BCN', s.normas_aplicadas.every((n) => !n.idNorma || n.url?.includes('bcn.cl')));
  check('trae historia procesal', !!s.historia);
} catch (e) { fallo(e); }

seccion('Jurisprudencia: filtro por norma y artículo');
try {
  const r = await buscarSentencias({ tipoNorma: 'Ley', numNorma: '19496', numArt: '16', limite: 2, textoCompleto: false });
  check('devuelve fallos que aplican la norma', r.resultados.length > 0, `total=${r.total}`);
  check('acota respecto de la búsqueda libre', r.total < 5000, `${r.total} fallos`);
} catch (e) { fallo(e); }

seccion('Jurisprudencia: otros tribunales y paginación');
try {
  const l = await buscarSentencias({ tribunal: 'laborales', texto: 'tutela de derechos fundamentales', limite: 2, textoCompleto: false });
  check('el buscador laboral responde', l.resultados.length > 0, `total=${l.total}`);
  const p1 = await buscarSentencias({ texto: 'indemnización', limite: 2, pagina: 1, textoCompleto: false });
  const p2 = await buscarSentencias({ texto: 'indemnización', limite: 2, pagina: 2, textoCompleto: false });
  check('la paginación cambia los resultados', p1.resultados[0]?.id !== p2.resultados[0]?.id);
} catch (e) { fallo(e); }

seccion('Jurisprudencia: sentencia por rol');
try {
  const primera = await buscarSentencias({ texto: 'indemnización', limite: 1, textoCompleto: false });
  const [rol, era] = String(primera.resultados[0].rol).split('-');
  const s = await verSentencia({ rol, era });
  check('recupera la sentencia por rol', s.encontrada === true, `${rol}-${era}`);
} catch (e) { fallo(e); }

seccion('Jurisprudencia: búsqueda en los siete tribunales');
try {
  const r = await buscarEnTodos({ literal: 'nulidad del despido', limite: 5, textoCompleto: false });
  check('mezcla resultados de varias sedes', r.mostrados > 0, `${r.mostrados} fallos, total ${r.total_general}`);
  check('identifica la sede de cada fallo', r.resultados.every((s) => !!s.buscador));
  check('informa el total por tribunal', Object.keys(r.total_por_tribunal).length === 7);
} catch (e) { fallo(e); }

// ---------- Tribunal Constitucional ----------
seccion('Tribunal Constitucional');
try {
  const r = await buscarSentenciasTC({ consulta: 'igualdad ante la ley', textoCompleto: false });
  check('encuentra sentencias', r.resultados.length > 0, `total ${r.total}`);
  const s = r.resultados[0];
  check('trae rol y competencia', !!s.rol && !!s.competencia, `Rol ${s.rol}`);
  check('trae enlace al PDF', s.pdf?.includes('/download'));
  check('trae pasajes coincidentes', s.parrafos_coincidentes.length > 0, `${s.coincidencias} coincidencias`);
  check('los pasajes vienen sin marcas de folio', !/^\s*\d{1,4}\s+0{3,}\d/.test(s.parrafos_coincidentes[0] ?? ''));
  const f = await buscarFichasTC({ consulta: 'debido proceso' });
  check('las fichas responden', f.resultados.length > 0, `total ${f.total}`);
} catch (e) { fallo(e); }

// ---------- Dirección del Trabajo ----------
seccion('Dirección del Trabajo');
try {
  const r = await buscarDictamenesDT({ consulta: 'fuero maternal', limite: 4 });
  check('construye el índice', r.total_indexado > 500, `${r.total_indexado} dictámenes`);
  check('encuentra dictámenes', r.encontrados > 0);
  check('prioriza el descriptor principal', /fuero maternal/i.test(r.resultados[0]?.epigrafe ?? ''), r.resultados[0]?.epigrafe?.slice(0, 50));
  check('todos traen número y enlace', r.resultados.every((d) => d.numero && d.url));
  const d = await verDictamenDT(r.resultados[0].id);
  check('el detalle trae texto limpio', d.texto.length > 500 && !/Toggle navigation/.test(d.texto), `${d.texto.length} chars`);
  check('el detalle separa la materia', (d.materia?.length ?? 0) > 10, d.materia?.slice(0, 50));
  const vacio = await buscarDictamenesDT({ consulta: 'zzzqqqxyz', limite: 3 });
  check('sin resultados sugiere, no falla', vacio.encontrados === 0 && !!vacio.sugerencia);
} catch (e) { fallo(e); }

// ---------- Legislación ----------
seccion('Ley Chile');
try {
  const b = await buscarNormas('ley 21719', 5);
  check('encuentra la Ley 21.719', b.normas.some((n) => n.numero === '21719'));
  const n = await verNorma('29526', '1');
  check('extrae un artículo puntual', n.encontrado === true, `art. ${n.articulo}, ${n.texto?.length} chars`);
  const inex = await verNorma('29526', '9999');
  check('avisa cuando el artículo no existe', inex.encontrado === false);
  check('resuelve "Código Civil" sin red', (await resolverCita('Código Civil'))?.id === '172986');
  check('resuelve "Ley 19.496"', (await resolverCita('Ley 19.496'))?.id === '61438');
} catch (e) { fallo(e); }

// ---------- Doctrina ----------
seccion('Doctrina');
try {
  const d = await buscarDoctrina({ consulta: 'cláusulas abusivas contratos de adhesión', limite: 4 });
  check('encuentra doctrina pertinente', d.resultados.length > 0 && !d.advertencia, `${d.encontrados} trabajos`);
  check('todos traen fuente citable', d.resultados.every((x) => x.url && x.cita));
} catch (e) { fallo(e); }

// ---------- Contraloría ----------
seccion('Contraloría');
try {
  const r = await buscarDictamenes({ texto: 'sumario administrativo', limite: 3 });
  check('encuentra dictámenes', r.resultados.length > 0, `total=${r.total}`);
  check('sin problemas de codificación', !JSON.stringify(r.resultados).includes('�'));
  const d = await verDictamen(r.resultados[0].unid);
  check('el detalle trae materia', (d.materia?.length ?? 0) > 20);
  check('el detalle trae fuentes legales', (d.fuentes_legales?.length ?? 0) > 5);
  check('el detalle informa el estado de vigencia', typeof d.vigente_aparente === 'boolean', `vigente=${d.vigente_aparente}`);
  check('el detalle trae texto completo', (d.texto?.length ?? 0) > 300, `${d.texto?.length} chars`);
} catch (e) { fallo(e); }

// ---------- Estadísticas ----------
seccion('Estadísticas judiciales');
try {
  const e = await consultarEstadistica({ consulta: 'duracion_causas', corte: 30, tribunal: 0, competencia: 'Laboral', anio: 2024 });
  check('devuelve duración con promedio', typeof e.promedio_general === 'number', `${Math.round(e.promedio_general)} días`);
  check('cita la fuente', !!e.fuente);
  const v = await consultarEstadistica({ consulta: 'duracion_causas', corte: 999, tribunal: 999, competencia: 'Civil', anio: 2024 });
  check('declara sin_datos en vez de devolver vacío', v.sin_datos === true);
  try {
    await consultarEstadistica({ consulta: 'inventada', anio: 2024 });
    check('rechaza consulta inexistente', false);
  } catch (err) { check('rechaza consulta inexistente', /desconocida/.test(err.message)); }
} catch (e) { fallo(e); }

// ---------- Arbitraje ----------
seccion('Arbitraje CAM Santiago');
try {
  const l = await listarMateriasArbitrales('materia');
  check('el índice por materias carga', l.total > 500, `${l.total} materias, ${l.total_laudos} laudos`);
  const a = await listarMateriasArbitrales('arbitro');
  check('el índice por árbitros carga', a.total > 50, `${a.total} árbitros`);
  const r = await buscarLaudos({ consulta: 'contrato de construcción', limite: 3 });
  check('encuentra laudos', r.encontrados > 0);
  check('todos los laudos traen PDF', r.resultados.every((m) => m.laudos.every((x) => x.pdf?.endsWith('.pdf'))));
  const vacio = await buscarLaudos({ consulta: 'zzzzqqqxyz', limite: 3 });
  check('sin resultados devuelve sugerencia, no error', vacio.encontrados === 0 && !!vacio.sugerencia);
} catch (e) { fallo(e); }

// ---------- Valores ----------
seccion('Valores económicos');
try {
  const uf = await valorEconomico({ indicador: 'uf' });
  check('UF con valor razonable', uf.valor_actual > 30000 && uf.valor_actual < 100000, `$${uf.valor_actual}`);
  const todos = await valorEconomico({});
  check('devuelve UTM', !!todos.indicadores?.utm?.valor, `$${todos.indicadores?.utm?.valor}`);
  check('cita la fuente', !!uf.fuente);
  try {
    await valorEconomico({ indicador: 'inventado' });
    check('rechaza indicador inexistente', false);
  } catch (err) { check('rechaza indicador inexistente', /desconocido/.test(err.message)); }
} catch (e) { fallo(e); }

// ---------- Causas ----------
seccion('Consulta de causas (no automatizable por diseño)');
try {
  const c = enlaceConsultaCausas({ tipo: 'rol', competencia: 'laboral', rol: '1234', era: '2025' });
  check('se declara no automatizable', c.automatizable === false);
  check('explica el motivo', /reCAPTCHA/i.test(c.motivo));
  check('entrega enlace y pasos', !!c.url && c.pasos.length > 0);
  check('ofrece alternativas', c.alternativas_automatizables.length > 0);
} catch (e) { fallo(e); }

// ---------- Selección por aporte doctrinal ----------
seccion('Selección de fallos por aporte doctrinal');
try {
  const r = await buscarSentencias({ literal: 'nulidad del despido', limite: 5 });
  check('revisa más fallos de los que devuelve', /Se revisaron \d+ fallos/.test(r.seleccion ?? ''), r.seleccion);
  const aportes = r.resultados.map((x) => x.aporte).filter(Boolean);
  check('clasifica el aporte de cada fallo', aportes.length > 0, aportes.join(' | '));
  const validos = ['fija doctrina', 'resuelve el fondo', 'no entra al fondo'];
  check('sólo usa las categorías previstas', aportes.every((a) => validos.includes(a)));
  const peso = { 'fija doctrina': 0, 'resuelve el fondo': 1, 'no entra al fondo': 3 };
  const orden = r.resultados.map((x) => peso[x.aporte] ?? 2);
  check('los que más aportan van primero', orden.every((v, i) => i === 0 || orden[i - 1] <= v), orden.join(','));
  check(
    'no encabeza un fallo que no entra al fondo',
    r.resultados[0]?.aporte !== 'no entra al fondo' || r.resultados.every((x) => x.aporte === 'no entra al fondo'),
  );
} catch (e) { fallo(e); }

// ---------- Recorte de contexto ----------
seccion('Recorte de contexto');
try {
  const b = await buscarSentencias({ literal: 'tutela de derechos fundamentales', limite: 3 });
  const conPasajes = b.resultados.filter((x) => x.pasajes_coincidentes?.length);
  check('la búsqueda recorta el texto', b.resultados.every((x) => x.texto.length <= 1250),
    `máx ${Math.max(...b.resultados.map((x) => x.texto.length))} caracteres`);
  check('con pasajes, recorta aún más', conPasajes.length === 0 || conPasajes.every((x) => x.texto.length <= 520));
  const uno = b.resultados[0];
  const [rol, era] = String(uno.rol).split('-');
  const s1 = await verSentencia({ rol, era, tribunal: 'corte_suprema' });
  check('ver_sentencia sí trae el texto íntegro',
    s1.encontrada && s1.texto.length > uno.texto.length && !s1.texto_recortado,
    `${s1.texto.length} vs ${uno.texto.length} caracteres`);
} catch (e) { fallo(e); }

// ---------- Documentos Word ----------
seccion('Generación de documentos Word');
try {
  const b = crearDocx([
    { texto: 'Título de prueba', negrita: true, tamano: 14 },
    { texto: 'Acentos, ñ y símbolos: «§» & <etiqueta>', justificado: true },
  ]);
  check('es un archivo ZIP válido', b[0] === 0x50 && b[1] === 0x4b, `${b.length} bytes`);
  const txt = b.toString('latin1');
  check('contiene las tres piezas obligatorias',
    txt.includes('[Content_Types].xml') && txt.includes('_rels/.rels') && txt.includes('word/document.xml'));
  // Un byte de control dentro del XML hace que Word rechace el archivo entero.
  // Hay que mirar el XML descomprimido: en el ZIP el byte puede aparecer por azar.
  const conControl = crearDocx([{ texto: `con control ${String.fromCharCode(7)} fin` }]);
  check('descarta caracteres de control que romperían Word',
    !documentoXml(conControl).includes(String.fromCharCode(7)));
  check('escapa los caracteres reservados de XML',
    documentoXml(b).includes('&amp;') && documentoXml(b).includes('&lt;etiqueta&gt;'));
} catch (e) { fallo(e); }

// ---------- Carpeta de respaldo ----------
seccion('Carpeta de respaldo');
const dirPrueba = mkdtempSync(join(tmpdir(), 'responsa-'));
process.env.RESPONSA_DESCARGAS = dirPrueba;
try {
  const r = await armarExpediente({
    asunto: 'Prueba automatizada',
    consulta: 'prueba',
    documentos: [
      { tipo: 'norma', idNorma: '172986', articulo: '1545', titulo: 'Código Civil, art. 1545' },
      { tipo: 'sentencia_pjud', rol: '00000000-1999', titulo: 'fallo inexistente a propósito' },
    ],
  });
  check('crea la carpeta en Descargas', r.carpeta.startsWith(dirPrueba));
  check('guarda el documento que sí existe', r.guardados === 1, r.archivos.join(', '));
  check('anota lo que no pudo descargar', r.no_descargados?.length === 1, r.no_descargados?.[0]?.motivo);
  check('avisa para que no se cite lo no respaldado', /no debe darlo por respaldado/.test(r.aviso ?? ''));
  const archivos = readdirSync(r.carpeta);
  check('siempre escribe el índice', archivos.includes('00 - Indice.docx'));
  check('los archivos no quedan vacíos', archivos.every((f) => statSync(join(r.carpeta, f)).size > 500));
  const indice = readFileSync(join(r.carpeta, '00 - Indice.docx'));
  check('el índice es un .docx válido', indice[0] === 0x50 && indice[1] === 0x4b);
  try {
    await armarExpediente({ asunto: 'x', documentos: [{ tipo: 'inventado' }] });
    check('rechaza un tipo de documento inexistente', false);
  } catch (err) { check('rechaza un tipo de documento inexistente', /no reconocido/.test(err.message)); }
  try {
    await armarExpediente({ asunto: '', documentos: [{ tipo: 'norma', idNorma: '1' }] });
    check('exige el asunto', false);
  } catch (err) { check('exige el asunto', /asunto/.test(err.message)); }
} catch (e) { fallo(e); }
finally { rmSync(dirPrueba, { recursive: true, force: true }); delete process.env.RESPONSA_DESCARGAS; }

console.log(`\n──────────────\n${ok} OK, ${fallos} fallas\n`);
process.exit(fallos > 0 ? 1 : 0);
