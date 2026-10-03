import React, { useEffect, useRef } from "react";
import { Play, Stop } from "@phosphor-icons/react";

export function GlitchCommandControls({ state, call, setToast }) {
  const held = useRef(false);
  const queue = useRef(Promise.resolve());
  const caller = useRef(call);
  caller.current = call;
  const holdMode = state.controls?.effects?.time_glitch_shortcut_mode === "hold";
  const disabled = !state.running || state.monitorOnly || state.controls?.voiceBypassed || !state.controls?.effects?.time_glitch_enabled;
  const send = (path, data = {}) => {
    queue.current = queue.current.catch(() => {}).then(() => caller.current?.(path, data)).catch((error) => setToast?.(error.message));
  };
  const release = () => {
    if (!held.current) return;
    held.current = false;
    send("/api/glitch/stop");
  };
  useEffect(() => {
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      release();
    };
  }, []);
  return (
    <div className="glitchTestActions">
      <button className="primary" disabled={disabled}
        onPointerDown={(event) => {
          if (!holdMode) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          held.current = true;
          send("/api/glitch/trigger", { hold: true });
        }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={(event) => {
          if (!holdMode || event.repeat || ![" ", "Enter"].includes(event.key)) return;
          event.preventDefault(); held.current = true; send("/api/glitch/trigger", { hold: true });
        }}
        onKeyUp={(event) => { if (holdMode && [" ", "Enter"].includes(event.key)) { event.preventDefault(); release(); } }}
        onClick={() => { if (!holdMode) send("/api/glitch/trigger"); }}>
        <Play size={16} /> {holdMode ? "Segurar para repetir" : "Disparar repetição"}
      </button>
      <button title="Parar repetição" aria-label="Parar repetição" onClick={() => { held.current = false; send("/api/glitch/stop"); }}><Stop size={16} /></button>
      {!state.running && <span className="glitchTestStatus">Modificador de voz desligado</span>}
    </div>
  );
}
