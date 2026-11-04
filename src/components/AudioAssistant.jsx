import React, { useEffect, useState } from "react";
import { runAudioChecks, summarizeChecks, buildReport, VB_CABLE_URL } from "../audioChecks.js";
import { getAPI } from "../apiClient";

const ICON = { ok: "✅", warn: "⚠️", error: "❌" };

export function AudioAssistant({ state, call, updateControls, setPage, setToast, onClose, openGuide, appVersion }) {
  const [busy, setBusy] = useState("");
  const [level, setLevel] = useState(0);
  const voiceOn = Boolean(state?.running) && !state?.monitorOnly;

  // Medidor do microfone: so faz sentido com a voz ligada.
  useEffect(() => {
    if (!voiceOn) { setLevel(0); return undefined; }
    let alive = true;
    const timer = setInterval(async () => {
      try {
        const data = await getAPI("/api/runtime");
        if (alive) setLevel(Math.min(1, Number(data.level) || 0));
      } catch { /* ignora */ }
    }, 150);
    return () => { alive = false; clearInterval(timer); };
  }, [voiceOn]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(buildReport(state, appVersion));
      setToast?.("Relatório copiado! Cole na conversa de suporte.");
    } catch {
      setToast?.("Não consegui copiar o relatório.");
    }
  };
  const checks = runAudioChecks(state);
  const summary = summarizeChecks(checks);

  const applyFix = async (fix) => {
    switch (fix) {
      case "refresh":
        await call("/api/devices/refresh");
        break;
      case "download-cable":
        window.open(VB_CABLE_URL, "_blank", "noopener,noreferrer");
        break;
      case "voice-on":
        await call("/api/virtual/start");
        break;
      case "unmute":
        updateControls({ masterMute: false });
        break;
      case "monitor-volume":
        updateControls({ monitorVolume: 1 });
        break;
      case "go-settings":
        setPage?.("config");
        onClose();
        break;
      default:
        break;
    }
  };

  const run = async (key, fix) => {
    setBusy(key);
    try {
      await applyFix(fix);
    } catch (error) {
      setToast?.(`Não deu certo: ${error.message}`);
    } finally {
      setBusy("");
    }
  };

  const fixAll = async () => {
    setBusy("all");
    try {
      await call("/api/devices/refresh");
      if (state.controls?.masterMute) updateControls({ masterMute: false });
      if (state.controls?.monitor && Number(state.controls?.monitorVolume ?? 1) < 0.05) {
        updateControls({ monitorVolume: 1 });
      }
      if (!(state.running && !state.monitorOnly)) await call("/api/virtual/start");
      setToast?.("Pronto! Verifiquei tudo de novo.");
    } catch (error) {
      setToast?.(`Não consegui arrumar tudo: ${error.message}`);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 6, padding: 0 }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>🛠️ Problemas de áudio?</h3>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 14px" }}>
          {summary.ok
            ? "Está tudo certo por aqui. Se ainda assim ninguém te ouve, confira se o Discord (ou o jogo) está usando o \"CABLE Output\" como microfone."
            : "Veja abaixo o que precisa de atenção. Cada item tem um botão que resolve."}
        </p>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>
            {voiceOn ? "Fale algo: se a barra mexer, o app está te ouvindo." : "Ligue a voz para testar se o app está ouvindo seu microfone."}
          </div>
          <div style={{ height: 8, borderRadius: 6, background: "var(--bg-input)", border: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(level * 100)}%`, background: "var(--cyan)", transition: "width 120ms linear" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {checks.map((check) => (
            <div
              key={check.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: check.level === "ok" ? "transparent" : "var(--bg-input)"
              }}
            >
              <span style={{ fontSize: 16, lineHeight: "20px" }}>{ICON[check.level]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{check.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45, marginTop: 2 }}>{check.detail}</div>
              </div>
              {check.fix && (
                <button
                  className="btn btn-primary"
                  style={{ padding: "5px 10px", fontSize: 11, whiteSpace: "nowrap" }}
                  disabled={Boolean(busy)}
                  onClick={() => run(check.id, check.fix)}
                >
                  {busy === check.id ? "..." : check.fixLabel}
                </button>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
            <button className="btn btn-ghost" onClick={() => { onClose(); openGuide?.("programs"); }}>Usar no Discord/jogos</button>
            <button className="btn btn-ghost" onClick={copyReport}>Copiar relatório</button>
          </div>
          {!summary.ok && (
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={fixAll}>
              {busy === "all" ? "Arrumando..." : "Arrumar tudo automaticamente"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
