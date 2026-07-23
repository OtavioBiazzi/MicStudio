import React, { useState } from "react";
import {
  MicrophoneStage, Palette, Keyboard, Lightning, MicrophoneSlash,
  ArrowClockwise, FadersHorizontal, XCircle, MusicNotes, Record, ChartBar,
  SlidersHorizontal, DownloadSimple, UploadSimple, User, ChatText, SpeakerHigh, CaretDown, CaretUp
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
  const [recordDevicesExpanded, setRecordDevicesExpanded] = useState(false);

  const storageMB = state.storageUsed ? state.storageUsed / (1024 * 1024) : 0;
  const storageLimitMB = Number(state.settings?.maxSoundboardStorage ?? 0);

  const resetTabSettings = async (tabName) => {
    const tabNamesMap = {
      audio: "Áudio e Dispositivos",
      tts: "Voz e TTS",
      soundboard: "Soundboard e Clipes",
      shortcuts: "Atalhos Globais",
      aparencia: "Personalização",
      manutencao: "Sistema e Manutenção"
    };
    
    const friendlyName = tabNamesMap[tabName] || tabName;
    if (!confirm(`Deseja realmente redefinir as configurações da aba "${friendlyName}" para os padrões?`)) {
      return;
    }
    
    try {
      if (tabName === "audio") {
        await call("/api/settings", {
          autoStartVirtual: true,
          restoreOnDisable: true,
          defaultMicOnClose: "restore",
          audioSampleRate: "48000",
          audioBufferSize: "1024",
          inputChannels: "mono"
        });
        setToast("Configurações de Áudio redefinidas para o padrão!");
      } else if (tabName === "tts") {
        await call("/api/settings", {
          showTtsWidgetSpeed: true,
          showTtsWidgetVolume: true,
          unlimitedTts: false,
          ttsWidgetOpacity: 82,
          keepTtsTextAfterSpeak: false,
          ttsVolume: 100
        });
        localStorage.setItem("tts_default_voice", "pt-BR-AntonioNeural");
        localStorage.setItem("tts_default_rate", "0");
        setToast("Configurações de TTS redefinidas para o padrão!");
      } else if (tabName === "soundboard") {
        await call("/api/settings", {
          allowMultipleSounds: false,
          onlinePlaybackRoute: "both",
          maxSoundVolume: "1.0",
          clipEnabled: false,
          clipDuration: "30",
          clipSource: "both",
          maxSoundboardStorage: 0,
          importDestinationMode: "ask",
          importDestinationTabs: ["Todos"],
          rememberLastImportTabs: true,
          autoOrganizeBySource: false
        });
        setToast("Configurações de Soundboard redefinidas para o padrão!");
      } else if (tabName === "shortcuts") {
        await call("/api/settings", {
          shortcutMuteMic: "",
          shortcutToggleBypass: "",
          shortcutToggleSoundboard: "",
          shortcutToggleVoiceChanger: "",
          shortcutRecordVoice: "",
          shortcutRecordPC: "",
          shortcutRecordCombo: "",
          shortcutCommandGlitch: "Ctrl+Alt+G",
          shortcutClip: "",
          shortcutFocusTtsWidget: ""
        });
        setToast("Atalhos globais limpos e redefinidos!");
      } else if (tabName === "aparencia") {
        setAccentColor("purple");
        setCustomAccentColor("");
        setAppTheme("theme-cyberpunk");
        setPrefFontSize("normal");
        setPrefGlow("true");
        setPrefRadius("normal");
        setPrefGlass("normal");
        setPrefGamerMode("false");
        setPrefDockOpacity("80");
        setToast("Aparência e temas restaurados para o padrão!");
      } else if (tabName === "manutencao") {
        await call("/api/settings", {
          minimizeToTray: true,
          confirmClose: true,
          closeBehavior: "ask"
        });
        setToast("Configurações de Manutenção e Sistema redefinidas!");
      }
    } catch (err) {
      setToast("Erro ao redefinir configurações: " + err.message);
    }
  };

  return (
    <div>
      <div className="labHeader">
        <h2>⚙️ Configurações</h2>
        <p>Gerencie dispositivos, atalhos, aparência e manutenção do MicFudiddo Studio</p>
      </div>

      <div className="config-layout">
        {/* Navigation Sidebar */}
        <div className="config-sidebar">
          <button
            className={`config-sidebar-btn ${tab === "audio" ? "active" : ""}`}
            onClick={() => setTab("audio")}
          >
            <MicrophoneStage size={18} weight="duotone" />
            <span>Áudio e Dispositivos</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "tts" ? "active" : ""}`}
            onClick={() => setTab("tts")}
          >
            <ChatText size={18} weight="duotone" />
            <span>Voz e TTS</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "soundboard" ? "active" : ""}`}
            onClick={() => setTab("soundboard")}
          >
            <MusicNotes size={18} weight="duotone" />
            <span>Soundboard e Clipes</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "atalhos" ? "active" : ""}`}
            onClick={() => setTab("atalhos")}
          >
            <Keyboard size={18} weight="duotone" />
            <span>Atalhos Globais</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "aparencia" ? "active" : ""}`}
            onClick={() => setTab("aparencia")}
          >
            <Palette size={18} weight="duotone" />
            <span>Personalização</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "manutencao" ? "active" : ""}`}
            onClick={() => setTab("manutencao")}
          >
            <Lightning size={18} weight="duotone" />
            <span>Sistema e Manutenção</span>
          </button>
        </div>

        {/* Configurations Content */}
        <div className="config-content" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          
          {/* TAB 1: AUDIO AND DEVICES */}
          {tab === "audio" && (
            <>
              {/* Card 1: Main Audio Hardware */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <MicrophoneStage size={18} />
                  <span>Dispositivos de Entrada e Saída</span>
                </div>
                <div className="settingCardDesc">
                  Selecione os dispositivos físicos de áudio para capturar o microfone e transmitir para as salas virtuais.
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

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <SelectField
                    label="Microfone (Dispositivo de Entrada)"
                    value={state.selected?.input}
                    items={state.devices?.inputs || []}
                    onChange={(v) => call("/api/selection", { input: v })}
                  />
                  <SelectField
                    label="Cabo Virtual (VB-CABLE / Saída de Áudio)"
                    value={state.selected?.output}
                    items={state.devices?.outputs || []}
                    onChange={(v) => call("/api/selection", { output: v })}
                  />
                  <SelectField
                    label="Fone de Ouvido / Auto-falante (Para você se ouvir / Monitoramento)"
                    value={state.selected?.monitor}
                    items={state.devices?.outputs || []}
                    onChange={(v) => call("/api/selection", { monitor: v })}
                    allowNone
                  />
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)" }} onClick={() => call("/api/devices/refresh").then(() => setToast("Dispositivos atualizados!"))}>
                    <ArrowClockwise size={14} /> Atualizar lista de dispositivos
                  </button>
                </div>
              </div>

              {/* Card 2: Noise Gate */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <MicrophoneSlash size={18} />
                  <span>Redução de Ruído (Noise Gate)</span>
                </div>
                <div className="settingCardDesc">
                  Filtre o áudio de entrada para impedir a transmissão de ruídos de teclado, ventilador ou de fundo quando você estiver calado.
                </div>
                
                <ToggleSetting
                  label="Ativar Noise Gate"
                  description="Silenciar microfone dinamicamente quando a captação estiver abaixo do limite definido"
                  checked={state.controls?.effects?.noise_gate_enabled}
                  onChange={(v) => updateEffects({ noise_gate_enabled: v })}
                />
                
                {state.controls?.effects?.noise_gate_enabled && (
                  <div style={{ marginTop: 4 }}>
                    <Slider
                      label="Sensibilidade do Gate"
                      value={state.controls?.effects?.noise_gate_threshold * 100}
                      min={0}
                      max={40}
                      suffix="%"
                      onChange={(v) => updateEffects({ noise_gate_threshold: v / 100 })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Valores maiores barram barulhos mais altos, mas podem mascarar sussurros ou finais de frases.
                    </small>
                  </div>
                )}
              </div>

              {/* Card 3: Advanced Audio Parameters */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <FadersHorizontal size={18} />
                  <span>Parâmetros Avançados do Driver</span>
                </div>
                <div className="settingCardDesc">
                  Configure as regras técnicas de processamento de áudio interno. (Modificar apenas se houver cliques ou lags).
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="selectField">
                    <label>Taxa de Amostragem Interna (Sample Rate)</label>
                    <select
                      value={state.settings?.audioSampleRate || "auto"}
                      onChange={(e) => call("/api/settings", { audioSampleRate: e.target.value }).then(() => setToast?.("Taxa de amostragem alterada!"))}
                    >
                      <option value={44100}>44100 Hz (CD - Padrão)</option>
                      <option value={48000}>48000 Hz (Estúdio / Profissional)</option>
                    </select>
                  </div>

                  <div className="selectField">
                    <label>Tamanho do Buffer de Áudio (Latência)</label>
                    <select
                      value={state.settings?.audioBufferSize || "1024"}
                      onChange={(e) => call("/api/settings", { audioBufferSize: String(e.target.value) }).then(() => setToast?.("Tamanho do buffer alterado!"))}
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
                </div>
              </div>
            </>
          )}

          {/* TAB 2: VOICE AND TTS */}
          {tab === "tts" && (
            <>
              {/* Card 1: TTS Widget */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <SlidersHorizontal size={18} />
                  <span>Comportamento do Widget TTS Flutuante</span>
                </div>
                <div className="settingCardDesc">
                  Configure o design, a exibição e os atalhos para a janela flutuante que fica sobreposta aos seus jogos.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <ToggleSetting
                    label="Mostrar velocidade no Widget TTS"
                    description="Exibir controle de velocidade de fala (-50% a +50%) diretamente no painel flutuante"
                    checked={state.settings?.showTtsWidgetSpeed !== false}
                    onChange={(v) => call("/api/settings", { showTtsWidgetSpeed: v })}
                  />

                  <ToggleSetting
                    label="Mostrar volume no Widget TTS"
                    description="Exibir controle de volume de fala (0% a 200%) diretamente no painel flutuante"
                    checked={state.settings?.showTtsWidgetVolume !== false}
                    onChange={(v) => call("/api/settings", { showTtsWidgetVolume: v })}
                  />

                  <div style={{ padding: "6px 0" }}>
                    <Slider
                      label="Opacidade do Widget TTS"
                      value={Number(state.settings?.ttsWidgetOpacity ?? 82)}
                      min={10}
                      max={100}
                      suffix="%"
                      onChange={(v) => call("/api/settings", { ttsWidgetOpacity: v })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Define a opacidade do fundo (glassmorphic blur) do widget flutuante (padrão: 82%).
                    </small>
                  </div>

                  <HotkeyInput
                    label="Atalho para Focar Digitação"
                    value={state.settings?.shortcutFocusTtsWidget}
                    onChange={(val) => call("/api/settings", { shortcutFocusTtsWidget: val })}
                    onClear={() => call("/api/settings", { shortcutFocusTtsWidget: "" })}
                  />
                  <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: -6 }}>
                    Combinação global que abre o Widget TTS (se fechado) e foca/seleciona o campo de digitação para você falar rapidamente.
                  </small>
                </div>
              </div>

              {/* Card 2: TTS Engine Options */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <User size={18} />
                  <span>Configurações da Síntese de Voz (TTS)</span>
                </div>
                <div className="settingCardDesc">
                  Ajustes para a conversão de texto para voz (Text-to-Speech) integrada.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <ToggleSetting
                    label="Remover limite de caracteres"
                    description="Permite digitar blocos de texto maiores que 10.000 caracteres no TTS (pode demorar para processar)"
                    checked={state.settings?.unlimitedTts === true}
                    onChange={(v) => call("/api/settings", { unlimitedTts: v })}
                  />

                  <ToggleSetting
                    label="Manter texto após falar no Widget TTS"
                    description="Mantém o texto digitado na barra rápida/widget após enviar a fala (o modal padrão de TTS sempre mantém o texto)"
                    checked={state.settings?.keepTtsTextAfterSpeak === true}
                    onChange={(v) => call("/api/settings", { keepTtsTextAfterSpeak: v })}
                  />

                  <div style={{ padding: "6px 0", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <Slider
                      label="Volume padrão da voz do TTS"
                      value={Number(state.settings?.ttsVolume ?? 100)}
                      min={0}
                      max={200}
                      suffix="%"
                      onChange={(v) => call("/api/settings", { ttsVolume: v })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Define a altura/volume padrão em que a voz sintetizada será reproduzida (padrão: 100%).
                    </small>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: SOUNDBOARD AND RECORDING */}
          {tab === "soundboard" && (
            <>
              {/* Card 1: Playback Behavior */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <MusicNotes size={18} />
                  <span>Reprodução do Soundboard</span>
                </div>
                <div className="settingCardDesc">
                  Configure limites e comportamento geral do mixer de sons.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <ToggleSetting
                    label="Sobrepor reprodução de sons"
                    description="Permite que múltiplos áudios sejam executados simultaneamente de forma sobreposta"
                    checked={state.settings?.allowMultipleSounds}
                    onChange={(v) => call("/api/settings", { allowMultipleSounds: v })}
                  />

                  <div style={{ padding: "6px 0" }}>
                    <Slider
                      label="Volume máximo global de sons"
                      value={Number(state.settings?.maxSoundVolume ?? 1.0) * 100}
                      min={0}
                      max={200}
                      suffix="%"
                      onChange={(v) => call("/api/settings", { maxSoundVolume: String(v / 100) })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Teto máximo de volume permitido para todos os sons do Soundboard (padrão: 100%).
                    </small>
                  </div>
                  <div style={{ padding: "6px 0" }}>
                    <Slider
                      label="Volume das prévias do Explorar Sons"
                      value={Number(state.settings?.onlinePreviewVolume ?? 0.25) * 100}
                      min={0}
                      max={100}
                      suffix="%"
                      onChange={(v) => call("/api/settings", { onlinePreviewVolume: String(v / 100) })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                      Controla somente o botão de ouvir prévias na biblioteca online; não altera sons importados.
                    </small>
                  </div>
                </div>
              </div>

              <div className="settingCard">
                <div className="settingCardTitle">
                  <DownloadSimple size={18} />
                  <span>Destino de Downloads e Importacoes</span>
                </div>
                <div className="settingCardDesc">
                  Defina como o app escolhe as abas onde novos audios aparecem.
                </div>

                <div className="selectField">
                  <label>Comportamento padrao</label>
                  <select
                    value={state.settings?.importDestinationMode || "ask"}
                    onChange={(e) => call("/api/settings", { importDestinationMode: e.target.value })}
                  >
                    <option value="ask">Sempre perguntar antes de baixar/importar</option>
                    <option value="todos">Salvar automaticamente apenas em Todos</option>
                    <option value="auto_tabs">Salvar automaticamente nas abas escolhidas abaixo</option>
                    <option value="remember_last">Lembrar a ultima escolha usada</option>
                    <option value="source">Organizar automaticamente por origem</option>
                  </select>
                </div>

                <ToggleSetting
                  label="Lembrar ultima escolha de abas"
                  description="Atualiza o destino padrao quando voce confirma uma importacao."
                  checked={state.settings?.rememberLastImportTabs !== false}
                  onChange={(v) => call("/api/settings", { rememberLastImportTabs: v })}
                />

                <ToggleSetting
                  label="Adicionar aba por origem automaticamente"
                  description="Inclui abas como YouTube, TikTok ou Importados do PC junto do destino escolhido."
                  checked={state.settings?.autoOrganizeBySource === true}
                  onChange={(v) => call("/api/settings", { autoOrganizeBySource: v })}
                />
              </div>

              {/* Card 2: Clipping Retroativo */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <Record size={18} />
                  <span>Gravação de Clipes Retroativos (Clipping)</span>
                </div>
                <div className="settingCardDesc">
                  Grave os últimos segundos ocorridos da sua voz ou som do PC a qualquer momento apertando um atalho global.
                </div>

                <ToggleSetting
                  label="Ativar Buffer de Clipes (Clipping)"
                  description="Mantém o buffer circular de áudio em segundo plano na memória RAM"
                  checked={state.settings?.clipEnabled}
                  onChange={(v) => call("/api/settings", { clipEnabled: v })}
                />

                {state.settings?.clipEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
                    <div className="selectField">
                      <label>Fonte de Áudio do Clipe</label>
                      <select
                        value={state.settings?.clipSource ?? "both"}
                        onChange={(e) => call("/api/settings", { clipSource: e.target.value })}
                      >
                        <option value="both">Voz + Som do PC (Os dois em canais separados)</option>
                        <option value="voice">Apenas Voz (Grava só o seu microfone)</option>
                        <option value="pc">Apenas Som do PC (Grava só o som dos jogos/aplicativos)</option>
                      </select>
                    </div>

                    <div>
                      <Slider
                        label="Duração do Clipe"
                        value={Number(state.settings?.clipDuration ?? 30)}
                        min={1}
                        max={60}
                        suffix="s"
                        onChange={(v) => call("/api/settings", { clipDuration: String(v) })}
                      />
                      <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                        Define quantos segundos serão capturados retroativamente ao salvar o arquivo (máx: 60s).
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: Storage and Channels */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <ChartBar size={18} />
                  <span>Canais do PC e Armazenamento em Disco</span>
                </div>
                <div className="settingCardDesc">
                  Selecione as saídas de aplicativos e verifique a quantidade de armazenamento consumida no disco.
                </div>

                {/* Storage Linear Progress Bar */}
                <div className="disk-usage-container">
                  <div className="disk-usage-info">
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>Espaço do Soundboard:</span>
                    <span style={{ fontWeight: 700, color: storageLimitMB > 0 && storageMB >= storageLimitMB ? "var(--danger)" : "var(--purple)" }}>
                      {storageMB.toFixed(2)} MB{storageLimitMB > 0 ? ` / ${storageLimitMB} MB` : " (Sem limite)"}
                    </span>
                  </div>
                  {storageLimitMB > 0 && (
                    <div className="disk-usage-bar-bg">
                      <div className="disk-usage-bar-fill" style={{ width: `${Math.min((storageMB / storageLimitMB) * 100, 100)}%` }} />
                    </div>
                  )}
                </div>

                <div style={{ padding: "6px 0" }}>
                  <Slider
                    label="Limite de armazenamento do Soundboard"
                    value={Number(state.settings?.maxSoundboardStorage ?? 0)}
                    min={0}
                    max={5000}
                    suffix=" MB"
                    onChange={(v) => call("/api/settings", { maxSoundboardStorage: v })}
                  />
                  <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 6 }}>
                    Defina o limite máximo em MB para os sons do Soundboard. Coloque 0 para sem limite.
                  </small>
                </div>

                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ width: "100%", justifyContent: "space-between", border: "1px solid var(--border)", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}
                    onClick={() => setRecordDevicesExpanded(!recordDevicesExpanded)}
                  >
                    <span>Capturar saídas de áudio do Windows ({(state.recordDevices || []).length} dispositivos)</span>
                    {recordDevicesExpanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                  </button>
                  
                  {recordDevicesExpanded && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
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
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 4: GLOBAL HOTKEYS */}
          {tab === "atalhos" && (
            <>
              {/* Card 1: App Hotkeys */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <Keyboard size={18} />
                  <span>Atalhos Globais do Sistema</span>
                </div>
                <div className="settingCardDesc">
                  Configure atalhos que funcionam de dentro de qualquer jogo ou aplicação em segundo plano.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                    label="Disparar Glitch Sob Comando"
                    value={state.settings?.shortcutCommandGlitch}
                    onChange={(val) => {
                      call("/api/settings", { shortcutCommandGlitch: val });
                      updateEffects({ time_glitch_shortcut: val });
                    }}
                    onClear={() => {
                      call("/api/settings", { shortcutCommandGlitch: "" });
                      updateEffects({ time_glitch_shortcut: "" });
                    }}
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
                  <HotkeyInput
                    label="Focar Digitação (Widget TTS)"
                    value={state.settings?.shortcutFocusTtsWidget}
                    onChange={(val) => call("/api/settings", { shortcutFocusTtsWidget: val })}
                    onClear={() => call("/api/settings", { shortcutFocusTtsWidget: "" })}
                  />
                  {state.settings?.clipEnabled && (
                    <HotkeyInput
                      label="Gerar Clipe (Salvar últimos segundos)"
                      value={state.settings?.shortcutClip}
                      onChange={(val) => call("/api/settings", { shortcutClip: val })}
                      onClear={() => call("/api/settings", { shortcutClip: "" })}
                    />
                  )}
                </div>
              </div>

              {/* Card 2: Soundboard Shortcuts */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <MusicNotes size={18} />
                  <span>Atalhos Registrados do Soundboard</span>
                </div>
                <div className="settingCardDesc">
                  Para alterar ou definir um atalho de áudio, acesse a aba Soundboard, selecione o som e grave a tecla no card de edição.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                    <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "24px 0", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)", fontSize: 12 }}>
                      Nenhum atalho configurado para áudios até agora.
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 5: APPEARANCE AND THEMING */}
          {tab === "aparencia" && (
            <>
              {/* Card 1: Colors and Theme (Auto-saved) */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <Palette size={18} />
                  <span>Temas e Paleta de Cores (Destaque)</span>
                </div>
                <div className="settingCardDesc">
                  Escolha o visual geral da interface. Suas alterações são aplicadas e salvas na hora em todo o aplicativo!
                </div>

                <div className="palette-grid" style={{ marginBottom: 6 }}>
                  {Object.entries(colorPalettes).map(([key, item]) => (
                    <button
                      key={key}
                      className={`palette-btn ${accentColor === key ? "active" : ""}`}
                      style={{ "--palette-color": item.primary }}
                      onClick={() => setAccentColor(key)}
                    >
                      <span className="palette-color-dot" style={{ backgroundColor: item.primary }} />
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                    </button>
                  ))}
                  <button
                    className={`palette-btn ${accentColor === "custom" ? "active" : ""}`}
                    style={{ "--palette-color": customAccentColor }}
                    onClick={() => setAccentColor("custom")}
                  >
                    <span className="palette-color-dot" style={{ backgroundColor: customAccentColor }} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Personalizada</span>
                  </button>
                </div>

                {accentColor === "custom" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--bg-input)", padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                    <label style={{ fontSize: 12, fontWeight: "bold", color: "var(--text-secondary)" }}>Escolha a cor personalizada:</label>
                    <input
                      type="color"
                      value={customAccentColor}
                      onChange={(e) => setCustomAccentColor(e.target.value)}
                      style={{ width: "42px", height: "26px", border: "none", borderRadius: "4px", background: "none", cursor: "pointer" }}
                    />
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text)" }}>{customAccentColor.toUpperCase()}</span>
                  </div>
                )}

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                  <div className="selectField">
                    <label>Selecione o tema geral do aplicativo:</label>
                    <select value={appTheme} onChange={(e) => setAppTheme(e.target.value)}>
                      <option value="theme-cyberpunk">Cyberpunk Escuro (Padrão)</option>
                      <option value="theme-dracula">Dracula Vamp</option>
                      <option value="theme-vampire">Vampire Red</option>
                      <option value="theme-neon">Neon Green</option>
                      <option value="theme-synthwave">Synthwave Retrowave</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card 2: Layout Tuning (Auto-saved) */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <SlidersHorizontal size={18} />
                  <span>Ajustes de Renderização e Layout</span>
                </div>
                <div className="settingCardDesc">
                  Adapte a densidade, intensidade e os efeitos da tela de acordo com a sua preferência.
                </div>

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
                      description="Aplica desfoque translúcido (backdrop-filter: blur) no fundo dos painéis e docks"
                      checked={prefGlass}
                      onChange={(v) => setPrefGlass(v)}
                    />
                  </div>

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 4 }}>
                    <ToggleSetting
                      label="Modo Gamer / Otimização de CPU"
                      description="Desativa sombras neon dinâmicas e transições complexas para reduzir o uso do hardware durante jogos."
                      checked={prefGamerMode}
                      onChange={(v) => setPrefGamerMode(v)}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 6: MAINTENANCE AND LIFECYCLE */}
          {tab === "manutencao" && (
            <>
              {/* Card 1: Initialization & Closing */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <XCircle size={18} />
                  <span>Inicialização e Fechamento</span>
                </div>
                <div className="settingCardDesc">
                  Configure o comportamento do MicFudiddo ao ser aberto ou quando você clicar para fechar a tela.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <ToggleSetting
                    label="Iniciar rota automaticamente"
                    description="Ativa a rota de áudio virtual automaticamente ao inicializar o aplicativo"
                    checked={state.settings?.autoStartVirtual}
                    onChange={(v) => call("/api/settings", { autoStartVirtual: v })}
                  />

                  <ToggleSetting
                    label="Salvar modificações de cada voz"
                    description="Mantém seus ajustes quando você sai e volta para uma voz. Desative para sempre reabrir o preset original."
                    checked={state.settings?.voiceEditPersistence !== "reset"}
                    onChange={(v) => call("/api/settings", { voiceEditPersistence: v ? "save" : "reset" })}
                  />

                  <ToggleSetting
                    label="Restaurar microfone original"
                    description="Redefine o microfone padrão do Windows ao fechar o app para que você não precise alterar manualmente"
                    checked={state.settings?.restoreOnDisable}
                    onChange={(v) => call("/api/settings", { restoreOnDisable: v })}
                  />

                  {state.settings?.restoreOnDisable && (
                    <div className="selectField">
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

                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
                    <ToggleSetting
                      label="Confirmar fechamento"
                      description="Exibe caixa de diálogo confirmando se deseja ir para a bandeja ou fechar o app"
                      checked={state.settings?.confirmClose !== false}
                      onChange={(v) => call("/api/settings", { confirmClose: v })}
                    />
                  </div>

                  <div className="selectField">
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

              {/* Card 2: Profiles & Backups */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <Lightning size={18} />
                  <span>Backup de Perfis e Configurações</span>
                </div>
                <div className="settingCardDesc">
                  Exporte e importe suas predefinições de som, vozes customizadas, favoritos e regras visuais em arquivos locais.
                </div>

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
                    📥 Exportar Configurações
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
                    📤 Importar Configurações
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
                    👤 Redefinir Cadastro de Perfil
                  </button>
                </div>
              </div>

              {/* Card 3: Database Factory Reset */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <Lightning size={18} />
                  <span>Limpeza e Restauração de Fábrica</span>
                </div>
                <div className="settingCardDesc">
                  Redefina as tabelas internas do banco de dados para os valores padrão de fábrica caso note instabilidades.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "voice" }).then(() => setToast("Configurações de voz restauradas!"))}>
                    Restaurar vozes padrão
                  </button>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "effects" }).then(() => setToast("Efeitos de voz limpos!"))}>
                    Restaurar efeitos padrão
                  </button>
                  <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "soundboard" }).then(() => setToast("Sons do soundboard restaurados!"))}>
                    Restaurar sons padrão
                  </button>
                  <button className="btn btn-danger" style={{ justifyContent: "center" }} onClick={() => { if(confirm("Deseja realmente apagar todas as configurações, sons e presets?")) call("/api/reset").then(() => setToast("Reset completo efetuado!")); }}>
                    Redefinir tudo de fábrica
                  </button>
                </div>
              </div>

              {/* Card 4: Audio Diagnostics */}
              <div className="settingCard">
                <div className="settingCardTitle">
                  <ChartBar size={18} />
                  <span>Diagnósticos de Áudio em Tempo Real</span>
                </div>
                <div className="settingCardDesc">
                  Verifique o estado de conexão com os serviços internos e dispositivos ativos.
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <StatusLine label="Serviço de Processamento" value={state.running ? "ONLINE" : "OFFLINE"} active={state.running} />
                  <StatusLine label="Integração Virtual Windows" value={state.virtualMode ? "ONLINE" : "OFFLINE"} active={state.virtualMode} />
                  <StatusLine label="Hardware de Entrada (Mic)" value={deviceName(state.devices?.inputs, state.selected?.input)} />
                  <StatusLine label="Hardware de Saída (CABLE)" value={deviceName(state.devices?.outputs, state.selected?.output)} />
                  <StatusLine label="Monitor de Áudio Local" value={deviceName(state.devices?.outputs, state.selected?.monitor)} />
                  {state.sampleRate && <StatusLine label="Taxa de Amostragem do Driver" value={`${state.sampleRate} Hz`} />}
                </div>
              </div>
            </>
          )}
          {/* Reset Tab Button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <button
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                gap: 6
              }}
              onClick={() => resetTabSettings(tab)}
            >
              🔄 Redefinir Configurações desta Aba
            </button>
          </div>

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
    const isModifier = key === "CONTROL" || key === "SHIFT" || key === "ALT" || key === "META";
    
    if (!isModifier) {
      let keyName = key;
      if (keyName === " ") keyName = "Space";
      else if (keyName === "ARROWUP") keyName = "Up";
      else if (keyName === "ARROWDOWN") keyName = "Down";
      else if (keyName === "ARROWLEFT") keyName = "Left";
      else if (keyName === "ARROWRIGHT") keyName = "Right";
      else {
        if (keyName.length > 1) {
          keyName = keyName.charAt(0) + keyName.slice(1).toLowerCase();
        }
      }
      keys.push(keyName);
      
      const nextVal = keys.join("+");
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
