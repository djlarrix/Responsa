# Responsa

Servidor MCP que le da a Claude acceso a fuentes jurídicas chilenas **verificables**: jurisprudencia judicial y constitucional, jurisprudencia administrativa, laudos arbitrales, legislación, doctrina académica, estadísticas de tribunales y valores económicos.

> En Roma, los *responsa prudentium* eran las respuestas fundadas que los juristas daban a consultas concretas. Su fuerza no venía del cargo, sino de la autoridad de quien respondía y de las fuentes que invocaba. Eso es exactamente lo que hace esta herramienta: responder con fundamento verificable.

Creado por Joaquín Larraín Guimoye.

El objetivo no es que Claude "sepa" derecho chileno, sino que **no pueda inventarlo**: cada afirmación queda anclada a un fallo con rol, tribunal y enlace; un dictamen con su número y su estado de vigencia; un artículo con su texto oficial; un laudo con su PDF; o un trabajo académico con DOI.

Todas las fuentes son **públicas y gratuitas**. No se conecta ninguna base de suscripción, a propósito (ver más abajo).

## Herramientas

| Herramienta | Para qué |
|---|---|
| `buscar_jurisprudencia` | Fallos por frase exacta, palabras obligatorias, sinónimos, exclusiones, fechas y tribunal |
| `buscar_jurisprudencia_en_todos` | La misma consulta en los siete buscadores a la vez |
| `jurisprudencia_por_norma` | Fallos que **aplican** una norma y artículo concretos |
| `ver_sentencia` | Una sentencia por rol y año, con texto completo |
| `buscar_jurisprudencia_constitucional` | Sentencias del Tribunal Constitucional, con PDF |
| `buscar_fichas_constitucional` | Fichas de jurisprudencia del TC |
| `buscar_ley` | Normas en Ley Chile: leyes, decretos, códigos |
| `ver_norma` | Texto oficial vigente de una norma o de un artículo puntual |
| `buscar_doctrina` | Doctrina en revistas jurídicas chilenas indexadas |
| `buscar_dictamenes` | Dictámenes de la Contraloría |
| `ver_dictamen` | Un dictamen con texto, fuentes legales y **estado de vigencia** |
| `buscar_dictamenes_trabajo` | Dictámenes de la Dirección del Trabajo (ORD.) |
| `ver_dictamen_trabajo` | Un dictamen de la DT con materia y resumen separados |
| `buscar_laudos_arbitrales` | Laudos del CAM Santiago por materia o árbitro, con PDF |
| `listar_materias_arbitrales` | Las 781 materias y 130 árbitros indexados del CAM |
| `estadisticas_judiciales` | Cuánto demoran las causas, cuántas ingresan y cómo terminan |
| `valor_economico` | UF, UTM, IPC, dólar, hoy o a una fecha pasada |
| `consultar_causa` | Enlace y pasos para consultar una causa en la OJV (no automatizado) |
| `listar_fuentes` | Qué tribunales, cortes, revistas, estadísticas y valores hay |
| `verificar_fuentes` | Chequeo de salud de las diez fuentes externas |

Algunas hacen la diferencia frente a un buscador de texto:

**`jurisprudencia_por_norma`** filtra por la norma efectivamente aplicada en el fallo, no por palabras que aparezcan en él, y devuelve el texto del artículo junto a los fallos para contrastar qué dice la ley con qué hicieron los tribunales.

**`buscar_jurisprudencia`** distingue entre buscar una frase exacta (`literal`), varios conceptos que deben concurrir (`todas`), sinónimos (`algunas`) o texto libre. Elegir bien el campo es la diferencia entre encontrar la figura que se pidió y devolver miles de resultados irrelevantes. Cada fallo trae además `pasajes_coincidentes`: los fragmentos que efectivamente coincidieron.

**`ver_dictamen`** devuelve si el dictamen fue reconsiderado, aclarado, confirmado o complementado. Un dictamen reconsiderado ya no sirve para fundar nada, y ese dato no aparece en una búsqueda de texto.

**`buscar_dictamenes_trabajo`** cubre la doctrina administrativa laboral, que es la que aplican los fiscalizadores y suele decidir el resultado antes de llegar a tribunales.

**`buscar_laudos_arbitrales`** cubre un punto ciego real: en materias comerciales, societarias y de construcción, buena parte de los conflictos se resuelve en arbitraje y nunca llega a los tribunales ordinarios. Son 1.812 laudos con enlace al PDF oficial.

**`estadisticas_judiciales`** responde lo que ninguna base de jurisprudencia contesta: cuánto demora realmente un juicio. Un laboral en la C.A. de Valparaíso promedió 222 días en 2024; la Corte Suprema, 92.

**`verificar_fuentes`** consulta las diez fuentes con preguntas de respuesta conocida y avisa cuál se rompió. La forma peligrosa de fallar no es el error: es el resultado vacío que se lee como "no hay jurisprudencia sobre esto".

## Fuentes

