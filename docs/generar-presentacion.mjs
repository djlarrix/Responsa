/**
 * Genera la presentación institucional de Responsa.
 *   node docs/generar-presentacion.mjs
 */
import pptxgen from 'pptxgenjs';

// Paleta: tinta profunda, pergamino y bronce. Sobria, clásica, nada de azul
// corporativo genérico.
const TINTA = '1B2230';
const TINTA_2 = '2A3446';
const PERGAMINO = 'F4F1EA';
const BRONCE = 'A87C4F';
const BRONCE_CLARO = 'C9A574';
const OXBLOOD = '6B2C33';
const GRIS = '5A6478';
const GRIS_CLARO = '8A93A5';
const BLANCO = 'FFFFFF';

const SERIF = 'Cambria';
const SANS = 'Calibri';

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5
pres.author = 'Joaquín Larraín Guimoye';
pres.title = 'Responsa';
pres.subject = 'Fuentes jurídicas chilenas verificables';

const W = 13.33;
const H = 7.5;
const M = 0.85; // margen

/** Numeral en círculo de bronce: el motivo que se repite en todo el mazo. */
function numeral(s, n, x, y, d = 0.42, colorTexto = BLANCO, relleno = BRONCE) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: relleno } });
  s.addText(String(n), {
    x, y, w: d, h: d, align: 'center', valign: 'middle', margin: 0,
    fontFace: SANS, fontSize: 12, bold: true, color: colorTexto,
  });
}

/** Título de sección para las láminas claras. */
function tituloClaro(s, titulo, bajada) {
  s.addText(titulo, {
    x: M, y: 0.62, w: W - M * 2, h: 0.62, margin: 0,
    fontFace: SERIF, fontSize: 32, bold: true, color: TINTA,
  });
  if (bajada) {
    s.addText(bajada, {
      x: M, y: 1.26, w: W - M * 2 - 1.2, h: 0.42, margin: 0,
      fontFace: SANS, fontSize: 13.5, color: GRIS, italic: true,
    });
  }
}

const fondo = (color) => ({ fill: color });

// ══════════════════════════════════════════════════ 1. Portada
{
  const s = pres.addSlide();
  s.background = fondo(TINTA);

  s.addText('RESPONSA', {
    x: M, y: 2.32, w: 9.2, h: 1.35, margin: 0,
    fontFace: SERIF, fontSize: 76, bold: true, color: BLANCO, charSpacing: 6,
  });
  s.addText('Fuentes jurídicas chilenas verificables para Claude', {
    x: M, y: 3.72, w: 9.2, h: 0.45, margin: 0,
    fontFace: SANS, fontSize: 19, color: BRONCE_CLARO,
  });
  s.addText(
    'Jurisprudencia · Legislación · Dictámenes · Arbitraje · Doctrina · Estadísticas',
    { x: M, y: 4.34, w: 9.6, h: 0.36, margin: 0, fontFace: SANS, fontSize: 13, color: GRIS_CLARO },
  );

  s.addText('Creado por', {
    x: M, y: 5.72, w: 3, h: 0.26, margin: 0,
    fontFace: SANS, fontSize: 11, color: GRIS, charSpacing: 1.5,
  });
  s.addText('Joaquín Larraín Guimoye', {
    x: M, y: 5.99, w: 6, h: 0.42, margin: 0,
    fontFace: SERIF, fontSize: 19, bold: true, color: BLANCO,
  });

  // Marca de agua tipográfica: la definición latina, en grande y muy tenue.
  s.addText('responsa prudentium', {
    x: 6.2, y: 0.72, w: 6.4, h: 0.9, margin: 0, align: 'right',
    fontFace: SERIF, fontSize: 30, italic: true, color: TINTA_2,
  });
  s.addShape(pres.ShapeType.ellipse, { x: 11.6, y: 5.85, w: 0.85, h: 0.85, fill: { color: BRONCE } });
  s.addText('R', {
    x: 11.6, y: 5.85, w: 0.85, h: 0.85, align: 'center', valign: 'middle', margin: 0,
    fontFace: SERIF, fontSize: 34, bold: true, color: TINTA,
  });
}

