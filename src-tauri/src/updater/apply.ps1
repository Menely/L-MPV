param([Parameter(Mandatory = $true)][string]$StagingDirectory)

$ErrorActionPreference = 'Stop'
$stage = (Get-Item -LiteralPath $StagingDirectory).FullName
$root = [IO.Directory]::GetParent($stage).FullName
$lockPath = Join-Path $root '.update-apply.lock'
$handle = $null
$locked = $false
try {
    $handle = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::ReadWrite)
    $deadline = [DateTime]::UtcNow.AddSeconds(35)
    while (-not $locked) {
        try {
            $handle.Lock(0, [long]::MaxValue)
            $locked = $true
        } catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $deadline) { throw 'Another update is still being applied.' }
            Start-Sleep -Milliseconds 100
        }
    }
    Set-Location -LiteralPath $stage
    & $env:ComSpec /d /c update.bat
    $result = $LASTEXITCODE
} catch {
    $logDir = Join-Path $root 'logs'
    [IO.Directory]::CreateDirectory($logDir) | Out-Null
    [IO.File]::AppendAllText((Join-Path $logDir 'error.log'), "[UPDATE ERROR] $($_.Exception.Message)`r`n")
    $result = 1
} finally {
    if ($locked) { $handle.Unlock(0, [long]::MaxValue) }
    if ($handle) { $handle.Dispose() }
}
exit $result
