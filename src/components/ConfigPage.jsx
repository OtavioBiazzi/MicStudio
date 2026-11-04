import React, { useMemo, useState } from "react";
import {
  MicrophoneStage, Palette, Keyboard, MicrophoneSlash, ArrowClockwise, FadersHorizontal, MusicNotes, Record,
  ChartBar, SlidersHorizontal, DownloadSimple, UploadSimple, ChatText, CaretDown, GearSix, Wrench,
  Copy, Warning, CheckCircle, WaveTriangle
} from "@phosphor-icons/react";
import { Slider, deviceName } from "../utils";
import { buildReport } from "../audioChecks.js";

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

const DEFAULT_CUSTOM_ACCENT = "#8B5CF6";

// ---------------------------------------------------------------------------
// Blocos de montagem (todas as telas usam os mesmos, para ficar tudo consistente)
// ---------------------------------------------------------------------------

function Section({ icon: Icon, title, desc, children, advanced = false, danger = false }) {
  const header = (
    <>
      <div className="cfg-section-title">
        {Icon && <Icon size={18} weight="duotone" />}
        <span>{title}</span>
        {advanced && <em className="cfg-badge">Avançado</em>}
      </div>
      {desc && <p className="cfg-section-desc">{desc}</p>}
    </>
  );
  if (advanced) {
    return (
      <details className={`cfg-section advanced ${danger ? "danger" : ""}`}>
        <summary>
          <div className="cfg-summary-text">{header}</div>
          <CaretDown size={16} className="cfg-caret" />
        </summary>
        <div className="cfg-section-body">{children}</div>
      </details>
    );
  }
  return (
    <section className={`cfg-section ${danger ? "danger" : ""}`}>
      <div className="cfg-section-head">{header}</div>
      <div className="cfg-section-body">{children}</div>
    </section>
  );
}

function Row({ label, desc, children, stack = false }) {
  return (
    <div className={`cfg-row ${stack ? "stack" : ""}`}>
      <div className="cfg-row-text">
        <div className="cfg-row-label">{label}</div>
        {desc && <div className="cfg-row-desc">{desc}</div>}
      </div>
      <div className="cfg-row-control">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="toggleSwitch" aria-label={label}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggleTrack" />
    </label>
  );
}

function SwitchRow({ label, desc, checked, onChange }) {
  return (
    <Row label={label} desc={desc}>
      <Switch checked={checked} onChange={onChange} label={label} />
    </Row>
  );
}

function SelectRow({ label, desc, value, onChange, options }) {
  return (
    <Row label={label} desc={desc}>
      <select className="cfg-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </Row>
  );
}

function SliderRow({ label, desc, value, min, max, step, suffix, onChange }) {
  return (
    <div className="cfg-slider">
      <Slider label={label} value={value} min={min} max={max} step={step} suffix={suffix} onChange={onChange} />
      {desc && <small className="cfg-row-desc">{desc}</small>}
    </div>
  );
}

function Notice({ tone = "info", children }) {
  return <div className={`cfg-notice ${tone}`}>{children}</div>;
}

const TABS = [
  { id: "audio", group: "Essencial", title: "Áudio e microfone", sub: "Dispositivos e ruído", icon: MicrophoneStage },
  { id: "tts", group: "Essencial", title: "Texto para voz", sub: "TTS e widget", icon: ChatText },
  { id: "soundboard", group: "Biblioteca", title: "Soundboard", sub: "Sons, clipes e espaço", icon: MusicNotes },
  { id: "atalhos", group: "Biblioteca", title: "Atalhos", sub: "Teclas globais", icon: Keyboard },
  { id: "aparencia", group: "App", title: "Aparência", sub: "Cores e interface", icon: Palette },
  { id: "sistema", group: "App", title: "Sistema", sub: "Abrir, fechar e manutenção", icon: GearSix }
];

const TAB_INFO = {
  audio: ["Áudio e microfone", "Escolha seu microfone, a saída da voz e o fone. Se algo não funcionar, comece por aqui."],
  tts: ["Texto para voz", "Faça o app falar o que você digita, com o widget que fica por cima dos jogos."],
  soundboard: ["Soundboard", "Como os sons tocam, de onde vêm, clipes retroativos e espaço em disco."],
  atalhos: ["Atalhos", "Teclas que funcionam em qualquer jogo ou programa, mesmo com o app em segundo plano."],
  aparencia: ["Aparência", "Cor de destaque e ajustes da interface. Tudo é salvo e aplicado na hora."],
  sistema: ["Sistema", "O que acontece ao abrir e fechar o app, backup e manutenção."]
};

