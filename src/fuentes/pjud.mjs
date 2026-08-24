/**
 * Buscador Unificado de Fallos del Poder Judicial (juris.pjud.cl).
 *
 * No hay API documentada. El buscador es una app Laravel + Solr; la búsqueda
 * real es POST /busqueda/buscar_sentencias con el token CSRF de la página y la
 * cookie de sesión. Verificado el 15-ago-2026 contra los 7 buscadores.
 *
 * El endpoint NO exige resolver captcha: el reCAPTCHA de la página valida la
 * carga del sitio, pero no participa del payload de búsqueda.
 *
 * Lo valioso frente a un buscador de texto: `tipo_norma` + `num_norma` +
 * `num_art` permiten pedir "fallos que aplican el art. 16 de la Ley 19.496",
 * y cada sentencia trae un XML etiquetado que enlaza las normas citadas a
 * Ley Chile por idNorma.
 */
import { pedir, aTextoPlano } from '../lib/http.mjs';
import { conCache, invalidar } from '../lib/cache.mjs';

const BASE = 'https://juris.pjud.cl';

/** Extracto por fallo cuando no se pidió el texto íntegro. */
const TOPE_EXTRACTO = 1200;

/** id_buscador verificado por buscador (leído de `var id_buscador_activo` en cada página). */
export const BUSCADORES = {
  corte_suprema: { slug: 'Corte_Suprema', id: '528', nombre: 'Corte Suprema' },
  corte_apelaciones: { slug: 'Corte_de_Apelaciones', id: '168', nombre: 'Corte de Apelaciones' },
  laborales: { slug: 'Laborales', id: '271', nombre: 'Juzgados Laborales' },
  penales: { slug: 'Penales', id: '268', nombre: 'Juzgados con competencia penal' },
  familia: { slug: 'Familia', id: '270', nombre: 'Juzgados de Familia' },
  cobranza: { slug: 'Cobranza', id: '269', nombre: 'Juzgados de Cobranza Laboral y Previsional' },
  civiles: { slug: 'Civiles', id: '328', nombre: 'Juzgados Civiles' },
};

const claveSesion = (slug) => `pjud:sesion:${slug}`;

/**
 * Convierte un fallo del PJUD en un diagnóstico que sirva.
 *
 * Cuando se les cae la base Oracle devuelven un 500 con `ORA-12541: TNS:no
 * listener` dentro del HTML. Decir sólo "HTTP 500" invita a buscar el problema
 * en el lugar equivocado: conviene nombrar que la caída es de ellos y que no
 * hay nada que reintentar del lado de acá.
 */
function diagnosticar(res) {
  const ora = res.texto?.match(/ORA-\d+[^<&]*/)?.[0];
  if (ora) {
    return (
      `El buscador del Poder Judicial está caído: su base de datos responde "${ora.trim()}". ` +
      'Es una falla del organismo, no de esta herramienta ni de la consulta. ' +
      'Las demás fuentes siguen disponibles; reintenta el Poder Judicial más tarde.'
    );
  }
  if (res.status === 503 || res.status === 504) {
    return `El buscador del Poder Judicial no responde (HTTP ${res.status}). Suele ser transitorio.`;
  }
  return `No se pudo abrir el buscador del PJUD (HTTP ${res.status})`;
}

