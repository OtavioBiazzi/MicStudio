@echo off
setlocal

cd /d "%~dp0"

for %%F in ("studio-release\MicFudiddo Studio*.exe") do (
    if exist "%%~fF" (
        start "" "%%~fF"
        exit /b 0
    )
)

if exist "dist\MicFudiddo.exe" (
    start "" "%~dp0dist\MicFudiddo.exe"
    exit /b 0
)

echo Nenhum executavel do MicFudiddo foi encontrado.
echo Procurei em:
echo %~dp0studio-release\MicFudiddo Studio*.exe
echo %~dp0dist\MicFudiddo.exe
echo.
echo Rode "npm run build:studio" para gerar o Studio novamente.
pause
exit /b 1
