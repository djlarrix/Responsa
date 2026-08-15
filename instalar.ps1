# Responsa — instalador de un comando para Windows.
#
#   irm https://raw.githubusercontent.com/djlarrix/Responsa/main/instalar.ps1 | iex
#
# Hace todo: instala Node.js si falta, descarga Responsa, lo instala, lo
# registra en Claude y verifica que las fuentes respondan.
#
# Se puede ejecutar varias veces: si ya está instalado, actualiza.

$ErrorActionPreference = 'Stop'
$destino = Join-Path $HOME 'Responsa'
$repo = 'https://github.com/djlarrix/Responsa'

function Paso($n, $t) { Write-Host "`n[$n/4] $t" -ForegroundColor White }
function Ok($t)    { Write-Host "      $t" -ForegroundColor DarkGray }
function Malo($t)  { Write-Host "      $t" -ForegroundColor Red }

Write-Host ""
Write-Host "  RESPONSA" -ForegroundColor White
Write-Host "  Fuentes juridicas chilenas verificables para Claude" -ForegroundColor DarkYellow

# ─────────────────────────────────────────────────────────── 1. Node.js
Paso 1 'Comprobando Node.js'

function NodeVersionOk {
  try {
    $v = (& node --version 2>$null)
    if ($v -match 'v(\d+)') { return [int]$matches[1] -ge 20 }
  } catch { }
  return $false
}

if (NodeVersionOk) {
  Ok "Ya esta: $(& node --version)"
} else {
  Ok 'No esta. Instalandolo con winget (puede tardar un par de minutos)...'
  try {
    & winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null
  } catch {
    Malo 'No se pudo instalar Node automaticamente.'
    Malo 'Instalalo a mano desde https://nodejs.org (version LTS) y vuelve a ejecutar este comando.'
    return
  }
  # winget no refresca el PATH de la sesion actual.
  $rutaNode = Join-Path $env:ProgramFiles 'nodejs'
  if (Test-Path $rutaNode) { $env:PATH = "$rutaNode;$env:PATH" }

  if (NodeVersionOk) {
    Ok "Instalado: $(& node --version)"
  } else {
    Malo 'Node quedo instalado pero esta ventana no lo ve todavia.'
    Malo 'Cierra PowerShell, abrelo de nuevo y vuelve a ejecutar este comando.'
    return
  }
}

# ────────────────────────────────────────────────────── 2. Descargar
Paso 2 'Descargando Responsa'

$tieneGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)

if (Test-Path (Join-Path $destino 'instalar.mjs')) {
  Ok "Ya existe en $destino"
  if ($tieneGit -and (Test-Path (Join-Path $destino '.git'))) {
    Ok 'Actualizando a la ultima version...'
    Push-Location $destino
    try { & git pull --quiet 2>$null; Ok 'Actualizado' } catch { Ok 'No se pudo actualizar; se usa la version que ya estaba' }
    Pop-Location
  }
} elseif ($tieneGit) {
  Ok 'Clonando el repositorio...'
  & git clone --quiet --depth 1 "$repo.git" $destino
  Ok "Descargado en $destino"
} else {
  Ok 'Descargando el ZIP...'
  $zip = Join-Path $env:TEMP 'responsa.zip'
  $tmp = Join-Path $env:TEMP 'responsa-tmp'
  Invoke-WebRequest -Uri "$repo/archive/refs/heads/main.zip" -OutFile $zip -UseBasicParsing
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $carpeta = Get-ChildItem $tmp -Directory | Select-Object -First 1
  if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
  Move-Item $carpeta.FullName $destino
  Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue
  Ok "Descargado en $destino"
}

# ────────────────────────────────────────────────────── 3. Instalar
Paso 3 'Instalando (dependencias, registro en Claude, skill y precarga)'
Ok 'Esto tarda unos minutos, sobre todo la precarga de los codigos.'
Write-Host ""

Push-Location $destino
try {
  & node instalar.mjs
} finally {
  Pop-Location
}

# ────────────────────────────────────────────────────── 4. Reiniciar
Paso 4 'Ultimo paso: reiniciar Claude'
Write-Host ""
Write-Host "      Cierra Claude Desktop POR COMPLETO." -ForegroundColor Yellow
Write-Host "      No basta con cerrar la ventana: busca el icono junto al reloj," -ForegroundColor Yellow
Write-Host "      abajo a la derecha, clic derecho y Quit. Despues abrelo de nuevo." -ForegroundColor Yellow
Write-Host ""
Write-Host "      Para comprobar que quedo bien, preguntale algo de derecho chileno:" -ForegroundColor DarkGray
Write-Host '      "Que ha resuelto la Corte Suprema sobre nulidad del despido?"' -ForegroundColor DarkGray
Write-Host ""
Write-Host "      Si responde con roles, tribunales y enlaces, esta funcionando." -ForegroundColor DarkGray
Write-Host ""
