# Manual de instalación

Guía completa para dejar Responsa funcionando en Windows o en macOS. Está escrita para alguien que no programa: si algo pide conocimiento previo, es un error de esta guía y conviene avisarlo.

Toma unos 15 minutos, casi todo esperando descargas.

---

## Índice

1. [Qué se va a instalar](#1-qué-se-va-a-instalar)
2. [Requisitos](#2-requisitos)
3. [Instalar Node.js](#3-instalar-nodejs)
4. [Descargar Responsa](#4-descargar-responsa)
5. [Ejecutar el instalador](#5-ejecutar-el-instalador)
6. [Reiniciar Claude](#6-reiniciar-claude)
7. [Comprobar que funciona](#7-comprobar-que-funciona)
8. [Uso diario](#8-uso-diario)
9. [Problemas frecuentes](#9-problemas-frecuentes)
10. [Actualizar y desinstalar](#10-actualizar-y-desinstalar)

---

## 1. Qué se va a instalar

Tres cosas, y el instalador las hace todas:

**El servidor Responsa.** Un programa pequeño que corre en el computador y sabe consultar diez fuentes jurídicas chilenas oficiales. No es un servicio en la nube: se ejecuta localmente y sólo se activa cuando Claude le pregunta algo.

**El registro en Claude.** Una línea en la configuración de Claude Desktop y de Claude Code para que sepan que Responsa existe.

**La skill de método.** Un documento que le indica a Claude cómo usar las fuentes: cuándo ir a la Contraloría y cuándo a la Dirección del Trabajo, cómo citar en formato chileno, y qué no puede afirmar sin respaldo.

Nada de esto envía información a terceros. Las consultas van directo a los sitios oficiales (Poder Judicial, Biblioteca del Congreso, Contraloría) igual que si se abrieran en el navegador.

---

## 2. Requisitos

| | |
|---|---|
| **Sistema** | Windows 10 o superior, o macOS 12 o superior |
| **Claude** | Claude Desktop o Claude Code instalado |
| **Node.js** | Versión 20 o superior (se instala en el paso 3) |
| **Internet** | Responsa no guarda una copia de las leyes: las consulta en vivo |
| **Espacio** | Unos 60 MB |

No hace falta cuenta en ningún servicio, ni claves, ni suscripciones. Todas las fuentes son públicas y gratuitas.

---

## 3. Instalar Node.js

Node.js es el motor que ejecuta Responsa. Es un software estándar y gratuito.

### Comprobar si ya está

Abre la terminal (ver abajo cómo) y escribe:

```
node --version
```

Si responde algo como `v20.11.0` o superior, ya está y puedes saltar al paso 4. Si dice que no reconoce el comando, sigue leyendo.

### Windows

1. Entra a **nodejs.org**
2. Descarga la versión que dice **LTS** (es la estable; la otra es para desarrolladores)
3. Abre el archivo `.msi` descargado
4. Acepta todas las opciones por defecto y termina la instalación
5. **Cierra y vuelve a abrir la terminal** para que reconozca el comando

### macOS

1. Entra a **nodejs.org**
2. Descarga la versión **LTS** para macOS
3. Abre el archivo `.pkg` descargado
4. Acepta todas las opciones por defecto

Si macOS advierte sobre "un desarrollador no identificado", ve a **Ajustes del Sistema → Privacidad y seguridad**, busca el aviso abajo y pulsa **Abrir de todas formas**.

### Cómo abrir la terminal

**Windows:** menú Inicio → escribe `PowerShell` → abre **Windows PowerShell**.

**macOS:** `Command + Espacio` → escribe `Terminal` → Enter.

---

## 4. Descargar Responsa

### Opción A: descarga directa (más simple)

1. Entra a la página del proyecto en GitHub
2. Pulsa el botón verde **Code** → **Download ZIP**
3. Descomprime el archivo
4. Mueve la carpeta `Responsa` a un lugar estable, donde no la vayas a borrar por error:
   - **Windows:** `C:\Users\TU_USUARIO\Responsa`
   - **macOS:** `/Users/TU_USUARIO/Responsa`

> La carpeta tiene que quedarse ahí. Claude va a apuntar a esa ruta cada vez que arranque, así que si después la mueves, hay que volver a ejecutar el instalador.

### Opción B: con git

Si tienes git instalado:

```
git clone <URL-DEL-REPOSITORIO> Responsa
```

---

## 5. Ejecutar el instalador

Abre la terminal y sitúate en la carpeta de Responsa.

**Windows:**

```
cd C:\Users\TU_USUARIO\Responsa
```

**macOS:**

```
cd ~/Responsa
```

> Truco: escribe `cd ` (con el espacio) y después arrastra la carpeta a la ventana de la terminal. La ruta se escribe sola.

Ahora ejecuta:

```
node instalar.mjs
```

### Qué va a pasar

El instalador muestra seis pasos en pantalla:

1. **Comprueba Node** — falla aquí si la versión es anterior a la 20
2. **Instala dependencias** — descarga las librerías que necesita
3. **Registra el servidor** en Claude Code y en Claude Desktop
4. **Instala la skill** de método
5. **Precarga los códigos** más citados (Código Civil, del Trabajo, Penal, Constitución y las leyes principales)
6. **Verifica las fuentes** y muestra cuáles responden

El paso 5 es el más lento, unos minutos. Es a propósito: la Biblioteca del Congreso limita las descargas grandes, y bajar los códigos con calma una vez evita topes durante el uso normal.

Al terminar verás algo así:

```
────────────────────────────────────────────
Instalado. 10/10 fuentes responden.
```

Si dice menos de 10, no pasa nada: significa que algún organismo tenía su sitio caído en ese momento. Se comprueba después con `npm run salud`.

El instalador se puede ejecutar las veces que quieras. Antes de tocar cualquier configuración deja una copia de respaldo.

---

## 6. Reiniciar Claude

**Este paso es obligatorio.** Claude carga los servidores al arrancar: si no lo reinicias, Responsa no aparece.

**Windows:** no basta con cerrar la ventana. Busca el ícono de Claude junto al reloj, abajo a la derecha (puede estar escondido tras la flecha `^`), haz clic derecho y elige **Quit**. Después vuelve a abrirlo.

**macOS:** `Command + Q` con Claude en primer plano. Cerrar la ventana con la bolita roja no basta.

**Claude Code:** basta con abrir una sesión nueva.

---

## 7. Comprobar que funciona

Abre Claude y pregunta:

> ¿Qué ha resuelto la Corte Suprema sobre nulidad del despido?

**Está funcionando** si la respuesta trae roles, tribunales, fechas y enlaces concretos. Algo así:

> Corte Suprema, rol 35.176-2026, 11 de agosto de 2026, "Saavedra con ONG Corporación de Desarrollo Cultural Crearte"...

**No está funcionando** si responde en general, explicando qué es la nulidad del despido sin citar ni un fallo. En ese caso, revisa el paso 6 y el capítulo 9.

También puedes comprobarlo desde la terminal:

```
npm run salud
```

Consulta las diez fuentes con preguntas de respuesta conocida y dice cuál responde y cuál no. Tarda unos segundos.

---

## 8. Uso diario

No hay que aprender comandos ni recordar nombres de herramientas. Se pregunta en lenguaje natural y Claude elige, entre las veinte herramientas disponibles, las que corresponden.

Ejemplos de lo que entiende:

| Pregunta | A dónde va |
|---|---|
| «Fallos que apliquen el artículo 16 de la Ley 19.496» | Ley Chile + Poder Judicial, filtrando por la norma aplicada |
| «¿Qué han resuelto los tribunales sobre tutela laboral?» | Los siete buscadores del Poder Judicial a la vez |
| «¿Es constitucional esta norma?» | Tribunal Constitucional, con los párrafos pertinentes y el PDF |
| «Dictámenes sobre sala cuna» | Dirección del Trabajo, o Contraloría si es función pública |
| «Arbitrajes sobre contratos de construcción» | Laudos del CAM Santiago, con enlace al PDF |
| «¿Cuánto demora un juicio laboral en Valparaíso?» | Estadísticas oficiales del Poder Judicial |
| «¿A cuánto equivalen 50 UTM hoy?» | Valores del Banco Central y del SII |

Una sola pregunta puede combinar varias fuentes: ubicar la norma, leer su texto vigente, traer los fallos que la aplican y sumar el criterio administrativo.

### Qué esperar de las respuestas

**Jurisprudencia:** rol, tribunal, sala, fecha, carátula, resultado, ministros, historia procesal, enlace y las normas aplicadas con su vínculo a Ley Chile.

**Legislación:** texto oficial vigente, con fecha de versión y aviso si está derogada.

**Dictámenes:** número, fecha, materia y —en la Contraloría— si fue reconsiderado. Un dictamen reconsiderado ya no sirve para fundar, y Responsa lo advierte.

**Doctrina y laudos:** cita completa con DOI, o enlace al PDF oficial.

### Lo que Responsa no hace

**No consulta el estado de causas.** La Oficina Judicial Virtual exige resolver un control antibot en cada búsqueda, y eso lo tiene que hacer una persona. Responsa entrega el enlace y los pasos. Para causas propias está "Mis Causas" con Clave Única.

**No accede a bases de suscripción.** vLex, Westlaw y similares quedaron fuera a propósito: sus licencias son personales, y consultarlas de forma automatizada arriesga el corte de la cuenta.

**No es asesoría legal.** Es investigación jurídica asistida. En materias con plazos, prescripción o caducidad de por medio, corresponde revisión profesional antes de actuar.

---

## 9. Problemas frecuentes

### Claude responde sin citar fuentes

Casi siempre es que no se reinició Claude por completo (paso 6). En Windows hay que salir desde el ícono junto al reloj; en macOS con `Command + Q`.

Si ya lo hiciste, ejecuta `node instalar.mjs` otra vez y fíjate si algún paso reporta error.

### «node no se reconoce como un comando»

Node.js no quedó instalado, o la terminal se abrió antes de instalarlo. Cierra la terminal, ábrela de nuevo y prueba `node --version`. Si sigue fallando, reinstala Node desde nodejs.org.

### «Ley Chile alcanzó su límite de servicio»

La Biblioteca del Congreso limita las descargas grandes. Espera un minuto, o ejecuta:

```
npm run precargar
```

Baja los códigos principales con calma y los deja guardados una semana. Se puede ejecutar varias veces: retoma sólo lo que falta.

### Una fuente aparece caída

Son sitios de organismos públicos y a veces se caen. No es la instalación.

```
npm run salud
```

te dice cuál está fallando. Cuando una fuente no responde, Claude debe decirlo y no rellenar el hueco con conocimiento propio. **Si alguna vez entrega citas sin haberlas consultado, no las des por buenas.**

### El instalador dice que la configuración no es JSON válido

La configuración de Claude tiene un error de formato previo, así que el instalador no la toca para no empeorarla. Habría que revisarla a mano o restaurarla desde el respaldo `.bak-jurisprudencia`.

### Cambié la carpeta de lugar

Claude sigue apuntando a la ruta antigua. Ejecuta `node instalar.mjs` desde la carpeta nueva.

---

## 10. Actualizar y desinstalar

### Actualizar

Descarga la versión nueva sobre la carpeta anterior y ejecuta:

```
node instalar.mjs
```

Si usaste git:

```
git pull
node instalar.mjs
```

### Comprobar que todo sigue en pie

```
npm run prueba
```

Corre 68 comprobaciones contra las fuentes reales. Tarda unos minutos.

```
npm run auditoria
```

Verifica que los datos escritos a mano en el código sigan siendo ciertos: que cada identificador de norma apunte a la norma que dice, que los códigos de corte sean los correctos, que cada revista sea la que se declara. Es la comprobación que importa cuando se trabaja con citas.

### Desinstalar

1. Abre la configuración de Claude Desktop:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Borra la entrada `"responsa"` dentro de `mcpServers`
3. Borra la carpeta `~/.claude/skills/responsa`
4. Borra la carpeta `~/.responsa` (los datos guardados)
5. Borra la carpeta de Responsa

---

## Comandos de referencia

| Comando | Qué hace |
|---|---|
| `node instalar.mjs` | Instala todo. Se puede repetir sin riesgo |
| `npm run salud` | Comprueba que las diez fuentes respondan (segundos) |
| `npm run prueba` | Banco completo, 68 comprobaciones (minutos) |
| `npm run auditoria` | Verifica que los datos del código sigan siendo ciertos |
| `npm run precargar` | Reintenta la precarga de códigos y leyes |

---

Creado por Joaquín Larraín Guimoye.
