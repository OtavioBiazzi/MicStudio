import React, { useState, useEffect, useRef } from "react";
import {
  Pause,
  Play,
  ArrowCounterClockwise,
  ArrowClockwise,
  PushPin,
  StopCircle
} from "@phosphor-icons/react";
import { formatTime } from "../utils";

export function AudioPlayer({ state, selected, call, pinnedSoundId, setPinnedSoundId, setSelectedSound }) {
  const players = state.players || [];
  const [isSticky, setIsSticky] = useState(() => {
    return localStorage.getItem("micfudiddo.playerSticky") === "true";
  });

  const [localPositions, setLocalPositions] = useState({});
  const [dragPositions, setDragPositions] = useState({});
  const draggingRef = useRef({});
  const playersRef = useRef(players);
  const lastUpdateRef = useRef(Date.now());

  useEffect(() => {
    if (state.players) {
      setLocalPositions((prev) => {
        const next = { ...prev };
        state.players.forEach((p) => {
          if (!draggingRef.current[p.playbackId]) {
            next[p.playbackId] = p.current || 0;
          }
        });
        return next;
      });
      playersRef.current = state.players;
      lastUpdateRef.current = Date.now();
    }
  }, [state.players]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = Date.now();

      setLocalPositions((prev) => {
        const next = { ...prev };
        let changed = false;

        playersRef.current.forEach((p) => {
          if (p.state === "playing" && !draggingRef.current[p.playbackId]) {
            const currentVal = prev[p.playbackId] ?? p.current ?? 0;
            const nextVal = Math.min(p.duration || 0, currentVal + elapsed);
            if (Math.abs(nextVal - currentVal) > 0.01) {
              next[p.playbackId] = nextVal;
              changed = true;
            }
          }
        });

        return changed ? next : prev;
      });
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const toggleSticky = () => {
    const next = !isSticky;
    setIsSticky(next);
    localStorage.setItem("micfudiddo.playerSticky", String(next));
  };

  if (players.length === 0) return null;

  return (
    <div className="audioPlayerSection pinned" style={{
      width: "100%",
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: "rgba(11, 17, 26, 0.85)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 15px rgba(139, 92, 246, 0.25)",
      border: "1px solid rgba(139, 92, 246, 0.3)",
      borderRadius: "var(--radius-md)",
      padding: "12px 24px",
      marginLeft: "-8px",
      marginRight: "-8px",
      marginBottom: 16
    }}>

      <div className={`audioPlayersContainer ${players.length === 1 ? "single-player" : ""}`}>
        {players.map((p) => {
          const isDragging = !!draggingRef.current[p.playbackId];
          const currentPos = isDragging ? (dragPositions[p.playbackId] ?? 0) : (localPositions[p.playbackId] ?? p.current ?? 0);
          const progress = p.duration ? (currentPos / p.duration) * 100 : 0;
          const isPlayActive = p.state === "playing";

          const handlePlaybackUpdate = (patch) => {
            call("/api/player/playback-update", { playbackId: p.playbackId, patch }).catch(() => {});
          };

          return (
            <div key={p.playbackId} className="audioPlayerCard">
              <div className="cardHeader">
                <span className="cardTitle" title={p.name}>{p.name}</span>
                <div className="cardControls">
                  <button
                    className={isPlayActive ? "playBtn" : ""}
                    onClick={() => handlePlaybackUpdate({ paused: isPlayActive })}
                    title={isPlayActive ? "Pausar" : "Continuar"}
                    style={{ padding: 0 }}
                  >
                    {isPlayActive ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
                  </button>
                  <button
                    onClick={() => {
                      call("/api/sounds/play", { id: p.soundId, seconds: 0 }).catch(() => {});
                    }}
                    title="Reiniciar"
                    style={{ padding: 0 }}
                  >
                    <ArrowCounterClockwise size={14} />
                  </button>
                  <button
                    className={p.loop ? "activeBtn" : ""}
                    onClick={() => handlePlaybackUpdate({ loop: !p.loop })}
                    title="Loop"
                    style={{ padding: 0 }}
                  >
                    <ArrowClockwise size={14} weight={p.loop ? "bold" : "regular"} />
                  </button>
                  <button
                    onClick={() => {
                      if (pinnedSoundId === p.soundId) {
                        setPinnedSoundId(null);
                      } else {
                        setPinnedSoundId(p.soundId);
                        setSelectedSound(p.soundId);
                      }
                    }}
                    title={pinnedSoundId === p.soundId ? "Desafixar Som" : "Fixar Som"}
                    style={{
                      color: pinnedSoundId === p.soundId ? "var(--purple)" : "var(--text-muted)",
                      padding: 0
                    }}
                  >
                    <PushPin size={14} weight={pinnedSoundId === p.soundId ? "fill" : "regular"} />
                  </button>
                  <button
                    onClick={() => call("/api/player/stop", { playbackId: p.playbackId }).catch(() => {})}
                    title="Parar"
                    className="stopBtn"
                    style={{ padding: 0 }}
                  >
                    <StopCircle size={14} />
                  </button>
                </div>
              </div>

              {/* Progress Slider */}
              <div className="cardSeekRow">
                <div className="cardSeek">
                  <input
                    type="range" min={0} max={100} step={0.1} value={progress}
                    onMouseDown={() => {
                      draggingRef.current[p.playbackId] = true;
                      setDragPositions(prev => ({ ...prev, [p.playbackId]: currentPos }));
                    }}
                    onTouchStart={() => {
                      draggingRef.current[p.playbackId] = true;
                      setDragPositions(prev => ({ ...prev, [p.playbackId]: currentPos }));
                    }}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const pos = (val / 100) * (p.duration || 0);
                      setDragPositions(prev => ({ ...prev, [p.playbackId]: pos }));
                    }}
                    onMouseUp={() => {
                      draggingRef.current[p.playbackId] = false;
                      const finalPos = dragPositions[p.playbackId] ?? currentPos;
                      setLocalPositions(prev => ({ ...prev, [p.playbackId]: finalPos }));
                      call("/api/player/seek", { position: finalPos, seconds: finalPos, playbackId: p.playbackId }).catch(() => {});
                    }}
                    onTouchEnd={() => {
                      draggingRef.current[p.playbackId] = false;
                      const finalPos = dragPositions[p.playbackId] ?? currentPos;
                      setLocalPositions(prev => ({ ...prev, [p.playbackId]: finalPos }));
                      call("/api/player/seek", { position: finalPos, seconds: finalPos, playbackId: p.playbackId }).catch(() => {});
                    }}
                  />
                </div>
                <div className="cardTime">{formatTime(currentPos)} / {formatTime(p.duration)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