**Jurisprudencia judicial** — Buscador Unificado de Fallos del Poder Judicial (`juris.pjud.cl`). Siete buscadores: Corte Suprema, Cortes de Apelaciones, Laborales, Penales, Familia, Cobranza y Civiles. Cada fallo llega con rol, tribunal, sala, fecha, carátula, tipo de recurso, resultado, ministros, descriptores, historia procesal (juzgado → corte → Suprema), permalink, cita bibliográfica ya armada, pasajes coincidentes, texto completo y **las normas aplicadas con enlace a Ley Chile**.

**Jurisprudencia constitucional** — Buscador del Tribunal Constitucional (`buscador.tcchile.cl`). Sentencias a texto completo con los párrafos que coinciden con la consulta y **descarga directa del PDF**, más las fichas de jurisprudencia que elabora el propio tribunal.

**Jurisprudencia administrativa** — Base de Dictámenes de la Contraloría General de la República (función pública, sumarios, probidad, municipalidades) y dictámenes de la Dirección del Trabajo (jornada, remuneraciones, sala cuna, negociación colectiva, fuero).

**Arbitraje** — Laudos del CAM Santiago, publicados anonimizados desde 1994, indexados por materia y por árbitro.

**Legislación** — Ley Chile (BCN). Más de 258.000 normas, con marca de derogación y fecha de versión.

**Doctrina** — Crossref, restringido a los ISSN de nueve revistas jurídicas chilenas. Sin esa restricción, una consulta en español arrastra doctrina colombiana y brasileña; con ella, más un filtro de solapamiento de términos, los resultados vienen al caso.

**Estadísticas** — `estadisticaservices.pjud.cl`, API oficial del Subdepartamento de Estadísticas de la CAPJ. 137 endpoints, sin autenticación, datos desde 2015.

**Valores económicos** — mindicador.cl (Banco Central y SII). Las multas van en UTM y los contratos en UF: sin el valor a una fecha no se calcula una pretensión.

## Instalación

Un solo comando hace todo: instala dependencias, registra el servidor en Claude Code y en Claude Desktop, instala la skill, precarga los códigos más citados y verifica las fuentes.

```bash
node instalar.mjs
```

Es idempotente y respalda cualquier configuración previa en `.bak-jurisprudencia` antes de tocarla. **Después hay que reiniciar Claude Desktop**: los servidores MCP se cargan al arrancar.

📄 **[Responsa.pdf](docs/Responsa.pdf)** — un solo documento de 17 láminas: qué es, qué contiene y cómo funciona, seguido del manual de instalación paso a paso para Windows y macOS, con problemas frecuentes y mantención. Es lo que conviene enviarle a alguien que lo va a instalar.

También en [texto plano](INSTALACION.md), por si se prefiere leer en el navegador.

### Paso a paso, si prefieres

```bash
npm install
```

Comprobar que las ocho fuentes responden (unos 12 segundos):

```bash
npm run salud
```

Precargar los códigos y leyes más citados (una sola vez, tarda unos minutos):

```bash
npm run precargar
```

Este paso importa. El límite de servicio de la BCN no es sólo de frecuencia: pesa el tamaño del documento, y bajar el Código del Trabajo o el de Procedimiento Civil recién empezada una sesión puede toparse con un 429. Precargados, quedan en caché 7 días y el uso diario no vuelve a pedirlos. Si alguna falla, basta con volver a correr el comando: retoma sólo lo que falta.

Banco completo, 50 comprobaciones:

```bash
npm run prueba
```

### Conectarlo a Claude Code

```bash
claude mcp add responsa --scope user -- node /ruta/a/Responsa/src/index.mjs
```

### Conectarlo a Claude Desktop

En `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "responsa": {
      "command": "node",
      "args": ["/ruta/a/Responsa/src/index.mjs"]
    }
  }
}
```

### La skill

`skill/SKILL.md` es la capa de método: cuándo buscar, cómo citar en formato chileno, cómo distinguir ley de jurisprudencia, dictamen y doctrina, y qué límites declarar. El MCP entrega los datos; la skill define cómo se razona con ellos.

```bash
mkdir -p ~/.claude/skills/responsa && cp skill/SKILL.md ~/.claude/skills/responsa/
```

## Decisiones de diseño

### Por qué no hay bases de suscripción

vLex, Westlaw, HeinOnline y similares quedaron fuera **a propósito**, aunque se tenga acceso institucional.

Esas licencias autorizan el uso personal de un miembro de la institución. Consultarlas de forma automatizada —y más si la herramienta la usan terceros ajenos a esa institución— es el patrón que los proveedores detectan como uso sistemático. La consecuencia habitual no es una advertencia: es el corte de la cuenta y, en casos serios, el bloqueo del rango completo de la universidad. Para una herramienta pensada para compartirse, el costo esperado supera con creces el beneficio.

La doctrina viene entonces de revistas de acceso abierto, y el razonamiento jurídico de los propios fallos, dictámenes y laudos, que citan doctrina y jurisprudencia previa.

### Por qué la consulta de causas no está automatizada

