<#
.SYNOPSIS
  Rebuild the Radio Tower USB stick so it carries exactly the curated library.

.DESCRIPTION
  The stick currently carries ~515 MP3s across E:\Music and
  E:\Behold the backkup\... . None of that is the station's library — the
  curated tree lives on this laptop at "Radio Tower\music" (30 files, 12.5h).

  That mismatch is not cosmetic. pi/install.sh scans /media/*/* and /mnt/* for
  audio *recursively* and repoints MUSIC_DIR at the first mount it finds any in.
  So while the stick carries 515 stray MP3s, plugging it into the Pi during an
  install silently makes those 515 files the station.

  This script makes the stick's only audio the curated library, which turns
  that auto-detection from a hazard into the correct behaviour.

  IT IS DRY-RUN BY DEFAULT AND IT NEVER DELETES ANYTHING WITHOUT -Purge.
  "Behold the backkup" is a backup that lives ON this stick — there may be no
  second copy. -Purge therefore refuses to run until -Archive has completed and
  its file count has been verified.

.PARAMETER Drive
  The stick's drive letter. Default E:. CHECK THIS FIRST — drive letters move.

.PARAMETER Source
  The curated library. Default: the music folder next to this script's repo.

.PARAMETER Archive
  Where to copy the stick's existing non-library content before removing it.
  Must be on a different physical drive with enough free space.

.PARAMETER Apply
  Actually copy. Without it, nothing is written.

.PARAMETER Purge
  Remove the stray audio from the stick. Requires a verified -Archive first.

.EXAMPLE
  .\rebuild-usb.ps1                                   # report only
  .\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply
  .\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply -Purge
#>

[CmdletBinding()]
param(
  [string]$Drive   = 'E:',
  [string]$Source  = (Join-Path (Split-Path $PSScriptRoot -Parent) 'music'),
  [string]$Archive = '',
  [switch]$Apply,
  [switch]$Purge
)

$ErrorActionPreference = 'Stop'
$AudioExt = @('.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.webm')
$Dest     = Join-Path $Drive 'RadioTowerMusic'

function Say  ($m) { Write-Host "  $m" }
function Good ($m) { Write-Host "  OK    $m"   -ForegroundColor Green }
function Warn ($m) { Write-Host "  WARN  $m"   -ForegroundColor Yellow }
function Bad  ($m) { Write-Host "  STOP  $m"   -ForegroundColor Red }

function Get-Audio ($path) {
  if (-not (Test-Path $path)) { return @() }
  Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $AudioExt -contains $_.Extension.ToLower() }
}

Write-Host ""
Write-Host "  Radio Tower — USB rebuild" -ForegroundColor Cyan
Write-Host "  $(if ($Apply) { 'APPLY' } else { 'DRY RUN — nothing will be written' })"
Write-Host ""

# --- 1. sanity ---------------------------------------------------------------

if (-not (Test-Path $Drive)) { Bad "$Drive is not there. Plug the stick in, or pass -Drive."; exit 1 }
if (-not (Test-Path $Source)) { Bad "The curated library is not at $Source. Pass -Source."; exit 1 }

$vol = Get-Volume -DriveLetter $Drive.TrimEnd(':') -ErrorAction SilentlyContinue
if ($vol) {
  Say "$Drive  '$($vol.FileSystemLabel)'  $([math]::Round($vol.Size/1GB,1))GB, $([math]::Round($vol.SizeRemaining/1GB,1))GB free"
  if ($vol.DriveType -ne 'Removable') {
    Bad "$Drive is $($vol.DriveType), not Removable. That is very likely the wrong drive. Refusing."
    exit 1
  }
}

# --- 2. inventory ------------------------------------------------------------

Say "Reading the stick — this takes a minute on USB 2…"
$onStick  = Get-Audio $Drive
$curated  = Get-Audio $Source
$destNow  = Get-Audio $Dest
$stray    = $onStick | Where-Object { $_.FullName -notlike "$Dest*" }

Write-Host ""
Good "curated library:  $($curated.Count) files, $([math]::Round(($curated | Measure-Object Length -Sum).Sum/1GB,2))GB   ($Source)"
Say  "on the stick:     $($onStick.Count) audio files total"
Say  "  already at $Dest : $($destNow.Count)"
Say  "  stray elsewhere on the stick: $($stray.Count)"
Write-Host ""

if ($stray.Count -gt 0) {
  Say "Where the stray audio lives:"
  $stray | Group-Object { ($_.FullName.Substring($Drive.Length).TrimStart('\') -split '\\')[0] } |
    Sort-Object Count -Descending |
    ForEach-Object { Say ("    {0,5}  {1,8:N1}MB  {2}" -f $_.Count, (($_.Group | Measure-Object Length -Sum).Sum/1MB), $_.Name) }
  Write-Host ""
  Warn "While these are on the stick, pi/install.sh can adopt them as the station's library."
}

# A manifest, always, apply or not. Losing track of what was on a stick is the
# expensive mistake here; a 200KB CSV is not.
$manifestDir = Join-Path $PSScriptRoot 'manifests'
if (-not (Test-Path $manifestDir)) { New-Item -ItemType Directory -Path $manifestDir | Out-Null }
$manifest = Join-Path $manifestDir ("usb-inventory-{0:yyyy-MM-dd-HHmm}.csv" -f (Get-Date))
$onStick | Select-Object FullName, Length, LastWriteTime | Export-Csv -LiteralPath $manifest -NoTypeInformation -Encoding UTF8
Good "manifest written: $manifest"
Write-Host ""

# --- 3. archive the stray content -------------------------------------------

$archiveVerified = $false
if ($Archive) {
  if ($Archive.Substring(0,2).ToUpper() -eq $Drive.ToUpper()) {
    Bad "-Archive is on the stick itself. That archives nothing. Point it at another drive."
    exit 1
  }
  Say "Archive target: $Archive"
  if ($Apply) {
    foreach ($top in ($stray | Group-Object { ($_.FullName.Substring($Drive.Length).TrimStart('\') -split '\\')[0] })) {
      $from = Join-Path $Drive $top.Name
      $to   = Join-Path $Archive $top.Name
      Say "  robocopy `"$from`" `"$to`" /E /R:1 /W:1"
      robocopy $from $to /E /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    }
    $archived = Get-Audio $Archive
    if ($archived.Count -ge $stray.Count) {
      Good "archived $($archived.Count) audio files (stick had $($stray.Count) stray)"
      $archiveVerified = $true
    } else {
      Bad "archive has $($archived.Count) audio files but the stick has $($stray.Count) stray. NOT verified — refusing to purge."
    }
  } else {
    Say "  (dry run — would robocopy each top-level folder of stray audio to $Archive)"
  }
  Write-Host ""
}

# --- 4. put the curated library on the stick --------------------------------

Say "Mirroring the curated library to $Dest"
if ($Apply) {
  robocopy $Source $Dest /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  $after = Get-Audio $Dest
  if ($after.Count -eq $curated.Count) { Good "$($after.Count) files on the stick at $Dest" }
  else { Warn "$($after.Count) files landed, expected $($curated.Count) — check the robocopy output" }
} else {
  Say "  (dry run — would robocopy /MIR $Source -> $Dest)"
}
Write-Host ""

# --- 5. purge ----------------------------------------------------------------

if ($Purge) {
  if (-not $archiveVerified) {
    Bad "Refusing to purge: nothing has been archived and verified this run."
    Say "     'Behold the backkup' lives ON this stick. There may be no other copy."
    Say "     Run again with -Archive <path on another drive> -Apply first."
    exit 1
  }
  Say "Removing stray audio from the stick…"
  foreach ($f in $stray) { Remove-Item -LiteralPath $f.FullName -Force }
  Good "removed $($stray.Count) stray audio files. Empty folders left in place — delete them by hand if you want."
} elseif ($stray.Count -gt 0) {
  Say "Not purging (no -Purge). The stray audio is still on the stick."
}

# --- 6. what to do next ------------------------------------------------------

Write-Host ""
Write-Host "  Next" -ForegroundColor Cyan
Say "1. Confirm the stick's ONLY audio is $Dest — re-run this script with no flags."
Say "2. On the Pi, check what it is actually playing before you trust anything:"
Say "     grep MUSIC_DIR /etc/radio-tower.env"
Say "     curl -s localhost:8080/api/health | grep musicDir"
Say "3. From the booth on this laptop: cd ..\dj ; node dj.mjs doctor"
Say "   It compares the station's folder against the curated one and says so plainly."
Write-Host ""
