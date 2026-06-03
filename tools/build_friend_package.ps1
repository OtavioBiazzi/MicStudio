param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$packageJsonPath = Join-Path $root "package.json"
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version

if (-not $SkipBuild) {
    Push-Location $root
    try {
        npm run build:studio
    } finally {
        Pop-Location
    }
}

$releaseDir = Join-Path $root "studio-release"
$studioExe = Get-ChildItem -LiteralPath $releaseDir -Filter "MicFudiddo Studio*.exe" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($null -eq $studioExe) {
    throw "Nao encontrei o executavel portatil em: $releaseDir"
}

$packagesDir = Join-Path $root "pacotes"
$packageName = "MicFudido-amigo-v$version"
$packageDir = Join-Path $packagesDir $packageName
$zipPath = Join-Path $packagesDir "$packageName.zip"

if (Test-Path -LiteralPath $packageDir) {
    Remove-Item -LiteralPath $packageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

Copy-Item -LiteralPath $studioExe.FullName -Destination (Join-Path $packageDir "MicFudido.exe") -Force

$readme = @'
Mic Fudido - pacote para amigo
================================

Este pacote vem com a versao portatil atual do app.
Nao precisa instalar Node, Python, npm ou dependencias de desenvolvimento.

Como usar rapido
----------------
1. Extraia o ZIP em uma pasta.
2. Abra "MicFudido.exe" para testar sem instalar.

Como instalar atalho no Windows
-------------------------------
1. Extraia o ZIP.
2. Clique duas vezes em "Instalar_MicFudido.bat".
3. Depois pesquise no Windows por "Mic Fudido" ou "MicFudido".

Dependencia de audio virtual
----------------------------
Para o Discord/jogos receberem a voz modificada, o PC precisa ter um cabo virtual
tipo VB-CABLE instalado. Se o computador ainda nao tiver:

1. Clique em "Baixar_Instalar_VB_CABLE.bat".
2. O script baixa o VB-CABLE do site oficial da VB-Audio.
3. O instalador do driver abre pedindo administrador.
4. Depois da instalacao, reinicie o PC.

Observacao: driver de audio sempre precisa de permissao de administrador no Windows.
O app em si nao altera driver profundo sozinho.

Arquivos
--------
- MicFudido.exe: app portatil.
- Abrir_MicFudido.bat: abre o app direto da pasta.
- Instalar_MicFudido.bat: copia o app para AppData e cria atalhos.
- Baixar_Instalar_VB_CABLE.bat: baixa e abre o instalador oficial do VB-CABLE.
'@
Set-Content -LiteralPath (Join-Path $packageDir "LEIA-ME.txt") -Value $readme -Encoding UTF8

$openBat = @'
@echo off
cd /d "%~dp0"
start "" "%~dp0MicFudido.exe"
'@
Set-Content -LiteralPath (Join-Path $packageDir "Abrir_MicFudido.bat") -Value $openBat -Encoding ASCII

$installBat = @'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Instalar_MicFudido.ps1"
pause
'@
Set-Content -LiteralPath (Join-Path $packageDir "Instalar_MicFudido.bat") -Value $installBat -Encoding ASCII

$installPs1 = @'
$ErrorActionPreference = "Stop"

$sourceExe = Join-Path $PSScriptRoot "MicFudido.exe"
if (-not (Test-Path -LiteralPath $sourceExe)) {
    throw "MicFudido.exe nao encontrado na pasta do pacote."
}

$installDir = Join-Path $env:LOCALAPPDATA "MicFudido"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$installedExe = Join-Path $installDir "MicFudido.exe"
Copy-Item -LiteralPath $sourceExe -Destination $installedExe -Force

$shell = New-Object -ComObject WScript.Shell
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MicFudido"
New-Item -ItemType Directory -Force -Path $startMenuDir | Out-Null

function New-AppShortcut($path, $description) {
    $shortcut = $shell.CreateShortcut($path)
    $shortcut.TargetPath = $installedExe
    $shortcut.WorkingDirectory = $installDir
    $shortcut.IconLocation = $installedExe
    $shortcut.Description = $description
    $shortcut.Save()
}

$description = "Mic Fudido - modificador de voz e soundboard"
New-AppShortcut (Join-Path $startMenuDir "Mic Fudido.lnk") $description
New-AppShortcut (Join-Path $startMenuDir "MicFudido.lnk") $description
New-AppShortcut (Join-Path ([Environment]::GetFolderPath("Desktop")) "Mic Fudido.lnk") $description

Write-Host ""
Write-Host "Mic Fudido instalado em:"
Write-Host $installDir
Write-Host ""
Write-Host "Agora da para pesquisar no Windows por: Mic Fudido"
'@
Set-Content -LiteralPath (Join-Path $packageDir "Instalar_MicFudido.ps1") -Value $installPs1 -Encoding UTF8

$vbBat = @'
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Baixar_Instalar_VB_CABLE.ps1"
pause
'@
Set-Content -LiteralPath (Join-Path $packageDir "Baixar_Instalar_VB_CABLE.bat") -Value $vbBat -Encoding ASCII

$vbPs1 = @'
$ErrorActionPreference = "Stop"

$url = "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip"
$officialPage = "https://vb-audio.com/Cable/"
$depsDir = Join-Path $PSScriptRoot "Dependencias"
$zipPath = Join-Path $depsDir "VBCABLE_Driver_Pack45.zip"
$extractDir = Join-Path $depsDir "VB-CABLE"

New-Item -ItemType Directory -Force -Path $depsDir | Out-Null

if (-not (Test-Path -LiteralPath $zipPath)) {
    Write-Host "Baixando VB-CABLE oficial..."
    Invoke-WebRequest -Uri $url -OutFile $zipPath
}

if (Test-Path -LiteralPath $extractDir) {
    Remove-Item -LiteralPath $extractDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $extractDir | Out-Null
Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

$setup = Get-ChildItem -LiteralPath $extractDir -Recurse -Filter "VBCABLE_Setup_x64.exe" -File |
    Select-Object -First 1

if ($null -eq $setup) {
    Write-Host "Nao achei o instalador dentro do ZIP. Abrindo pagina oficial:"
    Start-Process $officialPage
    exit 1
}

Write-Host ""
Write-Host "Vai abrir o instalador do driver como administrador."
Write-Host "Depois de instalar o VB-CABLE, reinicie o PC."
Write-Host ""
Start-Process -FilePath $setup.FullName -Verb RunAs -Wait
'@
Set-Content -LiteralPath (Join-Path $packageDir "Baixar_Instalar_VB_CABLE.ps1") -Value $vbPs1 -Encoding UTF8

$hash = Get-FileHash -LiteralPath (Join-Path $packageDir "MicFudido.exe") -Algorithm SHA256
Set-Content -LiteralPath (Join-Path $packageDir "SHA256.txt") -Value "MicFudido.exe  $($hash.Hash)" -Encoding ASCII

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $zipPath -CompressionLevel Optimal

$zipInfo = Get-Item -LiteralPath $zipPath
$exeInfo = Get-Item -LiteralPath (Join-Path $packageDir "MicFudido.exe")

Write-Host ""
Write-Host "Pacote criado:"
Write-Host $zipPath
Write-Host ("EXE: {0:N1} MB" -f ($exeInfo.Length / 1MB))
Write-Host ("ZIP: {0:N1} MB" -f ($zipInfo.Length / 1MB))