// ══════════════════════════════════════════════════ 2. El problema
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, 'El problema que resuelve', 'Por qué no basta con preguntarle a una IA general');

  const bloques = [
    ['Inventa citas que parecen reales', 'Un rol plausible, una carátula verosímil, un considerando que suena bien. Se parecen lo suficiente a los verdaderos para pasar desapercibidos en un escrito.'],
    ['Cita normas derogadas', 'Recuerda la versión que leyó, no la vigente. En derecho eso no es un matiz: cambia el resultado.'],
    ['No sabe lo que no sabe', 'Ante un vacío, completa. Y el relleno es indistinguible del dato bueno.'],
  ];

  bloques.forEach(([t, d], i) => {
    const y = 2.08 + i * 1.6;
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y, w: 6.55, h: 1.36, rectRadius: 0.06,
      fill: { color: BLANCO }, line: { color: 'E3DED3', width: 0.75 },
    });
    numeral(s, i + 1, M + 0.32, y + 0.28, 0.42, BLANCO, OXBLOOD);
    s.addText(t, {
      x: M + 0.92, y: y + 0.2, w: 5.4, h: 0.32, margin: 0,
      fontFace: SANS, fontSize: 14.5, bold: true, color: TINTA,
    });
    s.addText(d, {
      x: M + 0.92, y: y + 0.55, w: 5.4, h: 0.68, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 11.5, color: GRIS,
    });
  });

  // Contrapunto: el principio que ordena todo el diseño.
  s.addShape(pres.ShapeType.roundRect, {
    x: 8.0, y: 2.08, w: 4.48, h: 4.32, rectRadius: 0.06, fill: { color: TINTA },
  });
  s.addText('El principio', {
    x: 8.42, y: 2.5, w: 3.7, h: 0.3, margin: 0,
    fontFace: SANS, fontSize: 11, color: BRONCE_CLARO, charSpacing: 1.5,
  });
  s.addText('Responsa no busca que Claude sepa derecho chileno.', {
    x: 8.42, y: 2.92, w: 3.7, h: 1.0, margin: 0,
    fontFace: SERIF, fontSize: 19, color: BLANCO,
  });
  s.addText('Busca que no pueda inventarlo.', {
    x: 8.42, y: 3.98, w: 3.7, h: 0.85, margin: 0,
    fontFace: SERIF, fontSize: 21, bold: true, color: BRONCE_CLARO,
  });
  s.addText(
    'Cada afirmación queda anclada a un fallo con rol y enlace, a un artículo con su texto oficial o a un dictamen con su número. Lo que no se pudo verificar, se declara.',
    { x: 8.42, y: 5.0, w: 3.7, h: 1.15, margin: 0, fontFace: SANS, fontSize: 11, color: GRIS_CLARO },
  );
}

