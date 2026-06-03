$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe = Join-Path $root "dist\MicFudiddo.exe"
$icon = Join-Path $root "assets\micfudiddo.ico"

if (!(Test-Path $exe)) {
    Write-Host "MicFudiddo.exe nao encontrado. Gerando executavel..."
    & (Join-Path $root "build_exe.ps1")
}

if (!(Test-Path $exe)) {
    throw "Nao foi possivel encontrar $exe"
}

$installDir = Join-Path $env:LOCALAPPDATA "MicFudiddo"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$installedExe = Join-Path $installDir "MicFudiddo.exe"
$installedIcon = Join-Path $installDir "micfudiddo.ico"
Copy-Item -LiteralPath $exe -Destination $installedExe -Force

if (Test-Path $icon) {
    Copy-Item -LiteralPath $icon -Destination $installedIcon -Force
} else {
    $installedIcon = $installedExe
}

$shell = New-Object -ComObject WScript.Shell
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MicFudiddo"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

function New-AppShortcut($path, $name) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = "$installedIcon,0"
    $shortcut.Description = "MicFudiddo - modificador de voz e soundboard"
    $shortcut.Save()
}

New-AppShortcut (Join-Path $startMenuDir "Mic Fudido.lnk") "Mic Fudido"
New-AppShortcut (Join-Path $startMenuDir "MicFudiddo.lnk") "MicFudiddo"
New-AppShortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "MicFudiddo.lnk") "MicFudiddo"

Write-Host "Instalado em: $installDir"

# Notifica o Windows sobre a mudanca de atalhos e associacoes para recarregar o cache de icones na hora!
try {
    $code = @'
    using System;
    using System.Runtime.InteropServices;
    public class IconRefreshLegacy {
        [DllImport("shell32.dll", CharSet = CharSet.Auto)]
        public static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);
    }
'@
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    [IconRefreshLegacy]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero) # SHCNE_ASSOCCHANGED
    Write-Host "Atalhos criados no Menu Iniciar. Cache de icones do Windows atualizado com sucesso!"
    Write-Host "Pesquise por: Mic Fudido ou MicFudiddo"
} catch {
    Write-Warning "Nao foi possivel atualizar o cache de icones automaticamente."
}
