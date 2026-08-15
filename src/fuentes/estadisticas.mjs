/**
 * Estadísticas oficiales del Poder Judicial (estadisticaservices.pjud.cl).
 *
 * API pública, documentada en Swagger, SIN autenticación (137 endpoints).
 * Sirve para lo que ninguna base de jurisprudencia responde: cuánto demora
 * realmente un juicio, en qué termina, cuánta carga tiene un tribunal. Es la
 * diferencia entre "puede demandar" y "esto demora en promedio 222 días en
 * esta jurisdicción".
 *
 * Códigos de corte y tribunal según el documento de uso de APIs de la
 * Corporación Administrativa del Poder Judicial. Datos desde 2015.
 */
import { pedir } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://estadisticaservices.pjud.cl';

/** 0 = todo el país. Verificados contra el documento oficial de uso de APIs. */
export const CORTES = {
  0: 'Todo el país',
  10: 'C.A. de Arica',
  11: 'C.A. de Iquique',
  15: 'C.A. de Antofagasta',
  20: 'C.A. de Copiapó',
  25: 'C.A. de La Serena',
  30: 'C.A. de Valparaíso',
  35: 'C.A. de Rancagua',
  40: 'C.A. de Talca',
  45: 'C.A. de Chillán',
  46: 'C.A. de Concepción',
  50: 'C.A. de Temuco',
  55: 'C.A. de Valdivia',
  56: 'C.A. de Puerto Montt',
  60: 'C.A. de Coyhaique',
  61: 'C.A. de Punta Arenas',
  90: 'C.A. de Santiago',
  91: 'C.A. de San Miguel',
};

export const COMPETENCIAS = ['Civil', 'Cobranza', 'Familia', 'Laboral', 'Penal'];

/** Consultas útiles para ejercer, con su ruta y qué significa el valor. */
const CONSULTAS = {
  duracion_causas: {
    ruta: (a) => `/pjen/duracion_de_causas/${a.corte}/${a.tribunal}/${a.competencia}/${a.anio}`,
    necesita: ['corte', 'tribunal', 'competencia', 'anio'],
    unidad: 'días promedio de duración, por forma de término',
  },
  duracion_apelaciones: {
    ruta: (a) => `/pjen/duracion_causas_apelaciones/${a.corte}/${a.anio}`,
    necesita: ['corte', 'anio'],
    unidad: 'días promedio de duración, por tipo de recurso',
  },
  duracion_suprema: {
    ruta: (a) => `/pjen/duracion_causas_suprema/${a.corte}/${a.anio}`,
    necesita: ['corte', 'anio'],
    unidad: 'días promedio de duración, por sala',
  },
  ingresos_por_materia: {
    ruta: (a) => `/pjen/ingresos_por_materia/${a.corte}/${a.tribunal}/${a.competencia}/${a.anio}`,
    necesita: ['corte', 'tribunal', 'competencia', 'anio'],
    unidad: 'causas ingresadas, por materia',
  },
  terminos_por_materia: {
    ruta: (a) => `/pjen/terminos_por_materia/${a.corte}/${a.tribunal}/${a.competencia}/${a.anio}`,
    necesita: ['corte', 'tribunal', 'competencia', 'anio'],
    unidad: 'causas terminadas, por materia',
  },
  terminos_por_rol: {
    ruta: (a) => `/pjen/terminos_por_rol/${a.corte}/${a.tribunal}/${a.competencia}/${a.anio}`,
    necesita: ['corte', 'tribunal', 'competencia', 'anio'],
    unidad: 'causas terminadas, por tipo de término',
  },
  ingresos_recursos_suprema: {
    ruta: (a) => `/pjen/ingresos_recursos_suprema/${a.corte}/${a.anio}`,
    necesita: ['corte', 'anio'],
    unidad: 'recursos ingresados a la Corte Suprema',
  },
  terminos_recursos_apelaciones: {
    ruta: (a) => `/pjen/terminos_recursos_apelaciones/${a.corte}/${a.anio}`,
    necesita: ['corte', 'anio'],
    unidad: 'recursos terminados en Cortes de Apelaciones',
  },
  audiencias_realizadas: {
    ruta: (a) => `/pjen/audiencias_realizadas_competencia/${a.corte}/${a.tribunal}/${a.competencia}/${a.anio}`,
    necesita: ['corte', 'tribunal', 'competencia', 'anio'],
    unidad: 'audiencias realizadas',
  },
};

