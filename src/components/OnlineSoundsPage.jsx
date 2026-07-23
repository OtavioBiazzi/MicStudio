import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, FadersHorizontal, YoutubeLogo, Lightning, ChartBar,
  Sparkle, PauseCircle, Play, CheckCircle, Plus, MusicNotes, Microphone, X, SpeakerHigh
} from "@phosphor-icons/react";
import { formatTime } from "../utils";
import { YoutubeImportModal, TTSModal } from "./Modals";
import { API } from "../apiClient";

export function OnlineSoundsPage({ state, call, setToast, soundboardFavorites, toggleSoundboardFavorite }) {
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedPill, setSelectedPill] = useState("Populares");
  const [sounds, setSounds] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState({});
  const audioRef = useRef(null);

  const [minDur, setMinDur] = useState(0);
  const [maxDur, setMaxDur] = useState(300);
  const [showFilters, setShowFilters] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [showTTSModal, setShowTTSModal] = useState(false);
  const [pendingSoundDestination, setPendingSoundDestination] = useState(null);

  const parseDuration = (durVal) => {
    if (durVal === null || durVal === undefined) return 3.0;
    if (typeof durVal === "number") return durVal;
    const durStr = String(durVal).trim();
    if (!durStr || durStr === "N/A" || durStr === "") return 3.0;
    const num = parseFloat(durStr.replace("s", ""));
    return isNaN(num) ? 3.0 : num;
  };

  const filteredSounds = useMemo(() => {
    return sounds.filter((sound) => {
      const dur = parseDuration(sound.duration);
      if (dur < minDur) return false;
      if (maxDur < 300 && dur > maxDur) return false;
      return true;
    });
  }, [sounds, minDur, maxDur]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const loadingDurationsRef = useRef(new Set());

  useEffect(() => {
    sounds.forEach((sound) => {
      if (!sound.duration || sound.duration === "N/A" || sound.duration === "Nuvem") {
        if (loadingDurationsRef.current.has(sound.id)) return;
        loadingDurationsRef.current.add(sound.id);

        const audio = new Audio();
        audio.src = sound.url;
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const dur = audio.duration;
          if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
            setSounds((prev) =>
              prev.map((s) =>
                s.id === sound.id ? { ...s, duration: `${dur.toFixed(1)}s` } : s
              )
            );
          } else {
            setSounds((prev) =>
              prev.map((s) =>
                s.id === sound.id ? { ...s, duration: "Nuvem" } : s
              )
            );
          }
        };
        audio.onerror = () => {
          setSounds((prev) =>
            prev.map((s) =>
              s.id === sound.id ? { ...s, duration: "Nuvem" } : s
            )
          );
        };
        audio.load();
      }
    });
  }, [sounds]);

  const loaderRef = useRef(null);

  const loadSounds = async (pageNumber, queryStr, isAppend) => {
    if (pageNumber === 1) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      let endpoint = `${API}/api/sounds/trending?page=${pageNumber}`;
      if (queryStr) {
        endpoint = `${API}/api/sounds/search?q=${encodeURIComponent(queryStr)}&page=${pageNumber}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) throw new Error("Erro na requisição dos sons online");
      const res = await response.json();
      const newSounds = res.sounds || [];

      if (newSounds.length < 15) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }

      if (isAppend) {
        setSounds((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const filteredNew = newSounds.filter((s) => !seen.has(s.id));
          return [...prev, ...filteredNew];
        });
      } else {
        setSounds(newSounds);
      }
    } catch (err) {
      setToast("Erro ao carregar sons: " + err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    loadSounds(1, activeQuery, false);
  }, [activeQuery]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !loading && !loadingMore) {
          setPage((prevPage) => {
            const nextPage = prevPage + 1;
            loadSounds(nextPage, activeQuery, true);
            return nextPage;
          });
        }
      },
      { threshold: 0.1 }
    );

    const currentLoader = loaderRef.current;
    if (currentLoader) {
      observer.observe(currentLoader);
    }

    return () => {
      if (currentLoader) {
        observer.unobserve(currentLoader);
      }
    };
  }, [hasMore, loading, loadingMore, activeQuery]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      setSelectedPill("");
      setActiveQuery(queryInput);
    }
  };

  const handlePillClick = (pill) => {
    setSelectedPill(pill);
    setQueryInput("");
    if (pill === "Populares") {
      setActiveQuery("");
    } else if (pill === "Recentes") {
      setActiveQuery("recent");
    } else if (pill === "Recomendados") {
      setActiveQuery("recommended");
    }
  };

  const handlePlayPreview = async (sound) => {
    const isPlaying = state.player?.state === "playing" && state.player?.soundId === sound.id;
    if (isPlaying) {
      await call("/api/sounds/stop").catch(() => {});
    } else {
      await call("/api/sounds/play-online", {
        id: sound.id,
        url: sound.url,
        name: sound.name
      }).catch((e) => {
        setToast("Erro: " + e.message);
      });
    }
  };

  const handleImport = async (sound, tabs = ["Todos"]) => {
    setDownloading((prev) => ({ ...prev, [sound.id]: "downloading" }));
    try {
      await call("/api/sounds/download", {
        id: sound.id,
        url: sound.url,
        name: sound.name,
        category: "Online",
        color: sound.color || "#8B5CF6",
        tabs,
      });
      setDownloading((prev) => ({ ...prev, [sound.id]: "imported" }));
    } catch (err) {
      setToast("Falha ao adicionar som: " + err.message);
      setDownloading((prev) => ({ ...prev, [sound.id]: null }));
    }
  };

  return (
    <div>
      <div className="labHeader">
        <h2>🌐 Explorar Biblioteca Online</h2>
        <p>Descubra e baixe novos efeitos sonoros e memes instantaneamente para sua biblioteca</p>
      </div>

      <div className="pageToolbar" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="toolbarLeft" style={{ display: "flex", gap: 12, width: "100%", alignItems: "center" }}>
          <div className="searchBar" style={{ marginBottom: 0, flex: 1 }}>
            <MagnifyingGlass size={16} className="searchIcon" />
            <input
              placeholder="Buscar sons online (Aperte Enter para buscar)..."
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <button
            onClick={() => {
              setShowFilters(!showFilters);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              background: showFilters ? "var(--purple-soft)" : "rgba(255, 255, 255, 0.05)",
              border: showFilters ? "1px solid var(--purple)" : "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: showFilters ? "var(--text)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              height: 38,
              transition: "all 0.2s"
            }}
          >
            <FadersHorizontal size={16} />
            <span>Filtros</span>
          </button>
          <button
            onClick={() => {
              setShowYoutubeModal(true);
              setShowFilters(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              background: showYoutubeModal ? "var(--purple-soft)" : "rgba(255, 255, 255, 0.05)",
              border: showYoutubeModal ? "1px solid var(--purple)" : "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: showYoutubeModal ? "var(--text)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              height: 38,
              transition: "all 0.2s"
            }}
          >
            <YoutubeLogo size={16} color="#FF0000" />
            <span>Adicionar Som do YouTube/TikTok</span>
          </button>
          <button
            onClick={() => {
              setShowTTSModal(true);
              setShowFilters(false);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 16px",
              background: showTTSModal ? "var(--purple-soft)" : "rgba(255, 255, 255, 0.05)",
              border: showTTSModal ? "1px solid var(--purple)" : "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: showTTSModal ? "var(--text)" : "var(--text-secondary)",
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 12,
              height: 38,
              transition: "all 0.2s"
            }}
          >
            <Microphone size={16} color="var(--purple)" />
            <span>Gerar Voz por Texto (TTS)</span>
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 4 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="collapsible-filters-panel" style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid var(--border)",
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                flexWrap: "wrap"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 240 }}>
                  <SpeakerHigh size={16} color="var(--cyan)" />
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 112 }}>Volume da prévia</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(Number(state.settings?.onlinePreviewVolume ?? 0.25) * 100)}
                    onChange={(e) => call("/api/settings", { onlinePreviewVolume: String(Number(e.target.value) / 100) })}
                    style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, accentColor: "var(--cyan)" }}
                    aria-label="Volume da prévia dos sons online"
                  />
                  <span style={{ fontSize: 11, color: "var(--text-secondary)", minWidth: 34, textAlign: "right" }}>
                    {Math.round(Number(state.settings?.onlinePreviewVolume ?? 0.25) * 100)}%
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                  <Lightning size={16} color="var(--cyan)" />
                  <span>Filtrar Duração (s):</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 55 }}>Mín: {minDur}s</span>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={1}
                    value={minDur}
                    onChange={(e) => setMinDur(Math.min(Number(e.target.value), maxDur))}
                    style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, accentColor: "var(--cyan)" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 55 }}>Máx: {maxDur === 300 ? "300s+" : `${maxDur}s`}</span>
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={1}
                    value={maxDur}
                    onChange={(e) => setMaxDur(Math.max(Number(e.target.value), minDur))}
                    style={{ flex: 1, height: 4, background: "var(--border)", borderRadius: 2, accentColor: "var(--purple)" }}
                  />
                </div>

                <button
                  onClick={() => { setMinDur(0); setMaxDur(300); }}
                  style={{
                    padding: "4px 8px",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xs)",
                    color: "var(--text-muted)",
                    fontSize: 10,
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  Limpar
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="categoryPills" style={{ marginTop: 12 }}>
        <button
          className={selectedPill === "Populares" ? "active" : ""}
          onClick={() => handlePillClick("Populares")}
        >
          <ChartBar size={12} style={{ marginRight: 6 }} /> Populares
        </button>
        <button
          className={selectedPill === "Recentes" ? "active" : ""}
          onClick={() => handlePillClick("Recentes")}
        >
          <Lightning size={12} style={{ marginRight: 6 }} /> Recentes
        </button>
        <button
          className={selectedPill === "Recomendados" ? "active" : ""}
          onClick={() => handlePillClick("Recomendados")}
        >
          <Sparkle size={12} style={{ marginRight: 6 }} /> Recomendados
        </button>
      </div>

      {loading && page === 1 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 0",
            gap: 12,
            color: "var(--text-muted)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: "var(--radius-md)",
            background: "rgba(255,255,255,0.01)",
            marginTop: 16,
          }}
        >
          <div
            className="spinner"
            style={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.08)",
              borderTopColor: "var(--purple)",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span>Buscando sons na nuvem...</span>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div className="online-library-grid">
            {filteredSounds.map((sound) => {
              const status = downloading[sound.id];
              const isAlreadyInLocal = state.sounds?.some((s) => s.name === sound.name);
              const isPlaying = state.player?.state === "playing" && state.player?.soundId === sound.id;

              return (
                <div key={sound.id} className="online-sound-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <button className={`play-btn ${isPlaying ? "playing" : ""}`} onClick={() => handlePlayPreview(sound)}>
                      {isPlaying ? <PauseCircle size={20} weight="fill" /> : <Play size={20} weight="fill" />}
                    </button>
                    
                    <div className="online-sound-cover" style={{ width: 34, height: 34, borderRadius: "50%", background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 20%, var(--bg-card-secondary))`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${sound.color || "var(--purple-soft)"}`, flexShrink: 0 }}>
                      <MusicNotes size={16} color={sound.color || "var(--purple)"} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {sound.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                        {sound.category || "Online"} • {sound.plays} plays • {sound.duration === "Nuvem" ? "Nuvem" : (sound.duration && sound.duration !== "N/A" ? formatTime(sound.duration) : "...")}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {status === "imported" || isAlreadyInLocal ? (
                      <button className="import-btn imported" disabled style={{ width: "100%" }}>
                        <CheckCircle size={14} weight="bold" /> Adicionado ao Soundboard
                      </button>
                    ) : (
                      <button
                        className="import-btn"
                        onClick={() => setPendingSoundDestination(sound)}
                        disabled={status === "downloading"}
                        style={{ width: "100%" }}
                      >
                        {status === "downloading" ? (
                          <span>Adicionando...</span>
                        ) : (
                          <>
                            <Plus size={14} weight="bold" style={{ marginRight: 6 }} /> Adicionar ao Soundboard
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div
              ref={loaderRef}
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "24px 0",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              {loadingMore ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    className="spinner"
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.08)",
                      borderTopColor: "var(--purple)",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  <span>Carregando mais sons...</span>
                </div>
              ) : (
                <span>Desça para carregar mais</span>
              )}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {showYoutubeModal && (
          <YoutubeImportModal
            onClose={() => setShowYoutubeModal(false)}
            call={call}
            setToast={setToast}
            state={state}
          />
        )}
        {showTTSModal && (
          <TTSModal
            onClose={() => setShowTTSModal(false)}
            call={call}
            setToast={setToast}
          />
        )}
        {pendingSoundDestination && (
          <OnlineDestinationModal
            sound={pendingSoundDestination}
            state={state}
            onClose={() => setPendingSoundDestination(null)}
            onConfirm={(tabs) => {
              const sound = pendingSoundDestination;
              setPendingSoundDestination(null);
              handleImport(sound, tabs);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function OnlineDestinationModal({ sound, state, onClose, onConfirm }) {
  const [selectedTabs, setSelectedTabs] = useState(["Todos", "Online"]);
  const [customTabs, setCustomTabs] = useState([]);
  const [newTabName, setNewTabName] = useState("");

  const destinationTabs = useMemo(() => {
    const names = new Set(["Todos", "Online", ...(state?.soundCategories || []).filter((name) => name !== "Favoritos"), ...customTabs]);
    return Array.from(names);
  }, [state?.soundCategories, customTabs]);

  const toggleTab = (tab) => {
    setSelectedTabs((prev) => {
      if (tab === "Todos") return prev.includes("Todos") ? prev : ["Todos", ...prev];
      const next = prev.includes(tab) ? prev.filter((item) => item !== tab) : [...prev, tab];
      return next.length ? (next.includes("Todos") ? next : ["Todos", ...next]) : ["Todos"];
    });
  };

  const addCustomTab = () => {
    const name = newTabName.trim();
    if (!name) return;
    setCustomTabs((prev) => prev.includes(name) ? prev : [...prev, name]);
    setSelectedTabs((prev) => prev.includes(name) ? prev : [...prev, name]);
    setNewTabName("");
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent destinationModal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 22 }}>
        <div className="modalHeader" style={{ padding: 0, borderBottom: "none" }}>
          <h3 className="modalTitle" style={{ margin: 0 }}>Salvar no Soundboard</h3>
          <button className="closeBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.5, margin: "10px 0 14px" }}>
          Escolha em quais abas "{sound?.name}" vai aparecer. O arquivo sera baixado uma vez so.
        </p>
        <div className="destinationTabGrid">
          {destinationTabs.map((tab) => (
            <button key={tab} className={selectedTabs.includes(tab) ? "active" : ""} onClick={() => toggleTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            value={newTabName}
            onChange={(e) => setNewTabName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustomTab(); }}
            placeholder="Criar nova aba..."
          />
          <button className="btn btn-ghost" onClick={addCustomTab}>Adicionar</button>
        </div>
        <div className="modalFooter" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onConfirm(selectedTabs)}>Adicionar ao Soundboard</button>
        </div>
      </div>
    </div>
  );
}
