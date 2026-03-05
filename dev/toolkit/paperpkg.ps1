<#
.SYNOPSIS
    Pack a directory into a WallpaperEngine .paper package (ZIP format).

.DESCRIPTION
    Packs a wallpaper source directory into a .paper file per PAPER-FORMAT.
    Required in source: preview.png/preview.svg/preview.jpg (one of), README.json, run.js, config.json.
    Optional: assets/ and other files. index.html is not required (engine provides bootstrap).

.PARAMETER SourceDir
    Source directory path (required). All files under it are packed into .paper root.

.PARAMETER OutputPath
    Output .paper file path. Default is (SourceDir).paper when omitted.

.PARAMETER SkipValidation
    Skip required-files check (pack anyway).

.PARAMETER Help
    Show usage.

.EXAMPLE
    .\paperpkg.ps1 D:\dev\particle-mouse
    Pack to D:\dev\particle-mouse.paper

.EXAMPLE
    .\paperpkg.ps1 D:\dev\particle-mouse C:\out\particle-mouse.paper
    Pack to specified path
#>

[CmdletBinding(DefaultParameterSetName = 'Pack')]
param(
    [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'Pack')]
    [string]$SourceDir,

    [Parameter(Position = 1, ParameterSetName = 'Pack')]
    [string]$OutputPath = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [switch]$SkipValidation,

    [Parameter(Mandatory = $false, ParameterSetName = 'Help')]
    [switch]$Help
)

$RequiredFiles = @('README.json', 'run.js', 'config.json')
$PreviewNames = @('preview.png', 'preview.svg', 'preview.jpg')

function Show-Usage {
    Write-Host "Usage: .\paperpkg.ps1 SourceDir [OutputPath] [options]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Pack a wallpaper directory into a .paper package (ZIP)." -ForegroundColor Cyan
    Write-Host "Required in source: one of preview.png/svg/jpg, README.json, run.js, config.json." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -SkipValidation   Skip required-files check" -ForegroundColor Cyan
    Write-Host "  -Help             Show this help" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\paperpkg.ps1 D:\dev\particle-mouse" -ForegroundColor Cyan
    Write-Host "  .\paperpkg.ps1 D:\dev\particle-mouse C:\out\particle-mouse.paper" -ForegroundColor Cyan
}

if ($Help) {
    Show-Usage
    exit 0
}

$SourceDir = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourceDir.TrimEnd('\', '/'))
if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    Write-Error "Source directory does not exist: $SourceDir"
    exit 1
}

if (-not $SkipValidation) {
    $missing = @()
    foreach ($f in $RequiredFiles) {
        $p = Join-Path -Path $SourceDir -ChildPath $f
        if (-not (Test-Path -LiteralPath $p -PathType Leaf)) {
            $missing += $f
        }
    }
    $hasPreview = $false
    foreach ($n in $PreviewNames) {
        if (Test-Path -LiteralPath (Join-Path -Path $SourceDir -ChildPath $n) -PathType Leaf) {
            $hasPreview = $true
            break
        }
    }
    if (-not $hasPreview) {
        $missing += "preview (one of: $($PreviewNames -join ', '))"
    }
    if ($missing.Count -gt 0) {
        Write-Error "Missing required file(s): $($missing -join ', '). Use -SkipValidation to pack anyway."
        exit 1
    }
    $indexPath = Join-Path -Path $SourceDir -ChildPath 'index.html'
    if (Test-Path -LiteralPath $indexPath -PathType Leaf) {
        Write-Host "paperpkg: Note: index.html found; engine provides bootstrap, it will be ignored at runtime." -ForegroundColor Yellow
    }
}

if (-not $OutputPath) {
    $OutputPath = $SourceDir + '.paper'
} else {
    $OutputPath = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath.TrimEnd('\', '/'))
}
if (-not [System.IO.Path]::GetFileName($OutputPath).ToLowerInvariant().EndsWith('.paper')) {
    $OutputPath = $OutputPath + '.paper'
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$tempZip = Join-Path (Split-Path -Parent $SourceDir) (".paperpkg_" + [System.IO.Path]::GetRandomFileName() + ".zip")
try {
    $zip = [System.IO.Compression.ZipFile]::Open($tempZip, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $sourceFull = (Resolve-Path -LiteralPath $SourceDir).Path
        $entries = Get-ChildItem -LiteralPath $SourceDir -Recurse -File
        foreach ($f in $entries) {
            $relativePath = $f.FullName.Substring($sourceFull.Length).TrimStart('\', '/').Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
            $entry = $zip.CreateEntry($relativePath)
            $entryStream = $entry.Open()
            try {
                $fileStream = [System.IO.File]::OpenRead($f.FullName)
                try {
                    $fileStream.CopyTo($entryStream)
                } finally {
                    $fileStream.Close()
                }
            } finally {
                $entryStream.Close()
            }
        }
    } finally {
        $zip.Dispose()
    }
    if (Test-Path -LiteralPath $OutputPath) {
        Remove-Item -LiteralPath $OutputPath -Force -ErrorAction SilentlyContinue
    }
    $outDir = Split-Path -Parent $OutputPath
    if ($outDir -and -not (Test-Path -LiteralPath $outDir -PathType Container)) {
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    }
    Copy-Item -LiteralPath $tempZip -Destination $OutputPath -Force
} catch {
    Write-Error "Pack failed: $_"
    exit 1
} finally {
    if ($tempZip -and (Test-Path -LiteralPath $tempZip)) {
        $maxAttempts = 5
        for ($i = 0; $i -lt $maxAttempts; $i++) {
            try {
                Remove-Item -LiteralPath $tempZip -Force -ErrorAction Stop
                break
            } catch {
                if ($i -eq $maxAttempts - 1) {
                    Write-Host "paperpkg: Warning: could not delete temp file: $tempZip" -ForegroundColor Yellow
                } else {
                    Start-Sleep -Milliseconds 150
                }
            }
        }
    }
}

$size = (Get-Item -LiteralPath $OutputPath).Length
$sizeStr = if ($size -lt 1KB) { "$size B" } elseif ($size -lt 1MB) { "{0:N1} KB" -f ($size / 1KB) } else { "{0:N1} MB" -f ($size / 1MB) }
Write-Host "paperpkg: Pack succeeded: $OutputPath ($sizeStr)" -ForegroundColor Green
