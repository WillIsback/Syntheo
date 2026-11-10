# Construit en local une alpha devtools Windows (NSIS + MSI non signés), avec
# les étapes de .github/workflows/build-windows.yml sans la signature. Les
# alphas se construisent uniquement en local : il n'y a plus de workflow
# d'alpha sur GitHub. À lancer dans la VM Windows, depuis la racine du dépôt :
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-alpha.ps1 -Version 0.7.1-1
#   powershell -ExecutionPolicy Bypass -File .\scripts\build-alpha.ps1 -Version 0.7.1-1 -OutDir D:\alphas\0.7.1-1
#
# Suffixe de version numérique obligatoire (0.7.1-1, pas 0.7.1-alpha.1) :
# l'installeur MSI refuse les autres.
#
# Aucune signature : les variables Azure et Tauri de signature sont retirées de
# l'environnement, et tauri.windows-signing.conf.json n'est jamais utilisé.
#
# Prérequis (voir CONTRIBUTING.md, « Construire une alpha en local ») :
# Visual Studio Build Tools 2022 (charge « Développement Desktop en C++ » :
# MSVC v143, SDK Windows, outils CMake C++), Rust (rustup), Node.js 22 et pnpm,
# Git, LLVM (libclang pour bindgen), Strawberry Perl (OpenSSL vendu), WebView2.
#
# NON TESTÉ en conditions réelles à sa création (#537) : la première exécution
# dans la VM sert de validation.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Version,
  [string]$OutDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Version = $Version -replace '^v', ''
if ($Version -notmatch '^\d+\.\d+\.\d+-\d+$') {
  throw "Version « $Version » invalide. Format attendu : X.Y.Z-N avec un suffixe numérique (ex. 0.7.1-1, pas 0.7.1-alpha.1) : l'installeur MSI refuse les autres."
}

$Root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $HOME "syntheo-alpha\$Version" }
$Out = Join-Path $OutDir "syntheo-devtools-windows"
$SrcTauri = Join-Path $Root "apps\desktop\src-tauri"
$Conf = Join-Path $SrcTauri "tauri.conf.syntheo.json"
Set-Location $Root

function Invoke-Checked {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') a échoué (code $LASTEXITCODE)." }
}

# --- Vérifications préalables -------------------------------------------------

