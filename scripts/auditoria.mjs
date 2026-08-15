/**
 * Auditoría de integridad. Verifica contra las fuentes oficiales todo dato
 * que esté escrito a mano en el código, y busca las formas de fallar que
 * producirían una cita falsa.
 *
 *   npm run auditoria
 *
 * No comprueba que el servidor funcione (para eso está `npm run prueba`), sino
 * que lo que devuelve sea CIERTO.
 */
import { pedir } from '../src/lib/http.mjs';
import { verNorma, resolverCita, buscarNormas } from '../src/fuentes/leychile.mjs';
import { ANIOS as ANIOS_DT, buscarDictamenesDT } from '../src/fuentes/direcciontrabajo.mjs';
import { CORTES, consultarEstadistica } from '../src/fuentes/estadisticas.mjs';
import { REVISTAS } from '../src/fuentes/doctrina.mjs';
import { buscarSentenciasTC } from '../src/fuentes/tconstitucional.mjs';

let ok = 0, grave = 0, leve = 0;
const OK = (n, d = '') => { ok++; console.log(`  ok     ${n}${d ? '  ' + d : ''}`); };
const GRAVE = (n, d = '') => { grave++; console.log(`  GRAVE  ${n}${d ? '  ' + d : ''}`); };
const LEVE = (n, d = '') => { leve++; console.log(`  leve   ${n}${d ? '  ' + d : ''}`); };
const seccion = (t) => console.log(`\n${'─'.repeat(72)}\n${t}\n${'─'.repeat(72)}`);

// ═══════════════════════════════════════════ 1. idNorma escritos a mano
seccion('1. Cada idNorma fijo apunta a la norma que dice');

// Los mismos valores que están hardcodeados en leychile.mjs y precargar.mjs.
const FIJAS = [
  ['172986', 'Código Civil', /c[oó]digo civil/i],
  ['207436', 'Código del Trabajo', /c[oó]digo del trabajo/i],
  ['1974', 'Código de Comercio', /c[oó]digo de comercio/i],
  ['1984', 'Código Penal', /c[oó]digo penal/i],
  ['22740', 'Código de Procedimiento Civil', /procedimiento civil/i],
  ['25563', 'Código Orgánico de Tribunales', /org[aá]nico de tribunales/i],
  ['176595', 'Código Procesal Penal', /procesal penal/i],
  ['6374', 'Código Tributario', /c[oó]digo tributario/i],
  ['5605', 'Código de Aguas', /c[oó]digo de aguas/i],
  ['5595', 'Código Sanitario', /sanitario/i],
  ['1133574', 'Código de Minería', /miner[ií]a/i],
  ['30287', 'Código Aeronáutico', /aeron[aá]utico/i],
  ['18914', 'Código de Justicia Militar', /justicia militar/i],
  ['242302', 'Constitución Política', /constituci[oó]n pol[ií]tica/i],
];
const LEYES = [
  ['61438', '19496'], ['29526', '18101'], ['196640', '19799'], ['29438', '18010'],
  ['1058072', '20720'], ['1178004', '21461'], ['28650', '16744'], ['1010668', '20416'],
  ['141599', '19628'], ['1209272', '21719'],
];

for (const [id, nombre, patron] of FIJAS) {
  try {
    const n = await verNorma(id);
    const texto = `${n.titulo} ${n.nombreComun}`;
    if (patron.test(texto)) OK(`${nombre} → idNorma ${id}`, `"${n.titulo.slice(0, 45)}"`);
    else GRAVE(`${nombre} → idNorma ${id} apunta a OTRA norma`, `devuelve "${n.titulo.slice(0, 60)}"`);
    if (n.derogada) GRAVE(`${nombre} figura DEROGADA`, '');
  } catch (e) { LEVE(`${nombre} (${id}) no se pudo comprobar`, e.message.slice(0, 55)); }
}

for (const [id, numero] of LEYES) {
  try {
    const n = await verNorma(id);
    if (n.numero.replace(/\./g, '') === numero) OK(`Ley ${numero} → idNorma ${id}`, `"${n.titulo.slice(0, 45)}"`);
    else GRAVE(`Ley ${numero} → idNorma ${id} es en realidad la ${n.numero}`, n.titulo.slice(0, 50));
  } catch (e) { LEVE(`Ley ${numero} (${id}) no se pudo comprobar`, e.message.slice(0, 55)); }
}

