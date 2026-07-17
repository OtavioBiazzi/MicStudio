import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass, Plus, Trash, Star, Copy, X, DotsThreeVertical,
  CaretUp, CaretDown, ArrowClockwise, Microphone, PencilSimpleLine,
  Export, DownloadSimple, SlidersHorizontal
} from "@phosphor-icons/react";
import {
  effectDefaults,
  displayEffectValue,
  storeEffectValue,
  EffectSliderRow,
  effectGroups,
  copyTextToClipboard,
  HotkeyCaptureButton
} from "../utils";
import { voicePresets, visibleVoicePresets } from "../voicePresets";

const voiceImageModules = import.meta.glob("../../assets/voices/*.png", { eager: true, import: "default" });
const defaultVoiceControls = [
  { target: "control", key: "pitch", label: "Pitch", min: -12, max: 12, step: 1, unit: "st", group: "Identidade" },
  { target: "effect", key: "robot_rate_hz", enableKey: "robot_enabled", label: "Robotização", min: 5, max: 120, step: 1, unit: "Hz", group: "Textura" },
  { target: "effect", key: "reverb_mix", enableKey: "reverb_enabled", label: "Reverb", min: 0, max: 100, step: 1, unit: "%", scale: 100, group: "Espaço" },
  { target: "effect", key: "echo_mix", enableKey: "echo_enabled", label: "Eco", min: 0, max: 100, step: 1, unit: "%", scale: 100, group: "Espaço" },
  { target: "effect", key: "distortion_drive", enableKey: "distortion_enabled", label: "Distorção", min: 1, max: 30, step: 0.5, unit: "x", group: "Textura" }
];

function getVoiceImage(id) {
  for (const [path, url] of Object.entries(voiceImageModules)) {
    if (path.includes(`/${id}.`)) return url;
  }
  return null;
}