// ══════════════════════════════════════════════════ 3. El nombre
{
  const s = pres.addSlide();
  s.background = fondo(TINTA);

  s.addText('El nombre', {
    x: M, y: 0.7, w: 6, h: 0.6, margin: 0,
    fontFace: SERIF, fontSize: 32, bold: true, color: BLANCO,
  });

  s.addText('responsa prudentium', {
    x: M, y: 1.72, w: 7.2, h: 0.66, margin: 0,
    fontFace: SERIF, fontSize: 40, italic: true, color: BRONCE_CLARO,
  });
  s.addText(
    'En Roma, las respuestas fundadas que los juristas daban a consultas concretas. ' +
    'Su fuerza no venía del cargo que ocupaban, sino de la autoridad de quien respondía ' +
    'y de las fuentes que invocaba.',
    { x: M, y: 2.56, w: 6.6, h: 1.2, margin: 0, fontFace: SANS, fontSize: 14.5, color: BLANCO, lineSpacingMultiple: 1.25 },
  );
  s.addText(
    'Un responsum sin fundamento no valía nada. Con fundamento, obligaba. ' +
    'Es exactamente la distinción que hace esta herramienta.',
    { x: M, y: 3.92, w: 6.6, h: 0.9, margin: 0, valign: 'top', fontFace: SANS, fontSize: 13, color: GRIS_CLARO, italic: true },
  );

  // Cierra el vacío inferior izquierdo y remata la idea del nombre.
  s.addText('Una respuesta sin fuente es una opinión.', {
    x: M, y: 4.98, w: 6.6, h: 0.5, margin: 0, valign: 'top',
    fontFace: SERIF, fontSize: 24, bold: true, color: BLANCO,
  });
  s.addText('Con fuente, es un fundamento.', {
    x: M, y: 5.5, w: 6.6, h: 0.5, margin: 0, valign: 'top',
    fontFace: SERIF, fontSize: 24, bold: true, color: BRONCE_CLARO,
  });

  // Las tres notas del responsum romano son, una por una, el diseño de la
  // herramienta. Sirve mejor que una genealogía del nombre.
  s.addShape(pres.ShapeType.roundRect, {
    x: 8.1, y: 1.72, w: 4.38, h: 4.3, rectRadius: 0.06, fill: { color: TINTA_2 },
  });
  s.addText('Qué era un responsum', {
    x: 8.5, y: 2.06, w: 3.6, h: 0.3, margin: 0,
    fontFace: SANS, fontSize: 11, color: BRONCE_CLARO, charSpacing: 1.5,
  });

  const rasgos = [
    ['Sobre un caso concreto', 'No una disertación abstracta: la respuesta a la consulta que alguien traía.', 'Aquí: se pregunta en lenguaje natural, por un problema real'],
    ['Con las fuentes a la vista', 'El jurista mostraba en qué se apoyaba. Quien recibía la respuesta podía comprobarla.', 'Aquí: rol, tribunal, fecha y enlace en cada cita'],
    ['Valía por su fundamento', 'No por el cargo de quien respondía. Sin respaldo, no valía nada.', 'Aquí: lo que no se pudo verificar, se declara'],
  ];
  rasgos.forEach(([n, def, hoy], i) => {
    const y = 2.52 + i * 1.18;
    s.addText(n, {
      x: 8.5, y, w: 3.6, h: 0.28, margin: 0, valign: 'top',
      fontFace: SERIF, fontSize: 14, bold: true, color: BLANCO,
    });
    s.addText(def, {
      x: 8.5, y: y + 0.29, w: 3.6, h: 0.5, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 9.5, color: GRIS_CLARO, lineSpacingMultiple: 1.0,
    });
    s.addText(hoy, {
      x: 8.5, y: y + 0.79, w: 3.6, h: 0.3, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 9, bold: true, color: BRONCE, lineSpacingMultiple: 0.95,
    });
  });
}

