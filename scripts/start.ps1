$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
if (Test-Path '.bundled/node.exe') { $env:PATH = (Join-Path (Get-Location) '.bundled') + ';' + $env:PATH }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请从 https://nodejs.org 安装 Node.js LTS，再重新运行。' }
& node scripts/doctor.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path node_modules/ws)) { & npm.cmd ci --ignore-scripts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
$env:ECHO_OPEN_BROWSER='1'
& node src/server.mjs
exit $LASTEXITCODE