La Consulta Unificada de Causas de la Oficina Judicial Virtual es pública, pero sus cuatro formularios envían un campo `g-recaptcha-response-*` **junto con cada búsqueda**: reCAPTCHA v3 con acciones `validate_captcha_rit`, `_nombre`, `_fecha` y `_jur`.

El captcha protege la consulta misma, no la carga de la página. Automatizarla exigiría falsear tokens de detección de bots. Por eso `consultar_causa` arma el enlace y los pasos, y la búsqueda la hace la persona.

El contraste importa: el buscador de jurisprudencia también carga reCAPTCHA, pero su token **no** viaja en el payload de búsqueda. Por eso aquél sí se consulta de forma programática. La diferencia se verificó inspeccionando ambos payloads, no suponiendo.

Si hiciera falta automatizar consulta de causas, las vías legítimas son "Mis Causas" con Clave Única para causas propias, o un servicio comercial con licencia (Khipu vende justamente eso, y su negocio existe porque el acceso directo está bloqueado).

### Por qué el arbitraje se enlaza y no se copia

El CAM Santiago declara que los laudos son de su propiedad y que reproducirlos en sitios externos requiere autorización previa. El módulo indexa y enlaza al PDF oficial, pero no descarga ni reproduce el contenido.

## Fiabilidad

**Caché en disco obligatoria.** La BCN devuelve `429 Service limit has been reached` con muy poco tráfico. Normas 7 días, búsquedas 1 día, sesión del PJUD 10 minutos, dictámenes y estadísticas 7 días, índices del CAM 7 días, UF histórica 30 días, UF del día 1 hora. Se guarda en `~/.responsa/cache` (configurable con `RESPONSA_CACHE_DIR`).

**Control de ritmo por host.** Intervalo mínimo entre peticiones (1,2 s a la BCN, 250 ms a Crossref) y espera larga ante 429. Sin esto, la búsqueda de doctrina —que consulta nueve revistas— se auto-bloquea.

**Renovación automática de sesión.** El token CSRF del PJUD caduca antes que su TTL en caché. Si una búsqueda falla, se descarta la sesión y se reintenta con una nueva; sin eso el buscador quedaba inservible hasta que venciera el caché.

**Los vacíos se declaran.** Las estadísticas devuelven `200 []` para una corte inexistente: el módulo lo convierte en `sin_datos: true` con un mensaje explícito, para que el silencio no se lea como "no hay causas". Lo mismo en doctrina cuando ningún resultado es pertinente, y en arbitraje cuando no hay coincidencias.

**Los cambios de estructura gritan.** Si el PJUD cambia su buscador, el error lo dice ("El PJUD devolvió JSON sin el campo `response`: la estructura del buscador cambió") en vez de devolver una lista vacía en silencio. Igual el CAM y la Contraloría.

**La BCN responde 401 sin User-Agent de navegador.** Todas las peticiones lo envían.

## Notas de implementación

**El PJUD no tiene API documentada.** La búsqueda es `POST /busqueda/buscar_sentencias`, app Laravel con Solr detrás: hay que abrir la página del buscador para obtener el token CSRF y la cookie antes de consultar.

**Los artículos de la BCN salen del XML completo**, no de `opt=71`: ese endpoint es el primero en toparse con el límite de servicio.

**La Contraloría es Lotus Domino y responde en Latin-1.** Pese a que el formulario declara `method="post"`, el POST devuelve "Form processed" y nada más: la consulta real es un GET con `hpbb=SI`. El texto completo llega por un agente aparte.

**La búsqueda de la Dirección del Trabajo está rota, así que se reemplazó.** Su `w3-search.php` cuelga la conexión desde Node, desde curl y desde un navegador real, o sea que no es un bloqueo antibot sino un endpoint caído. Lo que sí responde son las portadillas de listado, y ahí está todo: los doce meses de un año son los `propertyvalue` correlativos al del año (2024 = 188794 → enero 188795 … diciembre 188806), y cada entrada trae número, fecha ISO, sumario completo en el atributo `title` y un epígrafe con descriptores. Con eso se arma un índice propio y se busca en local. La relevancia pondera el primer descriptor del epígrafe, que es la materia principal, y penaliza los epígrafes que abarcan muchos temas.

**El caché va versionado.** Cambiar cómo se parsea una fuente no sirve de nada si el usuario ya tiene la respuesta vieja guardada: seguiría recibiendo el formato anterior hasta que venza el TTL. Al cambiar la forma de lo que devuelve una fuente hay que subir `VERSION` en `src/lib/cache.mjs`.

## Lo que no cubre

**Tramitación legislativa.** `congresorest.appspot.com` está caído (HTTP 500) y la API de Ley Lobby cambió de ruta.

**Cobertura del buscador del PJUD.** No contiene todas las sentencias del país, sino una selección con criterio de interés jurisprudencial, y parte aparece anonimizada. Que algo no aparezca no prueba que no exista. Lo mismo vale para los laudos publicados del CAM.

**Esto es investigación jurídica asistida, no asesoría legal.**
