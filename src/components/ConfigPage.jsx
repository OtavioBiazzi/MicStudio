import React, { useState } from "react";
import {
  MicrophoneStage, Palette, Keyboard, Lightning, MicrophoneSlash,
  ArrowClockwise, FadersHorizontal, XCircle, MusicNotes, Record, ChartBar,
  SlidersHorizontal, DownloadSimple, UploadSimple, User
} from "@phosphor-icons/react";
import { Slider, deviceName } from "../utils";

export const colorPalettes = {
  purple: {
    label: "Violeta Cyber",
    primary: "#8B5CF6",
    hover: "#A78BFA",
    dim: "#6D42D9",
    glow: "rgba(139, 92, 246, 0.35)",
    soft: "rgba(139, 92, 246, 0.12)",
    bg: "rgba(139, 92, 246, 0.08)",
    borderHover: "rgba(139, 92, 246, 0.25)",
    borderActive: "rgba(139, 92, 246, 0.5)"
  },
  cyan: {
    label: "Ciano Neon",
    primary: "#00E5FF",
    hover: "#33EBFF",
    dim: "#00B8D4",
    glow: "rgba(0, 229, 255, 0.35)",
    soft: "rgba(0, 229, 255, 0.12)",
    bg: "rgba(0, 229, 255, 0.08)",
    borderHover: "rgba(0, 229, 255, 0.25)",
    borderActive: "rgba(0, 229, 255, 0.5)"
  },
  green: {
    label: "Esmeralda",
    primary: "#10B981",
    hover: "#34D399",
    dim: "#059669",
    glow: "rgba(16, 185, 129, 0.35)",
    soft: "rgba(16, 185, 129, 0.12)",
    bg: "rgba(16, 185, 129, 0.08)",
    borderHover: "rgba(16, 185, 129, 0.25)",
    borderActive: "rgba(16, 185, 129, 0.5)"
  },
  gold: {
    label: "Ouro Âmbar",
    primary: "#F59E0B",
    hover: "#FBBF24",
    dim: "#D97706",
    glow: "rgba(245, 158, 11, 0.35)",
    soft: "rgba(245, 158, 11, 0.12)",
    bg: "rgba(245, 158, 11, 0.08)",
    borderHover: "rgba(245, 158, 11, 0.25)",
    borderActive: "rgba(245, 158, 11, 0.5)"
  },
  red: {
    label: "Rubi Carmim",
    primary: "#EF4444",
    hover: "#F87171",
    dim: "#DC2626",
    glow: "rgba(239, 68, 68, 0.35)",
    soft: "rgba(239, 68, 68, 0.12)",
    bg: "rgba(239, 68, 68, 0.08)",
    borderHover: "rgba(239, 68, 68, 0.25)",
    borderActive: "rgba(239, 68, 68, 0.5)"
  },
  pink: {
    label: "Rosa Choque",
    primary: "#EC4899",
    hover: "#F472B6",
    dim: "#DB2777",
    glow: "rgba(236, 72, 153, 0.35)",
    soft: "rgba(236, 72, 153, 0.12)",
    bg: "rgba(236, 72, 153, 0.08)",
    borderHover: "rgba(236, 72, 153, 0.25)",
    borderActive: "rgba(236, 72, 153, 0.5)"
  }
};

