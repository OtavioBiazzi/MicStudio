$ErrorActionPreference = "Stop"

# Fechar processos existentes para evitar arquivos travados
try {
    Get-Process -Name "MicFudiddo Studio" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "MicFudiddoBackend" -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
} catch {}


$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$icon = Join-Path $root "assets\micfudiddo.ico"
$releaseDir = Join-Path $root "studio-release"
$unpackedDir = Join-Path $releaseDir "win-unpacked"
$studioExe = Get-ChildItem -LiteralPath $releaseDir -Filter "MicFudiddo Studio*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($null -eq $studioExe -or -not (Test-Path (Join-Path $unpackedDir "MicFudiddo Studio.exe"))) {
    Write-Host "MicFudiddo Studio nao encontrado. Gerando build..."
    Push-Location $root
    try {
        npm run build:studio
    } finally {
        Pop-Location
    }
    $studioExe = Get-ChildItem -LiteralPath $releaseDir -Filter "MicFudiddo Studio*.exe" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if ($null -eq $studioExe -or -not (Test-Path (Join-Path $unpackedDir "MicFudiddo Studio.exe"))) {
    throw "Nao foi possivel encontrar o executavel em $releaseDir"
}

$installDir = Join-Path $env:LOCALAPPDATA "Programs\micfudiddo-studio"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$installedExe = Join-Path $installDir "MicFudiddo Studio.exe"
$installedIcon = Join-Path $installDir "micfudiddo.ico"
Copy-Item -Path (Join-Path $unpackedDir "*") -Destination $installDir -Recurse -Force

if (Test-Path $icon) {
    Copy-Item -LiteralPath $icon -Destination $installedIcon -Force
} else {
    $installedIcon = $installedExe
}

$shell = New-Object -ComObject WScript.Shell
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MicFudiddo"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

function New-AppShortcut($path, $description) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = "$installedIcon,0"
    $shortcut.Description = $description
    $shortcut.Save()
}

$description = "MicFudiddo Studio - modificador de voz e soundboard"
New-AppShortcut (Join-Path $startMenuDir "MicFudiddo Studio.lnk") $description
New-AppShortcut (Join-Path $startMenuDir "MicFudiddo.lnk") $description
New-AppShortcut (Join-Path $startMenuDir "Mic Fudido.lnk") $description
New-AppShortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "MicFudiddo Studio.lnk") $description

Write-Host "Instalado em: $installDir"

# Notifica o Windows sobre a mudanca de atalhos e associacoes para recarregar o cache de icones na hora!
try {
    $code = @'
    using System;
    using System.Runtime.InteropServices;
    public class IconRefresh {
        [DllImport("shell32.dll", CharSet = CharSet.Auto)]
        public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
'@
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    [IconRefresh]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
    Write-Host "Atalhos criados. Cache de icones do Windows atualizado com sucesso!"
    Write-Host "Pesquise no Windows por: MicFudiddo Studio, MicFudiddo ou Mic Fudido"
} catch {
    Write-Warning "Nao foi possivel atualizar o cache de icones automaticamente."
}
