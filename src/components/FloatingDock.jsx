import React, { useState, useEffect, useMemo } from "react";
import {
  Microphone,
  MicrophoneSlash,
  SpeakerHigh,
  SpeakerSlash,
  MusicNotes,
  Star,
  Play,
  FolderOpen,
  SlidersHorizontal,
  ArrowCounterClockwise,
  X,
  GearSix,
  CaretUp,
  CaretDown,
  StopCircle,
  MicrophoneStage,
  Waveform
} from "@phosphor-icons/react";

const voiceImageModules = import.meta.glob("../../assets/voices/*.png", { eager: true, import: "default" });
function getVoiceImage(id) {
  for (const [path, url] of Object.entries(voiceImageModules)) {
    if (path.includes(`/${id}.`)) return url;
  }
  return null;
}

export function FloatingDock({
  state,
  call,
  updateControls,
  toggleMute,
  activePreset,
  processingActive,
  lastPlayedSound,
  bypassActive,
  setBypassActive,
  toggleBypass,
  setPage,
  soundboardFavorites,
  dockMinimized,
  setDockMinimized,
  setSelectedSound,
  forcedPresetId
}) {
  const togglePath = processingActive || state.virtualMode ? "/api/stop" : "/api/virtual/start";
  const [showMenu, setShowMenu] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleSoundboardJump = (e) => {
    e.preventDefault();
    if (lastPlayedSound) {
      setPage("soundboard");
      setSelectedSound(lastPlayedSound.id);
      setTimeout(() => {
        const el = document.querySelector(`.soundCard.active`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  };

  const handleMixerToggle = (e) => {
    e.preventDefault();
    setShowMixer(!showMixer);
  };

  useEffect(() => {
    const handler = () => {
      setShowMenu(false);
      setShowMixer(false);
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const favoriteSounds = useMemo(() => {
    return (state.sounds || []).filter((s) => soundboardFavorites.includes(s.id)).slice(0, 3);
  }, [state.sounds, soundboardFavorites]);

  const recentSounds = useMemo(() => {
    return [...(state.sounds || [])]
      .filter((s) => Number(s.last_played_at || 0) > 0)
      .sort((a, b) => Number(b.last_played_at || 0) - Number(a.last_played_at || 0))
      .slice(0, 3);
  }, [state.sounds]);

  const activePresetAvatar = activePreset ? (
    getVoiceImage(activePreset.id) ? (
      <img src={getVoiceImage(activePreset.id)} alt={activePreset.label} />
    ) : (
      <span style={{ fontSize: 26 }}>{activePreset.emoji}</span>
    )
  ) : (
    <span style={{ fontSize: 26 }}>🎙️</span>
  );

  const isSoundPlaying = lastPlayedSound && state.players?.some((p) => p.soundId === lastPlayedSound.id && p.state === "playing");

  if (dockMinimized) {
    return (
      <div className="bottomBar dock-minimized">
        <div className="floating-dock-inner-minimized">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`status-dot-pulse ${processingActive ? "on" : ""}`} style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: processingActive ? "var(--purple)" : "var(--text-muted)",
              boxShadow: processingActive ? "0 0 8px var(--purple)" : "none",
              display: "inline-block"
            }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
              {processingActive ? "VOZ ATIVA" : "VOZ OFF"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              className={`bbBtn icon-only ${state.controls?.gain === 0 ? "on" : ""}`}
              onClick={toggleMute}
              title="Mute"
              style={{ width: 28, height: 28 }}
            >
              {state.controls?.gain === 0 ? <MicrophoneSlash size={14} color="var(--danger)" /> : <Microphone size={14} />}
            </button>

            <button
              className="bbBtn icon-only"
              onClick={() => call("/api/sounds/stop").catch(() => {})}
              title="Parar todos os sons"
              style={{ width: 28, height: 28 }}
            >
              <StopCircle size={14} />
            </button>

            <button
              className="bbBtn icon-only"
              onClick={() => setDockMinimized(false)}
              title="Maximizar Dock"
              style={{ width: 28, height: 28 }}
            >
              <CaretUp size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bottomBar">
      <div className="floating-dock-inner">
        <div className="bbSection">
          <button
            className={`bbBtn toggle ${processingActive ? "on" : ""}`}
            onClick={() => call(togglePath).catch(() => {})}
            title="Ativar/Desativar Voice Changer"
          >
            <Microphone size={16} weight="bold" />
            {processingActive ? "VOZ ON" : "VOZ OFF"}
          </button>

          <button
            className={`bbBtn icon-only ${state.controls?.gain === 0 ? "on" : ""}`}
            onClick={toggleMute}
            title="Mute"
          >
            {state.controls?.gain === 0 ? <MicrophoneSlash size={16} color="var(--danger)" /> : <Microphone size={16} />}
          </button>

          <button
            className={`bbBtn icon-only ${(state.controls?.monitor || state.controls?.soundboardMonitor) ? "on" : ""}`}
            onClick={() => {
              const isCurrentlyActive = !!(state.controls?.monitor || state.controls?.soundboardMonitor);
              if (isCurrentlyActive) {
                localStorage.setItem("prev_monitor", state.controls?.monitor ? "true" : "false");
                localStorage.setItem("prev_soundboardMonitor", state.controls?.soundboardMonitor ? "true" : "false");
                updateControls({ monitor: false, soundboardMonitor: false });
              } else {
                const prevMonitor = localStorage.getItem("prev_monitor") !== "false";
                const prevSoundboardMonitor = localStorage.getItem("prev_soundboardMonitor") !== "false";
                updateControls({ monitor: prevMonitor, soundboardMonitor: prevSoundboardMonitor });
              }
            }}
            onContextMenu={handleMixerToggle}
            title="Monitoramento Local (Esquerdo: Liga/Desliga, Direito: Mixer Rápido)"
          >
            {(state.controls?.monitor || state.controls?.soundboardMonitor) ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} color="var(--danger)" />}
          </button>

          <div className="bbVolume" style={{ gap: 8 }}>
            <input
              type="range" min={0} max={200} step={1}
              value={Math.round((state.controls?.monitorVolume ?? 1) * 100)}
              onChange={(e) => {
                const vol = Number(e.target.value) / 100;
                updateControls({ monitorVolume: vol, soundboardMonitorVolume: vol });
              }}
              style={{ width: 80 }}
            />
            <span className="bbVolumeValue" style={{ fontSize: 10, width: 28 }}>{Math.round((state.controls?.monitorVolume ?? 1) * 100)}%</span>
          </div>
        </div>

        <div className="dockDivider" />

        <div className="dock-active-avatar-container" onClick={toggleBypass}>
          <div className={`dock-active-avatar ${processingActive && !bypassActive && activePreset?.id !== "clean" ? "processing" : ""}`} style={{
            background: bypassActive || activePreset?.id === "clean" 
              ? "linear-gradient(135deg, #1f2937, #111827)" 
              : (activePreset?.gradient || "linear-gradient(135deg, var(--purple-dim), var(--purple))")
          }}>
            {bypassActive || activePreset?.id === "clean" ? (
              <span style={{ fontSize: 26 }}>⚪</span>
            ) : (
              activePresetAvatar
            )}
          </div>
          <span className="dock-active-label">
            {bypassActive || activePreset?.id === "clean" 
              ? "Voz Normal" 
              : activePreset?.id === "personalizado"
              ? "Voz Personalizada"
              : (activePreset?.label || "Voz Personalizada")}
          </span>
        </div>

        <div className="dockDivider" />

        <div className="bbSection" style={{ gap: 10 }}>
          {lastPlayedSound && (
            <div
              className={`dock-soundboard-quick-play ${isSoundPlaying ? "playing" : ""}`}
              onClick={() => {
                if (isSoundPlaying) {
                  call("/api/sounds/stop").catch(() => {});
                } else {
                  call("/api/sounds/play", { id: lastPlayedSound.id }).catch(() => {});
                }
              }}
              onContextMenu={handleSoundboardJump}
              title={isSoundPlaying ? "Parar Som | Ir p/ Soundboard (Direito)" : "Play | Ir p/ Soundboard (Direito)"}
              style={{ position: "relative" }}
            >
              {lastPlayedSound.coverUrl ? (
                <img src={lastPlayedSound.coverUrl} alt="" />
              ) : (
                <MusicNotes size={18} color={lastPlayedSound.color || "var(--purple)"} />
              )}
            </div>
          )}
          <button
            className="bbBtn icon-only dock-status-btn"
            onClick={() => setPage("config")}
          >
            <GearSix size={16} />
          </button>
          <button
            className="bbBtn icon-only"
            onClick={() => setDockMinimized(true)}
            title="Minimizar Dock"
          >
            <CaretDown size={16} />
          </button>
        </div>
      </div>

      {/* Floating Menu */}
      {showMenu && (
        <div className="dock-soundboard-quick-play-menu" style={{ left: menuPos.x, top: menuPos.y }} onClick={(e) => e.stopPropagation()}>
          <div className="menu-title">Últimos Tocados</div>
          {recentSounds.map((s) => (
            <button key={s.id} onClick={() => { call("/api/sounds/play", { id: s.id }).catch(() => {}); setShowMenu(false); }}>
              <Play size={12} /> {s.name}
            </button>
          ))}
          {recentSounds.length === 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 12px" }}>Nenhum som tocado</div>}

          <div className="menu-title">Favoritos</div>
          {favoriteSounds.map((s) => (
            <button key={s.id} onClick={() => { call("/api/sounds/play", { id: s.id }).catch(() => {}); setShowMenu(false); }}>
              <Star size={12} color="var(--amber)" weight="fill" /> {s.name}
            </button>
          ))}
          {favoriteSounds.length === 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 12px" }}>Sem favoritos</div>}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <button onClick={() => { setPage("soundboard"); setShowMenu(false); }}>
            <FolderOpen size={12} color="var(--cyan)" /> Abrir Soundboard
          </button>
        </div>
      )}

      {/* Quick Mixer Popup */}
      {showMixer && (
        <div className="dock-quick-mixer" onClick={(e) => e.stopPropagation()}>
          <div className="mixer-header">
            <div className="mixer-title">
              <SlidersHorizontal size={16} color="var(--purple)" />
              <h4>Mixer Rápido</h4>
            </div>
            <div className="mixer-header-actions">
              <button
                className="mixer-action-btn reset"
                title="Resetar Valores"
                onClick={() => {
                  updateControls({
                    gain: 1.0,
                    monitor: true,
                    monitorVolume: 1.0,
                    soundboardMonitor: true,
                    soundboardMonitorVolume: 0.65,
                    pitch: 0.0,
                    effects: {
                      ...state.controls?.effects,
                      output_volume: 1.0,
                      output_volume_enabled: false
                    }
                  });
                }}
              >
                <ArrowCounterClockwise size={12} />
                <span>Redefinir</span>
              </button>
              <button className="mixer-action-btn close" title="Fechar" onClick={() => setShowMixer(false)}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="mixer-body">
            <div className="mixer-row">
              <div className="row-label">
                <Microphone size={14} className="row-icon" />
                <span className="label-text">Ganho do Microfone</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={0.5}
                  value={state.controls?.gain ?? 1}
                  onChange={(e) => updateControls({ gain: Number(e.target.value) })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.gain ?? 1)}x</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <SpeakerHigh size={14} className="row-icon" />
                <span className="label-text">Retorno de Voz</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={1}
                  value={Math.round((state.controls?.monitorVolume ?? 1) * 100)}
                  onChange={(e) => updateControls({ monitorVolume: Number(e.target.value) / 100 })}
                  className="mixer-slider"
                />
                <span className="slider-value">{Math.round((state.controls?.monitorVolume ?? 1) * 100)}%</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <MusicNotes size={14} className="row-icon" />
                <span className="label-text">Retorno de Sons</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={1}
                  value={Math.round((state.controls?.soundboardMonitorVolume ?? 0.65) * 100)}
                  onChange={(e) => updateControls({ soundboardMonitorVolume: Number(e.target.value) / 100 })}
                  className="mixer-slider"
                />
                <span className="slider-value">{Math.round((state.controls?.soundboardMonitorVolume ?? 0.65) * 100)}%</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <MicrophoneStage size={14} className="row-icon" />
                <span className="label-text">Volume da Voz</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={3000}
                  step={50}
                  value={Math.round((state.controls?.effects?.output_volume ?? 1) * 100)}
                  onChange={(e) => updateControls({
                    effects: {
                      ...state.controls?.effects,
                      output_volume: Number(e.target.value) / 100,
                      output_volume_enabled: true
                    }
                  })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.effects?.output_volume ?? 1.0).toFixed(1)}x</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <Waveform size={14} className="row-icon" />
                <span className="label-text">Pitch</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={-36}
                  max={36}
                  step={1}
                  value={state.controls?.pitch ?? 0}
                  onChange={(e) => updateControls({ pitch: Number(e.target.value) })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.pitch ?? 0) > 0 ? `+${state.controls?.pitch}` : state.controls?.pitch}st</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
