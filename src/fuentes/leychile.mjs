/**
 * Ley Chile (BCN) — legislación oficial.
 *
 * Servicios usados (verificados 15-ago-2026):
 *   opt=61&cadena=…      búsqueda de normas (XML)
 *   opt=7&idNorma=…      texto completo de la norma (XML estructurado)
 *
 * `opt=71` (artículo suelto) existe pero es el primero en toparse con el
 * límite de servicio, así que los artículos se extraen del XML completo, que
 * queda cacheado 7 días. La BCN devuelve 401 sin User-Agent de navegador y
 * 429 ("Service limit has been reached") con poco tráfico: todo va con caché.
 */
import { pedir } from '../lib/http.mjs';
import { conCache } from '../lib/cache.mjs';

const BUSQUEDA = 'https://www.leychile.cl/Consulta/obtxml?opt=61&cadena=';
const NORMA = 'https://www.leychile.cl/Consulta/obtxml?opt=7&idNorma=';
export const navUrl = (id) => `https://www.bcn.cl/leychile/navegar?idNorma=${id}`;

/** Códigos con idNorma fijo y verificado: resolución instantánea, sin red. */
const CODIGOS = {
  'codigo civil': { id: '172986', titulo: 'Código Civil' },
  'codigo del trabajo': { id: '207436', titulo: 'Código del Trabajo' },
  'codigo de comercio': { id: '1974', titulo: 'Código de Comercio' },
  'codigo penal': { id: '1984', titulo: 'Código Penal' },
  'codigo de procedimiento civil': { id: '22740', titulo: 'Código de Procedimiento Civil' },
  'codigo organico de tribunales': { id: '25563', titulo: 'Código Orgánico de Tribunales' },
  'codigo procesal penal': { id: '176595', titulo: 'Código Procesal Penal' },
  'codigo tributario': { id: '6374', titulo: 'Código Tributario' },
  'codigo de aguas': { id: '5605', titulo: 'Código de Aguas' },
  'codigo sanitario': { id: '5595', titulo: 'Código Sanitario' },
  'codigo de mineria': { id: '1133574', titulo: 'Código de Minería' },
  'codigo aeronautico': { id: '30287', titulo: 'Código Aeronáutico' },
  'codigo de justicia militar': { id: '18914', titulo: 'Código de Justicia Militar' },
  constitucion: { id: '242302', titulo: 'Constitución Política de la República' },
};

const DETECT = [
  [/c[oó]digo\s+del\s+trabajo/, 'codigo del trabajo'],
  [/c[oó]digo\s+de\s+procedimiento\s+civil/, 'codigo de procedimiento civil'],
  [/c[oó]digo\s+org[aá]nico\s+de\s+tribunales/, 'codigo organico de tribunales'],
  [/c[oó]digo\s+procesal\s+penal/, 'codigo procesal penal'],
  [/c[oó]digo\s+tributario/, 'codigo tributario'],
  [/c[oó]digo\s+de\s+aguas/, 'codigo de aguas'],
  [/c[oó]digo\s+sanitario/, 'codigo sanitario'],
  [/c[oó]digo\s+de\s+miner[ií]a/, 'codigo de mineria'],
  [/c[oó]digo\s+aeron[aá]utico/, 'codigo aeronautico'],
  [/c[oó]digo\s+de\s+justicia\s+militar/, 'codigo de justicia militar'],
  [/c[oó]digo\s+de\s+comercio/, 'codigo de comercio'],
  [/c[oó]digo\s+civil/, 'codigo civil'],
  [/c[oó]digo\s+penal/, 'codigo penal'],
  [/constituci[oó]n/, 'constitucion'],
];

/** Leyes muy citadas con idNorma verificado. */
const LEYES_FIJAS = {
  19496: { id: '61438', titulo: 'Ley 19.496 sobre Protección de los Derechos de los Consumidores' },
  18101: { id: '29526', titulo: 'Ley 18.101 sobre Arrendamiento de Predios Urbanos' },
  19799: { id: '196640', titulo: 'Ley 19.799 sobre Firma Electrónica' },
  18010: { id: '29438', titulo: 'Ley 18.010 sobre Operaciones de Crédito de Dinero' },
  20720: { id: '1058072', titulo: 'Ley 20.720 de Reorganización y Liquidación de Empresas y Personas' },
  21461: { id: '1178004', titulo: 'Ley 21.461 (Devuélveme Mi Casa)' },
  16744: { id: '28650', titulo: 'Ley 16.744 sobre Accidentes del Trabajo' },
  20416: { id: '1010668', titulo: 'Ley 20.416 sobre Empresas de Menor Tamaño' },
  19628: { id: '141599', titulo: 'Ley 19.628 sobre Protección de la Vida Privada' },
  21719: { id: '1209272', titulo: 'Ley 21.719 sobre Protección y Tratamiento de Datos Personales' },
};

