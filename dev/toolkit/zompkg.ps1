<#
.SYNOPSIS
    Pack a directory into ZerOS .zom program package (ZIP format).

.DESCRIPTION
    Same behavior as D:/bin/zompkg.js: source dir may already have application.json,
    or use -Config / -Name to provide data and auto-create application.json.
    Files in ZOM are at ZIP root (no parent folder).

.PARAMETER SourceDir
    Source directory path (required). All files under it are packed into .zom root.

.PARAMETER OutputPath
    Output .zom file path. Default is (SourceDir).zom when omitted.

.PARAMETER Config
    Read full application config from JSON file (must have name field). Use with -Name as alternative.

.PARAMETER Name
    Program name (alternative to -Config). When set, application.json is auto-generated.

.PARAMETER Version
    Program version, default 1.0.0.

.PARAMETER Script
    Main script path, default (Name).js.

.PARAMETER Description
    Program description.

.PARAMETER Type
    Program type: GUI or CLI, default GUI.

.PARAMETER Icon
    Icon file path.

.PARAMETER Styles
    Style file paths, comma-separated.

.PARAMETER Assets
    Asset paths, comma-separated.

.PARAMETER Category
    Category: system, utility, game, other.

.EXAMPLE
    .\zompkg.ps1 D:\dev\myapp
    Use application.json in source dir, output D:\dev\myapp.zom

.EXAMPLE
    .\zompkg.ps1 D:\dev\myapp -Name myapp -Script myapp.js
    Auto-create application.json and pack

.EXAMPLE
    .\zompkg.ps1 D:\dev\myapp C:\out\myapp.zom -Config D:\dev\app.json
    Use given JSON as application.json and pack
#>

[CmdletBinding(DefaultParameterSetName = 'Pack')]
param(
    [Parameter(Mandatory = $true, Position = 0, ParameterSetName = 'Pack')]
    [string]$SourceDir,

    [Parameter(Position = 1, ParameterSetName = 'Pack')]
    [string]$OutputPath = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Config = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Name = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Version = '1.0.0',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Script = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Description = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [ValidateSet('GUI', 'CLI')]
    [string]$Type = 'GUI',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Icon = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Styles = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [string]$Assets = '',

    [Parameter(Mandatory = $false, ParameterSetName = 'Pack')]
    [ValidateSet('system', 'utility', 'game', 'other')]
    [string]$Category = 'other',

    [Parameter(Mandatory = $true, ParameterSetName = 'Help')]
    [switch]$Help
)

$AppJsonName = "application.json"

function Show-Usage {
    Write-Host "Usage: .\zompkg.ps1 SourceDir [OutputPath] [options]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Pack a directory into ZerOS .zom package. SourceDir may contain application.json," -ForegroundColor Cyan
    Write-Host "or use -Config / -Name to provide data and auto-create application.json." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Options (to provide application.json data):" -ForegroundColor Cyan
    Write-Host "  -Config path    JSON file path for full config (must have name)" -ForegroundColor Cyan
    Write-Host "  -Name name      Program name (use -Config or -Name, not both)" -ForegroundColor Cyan
    Write-Host "  -Version ver   Version, default 1.0.0" -ForegroundColor Cyan
    Write-Host "  -Script path    Main script, default (Name).js" -ForegroundColor Cyan
    Write-Host "  -Description    Description" -ForegroundColor Cyan
    Write-Host "  -Type GUI|CLI   Type, default GUI" -ForegroundColor Cyan
    Write-Host "  -Icon path      Icon path" -ForegroundColor Cyan
    Write-Host "  -Styles path,..  Styles, comma-separated" -ForegroundColor Cyan
    Write-Host "  -Assets path,..  Assets, comma-separated" -ForegroundColor Cyan
    Write-Host "  -Category       system|utility|game|other" -ForegroundColor Cyan
    Write-Host "  -Help           Show this help" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  .\zompkg.ps1 D:\dev\myapp" -ForegroundColor Cyan
    Write-Host "  .\zompkg.ps1 D:\dev\myapp -Name myapp -Script myapp.js" -ForegroundColor Cyan
    Write-Host "  .\zompkg.ps1 D:\dev\myapp C:\out.zom -Config D:\dev\app.json" -ForegroundColor Cyan
}

if ($Help) {
    Show-Usage
    exit 0
}