export const CONSULTAS_DISPONIBLES = Object.entries(CONSULTAS).map(([k, v]) => ({
  consulta: k,
  necesita: v.necesita,
  devuelve: v.unidad,
}));

/**
 * @param {object} p
 * @param {string} p.consulta clave de CONSULTAS
 * @param {number} [p.corte] 0 = país
 * @param {number} [p.tribunal] 0 = todos
 * @param {string} [p.competencia] Civil|Cobranza|Familia|Laboral|Penal
 * @param {number} p.anio desde 2015
 */
export async function consultarEstadistica(p) {
  const def = CONSULTAS[p.consulta];
  if (!def) throw new Error(`Consulta desconocida: ${p.consulta}. Opciones: ${Object.keys(CONSULTAS).join(', ')}`);

  const args = {
    corte: p.corte ?? 0,
    tribunal: p.tribunal ?? 0,
    competencia: p.competencia ?? 'Civil',
    anio: p.anio,
  };
  // Un año no numérico llegaba a la URL y volvía como HTTP 40x, que parece un
  // problema del servicio y no del dato pedido.
  const anio = Number(args.anio);
  if (!args.anio) throw new Error('Falta `anio` (hay datos desde 2015).');
  if (!Number.isInteger(anio) || anio < 2015 || anio > new Date().getFullYear()) {
    throw new Error(`Año inválido: "${args.anio}". Debe ser un año entre 2015 y ${new Date().getFullYear()}.`);
  }
  args.anio = anio;
  if (def.necesita.includes('competencia') && !COMPETENCIAS.includes(args.competencia)) {
    throw new Error(`Competencia inválida: ${args.competencia}. Opciones: ${COMPETENCIAS.join(', ')}`);
  }

  const ruta = def.ruta(args);
  return conCache(`pjud:est:${ruta}`, 604800, async () => {
    const res = await pedir(BASE + ruta, { headers: { Accept: 'application/json' }, timeoutMs: 30000 });
    if (res.status === 500) {
      throw new Error(
        `El servicio de estadísticas no tiene datos para esa combinación (${ruta}). ` +
          'Prueba con corte 0 (país), tribunal 0 (todos) u otro año.',
      );
    }
    if (!res.ok) throw new Error(`Estadísticas del PJUD respondieron HTTP ${res.status}`);

    let filas;
    try {
      filas = JSON.parse(res.texto);
    } catch {
      throw new Error('El servicio de estadísticas no devolvió JSON.');
    }

    // Una corte o tribunal inexistente no da error: devuelve 200 con lista vacía.
    // Sin esto, el modelo podría leer el silencio como "no hay causas".
    if (Array.isArray(filas) && filas.length === 0) {
      return {
        consulta: p.consulta,
        sin_datos: true,
        mensaje:
          `El servicio no tiene datos para corte=${args.corte}, tribunal=${args.tribunal}` +
          `${def.necesita.includes('competencia') ? `, competencia=${args.competencia}` : ''}, año=${args.anio}. ` +
          'Verifica los códigos con listar_fuentes (corte 0 = todo el país, tribunal 0 = todos) o prueba otro año. ' +
          'Esto NO significa que no existan causas.',
        fuente: `${BASE}${ruta}`,
      };
    }

    const promedio = Array.isArray(filas) && filas[0]?.prom != null ? filas[0].prom : null;
    return {
      consulta: p.consulta,
      corte: CORTES[args.corte] ?? `Corte ${args.corte}`,
      tribunal: args.tribunal === 0 ? 'Todos' : String(args.tribunal),
      competencia: def.necesita.includes('competencia') ? args.competencia : undefined,
      anio: args.anio,
      unidad: def.unidad,
      promedio_general: promedio,
      filas: Array.isArray(filas) ? filas.map((f) => ({ concepto: f.key, valor: f.value })) : filas,
      fuente: `Subdepartamento de Estadísticas, Corporación Administrativa del Poder Judicial (${BASE}${ruta})`,
    };
  });
}
