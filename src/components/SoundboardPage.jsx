import React, { useState, useEffect, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, Plus, Trash, UploadSimple, FolderOpen, Shuffle, StopCircle,
  Record, Play, Star, FadersHorizontal, Copy, SlidersHorizontal, Export, Sparkle,
  MusicNotes, Keyboard, ArrowClockwise, X, CloudArrowDown, CloudArrowUp, DownloadSimple,
  Scissors, Heart, DotsThreeVertical, WarningCircle, SquaresFour
} from "@phosphor-icons/react";
import { formatTime, formatLastUsed, filePathToUrl, copyTextToClipboard } from "../utils";
import { AdvancedSoundEditorModal } from "./Modals";
import { ContextMenu } from "./ContextMenu";
import "./soundboard.css";

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
  const [sourceFilter, setSourceFilter] = useState("Todos");
  const [pendingImport, setPendingImport] = useState(null);

  const sounds = state.sounds || [];
  const storageMB = state.storageUsed ? state.storageUsed / (1024 * 1024) : 0;
  const storageLimitMB = Number(state.settings?.maxSoundboardStorage ?? 0);
  const isLimitReached = storageLimitMB > 0 && storageMB >= storageLimitMB;
  const categories = useMemo(() => {
    const cats = new Set([
      ...sounds.flatMap((s) => (s.tabs?.length ? s.tabs : [s.category])).filter(Boolean),
      ...customCategories
    ]);
    cats.delete("Todos");
    return ["Todos", "Favoritos", ...Array.from(cats).sort()];
  }, [sounds, customCategories]);

  const organizeSoundTabs = (sound) => {
    setPendingImport({
      title: `Organizar abas de "${sound.name}"`,
      origin: sound.source || "local",
      initialTabs: sound.tabs || ["Todos", sound.category].filter(Boolean),
      onConfirm: (tabs) => call("/api/sounds/set-tabs", { id: sound.id, tabs }).then(() => setToast("Abas atualizadas!")),
    });
  };

  const openCreateTab = () => {
    setPromptState({
      title: "Nova aba do Soundboard",
      value: "",
      onConfirm: async (name) => {
        const trimmed = String(name || "").trim();
        if (!trimmed) return;
        const exists = categories.some((item) => item.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
        if (exists || ["todos", "favoritos"].includes(trimmed.toLocaleLowerCase())) {
          setToast("Essa aba já existe.");
          return;
        }

        const previous = customCategories;
        const next = [...customCategories, trimmed];
        setCustomCategories(next);
        setCategory(trimmed);
        try {
          await call("/api/custom-categories/save", { type: "soundboard", categories: next });
          setToast(`Aba "${trimmed}" criada.`);
        } catch (error) {
          setCustomCategories(previous);
          setCategory("Todos");
          setToast(error.message);
        }
      }
    });
  };

  const deleteCurrentTab = async () => {
    if (!customCategories.includes(category)) return;
    if (!confirm(`Excluir a aba "${category}"? Os sons continuam no Soundboard.`)) return;
    try {
      await call("/api/custom-categories/delete", { type: "soundboard", category });
      setCustomCategories(customCategories.filter((item) => item !== category));
      setCategory("Todos");
      setToast(`Aba "${category}" excluída.`);
    } catch (error) {
      setToast(error.message);
    }
  };

  const filtered = useMemo(() => {
    let list = sounds;
    if (category === "Favoritos") list = list.filter((s) => soundboardFavorites.includes(s.id));
    else if (category !== "Todos") list = list.filter((s) => (s.tabs?.length ? s.tabs : [s.category]).includes(category));
    if (sourceFilter !== "Todos") {
      const source = sourceFilter.toLowerCase();
      if (source === "favoritos") list = list.filter((s) => soundboardFavorites.includes(s.id));
      else if (source === "recentes") list = list.filter((s) => Date.now() / 1000 - Number(s.created_at || 0) < 60 * 60 * 24 * 14);
      else if (source === "importados do pc") list = list.filter((s) => (s.source || "local") === "local");
      else list = list.filter((s) => (s.source || "local") === source);
    }
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
  }, [sounds, category, sourceFilter, query, soundboardFavorites]);

  const playerBySound = useMemo(() => {
    const map = {};
    (state.players || []).forEach((p) => { if (p.soundId) map[p.soundId] = p; });
    return map;
  }, [state.players]);

  const runImportFiles = async (paths, tabs) => {
    const mfsounds = paths.filter(p => p.toLowerCase().endsWith(".mfsound"));
    const normalAudios = paths.filter(p => !p.toLowerCase().endsWith(".mfsound"));

    let importedCount = 0;
    if (mfsounds.length) {
      for (const mfs of mfsounds) {
        try {
          await call("/api/sounds/import-mfsound", { path: mfs, tabs });
          importedCount++;
        } catch (err) {
          console.error("Erro ao importar mfsound:", err);
        }
      }
      if (importedCount > 0) setToast?.(`${importedCount} pacote(s) importado(s)!`);
    }

    if (normalAudios.length) {
      await call("/api/sounds/add", { paths: normalAudios, tabs });
    }
  };

  const chooseDestination = (payload) => {
    const mode = state.settings?.importDestinationMode || "ask";
    if (mode !== "ask") {
      payload.onConfirm(state.settings?.importDestinationTabs?.length ? state.settings.importDestinationTabs : ["Todos"]);
      return;
    }
    setPendingImport(payload);
  };

  const addSounds = async () => {
    if (isLimitReached) {
      setToast?.("Limite de armazenamento do Soundboard atingido! Aumente o limite nas configurações para importar mais sons.");
      return;
    }
    const paths = await window.micfudiddo?.openAudioFiles?.();
    if (paths?.length) {
      chooseDestination({
        title: "Escolher abas para os arquivos",
        origin: "Importados do PC",
        onConfirm: (tabs) => runImportFiles(paths, tabs)
      });
    }
  };

  const addFolders = async () => {
    if (isLimitReached) {
      setToast?.("Limite de armazenamento do Soundboard atingido! Aumente o limite nas configurações para importar mais sons.");
      return;
    }
    const folder = await window.micfudiddo?.openAudioFolders?.();
    if (folder && folder.length) {
      chooseDestination({
        title: "Escolher abas para a pasta",
        origin: "Importados do PC",
        onConfirm: (tabs) => call("/api/sounds/add-folder", { paths: folder, tabs })
      });
    }
  };

  const importDropped = async (e) => {
    e.preventDefault();
    setDragActive(false);
    if (isLimitReached) {
      setToast?.("Limite de armazenamento do Soundboard atingido! Aumente o limite nas configurações para importar mais sons.");
      return;
    }
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    const paths = window.micfudiddo?.audioPathsFromDrop?.(files) || [];
    chooseDestination({
      title: "Escolher abas para os arquivos soltos",
      origin: "Importados do PC",
      onConfirm: (tabs) => runImportFiles(paths, tabs)
    });
  };

  const deleteSounds = async (ids) => {
    if (!ids?.length) return;
    if (ids.length === 1 && category !== "Todos" && category !== "Favoritos") {
      const sound = sounds.find((s) => s.id === ids[0]);
      const tabs = sound?.tabs || [];
      if (tabs.includes(category) && tabs.length > 1) {
        const onlyHere = confirm(`Remover "${sound.name}" apenas da aba "${category}"?\n\nOK remove so desta aba. Cancelar continua com a exclusao normal.`);
        if (onlyHere) {
          await call("/api/sounds/remove-from-tab", { id: ids[0], tab: category });
          setToast(`Som removido apenas da aba "${category}".`);
          return;
        }
      }
    }
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

  return (
    <div
      className="soundboardPage"
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
      <h2 className="srOnly">Soundboard Studio</h2>
        {isLimitReached && (
          <div style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#ef4444",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "11px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginTop: 10
          }}>
            <WarningCircle size={16} /><span>Limite de Armazenamento Atingido ({storageMB.toFixed(1)} MB / {storageLimitMB} MB)</span>
          </div>
        )}
      <div className="pageToolbar">
        <div className="toolbarLeft">
          <div className="searchBar" style={{ marginBottom: 0, flex: 1 }}>
            <MagnifyingGlass size={16} className="searchIcon" />
            <input placeholder="Buscar som..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="toolbarRight">
          <div className="importButtonGroup">
            <button className="btn btn-ghost" onClick={() => {
              if (isLimitReached) {
                setToast?.("Limite de armazenamento do Soundboard atingido! Aumente o limite nas configurações para importar mais sons.");
                return;
              }
              setPromptState({
                title: "Importar Link de Pacote",
                value: "",
                onConfirm: (url) => {
                  if (url && url.trim()) {
                    setToast("Baixando pacote da nuvem...");
                    call("/api/sounds/import-cloud", { url: url.trim() }).catch(e => setToast("Erro: " + e.message));
                  }
                }
              });
            }} title="Importar pacote .mfsound através de um link (Catbox, etc)"><CloudArrowDown size={14} /> Importar Link</button>
            <button className="btn btn-ghost" onClick={addSounds} title="Importar arquivos de áudio ou pacotes .mfsound"><UploadSimple size={14} /> Importar Arquivos</button>
            <button className="btn btn-ghost" onClick={addFolders} title="Importar pasta contendo sons"><FolderOpen size={14} /> Importar Pasta</button>
          </div>
          <button className="btn btn-ghost" onClick={() => window.micfudiddo?.openPath?.(state.folders?.sounds)} title="Abrir pasta onde os sons são gravados"><FolderOpen size={14} /> Abrir Pasta</button>
          <button className="btn btn-ghost" title="Tocar som aleatório" aria-label="Tocar som aleatório" onClick={() => call("/api/sounds/random").catch((e) => setToast(e.message))}><Shuffle size={16} /></button>
          <button className="btn btn-ghost" title="Parar todos os sons" aria-label="Parar todos os sons" onClick={() => call("/api/sounds/stop").catch(() => {})}><StopCircle size={16} /></button>
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
        {state.settings?.clipEnabled && (
          <button
            onClick={() => {
              const duration = Number(state.settings?.clipDuration || 30);
              setToast("🎬 Salvando clipe...");
              call("/api/record/clip", { duration })
                .then(() => setToast(`🎬 Clipe de ${duration}s salvo!`))
                .catch((e) => setToast("Erro ao clipar: " + e.message));
            }}
            title="Salvar os últimos segundos do áudio em segundo plano"
          >
            <Scissors size={14} weight="bold" /> Clipar ({state.settings?.clipDuration || "30"}s)
          </button>
        )}
      </div>

      <div className="soundboardFilters">
      <div className="categoryPills" aria-label="Abas do Soundboard">
        {categories.map((cat) => (
          <button key={cat} className={category === cat ? "active" : ""} onClick={() => setCategory(cat)}>
            {cat === "Todos" ? <SquaresFour size={14} /> : cat === "Favoritos" ? <Heart size={14} /> : <MusicNotes size={14} />}
            {cat}
          </button>
        ))}
        <button className="newSoundboardTab" onClick={openCreateTab} title="Criar uma aba vazia">
          <Plus size={14} weight="bold" /> Nova aba
        </button>
        {customCategories.includes(category) && (
          <button className="deleteSoundboardTab" onClick={deleteCurrentTab} title={`Excluir a aba ${category}`}>
            <Trash size={14} /> Excluir aba
          </button>
        )}
      </div>

      <select className="soundSourceSelect" aria-label="Filtrar sons" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
        <option value="Todos">Todas as origens</option>
        <optgroup label="Origem">
          {["YouTube", "TikTok", "Importados do PC", "Online"].map((filter) => <option key={filter} value={filter}>{filter}</option>)}
        </optgroup>
        <optgroup label="Periodo"><option value="Recentes">Adicionados recentemente</option></optgroup>
      </select>
      </div>

      <div className={`soundboardLayout ${selected && selectedSound !== null ? "" : "no-panel"}`}>
        <div className="soundboardMain">
          <div className="soundGrid">
            {!filtered.length && <div className="soundboardEmpty"><MusicNotes size={32} weight="duotone" /><p>{query ? "Nenhum som encontrado" : "Nenhum som nesta aba"}</p></div>}
            {filtered.map((sound) => {
              const player = playerBySound[sound.id];
              const isPlaying = player?.state === "playing";
              const isFav = soundboardFavorites.includes(sound.id);
              return (
                <div
                  key={sound.id}
                  className={`soundCard ${selected?.id === sound.id && selectedSound !== null ? "active" : ""} ${isPlaying ? "playing" : ""}`}
                  tabIndex={0}
                  aria-label={sound.name}
                  onClick={() => { setSelectedSound(sound.id); }}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && ["Enter", " "].includes(e.key)) { e.preventDefault(); setSelectedSound(sound.id); }
                  }}
                  onDoubleClick={() => {
                    call("/api/sounds/play", { id: sound.id }).catch((e) => setToast(e.message));
                  }}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, sound }); }}
                >
                  <div className="soundCover" style={{ background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 20%, var(--bg-card-secondary))` }}>
                    {sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : <MusicNotes size={18} color={sound.color || "var(--purple)"} />}
                  </div>
                  <div className="soundCardInfo">
                    <div className="soundName" title={sound.name}>{sound.name.replace(/\.[^/.]+$/, "")}</div>
                    <div className="soundCategory">{formatTime(sound.duration)} • {sound.plays || 0} plays</div>
                    {sound.shortcut && <span className="soundCardShortcut"><Keyboard size={10} /> {sound.shortcut}</span>}
                  </div>
                  <div className="soundCardActions" onDoubleClick={(e) => e.stopPropagation()}>
                    <button className={`soundcard-fav-btn ${isFav ? "favorited" : ""}`}
                      title={isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                      aria-label={`${isFav ? "Remover dos favoritos" : "Adicionar aos favoritos"}: ${sound.name}`}
                      onClick={(e) => { e.stopPropagation(); toggleSoundboardFavorite(sound.id); }}>
                      <Heart size={16} weight={isFav ? "fill" : "regular"} />
                    </button>
                    <button title="Mais opções" aria-label={`Mais opções: ${sound.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setContextMenu({ x: rect.left, y: rect.bottom, sound });
                      }}><DotsThreeVertical size={16} weight="bold" /></button>
                    {isPlaying && <Play size={12} weight="fill" className="soundPlayingIcon" aria-label="Tocando" />}
                  </div>
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
            onChooseTabs={() => organizeSoundTabs(selected)}
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

      {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}>
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
                  } else {
                    setToast("O nome do som não pode ser vazio.");
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
              <FolderOpen size={14} /> Mover arquivo para pasta
            </button>
            <button onClick={() => {
              const currentSound = contextMenu.sound;
              setContextMenu(null);
              organizeSoundTabs(currentSound);
            }}>
              <FolderOpen size={14} /> Organizar em abas
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
            <button onClick={async () => {
              const s = contextMenu.sound;
              setContextMenu(null);
              const defaultName = `${s.name}.mfsound`;
              const filePath = await window.micfudiddo?.saveMfsoundPath?.(defaultName);
              if (filePath) {
                setToast("Exportando...");
                try {
                  await call("/api/sounds/export-mfsound", { id: s.id, exportPath: filePath });
                } catch (e) {
                  setToast("Erro: " + e.message);
                }
              }
            }}>
              <DownloadSimple size={14} /> Exportar como .mfsound
            </button>
            <button onClick={() => {
              const s = contextMenu.sound;
              setContextMenu(null);
              setToast("Gerando link mágico, aguarde...");
              call("/api/sounds/share-cloud", { id: s.id }).then(res => {
                if (res.link) {
                  setToast("Link mágico gerado!");
                  setPromptState({
                    title: "Compartilhamento em Nuvem",
                    value: res.link,
                    readOnly: true,
                    confirmText: "Copiar Link",
                    closeOnConfirm: true,
                    onConfirm: (url) => {
                      copyTextToClipboard(url)
                        .then(() => setToast("Link copiado para a área de transferência!"))
                        .catch((err) => setToast("Erro ao copiar: " + err.message));
                    }
                  });
                }
              }).catch(e => setToast("Erro ao fazer upload: " + e.message));
            }}>
              <CloudArrowUp size={14} /> Copiar Link de Compartilhamento
            </button>
            <button onClick={() => {
              copyTextToClipboard(contextMenu.sound.path)
                .then(() => setToast("Caminho do áudio copiado!"))
                .catch((err) => setToast("Erro ao copiar: " + err.message));
              setContextMenu(null);
            }}>
              <Sparkle size={14} /> Compartilhar (Copiar Path)
            </button>
            <button className="danger" onClick={() => { deleteSounds([contextMenu.sound.id]); setContextMenu(null); }}>
              <Trash size={14} /> Excluir
            </button>
          </ContextMenu>
      )}
      {pendingImport && (
        <DestinationPickerModal
          title={pendingImport.title}
          origin={pendingImport.origin}
          categories={categories}
          initialTabs={pendingImport.initialTabs}
          onClose={() => setPendingImport(null)}
          onConfirm={async (tabs) => {
            const createdTabs = tabs.filter((tab) => tab !== "Todos" && !categories.includes(tab));
            if (createdTabs.length) {
              const next = Array.from(new Set([...customCategories, ...createdTabs]));
              setCustomCategories(next);
              try {
                await call("/api/custom-categories/save", { type: "soundboard", categories: next });
              } catch (error) {
                setToast(error.message);
              }
            }
            pendingImport.onConfirm(tabs);
            setPendingImport(null);
          }}
        />
      )}
    </div>
  );
}

