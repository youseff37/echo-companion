$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$node = Join-Path (Get-Location).Path '.bundled/node.exe'
if (-not (Test-Path -LiteralPath $node)) {
    $node = (Get-Command node -ErrorAction Stop).Source
}
& $node (Join-Path $PSScriptRoot 'dsh.mjs') install
exit $LASTEXITCODE
