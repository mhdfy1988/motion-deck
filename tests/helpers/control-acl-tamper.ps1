param([Parameter(Mandatory=$true)][string]$Directory)
$ErrorActionPreference='Stop'
$target=(Resolve-Path -LiteralPath $Directory).Path
$allowed=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\output'))+[IO.Path]::DirectorySeparatorChar
if (-not $target.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)) { throw 'Test path must stay inside project output' }
& (Join-Path $env:SystemRoot 'System32\icacls.exe') $target '/grant:r' '*S-1-1-0:(OI)(CI)RX' '/Q' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Test ACL update failed' }