/** Sesión (token CSRF + cookies + id_buscador). Se cachea corto: el token caduca. */
async function sesion(tribunal) {
  const b = BUSCADORES[tribunal];
  if (!b) throw new Error(`Tribunal desconocido: ${tribunal}. Opciones: ${Object.keys(BUSCADORES).join(', ')}`);

  return conCache(claveSesion(b.slug), 600, async () => {
    const res = await pedir(`${BASE}/busqueda?${b.slug}`, { headers: { Accept: 'text/html' } });
    if (!res.ok) throw new Error(diagnosticar(res));
    const token = res.texto.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
    const id = res.texto.match(/var\s+id_buscador_activo\s*=\s*(\d+)/)?.[1] ?? b.id;
    const cookies = (res.headers?.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    if (!token) throw new Error('El PJUD cambió su página: no se encontró el token CSRF.');
    return { token, cookies, id, slug: b.slug, nombre: b.nombre };
  });
}

function armarFiltros(f = {}) {
  return JSON.stringify({
    rol: f.rol ?? '',
    era: f.era ?? '',
    fec_desde: f.desde ?? '',
    fec_hasta: f.hasta ?? '',
    tipo_norma: f.tipoNorma ?? '',
    num_norma: f.numNorma ?? '',
    num_art: f.numArt ?? '',
    num_inciso: f.numInciso ?? '',
    todas: f.todas ?? '',
    algunas: f.algunas ?? '',
    excluir: f.excluir ?? '',
    literal: f.literal ?? '',
    proximidad: '',
    distancia: '',
    analisis_s: '11',
    submaterias: '',
    facetas_seleccionadas: [],
    filtros_omnibox: f.texto ? [{ categoria: 'TEXTO', valores: [f.texto] }] : [],
    ids_comunas_seleccionadas_mapa: [],
  });
}

/**
 * Extrae del XML etiquetado las normas citadas por la sentencia, con su
 * idNorma de Ley Chile. Esto es lo que permite dar fuentes verificables sin
 * que el modelo invente nada.
 */
function normasCitadas(xmlEtiquetado) {
  const xml = Array.isArray(xmlEtiquetado) ? xmlEtiquetado[0] : xmlEtiquetado;
  if (!xml) return [];
  const vistas = new Map();
  const re = /<Documento\b([^>]*)>([\s\S]*?)<\/Documento>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const idNorma = attrs.match(/idNorma="(\d+)"/)?.[1];
    if (!idNorma) continue;
    const etiqueta = attrs.match(/etiqueta="([^"]*)"/)?.[1] ?? '';
    const arts = [...m[2].matchAll(/<Articulo\b[^>]*idParte="([^"]+)"/g)].map((a) => a[1]);
    const clave = idNorma;
    const previo = vistas.get(clave);
    const todos = new Set([...(previo?.articulos ?? []), ...arts]);
    vistas.set(clave, {
      norma: etiqueta || previo?.norma || `Norma ${idNorma}`,
      idNorma,
      articulos: [...todos],
      url: `https://www.bcn.cl/leychile/navegar?idNorma=${idNorma}`,
    });
  }
  return [...vistas.values()];
}

/**
 * Normas aplicadas según los campos estructurados del índice, que son más
 * fiables que parsear el XML: `norma_articulo_ss` trae "CODIGO DEL TRABAJO\tART.
 * 483" e `id_norma_ss` el idNorma correlativo, así que cada norma sale con su
 * enlace a Ley Chile.
 *
 * OJO: `gls_titulonorma_ss` NO está alineado con estos dos arreglos — Solr no
 * garantiza correspondencia posicional entre campos multivaluados distintos, y
 * en la práctica devuelve el título del Código Civil junto al nombre del Código
 * de Procedimiento Civil. Se descarta a propósito: una cita con el título
 * cambiado es peor que una sin título. El par nombre↔idNorma sí corresponde
 * (verificado contra varios fallos) porque ambos derivan de la misma parte.
 */
function normasAplicadas(d) {
  const pares = d.norma_articulo_ss ?? [];
  const ids = d.id_norma_ss ?? [];
  // Se agrupa por norma en vez de listar un registro por artículo. Un fallo que
  // aplica cinco artículos del Código del Trabajo devolvía cinco veces el
  // nombre del código y cinco veces la misma URL de la BCN. Agrupado dice lo
  // mismo, ocupa un tercio y se lee como se cita: "los arts. 58, 160 y 171 del
  // Código del Trabajo".
  const porNorma = new Map();
  const vistas = new Set();
  pares.forEach((par, i) => {
    const [nombre, articulo] = String(par).split(/\\t|\t/);
    const idNorma = ids[i] ?? null;
    const crudo = (articulo ?? '').trim();
    const clave = `${idNorma ?? nombre}|${crudo}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);

    // Los códigos son textos refundidos, así que el PJUD nombra sus artículos
    // "ART. 1545 (DEL ART. 2)". Esa coletilla es una referencia interna al
    // decreto que fija el texto y NO va en una cita: se cita "artículo 1545
    // del Código Civil". Se separa para no arrastrarla a un escrito.
    const m = crudo.match(/^(.*?)\s*\(\s*DEL\s+ART\.?\s*(\d+)\s*\)\s*$/i);
    const limpio = (m ? m[1] : crudo).replace(/^ART\.?\s*/i, '').trim();

    const claveNorma = String(idNorma ?? nombre ?? '');
    if (!porNorma.has(claveNorma)) {
      porNorma.set(claveNorma, {
        norma: (nombre ?? '').trim(),
        idNorma,
        url: idNorma ? `https://www.bcn.cl/leychile/navegar?idNorma=${idNorma}` : null,
        articulos: [],
        ...(m ? { dentro_del_articulo: m[2] } : {}),
      });
    }
    if (limpio) porNorma.get(claveNorma).articulos.push(limpio);
  });
  return [...porNorma.values()];
}

