param(
  [string]$ShortcutPath = '',
  [int]$Port = 19825
)

$ErrorActionPreference = 'Stop'

function Resolve-ChromeExecutable {
  param([string]$ShortcutPath)

  if ($ShortcutPath -and (Test-Path $ShortcutPath)) {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    if ($shortcut.TargetPath -and (Test-Path $shortcut.TargetPath)) {
      return $shortcut.TargetPath
    }
  }

  $candidates = @(
    'C:\Program Files\Google\Chrome\Application\chrome.exe',
    'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  )

  foreach ($candidate in $candidates) {
    $resolved = [Environment]::ExpandEnvironmentVariables($candidate)
    if (Test-Path $resolved) {
      return $resolved
    }
  }

  throw 'No supported Chrome/Edge executable was found.'
}

$chromePath = Resolve-ChromeExecutable -ShortcutPath $ShortcutPath
$profileRoot = Join-Path $env:USERPROFILE '.paper-writer-chrome-devtools'
$userDataDir = Join-Path $profileRoot 'user-data'

New-Item -ItemType Directory -Force -Path $userDataDir | Out-Null

$args = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$userDataDir",
  '--no-first-run',
  '--no-default-browser-check',
  'https://arxiv.org/',
  'https://www.google.com/',
  'https://stackoverflow.com/'
)

Start-Process -FilePath $chromePath -ArgumentList $args | Out-Null

Write-Output "Chrome executable: $chromePath"
Write-Output "Remote debugging port: $Port"
Write-Output "Browser URL: http://127.0.0.1:$Port"
Write-Output "User data dir: $userDataDir"