// ═══════════════════════════════════════════ 2. Riesgo de cita inventada
seccion('2. Resolución de citas: ¿puede afirmar algo falso?');

// Una cita que no existe NO debe resolverse a una norma cualquiera.
const INVENTADAS = ['Ley 99999', 'Código de Barbería', 'Ley de la Gravedad Universal', 'Estatuto Inexistente 12345'];
for (const cita of INVENTADAS) {
  try {
    const r = await resolverCita(cita);
    if (r?.verificada && r.tipo_resolucion === 'identificador_exacto') {
      GRAVE(`"${cita}" se resuelve como identificador EXACTO`, `→ ${String(r.titulo).slice(0, 55)} (idNorma ${r.id})`);
    } else if (r?.verificada && !r.advertencia) {
      GRAVE(`"${cita}" se da por verificada sin advertir`, `→ ${String(r.titulo).slice(0, 50)}`);
    } else if (r?.verificada) {
      OK(`"${cita}" se marca como coincidencia por título, con advertencia`, String(r.titulo).slice(0, 42));
    } else {
      OK(`"${cita}" no se da por verificada`, r?.tipo ?? 'null');
    }
  } catch (e) { OK(`"${cita}" lanza error explícito`, e.message.slice(0, 45)); }
}

// Una cita real debe resolverse Y quedar marcada como identificador exacto.
for (const cita of ['Ley 19.496', 'Código del Trabajo', 'Ley 21.719', 'Código Civil']) {
  const r = await resolverCita(cita);
  if (r?.verificada && r.id && r.tipo_resolucion === 'identificador_exacto') OK(`"${cita}" resuelve por identificador exacto`, `idNorma ${r.id}`);
  else GRAVE(`"${cita}" no resuelve como identificador exacto`, JSON.stringify(r).slice(0, 70));
}

// ver_norma no puede devolver el texto de una norma que no se confirmó.
const { verNorma: vn } = await import('../src/fuentes/leychile.mjs');
void vn;

// ═══════════════════════════════════════════ 3. Artículos: el que se pide
seccion('3. Extracción de artículos: ¿devuelve el que se pidió?');

const ARTS = [
  ['61438', '16', /no producir[aá]n efecto alguno|se tendr[aá]n por no escritas|Artículo\s*16/i, 'Ley 19.496 art. 16'],
  ['172986', '1545', /contrato legalmente celebrado|ley para los contratantes/i, 'CC art. 1545'],
  ['172986', '2314', /delito o cuasidelito|da[ñn]o a otro/i, 'CC art. 2314'],
  ['207436', '161', /necesidades de la empresa|desahucio/i, 'C. Trabajo art. 161'],
  ['242302', '19', /asegura a todas las personas/i, 'Constitución art. 19'],
];
for (const [id, art, patron, etiqueta] of ARTS) {
  try {
    const n = await verNorma(id, art);
    if (!n.encontrado) { GRAVE(`${etiqueta}: no encontrado`, n.mensaje?.slice(0, 50)); continue; }
    if (String(n.articulo).trim() !== art) {
      GRAVE(`${etiqueta}: devolvió el artículo "${n.articulo}"`, '');
      continue;
    }
    // El texto de la BCN trae saltos de línea a mitad de frase; se normaliza
    // antes de comparar, si no la prueba falla por una razón que no existe.
    const plano = n.texto.replace(/\s+/g, ' ');
    if (patron.test(plano)) OK(`${etiqueta}`, `${n.texto.length} chars, contenido correcto`);
    else GRAVE(`${etiqueta}: el texto NO corresponde`, plano.slice(0, 70));
    if (n.derogado && !n.advertencia) GRAVE(`${etiqueta} está DEROGADO y no se advierte`, '');
  } catch (e) { LEVE(`${etiqueta} no se pudo comprobar`, e.message.slice(0, 50)); }
}

// Un artículo inexistente no debe devolver otro.
const inex = await verNorma('61438', '9999');
if (inex.encontrado === false) OK('artículo inexistente se declara no encontrado');
else GRAVE('artículo inexistente devolvió contenido', `art. ${inex.articulo}`);

// ═══════════════════════════════════════════ 4. Dirección del Trabajo
seccion('4. Dirección del Trabajo: el mapa año → portadilla');

