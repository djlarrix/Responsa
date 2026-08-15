#!/usr/bin/env node
/**
 * Instalador de un solo comando.
 *
 *   node instalar.mjs
 *
 * Hace todo: instala dependencias, registra el servidor en Claude Code y en
 * Claude Desktop, instala la skill, precarga los códigos más citados y verifica
 * que las fuentes respondan.
 *
 * Es idempotente: se puede correr varias veces sin romper nada. Antes de tocar
 * cualquier configuración existente deja un respaldo `.bak-jurisprudencia`.
 */
import { execSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));
const ENTRADA = join(RAIZ, 'src', 'index.mjs').replace(/\\/g, '/');
const NOMBRE = 'responsa';

const c = { ok: '\x1b[32m', mal: '\x1b[31m', aviso: '\x1b[33m', tenue: '\x1b[90m', fin: '\x1b[0m', fuerte: '\x1b[1m' };
const paso = (t) => console.log(`\n${c.fuerte}${t}${c.fin}`);
const ok = (t) => console.log(`  ${c.ok}✓${c.fin} ${t}`);
const mal = (t) => console.log(`  ${c.mal}✗${c.fin} ${t}`);
const nota = (t) => console.log(`  ${c.tenue}${t}${c.fin}`);

let errores = 0;

// ---------------------------------------------------------------- 1. Node
paso('1. Comprobando Node');
const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  mal(`Node ${process.versions.node}. Se necesita 20 o superior: https://nodejs.org`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// -------------------------------------------------------- 2. Dependencias
paso('2. Instalando dependencias');
try {
  execSync('npm install --no-fund --no-audit --loglevel=error', { cwd: RAIZ, stdio: 'inherit' });
  ok('dependencias instaladas');
} catch {
  mal('falló npm install');
  process.exit(1);
}

// ------------------------------------------------- 3. Registro en clientes
/** Escribe la entrada mcpServers en un JSON de configuración, con respaldo. */
function registrar(ruta, etiqueta, { crearSiFalta = false } = {}) {
  try {
    if (!existsSync(ruta)) {
      if (!crearSiFalta) {
        nota(`${etiqueta}: no encontrado (${ruta}) — se omite`);
        return;
      }
      mkdirSync(dirname(ruta), { recursive: true });
      writeFileSync(ruta, '{}', 'utf8');
    }

    const crudo = readFileSync(ruta, 'utf8');
    let cfg;
    try {
      cfg = JSON.parse(crudo);
    } catch {
      mal(`${etiqueta}: su configuración no es JSON válido, no se toca (${ruta})`);
      errores++;
      return;
    }

    copyFileSync(ruta, ruta + '.bak-jurisprudencia');
    cfg.mcpServers = cfg.mcpServers ?? {};
    cfg.mcpServers[NOMBRE] = { type: 'stdio', command: 'node', args: [ENTRADA], env: {} };
    writeFileSync(ruta, JSON.stringify(cfg, null, 2), 'utf8');

    // Verificar que quedó bien y que no se perdió nada.
    const despues = JSON.parse(readFileSync(ruta, 'utf8'));
    const perdidas = Object.keys(JSON.parse(crudo)).filter((k) => !(k in despues));
    if (perdidas.length) {
      mal(`${etiqueta}: se perdieron claves (${perdidas.join(', ')}). Restaura ${ruta}.bak-jurisprudencia`);
      errores++;
      return;
    }
    ok(`${etiqueta} (respaldo en ${etiqueta === 'Claude Desktop' ? 'claude_desktop_config' : '.claude'}.json.bak-jurisprudencia)`);
  } catch (e) {
    mal(`${etiqueta}: ${e.message}`);
    errores++;
  }
}

paso('3. Registrando el servidor en Claude');
registrar(join(homedir(), '.claude.json'), 'Claude Code', { crearSiFalta: true });

const rutaDesktop =
  platform() === 'win32'
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json')
    : platform() === 'darwin'
      ? join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
      : join(homedir(), '.config', 'Claude', 'claude_desktop_config.json');
registrar(rutaDesktop, 'Claude Desktop');

// ------------------------------------------------------------- 4. La skill
paso('4. Instalando la skill de método');
try {
  const destino = join(homedir(), '.claude', 'skills', 'responsa');
  mkdirSync(destino, { recursive: true });
  copyFileSync(join(RAIZ, 'skill', 'SKILL.md'), join(destino, 'SKILL.md'));
  ok('skill "responsa" instalada');
} catch (e) {
  mal(`skill: ${e.message}`);
  errores++;
}

// --------------------------------------------------------- 5. Precarga BCN
paso('5. Precargando códigos y leyes más citados');
nota('la BCN limita por tamaño de documento; esto evita topes durante el uso normal');
const pre = spawnSync(process.execPath, [join(RAIZ, 'scripts', 'precargar.mjs')], { cwd: RAIZ, stdio: 'inherit' });
if (pre.status !== 0) nota('quedaron normas sin precargar; se descargarán al usarlas o corre: npm run precargar');

// ------------------------------------------------------------ 6. Verificar
paso('6. Verificando las fuentes');
const { verificarFuentes } = await import('./src/lib/salud.mjs');
const salud = await verificarFuentes();
for (const r of salud.resultados) {
  (r.estado === 'ok' ? ok : mal)(`${r.fuente.padEnd(38)} ${String(r.detalle ?? r.problema).slice(0, 70)}`);
}

// ---------------------------------------------------------------- Resumen
console.log(`\n${'─'.repeat(64)}`);
if (errores) {
  console.log(`${c.mal}Instalación con ${errores} problema(s).${c.fin} Revisa los mensajes de arriba.`);
} else {
  console.log(`${c.ok}${c.fuerte}Instalado.${c.fin} ${salud.fuentes_ok}/${salud.resultados.length} fuentes responden.`);
}
if (salud.fuentes_con_falla) {
  console.log(`${c.aviso}${salud.fuentes_con_falla} fuente(s) sin responder ahora mismo.${c.fin}`);
  console.log('Suele ser una caída pasajera del organismo, no de la instalación. Reintenta con: npm run salud');
}

// Contar las herramientas en vez de escribir el número a mano: así no se
// desfasa cada vez que se agrega una.
let nHerramientas = '';
try {
  const src = readFileSync(join(RAIZ, 'src', 'index.mjs'), 'utf8');
  const n = (src.match(/^\s{2}\{\s*$\n\s{4}name: '/gm) ?? []).length || (src.match(/\n\s{4}name: '\w+',\n\s{4}description:/g) ?? []).length;
  if (n) nHerramientas = ` ${n}`;
} catch {}

console.log(`
${c.fuerte}Cómo usarlo${c.fin}

  Reinicia Claude Desktop (o abre una sesión nueva de Claude Code) y pregunta
  en lenguaje natural. No hay que invocar herramientas a mano: el servidor
  publica${nHerramientas} y Claude elige según lo que pidas.

  ${c.tenue}"¿Qué ha fallado la Corte Suprema sobre nulidad del despido?"${c.fin}
  ${c.tenue}"Fallos que apliquen el artículo 16 de la Ley 19.496"${c.fin}
  ${c.tenue}"¿Cuánto demora un juicio laboral en Valparaíso?"${c.fin}
  ${c.tenue}"Dictámenes de la Dirección del Trabajo sobre sala cuna"${c.fin}
  ${c.tenue}"Laudos del CAM sobre contratos de construcción"${c.fin}

${c.fuerte}Comandos útiles${c.fin}

  npm run salud       comprueba que las fuentes respondan
  npm run prueba      banco completo de comprobaciones
  npm run precargar   vuelve a intentar la precarga de normas
`);

process.exit(errores ? 1 : 0);