// ══════════════════════════════════════════════════ 4. Las diez fuentes
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, 'Diez fuentes, todas oficiales y gratuitas', 'Ninguna base de suscripción: la herramienta se puede compartir sin comprometer licencias');

  const fuentes = [
    ['Poder Judicial', 'Siete buscadores: Corte Suprema, Cortes de\nApelaciones, Laboral, Penal, Familia,\nCobranza y Civil'],
    ['Tribunal Constitucional', 'Sentencias a texto completo y fichas de\njurisprudencia, con descarga del PDF'],
    ['Contraloría', '6.910 dictámenes, con su estado de vigencia:\nsi fue reconsiderado, ya no sirve para fundar'],
    ['Dirección del Trabajo', '1.342 dictámenes indexados con sus\ndescriptores; datos desde 2005'],
    ['CAM Santiago', '1.812 laudos arbitrales por materia y por\nárbitro, con enlace al PDF oficial'],
    ['Ley Chile — BCN', '258.633 normas, con texto vigente por\nartículo y marca de derogación'],
    ['Revistas jurídicas', 'Nueve revistas chilenas indexadas, con DOI\npara citar'],
    ['Estadísticas del PJUD', 'Duración real de las causas, ingresos y\nformas de término, desde 2015'],
    ['Banco Central y SII', 'UF, UTM e IPC, del día o de una fecha pasada'],
    ['Oficina Judicial Virtual', 'Enlace y pasos para consultar una causa\n(no automatizado, ver más adelante)'],
  ];

  fuentes.forEach(([n, d], i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = M + col * 5.95;
    const y = 2.0 + fila * 1.02;
    numeral(s, i + 1, x, y + 0.06, 0.34, BLANCO, i === 9 ? GRIS_CLARO : BRONCE);
    s.addText(n, {
      x: x + 0.5, y, w: 5.1, h: 0.28, margin: 0,
      fontFace: SANS, fontSize: 13, bold: true, color: i === 9 ? GRIS : TINTA,
    });
    s.addText(d, {
      x: x + 0.5, y: y + 0.28, w: 5.1, h: 0.62, margin: 0,
      fontFace: SANS, fontSize: 9.5, color: GRIS, lineSpacingMultiple: 0.95,
    });
  });
}

// ══════════════════════════════════════════════════ 5. Anatomía de una respuesta
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, 'Qué devuelve, exactamente', 'Un fallo real, tal como llega desde el Poder Judicial');

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 2.02, w: 7.5, h: 4.32, rectRadius: 0.06,
    fill: { color: BLANCO }, line: { color: 'E3DED3', width: 0.75 },
  });

  const campos = [
    ['Rol', '34.956-2026'],
    ['Tribunal', 'Corte Suprema · Cuarta Sala, Mixta'],
    ['Corte de origen', 'C.A. de Chillán (por donde pasó, no quien falló)'],
    ['Fecha', '13 de agosto de 2026'],
    ['Carátula', 'Mardones con Sacyr Operación y Servicios S.A.'],
    ['Recurso', 'Unificación de jurisprudencia (laboral)'],
    ['Resultado', 'Inadmisible: no es materia propia de unificación'],
    ['Normas aplicadas', 'Código del Trabajo, arts. 483 y 483 A → enlace a Ley Chile'],
    ['Historia procesal', '1º Juzgado de Letras de San Carlos → C.A. de Chillán → C.S.'],
    ['Enlace', 'Permalink al fallo en el buscador del Poder Judicial'],
    ['Texto', 'Íntegro, más los pasajes que coinciden con la consulta'],
  ];
  campos.forEach(([k, v], i) => {
    const y = 2.24 + i * 0.375;
    s.addText(k, {
      x: M + 0.34, y, w: 1.72, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 10.5, bold: true, color: BRONCE,
    });
    s.addText(v, {
      x: M + 2.12, y, w: 5.1, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 10.5, color: TINTA,
    });
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: 8.85, y: 2.02, w: 3.63, h: 4.32, rectRadius: 0.06, fill: { color: TINTA },
  });
  s.addText('Por qué importa', {
    x: 9.2, y: 2.36, w: 2.95, h: 0.3, margin: 0,
    fontFace: SANS, fontSize: 11, color: BRONCE_CLARO, charSpacing: 1.5,
  });
  s.addText(
    'Con rol, tribunal y fecha, la cita se verifica en un minuto.',
    { x: 9.2, y: 2.78, w: 2.95, h: 0.75, margin: 0, fontFace: SERIF, fontSize: 15, color: BLANCO },
  );
  s.addText(
    'Las normas llegan enlazadas a Ley Chile, así que el fundamento legal también se comprueba.',
    { x: 9.2, y: 3.62, w: 2.95, h: 0.95, margin: 0, fontFace: SANS, fontSize: 11, color: GRIS_CLARO },
  );
  s.addText(
    'Y la historia procesal permite seguir la causa desde primera instancia.',
    { x: 9.2, y: 4.62, w: 2.95, h: 0.85, margin: 0, fontFace: SANS, fontSize: 11, color: GRIS_CLARO },
  );
  s.addText('Nada de esto se puede inventar sin que se note.', {
    x: 9.2, y: 5.55, w: 2.95, h: 0.6, margin: 0,
    fontFace: SANS, fontSize: 11.5, bold: true, italic: true, color: BRONCE_CLARO,
  });
}

