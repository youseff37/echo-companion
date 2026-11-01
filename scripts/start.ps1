$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请从 https://nodejs.org 安装 Node.js LTS，再重新运行。' }
& node scripts/doctor.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path node_modules/ws)) { & npm.cmd ci --ignore-scripts; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
& node src/server.mjs
exit $LASTEXITCODE