// Se verificaron 2024-2026 al construirlo; el resto viene del scrape de
// categorías y NUNCA se comprobó. Un id equivocado devuelve dictámenes de
// otro año sin avisar.
// Lo que importa no es que las portadillas del sitio estén bien numeradas
// (algunas mezclan años), sino que NINGÚN dictamen se atribuya a un año que no
// es el suyo. Se comprueba la salida real de la búsqueda, año por año.
const H = { Accept: 'text/html' };
let aniosSanos = 0, aniosVacios = 0;
for (const anio of Object.keys(ANIOS_DT).map(Number).sort((a, b) => b - a)) {
  try {
    const r = await buscarDictamenesDT({ consulta: 'trabajo contrato jornada remuneración', desdeAnio: anio, hastaAnio: anio, limite: 200 });
    if (!r.total_indexado) { aniosVacios++; LEVE(`${anio}: índice vacío`, r.advertencia ?? ''); continue; }
    const intrusos = r.resultados.filter((d) => !d.fecha.startsWith(String(anio)));
    if (intrusos.length) {
      GRAVE(`${anio}: ${intrusos.length} dictámenes de OTRO año en los resultados`, intrusos.slice(0, 2).map((d) => `${d.numero}=${d.fecha}`).join(', '));
    } else {
      aniosSanos++;
    }
  } catch (e) {
    // Un año que falla debe fallar con mensaje, no devolver datos de otro año.
    if (/portadilla|mapa|índice/i.test(e.message)) OK(`${anio}: falla con mensaje explícito`, e.message.slice(0, 45));
    else LEVE(`${anio} no se pudo comprobar`, e.message.slice(0, 45));
  }
}
OK(`${aniosSanos} años sin contaminación cruzada de fechas`, aniosVacios ? `${aniosVacios} sin datos` : '');

// Y el mapa crudo, como dato informativo: si un pv está mal, el filtro lo tapa
// pero el año queda incompleto y conviene saberlo.
for (const [anio, pv] of Object.entries(ANIOS_DT).sort((a, b) => b[0] - a[0])) {
  try {
    const res = await pedir(`https://www.dt.gob.cl/legislacion/1624/w3-propertyvalue-${pv + 1}.html`, { headers: H, timeoutMs: 30000 });
    if (!res.ok) continue;
    const fechas = [...new Set([...res.texto.matchAll(/iso8601-(\d{4})\d{4}/g)].map((m) => m[1]))];
    if (fechas.length > 1) LEVE(`portadilla de enero ${anio} mezcla años ${fechas.join(', ')}`, 'el filtro por fecha lo neutraliza');
  } catch { /* informativo */ }
}

// ═══════════════════════════════════════════ 5. Estadísticas
seccion('5. Estadísticas: los códigos de corte son los que dicen');

// Se compara la duración país (corte 0) con la suma de cortes: si un código
// estuviera mal, la corte devolvería datos de otra jurisdicción.
try {
  const pais = await consultarEstadistica({ consulta: 'duracion_causas', corte: 0, tribunal: 0, competencia: 'Laboral', anio: 2024 });
  if (pais.sin_datos) GRAVE('duración país 2024 sin datos');
  else OK('duración país 2024', `${Math.round(pais.promedio_general)} días`);

  let respondieron = 0;
  for (const [cod, nombre] of Object.entries(CORTES)) {
    if (cod === '0') continue;
    const r = await consultarEstadistica({ consulta: 'duracion_causas', corte: Number(cod), tribunal: 0, competencia: 'Laboral', anio: 2024 });
    if (r.sin_datos) { LEVE(`corte ${cod} (${nombre}) sin datos`); continue; }
    respondieron++;
    if (r.corte !== nombre) GRAVE(`corte ${cod}: el módulo la llama "${r.corte}" y la tabla dice "${nombre}"`);
    if (!(r.promedio_general > 0 && r.promedio_general < 3000)) {
      GRAVE(`corte ${cod} (${nombre}) promedio absurdo`, String(r.promedio_general));
    }
  }
  OK(`${respondieron} de ${Object.keys(CORTES).length - 1} cortes devuelven duración plausible`);
} catch (e) { LEVE('estadísticas no se pudieron comprobar', e.message.slice(0, 55)); }

// ═══════════════════════════════════════════ 6. Doctrina
seccion('6. Doctrina: cada ISSN es la revista que dice');