// ══════════════════════════════════════════════════ 6. Diferenciadores
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, 'Lo que no hace un buscador común', 'Cuatro capacidades que cambian el resultado del trabajo');

  const items = [
    ['Buscar por norma, no por palabra',
     'Pide los fallos que APLICAN el artículo 16 de la Ley 19.496, no los que mencionan esas palabras. Devuelve además el texto del artículo para contrastar qué dice la ley con qué hicieron los tribunales.'],
    ['Avisar si un dictamen ya no sirve',
     'La Contraloría marca si un dictamen fue reconsiderado, aclarado o confirmado. Uno reconsiderado no sirve para fundar, y ese dato no aparece en una búsqueda de texto.'],
    ['Cubrir el arbitraje',
     'En materias comerciales, societarias y de construcción, buena parte de los conflictos se resuelve en arbitraje y nunca llega a tribunales. Sin esto, el panorama queda incompleto.'],
    ['Responder cuánto demora',
     'Un laboral en la Corte de Valparaíso promedió 222 días en 2024; la Corte Suprema, 92. Es la diferencia entre decir «puede demandar» y decirle al cliente cuánto va a esperar.'],
  ];

  items.forEach(([t, d], i) => {
    const col = i % 2;
    const fila = Math.floor(i / 2);
    const x = M + col * 5.95;
    const y = 2.05 + fila * 2.28;
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w: 5.6, h: 2.02, rectRadius: 0.06,
      fill: { color: BLANCO }, line: { color: 'E3DED3', width: 0.75 },
    });
    numeral(s, i + 1, x + 0.32, y + 0.3, 0.4);
    s.addText(t, {
      x: x + 0.88, y: y + 0.28, w: 4.5, h: 0.32, margin: 0,
      fontFace: SANS, fontSize: 14, bold: true, color: TINTA,
    });
    s.addText(d, {
      x: x + 0.88, y: y + 0.68, w: 4.5, h: 1.2, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 10.5, color: GRIS, lineSpacingMultiple: 1.05,
    });
  });
}

// ══════════════════════════════════════════════════ 7. Cómo funciona
{
  const s = pres.addSlide();
  s.background = fondo(TINTA);

  s.addText('Cómo funciona', {
    x: M, y: 0.62, w: 8, h: 0.6, margin: 0,
    fontFace: SERIF, fontSize: 32, bold: true, color: BLANCO,
  });
  s.addText('No hay que aprender comandos ni recordar nombres de herramientas', {
    x: M, y: 1.24, w: 9, h: 0.4, margin: 0,
    fontFace: SANS, fontSize: 13.5, italic: true, color: GRIS_CLARO,
  });

  const pasos = [
    ['Usted pregunta', 'En lenguaje natural, como se lo diría a un colega.\n\n«¿Qué ha resuelto la Corte Suprema sobre nulidad del despido?»'],
    ['Claude elige', 'Entre las veinte herramientas disponibles, selecciona las que corresponden. Una consulta puede combinar varias: ubicar la norma, leer su texto, traer los fallos y sumar el criterio administrativo.'],
    ['Responsa consulta', 'Va a las fuentes oficiales en vivo. No tiene una copia propia de las leyes: pregunta a la BCN, al Poder Judicial, a la Contraloría.'],
    ['Usted recibe', 'La respuesta con rol, tribunal, fecha, enlace y texto. Y si algo no se pudo verificar, se dice.'],
  ];

  pasos.forEach(([t, d], i) => {
    const x = M + i * 3.02;
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 2.05, w: 2.78, h: 3.05, rectRadius: 0.06, fill: { color: TINTA_2 },
    });
    numeral(s, i + 1, x + 0.32, 2.35, 0.44);
    s.addText(t, {
      x: x + 0.32, y: 2.95, w: 2.2, h: 0.34, margin: 0,
      fontFace: SANS, fontSize: 14, bold: true, color: BRONCE_CLARO,
    });
    s.addText(d, {
      x: x + 0.32, y: 3.38, w: 2.2, h: 1.6, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 10.5, color: BLANCO, lineSpacingMultiple: 1.1,
    });
  });

  s.addText(
    'Responsa se instala una vez y queda disponible en toda conversación con Claude.',
    { x: M, y: 5.48, w: 11.6, h: 0.4, margin: 0, valign: 'top', fontFace: SANS, fontSize: 12, color: GRIS_CLARO, italic: true },
  );
}

