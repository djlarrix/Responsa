/**
 * Consulta de causas — Oficina Judicial Virtual.
 *
 * DELIBERADAMENTE NO AUTOMATIZADO.
 *
 * La Consulta Unificada de Causas es pública (modo invitado), pero sus cuatro
 * formularios (RIT/ROL, nombre, fecha y RUT de persona jurídica) llevan un
 * campo `g-recaptcha-response-*` que se envía JUNTO CON la consulta:
 * reCAPTCHA v3 con acciones `validate_captcha_rit`, `_nombre`, `_fecha`,
 * `_jur` (verificado 15-ago-2026, clave de sitio 6LelLWkU…).
 *
 * Es decir, el captcha protege la consulta misma, no la carga de la página.
 * Eso lo distingue del buscador de jurisprudencia (juris.pjud.cl), donde el
 * reCAPTCHA valida la visita y NO viaja en el payload de búsqueda: por eso
 * aquél sí se consulta de forma programática y éste no.
 *
 * Automatizar esto exigiría falsear tokens de detección de bots. En vez de
 * eso, se arma el enlace para que la búsqueda la haga la persona en su
 * navegador, que es como está pensado el servicio.
 *
 * Alternativas legítimas si hace falta automatizar:
 *   - "Mis Causas" de la OJV con Clave Única, para causas propias.
 *   - Servicios comerciales con licencia (p. ej. Khipu) que venden acceso a
 *     estos datos precisamente porque el acceso directo está bloqueado.
 */

const OJV = 'https://oficinajudicialvirtual.pjud.cl/indexN.php';

export const COMPETENCIAS_OJV = {
  corte_suprema: '1',
  corte_apelaciones: '2',
  civil: '3',
  laboral: '4',
  penal: '5',
  cobranza: '6',
  familia: '7',
};

/**
 * Devuelve instrucciones y el enlace para consultar una causa a mano.
 * No consulta nada: es un ayudante de navegación.
 */
export function enlaceConsultaCausas({ tipo = 'rol', competencia, rol, era, nombre, rut } = {}) {
  // Una competencia que no existe se ignoraba en silencio y los pasos salían
  // sin ella, como si nunca se hubiera pedido. Mejor decirlo.
  if (competencia && !COMPETENCIAS_OJV[competencia]) {
    throw new Error(
      `Competencia desconocida: "${competencia}". En la Oficina Judicial Virtual son: ${Object.keys(COMPETENCIAS_OJV).join(', ')}. ` +
        'Ojo que no coinciden con las claves de los buscadores de jurisprudencia.',
    );
  }
  const comp = competencia && COMPETENCIAS_OJV[competencia];

  const pasos = {
    rol: [
      'Abre el enlace y entra como "Invitado".',
      'Elige la pestaña "Consulta Unificada".',
      `Selecciona la competencia${comp ? ` (${competencia.replace('_', ' ')})` : ''}, la corte y el tribunal.`,
      `Ingresa el rol${rol ? ` ${rol}` : ''} y el año${era ? ` ${era}` : ''}, y presiona Buscar.`,
    ],
    nombre: [
      'Abre el enlace y entra como "Invitado".',
      'Elige la pestaña "Búsqueda por Nombre".',
      `Ingresa nombre y apellidos${nombre ? ` (${nombre})` : ''} y el año.`,
    ],
    rut_juridica: [
      'Abre el enlace y entra como "Invitado".',
      'Elige la pestaña "Búsqueda por Rut Persona Jurídica".',
      `Ingresa el RUT sin dígito verificador${rut ? ` (${rut})` : ''}, el dígito verificador y el año.`,
    ],
  };

  return {
    automatizable: false,
    motivo:
      'La Consulta Unificada de Causas envía un token de reCAPTCHA v3 junto con cada búsqueda. ' +
      'Consultarla de forma programática exigiría falsear detección de bots, así que esta herramienta ' +
      'sólo entrega el enlace y los pasos.',
    url: OJV,
    pasos: pasos[tipo] ?? pasos.rol,
    datos_recibidos: { competencia, rol, era, nombre, rut },
    nota_causas_reservadas:
      'Las causas reservadas no aparecen en la consulta pública; se ven en "Mis Causas" con Clave Única.',
    alternativas_automatizables: [
      'buscar_jurisprudencia / jurisprudencia_por_norma: fallos publicados, sin captcha.',
      'estadisticas_judiciales: duración, ingresos y términos de causas por tribunal y materia.',
    ],
  };
}
