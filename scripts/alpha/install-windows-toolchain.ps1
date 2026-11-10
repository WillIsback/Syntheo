# Installe, pour toute la machine, la toolchain de scripts/build-alpha.ps1 dans
# une VM Windows 11 : Visual Studio Build Tools 2022 (MSVC v143, SDK Windows,
# CMake C++), Git, Node.js (même version que la CI) et pnpm (packageManager),
# LLVM (libclang), Strawberry Perl, CMake et Rust (rust-toolchain.toml).
#
# À lancer une fois, dans un PowerShell ADMINISTRATEUR (session interactive ou
# SSH d'un compte administrateur), depuis la racine du dépôt :
#
#   powershell -ExecutionPolicy Bypass -File .\scripts\alpha\install-windows-toolchain.ps1
#
# Idempotent : un composant déjà présent est sauté. Sans winget : les
# installeurs officiels sont téléchargés (curl.exe) à des versions figées, leur
# somme SHA-256 est vérifiée, puis ils sont lancés en silencieux, ce qui
# fonctionne aussi dans une session SSH. Pour monter de version, changer la
# table $Pinned (URL et somme relevées aux sources officielles). Rust est installé dans
# C:\Rust (RUSTUP_HOME, binaires dans C:\Rust\cargo\bin) pour tous les
# utilisateurs ; build-alpha.ps1 range le registre cargo dans le profil de
# l'utilisateur qui construit. WebView2 est présent par défaut sous Windows 11.

[CmdletBinding()]
param(
  [string]$NodeVersion = "22.23.4", # doit correspondre à $Pinned.Node
  [string]$PnpmVersion = "",
  [string]$RustToolchain = "",
  [string]$RustComponents = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$ProgressPreference = "SilentlyContinue"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Ce script installe pour toute la machine : le lancer dans un PowerShell administrateur."
}

$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not $PnpmVersion) {
  $PnpmVersion = ((Get-Content -Raw (Join-Path $Root "package.json") | ConvertFrom-Json).packageManager) -replace '^pnpm@', ''
}
$toolchainToml = Get-Content -Raw (Join-Path $Root "rust-toolchain.toml")
if (-not $RustToolchain) {
  $RustToolchain = [regex]::Match($toolchainToml, 'channel\s*=\s*"([^"]+)"').Groups[1].Value
}
if (-not $RustComponents) {
  $RustComponents = ([regex]::Match($toolchainToml, 'components\s*=\s*\[([^\]]*)\]').Groups[1].Value -replace '["\s]', '')
}

# Versions figées (relevées le 2026-11-10) : URL officielle et somme SHA-256.
# Node suit la CI (.github/actions/pnpm_install) ; les autres, la dernière
# version stable du jour.
$Pinned = @{
  VsBuildTools = @{ # bootstrapper Visual Studio 2022 (aka.ms/vs/17/release/vs_BuildTools.exe)
    Url    = "https://download.visualstudio.microsoft.com/download/pr/95995f57-8355-4ff5-8d90-a7e1669fb3b3/8aaf70d164808d313ee6226af5d1e3b2db43c60be551bfeb2b70ce139d792c37/vs_BuildTools.exe"
    Sha256 = "8aaf70d164808d313ee6226af5d1e3b2db43c60be551bfeb2b70ce139d792c37"
  }
  Git          = @{
    Url    = "https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.4/Git-2.56.0.4-64-bit.exe"
    Sha256 = "4961a4a8cc778d8b6e00a5819e5fe4d078b754555aff7aedc2d77a5d74c2de80"
  }
  Node         = @{
    Url    = "https://nodejs.org/dist/v22.23.4/node-v22.23.4-x64.msi"
    Sha256 = "ca9303d3a12e8bec6de829fcb7812fc776930e0ce5c030328a24984ef928427e"
  }
  Llvm         = @{
    Url    = "https://github.com/llvm/llvm-project/releases/download/llvmorg-23.1.5/LLVM-23.1.5-win64.msi"
    Sha256 = "288ab326377157a9e02e6fb9724914cc2b55963882d493a405f31dc66e837c12"
  }
  Perl         = @{
    Url    = "https://github.com/StrawberryPerl/Perl-Dist-Strawberry/releases/download/SP_54231_64bit/strawberry-perl-5.42.3.1-64bit.msi"
    Sha256 = "b0adbd4f1b3fc0a91b96cdff647cabcb6d3dd4bf05d9ee6f4f4fb76913ac57cd"
  }
  CMake        = @{
    Url    = "https://github.com/Kitware/CMake/releases/download/v4.4.5/cmake-4.4.5-windows-x86_64.msi"
    Sha256 = "c18b52b4017c4e5ffcd7d516ea39c4e0ed37f58920b90a5c98a46280b1857145"
  }
  RustupInit   = @{ # rustup 1.29.3
    Url    = "https://static.rust-lang.org/rustup/archive/1.29.3/x86_64-pc-windows-msvc/rustup-init.exe"
    Sha256 = "38027d51d69a5d05493627a0634dbea52d6cd793c8f072d2373d3f4163eec7db"
  }
}