// ══════════════════════════════════════════════════ 8. Fiabilidad
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, 'Cómo falla', 'La forma peligrosa de fallar no es el error: es el resultado vacío que se lee como una ausencia');

  const puntos = [
    ['Declara los vacíos', 'Si una fuente no responde, se dice. Nunca se completa el hueco con conocimiento propio, porque ese relleno es indistinguible del dato bueno.'],
    ['Distingue caída de ausencia', 'Cuando el Poder Judicial devolvió un error de base de datos, Responsa lo nombró: «su base responde ORA-12541, es una falla del organismo». No lo presentó como «no hay jurisprudencia».'],
    ['Se puede auditar', 'Un comando consulta las diez fuentes con preguntas de respuesta conocida y dice cuál responde y cuál no. Sesenta comprobaciones automáticas verifican que cada fuente entregue lo que corresponde.'],
    ['Avisa si cambia una fuente', 'Son sitios de terceros que cambian sin previo aviso. Si alguno altera su estructura, el error lo dice explícitamente en vez de devolver una lista vacía en silencio.'],
  ];

  puntos.forEach(([t, d], i) => {
    const y = 2.05 + i * 1.14;
    numeral(s, i + 1, M, y + 0.08, 0.38);
    s.addText(t, {
      x: M + 0.56, y, w: 3.3, h: 0.32, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 13.5, bold: true, color: TINTA,
    });
    s.addText(d, {
      x: M + 4.0, y: y - 0.02, w: 7.5, h: 0.92, margin: 0, valign: 'top',
      fontFace: SANS, fontSize: 11, color: GRIS, lineSpacingMultiple: 1.08,
    });
  });

  s.addText(
    'Es investigación jurídica asistida, no asesoría legal. En materias con plazos, prescripción o caducidad de por medio, corresponde revisión profesional antes de actuar.',
    { x: M, y: 6.5, w: 11.6, h: 0.45, margin: 0, fontFace: SANS, fontSize: 11, italic: true, color: OXBLOOD },
  );
}

// ══════════════════════════════════════════════════ 9 y 10. Instalación
function laminaInstalacion(sistema, pasos, notaFinal) {
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);
  tituloClaro(s, `Instalación en ${sistema}`, 'Un solo comando hace todo: dependencias, registro, skill, precarga y verificación');

  pasos.forEach(([t, d, cmd], i) => {
    const y = 2.02 + i * 1.06;
    numeral(s, i + 1, M, y + 0.06, 0.38);
    s.addText(t, {
      x: M + 0.56, y, w: 3.5, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 13, bold: true, color: TINTA,
    });
    s.addText(d, {
      x: M + 0.56, y: y + 0.3, w: 3.5, h: 0.62, margin: 0,
      fontFace: SANS, fontSize: 10, color: GRIS, lineSpacingMultiple: 1.0,
    });
    if (cmd) {
      s.addShape(pres.ShapeType.roundRect, {
        x: M + 4.3, y: y + 0.02, w: 7.3, h: 0.72, rectRadius: 0.05,
        fill: { color: TINTA },
      });
      s.addText(cmd, {
        x: M + 4.55, y: y + 0.02, w: 6.8, h: 0.72, margin: 0, valign: 'middle',
        fontFace: 'Courier New', fontSize: 11.5, bold: true, color: BRONCE_CLARO,
      });
    }
  });

  s.addText(notaFinal, {
    x: M, y: 6.42, w: 11.6, h: 0.5, margin: 0,
    fontFace: SANS, fontSize: 11.5, color: TINTA, italic: true,
  });
  return s;
}

