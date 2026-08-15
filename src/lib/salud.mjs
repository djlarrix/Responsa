/**
 * Chequeo de salud de las fuentes.
 *
 * Todas estas fuentes son sitios de terceros sin contrato: cambian sin aviso.
 * La forma de fallar peligrosa no es el error, es el resultado vacío que se
 * lee como "no hay jurisprudencia sobre esto". Este módulo consulta cada
 * fuente con una pregunta de respuesta conocida y verifica que siga
 * respondiendo lo que corresponde.
 */
import { buscarSentencias } from '../fuentes/pjud.mjs';
import { buscarNormas, verNorma } from '../fuentes/leychile.mjs';
import { buscarDoctrina } from '../fuentes/doctrina.mjs';
import { buscarDictamenes } from '../fuentes/contraloria.mjs';
import { consultarEstadistica } from '../fuentes/estadisticas.mjs';
import { listarMateriasArbitrales } from '../fuentes/arbitraje.mjs';
import { valorEconomico } from '../fuentes/valores.mjs';
import { buscarSentenciasTC } from '../fuentes/tconstitucional.mjs';
import { buscarDictamenesDT } from '../fuentes/direcciontrabajo.mjs';

/** Cada prueba es una consulta cuyo resultado correcto se conoce de antemano. */
const PRUEBAS = [
  {
    fuente: 'Jurisprudencia (Poder Judicial)',
    herramientas: ['buscar_jurisprudencia', 'jurisprudencia_por_norma', 'ver_sentencia'],
    async probar() {
      const r = await buscarSentencias({ texto: 'nulidad del despido', limite: 1, textoCompleto: false });
      if (!r.resultados.length) throw new Error('sin resultados para una consulta que siempre tiene');
      const s = r.resultados[0];
      if (!s.rol || !/^\d{4}-\d{2}-\d{2}$/.test(s.fecha)) throw new Error('el fallo llegó sin rol o sin fecha válida');
      if (!s.url) throw new Error('el fallo llegó sin permalink (url_acceso_sentencia)');
      return `${r.total.toLocaleString('es-CL')} fallos; el más reciente rol ${s.rol} (${s.fecha})`;
    },
  },
  {
    fuente: 'Jurisprudencia por norma',
    herramientas: ['jurisprudencia_por_norma'],
    async probar() {
      const r = await buscarSentencias({ tipoNorma: 'Ley', numNorma: '19496', numArt: '16', limite: 1, textoCompleto: false });
      if (!r.resultados.length) throw new Error('el filtro por norma y artículo dejó de devolver fallos');
      return `${r.total} fallos aplican el art. 16 de la Ley 19.496`;
    },
  },
  {
    fuente: 'Legislación (Ley Chile / BCN)',
    herramientas: ['buscar_ley', 'ver_norma'],
    async probar() {
      const b = await buscarNormas('ley 19496', 5);
      if (!b.normas.some((n) => n.numero === '19496')) throw new Error('la búsqueda ya no encuentra la Ley 19.496');
      const n = await verNorma('61438', '16');
      if (!n.encontrado) throw new Error('no se pudo extraer el art. 16 de la Ley 19.496');
      if (!n.texto || n.texto.length < 100) throw new Error('el artículo llegó vacío o truncado');
      return `${b.total.toLocaleString('es-CL')} normas indexadas; art. 16 recuperado (${n.texto.length} chars)`;
    },
  },
  {
    fuente: 'Doctrina (Crossref, revistas chilenas)',
    herramientas: ['buscar_doctrina'],
    async probar() {
      const d = await buscarDoctrina({ consulta: 'cláusulas abusivas contratos de adhesión', limite: 3 });
      if (!d.resultados.length) throw new Error('sin resultados');
      if (!d.resultados[0].doi) throw new Error('la doctrina llegó sin DOI');
      if (d.advertencia) throw new Error('ningún resultado fue pertinente: revisar el filtro de relevancia');
      return `${d.encontrados} trabajos pertinentes de ${d.revistas_consultadas} revistas`;
    },
  },
  {
    fuente: 'Dictámenes (Contraloría)',
    herramientas: ['buscar_dictamenes', 'ver_dictamen'],
    async probar() {
      const r = await buscarDictamenes({ texto: 'sumario administrativo', limite: 3 });
      if (!r.resultados.length) throw new Error('sin resultados');
      if (!r.resultados[0].unid || !r.resultados[0].numero) throw new Error('los dictámenes llegaron sin identificador');
      if (JSON.stringify(r.resultados).includes('�')) throw new Error('problema de codificación: acentos rotos');
      return `${r.total.toLocaleString('es-CL')} dictámenes; el más reciente ${r.resultados[0].numero}`;
    },
  },
  {
    fuente: 'Estadísticas judiciales',
    herramientas: ['estadisticas_judiciales'],
    async probar() {
      const e = await consultarEstadistica({ consulta: 'duracion_causas', corte: 0, tribunal: 0, competencia: 'Laboral', anio: 2024 });
      if (e.sin_datos) throw new Error('el servicio no devolvió datos para una consulta estándar');
      if (typeof e.promedio_general !== 'number') throw new Error('no llegó el promedio');
      return `duración laboral país 2024: ${Math.round(e.promedio_general)} días promedio`;
    },
  },
  {
    fuente: 'Arbitraje (CAM Santiago)',
    herramientas: ['buscar_laudos_arbitrales', 'listar_materias_arbitrales'],
    async probar() {
      const l = await listarMateriasArbitrales('materia');
      if (l.total < 100) throw new Error(`el índice trae sólo ${l.total} materias: probable cambio de estructura`);
      return `${l.total} materias, ${l.total_laudos} laudos con PDF`;
    },
  },
  {
    fuente: 'Tribunal Constitucional',
    herramientas: ['buscar_jurisprudencia_constitucional', 'buscar_fichas_constitucional'],
    async probar() {
      const r = await buscarSentenciasTC({ consulta: 'libertad de expresión', textoCompleto: false });
      if (!r.resultados.length) throw new Error('sin resultados para una consulta que siempre tiene');
      const s = r.resultados[0];
      if (!s.rol) throw new Error('la sentencia llegó sin rol');
      if (!s.pdf?.includes('/download')) throw new Error('la sentencia llegó sin enlace al PDF');
      return `${r.total} sentencias; la primera Rol ${s.rol} (${s.competencia.slice(0, 40)})`;
    },
  },
  {
    fuente: 'Dictámenes (Dirección del Trabajo)',
    herramientas: ['buscar_dictamenes_trabajo', 'ver_dictamen_trabajo'],
    async probar() {
      const r = await buscarDictamenesDT({ consulta: 'jornada de trabajo', limite: 3 });
      if (!r.total_indexado) throw new Error('el índice quedó vacío: cambiaron las portadillas de la DT');
      if (!r.resultados.length) throw new Error('sin resultados para una consulta que siempre tiene');
      const d = r.resultados[0];
      if (!d.numero || !d.url) throw new Error('el dictamen llegó sin número o sin enlace');
      return `${r.total_indexado} dictámenes indexados (${r.anios_consultados.join(', ')}); el primero ${d.numero}`;
    },
  },
  {
    fuente: 'Valores económicos (UF/UTM)',
    herramientas: ['valor_economico'],
    async probar() {
      const v = await valorEconomico({ indicador: 'uf' });
      if (!v.valor_actual || v.valor_actual < 1000) throw new Error('el valor de la UF llegó ausente o absurdo');
      return `UF ${v.fecha_valor}: $${v.valor_actual.toLocaleString('es-CL')}`;
    },
  },
];

