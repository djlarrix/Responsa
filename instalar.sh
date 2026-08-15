#!/usr/bin/env bash
# Responsa — instalador de un comando para macOS y Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/djlarrix/Responsa/main/instalar.sh | bash
#
# Hace todo: comprueba Node.js, descarga Responsa, lo instala, lo registra en
# Claude y verifica que las fuentes respondan.
#
# Se puede ejecutar varias veces: si ya está instalado, actualiza.

set -euo pipefail

DESTINO="$HOME/Responsa"
REPO="https://github.com/djlarrix/Responsa"

BLANCO=$'\033[1;37m'; BRONCE=$'\033[0;33m'; TENUE=$'\033[0;90m'
ROJO=$'\033[0;31m'; AMARILLO=$'\033[0;33m'; FIN=$'\033[0m'

paso() { printf '\n%s[%s/4] %s%s\n' "$BLANCO" "$1" "$2" "$FIN"; }
ok()   { printf '      %s%s%s\n' "$TENUE" "$1" "$FIN"; }
malo() { printf '      %s%s%s\n' "$ROJO" "$1" "$FIN"; }

printf '\n  %sRESPONSA%s\n' "$BLANCO" "$FIN"
printf '  %sFuentes jurídicas chilenas verificables para Claude%s\n' "$BRONCE" "$FIN"

# Claude Desktop reescribe su configuración al cerrarse, así que si está
# abierto borrará el registro que hagamos. Hay que atajarlo antes de empezar.
if pgrep -x "Claude" >/dev/null 2>&1; then
  echo
  printf '  %sALTO: Claude Desktop está abierto.%s\n' "$AMARILLO" "$FIN"
  echo
  printf '  %sAl cerrarse sobrescribe su configuración y borra el registro,%s\n' "$AMARILLO" "$FIN"
  printf '  %sasí que la instalación no quedaría.%s\n' "$AMARILLO" "$FIN"
  echo
  printf '  %sCiérralo POR COMPLETO con Command + Q y vuelve a pegar este comando.%s\n' "$BLANCO" "$FIN"
  echo
  exit 1
fi

# ─────────────────────────────────────────────────────────── 1. Node.js
paso 1 'Comprobando Node.js'

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local mayor
  mayor="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
  [ -n "$mayor" ] && [ "$mayor" -ge 20 ]
}

if node_ok; then
  ok "Ya está: $(node --version)"
elif command -v brew >/dev/null 2>&1; then
  ok 'No está. Instalándolo con Homebrew (puede tardar unos minutos)...'
  brew install node >/dev/null
  if node_ok; then
    ok "Instalado: $(node --version)"
  else
    malo 'Node quedó instalado pero esta terminal no lo ve todavía.'
    malo 'Ciérrala, abre una nueva y vuelve a ejecutar este comando.'
    exit 1
  fi
else
  malo 'Falta Node.js 20 o superior, y no hay Homebrew para instalarlo solo.'
  malo ''
  malo 'Descárgalo desde https://nodejs.org (la versión que dice LTS),'
  malo 'ábrelo, acepta todo por defecto, y vuelve a ejecutar este comando.'
  exit 1
fi

# ────────────────────────────────────────────────────── 2. Descargar
paso 2 'Descargando Responsa'

if [ -f "$DESTINO/instalar.mjs" ]; then
  ok "Ya existe en $DESTINO"
  if [ -d "$DESTINO/.git" ] && command -v git >/dev/null 2>&1; then
    ok 'Actualizando a la última versión...'
    git -C "$DESTINO" pull --quiet 2>/dev/null && ok 'Actualizado' || ok 'No se pudo actualizar; se usa la versión que ya estaba'
  fi
elif command -v git >/dev/null 2>&1; then
  ok 'Clonando el repositorio...'
  git clone --quiet --depth 1 "$REPO.git" "$DESTINO"
  ok "Descargado en $DESTINO"
else
  ok 'Descargando el ZIP...'
  TMP="$(mktemp -d)"
  curl -fsSL "$REPO/archive/refs/heads/main.zip" -o "$TMP/responsa.zip"
  unzip -q "$TMP/responsa.zip" -d "$TMP"
  rm -rf "$DESTINO"
  mv "$TMP"/Responsa-* "$DESTINO"
  rm -rf "$TMP"
  ok "Descargado en $DESTINO"
fi

# ────────────────────────────────────────────────────── 3. Instalar
paso 3 'Instalando (dependencias, registro en Claude, skill y precarga)'
ok 'Esto tarda unos minutos, sobre todo la precarga de los códigos.'
echo

cd "$DESTINO"
node instalar.mjs

# ────────────────────────────────────────────────────── 4. Reiniciar
paso 4 'Último paso: reiniciar Claude'
echo
printf '      %sCierra Claude Desktop POR COMPLETO con Command + Q.%s\n' "$AMARILLO" "$FIN"
printf '      %sCerrar la ventana con la bolita roja no basta.%s\n' "$AMARILLO" "$FIN"
echo
printf '      %sPara comprobar que quedó bien, pregúntale algo de derecho chileno:%s\n' "$TENUE" "$FIN"
printf '      %s«¿Qué ha resuelto la Corte Suprema sobre nulidad del despido?»%s\n' "$TENUE" "$FIN"
echo
printf '      %sSi responde con roles, tribunales y enlaces, está funcionando.%s\n' "$TENUE" "$FIN"
echo