$Downloads = Join-Path $env:TEMP "syntheo-toolchain"
New-Item -ItemType Directory -Force -Path $Downloads | Out-Null
$started = Get-Date

function Step([string]$Message) { Write-Host "== $Message" -ForegroundColor Cyan }

# Télécharge un installeur de $Pinned et vérifie sa somme SHA-256 avant usage.
function Get-Pinned([string]$Key) {
  $entry = $Pinned[$Key]
  $name = Split-Path -Leaf ([uri]$entry.Url).AbsolutePath
  $path = Join-Path $Downloads $name
  if (-not (Test-Path $path)) {
    & curl.exe -fsSL --retry 3 -o $path $entry.Url
    if ($LASTEXITCODE -ne 0) { throw "Téléchargement en échec : $($entry.Url)" }
  }
  $actual = (Get-FileHash -Algorithm SHA256 $path).Hash.ToLower()
  if ($actual -ne $entry.Sha256) {
    Remove-Item $path -Force
    throw "Somme SHA-256 incorrecte pour $name : $actual au lieu de $($entry.Sha256)."
  }
  $path
}

function Invoke-Installer([string]$Exe, [string[]]$Arguments, [int[]]$OkCodes = @(0, 3010)) {
  $process = Start-Process -FilePath $Exe -ArgumentList $Arguments -Wait -PassThru -NoNewWindow
  if ($OkCodes -notcontains $process.ExitCode) {
    throw "$Exe a échoué (code $($process.ExitCode))."
  }
}

# Ajoute $Dir au Path (machine et session). Avec -Before, le place juste avant
# cette entrée (déplacé s'il est déjà plus loin) : c'est le premier trouvé qui gagne.
function Add-PathEntry([string]$PathValue, [string]$Dir, [string]$Before) {
  $entries = @($PathValue -split ';' | Where-Object { $_ })
  if (-not $Before -or $entries -notcontains $Before) {
    if ($entries -notcontains $Dir) { $entries += $Dir }
    return $entries -join ';'
  }
  $result = @()
  foreach ($entry in $entries) {
    if ($entry -eq $Dir) { continue }
    if ($entry -eq $Before) { $result += $Dir }
    $result += $entry
  }
  return $result -join ';'
}

function Add-MachinePath([string]$Dir, [string]$Before = "") {
  $current = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $updated = Add-PathEntry $current $Dir $Before
  if ($updated -ne $current) {
    [Environment]::SetEnvironmentVariable("Path", $updated, "Machine")
  }
  $env:Path = Add-PathEntry $env:Path $Dir $Before
}

# --- Visual Studio Build Tools 2022 -------------------------------------------

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$vs = if (Test-Path $vswhere) {
  & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
}
if ($vs) {
  Step "Build Tools 2022 déjà installés ($vs)"
}
else {
  Step "Visual Studio Build Tools 2022 (MSVC v143, SDK Windows 11, CMake C++) : 15 à 25 min"
  $bootstrapper = Get-Pinned "VsBuildTools"
  Invoke-Installer $bootstrapper @(
    "--quiet", "--wait", "--norestart", "--nocache",
    "--add", "Microsoft.VisualStudio.Workload.VCTools",
    "--add", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "--add", "Microsoft.VisualStudio.Component.Windows11SDK.22621",
    "--add", "Microsoft.VisualStudio.Component.VC.CMake.Project",
    "--includeRecommended"
  )
}

# --- Git ----------------------------------------------------------------------

if (Get-Command git -ErrorAction SilentlyContinue) {
  Step "Git déjà installé"
}
else {
  Step "Git for Windows"
  $installer = Get-Pinned "Git"
  Invoke-Installer $installer @("/VERYSILENT", "/NORESTART", "/NOCANCEL", "/SP-", "/SUPPRESSMSGBOXES")
  Add-MachinePath "C:\Program Files\Git\cmd"
}

# --- Node.js et pnpm -----------------------------------------------------------

