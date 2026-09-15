$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeInstall = 'C:\Program Files\nodejs'
if (Test-Path -LiteralPath "$nodeInstall\node.exe") { $env:PATH = "$nodeInstall;$env:PATH" }
Set-Location -LiteralPath $projectRoot
if (!(Test-Path -LiteralPath 'node_modules\concurrently')) {
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível instalar as dependências.' }
}
function Test-PreviewPort([int]$Port) {
  $connection = [System.Net.Sockets.TcpClient]::new()
  try { return $connection.ConnectAsync('127.0.0.1', $Port).Wait(1000) -and $connection.Connected } catch { return $false } finally { $connection.Dispose() }
}
if ((Test-PreviewPort 5173) -and (Test-PreviewPort 3000)) {
  Write-Host 'O preview ja esta ligado: http://localhost:5173'
  exit 0
}
if (!(Test-Path -LiteralPath '.env')) { throw 'Configure o arquivo .env seguindo o README antes de iniciar.' }
$previewEnv = Get-Content -LiteralPath '.env'
$previewDatabasePort = 55432
$previewPortSetting = $previewEnv | Where-Object { $_ -match '^LOCAL_PG_PORT=\d+$' } | Select-Object -Last 1
if ($previewPortSetting) { $previewDatabasePort = [int]($previewPortSetting.Split('=')[1]) }
if ($previewDatabasePort -lt 1024 -or $previewDatabasePort -gt 65535) { throw 'LOCAL_PG_PORT inválida.' }
if (($previewEnv | Where-Object { $_ -match '^DATABASE_URL=.*:55432/' }) -and !(Test-PreviewPort $previewDatabasePort)) {
  New-Item -ItemType Directory -Force -Path '.local' | Out-Null
  Start-Process -FilePath "$nodeInstall\node.exe" -ArgumentList 'scripts/local-postgres.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput '.local/postgres-preview.log' -RedirectStandardError '.local/postgres-preview-error.log'
  Write-Host 'Preparando PostgreSQL local...'
  for ($attempt = 0; $attempt -lt 60 -and !(Test-PreviewPort $previewDatabasePort); $attempt++) { Start-Sleep -Milliseconds 500 }
  if (!(Test-PreviewPort $previewDatabasePort)) { throw 'O banco nao iniciou. Consulte .local/postgres-preview-error.log.' }
}
Write-Host 'Iniciando Licitaro. Interface: http://localhost:5173'
if (Test-PreviewPort 5173) { & npm.cmd run dev -w apps/api; exit $LASTEXITCODE }
if (Test-PreviewPort 3000) { & npm.cmd run dev -w apps/web; exit $LASTEXITCODE }
& npm.cmd run dev
