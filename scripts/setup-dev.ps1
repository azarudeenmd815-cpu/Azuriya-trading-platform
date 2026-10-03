$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Output '.env already exists; preserving local configuration.'
} else {
    $databasePassword = [Guid]::NewGuid().ToString('N')
    $demoPassword = [Guid]::NewGuid().ToString('N')
    $template = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
    $template = $template.Replace('replace-local-postgres-password', $databasePassword)
    $template = $template.Replace('replace-local-demo-password', $demoPassword)
    Set-Content -LiteralPath $envPath -Value $template -Encoding utf8
    Write-Output 'Created ignored .env with generated local development passwords.'
}
$webEnv = Join-Path $projectRoot 'apps/web-trader/.env.local'
if (-not (Test-Path -LiteralPath $webEnv)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $webEnv) -Force | Out-Null
    Set-Content -LiteralPath $webEnv -Value 'NEXT_PUBLIC_API_URL=http://localhost:8080' -Encoding utf8
}
Write-Output 'Run docker compose up -d --wait, then scripts/start-backend.ps1.'
Write-Output 'Find the local demo email and password in .env; never commit that file.'
