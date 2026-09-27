# RUN THIS IN: Windows PowerShell on the laptop (not on the Pi, not in Claude).
#
# Puts the Radio Tower repository on GitHub — or, run again later with a newer
# bundle, brings the GitHub copy up to date. docs/GO-LIVE.md step 2 is the
# same thing by hand; this script lives inside the repository, so the first
# time, use the commands there.
#
#   powershell -ExecutionPolicy Bypass -File .\publish-to-github.ps1 `
#       -Bundle "$env:USERPROFILE\Downloads\radio-tower.bundle" `
#       -RepoUrl "https://github.com/YOUR-NAME/radio-tower.git"
#
# It never deletes anything. It clones the bundle into a new folder next to
# your Radio Tower folder (radio-tower-git), points it at GitHub and pushes.
# The first push opens a browser window to sign in to GitHub; that is Git
# Credential Manager, part of Git for Windows.
param(
  [Parameter(Mandatory = $true)][string]$Bundle,
  [Parameter(Mandatory = $true)][string]$RepoUrl,
  [string]$Into = (Join-Path $env:USERPROFILE 'Documents\Ortis\radio-tower-git')
)
# Native git writes progress to stderr; with 'Stop' Windows PowerShell 5.1 can
# treat that as a failure. So: 'Continue', and check git's own exit code.
$ErrorActionPreference = 'Continue'
function Git-Run { & git @args; if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)" } }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  $bundled = Join-Path $env:USERPROFILE 'Documents\Ortis\Git\cmd'
  if (Test-Path (Join-Path $bundled 'git.exe')) { $env:Path += ";$bundled" }
  else { throw 'Git is not installed. Get it from https://git-scm.com/download/win and run this again.' }
}
if (-not (Test-Path $Bundle)) { throw "No bundle at $Bundle" }
if ($RepoUrl -notmatch '^https://github\.com/[^/]+/[^/]+?(\.git)?$') { throw "That does not look like a GitHub repository URL: $RepoUrl" }

# `git bundle verify` needs to run inside a repository; list-heads does not,
# and fails just the same on a file that is not a bundle.
Git-Run bundle list-heads $Bundle

if (Test-Path (Join-Path $Into '.git')) {
  Write-Host "Updating $Into from the bundle"
  Git-Run -C $Into fetch $Bundle 'main:refs/remotes/bundle/main'
  Git-Run -C $Into merge --ff-only 'bundle/main'
} else {
  Write-Host "Cloning the bundle into $Into"
  Git-Run clone $Bundle $Into
}

$remotes = & git -C $Into remote
if ($remotes -contains 'origin') { Git-Run -C $Into remote set-url origin $RepoUrl }
else { Git-Run -C $Into remote add origin $RepoUrl }
Git-Run -C $Into branch -M main
Git-Run -C $Into push -u origin main

Write-Host ''
Write-Host 'Pushed. Now, on github.com, in the repository:'
Write-Host '  Settings -> Pages -> Build and deployment -> Source: GitHub Actions'
Write-Host '  Actions -> pages -> Run workflow'
Write-Host 'Then open https://<your-name>.github.io/<repo>/'