# Normalize path
$SourceDir = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($SourceDir.TrimEnd('\', '/'))
if (-not (Test-Path -LiteralPath $SourceDir -PathType Container)) {
    Write-Error "Source directory does not exist: $SourceDir"
    exit 1
}

if (-not $OutputPath) {
    $OutputPath = $SourceDir + '.zom'
} else {
    $OutputPath = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutputPath.TrimEnd('\', '/'))
}
if (-not [System.IO.Path]::GetFileName($OutputPath).ToLowerInvariant().EndsWith('.zom')) {
    $OutputPath = $OutputPath + '.zom'
}

# Build application.json content for injection
$applicationJsonContent = $null
if ($Config) {
    $configPath = $PSCmdlet.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Config)
    if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
        Write-Error "Config file does not exist: $configPath"
        exit 1
    }
    try {
        $applicationJsonContent = [System.IO.File]::ReadAllText($configPath, [System.Text.Encoding]::UTF8)
        $obj = $applicationJsonContent | ConvertFrom-Json
        if (-not $obj.name -or [string]::IsNullOrWhiteSpace($obj.name)) {
            Write-Error "Config file must contain name field"
            exit 1
        }
    } catch {
        Write-Error "Config file is not valid JSON or missing name: $_"
        exit 1
    }
    Write-Host "zompkg: Using config file for application.json -> $configPath"
} elseif ($Name -and ($Name = $Name.Trim())) {
    $scriptEntry = if ($Script) { $Script.Trim() } else { "$Name.js" }
    $stylesArr = if ($Styles) { $Styles.Split(',').Trim() | Where-Object { $_ } } else { @() }
    $assetsArr = if ($Assets) { $Assets.Split(',').Trim() | Where-Object { $_ } } else { @() }
    $app = [ordered] @{
        name                  = $Name
        version               = $Version
        description           = $Description
        script                = $scriptEntry
        styles                = $stylesArr
        icon                  = if ($Icon) { $Icon.Trim() } else { $null }
        type                  = $Type
        autoStart             = $false
        priority              = 5
        allowMultipleInstances = $true
        assets                = $assetsArr
        category              = $Category
    }
    $applicationJsonContent = $app | ConvertTo-Json -Depth 10
    Write-Host "zompkg: Auto-created application.json (name=$Name)"
}

# If not injected, check source dir for application.json
$appJsonInSource = Join-Path -Path $SourceDir -ChildPath $AppJsonName
if (-not $applicationJsonContent) {
    if (-not (Test-Path -LiteralPath $appJsonInSource -PathType Leaf)) {
        Write-Error "Source directory must contain application.json, or use -Config / -Name to provide"
        exit 1
    }
    Write-Host "zompkg: Using application.json from source directory"
}

# Create ZIP (.zom): root = source dir contents; overwrite application.json if injected
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$tempZip = Join-Path (Split-Path -Parent $SourceDir) (".zompkg_" + [System.IO.Path]::GetRandomFileName() + ".zip")
try {
    $zipModeCreate = 1
    $zip = [System.IO.Compression.ZipFile]::Open($tempZip, $zipModeCreate)
    try {
        $sourceFull = (Resolve-Path -LiteralPath $SourceDir).Path
        $entries = Get-ChildItem -LiteralPath $SourceDir -Recurse -File
        if ($applicationJsonContent) {
            $entry = $zip.CreateEntry($AppJsonName)
            $stream = $entry.Open()
            try {
                $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
                $writer.Write($applicationJsonContent)
                $writer.Flush()
            } finally {
                $stream.Close()
            }
        }
        foreach ($f in $entries) {
            $relativePath = $f.FullName.Substring($sourceFull.Length).TrimStart('\', '/').Replace('\', '/')
            if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
            if ($applicationJsonContent -and $relativePath -eq $AppJsonName) { continue }
            $entryName = $relativePath
            $entry = $zip.CreateEntry($entryName)
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
    # Always delete temp zip (retry on Windows when file may still be locked)
    if ($tempZip -and (Test-Path -LiteralPath $tempZip)) {
        $maxAttempts = 5
        for ($i = 0; $i -lt $maxAttempts; $i++) {
            try {
                Remove-Item -LiteralPath $tempZip -Force -ErrorAction Stop
                break
            } catch {
                if ($i -eq $maxAttempts - 1) {
                    Write-Host "zompkg: Warning: could not delete temp file: $tempZip" -ForegroundColor Yellow
                } else {
                    Start-Sleep -Milliseconds 150
                }
            }
        }
    }
}

$size = (Get-Item -LiteralPath $OutputPath).Length
$sizeStr = if ($size -lt 1KB) { "$size B" } elseif ($size -lt 1MB) { "{0:N1} KB" -f ($size / 1KB) } else { "{0:N1} MB" -f ($size / 1MB) }
Write-Host "zompkg: Pack succeeded: $OutputPath ($sizeStr)" -ForegroundColor Green
