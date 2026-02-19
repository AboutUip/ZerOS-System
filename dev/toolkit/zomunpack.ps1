<#
.SYNOPSIS
    Extract a ZerOS .zom program package to a directory.

.DESCRIPTION
    Extract a .zom package (ZIP format) to the specified output directory.
    If no output directory is specified, extracts to a folder named after the .zom file.

.PARAMETER PackagePath
    Path to the .zom package file (required).

.PARAMETER OutputDir
    Output directory path. Default is the .zom filename without extension in current directory.

.PARAMETER ListOnly
    Only list the contents of the package without extracting.

.PARAMETER Overwrite
    Overwrite existing files in the output directory.

.EXAMPLE
    .\zomunpack.ps1 D:\dist\myapp.zom
    Extract to D:\dist\myapp folder

.EXAMPLE
    .\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp
    Extract to specified directory

.EXAMPLE
    .\zomunpack.ps1 D:\dist\myapp.zom -ListOnly
    List package contents only
#>

[CmdletBinding(DefaultParameterSetName = 'Extract')]
param(
    [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'Extract')]
    [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'List')]
    [string]$PackagePath,

    [Parameter(Position = 1, ParameterSetName = 'Extract')]
    [string]$OutputDir = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'List')]
    [switch]$ListOnly,

    [Parameter(Mandatory = $false, ParameterSetName = 'Extract')]
    [switch]$Overwrite,

    [Parameter(Mandatory = $false, ParameterSetName = 'Help')]
    [switch]$Help
)

$AppJsonName = "application.json"

function Show-Usage {
    Write-Host "Usage: .\zomunpack.ps1 PackagePath [OutputDir] [options]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Extract a ZerOS .zom package to a directory." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -ListOnly      List contents without extracting" -ForegroundColor Cyan
    Write-Host "  -Overwrite     Overwrite existing files" -ForegroundColor Cyan
    Write-Host "  -Help          Show this help" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\zomunpack.ps1 D:\dist\myapp.zom" -ForegroundColor Cyan
    Write-Host "  .\zomunpack.ps1 D:\dist\myapp.zom D:\projects\myapp" -ForegroundColor Cyan
    Write-Host "  .\zomunpack.ps1 D:\dist\myapp.zom -ListOnly" -ForegroundColor Cyan
}

if ($Help) {
    Show-Usage
    exit 0
}

$PackagePath = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($PackagePath.TrimEnd('\', '/'))
if (-not (Test-Path -LiteralPath $PackagePath -PathType Leaf)) {
    Write-Error "Package file does not exist: $PackagePath"
    exit 1
}

if (-not [System.IO.Path]::GetFileName($PackagePath).ToLowerInvariant().EndsWith('.zom')) {
    Write-Error "Package file must have .zom extension: $PackagePath"
    exit 1
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

try {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        if ($ListOnly) {
            Write-Host "Package: $PackagePath" -ForegroundColor Cyan
            Write-Host "Contents:" -ForegroundColor Cyan
            Write-Host ""
            foreach ($entry in $zip.Entries) {
                $sizeStr = if ($entry.Length -lt 1KB) { "$($entry.Length) B" }
                           elseif ($entry.Length -lt 1MB) { "{0:N1} KB" -f ($entry.Length / 1KB) }
                           else { "{0:N1} MB" -f ($entry.Length / 1MB) }
                Write-Host "  $($entry.FullName.PadRight(40)) $sizeStr"
            }
            $totalCount = $zip.Entries.Count
            Write-Host ""
            Write-Host "Total: $totalCount file(s)" -ForegroundColor Green
            exit 0
        }

        if (-not $OutputDir) {
            $baseName = [System.IO.Path]::GetFileNameWithoutExtension($PackagePath)
            $parentDir = Split-Path -Parent $PackagePath
            $OutputDir = Join-Path -Path $parentDir -ChildPath $baseName
        } else {
            $OutputDir = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputDir.TrimEnd('\', '/'))
        }

        if ((Test-Path -LiteralPath $OutputDir -PathType Container)) {
            if (-not $Overwrite) {
                $existingFiles = Get-ChildItem -LiteralPath $OutputDir -File -ErrorAction SilentlyContinue
                if ($existingFiles) {
                    Write-Error "Output directory is not empty: $OutputDir. Use -Overwrite to force."
                    exit 1
                }
            }
        } else {
            New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
        }

        Write-Host "zomunpack: Extracting to $OutputDir" -ForegroundColor Cyan

        foreach ($entry in $zip.Entries) {
            $entryPath = Join-Path -Path $OutputDir -ChildPath $entry.FullName
            $entryDir = Split-Path -Parent $entryPath

            if ($entryDir -and -not (Test-Path -LiteralPath $entryDir -PathType Container)) {
                New-Item -ItemType Directory -Force -Path $entryDir | Out-Null
            }

            if ([string]::IsNullOrWhiteSpace($entry.Name)) {
                continue
            }

            if ((Test-Path -LiteralPath $entryPath -PathType Leaf) -and -not $Overwrite) {
                Write-Host "zomunpack: Skipping (exists): $($entry.FullName)" -ForegroundColor Yellow
                continue
            }

            try {
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $entryPath, $Overwrite)
            } catch {
                $entryStream = $entry.Open()
                try {
                    $fileStream = [System.IO.File]::Create($entryPath)
                    try {
                        $entryStream.CopyTo($fileStream)
                    } finally {
                        $fileStream.Close()
                    }
                } finally {
                    $entryStream.Close()
                }
            }
        }

        $extractedCount = $zip.Entries.Count
        Write-Host "zomunpack: Extracted $extractedCount file(s)" -ForegroundColor Green

        $appJsonPath = Join-Path -Path $OutputDir -ChildPath $AppJsonName
        if (Test-Path -LiteralPath $appJsonPath -PathType Leaf) {
            try {
                $appJsonContent = [System.IO.File]::ReadAllText($appJsonPath, [System.Text.Encoding]::UTF8)
                $appConfig = $appJsonContent | ConvertFrom-Json
                Write-Host "zomunpack: Application: $($appConfig.name) v$($appConfig.version)" -ForegroundColor Cyan
            } catch {
            }
        }

    } finally {
        $zip.Dispose()
    }
} catch {
    Write-Error "Extract failed: $_"
    exit 1
}
