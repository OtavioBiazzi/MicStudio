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
  effectGroups
} from "../utils";
import { voicePresets, visibleVoicePresets } from "../voicePresets";

const voiceImageModules = import.meta.glob("../../assets/voices/*.png", { eager: true, import: "default" });
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
            navigator.clipboard.writeText(JSON.stringify(voiceData, null, 2))
              .then(() => setToast?.("Configuração da voz copiada para a área de transferência!"))
              .catch(() => alert("Erro ao copiar para área de transferência."));
            setContextMenu(null);
          }}>
            <Export size={14} /> Exportar (Clipboard)
          </button>
          <button onClick={async () => {
            try {
               const text = await navigator.clipboard.readText();
               const imported = JSON.parse(text);
               if (imported && typeof imported === "object") {
                 const newVoice = {
                   id: `custom_${Date.now()}`,
                   label: imported.label || "Voz Importada",
                   description: imported.description || "Voz importada da área de transferência",
                   emoji: imported.emoji || "🎙️",
                   category: imported.category || "Customizadas",
                   gradient: "linear-gradient(135deg, #1e1b4b, #311042)",
                   gain: imported.gain ?? 1.0,
                   pitch: imported.pitch ?? 0.0,
                   effects: imported.effects || {}
                 };
                 setCustomVoices(prev => [...prev, newVoice]);
                 setToast?.("Voz importada com sucesso da área de transferência!");
               } else {
                 alert("Dados da área de transferência inválidos.");
               }
            } catch (err) {
               alert("Erro ao importar da área de transferência: " + err.message);
            }
            setContextMenu(null);
          }}>
            <DownloadSimple size={14} /> Importar (Clipboard)
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
export function VoiceSidePanel({ voice, state, updateControls, updateEffects, onApplyPreset, isFavorite, onToggleFavorite, onClose, setToast }) {
  const [showMore, setShowMore] = useState(false);
  const image = getVoiceImage(voice.id);
  const controls = state.controls;

  const gainValue = Math.round((Number(controls.gain ?? 1.0) / 3.0) * 100);
  const monitorVolumeValue = Math.round((Number(controls.monitorVolume ?? 1.0) / 3.0) * 100);
  const outputVolumeValue = Math.round((Number(controls.effects?.output_volume ?? 1.0) / 10.0) * 100);
  const pitchValue = Math.round(((Number(controls.pitch) + 12) / 24) * 100);
  const reverbValue = Math.round((Number(controls.effects?.reverb_mix ?? 0)) * 100);
  const echoValue = Math.round((Number(controls.effects?.echo_mix ?? 0)) * 100);
  const distortionValue = Math.round(((Number(controls.effects?.distortion_drive ?? 1) - 1) / 29) * 100);
  const formantValue = Math.round(((Number(controls.effects?.robot_rate_hz ?? 5) - 5) / 115) * 100);

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
              <PanelSlider label="Ganho (Mic)" value={gainValue} onChange={(v) => updateControls({ gain: (v / 100) * 3.0 })} />
              <PanelSlider label="Vol. Retorno" value={monitorVolumeValue} onChange={(v) => updateControls({ monitorVolume: (v / 100) * 3.0 })} />
              <PanelSlider label="Volume Geral" value={outputVolumeValue} onChange={(v) => updateEffects({ output_volume: (v / 100) * 10.0, output_volume_enabled: true })} />
            </div>

            <div className="panelSection">
              <div className="panelSectionTitle">
                CONFIGURAÇÕES DO EFEITO
                <button className="moreBtn"><DotsThreeVertical size={16} /></button>
              </div>

              <PanelSlider label="Pitch" value={pitchValue} onChange={(v) => updateControls({ pitch: (v / 100) * 24 - 12 })} />
              <PanelSlider label="Formant" value={formantValue} onChange={(v) => updateEffects({ robot_rate_hz: (v / 100) * 115 + 5, robot_enabled: v > 0 })} />
              <PanelSlider label="Reverb" value={reverbValue} onChange={(v) => updateEffects({ reverb_mix: v / 100, reverb_enabled: v > 0 })} />
              <PanelSlider label="Echo" value={echoValue} onChange={(v) => updateEffects({ echo_mix: v / 100, echo_enabled: v > 0 })} />
              <PanelSlider label="Distorção" value={distortionValue} onChange={(v) => updateEffects({ distortion_drive: (v / 100) * 29 + 1, distortion_enabled: v > 0 })} />
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
                    <EffectSliderRow
                      key={valueKey}
                      label={label}
                      enabled={enabled}
                      value={displayed}
                      min={min}
                      max={max}
                      suffix={suffix}
                      onToggle={() => updateEffects({ [enableKey]: !enabled })}
                      onChange={(v) => updateEffects({ [valueKey]: storeEffectValue(valueKey, v) })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="panelActions" style={{ flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button onClick={onApplyPreset} style={{ flex: 1 }}>
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

// --- PanelSlider ---
export function PanelSlider({ label, value, onChange }) {
  return (
    <div className="panelSlider">
      <span className="sliderLabel">{label}</span>
      <input type="range" min={0} max={100} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="sliderValue">{value}</span>
    </div>
  );
}
