# RUN THIS IN: Windows PowerShell, on the laptop, with the Pi's SD card in the card reader.
#
# Radio Tower - get an SD card ready to go anywhere.
#
#   cd "C:\Users\barri\Documents\Ortis\Radio Tower\pi\anywhere"
#   powershell -ExecutionPolicy Bypass -File .\prepare-card.ps1
#
# What it does, in order, and nothing else:
#   1. finds the card's boot partition (the drive labelled "bootfs")
#   2. copies this project onto it as bootfs:\radiotower\  (skips node_modules,
#      the music library, and the private collections\_review folders)
#   3. asks for the Wi-Fi networks you already know about -> radiotower-wifi.txt
#   4. asks for your domain and Cloudflare tunnel token    -> radiotower-online.txt
#
# Every question can be skipped with Enter. Nothing on the card outside
# bootfs:\radiotower\ and those two .txt files is touched. Existing .txt files
# are kept unless you say otherwise.
#
# Non-interactive:
#   .\prepare-card.ps1 -Domain radio.example.com -TunnelToken eyJ... -WifiName "Home" -WifiPassword "pw" -Yes

[CmdletBinding()]
param(
  [string]$Drive,
  [string]$Domain,
  [string]$TunnelToken,
  [string]$WifiName,
  [string]$WifiPassword,
  [string]$SetupPassword = "radiotower",
  [switch]$IncludeMusic,
  [switch]$SkipApp,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Utf8 = New-Object System.Text.UTF8Encoding $false   # no BOM: bash reads these files

function Say($msg, $color = "Gray") { Write-Host "  $msg" -ForegroundColor $color }
function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Ask($prompt, $default = "") {
  if ($Yes) { return $default }
  $suffix = if ($default) { " [$default]" } else { "" }
  $a = Read-Host "  $prompt$suffix"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default } else { return $a.Trim() }
}
# LF line endings on purpose: a stray CR becomes part of a Wi-Fi password.
function Write-CardText($path, $lines) { [System.IO.File]::WriteAllText($path, (($lines -join "`n") + "`n"), $Utf8) }

Write-Host "`n  Radio Tower - prepare the SD card" -ForegroundColor White
Say "project: $Repo" "DarkGray"

