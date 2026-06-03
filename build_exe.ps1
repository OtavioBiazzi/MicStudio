$ErrorActionPreference = "Stop"

if (!(Test-Path ".venv")) {
    python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe .\tools\create_icon.py
.\.venv\Scripts\pyinstaller.exe `
    --noconfirm `
    --clean `
    --onefile `
    --windowed `
    --collect-data customtkinter `
    --icon .\assets\micfudiddo.ico `
    --name MicFudiddo `
    .\run.py

Write-Host "Pronto: dist\MicFudiddo.exe"
