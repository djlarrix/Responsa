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

// ---------- El servidor tiene que poder arrancar ----------
// Va primero y a propósito: un error de sintaxis en index.mjs deja el servidor
// MCP sin arrancar, y ninguna otra prueba lo detecta porque ninguna lo carga.
// Ya pasó una vez, con un commit publicado.
seccion('El servidor arranca');
try {
  const { execFileSync, execFile } = await import('node:child_process');
  const { readdirSync, statSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

  const archivos = [];
  (function recorrer(dir) {
    for (const e of readdirSync(dir)) {
      const ruta = join(dir, e);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.mjs$/.test(e)) archivos.push(ruta);
    }
  })(join(raiz, 'src'));

  const rotos = [];
  for (const a of archivos) {
    try {
      execFileSync(process.execPath, ['--check', a], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      // La salida de `node --check` trae la línea, el subrayado y el mensaje;
      // el útil es el mensaje, no el subrayado de acentos circunflejos.
      const lineas = String(err.stderr ?? '').split(/\r?\n/).map((l) => l.trim());
      const detalle = lineas.find((l) => /Error/.test(l)) ?? lineas.find(Boolean) ?? 'error';
      rotos.push(`${a.replace(raiz, '')}: ${detalle}`);
    }
  }
  check(`los ${archivos.length} módulos del servidor compilan`, rotos.length === 0, rotos.join(' | ').slice(0, 120));

  // La lista de herramientas y el switch que las atiende tienen que cuadrar:
  // una herramienta declarada sin `case` responde "desconocida" en producción.
  const fuente = (await import('node:fs')).readFileSync(join(raiz, 'src', 'index.mjs'), 'utf8');
  const declaradas = [...fuente.matchAll(/^    name: '([a-z_]+)'/gm)].map((m) => m[1]);
  const atendidas = [...fuente.matchAll(/^    case '([a-z_]+)'/gm)].map((m) => m[1]);
  const huerfanas = declaradas.filter((d) => !atendidas.includes(d));
  check('cada herramienta declarada tiene quien la atienda', huerfanas.length === 0,
    huerfanas.length ? huerfanas.join(', ') : `${declaradas.length} herramientas`);

  // El servidor manda su método en el `initialize`. Es lo único que llega al
  // chat de Claude Desktop, donde la skill de Claude Code no se carga: sin
  // esto, las respuestas salen como un bloque corrido de texto.
  const inicio = await new Promise((resolver) => {
    const proc = execFile(process.execPath, [join(raiz, 'src', 'index.mjs')]);
    const corte = setTimeout(() => { proc.kill(); resolver(null); }, 10000);
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d;
      for (const linea of buf.split(/\r?\n/)) {
        if (!linea.trim()) continue;
        try {
          const m = JSON.parse(linea);
          if (m.id === 1) { clearTimeout(corte); proc.kill(); resolver(m.result ?? null); }
        } catch { /* línea incompleta */ }
      }
    });
    proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } },
    }) + '\n');
  });
  const instrucciones = inicio?.instructions ?? '';
  check('el servidor responde al initialize', !!inicio);
  check('entrega su método al cliente', instrucciones.length > 500,
    `${instrucciones.length} caracteres`);
  check('el método exige estructura y párrafos cortos',
    /Nunca un bloque corrido/.test(instrucciones) && /Párrafos de tres o cuatro líneas/.test(instrucciones));
  check('el método prohíbe citar de memoria', /en esta conversación/.test(instrucciones));
  // La línea de apertura no basta: quien lee un informe busca un punto, no lo
  // lee entero, así que la fuente tiene que ir junto al dato.
  check('el método exige la fuente junto a cada afirmación',
    /cada afirmación tiene que dejar ver de dónde salió/i.test(instrucciones));
} catch (e) { fallo(e); }

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
  check('revisa más fallos de los que devuelve', /Se revisaron \d+ documentos/.test(r.seleccion ?? ''), r.seleccion);
  const aportes = r.resultados.map((x) => x.aporte).filter(Boolean);
  check('clasifica el aporte de cada fallo', aportes.length > 0, aportes.join(' | '));
  const validos = ['fija doctrina', 'resuelve el fondo', 'no entra al fondo'];
  check('sólo usa las categorías previstas', aportes.every((a) => validos.includes(a)));
  const peso = { 'fija doctrina': 0, 'resuelve el fondo': 1, 'no entra al fondo': 3 };
  const orden = r.resultados.map((x) => peso[x.aporte] ?? 2);
  check('los que más aportan van primero', orden.every((v, i) => i === 0 || orden[i - 1] <= v), orden.join(','));
  // "Fija doctrina" atribuye autoridad: una Corte de Apelaciones no la fija.
  const ape = await buscarSentencias({ literal: 'despido', tribunal: 'corte_apelaciones', limite: 6 });
  check('sólo la Corte Suprema "fija doctrina"', ape.resultados.every((x) => x.aporte !== 'fija doctrina'),
    [...new Set(ape.resultados.map((x) => x.aporte))].join(' | '));
  // Los juzgados no publican la parte resolutiva: no se puede decir que se
  // eligió "lo que más aporta" cuando no había con qué clasificar.
  const juz = await buscarSentencias({ literal: 'despido', tribunal: 'laborales', limite: 4 });
  check('declara cuando no pudo ordenar por aporte',
    !juz.resultados.some((x) => x.aporte) ? /no se pudo ordenar/.test(juz.seleccion ?? '') : true);
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

  // Alternativa para quien no quiere una carpeta nueva en Descargas.
  const z = await armarExpediente({
    asunto: 'Prueba en zip',
    documentos: [{ tipo: 'norma', idNorma: '172986', articulo: '1545', titulo: 'Código Civil, art. 1545' }],
    formato: 'zip',
  });
  check('entrega un solo archivo .zip', /\.zip$/.test(z.archivo ?? '') && z.formato === 'zip');
  check('el .zip no deja ninguna carpeta suelta',
    readdirSync(dirPrueba).filter((f) => statSync(join(dirPrueba, f)).isDirectory() && /zip/i.test(f)).length === 0);
  const bytes = readFileSync(z.archivo);
  check('el .zip es un archivo válido', bytes[0] === 0x50 && bytes[1] === 0x4b, `${bytes.length} bytes`);
  // Los nombres van en UTF-8 con el bit 11, o Windows rompe los acentos.
  check('marca los nombres como UTF-8', bytes.readUInt16LE(6) === 0x0800);
  check('todo va dentro de una sola carpeta al descomprimir',
    bytes.toString('latin1').includes('Prueba en zip'));
  try {
    await armarExpediente({ asunto: 'x', documentos: [{ tipo: 'norma', idNorma: '1' }], formato: 'pdf' });
    check('rechaza un formato inexistente', false);
  } catch (err) { check('rechaza un formato inexistente', /Formato desconocido/.test(err.message)); }
  try {
    await armarExpediente({ asunto: 'x', documentos: [{ tipo: 'norma', idNorma: '1' }], destino: join(dirPrueba, 'no-existe') });
    check('rechaza un destino inexistente', false);
  } catch (err) { check('rechaza un destino inexistente', /no existe/.test(err.message)); }
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

