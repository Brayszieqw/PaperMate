$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$bbRoot = Join-Path $repoRoot 'third_party\bb-browser'
$cliPath = Join-Path $bbRoot 'dist\cli.js'
$extensionDist = Join-Path $bbRoot 'packages\extension\dist'
$daemonUrls = @('http://localhost:19824', 'http://127.0.0.1:19824')
$portFile = Join-Path $env:USERPROFILE '.bb-browser\browser\cdp-port'

$status = [ordered]@{
  cli_exists = (Test-Path $cliPath)
  extension_dist_exists = (Test-Path $extensionDist)
  adapters_repo_exists = (Test-Path (Join-Path $env:USERPROFILE '.bb-browser\bb-sites'))
  daemon_running = $false
  daemon_extension_connected = $false
  cdp_port_file_exists = (Test-Path $portFile)
  cdp_port = $null
}

if ($status.cdp_port_file_exists) {
  $status.cdp_port = (Get-Content -Raw $portFile).Trim()
}

try {
  foreach ($daemonUrl in $daemonUrls) {
    try {
      $daemon = Invoke-RestMethod -Uri "$daemonUrl/status" -TimeoutSec 2
      $status.daemon_running = ($daemon.running -eq $true)
      $status.daemon_extension_connected = ($daemon.extensionConnected -eq $true)
      if ($status.daemon_running) {
        break
      }
    } catch {
    }
  }
} catch {
}

$status | ConvertTo-Json -Depth 4