export function ConfigPage({
  state,
  call,
  setToast,
  selectedRecordDevices,
  setSelectedRecordDevices,
  setPage,
  accentColor,
  setAccentColor,
  customAccentColor,
  setCustomAccentColor,
  appTheme,
  setAppTheme,
  updateEffects,
  prefFontSize,
  setPrefFontSize,
  prefGlow,
  setPrefGlow,
  prefRadius,
  setPrefRadius,
  prefGlass,
  setPrefGlass,
  prefGamerMode,
  setPrefGamerMode,
  prefDockOpacity,
  setPrefDockOpacity
}) {
  const [tab, setTab] = useState("audio");
  const [selectedTheme, setSelectedTheme] = useState(appTheme);
  const [selectedColor, setSelectedColor] = useState(accentColor);
  const [tempCustomColor, setTempCustomColor] = useState(customAccentColor);

  const handleSaveVisualSettings = () => {
    setAppTheme(selectedTheme);
    setAccentColor(selectedColor);
    setCustomAccentColor(tempCustomColor);
    localStorage.setItem("micfudiddo.theme", selectedTheme);
    localStorage.setItem("micfudiddo.accentColor", selectedColor);
    localStorage.setItem("micfudiddo.customAccentColor", tempCustomColor);
    setToast?.("Configurações visuais salvas com sucesso!");
  };

  return (
    <div>
      <div className="labHeader">
        <h2>⚙️ Configurações</h2>
        <p>Gerencie dispositivos, aparência, atalhos e manutenção</p>
      </div>

      <div className="config-layout">
        <div className="config-sidebar">
          <button
            className={`config-sidebar-btn ${tab === "audio" ? "active" : ""}`}
            onClick={() => setTab("audio")}
          >
            <MicrophoneStage size={18} weight="duotone" />
            <span>Áudio e Mic</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "aparencia" ? "active" : ""}`}
            onClick={() => setTab("aparencia")}
          >
            <Palette size={18} weight="duotone" />
            <span>Aparência</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "avancado" ? "active" : ""}`}
            onClick={() => setTab("avancado")}
          >
            <SlidersHorizontal size={18} weight="duotone" />
            <span>Avançado</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "atalhos" ? "active" : ""}`}
            onClick={() => setTab("atalhos")}
          >
            <Keyboard size={18} weight="duotone" />
            <span>Atalhos</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "manutencao" ? "active" : ""}`}
            onClick={() => setTab("manutencao")}
          >
            <Lightning size={18} weight="duotone" />
            <span>Manutenção</span>
          </button>
        </div>

        <div className="config-content" style={{ flex: 1 }}>
          {tab === "audio" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <MicrophoneStage size={18} />
                <span>Dispositivos de Entrada e Saída</span>
              </div>

              {!state.virtualCableDetected && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
                    <span>⚠️ Cabo Virtual Não Detectado!</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    O driver de cabo de áudio virtual (VB-CABLE) não foi encontrado no sistema. Para usar o voice changer e o soundboard no Discord, você precisa dele instalado.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11, background: "var(--danger)", textDecoration: "none", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}>
                      📥 Baixar VB-CABLE
                    </a>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <SelectField
                  label="Dispositivo de entrada"
                  value={state.selected?.input}
                  items={state.devices?.inputs || []}
                  onChange={(v) => call("/api/selection", { input: v })}
                />
                <SelectField
                  label="Dispositivo de saída (virtual)"
                  value={state.selected?.output}
                  items={state.devices?.outputs || []}
                  onChange={(v) => call("/api/selection", { output: v })}
                />
                <SelectField
                  label="Dispositivo de monitor"
                  value={state.selected?.monitor}
                  items={state.devices?.outputs || []}
                  onChange={(v) => call("/api/selection", { monitor: v })}
                  allowNone
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => call("/api/devices/refresh").then(() => setToast("Dispositivos atualizados!"))}>
                  <ArrowClockwise size={14} /> Atualizar dispositivos
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <MicrophoneSlash size={18} />
                  <span>Redução de Ruído (Noise Gate)</span>
                </div>
                <ToggleSetting
                  label="Ativar Noise Gate"
                  description="Impede a transmissão de ruídos de fundo quando você não está falando"
                  checked={state.controls?.effects?.noise_gate_enabled}
                  onChange={(v) => updateEffects({ noise_gate_enabled: v })}
                />
                {state.controls?.effects?.noise_gate_enabled && (
                  <div style={{ marginTop: 12 }}>
                    <Slider
                      label="Sensibilidade do Gate"
                      value={state.controls?.effects?.noise_gate_threshold * 100}
                      min={0}
                      max={40}
                      suffix="%"
                      onChange={(v) => updateEffects({ noise_gate_threshold: v / 100 })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                      Valores maiores silenciam ruídos mais altos, mas podem cortar palavras sussurradas.
                    </small>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <FadersHorizontal size={18} />
                  <span>Configurações Adicionais</span>
                </div>
                <ToggleSetting
                  label="Iniciar rota automaticamente"
                  description="Ativar rota de áudio virtual ao iniciar o MicFudido"
                  checked={state.settings?.autoStartVirtual}
                  onChange={(v) => call("/api/settings", { autoStartVirtual: v })}
                />
                <ToggleSetting
                  label="Restaurar microfone original"
                  description="Restaurar o microfone padrão do Windows ao fechar o app"
                  checked={state.settings?.restoreOnDisable}
                  onChange={(v) => call("/api/settings", { restoreOnDisable: v })}
                />
                {state.settings?.restoreOnDisable && (
                  <div className="selectField" style={{ marginTop: 12 }}>
                    <label>Microfone padrão ao fechar o app</label>
                    <select
                      value={state.settings?.defaultMicOnClose || "restore"}
                      onChange={(e) => call("/api/settings", { defaultMicOnClose: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                        outline: "none",
                        fontSize: 12
                      }}
                    >
                      <option value="restore">Restaurar microfone anterior (Recomendado)</option>
                      <option value="keep">Manter microfone atual</option>
                      <option value="choose">Escolher microfone ao fechar</option>
                      {(state.windowsCaptureEndpoints || []).map((ep) => (
                        <option key={ep.id} value={ep.id}>{ep.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <Slider
                    label="Volume máximo dos sons"
                    value={Number(state.settings?.maxSoundVolume ?? 1.0) * 100}
                    min={0}
                    max={200}
                    suffix="%"
                    onChange={(v) => call("/api/settings", { maxSoundVolume: String(v / 100) })}
                  />
                  <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                    Define um limite máximo global para o volume de reprodução de todos os sons do soundboard.
                  </small>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <XCircle size={18} />
                  <span>Fechamento do Aplicativo</span>
                </div>
                <ToggleSetting
                  label="Confirmar fechamento"
                  description="Exibir confirmação com opções ao tentar fechar o aplicativo"
                  checked={state.settings?.confirmClose !== false}
                  onChange={(v) => call("/api/settings", { confirmClose: v })}
                />
                <div className="selectField" style={{ marginTop: 12 }}>
                  <label>Ação padrão ao fechar o app</label>
                  <select
                    value={state.settings?.closeBehavior || "ask"}
                    onChange={(e) => call("/api/settings", { closeBehavior: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      outline: "none",
                      fontSize: 12
                    }}
                  >
                    <option value="ask">Perguntar toda vez (Padrão)</option>
                    <option value="tray">Minimizar para a bandeja / sistema</option>
                    <option value="quit">Encerrar o aplicativo totalmente</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === "aparencia" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Palette size={18} />
                <span>Personalização Visual</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Escolha a paleta de cores para os realces, neon e botões do MicFudido Studio:
              </p>

              <div className="palette-grid">
                {Object.entries(colorPalettes).map(([key, item]) => (
                  <button
                    key={key}
                    className={`palette-btn ${selectedColor === key ? "active" : ""}`}
                    style={{ "--palette-color": item.primary }}
                    onClick={() => setSelectedColor(key)}
                  >
                    <span className="palette-color-dot" style={{ backgroundColor: item.primary }} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                  </button>
                ))}
                <button
                  className={`palette-btn ${selectedColor === "custom" ? "active" : ""}`}
                  style={{ "--palette-color": tempCustomColor }}
                  onClick={() => setSelectedColor("custom")}
                >
                  <span className="palette-color-dot" style={{ backgroundColor: tempCustomColor }} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>Personalizada</span>
                </button>
              </div>

              {selectedColor === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, background: "var(--bg-input)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                  <label style={{ fontSize: 12, fontWeight: "bold", color: "var(--text-secondary)" }}>Escolha a cor personalizada:</label>
                  <input
                    type="color"
                    value={tempCustomColor}
                    onChange={(e) => setTempCustomColor(e.target.value)}
                    style={{ width: "42px", height: "26px", border: "none", borderRadius: "4px", background: "none", cursor: "pointer" }}
                  />
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>{tempCustomColor.toUpperCase()}</span>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tema da Interface</span>
                <div className="selectField" style={{ marginTop: 8 }}>
                  <label>Selecione o tema geral do aplicativo:</label>
                  <select value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value)}>
                    <option value="theme-cyberpunk">Cyberpunk Escuro (Padrão)</option>
                    <option value="theme-dracula">Dracula Vamp</option>
                    <option value="theme-vampire">Vampire Red</option>
                    <option value="theme-neon">Neon Green</option>
                    <option value="theme-synthwave">Synthwave Retrowave</option>
                  </select>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Configurações de Layout</span>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="selectField">
                    <label>Tamanho da Fonte da Interface</label>
                    <select value={prefFontSize} onChange={(e) => setPrefFontSize(e.target.value)}>
                      <option value="small">Pequeno (12px)</option>
                      <option value="normal">Normal (13px - Padrão)</option>
                      <option value="large">Grande (15px)</option>
                    </select>
                  </div>

                  <div className="selectField">
                    <label>Intensidade do Efeito Neon (Glow)</label>
                    <select value={prefGlow} onChange={(e) => setPrefGlow(e.target.value)}>
                      <option value="none">Desativado</option>
                      <option value="soft">Suave</option>
                      <option value="medium">Médio (Padrão)</option>
                      <option value="high">Intenso / Alto</option>
                    </select>
                  </div>

                  <div className="selectField">
                    <label>Estilo dos Cantos (Border Radius)</label>
                    <select value={prefRadius} onChange={(e) => setPrefRadius(e.target.value)}>
                      <option value="sharp">Reto (Cantos Pontudos)</option>
                      <option value="rounded">Arredondado (Padrão)</option>
                      <option value="soft">Suave (Bordas Arredondadas)</option>
                    </select>
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <Slider
                      label="Opacidade do Painel Flutuante"
                      value={prefDockOpacity * 100}
                      min={50}
                      max={100}
                      suffix="%"
                      onChange={(v) => setPrefDockOpacity(v / 100)}
                    />
                  </div>

                  <div style={{ marginTop: 4 }}>
                    <ToggleSetting
                      label="Efeito de Vidro (Glassmorphism)"
                      description="Aplica desfoque (blur) no fundo do painel flutuante"
                      checked={prefGlass}
                      onChange={(v) => setPrefGlass(v)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" onClick={handleSaveVisualSettings} style={{ padding: "8px 24px" }}>
                  Salvar
                </button>
              </div>
            </div>
          )}

          {tab === "avancado" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <FadersHorizontal size={18} />
                <span>Parâmetros de Áudio e Desempenho</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Ajuste os parâmetros avançados de processamento do servidor de áudio local e otimize o consumo de hardware.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
                <div className="selectField">
                  <label>Taxa de Amostragem Interna (Sample Rate)</label>
                  <select
                    value={state.sampleRate || 44100}
                    onChange={(e) => call("/api/settings", { sampleRate: Number(e.target.value) }).then(() => setToast?.("Taxa de amostragem alterada!"))}
                  >
                    <option value={44100}>44100 Hz (CD - Padrão)</option>
                    <option value={48000}>48000 Hz (Estúdio / Profissional)</option>
                  </select>
                </div>

                <div className="selectField">
                  <label>Tamanho do Buffer de Áudio (Latência)</label>
                  <select
                    value={state.settings?.bufferSize || 512}
                    onChange={(e) => call("/api/settings", { bufferSize: String(e.target.value) }).then(() => setToast?.("Tamanho do buffer alterado!"))}
                  >
                    <option value="128">128 frames (Latência ultra baixa - Exige CPU rápida)</option>
                    <option value="256">256 frames (Latência baixa - Recomendado)</option>
                    <option value="512">512 frames (Balanceado - Padrão)</option>
                    <option value="1024">1024 frames (Estável - Ideal para computadores lentos)</option>
                  </select>
                </div>

                <div className="selectField">
                  <label>Canais de Entrada do Microfone</label>
                  <select
                    value={state.settings?.inputChannels || "mono"}
                    onChange={(e) => call("/api/settings", { inputChannels: e.target.value }).then(() => setToast?.("Canais de entrada configurados!"))}
                  >
                    <option value="mono">Forçar canal monofônico (Recomendado)</option>
                    <option value="stereo">Estéreo nativo / Downmix</option>
                  </select>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 6 }}>
                  <ToggleSetting
                    label="Modo Gamer / Baixo Consumo CPU"
                    description="Desativa sombras neon, desfoques e transições pesadas para maximizar o FPS nos jogos."
                    checked={prefGamerMode}
                    onChange={(v) => setPrefGamerMode(v)}
                  />
                </div>
              </div>
            </div>
          )}

          {tab === "atalhos" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Keyboard size={18} />
                <span>Atalhos Globais do Sistema</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Configure atalhos globais de sistema para acionar funções rápidas mesmo com o aplicativo em segundo plano.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <HotkeyInput
                  label="Mutar Microfone"
                  value={state.settings?.shortcutMuteMic}
                  onChange={(val) => call("/api/settings", { shortcutMuteMic: val })}
                  onClear={() => call("/api/settings", { shortcutMuteMic: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Efeitos (Bypass)"
                  value={state.settings?.shortcutToggleBypass}
                  onChange={(val) => call("/api/settings", { shortcutToggleBypass: val })}
                  onClear={() => call("/api/settings", { shortcutToggleBypass: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Retorno do Soundboard"
                  value={state.settings?.shortcutToggleSoundboard}
                  onChange={(val) => call("/api/settings", { shortcutToggleSoundboard: val })}
                  onClear={() => call("/api/settings", { shortcutToggleSoundboard: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Voice Changer"
                  value={state.settings?.shortcutToggleVoiceChanger}
                  onChange={(val) => call("/api/settings", { shortcutToggleVoiceChanger: val })}
                  onClear={() => call("/api/settings", { shortcutToggleVoiceChanger: "" })}
                />
                <HotkeyInput
                  label="Gravar Voz (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordVoice}
                  onChange={(val) => call("/api/settings", { shortcutRecordVoice: val })}
                  onClear={() => call("/api/settings", { shortcutRecordVoice: "" })}
                />
                <HotkeyInput
                  label="Gravar Som do PC (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordPC}
                  onChange={(val) => call("/api/settings", { shortcutRecordPC: val })}
                  onClear={() => call("/api/settings", { shortcutRecordPC: "" })}
                />
                <HotkeyInput
                  label="Gravar Voz + Som do PC (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordCombo}
                  onChange={(val) => call("/api/settings", { shortcutRecordCombo: val })}
                  onClear={() => call("/api/settings", { shortcutRecordCombo: "" })}
                />
              </div>

              <div className="labCardTitle" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <MusicNotes size={18} />
                <span>Atalhos do Soundboard Cadastrados</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Para adicionar ou modificar um atalho de áudio, abra a aba Soundboard, selecione o som desejado e pressione as teclas no campo de atalho.
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {(state.sounds || []).filter((s) => s.shortcut).map((sound) => (
                  <div key={sound.id} className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="settingInfo">
                      <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{sound.name}</div>
                      <div className="settingDesc" style={{ fontSize: 11, color: "var(--text-muted)" }}>{sound.category || "Soundboard"}</div>
                    </div>
                    <div className="settingControl">
                      <span style={{ fontSize: 11, padding: "4px 10px", background: "var(--purple-soft)", border: "1px solid var(--purple)", borderRadius: 6, color: "var(--purple)", fontWeight: 800, textTransform: "uppercase" }}>
                        {sound.shortcut}
                      </span>
                    </div>
                  </div>
                ))}
                {!(state.sounds || []).some((s) => s.shortcut) && (
                  <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "32px 0", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)" }}>
                    Nenhum atalho configurado até o momento.
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "manutencao" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Lightning size={18} />
                <span>Manutenção do Sistema</span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "voice" }).then(() => setToast("Configurações de voz restauradas!"))}>
                  Restaurar voz padrão
                </button>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "effects" }).then(() => setToast("Efeitos de voz limpos!"))}>
                  Restaurar efeitos
                </button>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "soundboard" }).then(() => setToast("Sons restaurados!"))}>
                  Restaurar soundboard
                </button>
                <button className="btn btn-danger" style={{ justifyContent: "center" }} onClick={() => { if(confirm("Deseja realmente apagar todas as configurações e presets?")) call("/api/reset").then(() => setToast("Reset completo efetuado!")); }}>
                  Reset de fábrica completo
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <Lightning size={18} />
                  <span>Backup de Perfis e Configurações</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                  Salve todas as suas predefinições de som, vozes customizadas, favoritos e configurações visuais em um único arquivo de backup, ou redefina o seu perfil.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", fontSize: 11 }} onClick={() => {
                    const backup = {};
                    for (let i = 0; i < localStorage.length; i++) {
                      const key = localStorage.key(i);
                      if (key && (key.startsWith("micfudiddo.") || key === "personalizado_settings")) {
                        backup[key] = localStorage.getItem(key);
                      }
                    }
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
                    const dlAnchorElem = document.createElement('a');
                    dlAnchorElem.setAttribute("href", dataStr);
                    dlAnchorElem.setAttribute("download", `micfudiddo_backup_${Date.now()}.json`);
                    dlAnchorElem.click();
                    setToast("Backup do perfil exportado!");
                  }}>
                    📥 Exportar Perfil de Configurações
                  </button>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", fontSize: 11 }} onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".json";
                    input.onchange = async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const data = JSON.parse(text);
                        Object.entries(data).forEach(([key, val]) => {
                          localStorage.setItem(key, String(val));
                        });
                        setToast("Configurações importadas! Reiniciando...");
                        setTimeout(() => window.location.reload(), 1500);
                      } catch (err) {
                        setToast("Erro ao importar backup: " + err.message);
                      }
                    };
                    input.click();
                  }}>
                    📤 Importar Perfil de Configurações
                  </button>
                  <button className="btn btn-danger" style={{ fontSize: 11, background: "rgba(239,68,68,0.08)", border: "1px solid var(--danger)", color: "var(--danger)" }} onClick={() => {
                    if (confirm("Deseja realmente redefinir o seu perfil de usuário (nome, avatar, bio, readme) para o padrão?")) {
                      localStorage.removeItem("micfudiddo.profileName");
                      localStorage.removeItem("micfudiddo.profileSub");
                      localStorage.removeItem("micfudiddo.profileImage");
                      localStorage.removeItem("micfudiddo.profilePlan");
                      localStorage.removeItem("micfudiddo.profileBio");
                      localStorage.removeItem("micfudiddo.profileReadme");
                      localStorage.removeItem("micfudiddo.profileImagePosition");
                      setToast("Perfil redefinido! Recarregando...");
                      setTimeout(() => window.location.reload(), 1500);
                    }
                  }}>
                    👤 Redefinir Perfil do Usuário
                  </button>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <MusicNotes size={18} />
                  <span>Comportamento do Soundboard</span>
                </div>
                <ToggleSetting
                  label="Sobrepor reprodução de sons"
                  description="Permite tocar múltiplos sons simultaneamente no soundboard"
                  checked={state.settings?.allowMultipleSounds}
                  onChange={(v) => call("/api/settings", { allowMultipleSounds: v })}
                />
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 8 }}>
                  <Record size={18} />
                  <span>Fontes para Gravação de Som do PC</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                  Selecione os canais de áudio que deseja capturar ao clicar em "Gravar PC".
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(state.recordDevices || []).map((device) => (
                    <div key={device.index} className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="settingInfo">
                        <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{device.name}</div>
                        <div className="settingDesc" style={{ fontSize: 11, color: "var(--text-muted)" }}>{device.is_loopback ? "Loopback (Saída)" : "Entrada (Captura)"}</div>
                      </div>
                      <div className="settingControl">
                        <label className="toggleSwitch">
                          <input
                            type="checkbox"
                            checked={selectedRecordDevices.includes(device.index)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selectedRecordDevices, device.index]
                                : selectedRecordDevices.filter((i) => i !== device.index);
                              setSelectedRecordDevices(next);
                              call("/api/record/selection", { indexes: next });
                            }}
                          />
                          <span className="toggleTrack" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <ChartBar size={18} />
                  <span>Diagnósticos de Áudio</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <StatusLine label="Serviço de Processamento" value={state.running ? "ONLINE" : "OFFLINE"} active={state.running} />
                  <StatusLine label="Integração Virtual Windows" value={state.virtualMode ? "ONLINE" : "OFFLINE"} active={state.virtualMode} />
                  <StatusLine label="Hardware de Entrada (Mic)" value={deviceName(state.devices?.inputs, state.selected?.input)} />
                  <StatusLine label="Hardware de Saída (CABLE)" value={deviceName(state.devices?.outputs, state.selected?.output)} />
                  <StatusLine label="Monitor de Áudio Local" value={deviceName(state.devices?.outputs, state.selected?.monitor)} />
                  {state.sampleRate && <StatusLine label="Taxa de Amostragem do Driver" value={`${state.sampleRate} Hz`} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- HotkeyInput ---
export function HotkeyInput({ label, value, onChange, onClear }) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey) keys.push("Win");
    
    const key = e.key.toUpperCase();
    if (key !== "CONTROL" && key !== "SHIFT" && key !== "ALT" && key !== "META") {
      keys.push(key);
    }
    
    const nextVal = keys.join("+");
    if (nextVal) {
      onChange(nextVal);
      setIsRecording(false);
    }
  };

  return (
    <div className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div className="settingInfo">
        <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      </div>
      <div className="settingControl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn"
          style={{
            minWidth: 140,
            fontSize: 11,
            padding: "6px 12px",
            background: isRecording ? "var(--purple)" : "var(--bg-input)",
            border: isRecording ? "1px solid var(--purple-hover)" : "1px solid var(--border)",
            color: isRecording ? "#fff" : "var(--text)",
            cursor: "pointer",
            fontWeight: 800,
            textTransform: "uppercase",
            borderRadius: 6
          }}
          onClick={() => setIsRecording(!isRecording)}
          onKeyDown={isRecording ? handleKeyDown : undefined}
          tabIndex={0}
        >
          {isRecording ? "Pressione as teclas..." : (value || "Clique para gravar")}
        </button>
        {value && (
          <button
            className="btn btn-ghost"
            onClick={onClear}
            style={{ padding: "4px 8px", color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 11 }}
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

// --- ToggleSetting ---
export function ToggleSetting({ label, description, checked, onChange }) {
  return (
    <div className="settingItem">
      <div className="settingInfo">
        <div className="settingLabel">{label}</div>
        {description && <div className="settingDesc">{description}</div>}
      </div>
      <div className="settingControl">
        <label className="toggleSwitch">
          <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="toggleTrack" />
        </label>
      </div>
    </div>
  );
}

// --- StatusLine ---
export function StatusLine({ label, value, active }) {
  return (
    <div className="settingItem">
      <div className="settingInfo">
        <div className="settingLabel">{label}</div>
      </div>
      <div className="settingControl">
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: active ? "var(--green)" : "var(--text-muted)"
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// --- SelectField ---
export function SelectField({ label, value, items, onChange, allowNone }) {
  return (
    <div className="selectField">
      <label>{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {allowNone && <option value="">Nenhum</option>}
        {(items || []).map((item) => (
          <option key={item.index} value={item.index}>{item.name}</option>
        ))}
      </select>
    </div>
  );
}
