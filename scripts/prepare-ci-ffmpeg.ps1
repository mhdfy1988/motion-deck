param(
    [Parameter(Mandatory = $true)][string]$Destination,
    [string]$ArchivePath
)
$ErrorActionPreference = 'Stop'
$version = '8.1.2'
$expectedHash = 'db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec'
$url = 'https://github.com/GyanD/codexffmpeg/releases/download/8.1.2/ffmpeg-8.1.2-essentials_build.zip'
$target = [IO.Path]::GetFullPath($Destination)
# CI专用工具目录必须新建，不覆盖已有工具或用户目录。
if (Test-Path -LiteralPath $target) { throw "FFmpeg destination already exists: $target" }
New-Item -ItemType Directory -Path $target | Out-Null
if (-not $ArchivePath) {
    $ArchivePath = Join-Path $target 'ffmpeg.zip'
    Invoke-WebRequest -Uri $url -OutFile $ArchivePath -UseBasicParsing -TimeoutSec 180
}
if (-not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) { throw 'FFmpeg archive is missing' }
$actualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) { throw "FFmpeg SHA256 mismatch: $actualHash" }
Expand-Archive -LiteralPath $ArchivePath -DestinationPath $target
$bin = Join-Path $target "ffmpeg-$version-essentials_build\bin"
foreach ($tool in @('ffmpeg', 'ffprobe')) {
    $exe = Join-Path $bin "$tool.exe"
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Missing executable: $exe" }
    $report = & $exe -version 2>&1
    if ($LASTEXITCODE -ne 0) { throw "$tool failed to run: $LASTEXITCODE" }
    if ($report[0] -notmatch "^$tool version $([regex]::Escape($version))[- ]") { throw "Unexpected $tool version: $($report[0])" }
    Write-Host $report[0]
}
# 测试已有FFMPEG_BIN入口；不改系统PATH，也不打包进客户端。
$env:FFMPEG_BIN = $bin
if ($env:GITHUB_ENV) { Add-Content -LiteralPath $env:GITHUB_ENV -Value "FFMPEG_BIN=$bin" -Encoding utf8 }
Write-Host "FFmpeg ready: $bin"
