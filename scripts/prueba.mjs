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
import { verificarFuentes } from '../src/lib/salud.mjs';

let ok = 0, fallos = 0;
const check = (n, c, d = '') => {
  if (c) { ok++; console.log(`  OK     ${n}${d ? '  ' + d : ''}`); }
  else { fallos++; console.log(`  FALLA  ${n}${d ? '  ' + d : ''}`); }
};
const seccion = (t) => console.log(`\n=== ${t} ===`);
const fallo = (e) => { fallos++; console.log('  FALLA  excepción:', e.message); };

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

console.log(`\n──────────────\n${ok} OK, ${fallos} fallas\n`);
process.exit(fallos > 0 ? 1 : 0);
