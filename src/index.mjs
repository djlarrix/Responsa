#!/usr/bin/env node
/**
 * Servidor MCP de fuentes jurídicas chilenas verificables.
 *
 * Herramientas:
 *   buscar_jurisprudencia    fallos del Poder Judicial por texto, frase o filtros
 *   jurisprudencia_por_norma fallos que aplican una norma y artículo concretos
 *   ver_sentencia            una sentencia por rol y año, con texto completo
 *   buscar_ley               normas en Ley Chile (BCN)
 *   ver_norma                texto oficial de una norma o de un artículo
 *   buscar_doctrina          doctrina académica chilena (Crossref)
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { BUSCADORES, buscarSentencias, buscarEnTodos, verSentencia } from './fuentes/pjud.mjs';
import { buscarSentenciasTC, buscarFichasTC } from './fuentes/tconstitucional.mjs';
import { buscarDictamenesDT, verDictamenDT, ANIOS as ANIOS_DT } from './fuentes/direcciontrabajo.mjs';
import { buscarNormas, verNorma, resolverCita } from './fuentes/leychile.mjs';
import { buscarDoctrina, REVISTAS } from './fuentes/doctrina.mjs';
import { buscarDictamenes, verDictamen } from './fuentes/contraloria.mjs';
import { consultarEstadistica, CONSULTAS_DISPONIBLES, CORTES, COMPETENCIAS } from './fuentes/estadisticas.mjs';
import { enlaceConsultaCausas, COMPETENCIAS_OJV } from './fuentes/causas.mjs';
import { buscarLaudos, listarMateriasArbitrales } from './fuentes/arbitraje.mjs';
import { valorEconomico, INDICADORES_DISPONIBLES } from './fuentes/valores.mjs';
import { verificarFuentes } from './lib/salud.mjs';

const TRIBUNALES = Object.keys(BUSCADORES);

const HERRAMIENTAS = [
  {
    name: 'buscar_jurisprudencia',
    description:
      'Busca sentencias reales del Poder Judicial de Chile. Devuelve rol, tribunal, fecha, carátula, ' +
      'resultado, texto completo, los pasajes que coinciden con la consulta y las normas aplicadas ' +
      'con enlace a Ley Chile.\n\n' +
      'ELIGE BIEN EL CAMPO, de eso depende la precisión:\n' +
      '• `literal` para una frase o institución jurídica exacta ("nulidad del despido", ' +
      '"enriquecimiento sin causa"). Es el más preciso: úsalo cuando la consulta nombra una figura.\n' +
      '• `todas` cuando deben concurrir varios conceptos ("tutela fuero maternal despido").\n' +
      '• `algunas` para sinónimos ("acoso hostigamiento").\n' +
      '• `texto` sólo para exploración amplia; devuelve mucho ruido.\n' +
      '• `excluir` para sacar una rama que contamina los resultados.\n' +
      'Puedes combinarlos, y todos aceptan además `desde`/`hasta` y `tribunal`.\n\n' +
      'Si la pregunta gira en torno a un artículo concreto, usa `jurisprudencia_por_norma`. ' +
      'Si quieres el panorama de todas las sedes, usa `buscar_jurisprudencia_en_todos`.',
    inputSchema: {
      type: 'object',
      properties: {
        literal: { type: 'string', description: 'Frase exacta. El campo más preciso.' },
        todas: { type: 'string', description: 'Deben aparecer todas estas palabras.' },
        algunas: { type: 'string', description: 'Debe aparecer alguna de estas palabras.' },
        texto: { type: 'string', description: 'Texto libre. Amplio y ruidoso; prefiere `literal` o `todas`.' },
        excluir: { type: 'string', description: 'No debe aparecer ninguna de estas palabras.' },
        tribunal: { type: 'string', enum: TRIBUNALES, description: 'Buscador a consultar. Default corte_suprema.' },
        desde: { type: 'string', description: 'Fecha mínima de la sentencia, YYYY-MM-DD.' },
        hasta: { type: 'string', description: 'Fecha máxima de la sentencia, YYYY-MM-DD.' },
        rol: { type: 'string', description: 'Número de rol, si se busca una causa concreta.' },
        era: { type: 'string', description: 'Año del rol.' },
        orden: { type: 'string', enum: ['recientes', 'relevancia'], description: 'Default recientes.' },
        limite: { type: 'number', description: 'Cuántos fallos traer (1-50). Default 5.' },
        pagina: { type: 'number', description: 'Página de resultados, empieza en 1.' },
        texto_completo: { type: 'boolean', description: 'Default false: cada fallo llega con extracto y `pasajes_coincidentes`, que es lo que sirve para decidir. Pon true sólo si necesitas leer los fallos íntegros, que cuesta mucho contexto; para uno concreto usa `ver_sentencia`.' },
      },
    },
  },
  {
    name: 'buscar_jurisprudencia_en_todos',
    description:
      'Busca la misma consulta en los SIETE buscadores del Poder Judicial a la vez (Corte Suprema, ' +
      'Cortes de Apelaciones, Laborales, Penales, Familia, Cobranza y Civiles) y mezcla los resultados. ' +
      'Úsala cuando pregunten en general "qué han resuelto los tribunales sobre X": mirar sólo la Corte ' +
      'Suprema muestra el criterio de casación, no cómo se falla en los hechos. Indica de qué sede ' +
      'viene cada fallo y avisa si algún buscador no respondió.',
    inputSchema: {
      type: 'object',
      properties: {
        literal: { type: 'string', description: 'Frase exacta. El campo más preciso.' },
        todas: { type: 'string', description: 'Deben aparecer todas estas palabras.' },
        algunas: { type: 'string', description: 'Debe aparecer alguna de estas palabras.' },
        texto: { type: 'string', description: 'Texto libre.' },
        excluir: { type: 'string', description: 'No debe aparecer ninguna de estas palabras.' },
        desde: { type: 'string', description: 'Fecha mínima, YYYY-MM-DD.' },
        hasta: { type: 'string', description: 'Fecha máxima, YYYY-MM-DD.' },
        limite: { type: 'number', description: 'Total de fallos a devolver. Default 10.' },
        texto_completo: { type: 'boolean', description: 'Default false: llega extracto más los párrafos coincidentes.' },
      },
    },
  },
  {
    name: 'jurisprudencia_por_norma',
    description:
      'Busca los fallos que APLICAN una norma concreta, opcionalmente un artículo específico. ' +
      'Ejemplo: qué ha resuelto la Corte Suprema sobre el artículo 16 de la Ley 19.496. ' +
      'Es la vía más precisa cuando la pregunta gira en torno a una disposición legal.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo_norma: { type: 'string', description: 'Tipo de norma, p.ej. "Ley", "Decreto Ley", "Código".' },
        numero: { type: 'string', description: 'Número de la norma sin puntos, p.ej. "19496".' },
        articulo: { type: 'string', description: 'Número del artículo, p.ej. "16".' },
        inciso: { type: 'string', description: 'Número del inciso.' },
        tribunal: { type: 'string', enum: TRIBUNALES, description: 'Default corte_suprema.' },
        desde: { type: 'string', description: 'Fecha mínima, YYYY-MM-DD.' },
        limite: { type: 'number', description: 'Cuántos fallos traer (1-50). Default 5.' },
      },
      required: ['tipo_norma', 'numero'],
    },
  },
  {
    name: 'ver_sentencia',
    description: 'Trae una sentencia concreta por su rol y año, con texto completo y normas citadas.',
    inputSchema: {
      type: 'object',
      properties: {
        rol: { type: 'string', description: 'Número de rol, p.ej. "10516".' },
        era: { type: 'string', description: 'Año del rol, p.ej. "2026".' },
        tribunal: { type: 'string', enum: TRIBUNALES, description: 'Default corte_suprema.' },
      },
      required: ['rol', 'era'],
    },
  },
  {
    name: 'buscar_ley',
    description:
      'Busca normas en Ley Chile (BCN): leyes, decretos, códigos. Devuelve idNorma, título, ' +
      'fecha de publicación y enlace oficial. Úsala para ubicar la norma antes de leerla.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Texto a buscar, p.ej. "ley 21719" o "protección de datos personales".' },
        limite: { type: 'number', description: 'Cuántas normas traer. Default 8.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'ver_norma',
    description:
      'Devuelve el texto oficial vigente de un artículo de una norma de Ley Chile. Acepta idNorma o ' +
      'una cita como "Ley 19.496" o "Código Civil". Úsala para citar texto legal literal en vez de ' +
      'reproducirlo de memoria. ' +
      'INDICA SIEMPRE `articulo` si sabes cuál necesitas. Sin él sólo devuelve el índice de números ' +
      'de artículo, porque el articulado completo de un código no cabe en el contexto.',
    inputSchema: {
      type: 'object',
      properties: {
        idNorma: { type: 'string', description: 'Identificador BCN, p.ej. "61438".' },
        cita: { type: 'string', description: 'Alternativa a idNorma: "Ley 19.496", "Código del Trabajo".' },
        articulo: { type: 'string', description: 'Artículo puntual, p.ej. "16" o "16 bis".' },
      },
    },
  },
  {
    name: 'buscar_doctrina',
    description:
      'Busca doctrina académica chilena en revistas jurídicas indexadas (Revista Chilena de Derecho, ' +
      'Ius et Praxis, Revista de Derecho de Valdivia, Estudios Constitucionales, Revista Chilena de ' +
      'Derecho Privado, entre otras). Devuelve autor, revista, año, DOI y cita armada. ' +
      'Cubre doctrina de acceso abierto, no bases de suscripción.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Tema doctrinal a buscar.' },
        limite: { type: 'number', description: 'Cuántos trabajos traer. Default 8.' },
        desde_anio: { type: 'number', description: 'Sólo publicaciones desde este año.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'buscar_dictamenes',
    description:
      'Busca dictámenes de la Contraloría General de la República (jurisprudencia administrativa). ' +
      'Es la fuente obligada en función pública, estatuto administrativo, sumarios, probidad, ' +
      'contratación administrativa y municipalidades. Devuelve número, fecha y descriptores.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto libre a buscar.' },
        numero: { type: 'string', description: 'Número de dictamen concreto.' },
        materia: { type: 'string', enum: ['Cualquiera', 'Generales', 'Municipales'], description: 'Default Cualquiera.' },
        desde: { type: 'string', description: 'Fecha mínima, DD/MM/AAAA.' },
        hasta: { type: 'string', description: 'Fecha máxima, DD/MM/AAAA.' },
        limite: { type: 'number', description: 'Cuántos traer (1-100). Default 10.' },
      },
    },
  },
  {
    name: 'ver_dictamen',
    description:
      'Trae un dictamen de la Contraloría con su texto completo, la materia resuelta, las fuentes ' +
      'legales que aplica, los dictámenes relacionados y su ESTADO (si fue reconsiderado, aclarado o ' +
      'confirmado). Consulta siempre el estado antes de citar: un dictamen reconsiderado ya no sirve ' +
      'para fundar. Necesita el `unid` que entrega buscar_dictamenes.',
    inputSchema: {
      type: 'object',
      properties: {
        unid: { type: 'string', description: 'Identificador del dictamen (32 caracteres hexadecimales).' },
        texto_completo: { type: 'boolean', description: 'Traer el texto íntegro. Default true.' },
      },
      required: ['unid'],
    },
  },
  {
    name: 'estadisticas_judiciales',
    description:
      'Estadísticas oficiales del Poder Judicial: cuánto DEMORAN las causas, cuántas ingresan y cómo ' +
      'terminan, por corte, tribunal, materia y año (desde 2015). Úsala cuando la pregunta sea sobre ' +
      'plazos reales, carga de trabajo o probabilidades prácticas, no sobre el derecho aplicable. ' +
      'Permite responder "esto demora en promedio X días en esta jurisdicción" con fuente oficial.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: {
          type: 'string',
          enum: CONSULTAS_DISPONIBLES.map((c) => c.consulta),
          description: 'Qué medir.',
        },
        corte: { type: 'number', description: 'Código de corte; 0 = todo el país. Usa listar_fuentes para verlos.' },
        tribunal: { type: 'number', description: 'Código de tribunal; 0 = todos.' },
        competencia: { type: 'string', enum: COMPETENCIAS, description: 'Materia (según la consulta).' },
        anio: { type: 'number', description: 'Año, desde 2015.' },
      },
      required: ['consulta', 'anio'],
    },
  },
  {
    name: 'consultar_causa',
    description:
      'Entrega el enlace y los pasos para consultar una causa en la Oficina Judicial Virtual. ' +
      'NO consulta automáticamente: la Consulta Unificada exige un token de reCAPTCHA en cada ' +
      'búsqueda. Usa esta herramienta cuando pidan el estado o los datos de una causa concreta, ' +
      'y explica que ese paso lo tiene que dar la persona.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['rol', 'nombre', 'rut_juridica'], description: 'Forma de búsqueda. Default rol.' },
        // Las competencias de la OJV NO son las mismas claves que los
        // buscadores de jurisprudencia (allá "laborales", aquí "laboral").
        competencia: { type: 'string', enum: Object.keys(COMPETENCIAS_OJV), description: 'Competencia ante la que se tramita.' },
        rol: { type: 'string' },
        era: { type: 'string', description: 'Año del rol.' },
        nombre: { type: 'string' },
        rut: { type: 'string', description: 'RUT sin dígito verificador (persona jurídica).' },
      },
    },
  },
  {
    name: 'buscar_laudos_arbitrales',
    description:
      'Busca laudos arbitrales del CAM Santiago (Centro de Arbitraje y Mediación de la Cámara de ' +
      'Comercio de Santiago), por materia o por árbitro. Devuelve el rol y el ENLACE AL PDF oficial ' +
      'del laudo. Úsala en materias comerciales, societarias, de construcción y contratos entre ' +
      'empresas, donde buena parte de los conflictos se resuelve en arbitraje y no aparece en los ' +
      'tribunales ordinarios.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Materia a buscar, o nombre del árbitro si `por` es "arbitro".' },
        por: { type: 'string', enum: ['materia', 'arbitro'], description: 'Índice a usar. Default materia.' },
        limite: { type: 'number', description: 'Cuántas entradas traer. Default 10.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'listar_materias_arbitrales',
    description:
      'Cuenta las materias y los árbitros indexados en los laudos del CAM Santiago y devuelve una ' +
      'muestra. Para encontrar una materia concreta usa `buscar_laudos_arbitrales`, que busca en todo ' +
      'el índice.',
    inputSchema: {
      type: 'object',
      properties: { por: { type: 'string', enum: ['materia', 'arbitro'], description: 'Default materia.' } },
    },
  },
  {
    name: 'valor_economico',
    description:
      'Valor de UF, UTM, IPC, dólar u otros indicadores, hoy o a una fecha pasada. Necesario para ' +
      'cuantificar: las multas van en UTM, los contratos e indemnizaciones en UF, los reajustes en ' +
      'IPC. Úsala siempre que haya que convertir o calcular un monto, en vez de estimarlo.',
    inputSchema: {
      type: 'object',
      properties: {
        indicador: { type: 'string', enum: Object.keys(INDICADORES_DISPONIBLES), description: 'Si se omite, devuelve todos los de hoy.' },
        fecha: { type: 'string', description: 'DD-MM-AAAA para un día concreto.' },
      },
    },
  },
  {
    name: 'listar_fuentes',
    description: 'Lista las fuentes disponibles: tribunales, cortes con su código, revistas de doctrina, estadísticas y arbitraje.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'buscar_jurisprudencia_constitucional',
    description:
      'Busca sentencias del Tribunal Constitucional a texto completo. Devuelve rol, tipo de acción ' +
      '(inaplicabilidad, requerimiento parlamentario, control preventivo…), los PÁRRAFOS exactos que ' +
      'coinciden con la consulta y el ENLACE DIRECTO AL PDF del fallo. Úsala en cuestiones de ' +
      'constitucionalidad, derechos fundamentales, inaplicabilidad de un precepto legal, o cuando se ' +
      'discuta si una norma vulnera la Constitución.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Qué buscar, a texto completo.' },
        desde: { type: 'string', description: 'Fecha mínima, YYYY-MM-DD.' },
        hasta: { type: 'string', description: 'Fecha máxima, YYYY-MM-DD.' },
        pagina: { type: 'number', description: 'Página, empieza en 1.' },
        texto_completo: { type: 'boolean', description: 'Default false: llega extracto más los párrafos coincidentes.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'buscar_fichas_constitucional',
    description:
      'Busca fichas de jurisprudencia del Tribunal Constitucional: resúmenes con metadatos elaborados ' +
      'por el propio tribunal. Útil para ubicar rápido la línea jurisprudencial sobre un tema antes de ' +
      'leer las sentencias completas.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string' },
        pagina: { type: 'number' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'buscar_dictamenes_trabajo',
    description:
      'Busca dictámenes de la Dirección del Trabajo (ORD.), que son la interpretación administrativa ' +
      'obligada en materia laboral: jornada, remuneraciones, sala cuna, negociación colectiva, fuero, ' +
      'término de contrato. Devuelve número, fecha, epígrafe con descriptores y enlace oficial. ' +
      'Complementa la jurisprudencia judicial: la DT fija el criterio que aplican los fiscalizadores.',
    inputSchema: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Tema a buscar.' },
        desde_anio: { type: 'number', description: `Año inicial. Hay datos desde ${Math.min(...Object.keys(ANIOS_DT).map(Number))}. Default: últimos 3 años.` },
        hasta_anio: { type: 'number', description: 'Año final.' },
        limite: { type: 'number', description: 'Cuántos traer. Default 10.' },
      },
      required: ['consulta'],
    },
  },
  {
    name: 'ver_dictamen_trabajo',
    description:
      'Trae el texto completo de un dictamen de la Dirección del Trabajo, separado en actuación, ' +
      'materia y resumen. Necesita el `id` que entrega buscar_dictamenes_trabajo.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id numérico del dictamen.' } },
      required: ['id'],
    },
  },
  {
    name: 'verificar_fuentes',
    description:
      'Comprueba que todas las fuentes externas sigan respondiendo correctamente, consultando cada una ' +
      'con una pregunta de respuesta conocida. Úsala si una búsqueda devuelve vacío y quieres saber si ' +
      'es que no hay resultados o es que la fuente se rompió, antes de trabajo importante, o si el ' +
      'usuario pregunta si el sistema está funcionando. Tarda unos segundos.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const servidor = new Server(
  { name: 'responsa', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

servidor.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: HERRAMIENTAS }));

servidor.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    const datos = await ejecutar(name, a);
    return { content: [{ type: 'text', text: JSON.stringify(datos, null, 2) }] };
  } catch (e) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error en ${name}: ${e?.message ?? e}` }],
    };
  }
});

async function ejecutar(name, a) {
  switch (name) {
    case 'buscar_jurisprudencia':
      return buscarSentencias({
        texto: a.texto,
        literal: a.literal,
        todas: a.todas,
        algunas: a.algunas,
        excluir: a.excluir,
        tribunal: a.tribunal,
        desde: a.desde,
        hasta: a.hasta,
        rol: a.rol,
        era: a.era,
        orden: a.orden,
        limite: a.limite,
        pagina: a.pagina,
        textoCompleto: a.texto_completo,
      });

    case 'buscar_jurisprudencia_en_todos':
      return buscarEnTodos({
        texto: a.texto,
        literal: a.literal,
        todas: a.todas,
        algunas: a.algunas,
        excluir: a.excluir,
        desde: a.desde,
        hasta: a.hasta,
        limite: a.limite,
        textoCompleto: a.texto_completo,
      });

    case 'buscar_jurisprudencia_constitucional':
      return buscarSentenciasTC({
        consulta: a.consulta,
        desde: a.desde,
        hasta: a.hasta,
        pagina: a.pagina,
        textoCompleto: a.texto_completo,
      });

    case 'buscar_fichas_constitucional':
      return buscarFichasTC({ consulta: a.consulta, pagina: a.pagina });

    case 'buscar_dictamenes_trabajo':
      return buscarDictamenesDT({
        consulta: a.consulta,
        desdeAnio: a.desde_anio,
        hastaAnio: a.hasta_anio,
        limite: a.limite,
      });

    case 'ver_dictamen_trabajo':
      return verDictamenDT(a.id);

    case 'jurisprudencia_por_norma': {
      const r = await buscarSentencias({
        tribunal: a.tribunal,
        tipoNorma: a.tipo_norma,
        numNorma: String(a.numero).replace(/\./g, ''),
        numArt: a.articulo ? String(a.articulo) : '',
        numInciso: a.inciso ? String(a.inciso) : '',
        desde: a.desde,
        limite: a.limite,
      });
      // Se acompaña el texto de la norma para que la respuesta pueda contrastar
      // lo que dice la ley con lo que hicieron los tribunales.
      let norma = null;
      try {
        const c = await resolverCita(`${a.tipo_norma} ${a.numero}`);
        if (c?.id) norma = await verNorma(c.id, a.articulo);
      } catch {
        // si la BCN está limitada, igual devolvemos la jurisprudencia
      }
      return { norma, ...r };
    }

    case 'ver_sentencia':
      return verSentencia({ rol: a.rol, era: a.era, tribunal: a.tribunal });

    case 'buscar_ley':
      return buscarNormas(a.consulta, a.limite ?? 8);

    case 'ver_norma': {
      let id = a.idNorma;
      if (!id && a.cita) {
        const c = await resolverCita(a.cita);
        // Sólo se sigue si la cita quedó CONFIRMADA. Con un parecido no basta:
        // devolver el texto de otra norma bajo el nombre pedido es la peor
        // forma de fallar que tiene esta herramienta.
        if (!c?.id || !c.verificada) {
          return {
            encontrada: false,
            cita: a.cita,
            mensaje: c?.mensaje ?? `No se pudo confirmar que "${a.cita}" sea una norma de Ley Chile.`,
            ...(c?.candidatos_no_confirmados ? { candidatos_no_confirmados: c.candidatos_no_confirmados } : {}),
            advertencia: 'No cites esta norma: no se pudo verificar. Usa `buscar_ley` para ubicar la correcta.',
          };
        }
        id = c.id;
      }
      if (!id) throw new Error('Indica `idNorma` o `cita`.');
      return verNorma(id, a.articulo);
    }

    case 'buscar_doctrina':
      return buscarDoctrina({ consulta: a.consulta, limite: a.limite, desdeAnio: a.desde_anio });

    case 'buscar_dictamenes':
      return buscarDictamenes({
        texto: a.texto,
        numero: a.numero,
        materia: a.materia,
        desde: a.desde,
        hasta: a.hasta,
        limite: a.limite,
      });

    case 'ver_dictamen':
      return verDictamen(a.unid, { textoCompleto: a.texto_completo !== false });

    case 'estadisticas_judiciales':
      return consultarEstadistica({
        consulta: a.consulta,
        corte: a.corte,
        tribunal: a.tribunal,
        competencia: a.competencia,
        anio: a.anio,
      });

    case 'consultar_causa':
      return enlaceConsultaCausas({
        tipo: a.tipo,
        competencia: a.competencia,
        rol: a.rol,
        era: a.era,
        nombre: a.nombre,
        rut: a.rut,
      });

    case 'buscar_laudos_arbitrales':
      return buscarLaudos({ consulta: a.consulta, por: a.por, limite: a.limite });

    case 'listar_materias_arbitrales':
      return listarMateriasArbitrales(a.por ?? 'materia');

    case 'valor_economico':
      return valorEconomico({ indicador: a.indicador, fecha: a.fecha });

    case 'verificar_fuentes':
      return verificarFuentes();

    case 'listar_fuentes':
      return {
        jurisprudencia_judicial: Object.entries(BUSCADORES).map(([clave, b]) => ({ clave, nombre: b.nombre })),
        jurisprudencia_constitucional: 'Tribunal Constitucional — sentencias con PDF y fichas (buscar_jurisprudencia_constitucional / buscar_fichas_constitucional).',
        arbitraje: 'CAM Santiago — laudos por materia y por árbitro, con PDF oficial (buscar_laudos_arbitrales).',
        jurisprudencia_administrativa: {
          contraloria: 'Función pública, sumarios, probidad, municipalidades (buscar_dictamenes / ver_dictamen).',
          direccion_del_trabajo: `Materia laboral, ORD. desde ${Math.min(...Object.keys(ANIOS_DT).map(Number))} (buscar_dictamenes_trabajo / ver_dictamen_trabajo).`,
        },
        legislacion: 'Ley Chile (Biblioteca del Congreso Nacional) — más de 258.000 normas.',
        doctrina: REVISTAS.map((r) => ({ issn: r.issn, revista: r.nombre })),
        estadisticas: { consultas: CONSULTAS_DISPONIBLES, cortes: CORTES, competencias: COMPETENCIAS },
        valores_economicos: INDICADORES_DISPONIBLES,
        no_automatizable: [
          'Consulta Unificada de Causas (OJV): exige token de reCAPTCHA en cada búsqueda. Usa consultar_causa para el enlace.',
        ],
        no_incluido: ['Bases de suscripción (vLex, Westlaw, HeinOnline): excluidas a propósito, ver README.'],
      };

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}

const transporte = new StdioServerTransport();
await servidor.connect(transporte);
