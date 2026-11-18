# Start the web server and synthetic Firebase emulators together.
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'scripts/start-local.cjs')
exit $LASTEXITCODE
