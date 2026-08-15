/**
 * Valores económicos con efecto jurídico: UF, UTM, UTA, IPC, dólar.
 *
 * En derecho chileno estas unidades no son un dato de color: las multas se
 * expresan en UTM, los contratos y las indemnizaciones en UF, los reajustes en
 * IPC. Sin el valor a una fecha concreta no se puede calcular una pretensión.
 *
 * Fuente: mindicador.cl (API pública, sin clave, con serie histórica; los
 * valores provienen del Banco Central y el SII).
 */
import { pedir } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BASE = 'https://mindicador.cl/api';

const INDICADORES = {
  uf: 'Unidad de Fomento',
  utm: 'Unidad Tributaria Mensual',
  ipc: 'Índice de Precios al Consumidor (variación mensual)',
  dolar: 'Dólar observado',
  euro: 'Euro',
  ivp: 'Índice de Valor Promedio',
  tpm: 'Tasa de Política Monetaria',
};

/**
 * @param {object} p
 * @param {string} [p.indicador] uf|utm|ipc|dolar|euro|ivp|tpm. Si se omite, devuelve todos los de hoy.
 * @param {string} [p.fecha] DD-MM-AAAA para un día concreto (sólo con indicador).
 */
export async function valorEconomico({ indicador, fecha } = {}) {
  if (indicador && !INDICADORES[indicador]) {
    throw new Error(`Indicador desconocido: ${indicador}. Opciones: ${Object.keys(INDICADORES).join(', ')}`);
  }
  // Una fecha mal formada llegaba a mindicador y volvía como HTTP 500, que
  // parece una caída del servicio y no un dato mal escrito.
  if (fecha && !/^\d{2}-\d{2}-\d{4}$/.test(String(fecha).trim())) {
    throw new Error(`Fecha mal formada: "${fecha}". Debe ir como DD-MM-AAAA, por ejemplo 02-01-2024.`);
  }
  if (fecha && !indicador) {
    throw new Error('Para consultar una fecha pasada hay que indicar también el `indicador` (uf, utm, ipc…).');
  }

  // Los valores del día cambian; los históricos no. Se cachea distinto.
  const ruta = indicador ? (fecha ? `/${indicador}/${fecha}` : `/${indicador}`) : '';
  const ttl = fecha ? 2592000 : 3600;

  return conCache(`mindicador:${ruta}`, ttl, async () => {
    const res = await pedir(BASE + ruta, { headers: { Accept: 'application/json' }, timeoutMs: 20000 });
    if (!res.ok) throw new Error(`mindicador.cl respondió HTTP ${res.status}`);
    const j = JSON.parse(res.texto);

    if (!indicador) {
      const hoy = {};
      for (const k of Object.keys(INDICADORES)) {
        if (j[k]) hoy[k] = { nombre: j[k].nombre, valor: j[k].valor, unidad: j[k].unidad_medida, fecha: String(j[k].fecha).slice(0, 10) };
      }
      return { fecha: String(j.fecha).slice(0, 10), indicadores: hoy, fuente: 'mindicador.cl (Banco Central de Chile y SII)' };
    }

    const serie = (j.serie ?? []).map((s) => ({ fecha: String(s.fecha).slice(0, 10), valor: s.valor }));
    if (fecha && !serie.length) {
      return {
        indicador,
        sin_datos: true,
        mensaje: `No hay valor publicado de ${indicador.toUpperCase()} para ${fecha}. Verifica el formato DD-MM-AAAA y que sea un día hábil publicado.`,
        fuente: 'mindicador.cl',
      };
    }

    return {
      indicador,
      nombre: j.nombre ?? INDICADORES[indicador],
      unidad: j.unidad_medida ?? '',
      valor_actual: serie[0]?.valor ?? null,
      fecha_valor: serie[0]?.fecha ?? null,
      serie: serie.slice(0, 30),
      fuente: `mindicador.cl (Banco Central de Chile y SII) — ${BASE}${ruta}`,
    };
  });
}

export const INDICADORES_DISPONIBLES = INDICADORES;