$missing = @()
foreach ($cmd in "git", "node", "pnpm", "cargo", "rustup", "perl", "cmake") {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { $missing += $cmd }
}
if (-not $env:LIBCLANG_PATH -and -not (Get-Command clang -ErrorAction SilentlyContinue)) {
  $missing += "LLVM (clang ou LIBCLANG_PATH)"
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vs = $null
if (Test-Path $vswhere) {
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if (-not $vs) { $missing += "Visual Studio Build Tools (outils VC x64)" }
if ($missing.Count -gt 0) {
  Write-Host "Dépendances manquantes :" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  - $_" }
  Write-Host @"

Installation, une fois, dans un PowerShell administrateur (versions figées, sommes vérifiées) :
  powershell -ExecutionPolicy Bypass -File .\scripts\alpha\install-windows-toolchain.ps1
Puis rouvrir le terminal (ou la session SSH).
"@
  exit 1
}

$webview2 = @(
  "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
  "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
) | Where-Object { Test-Path $_ }
if (-not $webview2) {
  Write-Warning "Runtime WebView2 introuvable (présent par défaut sous Windows 11) : winget install Microsoft.EdgeWebView2Runtime"
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]") | Out-String).Trim()
if ($nodeMajor -lt 22) { throw "Node.js $(node -v) trop ancien (22.23 ou plus requis)." }

$expectedPnpm = ((Get-Content -Raw (Join-Path $Root "package.json") | ConvertFrom-Json).packageManager) -replace '^pnpm@', ''
$actualPnpm = (pnpm --version | Out-String).Trim()
if ($expectedPnpm -and $actualPnpm -ne $expectedPnpm) {
  Write-Warning "pnpm $actualPnpm, le dépôt fixe pnpm $expectedPnpm (corepack enable)."
}

# --- Aucune signature ---------------------------------------------------------

foreach ($name in "AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET",
  "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PASSWORD") {
  Remove-Item "Env:$name" -ErrorAction SilentlyContinue
}

# --- Build ---------------------------------------------------------------------

Write-Host "== Alpha devtools Windows $Version ($(git rev-parse --short HEAD), $(git rev-parse --abbrev-ref HEAD))"

Invoke-Checked pnpm @("install", "--frozen-lockfile")

# Version injectée comme dans le workflow, puis configuration restaurée à
# l'identique (le workflow réécrit le JSON, ici on remet l'original).
$confBackup = [System.IO.Path]::GetTempFileName()
Copy-Item $Conf $confBackup -Force
try {
  $json = Get-Content -Raw $Conf | ConvertFrom-Json
  $json | Add-Member -NotePropertyName version -NotePropertyValue $Version -Force
  $json | ConvertTo-Json -Depth 100 | Set-Content -Encoding utf8 $Conf

  # Runtime Visual C++ embarqué à côté de syntheo.exe (#313), comme le workflow.
  $redist = Get-ChildItem (Join-Path $vs "VC\Redist\MSVC") -Directory |
    Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' -and (Test-Path (Join-Path $_.FullName "x64\Microsoft.VC143.CRT")) } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
  if (-not $redist) { throw "Dossier VC\Redist\MSVC\<version>\x64\Microsoft.VC143.CRT introuvable" }
  $crt = Join-Path $redist.FullName "x64\Microsoft.VC143.CRT"
  $vcrt = Join-Path $SrcTauri "vcrt"
  New-Item -ItemType Directory -Force -Path $vcrt | Out-Null
  foreach ($dll in "vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll") {
    Copy-Item (Join-Path $crt $dll) $vcrt -Force
  }
  $dumpbin = Get-ChildItem (Join-Path $vs "VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe") |
    Sort-Object FullName -Descending | Select-Object -First 1

  # Dossier de bundle : CARGO_TARGET_DIR s'il est défini, sinon le target-dir
  # de apps/desktop/src-tauri/.cargo/config.toml.
  $targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $SrcTauri "target" }
  if (-not [System.IO.Path]::IsPathRooted($targetDir)) { $targetDir = Join-Path $Root $targetDir }
  $bundleDir = Join-Path $targetDir "release\bundle"
  # Un installeur d'un build précédent ne doit pas être pris pour celui-ci.
  foreach ($sub in "nsis", "msi") {
    Remove-Item (Join-Path $bundleDir $sub) -Recurse -Force -ErrorAction SilentlyContinue
  }

  # Valeur factice exigée par des intégrations cloud héritées (chantier 04d).
  $env:VITE_API_URL = "http://127.0.0.1:9"
  Invoke-Checked pnpm @("-F", "ui", "build")
  Invoke-Checked pnpm @("-F", "desktop", "tauri", "build", "--ci", "--bundles", "nsis,msi",
    "--features", "devtools",
    "--config", "./src-tauri/tauri.conf.syntheo.json",
    "--config", "./src-tauri/tauri.windows-vcrt.conf.json")
}
finally {
  Copy-Item $confBackup $Conf -Force
  Remove-Item $confBackup -Force -ErrorAction SilentlyContinue
}

# Toute DLL du runtime Visual C++ importée par syntheo.exe doit être embarquée.
$exe = Join-Path $targetDir "release\syntheo.exe"
if (-not (Test-Path $exe)) { throw "syntheo.exe introuvable ($exe)" }
if ($dumpbin) {
  $imports = & $dumpbin.FullName /nologo /dependents $exe |
    ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\.dll$' }
  $embedded = Get-ChildItem $vcrt -Filter *.dll | ForEach-Object { $_.Name.ToLower() }
  $missingDll = $imports | Where-Object { $_ -match '^(msvcp|vcruntime|concrt|vccorlib|vcomp)' -and $_.ToLower() -notin $embedded }
  if ($missingDll) { throw "DLL du runtime Visual C++ importées mais non embarquées : $($missingDll -join ', ')" }
}
else {
  Write-Warning "dumpbin introuvable : vérification du runtime Visual C++ ignorée."
}

# --- Sortie --------------------------------------------------------------------

$installers = @(
  Get-ChildItem (Join-Path $bundleDir "nsis\*.exe")
  Get-ChildItem (Join-Path $bundleDir "msi\*.msi")
)
if ($installers.Count -eq 0) { throw "Aucun installeur trouvé dans $bundleDir" }

New-Item -ItemType Directory -Force -Path $Out | Out-Null
Get-ChildItem $Out -File | Remove-Item -Force
$installers | Copy-Item -Destination $Out
$copied = @(Get-ChildItem $Out -File)
$copied | ForEach-Object {
  $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
  "$hash  $($_.Name)"
} | Set-Content -Encoding ascii (Join-Path $Out "SHA256SUMS-windows")
"build local`ncommit $(git rev-parse HEAD)`nbranche $(git rev-parse --abbrev-ref HEAD)`ndate $(Get-Date -Format o)" |
  Set-Content -Encoding utf8 (Join-Path $Out "SOURCE")

Write-Host ""
Write-Host "Alpha devtools Windows $Version (non signée) : $Out"
Get-Content (Join-Path $Out "SHA256SUMS-windows")