laminaInstalacion(
  'Windows',
  [
    ['Instalar Node.js', 'Descargar la versión LTS desde nodejs.org y ejecutar el instalador. Aceptar las opciones por defecto.', 'nodejs.org  →  descargar LTS'],
    ['Abrir PowerShell', 'Menú Inicio, escribir «PowerShell» y abrirlo. Situarse en la carpeta de Responsa.', 'cd C:\\Users\\<usuario>\\Responsa'],
    ['Ejecutar el instalador', 'Instala dependencias, registra el servidor en Claude Desktop y Claude Code, instala la skill, precarga los códigos y verifica las fuentes.', 'node instalar.mjs'],
    ['Reiniciar Claude Desktop', 'Cerrarlo por completo desde la bandeja del sistema, junto al reloj, no sólo la ventana. Los servidores se cargan al arrancar.', ''],
  ],
  'Para comprobar que quedó bien: preguntar cualquier cosa de derecho chileno. Si responde con roles, tribunales y enlaces, está funcionando.',
);

laminaInstalacion(
  'macOS',
  [
    ['Instalar Node.js', 'Descargar la versión LTS desde nodejs.org y abrir el paquete .pkg. Aceptar las opciones por defecto.', 'nodejs.org  →  descargar LTS'],
    ['Abrir Terminal', 'Command + Espacio, escribir «Terminal». Situarse en la carpeta de Responsa.', 'cd ~/Responsa'],
    ['Ejecutar el instalador', 'El mismo comando que en Windows: el instalador detecta el sistema y escribe la configuración donde corresponde en macOS.', 'node instalar.mjs'],
    ['Reiniciar Claude Desktop', 'Cerrarlo con Command + Q, no sólo la ventana. Los servidores se cargan al arrancar.', ''],
  ],
  'Si macOS advierte sobre un desarrollador no identificado al abrir el instalador de Node, autorizarlo en Ajustes del Sistema → Privacidad y seguridad.',
);

// ══════════════════════════════════════════════════ 11. Qué preguntar
{
  const s = pres.addSlide();
  s.background = fondo(TINTA);

  s.addText('Qué preguntarle', {
    x: M, y: 0.62, w: 8, h: 0.6, margin: 0,
    fontFace: SERIF, fontSize: 32, bold: true, color: BLANCO,
  });
  s.addText('En lenguaje natural. Responsa decide a qué fuente ir.', {
    x: M, y: 1.24, w: 9, h: 0.4, margin: 0,
    fontFace: SANS, fontSize: 13.5, italic: true, color: GRIS_CLARO,
  });

  const ejemplos = [
    ['«Fallos que apliquen el artículo 16 de la Ley 19.496»', 'Ley Chile + Poder Judicial, filtrando por norma aplicada'],
    ['«¿Qué han resuelto los tribunales sobre tutela laboral?»', 'Los siete buscadores del Poder Judicial a la vez'],
    ['«¿Es constitucional esta norma?»', 'Tribunal Constitucional, con los párrafos pertinentes y el PDF'],
    ['«Dictámenes sobre sala cuna»', 'Dirección del Trabajo, o Contraloría si es función pública'],
    ['«Arbitrajes sobre contratos de construcción»', 'Laudos del CAM Santiago, con enlace al PDF'],
    ['«¿Cuánto demora un juicio laboral en Valparaíso?»', 'Estadísticas oficiales del Poder Judicial'],
    ['«¿A cuánto equivalen 50 UTM hoy?»', 'Valores del Banco Central y del SII'],
  ];

  ejemplos.forEach(([q, fuente], i) => {
    const y = 1.92 + i * 0.68;
    s.addText(q, {
      x: M, y, w: 6.9, h: 0.34, margin: 0,
      fontFace: SERIF, fontSize: 14.5, color: BLANCO,
    });
    s.addText(fuente, {
      x: M + 7.1, y: y + 0.04, w: 4.5, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 10.5, color: BRONCE_CLARO,
    });
  });

  s.addText(
    'Una sola pregunta puede combinar varias fuentes: ubicar la norma, leer su texto vigente, traer los fallos que la aplican y sumar el criterio administrativo.',
    { x: M, y: 6.6, w: 11.6, h: 0.45, margin: 0, valign: 'top', fontFace: SANS, fontSize: 11, color: GRIS_CLARO, italic: true },
  );
}