/**
 * Corre todas las pruebas en paralelo y devuelve el estado de cada fuente.
 * Nunca lanza: el objetivo es informar, no interrumpir.
 */
export async function verificarFuentes() {
  const inicio = Date.now();
  const resultados = await Promise.all(
    PRUEBAS.map(async (p) => {
      const t0 = Date.now();
      try {
        const detalle = await p.probar();
        return { fuente: p.fuente, estado: 'ok', detalle, ms: Date.now() - t0, herramientas: p.herramientas };
      } catch (e) {
        return {
          fuente: p.fuente,
          estado: 'falla',
          problema: String(e?.message ?? e).slice(0, 300),
          ms: Date.now() - t0,
          herramientas: p.herramientas,
        };
      }
    }),
  );

  const fallas = resultados.filter((r) => r.estado === 'falla');
  return {
    verificado: new Date().toISOString(),
    fuentes_ok: resultados.length - fallas.length,
    fuentes_con_falla: fallas.length,
    resultados,
    veredicto: fallas.length
      ? `${fallas.length} de ${resultados.length} fuentes con problemas. NO uses las herramientas afectadas (${fallas
          .flatMap((f) => f.herramientas)
          .join(', ')}) sin advertir al usuario; y nunca completes con conocimiento propio lo que la fuente no entregó.`
      : `Las ${resultados.length} fuentes responden correctamente.`,
    ms_total: Date.now() - inicio,
  };
}
