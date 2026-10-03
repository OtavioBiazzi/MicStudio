import React, { useState } from "react";
import { Waveform, ArrowClockwise, FolderOpen, ArrowSquareOut, WarningCircle, Check } from "@phosphor-icons/react";
import { WindowControls } from "./WindowControls";
import "./startup.css";

export function StartupScreen({ status, error, elapsed, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const failed = Boolean(error || status?.phase === "error");
  const slow = status?.phase === "slow" || elapsed >= 30;
  const message = (status?.phase === "error" ? status.message : error) || status?.message || "Preparando o servidor de \u00e1udio";
  const retry = async () => {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };
  const download = () => {
    const url = "https://github.com/OtavioBiazzi/MicStudio/releases/latest";
    if (window.micfudiddo?.openExternal) window.micfudiddo.openExternal(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <div className="appFrame startupFrame">
      <header className="appTitlebar"><WindowControls /></header>
      <main className="startupScreen">
        <div className="startupContent">
          <Waveform size={44} weight="duotone" className="startupMark" />
          <span className="startupEyebrow">MICFUDIDDO STUDIO</span>
          <h1>{failed ? "Falha ao iniciar o \u00e1udio" : slow ? "A inicializa\u00e7\u00e3o est\u00e1 demorando" : "Carregando MicFudido Studio..."}</h1>
          <p role={failed ? "alert" : "status"}>{message}</p>
          <ol className="startupSteps">
            <li className="complete"><Check size={16} /> Interface pronta</li>
            <li className={failed ? "failed" : "current"}>{failed ? <WarningCircle size={16} /> : <Waveform size={16} />} Servidor de &aacute;udio <span>{elapsed}s</span></li>
            <li>Dispositivos e biblioteca</li>
          </ol>
          {!failed && !slow && <div className="startupProgress" aria-label="Inicializando servidor de audio"><span /></div>}
          {(failed || slow) && (
            <div className="startupActions">
              <button className="btn btn-primary" disabled={retrying} onClick={status?.repairRequired ? download : retry}>
                {status?.repairRequired ? <ArrowSquareOut size={16} /> : <ArrowClockwise size={16} />}
                {status?.repairRequired ? "Baixar instalador" : retrying ? "Tentando novamente..." : "Tentar novamente"}
              </button>
              {status?.repairRequired && <button className="btn btn-ghost" disabled={retrying} onClick={retry}><ArrowClockwise size={16} /> Verificar novamente</button>}
              {window.micfudiddo?.openBackendLogs && <button className="btn btn-ghost" onClick={() => window.micfudiddo.openBackendLogs()}><FolderOpen size={16} /> Abrir logs</button>}
            </div>
          )}
          {failed && status?.detail && <details className="startupDetails"><summary>Detalhes do problema</summary><pre>{status.detail}</pre></details>}
        </div>
      </main>
    </div>
  );
}
