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
  const vistas = new Map();
  pares.forEach((par, i) => {
    const [nombre, articulo] = String(par).split(/\\t|\t/);
    const idNorma = ids[i];
    const clave = `${idNorma ?? nombre}|${articulo ?? ''}`;
    if (vistas.has(clave)) return;
    vistas.set(clave, {
      norma: (nombre ?? '').trim(),
      articulo: (articulo ?? '').trim(),
      idNorma: idNorma ?? null,
      url: idNorma ? `https://www.bcn.cl/leychile/navegar?idNorma=${idNorma}` : null,
    });
  });
  return [...vistas.values()];
}

/**
 * Solr devuelve, aparte de los documentos, los fragmentos que coincidieron con
 * la consulta (`highlighting: {id: {campo: [fragmentos]}}`). Son lo que permite
 * citar el pasaje pertinente en vez de decir "la sentencia trata el tema".
 */
function fragmentos(highlighting, id) {
  const h = highlighting?.[id];
  if (!h) return [];
  const salida = [];
  for (const valores of Object.values(h)) {
    for (const v of Array.isArray(valores) ? valores : [valores]) {
      const limpio = aTextoPlano(String(v));
      if (limpio && !salida.includes(limpio)) salida.push(limpio);
    }
  }
  return salida.slice(0, 6);
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
    materia: d.gls_libro_sup_s ?? '',
    descriptores: d.gls_descriptor_ss ?? [],
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
    normas_citadas: aplicadas.length ? [] : normasCitadas(d.TEXTO_ETIQUETADO_t),
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
function consultar(s, p, limite, pagina) {
  const cuerpo = new URLSearchParams({
    _token: s.token,
    id_buscador: s.id,
    filtros: armarFiltros(p),
    numero_filas_paginacion: String(limite),
    offset_paginacion: String((pagina - 1) * limite),
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
  const limite = Math.min(Math.max(p.limite ?? 5, 1), 50);
  const pagina = Math.max(p.pagina ?? 1, 1);

  // El token CSRF caduca antes que su TTL en caché (Laravel rota la sesión).
  // Si la primera consulta falla, se descarta la sesión y se reintenta con una
  // nueva: sin esto, el buscador queda inservible hasta que venza el caché.
  let s = await sesion(tribunal);
  let res = await consultar(s, p, limite, pagina);

  if (!res.ok || res.status === 419) {
    await invalidar(claveSesion(s.slug));
    s = await sesion(tribunal);
    res = await consultar(s, p, limite, pagina);
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
  const resultados = docs.map((d) => {
    const r = normalizar(d, s.nombre, tribunal);
    r.pasajes_coincidentes = fragmentos(json.highlighting, r.id);
    return r;
  });
  if (p.textoCompleto === false) {
    for (const r of resultados) r.texto = r.texto.slice(0, 1200) + (r.texto.length > 1200 ? '…' : '');
  }

  return {
    total: json?.response?.numFound ?? 0,
    pagina,
    mostrados: resultados.length,
    tribunal: s.nombre,
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
  const r = await buscarSentencias({ tribunal, rol: String(rol), era: String(era), limite: 5 });
  if (!r.resultados.length) return { encontrada: false, mensaje: `Sin resultados para rol ${rol}-${era} en ${r.tribunal}.` };
  return { encontrada: true, tribunal: r.tribunal, ...r.resultados[0], como_verificar: r.como_verificar };
}