export function ConfigPage({
  state,
  call,
  setToast,
  openAudioAssistant,
  selectedRecordDevices,
  setSelectedRecordDevices,
  setPage,
  accentColor,
  setAccentColor,
  customAccentColor,
  setCustomAccentColor,
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
  setPrefDockOpacity,
  appVersion = "",
  updateStatus = "",
  autoUpdateCheck = true,
  setAutoUpdateCheck,
  onCheckUpdates
}) {
  const [tab, setTab] = useState("audio");
  const [deviceChanging, setDeviceChanging] = useState("");
  const settings = state.settings || {};
  const effects = state.controls?.effects || {};
  const save = (patch) => call("/api/settings", patch);

  const storageMB = state.storageUsed ? state.storageUsed / (1024 * 1024) : 0;
  const storageLimitMB = Number(settings.maxSoundboardStorage ?? 0);

  const changeDevice = async (kind, value) => {
    if (deviceChanging) return;
    setDeviceChanging(kind);
    try {
      const next = await call("/api/selection", { [kind]: value });
      const devices = kind === "input" ? next.devices?.inputs : next.devices?.outputs;
      const selectedDevice = (devices || []).find((device) => device.index === value);
      setToast(`${selectedDevice?.name || "Dispositivo"} conectado!`);
    } catch (error) {
      setToast(`Não foi possível trocar o dispositivo: ${error.message}`);
      await call("/api/devices/refresh").catch(() => {});
    } finally {
      setDeviceChanging("");
    }
  };

  // Valores de fabrica de cada aba (os mesmos tipos que o app usa: antes alguns eram gravados com tipo errado).
  const resetTab = async () => {
    const [title] = TAB_INFO[tab];
    if (!confirm(`Voltar as configurações de "${title}" ao padrão?`)) return;
    try {
      if (tab === "audio") {
        await save({ audioSampleRate: "48000", audioBufferSize: "1024", inputChannels: "mono" });
        updateEffects({ noise_gate_enabled: false, noise_gate_threshold: 0.08 });
      } else if (tab === "tts") {
        await save({ showTtsWidgetSpeed: true, showTtsWidgetVolume: true, unlimitedTts: false, ttsWidgetOpacity: 82, keepTtsTextAfterSpeak: false, ttsVolume: 100, shortcutFocusTtsWidget: "" });
        localStorage.setItem("tts_default_voice", "pt-BR-AntonioNeural");
        localStorage.setItem("tts_default_rate", "0");
        localStorage.setItem("tts_default_pitch", "0");
      } else if (tab === "soundboard") {
        await save({ allowMultipleSounds: false, onlinePlaybackRoute: "both", maxSoundVolume: "1.0", onlinePreviewVolume: "0.25", clipEnabled: false, clipDuration: "30", clipSource: "both", maxSoundboardStorage: 0, importDestinationMode: "ask", importDestinationTabs: ["Todos"], rememberLastImportTabs: true, autoOrganizeBySource: false });
      } else if (tab === "atalhos") {
        await save({ shortcutMuteMic: "", shortcutToggleBypass: "", shortcutToggleSoundboard: "", shortcutToggleVoiceChanger: "", shortcutRecordVoice: "", shortcutRecordPC: "", shortcutRecordCombo: "", shortcutCommandGlitch: "Ctrl+Alt+G", shortcutClip: "", shortcutFocusTtsWidget: "" });
      } else if (tab === "aparencia") {
        setAccentColor("purple");
        setCustomAccentColor(DEFAULT_CUSTOM_ACCENT);
        setPrefFontSize("normal");
        setPrefGlow("medium");
        setPrefRadius("rounded");
        setPrefGlass(true);
        setPrefGamerMode(false);
        setPrefDockOpacity(0.95);
      } else if (tab === "sistema") {
        await save({ autoStartVirtual: true, rememberLastVoice: false, voiceEditPersistence: "save", restoreOnDisable: true, defaultMicOnClose: "restore", freeMemoryInTray: true, minimizeToTray: true, confirmClose: true, closeBehavior: "ask" });
      }
      setToast(`"${title}" voltou ao padrão.`);
    } catch (error) {
      setToast("Não foi possível restaurar: " + error.message);
    }
  };

  const groups = useMemo(() => {
    const result = [];
    for (const item of TABS) {
      let group = result.find((g) => g.name === item.group);
      if (!group) { group = { name: item.group, items: [] }; result.push(group); }
      group.items.push(item);
    }
    return result;
  }, []);

  const [title, subtitle] = TAB_INFO[tab];

  const hotkey = (label, key, hint) => (
    <HotkeyInput
      key={key}
      label={label}
      hint={hint}
      value={settings[key]}
      onChange={(val) => save({ [key]: val })}
      onClear={() => save({ [key]: "" })}
    />
  );

  return (
    <div className="cfg">
      <h2 className="srOnly">Configurações</h2>

      <nav className="cfg-nav" aria-label="Seções das configurações">
        {groups.map((group) => (
          <div className="cfg-nav-group" key={group.name}>
            <span className="cfg-nav-label">{group.name}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`cfg-nav-btn ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>
                  <Icon size={18} weight={tab === item.id ? "fill" : "regular"} />
                  <span className="cfg-nav-text">
                    <strong>{item.title}</strong>
                    <small>{item.sub}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <main className="cfg-main">
        <header className="cfg-header">
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <button className="btn btn-ghost cfg-reset" onClick={resetTab} title="Volta só as opções desta seção ao padrão de fábrica">
            <ArrowClockwise size={14} /> Restaurar padrão
          </button>
        </header>

        {/* ===================== ÁUDIO ===================== */}
        {tab === "audio" && (
          <>
            <Section icon={MicrophoneStage} title="Seus dispositivos" desc="O app pega o seu microfone, aplica a voz e envia para o CABLE Input. No Discord, jogo ou OBS você escolhe o CABLE Output como microfone.">
              {!state.virtualCableDetected && (
                <Notice tone="danger">
                  <strong><Warning size={14} weight="fill" /> Cabo virtual não detectado.</strong> Sem o VB-CABLE, ninguém ouve sua voz modificada no Discord ou nos jogos.{" "}
                  <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer">Baixar VB-CABLE</a>
                </Notice>
              )}
              <div className="cfg-devices">
                <SelectField
                  label="1. Seu microfone"
                  hint="O microfone que você usa de verdade para falar (ex.: Fifine, headset)."
                  value={state.selected?.input}
                  items={state.devices?.inputs || []}
                  onChange={(v) => changeDevice("input", v)}
                  disabled={Boolean(deviceChanging)}
                />
                <SelectField
                  label="2. Saída da voz: escolha o CABLE Input"
                  hint={'Escolha "CABLE Input (VB-Audio Virtual Cable)". É por aqui que a sua voz modificada sai para os outros programas.'}
                  value={state.selected?.output}
                  items={state.devices?.outputs || []}
                  onChange={(v) => changeDevice("output", v)}
                  disabled={Boolean(deviceChanging)}
                />
                <SelectField
                  label="3. Seu fone ou caixa de som (para você se ouvir)"
                  hint="Onde você escuta a sua própria voz e o soundboard. Não use o CABLE aqui."
                  value={state.selected?.monitor}
                  items={state.devices?.outputs || []}
                  onChange={(v) => changeDevice("monitor", v)}
                  allowNone
                  disabled={Boolean(deviceChanging)}
                />
              </div>
              <div className="cfg-actions">
                <button className="btn btn-ghost" onClick={() => call("/api/devices/refresh").then(() => setToast("Lista de dispositivos atualizada!"))}>
                  <ArrowClockwise size={14} /> Atualizar lista
                </button>
                <button className="btn btn-primary" onClick={() => openAudioAssistant?.()}>
                  <WaveTriangle size={14} weight="bold" /> Problemas de áudio? Me ajude
                </button>
              </div>
            </Section>

            <Section icon={MicrophoneSlash} title="Redução de ruído" desc="Abaixa o barulho de fundo (teclado, ventilador) quando você está calado. Sua voz passa limpa, sem cortes.">
              <SwitchRow
                label="Ativar redução de ruído"
                desc="Fecha o microfone quando só há barulho de fundo e abre assim que você fala."
                checked={effects.noise_gate_enabled}
                onChange={(v) => updateEffects({ noise_gate_enabled: v })}
              />
              {effects.noise_gate_enabled && (
                <SliderRow
                  label="Sensibilidade"
                  value={Number(effects.noise_gate_threshold ?? 0.08) * 100}
                  min={0}
                  max={40}
                  suffix="%"
                  onChange={(v) => updateEffects({ noise_gate_threshold: v / 100 })}
                  desc="Comece em 8%. Se ainda passar barulho, aumente aos poucos. Se cortar o começo das palavras ou sussurros, diminua."
                />
              )}
            </Section>

            <Section icon={FadersHorizontal} title="Qualidade e latência" advanced desc="Só mexa aqui se o áudio tiver cliques, falhas ou atraso.">
              <SelectRow
                label="Taxa de amostragem"
                desc="48000 Hz é o padrão de estúdio e funciona na maioria dos casos."
                value={String(settings.audioSampleRate || "48000")}
                onChange={(v) => save({ audioSampleRate: v }).then(() => setToast("Taxa de amostragem alterada!"))}
                options={[["44100", "44100 Hz (CD)"], ["48000", "48000 Hz (estúdio)"]]}
              />
              <SelectRow
                label="Tamanho do buffer"
                desc="Menor = menos atraso, mas exige um PC mais rápido. Maior = mais estável."
                value={String(settings.audioBufferSize || "1024")}
                onChange={(v) => save({ audioBufferSize: v }).then(() => setToast("Tamanho do buffer alterado!"))}
                options={[["128", "128 (atraso mínimo, PC rápido)"], ["256", "256 (baixo atraso)"], ["512", "512 (equilibrado)"], ["1024", "1024 (estável, PCs mais lentos)"]]}
              />
              <SelectRow
                label="Canais do microfone"
                desc="Deixe em mono, a menos que seu microfone seja estéreo de verdade."
                value={settings.inputChannels || "mono"}
                onChange={(v) => save({ inputChannels: v }).then(() => setToast("Canais de entrada configurados!"))}
                options={[["mono", "Mono (recomendado)"], ["stereo", "Estéreo"]]}
              />
            </Section>
          </>
        )}

        {/* ===================== TTS ===================== */}
        {tab === "tts" && (
          <>
            <Section icon={ChatText} title="Voz do texto" desc="Como o app fala o que você digita.">
              <SwitchRow
                label="Remover limite de caracteres"
                desc="Libera textos maiores que 10.000 caracteres. Textos muito longos demoram mais para gerar."
                checked={settings.unlimitedTts === true}
                onChange={(v) => save({ unlimitedTts: v })}
              />
              <SwitchRow
                label="Manter o texto depois de falar (widget)"
                desc="O texto continua na caixa do widget após enviar. A janela normal de TTS sempre mantém."
                checked={settings.keepTtsTextAfterSpeak === true}
                onChange={(v) => save({ keepTtsTextAfterSpeak: v })}
              />
              <SliderRow
                label="Volume padrão do TTS"
                value={Number(settings.ttsVolume ?? 100)}
                min={0}
                max={200}
                suffix="%"
                onChange={(v) => save({ ttsVolume: v })}
                desc="Volume em que a voz sintetizada toca (padrão: 100%)."
              />
            </Section>

            <Section icon={SlidersHorizontal} title="Widget flutuante" desc="A janelinha que fica por cima dos jogos para você digitar e falar rápido.">
              <SwitchRow label="Mostrar velocidade" desc="Controle de velocidade da fala (-50% a +50%) no widget." checked={settings.showTtsWidgetSpeed !== false} onChange={(v) => save({ showTtsWidgetSpeed: v })} />
              <SwitchRow label="Mostrar volume" desc="Controle de volume da fala (0% a 200%) no widget." checked={settings.showTtsWidgetVolume !== false} onChange={(v) => save({ showTtsWidgetVolume: v })} />
              <SliderRow
                label="Opacidade do fundo"
                value={Number(settings.ttsWidgetOpacity ?? 82)}
                min={10}
                max={100}
                suffix="%"
                onChange={(v) => save({ ttsWidgetOpacity: v })}
                desc="Quanto o fundo do widget é transparente (padrão: 82%)."
              />
              {hotkey("Atalho para abrir e digitar", "shortcutFocusTtsWidget", "Abre o widget (se estiver fechado) e já deixa o cursor na caixa de texto.")}
            </Section>
          </>
        )}

        {/* ===================== SOUNDBOARD ===================== */}
        {tab === "soundboard" && (
          <>
            <Section icon={MusicNotes} title="Reprodução" desc="Como os sons do soundboard tocam.">
              <SwitchRow
                label="Tocar vários sons ao mesmo tempo"
                desc="Se desligado, um som novo substitui o que estava tocando."
                checked={settings.allowMultipleSounds}
                onChange={(v) => save({ allowMultipleSounds: v })}
              />
              <SliderRow
                label="Volume máximo dos sons"
                value={Number(settings.maxSoundVolume ?? 1.0) * 100}
                min={0}
                max={200}
                suffix="%"
                onChange={(v) => save({ maxSoundVolume: String(v / 100) })}
                desc="Teto de volume para todos os sons (padrão: 100%)."
              />
              <SliderRow
                label="Volume das prévias do Explorar Sons"
                value={Number(settings.onlinePreviewVolume ?? 0.25) * 100}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => save({ onlinePreviewVolume: String(v / 100) })}
                desc="Vale só para ouvir prévias na biblioteca online."
              />
            </Section>

            <Section icon={DownloadSimple} title="Ao importar ou baixar sons" desc="Escolha em qual aba os sons novos aparecem.">
              <SelectRow
                label="Destino dos sons novos"
                value={settings.importDestinationMode || "ask"}
                onChange={(v) => save({ importDestinationMode: v })}
                options={[
                  ["ask", "Perguntar toda vez"],
                  ["todos", "Salvar só em Todos"],
                  ["auto_tabs", "Salvar nas abas escolhidas da última vez"],
                  ["remember_last", "Lembrar a última escolha"],
                  ["source", "Organizar por origem (YouTube, TikTok...)"]
                ]}
              />
              <SwitchRow label="Lembrar a última escolha de abas" desc="Atualiza o destino padrão quando você confirma uma importação." checked={settings.rememberLastImportTabs !== false} onChange={(v) => save({ rememberLastImportTabs: v })} />
              <SwitchRow label="Criar aba por origem" desc="Inclui abas como YouTube, TikTok ou Importados do PC junto do destino." checked={settings.autoOrganizeBySource === true} onChange={(v) => save({ autoOrganizeBySource: v })} />
            </Section>

            <Section icon={Record} title="Clipes retroativos" desc="Salve os últimos segundos da sua voz ou do som do PC apertando um atalho, como o replay do jogo.">
              <SwitchRow
                label="Ativar clipes retroativos"
                desc="Guarda os últimos segundos de áudio na memória enquanto o app roda."
                checked={settings.clipEnabled}
                onChange={(v) => save({ clipEnabled: v })}
              />
              {settings.clipEnabled && (
                <>
                  <SelectRow
                    label="O que gravar no clipe"
                    value={settings.clipSource ?? "both"}
                    onChange={(v) => save({ clipSource: v })}
                    options={[["both", "Voz e som do PC (canais separados)"], ["voice", "Só a minha voz"], ["pc", "Só o som do PC (jogos e programas)"]]}
                  />
                  <SliderRow
                    label="Duração do clipe"
                    value={Number(settings.clipDuration ?? 30)}
                    min={1}
                    max={60}
                    suffix="s"
                    onChange={(v) => save({ clipDuration: String(v) })}
                    desc="Quantos segundos para trás são salvos (máximo 60 s). Configure o atalho na aba Atalhos."
                  />
                </>
              )}
            </Section>

            <Section icon={ChartBar} title="Espaço em disco" desc="Quanto espaço os seus sons ocupam.">
              <div className="disk-usage-container">
                <div className="disk-usage-info">
                  <span>Espaço usado pelo soundboard</span>
                  <strong style={{ color: storageLimitMB > 0 && storageMB >= storageLimitMB ? "var(--danger)" : "var(--purple)" }}>
                    {storageMB.toFixed(1)} MB{storageLimitMB > 0 ? ` de ${storageLimitMB} MB` : " (sem limite)"}
                  </strong>
                </div>
                {storageLimitMB > 0 && (
                  <div className="disk-usage-bar-bg">
                    <div className="disk-usage-bar-fill" style={{ width: `${Math.min((storageMB / storageLimitMB) * 100, 100)}%` }} />
                  </div>
                )}
              </div>
              <SliderRow
                label="Limite de espaço"
                value={Number(settings.maxSoundboardStorage ?? 0)}
                min={0}
                max={5000}
                suffix=" MB"
                onChange={(v) => save({ maxSoundboardStorage: v })}
                desc="Quando chega no limite, o app avisa antes de importar mais sons. Deixe em 0 para não limitar."
              />
            </Section>

            <Section icon={Record} title="Gravar o som do Windows" advanced desc="Escolha quais saídas de áudio do PC entram nas gravações de PC e de voz + PC.">
              {(state.recordDevices || []).length === 0 && <p className="cfg-row-desc">Nenhum dispositivo de captura encontrado.</p>}
              {(state.recordDevices || []).map((device) => (
                <Row key={device.index} label={device.name} desc={device.is_loopback ? "Saída do PC (o que você ouve)" : "Entrada (microfone)"}>
                  <Switch
                    checked={selectedRecordDevices.includes(device.index)}
                    label={device.name}
                    onChange={(checked) => {
                      const next = checked ? [...selectedRecordDevices, device.index] : selectedRecordDevices.filter((i) => i !== device.index);
                      setSelectedRecordDevices(next);
                      call("/api/record/selection", { indexes: next });
                    }}
                  />
                </Row>
              ))}
            </Section>
          </>
        )}

        {/* ===================== ATALHOS ===================== */}
        {tab === "atalhos" && (
          <>
            <Section icon={MicrophoneStage} title="Voz" desc="Clique no botão, aperte as teclas e pronto. Use Ctrl, Alt ou Shift junto com uma tecla.">
              {hotkey("Mutar o microfone", "shortcutMuteMic")}
              {hotkey("Ligar/desligar a voz modificada", "shortcutToggleVoiceChanger")}
              {hotkey("Ligar/desligar os efeitos (bypass)", "shortcutToggleBypass", "Fala com a sua voz normal sem desligar o app.")}
              {hotkey("Ligar/desligar o retorno do soundboard", "shortcutToggleSoundboard", "O que você ouve no fone; não muda o que os outros ouvem.")}
              {hotkey("Disparar o glitch sob comando", "shortcutCommandGlitch")}
              {hotkey("Abrir o widget de texto para voz", "shortcutFocusTtsWidget")}
            </Section>

            <Section icon={Record} title="Gravação" desc="Aperte uma vez para começar e outra para parar.">
              {hotkey("Gravar a minha voz", "shortcutRecordVoice")}
              {hotkey("Gravar o som do PC", "shortcutRecordPC")}
              {hotkey("Gravar voz e som do PC juntos", "shortcutRecordCombo")}
              {settings.clipEnabled
                ? hotkey("Salvar clipe (últimos segundos)", "shortcutClip")
                : <p className="cfg-row-desc">Ative os clipes retroativos na aba Soundboard para definir o atalho do clipe.</p>}
            </Section>

            <Section icon={MusicNotes} title="Sons com atalho" desc="Para dar um atalho a um som, abra o Soundboard, clique no som e grave a tecla no painel ao lado.">
              {(state.sounds || []).filter((s) => s.shortcut).map((sound) => (
                <Row key={sound.id} label={sound.name} desc={sound.category || "Soundboard"}>
                  <kbd className="cfg-kbd">{sound.shortcut}</kbd>
                </Row>
              ))}
              {!(state.sounds || []).some((s) => s.shortcut) && <p className="cfg-empty">Nenhum som tem atalho ainda.</p>}
            </Section>
          </>
        )}

        {/* ===================== APARÊNCIA ===================== */}
        {tab === "aparencia" && (
          <>
            <Section icon={Palette} title="Cor de destaque" desc="Muda botões, destaques, brilhos e o logo em todo o app.">
              <div className="palette-grid">
                {Object.entries(colorPalettes).map(([key, item]) => (
                  <button key={key} className={`palette-btn ${accentColor === key ? "active" : ""}`} style={{ "--palette-color": item.primary }} onClick={() => setAccentColor(key)}>
                    <span className="palette-color-dot" style={{ backgroundColor: item.primary }} />
                    <span>{item.label}</span>
                  </button>
                ))}
                <button className={`palette-btn ${accentColor === "custom" ? "active" : ""}`} style={{ "--palette-color": customAccentColor }} onClick={() => setAccentColor("custom")}>
                  <span className="palette-color-dot" style={{ backgroundColor: customAccentColor }} />
                  <span>Personalizada</span>
                </button>
              </div>
              {accentColor === "custom" && (
                <Row label="Sua cor" desc="Escolha qualquer cor. O app calcula os tons claros e escuros sozinho.">
                  <div className="cfg-color">
                    <input type="color" value={customAccentColor || DEFAULT_CUSTOM_ACCENT} onChange={(e) => setCustomAccentColor(e.target.value)} />
                    <code>{String(customAccentColor || DEFAULT_CUSTOM_ACCENT).toUpperCase()}</code>
                  </div>
                </Row>
              )}
            </Section>

            <Section icon={SlidersHorizontal} title="Interface">
              <SelectRow label="Tamanho do texto" value={prefFontSize} onChange={setPrefFontSize} options={[["small", "Pequeno"], ["normal", "Normal"], ["large", "Grande"]]} />
              <SelectRow label="Brilho neon" desc="A luz suave em volta dos destaques." value={prefGlow} onChange={setPrefGlow} options={[["none", "Desligado"], ["soft", "Suave"], ["medium", "Médio"], ["high", "Forte"]]} />
              <SelectRow label="Cantos" value={prefRadius} onChange={setPrefRadius} options={[["sharp", "Retos"], ["rounded", "Arredondados"], ["soft", "Bem arredondados"]]} />
              <SliderRow label="Opacidade da barra flutuante" value={prefDockOpacity * 100} min={50} max={100} suffix="%" onChange={(v) => setPrefDockOpacity(v / 100)} />
              <SwitchRow label="Efeito de vidro" desc="Desfoque translúcido em painéis e janelas. Desligue para ganhar fluidez em PCs mais fracos." checked={prefGlass} onChange={setPrefGlass} />
              <SwitchRow label="Modo gamer" desc="Tira brilhos e animações pesadas para o app gastar menos do PC enquanto você joga." checked={prefGamerMode} onChange={setPrefGamerMode} />
            </Section>
          </>
        )}

        {/* ===================== SISTEMA ===================== */}
        {tab === "sistema" && (
          <>
            <Section icon={GearSix} title="Ao abrir o app">
              <SwitchRow
                label="Ligar a voz ao abrir"
                desc="A voz abre ligada e sem filtro, pronta para o Discord e os jogos. Desligue se preferir ligar manualmente."
                checked={settings.autoStartVirtual}
                onChange={(v) => save({ autoStartVirtual: v })}
              />
              <SwitchRow
                label="Lembrar a última voz"
                desc="Se desligado, o app sempre abre em Sem efeito."
                checked={settings.rememberLastVoice}
                onChange={(v) => save({ rememberLastVoice: v })}
              />
              <SwitchRow
                label="Salvar os ajustes de cada voz"
                desc="Mantém seus ajustes quando você volta a uma voz. Desligue para sempre abrir a voz original."
                checked={settings.voiceEditPersistence !== "reset"}
                onChange={(v) => save({ voiceEditPersistence: v ? "save" : "reset" })}
              />
              <SwitchRow
                label="Abrir junto com o Windows"
                desc="Inicia o VozLab Studio quando você entra no Windows."
                checked={settings.launchAtStartup === true}
                onChange={async (enabled) => {
                  await save({ launchAtStartup: enabled });
                  try {
                    await window.micfudiddo?.setLaunchAtStartup?.(enabled);
                  } catch {
                    setToast?.("Não foi possível atualizar a inicialização do Windows.");
                  }
                }}
              />
            </Section>

            <Section icon={GearSix} title="Ao fechar o app">
              <SelectRow
                label="Ao clicar em fechar (X)"
                value={settings.closeBehavior || "ask"}
                onChange={(v) => save({ closeBehavior: v })}
                options={[["ask", "Perguntar"], ["tray", "Minimizar para a bandeja"], ["quit", "Fechar de vez"]]}
              />
              <SwitchRow
                label="Confirmar antes de fechar"
                desc="Mostra a pergunta se deve ir para a bandeja ou fechar."
                checked={settings.confirmClose !== false}
                onChange={(v) => save({ confirmClose: v })}
              />
              <SwitchRow
                label="Liberar memória na bandeja"
                desc="Ao ir para a bandeja a janela é fechada e libera centenas de MB (bom para jogar). A voz, o soundboard e os atalhos continuam; a janela volta ao clicar no ícone."
                checked={settings.freeMemoryInTray !== false}
                onChange={(v) => save({ freeMemoryInTray: v })}
              />
              <SwitchRow
                label="Restaurar o microfone do Windows ao fechar"
                desc="Ao ligar a voz, o app troca o microfone padrão do Windows para o cabo virtual. Isto devolve o original quando você fecha."
                checked={settings.restoreOnDisable}
                onChange={(v) => save({ restoreOnDisable: v })}
              />
              {settings.restoreOnDisable && (
                <SelectRow
                  label="Microfone padrão depois de fechar"
                  value={settings.defaultMicOnClose || "restore"}
                  onChange={(v) => save({ defaultMicOnClose: v })}
                  options={[
                    ["restore", "O que eu usava antes (recomendado)"],
                    ["keep", "Deixar como está"],
                    ["choose", "Perguntar ao fechar"],
                    ...((state.windowsCaptureEndpoints || []).map((ep) => [ep.id, ep.name]))
                  ]}
                />
              )}
            </Section>

            <Section icon={DownloadSimple} title="Backup" desc="Guarda suas vozes customizadas, favoritos, cores e ajustes visuais em um arquivo.">
              <div className="cfg-actions">
                <button className="btn btn-ghost" onClick={() => {
                  const backup = {};
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith("micfudiddo.") || key === "personalizado_settings")) backup[key] = localStorage.getItem(key);
                  }
                  const link = document.createElement("a");
                  link.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
                  link.download = `vozlab_backup_${Date.now()}.json`;
                  link.click();
                  setToast("Backup exportado!");
                }}>
                  <DownloadSimple size={14} /> Exportar backup
                </button>
                <button className="btn btn-ghost" onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".json";
                  input.onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const data = JSON.parse(await file.text());
                      Object.entries(data).forEach(([key, val]) => {
                        if (key.startsWith("micfudiddo.") || key === "personalizado_settings") localStorage.setItem(key, String(val));
                      });
                      setToast("Backup importado! Reiniciando...");
                      setTimeout(() => window.location.reload(), 1500);
                    } catch (err) {
                      setToast("Esse arquivo não é um backup válido: " + err.message);
                    }
                  };
                  input.click();
                }}>
                  <UploadSimple size={14} /> Importar backup
                </button>
              </div>
            </Section>

            <Section icon={CheckCircle} title="Estado do áudio" desc="Para conferir se está tudo conectado, ou para copiar e mandar para quem for ajudar você.">
              <Row label="Voz"><span className={`cfg-status ${state.running && !state.monitorOnly ? "on" : ""}`}>{state.running && !state.monitorOnly ? "Ligada" : "Desligada"}</span></Row>
              <Row label="Microfone"><span className="cfg-status-text">{deviceName(state.devices?.inputs, state.selected?.input)}</span></Row>
              <Row label="Saída da voz (CABLE)"><span className="cfg-status-text">{deviceName(state.devices?.outputs, state.selected?.output)}</span></Row>
              <Row label="Seu fone"><span className="cfg-status-text">{deviceName(state.devices?.outputs, state.selected?.monitor)}</span></Row>
              {state.sampleRate ? <Row label="Taxa de amostragem"><span className="cfg-status-text">{state.sampleRate} Hz</span></Row> : null}
              <div className="cfg-actions">
                <button className="btn btn-ghost" onClick={async () => {
                  try { await navigator.clipboard.writeText(buildReport(state, appVersion)); setToast("Relatório copiado!"); } catch { setToast("Não consegui copiar o relatório."); }
                }}>
                  <Copy size={14} /> Copiar relatório
                </button>
                <button className="btn btn-ghost" onClick={() => openAudioAssistant?.()}>
                  <WaveTriangle size={14} /> Abrir assistente de áudio
                </button>
              </div>
            </Section>

            <Section icon={ArrowClockwise} title="Atualizações" desc="O app só procura versão nova quando abre ou quando você clica no botão. Nunca fica procurando sozinho o tempo todo.">
              <Row label={`Versão instalada ${appVersion}`} desc={updateStatus || "Clique para ver se existe uma versão mais nova."}>
                <button className="btn btn-ghost" onClick={() => onCheckUpdates?.()}>
                  <ArrowClockwise size={14} /> Procurar atualização
                </button>
              </Row>
              <SwitchRow label="Procurar ao abrir o app" desc="Ligado por padrão. Desligue se preferir atualizar só pelo botão acima." checked={autoUpdateCheck} onChange={(v) => setAutoUpdateCheck?.(v)} />
            </Section>

            <Section icon={Wrench} title="Manutenção" advanced danger desc="Cada botão diz exatamente o que faz. Seus sons e perfis nunca são apagados por aqui.">
              <Row label="Zerar a voz atual" desc="Volta ganho e tom ao normal.">
                <button className="btn btn-ghost" onClick={() => call("/api/reset-section", { section: "voice" }).then(() => setToast("Voz zerada!"))}>Zerar voz</button>
              </Row>
              <Row label="Desligar todos os efeitos" desc="Deixa a sua voz sem nenhum efeito.">
                <button className="btn btn-ghost" onClick={() => call("/api/reset-section", { section: "effects" }).then(() => setToast("Efeitos desligados!"))}>Desligar efeitos</button>
              </Row>
              <Row label="Padrões de novos sons" desc="Volta o volume, tom e velocidade padrão usados em sons novos. Seus sons atuais não mudam.">
                <button className="btn btn-ghost" onClick={() => call("/api/reset-section", { section: "soundboard" }).then(() => setToast("Padrões do soundboard restaurados!"))}>Restaurar padrões</button>
              </Row>
              <Row label="Restaurar o app" desc="Desliga a voz e volta voz, efeitos e retorno ao padrão. Sons, perfis e favoritos continuam.">
                <button className="btn btn-danger" onClick={() => { if (confirm("Voltar voz, efeitos e retorno ao padrão? Seus sons, perfis e favoritos NÃO serão apagados.")) call("/api/reset").then(() => setToast("App restaurado ao padrão!")); }}>Restaurar app</button>
              </Row>
              <Row label="Apagar meu cadastro de perfil" desc="Volta nome, foto, plano e texto do seu perfil ao padrão.">
                <button className="btn btn-danger" onClick={() => {
                  if (!confirm("Apagar nome, foto, plano e texto do seu perfil de usuário?")) return;
                  ["profileName", "profileSub", "profileImage", "profilePlan", "profileBio", "profileReadme", "profileImagePosition"].forEach((k) => localStorage.removeItem(`micfudiddo.${k}`));
                  setToast("Perfil apagado! Recarregando...");
                  setTimeout(() => window.location.reload(), 1200);
                }}>Apagar perfil</button>
              </Row>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

// --- HotkeyInput ---
export function HotkeyInput({ label, hint, value, onChange, onClear }) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") { setIsRecording(false); return; }

    const keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey) keys.push("Win");

    const key = e.key.toUpperCase();
    const isModifier = key === "CONTROL" || key === "SHIFT" || key === "ALT" || key === "META";
    if (isModifier) return;

    let keyName = key;
    if (keyName === " ") keyName = "Space";
    else if (keyName === "ARROWUP") keyName = "Up";
    else if (keyName === "ARROWDOWN") keyName = "Down";
    else if (keyName === "ARROWLEFT") keyName = "Left";
    else if (keyName === "ARROWRIGHT") keyName = "Right";
    else if (keyName.length > 1) keyName = keyName.charAt(0) + keyName.slice(1).toLowerCase();
    keys.push(keyName);
    onChange(keys.join("+"));
    setIsRecording(false);
  };

  return (
    <Row label={label} desc={hint}>
      <div className="cfg-hotkey">
        <button
          className={`cfg-hotkey-btn ${isRecording ? "recording" : ""} ${value ? "set" : ""}`}
          onClick={() => setIsRecording(!isRecording)}
          onBlur={() => setIsRecording(false)}
          onKeyDown={isRecording ? handleKeyDown : undefined}
        >
          {isRecording ? "Aperte as teclas... (Esc cancela)" : (value || "Clique para definir")}
        </button>
        {value && !isRecording && (
          <button className="cfg-hotkey-clear" onClick={onClear} aria-label={`Remover o atalho de ${label}`}>Remover</button>
        )}
      </div>
    </Row>
  );
}

// --- ToggleSetting (mantido: outras telas usam) ---
export function ToggleSetting({ label, description, checked, onChange }) {
  return <SwitchRow label={label} desc={description} checked={checked} onChange={onChange} />;
}

// --- StatusLine ---
export function StatusLine({ label, value, active }) {
  return (
    <Row label={label}>
      <span className={`cfg-status ${active ? "on" : ""}`}>{value}</span>
    </Row>
  );
}

// --- SelectField ---
export function SelectField({ label, hint, value, items, onChange, allowNone, disabled = false }) {
  return (
    <div className="selectField">
      <label>{label}</label>
      {hint && <small className="selectHint">{hint}</small>}
      <select disabled={disabled} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {allowNone && <option value="">Nenhum</option>}
        {(items || []).map((item) => (
          <option key={item.index} value={item.index}>{item.name}</option>
        ))}
      </select>
    </div>
  );
}
