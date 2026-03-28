$ErrorActionPreference = 'Stop'

function Get-ChromePath {
  $candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    $resolved = [Environment]::ExpandEnvironmentVariables($candidate)
    if (Test-Path $resolved) {
      return $resolved
    }
  }

  throw 'No supported Chrome/Edge executable was found.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$bbRoot = Join-Path $repoRoot 'third_party\bb-browser'
$daemonPath = Join-Path $bbRoot 'dist\daemon.js'
$extensionDist = Join-Path $bbRoot 'packages\extension\dist'
$nodePath = (Get-Command node).Source
$chromePath = Get-ChromePath

$browserRoot = Join-Path $env:USERPROFILE '.bb-browser\browser'
$userDataDir = Join-Path $browserRoot 'user-data'
$portFile = Join-Path $browserRoot 'cdp-port'
$cdpPort = 19825
$daemonUrls = @('http://localhost:19824', 'http://127.0.0.1:19824')

New-Item -ItemType Directory -Force -Path $browserRoot | Out-Null
New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null

if (-not (Test-Path $daemonPath)) {
  throw "bb-browser daemon bundle not found: $daemonPath"
}

if (-not (Test-Path $extensionDist)) {
  throw "bb-browser extension dist not found: $extensionDist"
}

$daemonHealthy = $false
try {
  foreach ($daemonUrl in $daemonUrls) {
    try {
      $status = Invoke-RestMethod -Uri "$daemonUrl/status" -TimeoutSec 2
      if ($status.running -eq $true) {
        $daemonHealthy = $true
        break
      }
    } catch {
    }
  }
} catch {
}

if (-not $daemonHealthy) {
  Start-Process -FilePath $nodePath -ArgumentList @($daemonPath, '--host', '127.0.0.1') -WindowStyle Hidden | Out-Null
  Start-Sleep -Seconds 2
}

Set-Content -Path $portFile -Value $cdpPort -Encoding ascii

$chromeArgs = @(
  "--remote-debugging-port=$cdpPort",
  "--user-data-dir=$userDataDir",
  "--disable-extensions-except=$extensionDist",
  "--load-extension=$extensionDist",
  '--no-first-run',
  '--no-default-browser-check',
  'chrome://extensions/',
  'https://arxiv.org/',
  'https://www.google.com/'
)

Start-Process -FilePath $chromePath -ArgumentList $chromeArgs | Out-Null

Write-Output "bb-browser daemon: http://localhost:19824"
Write-Output "CDP port: $cdpPort"
Write-Output "Browser: $chromePath"
Write-Output "Extension: $extensionDist"
Write-Output 'Chrome has been launched with the bb-browser extension and a dedicated profile.'