// ---------- Fallas silenciosas ----------
// El peligro de esta herramienta no es el error visible: es la respuesta que
// parece válida y no lo es. Un cero se lee como "no existe"; una ficha vacía,
// como un documento real. Cada caso de aquí abajo fue un error de verdad.
seccion('Fallas silenciosas: lo que parece válido y no lo es');

/** Sana si lanza excepción, o si declara su vacío con sin_datos/mensaje. */
async function declaraOFalla(nombre, fn) {
  try {
    const r = await fn();
    const j = JSON.stringify(r ?? null);
    check(nombre, /sin_datos|sugerencia|"encontrad[oa]"\s*:\s*false|mensaje|advertencia/i.test(j),
      j.slice(0, 90));
  } catch {
    ok++; console.log(`  OK     ${nombre}  (lo rechaza)`);
  }
}

try {
  // Sin criterio, el PJUD devolvía su corpus entero (303.376 fallos) ordenado
  // por fecha, y se mostraban los primeros como si respondieran la consulta.
  try {
    await buscarSentencias({ limite: 2 });
    check('jurisprudencia sin criterio se rechaza', false, 'devolvió resultados');
  } catch (err) {
    check('jurisprudencia sin criterio se rechaza', /criterio de búsqueda/i.test(err.message));
  }
  await declaraOFalla('jurisprudencia sin coincidencias lo declara',
    () => buscarSentencias({ literal: 'zzqxwvkjhgfdsa', limite: 3 }));
  await declaraOFalla('rol inexistente lo declara', () => verSentencia({ rol: '99999999', era: '1999' }));
  await declaraOFalla('Tribunal Constitucional sin coincidencias lo declara',
    () => buscarSentenciasTC({ consulta: 'zzqxwvkjhgfdsa' }));
  await declaraOFalla('Contraloría sin coincidencias lo declara',
    () => buscarDictamenes({ texto: 'zzqxwvkjhgfdsa', limite: 3 }));
  await declaraOFalla('Contraloría sin criterio se rechaza', () => buscarDictamenes({}));
  // Un UNID de formato válido pero falso devolvía una ficha vacía marcada
  // `vigente_aparente: true`, que se lee como "existe y está vigente".
  const falso = await verDictamen('00000000000000000000000000000000');
  check('UNID falso no devuelve ficha de dictamen', falso?.encontrado === false, falso?.mensaje?.slice(0, 60));
  check('UNID falso no dice que esté vigente', falso?.vigente_aparente === undefined);
  await declaraOFalla('artículo inexistente lo declara', () => verNorma('172986', '999999'));
  await declaraOFalla('idNorma inexistente lo declara', () => verNorma('999999999', '1'));
  await declaraOFalla('dictamen DT inexistente lo declara', () => verDictamenDT('999999999'));
  // Citas inventadas: la BCN siempre devuelve algo, así que hay que exigir que
  // el título encontrado comparta de verdad las palabras de la cita.
  for (const cita of ['Ley de la Gravedad Universal', 'Estatuto del Unicornio']) {
    const c = await resolverCita(cita);
    check(`no da por verificada una cita inventada: "${cita}"`, c?.verificada !== true, c?.titulo?.slice(0, 40));
  }
} catch (e) { fallo(e); }

