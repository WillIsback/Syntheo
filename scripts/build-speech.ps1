# Construit le programme compagnon syntheo-speech (issue 683) et le pose là où
# `tauri build` l'attend : apps\desktop\src-tauri\binaries\syntheo-speech-<cible>.exe.
# Appelé par build-alpha.ps1 et par build-windows.yml, avant `tauri build` :
# le build.rs de l'application en épingle l'empreinte.
#
# Usage : powershell -File scripts/build-speech.ps1 [-Target x86_64-pc-windows-msvc] [-Dumpbin <dumpbin.exe>]
# Variables : SPEECH_TARGET_DIR (défaut apps\speech\target), ORT_CACHE_DIR
# (défaut <target>\ort-cache ; il ne doit contenir que l'archive épinglée).
#
# ONNX Runtime reste épinglé (apps/speech/supply-chain/ort.tsv) et contrôlé
# avant et après la compilation (règles de check_ort.py, en PowerShell). Avec -Dumpbin, les DLL
# importées sont listées : runtime Visual C++ (embarqué par l'application,
# vcrt\) ou DLL du système seulement ; une DLL ONNX Runtime importée arrête le
# build (elle ne serait pas livrée).
param(
  [string]$Target = "x86_64-pc-windows-msvc",
  [string]$Dumpbin = ""
)
$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Exe $($Arguments -join ' ') a échoué (code $LASTEXITCODE)." }
}

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$speech = Join-Path $root "apps\speech"
$targetDir = if ($env:SPEECH_TARGET_DIR) { $env:SPEECH_TARGET_DIR } else { Join-Path $speech "target" }
if (-not $env:ORT_CACHE_DIR) { $env:ORT_CACHE_DIR = Join-Path $targetDir "ort-cache" }

# Contrôles d'ONNX Runtime de supply-chain/check_ort.py, en PowerShell (pas de
# Python requis sur le poste de construction) : mêmes règles, même épinglage
# (ort.tsv).
function Get-OrtPin {
  $rows = @(Import-Csv -Delimiter "`t" (Join-Path $speech "supply-chain\ort.tsv") | Where-Object { $_.target -eq $Target })
  if ($rows.Count -ne 1) { throw "aucun épinglage ONNX Runtime pour $Target" }
  return $rows[0]
}
function Test-OrtBefore {
  $pin = Get-OrtPin
  $lock = Get-Content -Raw (Join-Path $speech "Cargo.lock")
  $blocks = @(($lock -split '\[\[package\]\]') | Where-Object { $_ -match 'name = "ort-sys"' })
  if ($blocks.Count -ne 1) { throw "ort-sys absent ou en plusieurs versions dans Cargo.lock" }
  if ($blocks[0] -notmatch 'version = "([^"]+)"') { throw "version d'ort-sys introuvable" }
  $version = $Matches[1]
  $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $HOME ".cargo" }
  $dist = @(Get-ChildItem (Join-Path $cargoHome "registry\src\*\ort-sys-$version\build\download\dist.tsv") -ErrorAction SilentlyContinue)
  if ($dist.Count -ne 1) { throw "dist.tsv d'ort-sys $version introuvable (cargo fetch --locked d'abord)" }
  $rows = @(Import-Csv -Delimiter "`t" $dist[0].FullName | Where-Object { $_.target -eq $Target -and $_.feature_set -eq $pin.feature_set })
  if ($rows.Count -ne 1 -or $rows[0].url -ne $pin.url -or $rows[0].sha256_hash -ne $pin.sha256) {
    throw "ort-sys $version n'épingle pas l'archive attendue pour $Target"
  }
  Write-Host "ort-sys $version : $($pin.url) $($pin.sha256)"
}
function Test-OrtAfter {
  $pin = Get-OrtPin
  $extracted = Join-Path $env:ORT_CACHE_DIR "dfbin\$Target"
  $found = @(if (Test-Path $extracted) { Get-ChildItem $extracted | ForEach-Object { $_.Name } | Sort-Object })
  if ($found.Count -ne 1 -or $found[0] -ne $pin.sha256) {
    throw "archives ONNX Runtime utilisées : $($found -join ', '), attendue : $($pin.sha256)"
  }
  Write-Host "ONNX Runtime utilisé : $($pin.sha256)"
}

$t0 = Get-Date
Push-Location $speech
try {
  Invoke-Checked cargo @("fetch", "--locked")
  Test-OrtBefore
  $env:CARGO_TARGET_DIR = $targetDir
  try {
    Invoke-Checked cargo @("build", "--release", "--locked", "--target", $Target)
  }
  finally {
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
  }
  Test-OrtAfter
}
finally {
  Pop-Location
}

$built = Join-Path $targetDir "$Target\release\syntheo-speech.exe"
if ($Dumpbin) {
  $imports = & $Dumpbin /nologo /dependents $built | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '\.dll$' }
  Write-Host "Imports de syntheo-speech.exe :"
  $imports | ForEach-Object { Write-Host "  $_" }
  $ort = $imports | Where-Object { $_ -match '^onnxruntime' }
  if ($ort) { throw "DLL ONNX Runtime importées par syntheo-speech.exe (non livrées) : $($ort -join ', ')" }
  $vc = @("vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll", "msvcp140_1.dll")
  $crt = $imports | Where-Object { $_ -match '^(msvcp|vcruntime|concrt|vccorlib|vcomp)' -and $_.ToLower() -notin $vc }
  if ($crt) { throw "DLL du runtime Visual C++ importées mais non embarquées : $($crt -join ', ')" }
}
$dest = Join-Path $root "apps\desktop\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$out = Join-Path $dest "syntheo-speech-$Target.exe"
Copy-Item $built $out -Force
Write-Host "-- syntheo-speech ($Target) : $out, $((Get-Item $out).Length) octets, $([int]((Get-Date) - $t0).TotalSeconds) s"

# Licences livrées dans l'installeur (apps\desktop\src-tauri\speech-licenses).
$licenses = Join-Path $root "apps\desktop\src-tauri\speech-licenses"
Remove-Item $licenses -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
Copy-Item (Join-Path $speech "supply-chain\notices\*") $licenses -Recurse -Force
Copy-Item (Join-Path $speech "commissioning\ATTRIBUTION.md") (Join-Path $licenses "commissioning-audio-ATTRIBUTION.md") -Force
$about = Get-Command cargo-about -ErrorAction SilentlyContinue
if ($about -and ((& cargo about --version) -match '0\.9\.3')) {
  Invoke-Checked cargo @("about", "generate", "--fail", "-m", (Join-Path $speech "Cargo.toml"),
    "-c", (Join-Path $speech "supply-chain\about.toml"), "-o", (Join-Path $licenses "THIRD-PARTY-RUST.html"),
    (Join-Path $speech "supply-chain\about.hbs"))
}
else {
  Write-Warning "cargo-about 0.9.3 absent, liste des crates remplacée par un renvoi (build local)."
  "Liste des crates Rust de syntheo-speech et de leurs licences : générée par la CI de release (cargo-about 0.9.3, apps/speech/supply-chain/about.toml)." |
    Set-Content -Encoding utf8 (Join-Path $licenses "THIRD-PARTY-RUST.txt")
}