/** Descriptores que se devuelven por fallo. Ver normalizar(). */
const TOPE_DESCRIPTORES = 8;

/** Pasajes coincidentes por fallo, y largo mínimo para que sean citables. */
const TOPE_PASAJES = 3;
const TOPE_PASAJE_MINIMO = 40;

/**
 * Solr devuelve, aparte de los documentos, los fragmentos que coincidieron con
 * la consulta (`highlighting: {id: {campo: [fragmentos]}}`). Son lo que permite
 * citar el pasaje pertinente en vez de decir "la sentencia trata el tema".
 */
function fragmentos(hl, id) {
  const campos = hl?.[id];
  if (!campos) return [];
  const vistos = new Set();
  const utiles = [];
  for (const lista of Object.values(campos)) {
    for (const f of lista ?? []) {
      const t = aTextoPlano(f).trim();
      // Solr a veces devuelve recortes de cuatro caracteres. Eso no es un
      // pasaje: es ruido que, puesto entre comillas, parecería una cita.
      if (t.length < TOPE_PASAJE_MINIMO) continue;
      const clave = t.toLowerCase();
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      utiles.push(t);
      // Tres pasajes bastan para juzgar si el fallo sirve y para citarlo. Uno
      // traía siete, todos del mismo razonamiento.
      if (utiles.length >= TOPE_PASAJES) return utiles;
    }
  }
  return utiles;
}

/**
 * Empareja el rol con el tribunal que efectivamente dictó el fallo.
 *
 * Aquí estaba el error más peligroso del módulo: `gls_corte_s` es la Corte de
 * Apelaciones por la que PASÓ la causa, no necesariamente quien resolvió. Un
 * fallo de la Corte Suprema con rol 34.956-2026 traía `gls_corte_s` =
 * "C.A. de Chillán", y publicarlos juntos hacía citar "C.A. de Chillán, rol
 * 34.956-2026" — un tribunal que nunca dictó ese rol.
 *
 * Los campos con sufijo `_sup_` (rol, sala, resultado) son de la Corte Suprema;
 * los `_ape_`, de la Corte de Apelaciones. Se toma el par que corresponde al
 * buscador consultado y se deja la corte de origen en su propio campo.
 */
function tribunalYRol(d, clave, nombreBuscador) {
  const sup = d.rol_era_sup_s || '';
  const ape = d.rol_era_ape_s || '';

  if (clave === 'corte_suprema' && sup) {
    return { tribunal: 'Corte Suprema', rol: sup, sala: d.gls_sala_sup_s ?? '' };
  }
  if (clave === 'corte_apelaciones' && ape) {
    return { tribunal: d.gls_corte_s || 'Corte de Apelaciones', rol: ape, sala: '' };
  }
  // Juzgados (laborales, civiles, penales, familia, cobranza). Estos
  // buscadores reutilizan `rol_era_sup_s` para el RIT del propio juzgado
  // ("T-50-2025", "C-1657-2024") y no traen `gls_corte_s`. El tribunal es el
  // juzgado concreto: "Juzgados Laborales" no es un tribunal citable.
  if (d.gls_juz_s) return { tribunal: d.gls_juz_s, rol: sup || ape || '', sala: '' };

  // Sin un par claro, se prefiere no afirmar de más.
  return { tribunal: nombreBuscador, rol: sup || ape || '', sala: d.gls_sala_sup_s ?? '' };
}

