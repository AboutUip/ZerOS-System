<#
.SYNOPSIS
    Extract a WallpaperEngine .paper package to a directory.

.DESCRIPTION
    Extracts a .paper package (ZIP format) to the specified output directory.
    If no output directory is specified, extracts to a folder named after the .paper file.

.PARAMETER PackagePath
    Path to the .paper package file (required).

.PARAMETER OutputDir
    Output directory path. Default is the .paper filename without extension in same directory as package.

.PARAMETER ListOnly
    Only list the contents of the package without extracting.

.PARAMETER Overwrite
    Overwrite existing files in the output directory.

.PARAMETER Help
    Show usage.

.EXAMPLE
    .\paperunpack.ps1 D:\dist\particle-mouse.paper
    Extract to D:\dist\particle-mouse folder

.EXAMPLE
    .\paperunpack.ps1 D:\dist\particle-mouse.paper D:\projects\particle-mouse
    Extract to specified directory

.EXAMPLE
    .\paperunpack.ps1 D:\dist\particle-mouse.paper -ListOnly
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

$ReadmeJsonName = "README.json"

function Show-Usage {
    Write-Host "Usage: .\paperunpack.ps1 PackagePath [OutputDir] [options]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Extract a WallpaperEngine .paper package to a directory." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -ListOnly      List contents without extracting" -ForegroundColor Cyan
    Write-Host "  -Overwrite     Overwrite existing files" -ForegroundColor Cyan
    Write-Host "  -Help          Show this help" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\paperunpack.ps1 D:\dist\particle-mouse.paper" -ForegroundColor Cyan
    Write-Host "  .\paperunpack.ps1 D:\dist\particle-mouse.paper D:\projects\particle-mouse" -ForegroundColor Cyan
    Write-Host "  .\paperunpack.ps1 D:\dist\particle-mouse.paper -ListOnly" -ForegroundColor Cyan
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

if (-not [System.IO.Path]::GetFileName($PackagePath).ToLowerInvariant().EndsWith('.paper')) {
    Write-Error "Package file must have .paper extension: $PackagePath"
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

        Write-Host "paperunpack: Extracting to $OutputDir" -ForegroundColor Cyan

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
                Write-Host "paperunpack: Skipping (exists): $($entry.FullName)" -ForegroundColor Yellow
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
        Write-Host "paperunpack: Extracted $extractedCount file(s)" -ForegroundColor Green

        $readmePath = Join-Path -Path $OutputDir -ChildPath $ReadmeJsonName
        if (Test-Path -LiteralPath $readmePath -PathType Leaf) {
            try {
                $readmeContent = [System.IO.File]::ReadAllText($readmePath, [System.Text.Encoding]::UTF8)
                $readme = $readmeContent | ConvertFrom-Json
                if ($readme.name) {
                    Write-Host "paperunpack: Wallpaper: $($readme.name)" -ForegroundColor Cyan
                }
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
