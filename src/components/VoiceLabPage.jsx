import React, { useState } from "react";
import {
  WaveSine, Microphone, WaveSawtooth, SpeakerHigh, Robot, Ghost, Phone, Sparkle,
  Circuitry, ChartBar, Megaphone, SlidersHorizontal, ArrowCounterClockwise,
  FloppyDisk, Play, Export, UploadSimple, Trash, FadersHorizontal
} from "@phosphor-icons/react";
import { effectDefaults, countEnabledEffects } from "../utils";

const voiceCategories = [
  "Todas", "Favoritas", "Recentes", "Reverb", "Fina e Aguda", "Grave", "Robótica", "Música", "Rádio", "Humor", "Monstros", "Jogos e Streaming", "Avançados", "Exclusivos", "Especiais", "Customizadas"
];

export function VoiceLabPage({
  state,
  call,
  updateControls,
  updateEffects,
  customVoices,
  setCustomVoices,
  setToast,
  setPage,
  customVoiceCategories
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Customizadas");
  const [emoji, setEmoji] = useState("🎤");

  const saveVoice = () => {
    if (!name.trim()) { setToast("Nome da voz é obrigatório."); return; }
    const newVoice = {
      id: `custom_${Date.now()}`,
      label: name.trim(),
      description: description.trim() || "Voz personalizada de estúdio",
      emoji,
      category,
      gradient: "linear-gradient(135deg, #1e1b4b, #311042)",
      gain: state.controls.gain,
      pitch: state.controls.pitch,
      effects: { ...state.controls.effects }
    };
    setCustomVoices((prev) => [...prev, newVoice]);
    setToast(`Voz "${name}" salva com snapshots de estúdio!`);
    setName("");
    setDescription("");
  };

  const deleteCustomVoice = (voiceId) => {
    setCustomVoices((prev) => prev.filter((v) => v.id !== voiceId));
    setToast("Voz personalizada removida.");
  };

  const exportVoices = () => {
    const data = JSON.stringify(customVoices, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "micfudido_vozes.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importVoices = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          setCustomVoices((prev) => [...prev, ...imported.map((v) => ({ ...v, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}` }))]);
          setToast(`${imported.length} voz(es) importada(s)!`);
        }
      } catch { setToast("Erro ao importar arquivo."); }
    };
    input.click();
  };

  const activateAllAtMax = () => {
    const maxControls = {
      pitch: 36,
      gain: 100,
      effects: {
        ...state.controls?.effects,
        distortion_enabled: true,
        distortion_drive: 200,
        output_volume_enabled: true,
        output_volume: 100,
        robot_enabled: true,
        robot_rate_hz: 500,
        reverb_enabled: true,
        reverb_mix: 1.0,
        echo_enabled: true,
        echo_mix: 1.0,
        delay_enabled: true,
        delay_mix: 1.0,
        chorus_enabled: true,
        chorus_mix: 1.0,
        flanger_enabled: true,
        flanger_mix: 1.0,
        bitcrush_enabled: true,
        bitcrush_bits: 12,
        equalizer_enabled: true,
        equalizer_tone: 1.0,
        megaphone_enabled: true,
        megaphone_drive: 40,
        telephone_enabled: true,
        telephone_mix: 1.0,
        demon_enabled: true,
        demon_drive: 40,
        alien_enabled: true,
        alien_rate_hz: 500,
        whisper_enabled: true,
        whisper_mix: 1.0,
        compressor_enabled: true,
        compressor_amount: 1.0,
        wobble_enabled: true,
        wobble_mix: 1.0,
        reverse_enabled: true,
        reverse_mix: 1.0,
        alien_glitch_enabled: true,
        alien_glitch_mix: 1.0,
        glitch_enabled: true,
        glitch_mix: 1.0,
        glitch_rate_hz: 60,
        time_glitch_enabled: true,
        time_glitch_mix: 1.0,
        time_glitch_rate_hz: 16,
        time_glitch_depth: 1.0,
        radio_static_enabled: true,
        radio_static_mix: 1.0,
        radio_crackle_rate_hz: 40,
        double_voice_enabled: true,
        double_voice_mix: 1.0,
        double_voice_delay_ms: 250,
        double_voice_pitch_semitones: -24,
        ambience_enabled: true,
        ambience_mode: "digital",
        ambience_volume: 1.0
      }
    };
    updateControls(maxControls);
    setToast("💥 FUDIDDO AO EXTREMO! Todos os efeitos ativados no máximo!");
  };

  const modules = [
    {
      title: "🚀 Controles Principais de Áudio (Escala até 1000%)",
      items: [
        { key: "pitch", label: "Tom (Pitch)", icon: WaveSine, min: -36, max: 36, step: 1, suffix: "st", isControl: true },
        { key: "gain", label: "Ganho de Entrada", icon: Microphone, min: 0, max: 100, step: 0.1, suffix: "x", isControl: true },
        { key: "distortion_drive", label: "Gain Boost (Saturação)", icon: WaveSawtooth, min: 1, max: 200, step: 1, suffix: "x", isControl: false, enableKey: "distortion_enabled" },
        { key: "output_volume", label: "Volume de Saída", icon: SpeakerHigh, min: 0, max: 100, step: 0.1, suffix: "x", isControl: false, enableKey: "output_volume_enabled" },
        { key: "robot_rate_hz", label: "Modulador de Formante", icon: Robot, min: 5, max: 500, step: 1, suffix: "Hz", isControl: false, enableKey: "robot_enabled" },
        { key: "reverb_mix", label: "Efeito Mix (Reverb)", icon: Ghost, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "reverb_enabled" }
      ]
    },
    {
      title: "🌌 Espaço & Textura (Escala até 1000%)",
      items: [
        { key: "echo_mix", label: "Eco / Retardo", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "echo_enabled" },
        { key: "delay_mix", label: "Delay Tridimensional", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "delay_enabled" },
        { key: "chorus_mix", label: "Stereo Width (Chorus)", icon: Sparkle, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "chorus_enabled" },
        { key: "flanger_mix", label: "Flanger", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "flanger_enabled" },
        { key: "bitcrush_bits", label: "Bitcrush (Redução)", icon: Circuitry, min: 3, max: 12, step: 1, suffix: "bits", isControl: false, enableKey: "bitcrush_enabled" },
        { key: "equalizer_tone", label: "Equalizador", icon: ChartBar, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "equalizer_enabled" }
      ]
    },
    {
      title: "👾 Efeitos Especiais Extremos (Escala até 1000%)",
      items: [
        { key: "megaphone_drive", label: "Megafone", icon: Megaphone, min: 1, max: 40, step: 0.5, suffix: "x", isControl: false, enableKey: "megaphone_enabled" },
        { key: "telephone_mix", label: "Telefone", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "telephone_enabled" },
        { key: "demon_drive", label: "Distorção Demoníaca", icon: Robot, min: 1, max: 40, step: 0.5, suffix: "x", isControl: false, enableKey: "demon_enabled" },
        { key: "alien_rate_hz", label: "Alienígena Ring Mod", icon: Circuitry, min: 20, max: 500, step: 1, suffix: "Hz", isControl: false, enableKey: "alien_enabled" },
        { key: "whisper_mix", label: "Sussurro", icon: Microphone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "whisper_enabled" },
        { key: "compressor_amount", label: "Compressor / Limiter", icon: SlidersHorizontal, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "compressor_enabled" },
        { key: "wobble_mix", label: "Vibrato Wobble", icon: Sparkle, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "wobble_enabled" },
        { key: "reverse_mix", label: "Reverse", icon: ArrowCounterClockwise, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "reverse_enabled" },
        { key: "alien_glitch_mix", label: "Glitch Alien", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "alien_glitch_enabled" },
        { key: "glitch_mix", label: "Glitch Digital", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "glitch_enabled" },
        { key: "glitch_rate_hz", label: "Velocidade Glitch", icon: Circuitry, min: 4, max: 60, step: 1, suffix: "Hz", isControl: false, enableKey: "glitch_enabled" },
        { key: "time_glitch_mix", label: "Glitch Temporal", icon: ArrowCounterClockwise, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "time_glitch_enabled" },
        { key: "time_glitch_rate_hz", label: "Frequência Temporal", icon: Circuitry, min: 1, max: 16, step: 0.5, suffix: "Hz", isControl: false, enableKey: "time_glitch_enabled" },
        { key: "time_glitch_depth", label: "Viagem no Tempo", icon: ArrowCounterClockwise, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "time_glitch_enabled" },
        { key: "double_voice_mix", label: "Voz Duplicada", icon: WaveSine, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "double_voice_enabled" },
        { key: "double_voice_delay_ms", label: "Atraso da Segunda Voz", icon: Phone, min: 0, max: 250, step: 1, suffix: "ms", isControl: false, enableKey: "double_voice_enabled" },
        { key: "double_voice_pitch_semitones", label: "Tom da Segunda Voz", icon: WaveSine, min: -24, max: 24, step: 1, suffix: "st", isControl: false, enableKey: "double_voice_enabled" },
        { key: "radio_static_mix", label: "Estática de Rádio", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "radio_static_enabled" },
        { key: "radio_crackle_rate_hz", label: "Estalos do Rádio", icon: Circuitry, min: 0, max: 40, step: 1, suffix: "Hz", isControl: false, enableKey: "radio_static_enabled" },
        { key: "ambience_volume", label: "Ambiente Procedural", icon: Sparkle, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "ambience_enabled" }
      ]
    },
    {
      title: "🎵 Música & Acompanhamento (Ritmo & Harmonia)",
      items: [
        { key: "harmony_mix", label: "Magic Chords (Harmonizador)", icon: WaveSine, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "harmony_enabled" },
        { key: "drum_loop_volume", label: "Beatbox Jam (Volume)", icon: Megaphone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "drum_loop_enabled" }
      ]
    }
  ];

  return (
    <div className="voiceLab">
      <div className="labHeader">
        <h2>🧪 Modular Voice Lab v3.0</h2>
        <p>Desenhe e modele timbres e efeitos premium com snaps analógicos em tempo real</p>
      </div>

      <div className="voice-lab-grid-modular">
        <div className="voice-lab-card-modular" style={{ alignSelf: "flex-start" }}>
          <div className="voice-lab-module-title">
            <Sparkle size={18} color="var(--purple)" />
            <span>Perfil da Voz Customizada</span>
          </div>

          <div className="labField">
            <label>Nome do Preset</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Megafone Cyber" />
          </div>
          <div className="labField">
            <label>Descrição Opcional</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Modelagem de tom puxada..." style={{ minHeight: 70 }} />
          </div>
          <div className="labField">
            <label>Categoria principal</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...voiceCategories.filter((c) => !["Todas", "Favoritas", "Recentes"].includes(c)), ...(customVoiceCategories || [])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="labField">
            <label>Ícone (Emoji)</label>
            <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 60, fontSize: 22, textAlign: "center" }} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 6 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 800, marginBottom: 8 }}>Snap do Motor de Áudio:</div>
            <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Ganho: <strong>{Number(state.controls?.gain ?? 1).toFixed(1)}x</strong></span>
              <span style={{ color: "var(--border-active)" }}>Tom: <strong>{Number(state.controls?.pitch ?? 0).toFixed(0)} st</strong></span>
              <span style={{ color: "var(--cyan)" }}>Módulos Ativos: <strong>{countEnabledEffects(state.controls?.effects)}</strong></span>
            </div>
          </div>
        </div>

        <div className="voice-lab-card-modular">
          <div className="voice-lab-module-title">
            <FadersHorizontal size={18} color="var(--cyan)" />
            <span>Painel Modular de Efeitos (Escala Premium 0% a 1000%)</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxHeight: "68vh", overflowY: "auto", paddingRight: 6 }}>
            {modules.map((group) => (
              <div key={group.title} className="effectGroup" style={{ marginBottom: 4 }}>
                <div className="effectGroupTitle">{group.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map((item) => {
                    const isControl = item.isControl;
                    const enabled = isControl ? true : Boolean(state.controls?.effects?.[item.enableKey]);
                    const raw = isControl ? state.controls?.[item.key] : (state.controls?.effects?.[item.key] ?? effectDefaults[item.key]);
                    
                    const maxVal = item.max;
                    let sliderPct;
                    if (item.key === "pitch") {
                      sliderPct = Math.round(((Number(raw) + 24) / 48) * 1000);
                    } else if (item.key === "robot_rate_hz") {
                      sliderPct = Math.round(((Number(raw) - 5) / 245) * 1000);
                    } else if (item.key === "alien_rate_hz") {
                      sliderPct = Math.round(((Number(raw) - 20) / 280) * 1000);
                    } else if (item.key === "bitcrush_bits") {
                      sliderPct = Math.round(((Number(raw) - 3) / 9) * 1000);
                    } else {
                      sliderPct = Math.round((Number(raw) / maxVal) * 100);
                    }

                    const handleSliderChange = (e) => {
                      const pct = Number(e.target.value);
                      let val;
                      if (item.key === "pitch") {
                        val = (pct / 1000) * 48 - 24;
                      } else if (item.key === "robot_rate_hz") {
                        val = (pct / 1000) * 245 + 5;
                      } else if (item.key === "alien_rate_hz") {
                        val = (pct / 1000) * 280 + 20;
                      } else if (item.key === "bitcrush_bits") {
                        val = Math.round((pct / 1000) * 9 + 3);
                      } else {
                        val = (pct / 100) * maxVal;
                      }
                      
                      if (isControl) {
                        updateControls({ [item.key]: val });
                      } else {
                        updateEffects({ [item.key]: val, [item.enableKey]: true });
                      }
                    };

                    const handleToggle = () => {
                      if (isControl) return;
                      updateEffects({ [item.enableKey]: !enabled });
                    };

                    const Icon = item.icon;
                    const showClipping = sliderPct > 200;

                    return (
                      <div key={item.key} className={`voice-lab-effect-card ${enabled ? "active" : ""}`}>
                        <div className="voice-lab-effect-header">
                          <div className="voice-lab-effect-title-group">
                            <Icon size={16} weight="duotone" />
                            <span className="voice-lab-effect-name">
                              {item.label}
                              {showClipping && <span className="clipping-alert-badge">🔥 OVERDRIVE</span>}
                            </span>
                          </div>
                          {!isControl ? (
                            <label className="toggleSwitch" style={{ scale: 0.8 }}>
                              <input type="checkbox" checked={enabled} onChange={handleToggle} />
                              <span className="toggleTrack" />
                            </label>
                          ) : (
                            <span className="voice-lab-status-badge">Fixo</span>
                          )}
                        </div>
                        
                        <div className="voice-lab-effect-control">
                          <div className="voice-lab-effect-slider">
                            <input
                              type="range"
                              min={0}
                              max={1000}
                              step={5}
                              value={sliderPct}
                              onChange={handleSliderChange}
                              disabled={!enabled && !isControl}
                              style={{ width: "100%", cursor: enabled || isControl ? "pointer" : "not-allowed" }}
                            />
                          </div>
                          <span className="voice-lab-effect-value">
                            {isControl 
                              ? (item.key === "pitch" ? `${Number(raw).toFixed(0)}st` : `${Number(raw).toFixed(1)}x`)
                              : `${Math.round(sliderPct)}%`
                            }
                          </span>
                        </div>
                        {item.key === "harmony_mix" && enabled && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-xs)", display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Modo do Acorde:</span>
                            <select
                              value={state.controls?.effects?.harmony_mode || "Major"}
                              onChange={(e) => updateEffects({ harmony_mode: e.target.value })}
                              style={{ padding: "4px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontSize: 11, outline: "none" }}
                            >
                              <option value="Major">Major (Alegre)</option>
                              <option value="Minor">Minor (Triste)</option>
                              <option value="Space">Space (Espacial)</option>
                              <option value="Octaves">Octaves (Oitavado)</option>
                              <option value="Mystic">Mystic (Místico)</option>
                            </select>
                          </div>
                        )}
                        {item.key === "drum_loop_volume" && enabled && (
                          <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-xs)", display: "flex", flexDirection: "column", gap: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Ritmo (BPM):</span>
                              <span style={{ fontSize: 11, color: "var(--cyan)", fontWeight: 800 }}>{state.controls?.effects?.drum_loop_bpm ?? 90} BPM</span>
                            </div>
                            <input
                              type="range"
                              min={40}
                              max={240}
                              step={5}
                              value={state.controls?.effects?.drum_loop_bpm ?? 90}
                              onChange={(e) => updateEffects({ drum_loop_bpm: Number(e.target.value) })}
                              style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--border)", outline: "none", accentColor: "var(--cyan)", cursor: "pointer" }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="labActions" style={{ marginTop: 28 }}>
        <button
          className="labSaveBtn"
          onClick={activateAllAtMax}
          style={{
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            border: "1px solid #f87171",
            boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
            fontWeight: 800,
            color: "#ffffff"
          }}
        >
          💥 ATIVAR TUDO NO MÁXIMO
        </button>
        <button className="labSaveBtn" onClick={saveVoice}>
          <FloppyDisk size={16} /> Salvar Snapshot Voz
        </button>
        <button className="labPreviewBtn" onClick={() => setToast("Preview Analógico: Ajuste os sliders modulares e fale no mic com o processamento Ativo!")}>
          <Play size={16} /> Ouvir Prévia
        </button>
        <button className="labPreviewBtn" onClick={exportVoices}>
          <Export size={16} /> Exportar Biblioteca
        </button>
        <button className="labPreviewBtn" onClick={importVoices}>
          <UploadSimple size={16} /> Importar Presets
        </button>
      </div>

      {customVoices.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="sectionHeader">SUA BIBLIOTECA DE VOZES CUSTOMIZADAS</div>
          <div className="voiceGrid">
            {customVoices.map((voice) => (
              <div key={voice.id} className="voiceCard" style={{ position: "relative" }}>
                <div className="cardImage">
                  <div className="cardGradient" style={{ background: voice.gradient }} />
                  <span className="cardEmoji">{voice.emoji}</span>
                </div>
                <div className="cardInfo">
                  <div className="cardName">{voice.label}</div>
                  <div className="cardDesc">{voice.description}</div>
                </div>
                <button
                  className="favBtn"
                  onClick={() => deleteCustomVoice(voice.id)}
                  title="Remover"
                  style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer", zIndex: 3 }}
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
