; MicFudiddo Studio - Custom NSIS Installer Script
; Handles VB-CABLE dependency check and automatic download/install

!include "MUI2.nsh"
!include "nsDialogs.nsh"

; ─── Process termination on init ───────────────────────────────
!macro customInit
  DetailPrint "Fechando instâncias ativas do MicFudiddo..."
  nsExec::ExecToStack 'cmd.exe /c taskkill /F /IM "MicFudiddoBackend.exe" /IM "MicFudiddo Studio.exe"'
  Pop $0
  Pop $1
  
  Sleep 1000

  ; Deletar pastas antigas do app local
  RMDir /r "$LOCALAPPDATA\MicFudiddo"
  RMDir /r "$LOCALAPPDATA\MicFudiddoStudio"
  RMDir /r "$LOCALAPPDATA\micfudiddo-studio"
  RMDir /r "$LOCALAPPDATA\MicFudiddo Studio"
  RMDir /r "$LOCALAPPDATA\Programs\micfudiddo-studio"
  
  ; Deletar pastas antigas do Menu Iniciar
  RMDir /r "$SMPROGRAMS\MicFudiddo"
  
  ; Deletar atalhos antigos do Desktop
  Delete "$DESKTOP\Mic Fudido.lnk"
  Delete "$DESKTOP\MicFudiddo.lnk"
  Delete "$DESKTOP\MicFudiddo Studio.lnk"
  
  ; Deletar atalhos antigos do Menu Iniciar
  Delete "$SMPROGRAMS\Mic Fudido.lnk"
  Delete "$SMPROGRAMS\MicFudiddo.lnk"
  Delete "$SMPROGRAMS\MicFudiddo Studio.lnk"
  Delete "$SMPROGRAMS\MicFudiddo\MicFudiddo Studio.lnk"
!macroend

; ─── VB-CABLE detection ────────────────────────────────────────
!macro customInstall
  ; Check if VB-CABLE is already installed by looking for the driver
  nsExec::ExecToStack 'powershell -NoProfile -Command "if (Get-PnpDevice -FriendlyName ''*VB-Audio Virtual Cable*'' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $0
  ${If} $0 != "0"
    ; VB-CABLE not found - ask user
    MessageBox MB_YESNO|MB_ICONQUESTION "O driver VB-CABLE (cabo de audio virtual) nao foi encontrado no seu sistema.$\r$\n$\r$\nEle e necessario para que o MicFudiddo Studio funcione corretamente no Discord e outros apps.$\r$\n$\r$\nDeseja baixar e instalar o VB-CABLE agora?" IDYES downloadVBCable IDNO skipVBCable

    downloadVBCable:
      ; Download VB-CABLE installer
      DetailPrint "Baixando VB-CABLE..."
      SetDetailsPrint both
      
      ; Create temp directory for download
      CreateDirectory "$PLUGINSDIR\vbcable"
      
      ; Use PowerShell to download
      nsExec::ExecToStack 'powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = ''Tls12, Tls13''; Invoke-WebRequest -Uri ''https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'' -OutFile ''$PLUGINSDIR\vbcable\VBCable.zip'' -UseBasicParsing"'
      Pop $0
      Pop $1
      
      ${If} $0 != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Nao foi possivel baixar o VB-CABLE automaticamente.$\r$\n$\r$\nVoce pode baixa-lo manualmente em: https://vb-audio.com/Cable/$\r$\n$\r$\nO MicFudiddo Studio sera instalado mesmo assim."
        Goto skipVBCable
      ${EndIf}
      
      ; Extract zip
      DetailPrint "Extraindo VB-CABLE..."
      nsExec::ExecToStack 'powershell -NoProfile -Command "Expand-Archive -Path ''$PLUGINSDIR\vbcable\VBCable.zip'' -DestinationPath ''$PLUGINSDIR\vbcable\extracted'' -Force"'
      Pop $0
      
      ${If} $0 != "0"
        MessageBox MB_OK|MB_ICONEXCLAMATION "Nao foi possivel extrair o instalador do VB-CABLE.$\r$\n$\r$\nVoce pode baixa-lo manualmente em: https://vb-audio.com/Cable/"
        Goto skipVBCable
      ${EndIf}
      
      ; Run the VB-CABLE setup (requires admin)
      DetailPrint "Instalando VB-CABLE (sera necessario permissao de administrador)..."
      
      ; Find and run VBCABLE_Setup_x64.exe or VBCABLE_Setup.exe
      nsExec::ExecToStack 'powershell -NoProfile -Command "$$setupPath = Get-ChildItem -Path ''$PLUGINSDIR\vbcable\extracted'' -Filter ''VBCABLE_Setup_x64.exe'' -Recurse | Select-Object -First 1 -ExpandProperty FullName; if ($$setupPath) { Start-Process -FilePath $$setupPath -Verb RunAs -Wait; exit 0 } else { $$setupPath = Get-ChildItem -Path ''$PLUGINSDIR\vbcable\extracted'' -Filter ''VBCABLE_Setup.exe'' -Recurse | Select-Object -First 1 -ExpandProperty FullName; if ($$setupPath) { Start-Process -FilePath $$setupPath -Verb RunAs -Wait; exit 0 } else { exit 1 } }"'
      Pop $0
      
      ${If} $0 == "0"
        DetailPrint "VB-CABLE instalado com sucesso!"
        MessageBox MB_OK|MB_ICONINFORMATION "VB-CABLE instalado com sucesso!$\r$\n$\r$\nLembre-se de configurar no Discord:$\r$\n- Dispositivo de Entrada: CABLE Output (VB-Audio Virtual Cable)"
      ${Else}
        MessageBox MB_OK|MB_ICONEXCLAMATION "A instalacao do VB-CABLE pode nao ter sido concluida.$\r$\n$\r$\nVoce pode instala-lo manualmente depois: https://vb-audio.com/Cable/"
      ${EndIf}
      
      Goto doneVBCable

    skipVBCable:
      DetailPrint "Instalacao do VB-CABLE ignorada pelo usuario."
      MessageBox MB_OK|MB_ICONINFORMATION "Voce pode instalar o VB-CABLE depois acessando:$\r$\nhttps://vb-audio.com/Cable/$\r$\n$\r$\nSem ele, o voice changer nao funcionara no Discord."

    doneVBCable:
  ${Else}
    DetailPrint "VB-CABLE ja esta instalado no sistema."
  ${EndIf}
!macroend
