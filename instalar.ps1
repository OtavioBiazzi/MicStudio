# Script de Instalação Completa para MicFudiddo Studio
# Autores: OtavioBiazzi / Antigravity AI

$ErrorActionPreference = "Stop"

# 1. Garantir Privilégios de Administrador (necessário para instalar o driver de áudio VB-CABLE)
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Este instalador precisa de privilégios de Administrador para instalar o driver de áudio virtual." -ForegroundColor Yellow
    Write-Host "Reiniciando com permissões elevadas..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "==================================================" -ForegroundColor Purple
Write-Host "         Instalador do MicFudiddo Studio" -ForegroundColor Purple
Write-Host "==================================================" -ForegroundColor Purple
Write-Host ""

# 2. Verificar se o VB-CABLE está instalado
$driverPath = "C:\Windows\System32\drivers\vbcable_xp64.sys"
$hasVbCable = Test-Path -LiteralPath $driverPath

if (-not $hasVbCable) {
    Write-Host "[1/2] VB-CABLE não detectado. Baixando e instalando..." -ForegroundColor Yellow
    
    $tempDir = Join-Path $env:TEMP "MicFudiddoInstaller"
    $zipPath = Join-Path $tempDir "VBCABLE_Driver_Pack45.zip"
    $extractDir = Join-Path $tempDir "VB-CABLE"
    
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
    
    $url = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip"
    
    Write-Host "Baixando VB-CABLE oficial de $url ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $zipPath
    
    Write-Host "Extraindo arquivos..." -ForegroundColor Gray
    if (Test-Path -LiteralPath $extractDir) {
        Remove-Item -LiteralPath $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force
    
    $setup = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "VBCABLE_Setup_x64.exe" -File | Select-Object -First 1
    
    if ($null -ne $setup) {
        Write-Host "Abrindo instalador oficial do VB-CABLE..." -ForegroundColor Cyan
        Write-Host "IMPORTANTE: Clique em 'Install Driver' na janela que abrir." -ForegroundColor Magenta
        Start-Process -FilePath $setup.FullName -Verb RunAs -Wait
        Write-Host "VB-CABLE instalado com sucesso! (Pode ser necessário reiniciar o PC depois)" -ForegroundColor Green
    } else {
        Write-Host "Erro: Não foi possível localizar o executável de instalação do VB-CABLE." -ForegroundColor Red
    }
} else {
    Write-Host "[1/2] VB-CABLE já está instalado no sistema." -ForegroundColor Green
}

Write-Host ""

# 3. Localizar e Instalar o MicFudiddo Studio
$installDir = Join-Path $env:LOCALAPPDATA "Programs\micfudiddo-studio"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
$targetExe = Join-Path $installDir "MicFudiddo Studio.exe"

Write-Host "[2/2] Localizando executável do aplicativo..." -ForegroundColor Yellow

# Verificar se existe executável compilado localmente
$localReleaseDir = Join-Path $PSScriptRoot "studio-release"
$localExe = $null
if (Test-Path -LiteralPath $localReleaseDir) {
    $localExe = Get-ChildItem -LiteralPath $localReleaseDir -Filter "MicFudiddo Studio*.exe" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if ($null -ne $localExe) {
    Write-Host "Instalando a partir do executável local compilado: $($localExe.Name)" -ForegroundColor Gray
    Copy-Item -LiteralPath $localExe.FullName -Destination $targetExe -Force
} else {
    Write-Host "Nenhum executável local encontrado. Baixando a versão mais recente do GitHub..." -ForegroundColor Gray
    try {
        $releaseApi = Invoke-RestMethod -Uri "https://api.github.com/repos/OtavioBiazzi/MicStudio/releases/latest"
        $asset = $releaseApi.assets | Where-Object { $_.name -like "*Studio*.exe" } | Select-Object -First 1
        if ($null -eq $asset) {
            $asset = $releaseApi.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1
        }
        
        if ($null -ne $asset) {
            $downloadUrl = $asset.browser_download_url
            Write-Host "Baixando $($asset.name) de: $downloadUrl ..." -ForegroundColor Gray
            Invoke-WebRequest -Uri $downloadUrl -OutFile $targetExe
        } else {
            throw "Nenhum executável (.exe) encontrado nos assets da última release do GitHub."
        }
    } catch {
        Write-Host "Erro ao baixar do GitHub: $_" -ForegroundColor Red
        Write-Host "Verifique sua conexão ou compile o app localmente com 'npm run build:studio'." -ForegroundColor Red
        exit 1
    }
}

# 4. Criar Atalhos
Write-Host "Criando atalhos..." -ForegroundColor Gray
$shell = New-Object -ComObject WScript.Shell
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MicFudiddo Studio"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

function Create-Shortcut($shortcutPath, $description) {
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetExe
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = $targetExe
    $shortcut.Description = $description
    $shortcut.Save()
}

$desc = "MicFudiddo Studio - Captura de áudio, ganho e soundboard"
Create-Shortcut (Join-Path $startMenuDir "MicFudiddo Studio.lnk") $desc
Create-Shortcut (Join-Path $startMenuDir "Mic Fudido.lnk") $desc
Create-Shortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "MicFudiddo Studio.lnk") $desc

# Atualizar o cache de ícones do Windows
$code = @"
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(int wEventId, int uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);
"@
Add-Type -TypeDefinition $code -Namespace Shell32 -Name NativeMethods
[Shell32.NativeMethods]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)

Write-Host "Instalação concluída com sucesso!" -ForegroundColor Green
Write-Host "O aplicativo foi instalado em: $installDir" -ForegroundColor Gray
Write-Host "Você pode pesquisar por 'MicFudiddo Studio' ou 'Mic Fudido' no seu Menu Iniciar." -ForegroundColor Gray
if (-not $hasVbCable) {
    Write-Host "IMPORTANTE: Reinicie o seu computador para ativar o driver de áudio VB-CABLE." -ForegroundColor Yellow
}