/**
 * Junta los documentos que pertenecen a una misma causa.
 *
 * Cuando la Corte acoge una casación o una unificación, publica DOS
 * documentos: la sentencia que acoge y la de reemplazo. El buscador los
 * devuelve por separado, con la misma carátula, la misma fecha, los mismos
 * ministros y los mismos descriptores. Presentarlos como dos resultados
 * ocupaba dos de los cinco cupos, duplicaba todo el contenido y —lo peor—
 * hacía parecer que había dos precedentes donde hay uno.
 *
 * Se fusiona sólo con tribunal, rol Y carátula idénticos: tres coincidencias,
 * porque juntar dos causas distintas sería mucho peor que mostrarlas aparte.
 */
function fusionarPorCausa(resultados) {
  const porCausa = new Map();
  const orden = [];

  for (const r of resultados) {
    // Sin rol no hay forma segura de saber si es la misma causa.
    const clave = r.rol ? `${r.tribunal}|${r.rol}|${r.caratulado}` : null;
    if (!clave || !porCausa.has(clave)) {
      if (clave) porCausa.set(clave, r);
      orden.push(clave ? porCausa.get(clave) : r);
      r.resoluciones = [{ resultado: r.resultado, fecha: r.fecha, id: r.id }];
      continue;
    }

    const base = porCausa.get(clave);
    base.resoluciones.push({ resultado: r.resultado, fecha: r.fecha, id: r.id });

    // Se conserva el pronunciamiento que más aporta: entre "acoge la
    // unificación" y su sentencia de reemplazo, la causa vale por el primero.
    if (pesoDe(r.aporte) < pesoDe(base.aporte)) {
      base.aporte = r.aporte;
      base.resultado = r.resultado;
    }
    base.normas_aplicadas = unirNormas(base.normas_aplicadas, r.normas_aplicadas);
    base.pasajes_coincidentes = [
      ...new Set([...(base.pasajes_coincidentes ?? []), ...(r.pasajes_coincidentes ?? [])]),
    ];
    // El texto de la de reemplazo suele ser el que contiene la decisión nueva.
    if ((r.texto?.length ?? 0) > (base.texto?.length ?? 0)) base.texto = r.texto;
  }

  for (const r of orden) {
    if (r.resoluciones.length > 1) {
      // Ordenadas de la más antigua a la más nueva: primero se acoge, después
      // se reemplaza.
      r.resoluciones.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    } else {
      delete r.resoluciones;
    }
  }
  return orden;
}

/** Une dos listas de normas aplicadas sin repetir norma ni artículo. */
function unirNormas(a = [], b = []) {
  const porClave = new Map();
  for (const n of [...a, ...b]) {
    const clave = String(n.idNorma ?? n.norma ?? '');
    if (!porClave.has(clave)) {
      porClave.set(clave, { ...n, articulos: [...(n.articulos ?? [])] });
    } else {
      const acc = porClave.get(clave);
      for (const art of n.articulos ?? []) if (!acc.articulos.includes(art)) acc.articulos.push(art);
    }
  }
  return [...porClave.values()];
}

/**
 * Cuánto aporta un fallo a una investigación jurídica.
 *
 * Medido sobre 100 fallos reales de la Corte Suprema (21-ago-2026): un tercio
 * son declaraciones de inadmisibilidad. No resuelven el asunto, no fijan
 * criterio y, ordenados por fecha, copan las primeras posiciones. Un abogado
 * que busca cómo se resuelve un tema no quiere leerlos.
 *
 * Se lee `resultado_recurso_sup_s`, que el propio Poder Judicial rellena con
 * la parte resolutiva. La clasificación NO descarta nada: reordena y avisa,
 * porque un inadmisible puede ser justo lo que se busca (por ejemplo, para
 * mostrar que la Corte no ha entrado al fondo de una materia).
 */
