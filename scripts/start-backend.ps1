$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $projectRoot 'live-server')
try {
    & mvn -B package -DskipTests
    if ($LASTEXITCODE -ne 0) { throw '后端构建失败' }
    # Some Windows JDK installations cannot use AF_UNIX for the selector pipe.
    # A non-existent socket directory makes the JVM use its TCP fallback for this process.
    $socketDir = Join-Path $env:TEMP 'tongpin-nonexistent-unix-socket-directory'
    if (Test-Path -LiteralPath $socketDir) { $socketDir = Join-Path $env:TEMP ("tongpin-no-socket-" + [guid]::NewGuid().ToString('N')) }
    & java "-Djdk.net.unixdomain.tmpdir=$socketDir" -jar 'target/live-server-1.0.0.jar'
    if ($LASTEXITCODE -ne 0) { throw '后端启动失败' }
} finally { Pop-Location }