# ------------------------------------------------------------ 1. the card --
Step "Finding the SD card"
if (-not $Drive) {
  $vol = Get-Volume | Where-Object { $_.FileSystemLabel -eq "bootfs" -and $_.DriveLetter } | Select-Object -First 1
  if (-not $vol) {
    Say "No drive labelled 'bootfs' found. Put the SD card in, wait for Windows to show it, run me again." "Red"
    Say "(If Windows offers to FORMAT the other partition, click Cancel - that one is Linux and it is fine.)" "Red"
    exit 1
  }
  $Drive = "$($vol.DriveLetter):"
}
$Drive = $Drive.TrimEnd("\")
if (-not (Test-Path "$Drive\config.txt")) {
  Say "$Drive has no config.txt - that does not look like a Raspberry Pi boot partition. Stopping." "Red"
  exit 1
}
$free = (Get-PSDrive $Drive.TrimEnd(":")).Free
Say ("boot partition is $Drive  ({0:N0} MB free)" -f ($free / 1MB)) "Green"

# ------------------------------------------------------------ 2. the app ---
if (-not $SkipApp) {
  Step "Copying the station to $Drive\radiotower"
  $xd = @("node_modules", ".cache", ".git", "archive", "usb", "_to_delete",
          (Join-Path $Repo "collections\_review"), (Join-Path $Repo "collections\_incoming"))
  if (-not $IncludeMusic) { $xd += (Join-Path $Repo "music") }
  $rc = @($Repo, "$Drive\radiotower", "/MIR", "/NFL", "/NDL", "/NJH", "/NP", "/R:1", "/W:1", "/XD") + $xd + @("/XF", "*.log", "*.tar", "*.tgz")
  & robocopy @rc | Out-Null
  if ($LASTEXITCODE -ge 8) { Say "robocopy failed (code $LASTEXITCODE). Is the card full or read-only?" "Red"; exit 1 }
  $n = (Get-ChildItem "$Drive\radiotower" -Recurse -File).Count
  Say "copied $n files" "Green"
  if (-not $IncludeMusic) { Say "music not copied - the USB stick carries it (add -IncludeMusic to put it on the card; 512MB limit)" "DarkGray" }
}

# ------------------------------------------------------------ 3. Wi-Fi -----
Step "Wi-Fi networks the tower should know"
$wifiPath = "$Drive\radiotower-wifi.txt"
$keepWifi = $false
if (Test-Path $wifiPath) {
  $keepWifi = (Ask "radiotower-wifi.txt already exists. Keep it? (Y/n)" "Y") -notmatch "^[nN]"
}
if (-not $keepWifi) {
  $nets = @()
  if ($WifiName) { $nets += "$WifiName | $WifiPassword" }
  while (-not $Yes) {
    $name = Ask "Network name (Enter when done)"
    if (-not $name) { break }
    $pw = Ask "Password for '$name' (Enter for an open network)"
    $nets += "$name | $pw"
  }
  $lines = @(
    "# Radio Tower - Wi-Fi networks, best first. Written by prepare-card.ps1.",
    "# One per line:  network name | password    (full notes: pi/wifi/radiotower-wifi.txt.example)",
    "# No need to list every place you go: if none of these is in range, the tower",
    "# makes a 'Radio Tower Setup' Wi-Fi and you pick the router from your phone.",
    "") + $nets
  Write-CardText $wifiPath $lines
  Say "radiotower-wifi.txt: $($nets.Count) network(s)" "Green"
}

# ------------------------------------------------------------ 4. online ----
Step "Your domain"
$onlinePath = "$Drive\radiotower-online.txt"
$keepOnline = $false
if (Test-Path $onlinePath) {
  $keepOnline = (Ask "radiotower-online.txt already exists. Keep it? (Y/n)" "Y") -notmatch "^[nN]"
}
if (-not $keepOnline) {
  if (-not $Domain) { $Domain = Ask "Domain people will type (e.g. radio.example.com) - Enter to skip" }
  if (-not $TunnelToken) { $TunnelToken = Ask "Cloudflare tunnel token (starts with eyJ) - Enter to skip, see DOMAIN.md" }
  if ($TunnelToken -and $TunnelToken -notmatch "eyJ") { Say "that does not look like a tunnel token (no 'eyJ'); saving it anyway, the tower will say if it is wrong" "Red" }
  if ($SetupPassword.Length -lt 8) { $SetupPassword = "radiotower" }
  Write-CardText $onlinePath @(
    "# Radio Tower - going online. Written by prepare-card.ps1. Notes: pi/anywhere/radiotower-online.txt.example",
    "DOMAIN = $Domain",
    "TUNNEL_TOKEN = $TunnelToken",
    "SETUP_HOTSPOT = Radio Tower Setup | $SetupPassword",
    "NOTIFY =")
  if ($TunnelToken) { Say "radiotower-online.txt: public on $Domain" "Green" }
  else { Say "radiotower-online.txt: no token yet - local network only until you add one" "Yellow" }
}

# ------------------------------------------------------------ done ---------
Step "Ready"
Say "Eject the card safely, put it in the Pi, power on." "White"
Say "First time on this card?  One SSH command installs everything (pi/README.md):" "Gray"
Say "    sudo bash /boot/firmware/radiotower/pi/install.sh" "Cyan"
Say "Already installed?  Nothing else to do - it reads the .txt files on every boot." "Gray"
Say "No known Wi-Fi where you are?  Join 'Radio Tower Setup' from your phone (password: $SetupPassword)." "Gray"
Write-Host ""