function valorDoctrinal(resultado, clave) {
  const r = (resultado ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (!r.trim()) return null; // Los juzgados no llenan este campo.

  // Rechazos en limine: el art. 782 del CPC permite rechazar la casación sin
  // entrar al fondo, y eso no es un pronunciamiento sobre el derecho.
  if (/MANIFIESTA FALTA DE FUNDAMENTO|NO ES MATERIA PROPIA|ASUNTO CASUISTICO|MATERIA UNIFICADA O SIN DISPE/.test(r)) {
    return 'no entra al fondo';
  }
  // La Corte fija criterio: unificación acogida, casación en el fondo acogida,
  // sentencia de reemplazo o casación de oficio. Sólo la Corte Suprema: una
  // Corte de Apelaciones que acoge un recurso resuelve ese caso, no fija
  // doctrina, y rotularlo así le atribuiría una autoridad que no tiene.
  if (
    /ACOGE.*UNIFICACION|ACOGID[AO].*UNIFICACION/.test(r) ||
    /SENTENCIA DE REEMPLAZO/.test(r) ||
    /(ACOGID[AO]|\bCASA\b).*(CASACION )?(EN EL )?FONDO/.test(r) ||
    /(\bCASA\b|ANULA) .*DE OFICIO/.test(r)
  ) {
    return clave === 'corte_suprema' ? 'fija doctrina' : 'resuelve el fondo';
  }
  // Hay pronunciamiento sobre el asunto aunque el recurso no prospere.
  if (/RECHAZ|ACOGID[AO]|ACOGE|CONFIRMA|REVOCA|INVALIDA|ANULA/.test(r)) {
    return 'resuelve el fondo';
  }
  // Inadmisibilidades y terminaciones anticipadas sin pronunciamiento alguno.
  if (/INADMISIBLE|TENGASE POR NO PRESENTAD|DESIERT|ABANDONAD|EXTEMPORANE|DESISTIMIENTO|INCOMPETEN|NO HA LUGAR A TRAMITAR/.test(r)) {
    return 'no entra al fondo';
  }
  return null;
}

/** Orden de preferencia al reordenar resultados. Menor = se muestra antes. */
const PESO_APORTE = { 'fija doctrina': 0, 'resuelve el fondo': 1, 'no entra al fondo': 3 };
const pesoDe = (a) => PESO_APORTE[a] ?? 2; // Sin dato (juzgados): ni premiado ni castigado.

function normalizar(d, nombreBuscador, clave) {
  const texto = aTextoPlano(d.texto_sentencia ?? d.texto_sentencia_preview ?? '');
  const anonimizado = texto === 'ANONIMIZADO' || d.caratulado_s === 'ANONIMIZADO';
  const aplicadas = normasAplicadas(d);
  const { tribunal, rol, sala } = tribunalYRol(d, clave, nombreBuscador);
  return {
    id: String(d.id ?? d.sent__crr_documento_i ?? ''),
    rol,
    fecha: String(d.fec_sentencia_sup_dt ?? '').slice(0, 10),
    tribunal,
    // La corte por la que pasó la causa antes de llegar arriba. No es quien
    // dictó este fallo: va aparte para que nunca se cite junto al rol.
    corte_de_origen: d.gls_corte_s && d.gls_corte_s !== tribunal ? d.gls_corte_s : undefined,
    sala,
    caratulado: d.caratulado_s ?? '',
    tipo_recurso: d.gls_tip_recurso_sup_s ?? '',
    resultado: d.resultado_recurso_sup_s ?? '',
    // Cuánto sirve para investigar. Ver valorDoctrinal(): un tercio de los
    // fallos de la Suprema son inadmisibilidades que no resuelven nada.
    aporte: valorDoctrinal(d.resultado_recurso_sup_s, clave) ?? undefined,
    materia: d.gls_libro_sup_s ?? '',
    // Un fallo trae hasta trece descriptores y los últimos suelen ser el
    // nombre de las partes o materias marginales. Los primeros son la materia.
    descriptores: (d.gls_descriptor_ss ?? []).slice(0, TOPE_DESCRIPTORES),
    ministros: d.gls_ministro_ss ?? (d.sent__gls_int_firma_sup_s ?? '').split(',').filter(Boolean),
    // En los juzgados no hay ministros sino juez de la causa.
    juez: d.gls_juez_ss ?? undefined,
    redactor: d.gls_redactor_s ?? '',
    // El RUC identifica la causa a nivel nacional y es lo que permite
    // encontrarla después en la Oficina Judicial Virtual.
    ruc: d.sent__RUC_s ?? undefined,
    anonimizado,
    // Historia procesal: permite seguir la causa desde primera instancia.
    // El PJUD rellena con 1900 y 0 cuando no tiene el dato, así que un rol
    // "75-1900" sería inventado; en ese caso se deja sólo el tribunal.
    historia: {
      primera_instancia: d.gls_juz_s
        ? d.rol_juz_i && d.era_juz_i && d.era_juz_i > 1900
          ? `${d.gls_juz_s} rol ${d.rol_juz_i}-${d.era_juz_i}`
          : d.gls_juz_s
        : null,
      corte_apelaciones: d.rol_era_ape_s || null,
      corte_suprema: d.rol_era_sup_s || null,
    },
    // Cita ya armada por el propio buscador del Poder Judicial.
    cita: d.cita_bibliografica ?? '',
    normas_aplicadas: aplicadas,
    ...(aplicadas.length ? {} : { normas_citadas: normasCitadas(d.TEXTO_ETIQUETADO_t) }),
    paginas: d.sent__npages_i ?? null,
    // Permalinks estables del buscador. Abrirlos pide cuenta gratuita en
    // juris.pjud.cl; el texto completo ya viene en `texto`, así que la
    // verificación no depende del enlace.
    url: d.url_acceso_sentencia ?? null,
    url_corta: d.url_corta_acceso_sentencia ?? null,
    texto,
  };
}

/** Ejecuta el POST de búsqueda con una sesión dada. */
function consultar(s, p, filas, pagina, factor = 1) {
  const cuerpo = new URLSearchParams({
    _token: s.token,
    id_buscador: s.id,
    filtros: armarFiltros(p),
    numero_filas_paginacion: String(filas),
    // Con sobre-consulta cada página cubre su propia ventana de `filas`
    // resultados, así que la paginación sigue sin solaparse.
    offset_paginacion: String((pagina - 1) * filas),
    orden: p.orden === 'relevancia' ? 'relevancia' : 'recientes',
    personalizacion: 'false',
  });

  return pedir(`${BASE}/busqueda/buscar_sentencias`, {
    metodo: 'POST',
    cuerpo,
    headers: {
      Cookie: s.cookies,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: `${BASE}/busqueda?${s.slug}`,
      Accept: 'application/json, text/javascript, */*; q=0.01',
    },
    timeoutMs: 45000,
    intentos: 2,
  });
}

/**
 * Búsqueda de sentencias.
 * @param {object} p
 * @param {string} [p.tribunal] clave de BUSCADORES (default corte_suprema)
 * @param {string} [p.texto] texto libre
 * @param {string} [p.literal] frase exacta
 * @param {string} [p.todas] todas estas palabras
 * @param {string} [p.algunas] alguna de estas palabras
 * @param {string} [p.excluir] sin estas palabras
 * @param {string} [p.desde] YYYY-MM-DD
 * @param {string} [p.hasta] YYYY-MM-DD
 * @param {string} [p.rol] número de rol
 * @param {string} [p.era] año del rol
 * @param {string} [p.tipoNorma] p.ej. "Ley"
 * @param {string} [p.numNorma] p.ej. "19496"
 * @param {string} [p.numArt] p.ej. "16"
 * @param {number} [p.limite] 1..50
 * @param {number} [p.pagina] 1-based
 * @param {boolean} [p.textoCompleto] si false, recorta el texto
 */
export async function buscarSentencias(p = {}) {
  const tribunal = p.tribunal ?? 'corte_suprema';

  // Sin criterio de búsqueda, el PJUD devuelve su corpus entero ordenado por
  // fecha: 303.376 fallos, de los que se mostraban los primeros como si
  // respondieran la consulta. Un filtro sólo por fechas tampoco busca nada.
  const criterios = ['texto', 'literal', 'todas', 'algunas', 'rol', 'numNorma', 'numArt', 'tipoNorma'];
  if (!criterios.some((c) => String(p[c] ?? '').trim())) {
    throw new Error(
      'Falta el criterio de búsqueda. Indica al menos uno: `literal` (frase exacta), `todas`, ' +
        '`algunas`, `texto`, `rol`, o la norma aplicada (`tipoNorma` + `numNorma`). ' +
        'Sin criterio el buscador devuelve los fallos más recientes de cualquier materia, ' +
        'que no responden nada.',
    );
  }
  // Un `limite` no numérico daba NaN, y el PJUD respondía con un error que
  // parecía una caída suya. Se sanean aquí para que el fallo, si lo hay, sea
  // de verdad de la fuente.
  const nLimite = Number(p.limite);
  const nPagina = Number(p.pagina);
  const limite = Math.min(Math.max(Number.isFinite(nLimite) ? Math.trunc(nLimite) : 5, 1), 50);
  const pagina = Math.max(Number.isFinite(nPagina) ? Math.trunc(nPagina) : 1, 1);

  // El token CSRF caduca antes que su TTL en caché (Laravel rota la sesión).
  // Si la primera consulta falla, se descarta la sesión y se reintenta con una
  // nueva: sin esto, el buscador queda inservible hasta que venza el caché.
  // Se pide más de lo que se va a devolver para poder elegir. El PJUD ordena
  // por fecha, y como un tercio de lo reciente son inadmisibilidades, pedir
  // justo `limite` obliga a mostrar lo que venga. Pidiendo el triple se
  // seleccionan los fallos que sí resuelven. No encarece el contexto: lo que
  // cuesta tokens es lo que se devuelve, no lo que se revisa.
  const conceptual = Boolean(p.texto || p.literal || p.todas || p.algunas || p.numArt);
  const factor = conceptual && p.ordenarPorAporte !== false ? 3 : 1;
  const pedidos = Math.min(limite * factor, 30);

  let s = await sesion(tribunal);
  let res = await consultar(s, p, pedidos, pagina, factor);

  if (!res.ok || res.status === 419) {
    await invalidar(claveSesion(s.slug));
    s = await sesion(tribunal);
    res = await consultar(s, p, pedidos, pagina, factor);
  }

  if (!res.ok) throw new Error(`El buscador del PJUD respondió HTTP ${res.status}. ${res.texto.slice(0, 200)}`);

  let json;
  try {
    json = JSON.parse(res.texto);
  } catch {
    throw new Error(
      'El PJUD no devolvió JSON tras renovar la sesión. Probablemente cambió su buscador: ' +
        'revisar el payload de POST /busqueda/buscar_sentencias.',
    );
  }

  if (!json?.response) {
    throw new Error('El PJUD devolvió JSON sin el campo `response`: la estructura del buscador cambió.');
  }

  const docs = json.response.docs ?? [];
  let resultados = docs.map((d) => {
    const r = normalizar(d, s.nombre, tribunal);
    r.pasajes_coincidentes = fragmentos(json.highlighting, r.id);
    return r;
  });

  // Primero se juntan los documentos de una misma causa: si no, la sentencia
  // que acoge y su sentencia de reemplazo ocupan dos cupos y se leen como dos
  // precedentes distintos.
  const revisados = resultados.length;
  resultados = fusionarPorCausa(resultados);
  const causas = resultados.length;

  // Después se prefieren las que resuelven, conservando el orden por fecha
  // dentro de cada grupo (sort estable en Node >= 11).
  let apartados = 0;
  if (factor > 1) {
    resultados.sort((a, b) => pesoDe(a.aporte) - pesoDe(b.aporte));
    apartados = resultados.slice(limite).filter((r) => r.aporte === 'no entra al fondo').length;
    resultados = resultados.slice(0, limite);
  }

  // El texto íntegro de cinco fallos son ~25.000 tokens, y para decidir cuál
  // leer basta con los pasajes que coincidieron. Por eso el default es
  // recortado: quien necesite el fallo completo lo pide con `ver_sentencia` o
  // con texto_completo: true.
  if (p.textoCompleto !== true) {
    for (const r of resultados) {
      // Cuando hay pasajes coincidentes, el arranque del fallo aporta poco:
      // son los VISTOS, las partes y la historia procesal. Basta con lo justo
      // para situar el caso; lo que decide es el pasaje.
      const tope = r.pasajes_coincidentes?.length ? 500 : TOPE_EXTRACTO;
      if (r.texto.length > tope) {
        r.texto = r.texto.slice(0, tope) + '…';
        r.texto_recortado = true;
      }
    }
  }

  return {
    total: json?.response?.numFound ?? 0,
    pagina,
    mostrados: resultados.length,
    tribunal: s.nombre,
    ...(resultados.length === 0
      ? {
          sin_datos: true,
          sugerencia:
            'Sin coincidencias. Prueba con `literal` más corto, con `todas` en vez de `literal`, ' +
            'o busca por la norma aplicada. Que no aparezca aquí NO significa que no existan ' +
            'fallos: el buscador del Poder Judicial es una selección, no el universo de sentencias.',
        }
      : {}),
    ...(factor > 1 && revisados > 0
      ? {
          // Los juzgados no llenan la parte resolutiva, así que ahí no hay
          // nada que clasificar: decir "las que más aportan" sería inventar
          // un criterio que no se aplicó.
          seleccion:
            `Se revisaron ${revisados} documentos` +
            (causas < revisados ? `, que corresponden a ${causas} causas` : '') +
            (resultados.some((r) => r.aporte)
              ? `, y se muestran las ${resultados.length} que más aportan.`
              : `, y se muestran ${resultados.length}. Esta sede no publica la parte resolutiva, ` +
                'así que no se pudo ordenar por lo que aporta cada fallo: van por fecha.'),
          ...(apartados
            ? { quedaron_fuera_por_no_entrar_al_fondo: apartados }
            : {}),
        }
      : {}),
    resultados,
    como_verificar:
      `Cada fallo trae su permalink en \`url\` (buscador del Poder Judicial; abrirlo pide cuenta gratuita). ` +
      `También se ubica por rol en ${BASE}/busqueda?${s.slug}. El texto completo viene en \`texto\`.`,
  };
}

/**
 * Busca en TODOS los tribunales a la vez y mezcla los resultados.
 *
 * Preguntar "qué han fallado los tribunales sobre X" y mirar sólo la Corte
 * Suprema deja fuera cómo se resuelve en los hechos. Esto consulta los siete
 * buscadores en paralelo, ordena por fecha y deja ver de qué sede viene cada
 * fallo.
 */
export async function buscarEnTodos(p = {}) {
  const claves = Object.keys(BUSCADORES);
  const porTribunal = Math.max(2, Math.ceil((p.limite ?? 10) / 3));

  const tandas = await Promise.all(
    claves.map((t) =>
      buscarSentencias({ ...p, tribunal: t, limite: porTribunal, pagina: 1 })
        // `clave` va DESPUÉS del spread a propósito: la respuesta trae su
        // propio campo `tribunal` (el nombre para mostrar) y sobrescribía la
        // clave del buscador, dejando `BUSCADORES[...]` en undefined.
        .then((r) => ({ ok: true, ...r, clave: t }))
        .catch((e) => ({ ok: false, clave: t, error: String(e.message).slice(0, 140), resultados: [], total: 0 })),
    ),
  );

  const resultados = tandas
    .flatMap((t) => t.resultados.map((r) => ({ ...r, buscador: BUSCADORES[t.clave].nombre })))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .slice(0, p.limite ?? 10);

  const fallidos = tandas.filter((t) => !t.ok);
  return {
    total_por_tribunal: Object.fromEntries(tandas.map((t) => [t.clave, t.ok ? t.total : `error: ${t.error}`])),
    total_general: tandas.reduce((n, t) => n + (t.ok ? t.total : 0), 0),
    mostrados: resultados.length,
    resultados,
    // Si un buscador falló hay que decirlo: si no, el vacío parece ausencia de
    // jurisprudencia en esa sede y no una caída del servicio.
    ...(fallidos.length
      ? { advertencia: `No respondieron: ${fallidos.map((f) => BUSCADORES[f.clave].nombre).join(', ')}. Los resultados están incompletos.` }
      : {}),
    como_verificar: 'Cada fallo trae `url` (permalink), `rol`, `tribunal` y `buscador` (la sede donde se encontró).',
  };
}

/** Trae una sentencia concreta por rol y año. */
export async function verSentencia({ rol, era, tribunal = 'corte_suprema' }) {
  // Sin rol ni año la consulta salía vacía y el PJUD devolvía un error que
  // parecía una caída del servicio.
  if (!String(rol ?? '').trim() || !String(era ?? '').trim()) {
    throw new Error('Indica `rol` y `era` (año del rol). Por ejemplo: rol "34956", era "2026".');
  }

  // `textoCompleto` es imprescindible aquí: esta función existe para leer el
  // fallo entero. Sin él heredaba el recorte de la búsqueda y devolvía 1.200
  // caracteres bajo la promesa de "texto completo".
  const r = await buscarSentencias({
    tribunal,
    rol: String(rol),
    era: String(era),
    limite: 5,
    textoCompleto: true,
  });
  if (!r.resultados.length) return { encontrada: false, mensaje: `Sin resultados para rol ${rol}-${era} en ${r.tribunal}.` };
  return { encontrada: true, tribunal: r.tribunal, ...r.resultados[0], como_verificar: r.como_verificar };
}
