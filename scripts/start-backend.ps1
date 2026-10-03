$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Missing .env. Run ./scripts/setup-dev.ps1 first.'
}
foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
}
$goCommand = Get-Command go -ErrorAction SilentlyContinue
if ($goCommand) {
    $goExecutable = $goCommand.Source
} else {
    $goExecutable = Join-Path $env:USERPROFILE '.cache/azuriya-tools/go/bin/go.exe'
    if (-not (Test-Path -LiteralPath $goExecutable)) {
        throw 'Go 1.24+ is required. Install Go and make go available on PATH.'
    }
}
Push-Location (Join-Path $projectRoot 'backend')
try {
    & $goExecutable run ./cmd/api
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