// ══════════════════════════════════════════════════ 12. Cierre
{
  const s = pres.addSlide();
  s.background = fondo(PERGAMINO);

  s.addText('RESPONSA', {
    x: M, y: 2.35, w: 7, h: 0.95, margin: 0,
    fontFace: SERIF, fontSize: 54, bold: true, color: TINTA, charSpacing: 4,
  });
  s.addText('Responder con fundamento verificable.', {
    x: M, y: 3.38, w: 7, h: 0.5, margin: 0,
    fontFace: SERIF, fontSize: 21, italic: true, color: BRONCE,
  });

  const cifras = [
    ['10', 'fuentes oficiales'],
    ['20', 'herramientas'],
    ['0', 'bases de suscripción'],
  ];
  cifras.forEach(([n, t], i) => {
    const x = M + i * 2.5;
    s.addText(n, {
      x, y: 4.42, w: 2.2, h: 0.85, margin: 0,
      fontFace: SERIF, fontSize: 52, bold: true, color: BRONCE,
    });
    s.addText(t, {
      x, y: 5.28, w: 2.2, h: 0.3, margin: 0,
      fontFace: SANS, fontSize: 11.5, color: GRIS,
    });
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: 8.2, y: 2.35, w: 4.28, h: 3.5, rectRadius: 0.06, fill: { color: TINTA },
  });
  s.addText('Creado por', {
    x: 8.6, y: 2.72, w: 3.5, h: 0.28, margin: 0, valign: 'top',
    fontFace: SANS, fontSize: 10.5, color: BRONCE_CLARO, charSpacing: 1.5,
  });
  s.addText('Joaquín Larraín Guimoye', {
    x: 8.6, y: 3.04, w: 3.6, h: 0.45, margin: 0, valign: 'top',
    fontFace: SERIF, fontSize: 21, bold: true, color: BLANCO,
  });
  s.addText(
    'Todas las fuentes son públicas y gratuitas. La herramienta se puede compartir sin comprometer licencias de nadie.',
    { x: 8.6, y: 3.72, w: 3.5, h: 1.1, margin: 0, valign: 'top', fontFace: SANS, fontSize: 11, color: GRIS_CLARO },
  );
  s.addShape(pres.ShapeType.ellipse, { x: 8.6, y: 4.92, w: 0.62, h: 0.62, fill: { color: BRONCE } });
  s.addText('R', {
    x: 8.6, y: 4.92, w: 0.62, h: 0.62, align: 'center', valign: 'middle', margin: 0,
    fontFace: SERIF, fontSize: 25, bold: true, color: TINTA,
  });
}

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

await pres.writeFile({ fileName: join(dirname(fileURLToPath(import.meta.url)), 'Responsa.pptx') });
console.log('Presentación generada: docs/Responsa.pptx');
