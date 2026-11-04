import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass, FadersHorizontal, YoutubeLogo, Lightning, ChartBar,
  Sparkle, Pause, Play, Check, Plus, MusicNotes, X, SpeakerHigh, Broadcast
} from "@phosphor-icons/react";
import { formatTime } from "../utils";
import { YoutubeImportModal } from "./Modals";
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

  useEffect(() => {
    if (!showFilters) return undefined;
    const close = (event) => {
      if (!event.target.closest?.(".exFilterWrap")) setShowFilters(false);
    };
    const timer = setTimeout(() => window.addEventListener("click", close), 0);
    return () => { clearTimeout(timer); window.removeEventListener("click", close); };
  }, [showFilters]);

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

  const filtersActive = minDur > 0 || maxDur < 300;
  const previewVolume = Math.round(Number(state.settings?.onlinePreviewVolume ?? 0.25) * 100);
  const searching = Boolean(activeQuery) && !["recent", "recommended"].includes(activeQuery);
  const clearFilters = () => { setMinDur(0); setMaxDur(300); };
  const runSearch = () => { setSelectedPill(""); setActiveQuery(queryInput.trim()); };
  const TABS = [
    { id: "Populares", icon: ChartBar },
    { id: "Recentes", icon: Lightning },
    { id: "Recomendados", icon: Sparkle }
  ];

  return (
    <div className="exPage">
      <h2 className="srOnly">Explorar Sons</h2>

      <header className="exHeader">
        <div>
          <h1>Explorar sons</h1>
          <p>Biblioteca online: ouça uma prévia e adicione ao seu soundboard.</p>
        </div>
        <button className="btn btn-ghost exYoutube" onClick={() => { setShowYoutubeModal(true); setShowFilters(false); }}>
          <YoutubeLogo size={16} weight="fill" /> Baixar do YouTube ou TikTok
        </button>
      </header>

      <div className="exToolbar">
        <div className="exSearch">
          <MagnifyingGlass size={16} />
          <input
            placeholder="Buscar sons (ex.: risada, explosão, meme)..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {queryInput && (
            <button className="exClear" aria-label="Limpar busca" onClick={() => { setQueryInput(""); handlePillClick("Populares"); }}>
              <X size={14} />
            </button>
          )}
          <button className="exSearchBtn" onClick={runSearch}>Buscar</button>
        </div>

        <div className="exFilterWrap">
          <button className={`exFilterBtn ${showFilters || filtersActive ? "on" : ""}`} onClick={() => setShowFilters((open) => !open)} aria-expanded={showFilters}>
            <FadersHorizontal size={16} /> Filtros {filtersActive && <i className="exDot" />}
          </button>
          {showFilters && (
            <div className="exPopover" role="dialog" aria-label="Filtros">
              <div className="exPopoverBlock">
                <div className="exPopoverTitle">Duração do som <em>{minDur}s a {maxDur === 300 ? "300s ou mais" : `${maxDur}s`}</em></div>
                <label className="exSliderRow">
                  <span>Mínima</span>
                  <input type="range" min={0} max={300} step={1} value={minDur} onChange={(e) => setMinDur(Math.min(Number(e.target.value), maxDur))} />
                </label>
                <label className="exSliderRow">
                  <span>Máxima</span>
                  <input type="range" min={0} max={300} step={1} value={maxDur} onChange={(e) => setMaxDur(Math.max(Number(e.target.value), minDur))} />
                </label>
              </div>
              <div className="exPopoverBlock">
                <div className="exPopoverTitle"><SpeakerHigh size={14} /> Volume das prévias <em>{previewVolume}%</em></div>
                <input
                  className="exVolume"
                  type="range" min={0} max={100} step={1} value={previewVolume}
                  onChange={(e) => call("/api/settings", { onlinePreviewVolume: String(Number(e.target.value) / 100) })}
                  aria-label="Volume da prévia dos sons online"
                />
              </div>
              <div className="exPopoverFooter">
                <button className="btn btn-ghost" onClick={clearFilters} disabled={!filtersActive}>Limpar duração</button>
                <button className="btn btn-primary" onClick={() => setShowFilters(false)}>Pronto</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="exTabsRow">
        <div className="exTabs" role="tablist">
          {TABS.map(({ id, icon: Icon }) => (
            <button key={id} role="tab" aria-selected={selectedPill === id} className={selectedPill === id ? "active" : ""} onClick={() => handlePillClick(id)}>
              <Icon size={14} /> {id}
            </button>
          ))}
        </div>
        <span className="exCount">
          {searching ? <>Resultados para <strong>"{activeQuery}"</strong> · </> : null}
          {loading && page === 1 ? "buscando..." : `${filteredSounds.length} ${filteredSounds.length === 1 ? "som" : "sons"}`}
        </span>
      </div>

      {filtersActive && (
        <div className="exChips">
          <button className="exChip" onClick={clearFilters}>
            Duração: {minDur}s a {maxDur === 300 ? "300s+" : `${maxDur}s`} <X size={12} />
          </button>
        </div>
      )}

      {loading && page === 1 ? (
        <div className="exGrid" aria-busy="true" aria-label="Carregando sons">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="exCard exSkeleton"><span className="exPlay" /><div className="exInfo"><i /><i /></div></div>
          ))}
        </div>
      ) : (
        <>
          {filteredSounds.length === 0 && (
            <div className="exEmpty">
              <Broadcast size={34} weight="duotone" />
              <h3>{sounds.length > 0 ? "Nenhum som com esse filtro" : "Nenhum som encontrado"}</h3>
              <p>{sounds.length > 0 ? "A duração escolhida está escondendo os resultados." : "Tente outra palavra ou volte para Populares."}</p>
              {sounds.length > 0
                ? <button className="btn btn-primary" onClick={clearFilters}>Limpar filtros</button>
                : <button className="btn btn-primary" onClick={() => { setQueryInput(""); handlePillClick("Populares"); }}>Ver populares</button>}
            </div>
          )}

          <div className="exGrid">
            {filteredSounds.map((sound) => {
              const status = downloading[sound.id];
              const isAlreadyInLocal = state.sounds?.some((s) => s.name === sound.name);
              const isPlaying = state.player?.state === "playing" && state.player?.soundId === sound.id;
              const added = status === "imported" || isAlreadyInLocal;
              const durationText = sound.duration === "Nuvem" ? "Nuvem" : (sound.duration && sound.duration !== "N/A" ? formatTime(sound.duration) : "...");

              return (
                <div key={sound.id} className={`exCard ${isPlaying ? "playing" : ""}`}>
                  <button
                    className="exPlay"
                    aria-label={isPlaying ? `Parar prévia: ${sound.name}` : `Ouvir prévia: ${sound.name}`}
                    title={isPlaying ? "Parar prévia" : "Ouvir prévia"}
                    onClick={() => handlePlayPreview(sound)}
                  >
                    {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
                  </button>

                  <div className="exInfo">
                    <div className="exName" title={sound.name}>{sound.name}</div>
                    <div className="exMeta">
                      <span className="exTag" style={{ "--tag": sound.color || "var(--purple)" }}>{sound.category || "Online"}</span>
                      <span>{sound.plays} plays</span>
                      <span>{durationText}</span>
                    </div>
                  </div>

                  {added ? (
                    <span className="exAdded"><Check size={14} weight="bold" /> No soundboard</span>
                  ) : (
                    <button className="exAdd" onClick={() => setPendingSoundDestination(sound)} disabled={status === "downloading"}>
                      {status === "downloading" ? "Adicionando..." : <><Plus size={14} weight="bold" /> Adicionar</>}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && filteredSounds.length > 0 && (
            <div ref={loaderRef} className="exLoadMore">
              {loadingMore ? "Carregando mais sons..." : "Role para carregar mais"}
            </div>
          )}
          {/* o observador precisa existir mesmo quando o filtro esconde tudo */}
          {hasMore && filteredSounds.length === 0 && <div ref={loaderRef} className="exLoadMore" />}
        </>
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
