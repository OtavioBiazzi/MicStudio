import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, Plus, Trash, UploadSimple, FolderOpen, Shuffle, StopCircle,
  Record, Play, Star, FadersHorizontal, Copy, SlidersHorizontal, Export, Sparkle,
  MusicNotes, Keyboard, ArrowClockwise, X
} from "@phosphor-icons/react";
import { formatTime, formatLastUsed, filePathToUrl } from "../utils";
import { AdvancedSoundEditorModal } from "./Modals";

export function SoundboardPage({
  state,
  call,
  selected,
  selectedSound,
  setSelectedSound,
  setToast,
  selectedRecordDevices,
  setSelectedRecordDevices,
  soundboardFavorites,
  toggleSoundboardFavorite,
  updateControls,
  customCategories,
  setCustomCategories,
  promptState,
  setPromptState,
  setMoveCategorySoundId
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todos");
  const [dragActive, setDragActive] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [undoDelete, setUndoDelete] = useState(null);
  const [editingSoundId, setEditingSoundId] = useState(null);

  const sounds = state.sounds || [];
  const categories = useMemo(() => {
    const cats = new Set([...sounds.map((s) => s.category).filter(Boolean), ...customCategories]);
    return ["Todos", "Favoritos", ...Array.from(cats).sort()];
  }, [sounds, customCategories]);

  const filtered = useMemo(() => {
    let list = sounds;
    if (category === "Favoritos") list = list.filter((s) => soundboardFavorites.includes(s.id));
    else if (category !== "Todos") list = list.filter((s) => s.category === category);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((s) => s.name?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      const aFav = soundboardFavorites.includes(a.id);
      const bFav = soundboardFavorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });
  }, [sounds, category, query, soundboardFavorites]);

  const playerBySound = useMemo(() => {
    const map = {};
    (state.players || []).forEach((p) => { if (p.soundId) map[p.soundId] = p; });
    return map;
  }, [state.players]);

  const addSounds = async () => {
    const paths = await window.micfudiddo?.openAudioFiles?.();
    if (paths?.length) { await call("/api/sounds/add", { paths }); }
  };

  const addFolders = async () => {
    const folder = await window.micfudiddo?.openAudioFolders?.();
    if (folder && folder.length) { await call("/api/sounds/add-folder", { paths: folder }); }
  };

  const importDropped = async (e) => {
    e.preventDefault();
    setDragActive(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const paths = window.micfudiddo?.audioPathsFromDrop?.(files);
    if (paths?.length) { await call("/api/sounds/add", { paths }); }
  };

  const deleteSounds = async (ids) => {
    if (!ids?.length) return;
    const backup = sounds.filter((s) => ids.includes(s.id));
    if (ids.length === 1) await call("/api/sounds/delete", { id: ids[0] });
    else await call("/api/sounds/delete-batch", { ids });
    setUndoDelete({ items: backup, createdAt: Date.now() });
    setToast("Som(ns) removido(s). Ctrl+Z para desfazer.");
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && undoDelete) {
        e.preventDefault();
        call("/api/sounds/restore", { items: undoDelete.items }).then(() => {
          setUndoDelete(null);
          setToast("Restaurado!");
        }).catch((err) => setToast(err.message));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoDelete]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  return (
    <div
      onDragOver={(e) => {
        const types = Array.from(e.dataTransfer?.types || []);
        if (!types.includes("Files")) return;
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDragExit={() => setDragActive(false)}
      onDragEnd={() => setDragActive(false)}
      onDrop={importDropped}
      style={{ position: "relative" }}
    >
      <div className="labHeader">
        <h2>🔊 Soundboard Studio</h2>
        <p>Organize, edite e dispare seus efeitos sonoros, áudios e memes favoritos instantaneamente</p>
      </div>

      <div className="pageToolbar">
        <div className="toolbarLeft">
          <div className="searchBar" style={{ marginBottom: 0, flex: 1 }}>
            <MagnifyingGlass size={16} className="searchIcon" />
            <input placeholder="Buscar som..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="toolbarRight">
          <button className="btn btn-ghost" onClick={() => {
            setPromptState({
              title: "Nova Categoria",
              value: "",
              onConfirm: (name) => {
                if (name && name.trim()) {
                  const trimmed = name.trim();
                  if (customCategories.includes(trimmed) || ["Todos", "Favoritos"].includes(trimmed)) {
                    setToast("Categoria já existe!");
                    return;
                  }
                  setCustomCategories([...customCategories, trimmed]);
                  setToast(`Categoria "${trimmed}" criada!`);
                }
              }
            });
          }} title="Nova Categoria">
            <Plus size={14} /> Adicionar Categoria
          </button>
          {customCategories.includes(category) && (
            <button className="btn btn-ghost" onClick={() => {
              if (confirm(`Deseja excluir a categoria "${category}"? Os sons serão movidos para "Geral".`)) {
                call("/api/sounds/delete-category", { category }).then(() => {
                  setCustomCategories(customCategories.filter(c => c !== category));
                  setCategory("Todos");
                  setToast(`Categoria "${category}" excluída.`);
                }).catch((e) => setToast(e.message));
              }
            }} title="Excluir Categoria" style={{ color: "var(--danger)" }}>
              <Trash size={14} /> Excluir Cat.
            </button>
          )}
          <div className="importButtonGroup">
            <button className="btn btn-ghost" onClick={addSounds} title="Importar arquivos de áudio individuais"><UploadSimple size={14} /> Importar Áudio</button>
            <button className="btn btn-ghost" onClick={addFolders} title="Importar pasta contendo sons"><FolderOpen size={14} /> Importar Pasta</button>
          </div>
          <button className="btn btn-ghost" onClick={() => window.micfudiddo?.openPath?.(state.folders?.sounds)} title="Abrir pasta onde os sons são gravados"><FolderOpen size={14} /> Abrir Pasta</button>
          <button className="btn btn-ghost" onClick={() => call("/api/sounds/random").catch((e) => setToast(e.message))}><Shuffle size={14} /></button>
          <button className="btn btn-ghost" onClick={() => call("/api/sounds/stop").catch(() => {})}><StopCircle size={14} /></button>
        </div>
      </div>

      <div className="recorderBar">
        <button
          className={state.recording?.voice ? "recording" : ""}
          onClick={() => call(state.recording?.voice ? "/api/record/voice/stop" : "/api/record/voice/start").catch((e) => setToast(e.message))}
        >
          <Record size={14} weight="fill" /> {state.recording?.voice ? "Parar Voz" : "Gravar Voz"}
        </button>
        <button
          className={state.recording?.pc ? "recording" : ""}
          onClick={() => {
            const pcIndexes = selectedRecordDevices;
            call(state.recording?.pc ? "/api/record/pc/stop" : "/api/record/pc/start", { indexes: pcIndexes }).catch((e) => setToast(e.message));
          }}
        >
          <Record size={14} weight="fill" /> {state.recording?.pc ? "Parar PC" : "Gravar PC"}
        </button>
        <button
          className={state.recording?.combo ? "recording" : ""}
          onClick={() => {
            const pcIndexes = selectedRecordDevices;
            call(state.recording?.combo ? "/api/record/combo/stop" : "/api/record/combo/start", { indexes: pcIndexes }).catch((e) => setToast(e.message));
          }}
        >
          <Record size={14} weight="fill" /> {state.recording?.combo ? "Parar Combo" : "Voz + PC"}
        </button>
      </div>

      <div className="categoryPills">
        {categories.map((cat) => (
          <button key={cat} className={category === cat ? "active" : ""} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      <div className={`soundboardLayout ${selected && selectedSound !== null ? "" : "no-panel"}`}>
        <div className="soundboardMain">
          <div className="soundGrid">
            {filtered.map((sound) => {
              const player = playerBySound[sound.id];
              const isPlaying = player?.state === "playing";
              const isFav = soundboardFavorites.includes(sound.id);
              return (
                <div
                  key={sound.id}
                  className={`soundCard ${selected?.id === sound.id && selectedSound !== null ? "active" : ""} ${isPlaying ? "playing" : ""}`}
                  onClick={() => { setSelectedSound(sound.id); }}
                  onDoubleClick={() => {
                    call("/api/sounds/play", { id: sound.id }).catch((e) => setToast(e.message));
                  }}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sound }); }}
                >
                  <button
                    className={`soundcard-fav-btn ${isFav ? "favorited" : ""}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleSoundboardFavorite(sound.id); }}
                    style={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      background: "none",
                      border: "none",
                      color: isFav ? "var(--danger)" : "var(--text-muted)",
                      cursor: "pointer",
                      zIndex: 3
                    }}
                  >
                    <Star size={16} weight={isFav ? "fill" : "regular"} />
                  </button>
                  
                  <div className="soundCover" style={{ background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 20%, var(--bg-card-secondary))` }}>
                    {sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : <MusicNotes size={18} color={sound.color || "var(--purple)"} />}
                  </div>
                  <div className="soundName">{sound.name.replace(/\.[^/.]+$/, "")}</div>
                  <div className="soundCategory">
                    {sound.category || "Sem categoria"} • {formatTime(sound.duration)} • {sound.plays || 0} plays
                  </div>
                  {isPlaying && <span className="soundBadge" style={{ right: 8, top: 8 }}>▶</span>}
                  {sound.shortcut && (
                    <span
                      className="soundShortcut"
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        padding: "2px 5px",
                        fontSize: 9,
                        background: "rgba(0,0,0,0.5)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-xs)",
                        color: "var(--text-secondary)",
                        pointerEvents: "none"
                      }}
                    >
                      {sound.shortcut}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        {selected && selectedSound !== null && (
          <SoundboardQuickPanel
            sound={selected}
            state={state}
            call={call}
            setToast={setToast}
            onClose={() => setSelectedSound(null)}
            toggleSoundboardFavorite={toggleSoundboardFavorite}
            isFavorite={soundboardFavorites.includes(selected.id)}
            setEditingSoundId={setEditingSoundId}
            categories={categories}
            customCategories={customCategories}
            setCustomCategories={setCustomCategories}
            setPromptState={setPromptState}
          />
        )}
      </div>

      <AnimatePresence>
        {editingSoundId && (
          <AdvancedSoundEditorModal
            state={state}
            selected={sounds.find((s) => s.id === editingSoundId)}
            onClose={() => setEditingSoundId(null)}
            call={call}
            setToast={setToast}
            onDelete={() => {
              deleteSounds([editingSoundId]);
              setEditingSoundId(null);
            }}
            soundboardFavorites={soundboardFavorites}
            toggleSoundboardFavorite={toggleSoundboardFavorite}
          />
        )}
      </AnimatePresence>

      {dragActive && (
        <div className="dropOverlay">
          <UploadSimple size={32} /> Solte para importar no Soundboard
        </div>
      )}

      {contextMenu && (() => {
        const estimatedW = 220;
        const estimatedH = 360;
        let x = contextMenu.x;
        let y = contextMenu.y;
        if (x + estimatedW > window.innerWidth) {
          x = Math.max(10, window.innerWidth - estimatedW - 15);
        }
        if (y + estimatedH > window.innerHeight) {
          y = Math.max(10, window.innerHeight - estimatedH - 15);
        }
        return (
          <div className="contextMenu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { call("/api/sounds/play", { id: contextMenu.sound.id }).catch((e) => setToast(e.message)); setContextMenu(null); }}>
              <Play size={14} /> Tocar
            </button>
            <button onClick={() => { setEditingSoundId(contextMenu.sound.id); setContextMenu(null); }}>
              <FadersHorizontal size={14} /> Editar Som
            </button>
            <button onClick={async () => {
              try {
                const s = contextMenu.sound;
                await call("/api/sounds/save-edited", {
                  id: s.id,
                  replace: false,
                  name: `${s.name} (Cópia)`,
                  category: s.category || "Geral",
                  color: s.color || "#8B5CF6",
                  volume: s.volume,
                  pitch_semitones: s.pitch_semitones,
                  pitch_mode: s.pitch_mode,
                  speed: s.speed,
                  normalize: s.normalize,
                  fade_in_ms: s.fade_in_ms,
                  fade_out_ms: s.fade_out_ms,
                  repeats: s.repeats,
                  shortcut: "",
                  block_voice: s.block_voice,
                  loop: s.loop,
                  playback_mode: s.playback_mode,
                  stop_other_sounds: s.stop_other_sounds,
                  mute_other_sounds: s.mute_other_sounds,
                  output_route: s.output_route,
                  start: s.start || 0,
                  end: s.end || null,
                  effects: s.effects || {}
                });
                setToast("Som duplicado com sucesso!");
              } catch (e) {
                setToast("Erro ao duplicar: " + e.message);
              }
              setContextMenu(null);
            }}>
              <Copy size={14} /> Duplicar
            </button>
            <button onClick={() => {
              const currentSound = contextMenu.sound;
              setContextMenu(null);
              setPromptState({
                title: "Renomear Som",
                value: currentSound.name,
                onConfirm: (newName) => {
                  if (newName && newName.trim()) {
                    call("/api/sounds/update", { id: currentSound.id, name: newName.trim() })
                      .then(() => setToast("Som renomeado!"))
                      .catch((err) => setToast("Erro: " + err.message));
                  }
                }
              });
            }}>
              <SlidersHorizontal size={14} /> Renomear
            </button>
            <button onClick={() => {
              toggleSoundboardFavorite(contextMenu.sound.id);
              setContextMenu(null);
            }}>
              <Star size={14} weight={soundboardFavorites.includes(contextMenu.sound.id) ? "fill" : "regular"} />
              {soundboardFavorites.includes(contextMenu.sound.id) ? "Desfavoritar" : "Favoritar"}
            </button>
            <button onClick={() => {
              const currentSound = contextMenu.sound;
              setContextMenu(null);
              setMoveCategorySoundId(currentSound.id);
            }}>
              <FolderOpen size={14} /> Mover para Pasta
            </button>
            <button onClick={() => {
              window.micfudiddo?.showItemInFolder?.(contextMenu.sound.path);
              setContextMenu(null);
            }}>
              <FolderOpen size={14} /> Ver Som na Pasta
            </button>
            <button onClick={() => {
              const s = contextMenu.sound;
              const a = document.createElement("a");
              a.href = filePathToUrl(s.path);
              a.download = s.name + (s.path.slice(s.path.lastIndexOf(".")) || ".wav");
              a.click();
              setToast("Exportando som...");
              setContextMenu(null);
            }}>
              <Export size={14} /> Exportar
            </button>
            <button onClick={() => {
              navigator.clipboard.writeText(contextMenu.sound.path);
              setToast("Caminho do áudio copiado!");
              setContextMenu(null);
            }}>
              <Sparkle size={14} /> Compartilhar (Copiar Path)
            </button>
            <button className="danger" onClick={() => { deleteSounds([contextMenu.sound.id]); setContextMenu(null); }}>
              <Trash size={14} /> Excluir
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// --- SoundboardQuickPanel ---
export function SoundboardQuickPanel({
  sound,
  state,
  call,
  setToast,
  onClose,
  toggleSoundboardFavorite,
  isFavorite,
  setEditingSoundId,
  categories,
  customCategories,
  setCustomCategories,
  setPromptState
}) {
  const [name, setName] = useState(sound.name);
  const [category, setCategory] = useState(sound.category || "Geral");
  const [shortcut, setShortcut] = useState(sound.shortcut || "");
  const [volume, setVolume] = useState(sound.volume);
  const [loop, setLoop] = useState(!!sound.loop);

  useEffect(() => {
    setName(sound.name);
    setCategory(sound.category || "Geral");
    setShortcut(sound.shortcut || "");
    setVolume(sound.volume);
    setLoop(!!sound.loop);
  }, [sound]);

  const handleSaveField = (field, val) => {
    call("/api/sounds/update", { id: sound.id, [field]: val }).catch((err) => setToast(err.message));
  };

  const handleHotkeyKeyDown = (e) => {
    e.preventDefault();
    const keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey) keys.push("Win");
    
    const key = e.key.toUpperCase();
    if (key !== "CONTROL" && key !== "SHIFT" && key !== "ALT" && key !== "META") {
      keys.push(key);
    }
    
    const newShortcut = keys.join("+");
    if (newShortcut) {
      setShortcut(newShortcut);
      handleSaveField("shortcut", newShortcut);
    }
  };

  const isPlaying = state.players?.some((p) => p.soundId === sound.id && p.state === "playing");

  const togglePreview = () => {
    if (isPlaying) {
      call("/api/sounds/stop").catch(() => {});
    } else {
      call("/api/sounds/play", { id: sound.id }).catch(() => {});
    }
  };

  const handleDuplicate = async () => {
    try {
      await call("/api/sounds/save-edited", {
        id: sound.id,
        replace: false,
        name: `${sound.name} (Cópia)`,
        category: sound.category || "Geral",
        color: sound.color || "#8B5CF6",
        volume: sound.volume,
        pitch_semitones: sound.pitch_semitones,
        pitch_mode: sound.pitch_mode,
        speed: sound.speed,
        normalize: sound.normalize,
        fade_in_ms: sound.fade_in_ms,
        fade_out_ms: sound.fade_out_ms,
        repeats: sound.repeats,
        shortcut: "",
        block_voice: sound.block_voice,
        loop: sound.loop,
        playback_mode: sound.playback_mode,
        stop_other_sounds: sound.stop_other_sounds,
        mute_other_sounds: sound.mute_other_sounds,
        output_route: sound.output_route,
        start: sound.start || 0,
        end: sound.end || null,
        effects: sound.effects || {}
      });
      setToast("Som duplicado com sucesso!");
    } catch (e) {
      setToast("Erro ao duplicar: " + e.message);
    }
  };

  const chooseCover = async () => {
    const path = await window.micfudiddo?.openImageFile?.();
    if (path) {
      call("/api/sounds/cover", { id: sound.id, path })
        .then(() => setToast("Capa do som atualizada!"))
        .catch((e) => setToast(e.message));
    }
  };

  return (
    <div className="voiceSidePanel soundboardSidePanel">
      <button className="panelCopy" title="Duplicar Som" onClick={handleDuplicate}><Copy size={16} /></button>
      <button className="panelClose" onClick={onClose}><X size={16} /></button>

      <div className="panelImage" style={{ background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 15%, var(--bg-card-secondary))` }}>
        {sound.coverUrl ? (
          <img src={sound.coverUrl} alt="" />
        ) : (
          <MusicNotes size={64} color={sound.color || "var(--purple)"} />
        )}
        <div className="sound-modal-cover-overlay" onClick={chooseCover}>
          <span style={{ fontSize: 10, fontWeight: 800 }}>ALTERAR CAPA</span>
        </div>
      </div>

      <div className="panelBody">
        <div className="panelName" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{sound.name}</span>
          <button
            className={`favBtn ${isFavorite ? "favorited" : ""}`}
            onClick={() => toggleSoundboardFavorite(sound.id)}
            style={{ position: "static", background: "none", border: "none", color: isFavorite ? "var(--danger)" : "var(--text-muted)", cursor: "pointer" }}
          >
            <Star size={18} weight={isFavorite ? "fill" : "regular"} />
          </button>
        </div>
        
        <p className="panelDesc" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Categoria: <strong style={{ color: "var(--text-secondary)" }}>{sound.category || "Geral"}</strong>
        </p>

        <div className="quickSoundMeta">
          <span><MusicNotes size={12} /> {formatTime(sound.duration)}</span>
          <span><Keyboard size={12} /> {sound.shortcut || "Sem atalho"}</span>
          <span><ArrowClockwise size={12} /> {formatLastUsed(sound.last_played_at)}</span>
        </div>

        <div className="panelSection" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
          <div className="labField">
            <label>Nome do Som</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleSaveField("name", name)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Mover para Pasta (Categoria)</label>
            <select
              value={category}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "++new") {
                  setPromptState({
                    title: "Nova Pasta / Categoria",
                    value: "",
                    onConfirm: (name) => {
                      if (name && name.trim()) {
                        const trimmed = name.trim();
                        if (["Todos", "Favoritos"].includes(trimmed)) {
                          setToast("Nome reservado!");
                          return;
                        }
                        if (!customCategories.includes(trimmed)) {
                          setCustomCategories([...customCategories, trimmed]);
                        }
                        setCategory(trimmed);
                        call("/api/sounds/update", { id: sound.id, category: trimmed })
                          .then(() => setToast(`Som movido para "${trimmed}"`))
                          .catch((err) => setToast(err.message));
                      }
                    }
                  });
                } else {
                  setCategory(val);
                  call("/api/sounds/update", { id: sound.id, category: val })
                    .then(() => setToast(`Som movido para "${val}"`))
                    .catch((err) => setToast(err.message));
                }
              }}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 12,
                outline: "none"
              }}
            >
              {(categories || []).filter(c => c !== "Todos" && c !== "Favoritos").map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {!categories?.includes("Geral") && <option value="Geral">Geral</option>}
              <option value="++new" style={{ color: "var(--purple)", fontWeight: "bold" }}>+ Criar Nova Pasta...</option>
            </select>
          </div>

          <div className="labField">
            <label>Atalho de Teclado (Foque e Pressione)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={shortcut}
                onKeyDown={handleHotkeyKeyDown}
                placeholder="Pressione as teclas..."
                readOnly
                style={{ flex: 1, padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--purple)", fontWeight: 800, fontSize: 12, textAlign: "center" }}
              />
              {shortcut && (
                <button
                  className="btn btn-ghost"
                  onClick={() => { setShortcut(""); handleSaveField("shortcut", ""); }}
                  style={{ padding: "8px 12px" }}
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Ajustes Rápidos</span>
            
            <div className="panelSlider" style={{ marginBottom: 12 }}>
              <span className="sliderLabel">Volume</span>
              <input
                type="range" min={0} max={1.5} step={0.05}
                value={volume}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setVolume(val);
                  handleSaveField("volume", val);
                }}
              />
              <span className="sliderValue">{Math.round(volume * 100)}%</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 700 }}>Looping Contínuo</span>
              <label className="toggleSwitch" style={{ scale: 0.85 }}>
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => {
                    setLoop(e.target.checked);
                    handleSaveField("loop", e.target.checked);
                  }}
                />
                <span className="toggleTrack" />
              </label>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          <button
            className="btn btn-primary"
            onClick={togglePreview}
            style={{
              width: "100%",
              background: isPlaying ? "linear-gradient(135deg, var(--danger), var(--danger-dim))" : "linear-gradient(135deg, var(--purple), var(--purple-dim))",
              color: "#fff",
              padding: "10px",
              borderRadius: "var(--radius-sm)",
              fontWeight: 800,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8
            }}
          >
            {isPlaying ? (
              <>
                <StopCircle size={16} weight="fill" /> Parar Prévia
              </>
            ) : (
              <>
                <Play size={16} weight="fill" /> Ouvir Prévia
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
