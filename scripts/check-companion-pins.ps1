# Contrôle bloquant du job de signature Windows (issue 683) : l'empreinte
# stable à la signature de chaque fichier du programme compagnon, une fois
# signé, doit égaler celle que syntheo.exe a épinglée à la compilation
# (SYNTHEO_SPEECH_FILES, « nom:empreinte:taille;… »). Sinon l'application
# signée refuserait son propre compagnon (« companion_altered »).
#
# Get-ImageHash reproduit crates/image-hash : pour une image PE, SHA-256 du
# contenu sans la somme de contrôle ni l'entrée « table des certificats »,
# tronqué au bloc de certificats s'il commence à la fin réelle de l'image
# (alignée sur 8) et finit le fichier, complété par au plus 7 zéros jusqu'à
# un multiple de 8 ; sinon SHA-256 du fichier entier. Comparer à l'empreinte
# calculée par la crate Rust contrôle aussi les deux implémentations.
#
# Usage : pwsh scripts/check-companion-pins.ps1 -Exe <syntheo.exe>
#           -Companion <syntheo-speech-….exe> -Vcrt <dossier des DLL>
#         pwsh scripts/check-companion-pins.ps1 -Fixtures <dossier>
#           (images de référence de crates/image-hash/tests/fixtures et leur
#           expected.txt : la même empreinte que la crate est exigée ; lancé
#           par le job Windows de ci-code-quality)
[CmdletBinding(DefaultParameterSetName = "Pins")]
param(
  [Parameter(Mandatory, ParameterSetName = "Pins")][string]$Exe,
  [Parameter(Mandatory, ParameterSetName = "Pins")][string]$Companion,
  [Parameter(Mandatory, ParameterSetName = "Pins")][string]$Vcrt,
  [Parameter(Mandatory, ParameterSetName = "Fixtures")][string]$Fixtures
)
$ErrorActionPreference = "Stop"

function Get-U16([byte[]]$b, [long]$at) {
  if ($at -lt 0 -or $at + 2 -gt $b.Length) { return $null }
  return [long][BitConverter]::ToUInt16($b, [int]$at)
}

function Get-U32([byte[]]$b, [long]$at) {
  if ($at -lt 0 -or $at + 4 -gt $b.Length) { return $null }
  return [long][BitConverter]::ToUInt32($b, [int]$at)
}

# Plages ignorées et fin du contenu signé, ou $null (pas une image PE lisible,
# table des certificats incohérente).
function Get-PeLayout([byte[]]$b) {
  if ($b.Length -lt 2 -or $b[0] -ne 0x4d -or $b[1] -ne 0x5a) { return $null }
  $pe = Get-U32 $b 0x3c
  if ($null -eq $pe -or $pe + 4 -gt $b.Length) { return $null }
  if ($b[$pe] -ne 0x50 -or $b[$pe + 1] -ne 0x45 -or $b[$pe + 2] -ne 0 -or $b[$pe + 3] -ne 0) { return $null }
  $sections = Get-U16 $b ($pe + 6)
  $optionalSize = Get-U16 $b ($pe + 20)
  if ($null -eq $sections -or $null -eq $optionalSize) { return $null }
  $optional = $pe + 24
  $magic = Get-U16 $b $optional
  if ($magic -eq 0x10b) { $directories = $optional + 96; $rvaCount = Get-U32 $b ($optional + 92) }
  elseif ($magic -eq 0x20b) { $directories = $optional + 112; $rvaCount = Get-U32 $b ($optional + 108) }
  else { return $null }
  if ($null -eq $rvaCount) { return $null }
  $checksum = $optional + 64
  $certificates = $directories + 32
  if ($rvaCount -le 4 -or $certificates + 8 -gt $optional + $optionalSize) { return $null }
  $imageEnd = Get-U32 $b ($optional + 60)
  if ($null -eq $imageEnd) { return $null }
  $table = $optional + $optionalSize
  for ($i = 0; $i -lt $sections; $i++) {
    $section = $table + $i * 40
    $rawSize = Get-U32 $b ($section + 16)
    $rawPointer = Get-U32 $b ($section + 20)
    if ($null -eq $rawSize -or $null -eq $rawPointer) { return $null }
    if ($rawSize -gt 0) { $imageEnd = [Math]::Max($imageEnd, $rawPointer + $rawSize) }
  }
  $offset = Get-U32 $b $certificates
  $size = Get-U32 $b ($certificates + 4)
  if ($null -eq $offset -or $null -eq $size) { return $null }
  $aligned = [long]([Math]::Ceiling($imageEnd / 8.0) * 8)
  if ($size -eq 0 -and $offset -eq 0) { $end = [long]$b.Length }
  elseif ($offset -ge $imageEnd -and $offset -eq $aligned -and $offset + $size -eq $b.Length) { $end = $offset }
  else { return $null }
  # Le contenu haché doit couvrir les champs ignorés (image forgée dont le
  # bloc de certificats commencerait dans l'en-tête), comme la crate.
  if ($end -lt $certificates + 8) { return $null }
  return @{ Checksum = $checksum; Certificates = $certificates; End = $end }
}