$nodeExe = "C:\Program Files\nodejs\node.exe"
$installedNode = if (Test-Path $nodeExe) { (& $nodeExe --version).TrimStart('v') }
if ($installedNode -eq $NodeVersion) {
  Step "Node.js $NodeVersion déjà installé"
}
else {
  Step "Node.js $NodeVersion (version de la CI)"
  $msi = Get-Pinned "Node"
  Invoke-Installer "msiexec.exe" @("/i", "`"$msi`"", "/qn", "/norestart")
  Add-MachinePath "C:\Program Files\nodejs"
}
$npm = "C:\Program Files\nodejs\npm.cmd"
$pnpmCmd = "C:\Program Files\nodejs\pnpm.cmd"
$installedPnpm = if (Test-Path $pnpmCmd) { (& $pnpmCmd --version | Out-String).Trim() }
if ($installedPnpm -eq $PnpmVersion) {
  Step "pnpm $PnpmVersion déjà installé"
}
else {
  Step "pnpm $PnpmVersion (packageManager), global machine"
  & $npm install -g --prefix "C:\Program Files\nodejs" "pnpm@$PnpmVersion" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "npm install -g pnpm@$PnpmVersion a échoué." }
}

# --- LLVM (libclang) -----------------------------------------------------------

$llvm = "C:\Program Files\LLVM"
if (Test-Path (Join-Path $llvm "bin\libclang.dll")) {
  Step "LLVM déjà installé"
}
else {
  Step "LLVM (libclang pour bindgen)"
  $msi = Get-Pinned "Llvm"
  Invoke-Installer "msiexec.exe" @("/i", "`"$msi`"", "/qn", "/norestart")
}
Add-MachinePath (Join-Path $llvm "bin")
[Environment]::SetEnvironmentVariable("LIBCLANG_PATH", (Join-Path $llvm "bin"), "Machine")

# --- Strawberry Perl -----------------------------------------------------------

if (Test-Path "C:\Strawberry\perl\bin\perl.exe") {
  Step "Strawberry Perl déjà installé"
}
else {
  Step "Strawberry Perl (OpenSSL compilé depuis les sources)"
  $msi = Get-Pinned "Perl"
  Invoke-Installer "msiexec.exe" @("/i", "`"$msi`"", "/qn", "/norestart")
}
Add-MachinePath "C:\Strawberry\perl\bin"
Add-MachinePath "C:\Strawberry\c\bin"

# --- CMake ---------------------------------------------------------------------

if (Test-Path "C:\Program Files\CMake\bin\cmake.exe") {
  Step "CMake déjà installé"
}
else {
  Step "CMake"
  $msi = Get-Pinned "CMake"
  Invoke-Installer "msiexec.exe" @("/i", "`"$msi`"", "/qn", "/norestart", "ADD_CMAKE_TO_PATH=System")
}
# Avant Strawberry\c\bin, qui embarque un CMake 3.29 : sinon c'est lui qui gagne.
Add-MachinePath "C:\Program Files\CMake\bin" -Before "C:\Strawberry\c\bin"

# --- Rust ----------------------------------------------------------------------

$rustHome = "C:\Rust"
$env:RUSTUP_HOME = Join-Path $rustHome "rustup"
$env:CARGO_HOME = Join-Path $rustHome "cargo"
[Environment]::SetEnvironmentVariable("RUSTUP_HOME", $env:RUSTUP_HOME, "Machine")
$rustup = Join-Path $env:CARGO_HOME "bin\rustup.exe"
if (-not (Test-Path $rustup)) {
  Step "Rust $RustToolchain ($RustComponents) dans $rustHome"
  $init = Get-Pinned "RustupInit"
  Invoke-Installer $init @("-y", "--no-modify-path", "--profile", "minimal", "--default-toolchain", $RustToolchain)
}
else {
  Step "rustup déjà installé"
}
# Tous les composants de rust-toolchain.toml dès maintenant : sinon rustup voudrait
# les ajouter au premier build, sans droit d'écriture dans C:\Rust.
& $rustup toolchain install $RustToolchain --profile minimal -c $RustComponents | Out-Null
if ($LASTEXITCODE -ne 0) { throw "rustup toolchain install $RustToolchain a échoué." }
& $rustup default $RustToolchain | Out-Null
Add-MachinePath (Join-Path $env:CARGO_HOME "bin")
# Lecture pour tous ; le registre cargo de chaque utilisateur reste dans son profil.
& icacls.exe $rustHome /grant "*S-1-5-32-545:(OI)(CI)RX" /T /Q | Out-Null

# --- Bilan ---------------------------------------------------------------------

Write-Host ""
Write-Host "Toolchain installée en $([int]((Get-Date) - $started).TotalMinutes) min :" -ForegroundColor Green
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationVersion
Write-Host "  Build Tools   $vs"
Write-Host "  git           $((& 'C:\Program Files\Git\cmd\git.exe' --version) -replace 'git version ', '')"
Write-Host "  node / pnpm   $(& $nodeExe --version) / $(& $pnpmCmd --version)"
Write-Host "  clang         $((& (Join-Path $llvm 'bin\clang.exe') --version | Select-Object -First 1))"
Write-Host "  perl          $((& 'C:\Strawberry\perl\bin\perl.exe' -e 'print $^V'))"
Write-Host "  cmake         $((& 'C:\Program Files\CMake\bin\cmake.exe' --version | Select-Object -First 1))"
Write-Host "  rustc         $((& (Join-Path $env:CARGO_HOME 'bin\rustc.exe') --version))"
Write-Host "Ouvrir une nouvelle session (ou SSH) pour que PATH, RUSTUP_HOME et LIBCLANG_PATH soient pris en compte."
Remove-Item $Downloads -Recurse -Force -ErrorAction SilentlyContinue