export function VozesPage({
  state,
  call,
  updateControls,
  updateEffects,
  applyVoicePreset,
  selectedVoice,
  setSelectedVoice,
  favorites,
  toggleFavorite,
  customVoices,
  setCustomVoices,
  setPage,
  promptState,
  setPromptState,
  customVoiceCategories,
  setCustomVoiceCategories,
  activePreset,
  setToast
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  const allVoices = useMemo(() => [...visibleVoicePresets, ...customVoices], [customVoices]);

  const categories = useMemo(() => {
    return ["Todas", "Favoritas", "Recentes", "Humanos", "Robôs", "Monstros", "Anime", "Jogos", "Sci-Fi", "Memes", "Customizadas", ...customVoiceCategories];
  }, [customVoiceCategories]);

  const filtered = useMemo(() => {
    let list = allVoices;
    if (category === "Favoritas") {
      list = list.filter((v) => favorites.includes(v.id) || v.id === "personalizado");
    } else if (category === "Customizadas") {
      list = list.filter((v) => customVoices.some((c) => c.id === v.id) || v.id === "personalizado");
    } else if (category !== "Todas" && category !== "Recentes" && !customVoiceCategories.includes(category)) {
      list = list.filter((v) => {
        if (v.id === "personalizado") return true;
        const voiceCat = v.category;
        if (category === "Humanos") return voiceCat === "Humanos" || voiceCat === "Reverb" || voiceCat === "Grave" || voiceCat === "Fina e Aguda" || voiceCat === "Rádio";
        if (category === "Robôs") return voiceCat === "Robótica";
        if (category === "Monstros") return voiceCat === "Monstros";
        if (category === "Anime") return voiceCat === "Anime";
        if (category === "Jogos") return voiceCat === "Jogos e Streaming" || voiceCat === "Música";
        if (category === "Sci-Fi") return voiceCat === "Exclusivos";
        if (category === "Memes") return voiceCat === "Humor" || voiceCat === "Especiais";
        return voiceCat === category;
      });
    } else if (customVoiceCategories.includes(category)) {
      list = list.filter((v) => v.category === category || v.id === "personalizado");
    }
    
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((v) => v.id === "personalizado" || v.label.toLowerCase().includes(q) || v.description.toLowerCase().includes(q));
    }

    const hasPersonalizado = list.some((v) => v.id === "personalizado");
    if (!hasPersonalizado) {
      const pers = allVoices.find((v) => v.id === "personalizado");
      if (pers) {
        list = [pers, ...list];
      }
    }
    
    const sorted = [...list].sort((a, b) => {
      if (a.id === "personalizado") return -1;
      if (b.id === "personalizado") return 1;
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });

    const unique = [];
    const seen = new Set();
    for (const v of sorted) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        unique.push(v);
      }
    }
    return unique;
  }, [allVoices, category, query, favorites, customVoices, customVoiceCategories]);

  const panelVoice = selectedVoice ? allVoices.find((v) => v.id === selectedVoice) : null;

  const selectVoice = (voice) => {
    setSelectedVoice(voice.id);
    applyVoicePreset(voice);
  };

  return (
    <>
      <div className="labHeader">
        <h2>🎙️ Biblioteca de Vozes</h2>
        <p>Selecione, personalize e modele timbres de estúdio premium em tempo real</p>
      </div>

      <div className="pageToolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div className="toolbarLeft" style={{ flex: 1 }}>
          <div className="searchBar" style={{ marginBottom: 0, maxWidth: 420 }}>
            <MagnifyingGlass size={16} className="searchIcon" />
            <input placeholder="Buscar voz..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="toolbarRight" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => {
            setPromptState({
              title: "Nova Categoria de Voz",
              value: "",
              onConfirm: (name) => {
                if (name && name.trim()) {
                  const trimmed = name.trim();
                  if (customVoiceCategories.includes(trimmed) || ["Todas", "Favoritas", "Recentes", "Humanos", "Robôs", "Monstros", "Anime", "Jogos", "Sci-Fi", "Memes", "Customizadas"].includes(trimmed)) {
                    alert("Categoria já existe!");
                    return;
                  }
                  setCustomVoiceCategories([...customVoiceCategories, trimmed]);
                }
              }
            });
          }} title="Nova Categoria de Voz">
            <Plus size={14} /> Adicionar Categoria
          </button>
          <button className="btn btn-ghost" onClick={async () => {
            try {
              const text = (await navigator.clipboard.readText() || "").trim();
              if (!text) {
                alert("A área de transferência está vazia!");
                return;
              }
              if (!text.startsWith("MFVOICE-")) {
                alert("Código de compartilhamento inválido no clipboard (deve começar com 'MFVOICE-').");
                return;
              }
              const base64Part = text.substring("MFVOICE-".length);
              const base64Regex = /^[A-Za-z0-9+/=]+$/;
              if (!base64Regex.test(base64Part)) {
                alert("Código Base64 inválido.");
                return;
              }
              const jsonStr = decodeURIComponent(escape(atob(base64Part)));
              const imported = JSON.parse(jsonStr);
              if (imported && typeof imported === "object") {
                const newVoice = {
                  id: `custom_${Date.now()}`,
                  label: imported.label || "Voz Importada",
                  description: imported.description || "Voz importada por código",
                  emoji: imported.emoji || "🎙️",
                  category: imported.category || "Customizadas",
                  gradient: "linear-gradient(135deg, #1e1b4b, #311042)",
                  gain: imported.gain ?? 1.0,
                  pitch: imported.pitch ?? 0.0,
                  effects: imported.effects || {}
                };
                setCustomVoices(prev => [...prev, newVoice]);
                setToast?.("Voz importada com sucesso!");
              } else {
                alert("Dados inválidos dentro do código.");
              }
            } catch (err) {
              alert("Erro ao importar do clipboard: " + err.message);
            }
          }} title="Importar Voz por Código da Área de Transferência">
            <DownloadSimple size={14} /> Importar por Código
          </button>
          {customVoiceCategories.includes(category) && (
            <button className="btn btn-ghost" onClick={() => {
              if (confirm(`Deseja excluir a categoria de voz "${category}"? As vozes não serão excluídas, apenas perderão a categoria.`)) {
                setCustomVoiceCategories(customVoiceCategories.filter(c => c !== category));
                setCategory("Todas");
              }
            }} title="Excluir Categoria" style={{ color: "var(--danger)" }}>
              <Trash size={14} /> Excluir Cat.
            </button>
          )}
        </div>
      </div>

      <div className="categoryPills">
        {categories.map((cat) => (
          <button key={cat} className={category === cat ? "active" : ""} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      <div className="sectionHeader">TODAS AS VOZES</div>

      <div className={`voiceGridArea ${panelVoice ? "" : "no-panel"}`}>
        <div className="voiceGrid">
          {filtered.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isActive={activePreset?.id === voice.id}
              isFavorite={favorites.includes(voice.id)}
              onSelect={() => selectVoice(voice)}
              onEditOnly={() => setSelectedVoice(voice.id)}
              onToggleFavorite={() => toggleFavorite(voice.id)}
              onContextMenu={(e) => {
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  voice
                });
              }}
            />
          ))}
          <div className="voiceCard createCard" onClick={() => setPage("voicelab")}>
            <div className="cardImage">
              <span className="createPlus">+</span>
            </div>
            <div className="cardInfo">
              <div className="cardName">Criar voz</div>
              <div className="cardDesc">personalizada</div>
            </div>
          </div>
        </div>

        {panelVoice && (
          <VoiceSidePanel
            voice={panelVoice}
            state={state}
            updateControls={updateControls}
            updateEffects={updateEffects}
            onApplyPreset={() => applyVoicePreset(panelVoice)}
            onRestorePreset={() => applyVoicePreset(panelVoice, { resetSaved: true })}
            call={call}
            isFavorite={favorites.includes(panelVoice.id)}
            onToggleFavorite={() => toggleFavorite(panelVoice.id)}
            onClose={() => setSelectedVoice(null)}
            setToast={setToast}
          />
        )}
      </div>

      {contextMenu && (
        <div
          className="contextMenu"
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 9999,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 4,
            boxShadow: "var(--shadow-lg)",
            minWidth: 180
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => {
            selectVoice(contextMenu.voice);
            setContextMenu(null);
          }}>
            <Microphone size={14} /> Ativar Voz
          </button>
          <button onClick={() => {
            setSelectedVoice(contextMenu.voice.id);
            setContextMenu(null);
          }}>
            <SlidersHorizontal size={14} /> Editar Parâmetros
          </button>
          {contextMenu.voice.id.startsWith("custom_") && (
            <button onClick={() => {
              setPromptState({
                title: "Renomear Voz Customizada",
                value: contextMenu.voice.label,
                onConfirm: (newName) => {
                  if (newName && newName.trim()) {
                    setCustomVoices(prev =>
                      prev.map(v => v.id === contextMenu.voice.id ? { ...v, label: newName.trim() } : v)
                    );
                    setToast?.("Voz renomeada com sucesso!");
                  }
                }
              });
              setContextMenu(null);
            }}>
              <PencilSimpleLine size={14} /> Renomear
            </button>
          )}
          <button onClick={() => {
            const newVoice = {
              ...contextMenu.voice,
              id: `custom_${Date.now()}`,
              label: `${contextMenu.voice.label || contextMenu.voice.id} (Cópia)`
            };
            setCustomVoices(prev => [...prev, newVoice]);
            setToast?.("Voz duplicada com sucesso!");
            setContextMenu(null);
          }}>
            <Copy size={14} /> Duplicar
          </button>
          <button onClick={() => {
            const voiceData = {
              label: contextMenu.voice.label || contextMenu.voice.id,
              description: contextMenu.voice.description || "",
              emoji: contextMenu.voice.emoji || "🎙️",
              category: "Customizadas",
              gain: contextMenu.voice.gain ?? 1.0,
              pitch: contextMenu.voice.pitch ?? 0.0,
              effects: contextMenu.voice.effects || {}
            };
            try {
              const jsonStr = JSON.stringify(voiceData);
              const base64 = btoa(unescape(encodeURIComponent(jsonStr)));
              const shareCode = `MFVOICE-${base64}`;
              copyTextToClipboard(shareCode)
                .then(() => setToast?.("Código de compartilhamento copiado!"))
                .catch((err) => alert("Erro ao copiar: " + err.message));
            } catch (err) {
              alert("Erro ao gerar código de compartilhamento: " + err.message);
            }
            setContextMenu(null);
          }}>
            <Export size={14} /> Copiar Código de Compartilhamento
          </button>
          <button onClick={async () => {
            try {
              const text = (await navigator.clipboard.readText() || "").trim();
              if (!text) {
                alert("A área de transferência está vazia!");
                setContextMenu(null);
                return;
              }
              if (!text.startsWith("MFVOICE-")) {
                alert("Código inválido! Deve começar com 'MFVOICE-'.");
                setContextMenu(null);
                return;
              }
              const base64Part = text.substring("MFVOICE-".length);
              const base64Regex = /^[A-Za-z0-9+/=]+$/;
              if (!base64Regex.test(base64Part)) {
                alert("Código Base64 inválido.");
                setContextMenu(null);
                return;
              }
              const jsonStr = decodeURIComponent(escape(atob(base64Part)));
              const imported = JSON.parse(jsonStr);
              if (imported && typeof imported === "object") {
                const newVoice = {
                  id: `custom_${Date.now()}`,
                  label: imported.label || "Voz Importada",
                  description: imported.description || "Voz importada por código",
                  emoji: imported.emoji || "🎙️",
                  category: imported.category || "Customizadas",
                  gradient: "linear-gradient(135deg, #1e1b4b, #311042)",
                  gain: imported.gain ?? 1.0,
                  pitch: imported.pitch ?? 0.0,
                  effects: imported.effects || {}
                };
                setCustomVoices(prev => [...prev, newVoice]);
                setToast?.("Voz importada com sucesso!");
              } else {
                alert("Dados inválidos dentro do código.");
              }
            } catch (err) {
              alert("Erro ao importar: " + err.message);
            }
            setContextMenu(null);
          }}>
            <DownloadSimple size={14} /> Importar por Código
          </button>
          <button onClick={() => {
            const defaults = voicePresets.find(p => p.id === contextMenu.voice.id);
            updateControls({
              gain: defaults?.gain ?? 1.0,
              pitch: defaults?.pitch ?? 0.0,
              effects: defaults?.effects || {}
            });
            setToast?.("Configurações da voz restauradas!");
            setContextMenu(null);
          }}>
            <ArrowClockwise size={14} /> Restaurar Padrões
          </button>
          {contextMenu.voice.id.startsWith("custom_") && (
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Deseja excluir a voz "${contextMenu.voice.label}"?`)) {
                  setCustomVoices(prev => prev.filter(v => v.id !== contextMenu.voice.id));
                  setToast?.("Voz personalizada removida.");
                }
                setContextMenu(null);
              }}
            >
              <Trash size={14} /> Excluir
            </button>
          )}
        </div>
      )}
    </>
  );
}

// --- VoiceCard ---
export function VoiceCard({ voice, isActive, isFavorite, onSelect, onEditOnly, onToggleFavorite, onContextMenu }) {
  const image = getVoiceImage(voice.id);
  return (
    <motion.div
      className={`voiceCard ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          onContextMenu(e);
        } else if (onEditOnly) {
          e.preventDefault();
          onEditOnly();
        }
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="cardImage">
        {image ? (
          <img src={image} alt={voice.label} />
        ) : (
          <>
            <div className="cardGradient" style={{ background: voice.gradient }} />
            <span className="cardEmoji">{voice.emoji}</span>
          </>
        )}
        <div className="cardWaveform">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ "--i": i }} />
          ))}
        </div>
      </div>
      <button className={`favBtn ${isFavorite ? "favorited" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
        <Star size={14} weight={isFavorite ? "fill" : "regular"} />
      </button>
      <div className="cardInfo">
        <div className="cardName">{voice.label}</div>
        <div className="cardDesc">{voice.description}</div>
      </div>
    </motion.div>
  );
}

// --- VoiceSidePanel ---
export function VoiceSidePanel({ voice, state, updateControls, updateEffects, onApplyPreset, onRestorePreset, call, isFavorite, onToggleFavorite, onClose, setToast }) {
  const [showMore, setShowMore] = useState(false);
  const image = getVoiceImage(voice.id);
  const controls = state.controls;

  const gainValue = Number(controls.gain ?? 1.0);
  const monitorVolumeValue = Number(controls.monitorVolume ?? 1.0);
  const outputVolumeValue = Number(controls.effects?.output_volume ?? 1.0);
  const personalizedControls = voice.controls?.length ? voice.controls : defaultVoiceControls;
  const controlGroups = personalizedControls.reduce((groups, item) => {
    const group = item.group || "Configuração";
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
    return groups;
  }, {});

  const readParameter = (item) => {
    const raw = item.target === "control"
      ? controls[item.key]
      : controls.effects?.[item.key];
    const fallback = item.target === "control" ? voice[item.key] : voice.effects?.[item.key];
    return Number(raw ?? fallback ?? item.min ?? 0) * Number(item.scale || 1);
  };

  const updateParameter = (item, displayValue) => {
    const storedValue = Number(displayValue) / Number(item.scale || 1);
    if (item.target === "control") {
      updateControls({ [item.key]: storedValue });
      return;
    }
    updateEffects({
      [item.key]: storedValue,
      ...(item.enableKey ? { [item.enableKey]: true } : {})
    });
  };

  return (
    <div className="voiceSidePanel">
      <button className="panelCopy" title="Duplicar"><Copy size={16} /></button>
      <button className="panelClose" onClick={onClose}><X size={16} /></button>

      <div className="panelImage">
        {image ? <img src={image} alt={voice.label} /> : (
          <>
            <div className="cardGradient" style={{ background: voice.gradient, position: "absolute", inset: 0 }} />
            <span className="panelEmoji">{voice.emoji}</span>
          </>
        )}
      </div>

      <div className="panelBody">
        <div className="panelName">
          {voice.label}
          <span className="proBadge">PRO</span>
        </div>
        <p className="panelDesc">{voice.description}</p>
        {voice.tags?.length > 0 && (
          <div className="voiceProfileTags">
            {voice.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        )}

        <button className={`addFavBtn ${isFavorite ? "favorited" : ""}`} onClick={onToggleFavorite}>
          <Star size={16} weight={isFavorite ? "fill" : "regular"} />
          {isFavorite ? "Nos favoritos" : "Adicionar aos favoritos"}
        </button>

        {voice.id === "clean" ? (
          <div className="cleanVoiceNotice">
            <Microphone size={32} weight="duotone" color="var(--purple)" />
            <p>Voz original sem processamento</p>
            <span>Esta voz transmite o áudio limpo e natural do seu microfone.</span>
          </div>
        ) : (
          <>
            <div className="panelSection">
              <div className="panelSectionTitle">
                CONTROLE DE MICROFONE
              </div>
              <PanelSlider label="Ganho (Mic)" value={gainValue} min={0} max={10} step={0.01} unit="x" onChange={(v) => updateControls({ gain: v })} />
              <PanelSlider label="Vol. Retorno" value={monitorVolumeValue} min={0} max={3} step={0.01} unit="x" onChange={(v) => updateControls({ monitorVolume: v })} />
              <PanelSlider label="Volume Geral" value={outputVolumeValue} min={0} max={10} step={0.01} unit="x" onChange={(v) => updateEffects({ output_volume: v, output_volume_enabled: true })} />
            </div>

            <div className="panelSection">
              <div className="panelSectionTitle">
                CONTROLES DE {voice.label}
                <button className="moreBtn"><DotsThreeVertical size={16} /></button>
              </div>

              {Object.entries(controlGroups).map(([group, items]) => (
                <div key={group} className="voiceControlGroup">
                  <div className="voiceControlGroupName">{group}</div>
                  {items.map((item) => {
                    if (item.type === "select") {
                      return (
                        <PanelField key={`${item.target}-${item.key}`} label={item.label}>
                          <select
                            value={controls.effects?.[item.key] ?? voice.effects?.[item.key] ?? item.options[0]?.value}
                            onChange={(event) => updateEffects({ [item.key]: event.target.value, [item.enableKey]: true })}
                          >
                            {item.options.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </PanelField>
                      );
                    }
                    if (item.type === "hotkey") {
                      const shortcutValue = controls.effects?.[item.key]
                        || state.settings?.shortcutCommandGlitch
                        || voice.effects?.[item.key]
                        || "";
                      return (
                        <PanelField key={`${item.target}-${item.key}`} label={item.label}>
                          <HotkeyCaptureButton
                            value={shortcutValue}
                            onChange={(value) => {
                              updateEffects({ [item.key]: value, [item.enableKey]: true });
                              call?.("/api/settings", { shortcutCommandGlitch: value });
                            }}
                          />
                        </PanelField>
                      );
                    }
                    return (
                      <PanelSlider
                        key={`${item.target}-${item.key}`}
                        label={item.label}
                        value={readParameter(item)}
                        min={item.min}
                        max={item.max}
                        step={item.step || 1}
                        unit={item.unit || ""}
                        curve={item.curve}
                        onChange={(value) => updateParameter(item, value)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>

            <button className="moreConfigsBtn" onClick={() => setShowMore(!showMore)}>
              {showMore ? "Menos configurações" : "Mais configurações"}
              {showMore ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
          </>
        )}

        {showMore && (
          <div style={{ marginTop: 16 }}>
            {effectGroups.map((group) => (
              <div key={group.title} className="effectGroup">
                <div className="effectGroupTitle">{group.title}</div>
                {group.items.map(([enableKey, valueKey, label, suffix, min, max]) => {
                  const enabled = Boolean(controls.effects?.[enableKey]);
                  const raw = controls.effects?.[valueKey] ?? effectDefaults[valueKey];
                  const displayed = displayEffectValue(valueKey, raw);
                  return (
                    <div key={valueKey} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 4 }}>
                      <EffectSliderRow
                        label={label}
                        enabled={enabled}
                        value={displayed}
                        min={min}
                        max={max}
                        suffix={suffix}
                        onToggle={() => updateEffects({ [enableKey]: !enabled })}
                        onChange={(v) => updateEffects({ [valueKey]: storeEffectValue(valueKey, v) })}
                      />
                      {valueKey === "harmony_mix" && enabled && (
                        <div style={{ paddingLeft: 36, display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Modo do Acorde:</span>
                          <select
                            value={controls.effects?.harmony_mode || "Major"}
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
                      {valueKey === "drum_loop_volume" && enabled && (
                        <div style={{ paddingLeft: 36, display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Ritmo (BPM):</span>
                            <span style={{ fontSize: 11, color: "var(--purple)", fontWeight: 800 }}>{controls.effects?.drum_loop_bpm ?? 90} BPM</span>
                          </div>
                          <input
                            type="range"
                            min={40}
                            max={240}
                            step={5}
                            value={controls.effects?.drum_loop_bpm ?? 90}
                            onChange={(e) => updateEffects({ drum_loop_bpm: Number(e.target.value) })}
                            style={{ width: "100%", height: 4, borderRadius: 2, background: "var(--border)", outline: "none", accentColor: "var(--purple)", cursor: "pointer" }}
                          />
                        </div>
                      )}
                      {valueKey === "ambience_volume" && enabled && (
                        <div style={{ paddingLeft: 36, display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 700 }}>Tipo de ambiente:</span>
                          <select
                            value={controls.effects?.ambience_mode || "space"}
                            onChange={(e) => updateEffects({ ambience_mode: e.target.value })}
                            style={{ padding: "4px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontSize: 11, outline: "none" }}
                          >
                            <option value="space">Nave espacial</option>
                            <option value="infernal">Rumble infernal</option>
                            <option value="haunted">Ar assombrado</option>
                            <option value="digital">Corrupção digital</option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="panelActions" style={{ flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button onClick={onRestorePreset || onApplyPreset} style={{ flex: 1 }}>
              <ArrowClockwise size={14} /> Restaurar
            </button>
            <button className="primary" onClick={onApplyPreset} style={{ flex: 1 }}>
              Aplicar
            </button>
          </div>
          {voice.id === "personalizado" && (
            <button
              className="btn-danger"
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px dashed rgba(239, 68, 68, 0.3)",
                color: "var(--danger)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}
              onClick={() => {
                if (confirm("Deseja redefinir o perfil da Voz Personalizada para os padrões de fábrica?")) {
                  localStorage.removeItem("personalizado_settings");
                  updateControls({
                    gain: 1.0,
                    pitch: 0.0,
                    effects: {}
                  });
                  setToast?.("Configurações da Voz Personalizada redefinidas!");
                }
              }}
            >
              <ArrowClockwise size={14} /> Redefinir Voz Personalizada
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PanelField({ label, children }) {
  return (
    <div className="panelField">
      <span>{label}</span>
      {children}
    </div>
  );
}

// --- PanelSlider ---
export function PanelSlider({ label, value, min = 0, max = 100, step = 1, unit = "", curve, onChange }) {
  const safeValue = Math.max(min, Math.min(max, Number(value) || 0));
  const decimals = String(step).includes(".") ? String(step).split(".")[1].length : 0;
  const formatted = decimals ? safeValue.toFixed(decimals) : Math.round(safeValue);
  const logarithmic = curve === "log" && min > 0 && max > min;
  const sliderValue = logarithmic
    ? Math.log(safeValue / min) / Math.log(max / min) * 1000
    : safeValue;
  const handleChange = (event) => {
    const raw = Number(event.target.value);
    if (!logarithmic) {
      onChange(raw);
      return;
    }
    const mapped = min * Math.pow(max / min, raw / 1000);
    onChange(Math.max(min, Math.min(max, Math.round(mapped / step) * step)));
  };
  return (
    <div className="panelSlider">
      <span className="sliderLabel">{label}</span>
      <input
        type="range"
        min={logarithmic ? 0 : min}
        max={logarithmic ? 1000 : max}
        step={logarithmic ? 1 : step}
        value={sliderValue}
        onChange={handleChange}
      />
      <span className="sliderValue">{formatted}{unit}</span>
    </div>
  );
}
