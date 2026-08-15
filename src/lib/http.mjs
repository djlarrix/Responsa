/**
 * Cliente HTTP común: User-Agent de navegador (la BCN responde 401 sin él),
 * timeout duro y reintento con espera ante 429/5xx.
 *
 * La BCN aplica un límite de servicio ("Service limit has been reached") que
 * salta con facilidad, así que todo lo que pase por aquí debe ir cacheado.
 */
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Intervalo mínimo entre peticiones al mismo host. La BCN corta con 429 ante
 * ráfagas muy modestas, y la doctrina dispara nueve consultas a Crossref a la
 * vez; sin esto, una sesión activa se auto-bloquea.
 */
const RITMO = {
  // El XML completo de una norma pesa cientos de KB y el límite de la BCN es
  // más estricto con documentos grandes: tres seguidos a 1,2 s bastaban para
  // gatillar el 429. 2,5 s aguanta descargar códigos completos en serie.
  'www.leychile.cl': 2500,
  'servicios-leychile.bcn.cl': 2500,
  'api.crossref.org': 250,
  'www.contraloria.cl': 400,
  'juris.pjud.cl': 300,
  // Construir el índice pide doce portadillas por año; sin freno, dt.gob.cl
  // rechaza la ráfaga y el índice queda vacío.
  'www.dt.gob.cl': 350,
  'buscador-backend.tcchile.cl': 300,
  'www.ccs.cl': 400,
};

const ultimaPeticion = new Map();
const colas = new Map();

/** Serializa por host y respeta el intervalo mínimo. */
function turno(host) {
  const min = RITMO[host];
  if (!min) return Promise.resolve();
  const previo = colas.get(host) ?? Promise.resolve();
  const propio = previo.then(async () => {
    const t = ultimaPeticion.get(host) ?? 0;
    const falta = min - (Date.now() - t);
    if (falta > 0) await espera(falta);
    ultimaPeticion.set(host, Date.now());
  });
  colas.set(host, propio.catch(() => {}));
  return propio;
}

/**
 * @param {string} url
 * @param {{metodo?: string, cuerpo?: any, headers?: Record<string,string>, timeoutMs?: number, intentos?: number}} opts
 * @returns {Promise<{ok: boolean, status: number, texto: string}>}
 */
export async function pedir(url, opts = {}) {
  const { metodo = 'GET', cuerpo, headers = {}, timeoutMs = 20000, intentos = 3 } = opts;

  let host = '';
  try {
    host = new URL(url).host;
  } catch {
    // url relativa o inválida: sin control de ritmo
  }

  let ultimo = { ok: false, status: 0, texto: '' };
  for (let i = 0; i < intentos; i++) {
    await turno(host);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: metodo,
        body: cuerpo,
        signal: ctrl.signal,
        headers: { 'User-Agent': UA, 'Accept-Language': 'es-CL,es;q=0.9', ...headers },
      });
      const texto = await res.text();
      ultimo = { ok: res.ok, status: res.status, texto, headers: res.headers };
      // 429 = límite de servicio; 5xx = caída transitoria. Ambos merecen reintento.
      // El 429 de la BCN no se suelta con esperas cortas: necesita segundos.
      if (res.status === 429 || res.status >= 500) {
        if (i < intentos - 1) {
          await espera(res.status === 429 ? 4000 * (i + 1) : 800 * 2 ** i);
          continue;
        }
      }
      return ultimo;
    } catch (e) {
      ultimo = { ok: false, status: 0, texto: String(e?.message ?? e) };
      if (i < intentos - 1) await espera(500 * 2 ** i);
    } finally {
      clearTimeout(t);
    }
  }
  return ultimo;
}

/** Quita etiquetas XML/HTML y normaliza espacios. */
export function aTextoPlano(s) {
  return String(s ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