function DestinationPickerModal({ title, origin, categories, initialTabs, onClose, onConfirm }) {
  const baseTabs = useMemo(() => {
    const names = new Set(["Todos", ...(categories || []).filter((c) => c !== "Favoritos")]);
    return Array.from(names);
  }, [categories]);
  const [selected, setSelected] = useState(() => new Set(initialTabs?.length ? initialTabs : ["Todos"]));
  const [newTab, setNewTab] = useState("");

  const toggle = (tab) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (tab === "Todos") next.add("Todos");
      else if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      if (!next.size) next.add("Todos");
      return next;
    });
  };

  const addTab = () => {
    const name = newTab.trim();
    if (!name) return;
    setSelected((prev) => new Set([...prev, "Todos", name]));
    setNewTab("");
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent destinationModal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 22 }}>
        <div className="modalHeader" style={{ padding: 0, borderBottom: "none" }}>
          <h3 className="modalTitle" style={{ margin: 0 }}>{title}</h3>
          <button className="closeBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5, margin: "10px 0 14px" }}>
          Escolha em quais abas este audio vai aparecer. Um mesmo arquivo pode estar em varias abas sem duplicar no disco.
        </p>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>Origem: {origin || "local"}</div>
        <div className="destinationTabGrid">
          {baseTabs.map((tab) => (
            <button key={tab} className={selected.has(tab) ? "active" : ""} onClick={() => toggle(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input value={newTab} onChange={(e) => setNewTab(e.target.value)} placeholder="Criar nova aba..." />
          <button className="btn btn-ghost" onClick={addTab}>Adicionar</button>
        </div>
        <div className="modalFooter" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(Array.from(selected))}>Confirmar destino</button>
        </div>
      </div>
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
  onChooseTabs
}) {
  const nameInputRef = React.useRef(null);
  const [name, setName] = useState(sound.name);
  const [shortcut, setShortcut] = useState(sound.shortcut || "");
  const [volume, setVolume] = useState(sound.volume);
  const [loop, setLoop] = useState(!!sound.loop);

  useEffect(() => {
    if (nameInputRef.current !== document.activeElement) {
      setName(sound.name);
    }
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
            <Heart size={18} weight={isFavorite ? "fill" : "regular"} />
          </button>
        </div>
        
        <p className="panelDesc" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
          Abas: <strong style={{ color: "var(--text-secondary)" }}>{(sound.tabs?.length ? sound.tabs : [sound.category || "Geral"]).filter((tab) => tab !== "Todos").join(", ") || "Todos"}</strong>
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
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => handleSaveField("name", name)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.target.blur();
                }
              }}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Abas do som</label>
            <button className="btn btn-ghost" onClick={onChooseTabs}><FolderOpen size={14} /> Organizar em abas</button>
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
