$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
Set-Location -LiteralPath $projectRoot
function Test-ConsolePort([int]$Port) {
  $connection = [System.Net.Sockets.TcpClient]::new()
  try { return $connection.ConnectAsync('127.0.0.1', $Port).Wait(1000) -and $connection.Connected } catch { return $false } finally { $connection.Dispose() }
}
if ((Test-ConsolePort 5174) -and (Test-ConsolePort 3001)) { Write-Host 'Console ligado: http://localhost:5174'; exit 0 }
if (Test-ConsolePort 5174) { & npm.cmd run dev:console -w apps/api; exit $LASTEXITCODE }
if (Test-ConsolePort 3001) { & npm.cmd run dev -w apps/console; exit $LASTEXITCODE }
& npm.cmd run dev:console