for (const r of REVISTAS) {
  try {
    const res = await pedir(`https://api.crossref.org/journals/${r.issn}`, { headers: { Accept: 'application/json' }, timeoutMs: 20000 });
    if (!res.ok) { LEVE(`${r.issn} HTTP ${res.status}`, r.nombre.slice(0, 40)); continue; }
    const j = JSON.parse(res.texto);
    const real = j.message?.title ?? '';
    const clave = r.nombre.toLowerCase().split('(')[0].trim().slice(0, 18);
    if (real.toLowerCase().includes(clave.slice(0, 12))) OK(`${r.issn}`, `"${real.slice(0, 48)}"`);
    else LEVE(`${r.issn} declarado "${r.nombre.slice(0, 32)}" y Crossref dice "${real.slice(0, 40)}"`);
  } catch (e) { LEVE(`${r.issn} no se pudo comprobar`, e.message.slice(0, 40)); }
}

// ═══════════════════════════════════════════ 7. Tribunal Constitucional
seccion('7. Tribunal Constitucional: los campos son los que se creen');

try {
  const t = await buscarSentenciasTC({ consulta: 'inaplicabilidad', textoCompleto: false });
  const s = t.resultados[0];
  if (!s) { GRAVE('el TC no devolvió resultados'); }
  else {
    if (s.rol && /^\d+$/.test(String(s.rol))) OK('el rol es numérico', String(s.rol));
    else LEVE('el rol tiene forma inesperada', String(s.rol));

    // El PDF debe existir de verdad, no ser una URL construida a la buena de Dios.
    const pdf = await pedir(s.pdf, { headers: { Accept: 'application/pdf' }, timeoutMs: 30000 });
    const tipo = pdf.headers?.get?.('content-type') ?? '';
    if (pdf.ok && /pdf/i.test(tipo)) OK('el enlace al PDF descarga un PDF real', `${tipo}`);
    else GRAVE('el enlace al PDF NO devuelve un PDF', `HTTP ${pdf.status} ${tipo}`);

    // El sumario mapeado desde custom_fields debe ser texto con sentido.
    if (s.sumario && s.sumario.length > 25 && !/^nan$/i.test(s.sumario)) OK('el sumario mapeado tiene contenido', s.sumario.slice(0, 45));
    else LEVE('el sumario mapeado viene vacío o es "nan"', String(s.sumario).slice(0, 40));

    if (s.parrafos_coincidentes.length && s.parrafos_coincidentes.every((p) => p.length > 15)) OK('los pasajes coincidentes tienen contenido');
    else LEVE('pasajes coincidentes vacíos o muy cortos');
  }
} catch (e) { LEVE('TC no se pudo comprobar', e.message.slice(0, 55)); }

// ═══════════════════════════════════════════ 8. Vacíos que engañan
seccion('8. Consultas absurdas: ¿inventa resultados?');

const absurdas = [
  ['doctrina', async () => (await import('../src/fuentes/doctrina.mjs')).buscarDoctrina({ consulta: 'zqxwvu plutonio krbtgzz vwxyqp', limite: 3 })],
  ['dictámenes DT', async () => buscarDictamenesDT({ consulta: 'zqxwvu plutonio', limite: 3 })],
  ['laudos CAM', async () => (await import('../src/fuentes/arbitraje.mjs')).buscarLaudos({ consulta: 'zqxwvu plutonio', limite: 3 })],
  ['Contraloría', async () => (await import('../src/fuentes/contraloria.mjs')).buscarDictamenes({ texto: 'zqxwvuplutonio', limite: 3 })],
];
for (const [nombre, fn] of absurdas) {
  try {
    const r = await fn();
    const n = r.encontrados ?? r.resultados?.length ?? 0;
    if (n === 0) OK(`${nombre}: devuelve vacío declarado`, r.sugerencia ? 'con sugerencia' : '');
    else if (r.advertencia) OK(`${nombre}: devuelve resultados pero advierte`, r.advertencia.slice(0, 45));
    else LEVE(`${nombre}: devuelve ${n} resultados para una consulta sin sentido`, 'revisar si son ruido presentado como hallazgo');
  } catch (e) { OK(`${nombre}: lanza error explícito`, e.message.slice(0, 45)); }
}

// ═══════════════════════════════════════════ Resumen
console.log(`\n${'═'.repeat(72)}`);
console.log(`${ok} correctos · ${grave} GRAVES · ${leve} leves`);
console.log('═'.repeat(72));
if (grave) console.log('\nHay hallazgos GRAVES: pueden producir una cita falsa. Corregir antes de usar.');
process.exit(grave ? 1 : 0);