function Get-ImageHash([string]$Path) {
  $b = [System.IO.File]::ReadAllBytes($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $layout = Get-PeLayout $b
  if ($null -eq $layout) {
    $digest = $sha.ComputeHash($b)
  } else {
    $c = [int]$layout.Checksum; $t = [int]$layout.Certificates; $e = [int]$layout.End
    [void]$sha.TransformBlock($b, 0, $c, $null, 0)
    [void]$sha.TransformBlock($b, $c + 4, $t - ($c + 4), $null, 0)
    [void]$sha.TransformBlock($b, $t + 8, $e - ($t + 8), $null, 0)
    $padding = [int](([Math]::Ceiling($e / 8.0) * 8) - $e)
    [void]$sha.TransformFinalBlock((New-Object byte[] $padding), 0, $padding)
    $digest = $sha.Hash
  }
  return -join ($digest | ForEach-Object { $_.ToString("x2") })
}

if ($PSCmdlet.ParameterSetName -eq "Fixtures") {
  $failed = $false
  $count = 0
  foreach ($line in Get-Content -LiteralPath (Join-Path $Fixtures "expected.txt")) {
    if (-not $line) { continue }
    $expected, $name = $line.Split(" ", 2)
    $actual = Get-ImageHash (Join-Path $Fixtures $name)
    $count++
    if ($actual -ne $expected) { $failed = $true; Write-Host "$name : attendue $expected ; script $actual -> DIFFÉRENTE" }
    else { Write-Host "$name : identique" }
  }
  if ($count -eq 0) { throw "aucune image de référence dans $Fixtures" }
  if ($failed) { throw "le script et crates/image-hash ne donnent pas la même empreinte" }
  return
}

# Spec épinglée dans syntheo.exe : la chaîne commence par le nom du binaire.
$text = [System.Text.Encoding]::GetEncoding(28591).GetString([System.IO.File]::ReadAllBytes($Exe))
$match = [regex]::Match($text, 'syntheo-speech\.exe:[0-9a-f]{64}:[0-9]+(;[A-Za-z0-9_.]+:[0-9a-f]{64}:[0-9]+)*')
if (-not $match.Success) { throw "aucune empreinte du compagnon épinglée dans $Exe" }
$failed = $false
foreach ($entry in $match.Value.Split(';')) {
  $name, $pinned, $null = $entry.Split(':')
  $path = if ($name -eq "syntheo-speech.exe") { $Companion } else { Join-Path $Vcrt $name }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    Write-Host "$name : fichier absent ($path)"; $failed = $true; continue
  }
  $actual = Get-ImageHash $path
  $verdict = if ($actual -eq $pinned) { "identique" } else { $failed = $true; "DIFFÉRENTE" }
  Write-Host "$name : épinglée $pinned ; signée $actual -> $verdict"
}
if ($failed) { throw "empreinte du compagnon signé différente de celle épinglée dans syntheo.exe" }