/** Decodifica entidades numéricas del XML de la BCN (&#237; etc.). */
function decodificar(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    // La BCN usa &#160; a destajo. Decodificado queda un espacio duro que se ve
    // igual que uno normal pero rompe cualquier búsqueda sobre el texto.
    .replace(/\u00A0/g, ' ');
}

/**
 * Primer valor de una etiqueta. El `[\s\S]*?` no basta cuando la etiqueta
 * aparece anidada o repetida (p. ej. <Organismos><Organismo>): sin excluir el
 * `<` inicial, la captura arrastra la etiqueta interna.
 */
const et = (xml, tag) =>
  decodificar(xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`))?.[1] ?? '').trim();

/** Resuelve "Ley 19.496" o "Código Civil" a un idNorma, sin red cuando se puede. */
export function resolverCitaLocal(cita) {
  const c = String(cita).toLowerCase();
  const ley = c.match(/ley\s*n?[.°º\s]*(\d[\d.]*)/);
  if (ley) {
    const num = ley[1].replace(/\.$/, '').replace(/\./g, '');
    const fija = LEYES_FIJAS[num];
    if (fija) return { tipo: 'ley', numero: num, ...fija, url: navUrl(fija.id), verificada: true, tipo_resolucion: 'identificador_exacto' };
    return { tipo: 'ley', numero: num, id: null, titulo: `Ley ${ley[1]}`, verificada: false };
  }
  for (const [re, key] of DETECT) {
    if (re.test(c)) {
      const cod = CODIGOS[key];
      return { tipo: 'codigo', id: cod.id, titulo: cod.titulo, url: navUrl(cod.id), verificada: true, tipo_resolucion: 'identificador_exacto' };
    }
  }
  return null;
}

/** Búsqueda de normas en Ley Chile. */
export async function buscarNormas(consulta, limite = 8) {
  return conCache(`bcn:buscar:${consulta}:${limite}`, 86400, async () => {
    const res = await pedir(BUSQUEDA + encodeURIComponent(consulta), { headers: { Accept: 'application/xml' } });
    if (res.status === 429) throw new Error('Ley Chile alcanzó su límite de servicio. Reintenta en unos segundos.');
    if (!res.ok) throw new Error(`Ley Chile respondió HTTP ${res.status}`);

    const bloques = res.texto.split('<Norma>').slice(1, limite + 1);
    const normas = bloques.map((b) => {
      const id = b.match(/<IdNorma>(\d+)<\/IdNorma>/)?.[1] ?? '';
      return {
        idNorma: id,
        tipo: et(b, 'Descripcion'),
        numero: b.match(/<Numero>([^<]+)<\/Numero>/)?.[1] ?? '',
        titulo: et(b, 'TituloNorma'),
        publicacion: b.match(/<FechaPublicacion>([^<]+)<\/FechaPublicacion>/)?.[1] ?? '',
        vigencia: b.match(/<InicioDeVigencia>([^<]+)<\/InicioDeVigencia>/)?.[1] ?? '',
        url: navUrl(id),
      };
    });
    const total = res.texto.match(/<Normas total='(\d+)'/)?.[1];
    return { total: Number(total ?? normas.length), normas };
  });
}

/** Descarga y parsea una norma completa. Cacheada 7 días (las leyes cambian poco). */
async function normaCruda(idNorma) {
  return conCache(`bcn:norma:${idNorma}`, 604800, async () => {
    // Más intentos que el resto: bajar una norma completa es la petición más
    // pesada del servidor y la primera en toparse con el límite de la BCN.
    const res = await pedir(NORMA + encodeURIComponent(idNorma), {
      headers: { Accept: 'application/xml' },
      timeoutMs: 60000,
      intentos: 5,
    });
    if (res.status === 429) {
      throw new Error(
        'Ley Chile alcanzó su límite de servicio tras varios reintentos. Espera ~1 minuto. ' +
          'Una vez descargada, la norma queda en caché 7 días y no vuelve a pedirse.',
      );
    }
    if (!res.ok) throw new Error(`Ley Chile respondió HTTP ${res.status} para idNorma ${idNorma}`);
    const xml = res.texto;

    // Los artículos son <EstructuraFuncional tipoParte="Artículo"> anidados en títulos/párrafos.
    // Partimos por la etiqueta de apertura: cada fragmento contiene su propio <Texto> primero.
    const articulos = [];
    for (const frag of xml.split('<EstructuraFuncional').slice(1)) {
      const cabecera = frag.slice(0, frag.indexOf('>') + 1);
      if (!/tipoParte="Art/.test(decodificar(cabecera))) continue;
      const texto = decodificar(frag.match(/<Texto>([\s\S]*?)<\/Texto>/)?.[1] ?? '').trim();
      const nombre = decodificar(frag.match(/<NombreParte[^>]*>([\s\S]*?)<\/NombreParte>/)?.[1] ?? '').trim();
      const derogado = /derogado="derogado"/.test(cabecera);
      if (!texto) continue;
      articulos.push({ numero: nombre, derogado, texto });
    }

    return {
      idNorma: String(idNorma),
      titulo: et(xml, 'TituloNorma'),
      tipo: xml.match(/<Tipo>([^<]+)<\/Tipo>/)?.[1] ?? '',
      numero: xml.match(/<Numero>([^<]+)<\/Numero>/)?.[1] ?? '',
      organismo: et(xml, 'Organismo'),
      publicacion: xml.match(/fechaPublicacion="([^"]+)"/)?.[1] ?? '',
      promulgacion: xml.match(/fechaPromulgacion="([^"]+)"/)?.[1] ?? '',
      version: xml.match(/fechaVersion="([^"]+)"/)?.[1] ?? '',
      derogada: /(<Norma[^>]*)derogado="derogado"/.test(xml),
      nombreComun: et(xml, 'NombreUsoComun'),
      articulos,
      url: navUrl(idNorma),
    };
  });
}

/**
 * Los códigos chilenos se publican como texto refundido: el Código Civil es un
 * DFL cuyo artículo 2 CONTIENE el código entero. Por eso la BCN nombra sus
 * artículos "1545 (DEL ART. 2)", y el DFL además tiene sus propios artículos
 * 1 a 8. O sea que en la misma norma conviven un "1" (del DFL) y un
 * "1 (DEL ART. 2)" (el del Código Civil), que son cosas distintas.
 *
 * `cuerpo` identifica a cuál pertenece cada artículo: '' para los del DFL,
 * '2' para los que están dentro del artículo 2, etc.
 */
function partesDelNombre(nombreParte) {
  const s = String(nombreParte ?? '').trim();
  const m = s.match(/^(.*?)\s*\(\s*DEL\s+ART\.?\s*(\d+)\s*\)\s*$/i);
  return m ? { numero: m[1].trim(), cuerpo: m[2] } : { numero: s, cuerpo: '' };
}

/** Normaliza para comparar: quita "artículo", grados y espacios sobrantes. */
function normArticulo(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/^art[ií]culo\s*/, '')
    .replace(/^art\.?\s*/, '')
    .replace(/[°º]/g, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca un artículo aceptando que puede aparecer en más de un cuerpo.
 * Devuelve el del cuerpo dominante (el refundido, que es el código de verdad)
 * y deja constancia de los homónimos en vez de escoger en silencio.
 */
function buscarArticulo(articulos, buscado) {
  const objetivo = normArticulo(buscado);
  const coincidencias = articulos.filter((a) => normArticulo(partesDelNombre(a.numero).numero) === objetivo);
  if (!coincidencias.length) return { hit: null, homonimos: [] };
  if (coincidencias.length === 1) return { hit: coincidencias[0], homonimos: [] };

  // El cuerpo con más artículos es el texto refundido; los sueltos son las
  // disposiciones del decreto que lo fija.
  const porCuerpo = new Map();
  for (const a of articulos) {
    const c = partesDelNombre(a.numero).cuerpo;
    porCuerpo.set(c, (porCuerpo.get(c) ?? 0) + 1);
  }
  const elegido = coincidencias
    .slice()
    .sort((x, y) => (porCuerpo.get(partesDelNombre(y.numero).cuerpo) ?? 0) - (porCuerpo.get(partesDelNombre(x.numero).cuerpo) ?? 0))[0];

  return { hit: elegido, homonimos: coincidencias.filter((a) => a !== elegido) };
}

/**
 * Texto de una norma. Si se pide `articulo`, devuelve sólo ése.
 * @param {string|number} idNorma
 * @param {string} [articulo] p.ej. "16", "16 bis", "1°"
 */
export async function verNorma(idNorma, articulo) {
  const n = await normaCruda(idNorma);
  if (!articulo) {
    return {
      ...n,
      total_articulos: n.articulos.length,
      articulos: n.articulos.map((a) => ({ numero: a.numero, derogado: a.derogado, extracto: a.texto.slice(0, 180) })),
      nota: 'Para el texto completo de un artículo, vuelve a llamar indicando `articulo`.',
    };
  }
  const { hit, homonimos } = buscarArticulo(n.articulos, articulo);
  if (!hit) {
    return {
      encontrado: false,
      norma: n.titulo,
      url: n.url,
      mensaje: `No se encontró el artículo "${articulo}" en ${n.titulo}.`,
      articulos_disponibles: n.articulos.map((a) => a.numero).slice(0, 60),
    };
  }
  const { articulos, ...meta } = n;
  const partes = partesDelNombre(hit.numero);
  return {
    encontrado: true,
    ...meta,
    // El número limpio es el que se cita ("artículo 1545 del Código Civil").
    // El nombre crudo de la BCN incluye la referencia interna del refundido
    // ("1545 (DEL ART. 2)"), que no va en una cita.
    articulo: partes.numero,
    articulo_bcn: hit.numero,
    ...(partes.cuerpo ? { dentro_del_articulo: partes.cuerpo, nota_refundido: `${n.titulo.slice(0, 60)}… fija el texto refundido; el articulado va dentro de su artículo ${partes.cuerpo}.` } : {}),
    derogado: hit.derogado,
    // Un artículo derogado no sirve para fundar; se dice en vez de dejarlo
    // como un campo más que se puede pasar por alto.
    ...(hit.derogado
      ? { advertencia: `El artículo ${hit.numero} de ${n.titulo} figura DEROGADO. No sirve para fundar; verificar la norma que lo reemplazó.` }
      : {}),
    ...(homonimos.length
      ? {
          nota_homonimos:
            `Esta norma tiene ${homonimos.length + 1} artículos numerados "${articulo}" en cuerpos distintos ` +
            `(${[hit, ...homonimos].map((a) => a.numero).join(' / ')}). Se devolvió el del texto refundido, ` +
            'que es el articulado del código. Si buscabas otro, pídelo con el nombre completo.',
        }
      : {}),
    texto: hit.texto,
  };
}

const VACIAS_CITA = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'sobre', 'para', 'que', 'ley', 'decreto', 'codigo', 'norma']);

const sinTildesCita = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Resuelve una cita ("Ley 19.496", "Código Civil") a una norma verificada.
 *
 * Lo delicado es el caso contrario: una cita que no existe NO puede
 * resolverse. La búsqueda de la BCN siempre devuelve algo —"Ley de la Gravedad
 * Universal" traía una ley sobre tortura— y quedarse con el primer resultado
 * equivalía a inventar una norma con enlace y todo. Por eso ahora el título
 * encontrado tiene que compartir de verdad las palabras de la cita.
 */
export async function resolverCita(cita) {
  const local = resolverCitaLocal(cita);
  if (local?.verificada) return local;

  if (local?.tipo === 'ley') {
    const { normas } = await buscarNormas(`ley ${local.numero}`, 10);
    const exacta = normas.find((n) => n.numero.replace(/\./g, '') === local.numero);
    if (exacta) return { tipo: 'ley', numero: local.numero, id: exacta.idNorma, titulo: exacta.titulo, url: exacta.url, verificada: true, tipo_resolucion: 'identificador_exacto' };
    return { ...local, verificada: false, mensaje: `No existe una Ley ${local.numero} en Ley Chile, o no se pudo confirmar.` };
  }

  const { normas } = await buscarNormas(cita, 5);
  const terminos = [...new Set(sinTildesCita(cita).split(/[^a-z0-9ñ]+/).filter((t) => t.length > 3 && !VACIAS_CITA.has(t)))];

  if (terminos.length) {
    for (const n of normas) {
      const heno = sinTildesCita(`${n.titulo} ${n.tipo}`);
      const aciertos = terminos.filter((t) => heno.includes(t)).length;
      // Al menos dos términos de contenido, o el único que hubiera.
      if (aciertos >= Math.min(2, terminos.length)) {
        return {
          tipo: 'norma',
          id: n.idNorma,
          titulo: n.titulo,
          url: n.url,
          verificada: true,
          // Distinción que importa: "Ley 19.496" o "Código Civil" se resuelven
          // por identificador, y son ESA norma. Aquí sólo coincidió el título,
          // así que puede ser una norma sobre la materia y no la citada.
          tipo_resolucion: 'coincidencia_por_titulo',
          advertencia:
            `"${cita}" no es un identificador exacto: se encontró por coincidencia de título. ` +
            `Comprueba que "${n.titulo.slice(0, 70)}" sea efectivamente la norma buscada antes de citarla.`,
          terminos_coincidentes: aciertos,
        };
      }
    }
  }

  return {
    tipo: 'desconocida',
    cita,
    verificada: false,
    mensaje:
      `No se pudo confirmar que "${cita}" corresponda a una norma de Ley Chile. ` +
      'NO uses el resultado más parecido como si fuera esa norma: pide la cita exacta o busca con `buscar_ley`.',
    ...(normas.length ? { candidatos_no_confirmados: normas.slice(0, 3).map((n) => ({ titulo: n.titulo, idNorma: n.idNorma })) } : {}),
  };
}