// ---------- Una causa, un resultado ----------
seccion('Documentos de una misma causa');
try {
  const r = await buscarSentencias({ literal: 'nulidad del despido', limite: 5 });
  const roles = r.resultados.map((x) => x.rol);
  check('no repite el mismo rol', new Set(roles).size === roles.length, roles.join(' '));
  const fusionada = r.resultados.find((x) => x.resoluciones);
  if (fusionada) {
    check('agrupa las resoluciones de una causa', fusionada.resoluciones.length > 1,
      `rol ${fusionada.rol}: ${fusionada.resoluciones.map((x) => x.resultado.slice(0, 24)).join(' + ')}`);
    check('las resoluciones van de la más antigua a la más nueva',
      fusionada.resoluciones.every((x, i, a) => i === 0 || a[i - 1].fecha <= x.fecha));
  } else {
    ok++; console.log('  OK     agrupa las resoluciones de una causa  (esta vez no vinieron repetidas)');
  }
  // Un fallo que aplica cinco artículos del mismo código traía cinco veces el
  // nombre del código y cinco veces la misma URL de la BCN.
  const conNormas = r.resultados.find((x) => x.normas_aplicadas?.length);
  if (conNormas) {
    const nombres = conNormas.normas_aplicadas.map((n) => n.norma);
    check('agrupa los artículos bajo su norma', new Set(nombres).size === nombres.length,
      conNormas.normas_aplicadas.map((n) => `${n.norma} arts. ${n.articulos.join(', ')}`).join(' | ').slice(0, 90));
    check('los artículos salen limpios, sin el prefijo ART.',
      conNormas.normas_aplicadas.every((n) => n.articulos.every((a) => !/^ART/i.test(a))));
  }
  check('acota los descriptores', r.resultados.every((x) => x.descriptores.length <= 8));
  const pasajes = r.resultados.flatMap((x) => x.pasajes_coincidentes ?? []);
  check('acota los pasajes por fallo', r.resultados.every((x) => (x.pasajes_coincidentes?.length ?? 0) <= 3));
  // Solr devolvía recortes de cuatro caracteres: entre comillas parecerían una cita.
  check('descarta pasajes demasiado cortos para citar', pasajes.every((t) => t.length >= 40),
    pasajes.length ? `el más corto mide ${Math.min(...pasajes.map((t) => t.length))}` : 'sin pasajes');
  check('no repite pasajes dentro de un fallo',
    r.resultados.every((x) => new Set(x.pasajes_coincidentes ?? []).size === (x.pasajes_coincidentes?.length ?? 0)));
} catch (e) { fallo(e); }

console.log(`\n──────────────\n${ok} OK, ${fallos} fallas\n`);
process.exit(fallos > 0 ? 1 : 0);
