import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  X, Play, Minus, Trash, Star, UploadSimple, FolderOpen, MagnifyingGlass,
  Pencil, Waveform, MusicNotes, ArrowClockwise, ArrowCounterClockwise,
  StopCircle, Sparkle, YoutubeLogo, PushPin
} from "@phosphor-icons/react";
import {
  filePathToUrl,
  renderMarkdown,
  formatTime,
  formatValue,
  Slider,
  EffectSliderRow
} from "../utils";
import { useTtsVoices } from "../useTtsVoices";

const playbackModes = [
  { value: "restart", label: "Recomeçar do início", desc: "Tocar de novo recomeça o som do início." },
  { value: "overlap", label: "Tocar por cima", desc: "Cada vez toca por cima do anterior, sem cortar." },
  { value: "stop", label: "Tocar e parar", desc: "Tocar de novo enquanto está tocando para o som." },
  { value: "pause", label: "Pausar e continuar", desc: "Tocar de novo pausa; mais uma vez continua de onde parou." },
  { value: "hold_loop", label: "Segurar para repetir", desc: "Repete enquanto você segura a tecla do atalho e para ao soltar." }
];

function OptionRow({ label, desc, checked, onChange }) {
  return (
    <label className="optRow">
      <span className="optText">
        <span className="optLabel">{label}</span>
        {desc && <span className="optDesc">{desc}</span>}
      </span>
      <span className="toggleSwitch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="toggleTrack" />
      </span>
    </label>
  );
}

const soundOutputRoutes = [
  { value: "both", label: "Microfone + Monitoramento" },
  { value: "cable", label: "Apenas Microfone" },
  { value: "monitor", label: "Apenas Monitoramento" }
];

const TTS_CHARACTER_LIMIT = 10000;

// --- WaveformVisualizer ---
export function WaveformVisualizer({ soundId, path, start, end, duration, onUpdateTrim, previewPlaying = false, previewBase = 0, previewSpeed = 1 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(null);

  const [peaks, setPeaks] = useState([]);
  const [playingPosition, setPlayingPosition] = useState(null);

  // Cabeca de reproducao: avanca suave a cada quadro enquanto a previa toca (o estado do backend chega a cada ~0,4 s).
  // Posicao no audio de origem = inicio do corte + tempo ja tocado x velocidade.
  useEffect(() => {
    if (!previewPlaying) { setPlayingPosition(null); return undefined; }
    const startedAt = performance.now();
    const limit = (end === null || end === undefined || end === "") ? duration : Number(end);
    let frame;
    const tick = () => {
      const played = Number(previewBase) + (performance.now() - startedAt) / 1000;
      setPlayingPosition(Math.min(limit, Number(start) + played * (Number(previewSpeed) || 1)));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewPlaying, previewBase, previewSpeed, start, end, duration]);
  
  useEffect(() => {
    if (!soundId) return;
    let isMounted = true;
    fetch("http://127.0.0.1:38717/api/sounds/waveform", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: soundId })
    })
      .then(res => res.json())
      .then(data => {
        if (isMounted && data.peaks) {
          setPeaks(data.peaks);
        }
      })
      .catch(console.error);
    return () => { isMounted = false; };
  }, [soundId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Draw grid lanes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const startPct = start / duration;
    const endPct = (end === null || end === undefined || end === "") ? 1.0 : (end / duration);
    const barWidth = (width / peaks.length) * zoom;
    const rootStyle = getComputedStyle(document.documentElement);
    const themeTop = rootStyle.getPropertyValue("--accent-lighter").trim() || "#C4B5FD";
    const themeBottom = rootStyle.getPropertyValue("--purple").trim() || "#8B5CF6";

    // Draw audio peaks
    peaks.forEach((peak, i) => {
      const x = i * barWidth - scrollLeft;
      if (x + barWidth < 0 || x > width) return;

      const barHeight = peak * height * 0.72;
      const y = (height - barHeight) / 2;

      const pct = i / peaks.length;
      const isActive = pct >= startPct && pct <= endPct;

      if (isActive) {
        const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
        grad.addColorStop(0, themeTop);
        grad.addColorStop(1, themeBottom);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
      }

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, Math.max(1.5, barWidth - 2.0), barHeight, 2);
      } else {
        ctx.rect(x, y, Math.max(1.5, barWidth - 2.0), barHeight);
      }
      ctx.fill();
    });

    // Draw playing progress line if applicable
    if (playingPosition != null && playingPosition >= 0) {
      const playheadX = (playingPosition / duration) * width * zoom - scrollLeft;
      if (playheadX >= 0 && playheadX <= width) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();
      }
    }
  }, [peaks, start, end, duration, zoom, scrollLeft, playingPosition]);

  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    const startPct = start / duration;
    const endPct = (end === null || end === undefined || end === "") ? 1.0 : (end / duration);
    const startX = startPct * width * zoom - scrollLeft;
    const endX = endPct * width * zoom - scrollLeft;

    if (Math.abs(clickX - startX) < 16) {
      setIsDragging("start");
    } else if (Math.abs(clickX - endX) < 16) {
      setIsDragging("end");
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    const absoluteX = (clickX + scrollLeft) / zoom;
    let newPct = absoluteX / width;
    newPct = Math.max(0, Math.min(1, newPct));

    const newTime = newPct * duration;
    const actualEnd = (end === null || end === undefined || end === "") ? duration : Number(end);

    if (isDragging === "start") {
      onUpdateTrim(Math.min(actualEnd - 0.05, newTime), actualEnd);
    } else {
      onUpdateTrim(start, Math.max(start + 0.05, newTime));
    }
  };

  const handleMouseUp = () => {
    setIsDragging(null);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, start, end, duration, zoom, scrollLeft]);

  const handleScroll = (e) => {
    if (zoom > 1) {
      setScrollLeft((prev) => Math.max(0, prev + e.deltaX));
    }
  };

  const startPct = start / duration;
  const endPct = (end === null || end === undefined || end === "") ? 1.0 : (end / duration);
  const startX = startPct * 100 * zoom - (scrollLeft / (canvasRef.current?.getBoundingClientRect().width || 1)) * 100;
  const endX = endPct * 100 * zoom - (scrollLeft / (canvasRef.current?.getBoundingClientRect().width || 1)) * 100;

  return (
    <div className="waveform-editor-container" ref={containerRef}>
      <div className="waveform-zoom-controls">
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Forma de onda e corte · arraste as barras de início e fim</span>
        <div className="waveform-zoom-buttons">
          <button className={`btn btn-ghost ${zoom === 1 ? "active" : ""}`} style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => { setZoom(1); setScrollLeft(0); }}>1x</button>
          <button className={`btn btn-ghost ${zoom === 1.5 ? "active" : ""}`} style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => setZoom(1.5)}>1.5x</button>
          <button className={`btn btn-ghost ${zoom === 2 ? "active" : ""}`} style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => setZoom(2)}>2x</button>
          <button className={`btn btn-ghost ${zoom === 3 ? "active" : ""}`} style={{ padding: "3px 8px", fontSize: 10 }} onClick={() => setZoom(3)}>3x</button>
        </div>
      </div>

      <div className="waveform-canvas-wrapper" onMouseDown={handleMouseDown} onWheel={handleScroll}>
        <canvas ref={canvasRef} />
        <div className="waveform-marker waveform-marker-start" style={{ left: `${startX}%` }}>
          <div className="waveform-marker-label">INÍCIO: {start.toFixed(2)}s</div>
        </div>
        <div className="waveform-marker waveform-marker-end" style={{ left: `${endX}%` }}>
          <div className="waveform-marker-label">FIM: {end !== null ? Number(end).toFixed(2) : duration.toFixed(2)}s</div>
        </div>
      </div>

      <div className="waveform-timeline">
        <span>0:00</span>
        <span>{(duration * 0.25).toFixed(1)}s</span>
        <span>{(duration * 0.5).toFixed(1)}s</span>
        <span>{(duration * 0.75).toFixed(1)}s</span>
        <span>{duration.toFixed(2)}s</span>
      </div>
    </div>
  );
}


// --- ChooseMicOnCloseModal ---
export function ChooseMicOnCloseModal({ state, onConfirm, onCancel }) {
  const endpoints = state.windowsCaptureEndpoints || [];
  const [selectedMicId, setSelectedMicId] = useState(() => {
    if (endpoints.length > 0) return endpoints[0].id;
    return "";
  });

  return (
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0 }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>🎤 Escolha o Microfone Padrão</h3>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
            Selecione qual dispositivo de gravação deve ser definido como o padrão do Windows ao fechar o aplicativo:
          </p>
          <select
            value={selectedMicId}
            onChange={(e) => setSelectedMicId(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "var(--bg-input)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text)",
              outline: "none",
              fontSize: 13,
              fontFamily: "var(--font)",
              boxSizing: "border-box"
            }}
          >
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>{ep.name}</option>
            ))}
            {endpoints.length === 0 && (
              <option value="">Nenhum dispositivo encontrado</option>
            )}
          </select>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={onCancel}>Cancelar</button>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: 12 }}
            onClick={() => onConfirm(selectedMicId)}
            disabled={!selectedMicId}
          >
            Confirmar e Sair
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MoveCategoryModal ---
export function MoveCategoryModal({ soundId, state, call, onClose, setToast, customCategories, setCustomCategories }) {
  const [search, setSearch] = useState("");
  const [newCategory, setNewCategory] = useState("");

  const sound = useMemo(() => {
    return state?.sounds?.find((s) => s.id === soundId);
  }, [state?.sounds, soundId]);

  const categoriesWithCounts = useMemo(() => {
    if (!state?.sounds) return [];
    const counts = {};
    state.sounds.forEach((s) => {
      const cat = s.category || "Geral";
      counts[cat] = (counts[cat] || 0) + 1;
    });
    
    customCategories.forEach((cat) => {
      if (!counts[cat]) counts[cat] = 0;
    });

    return Object.keys(counts).map((cat) => ({
      name: cat,
      count: counts[cat],
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [state?.sounds, customCategories]);

  const filteredCategories = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return categoriesWithCounts;
    return categoriesWithCounts.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoriesWithCounts, search]);

  if (!sound) return null;

  const handleSelectCategory = async (catName) => {
    try {
      await call("/api/sounds/update", { id: sound.id, category: catName });
      setToast(`Som "${sound.name}" movido para "${catName}"!`);
      onClose();
    } catch (err) {
      setToast("Erro ao mover som: " + err.message);
    }
  };

  const handleCreateCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === "todos" || trimmed.toLowerCase() === "favoritos") {
      setToast("Nome reservado!");
      return;
    }
    
    handleSelectCategory(trimmed);
    
    if (!customCategories.includes(trimmed)) {
      setCustomCategories([...customCategories, trimmed]);
    }
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent accountModal moveCategoryModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, width: "90%", padding: 20 }}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="modalHeader" style={{ paddingBottom: 12, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            📁 Mover para Pasta / Categoria
          </h3>
          <button className="closeBtn" onClick={onClose}><X size={16} /></button>
        </div>
        
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          Movendo som: <span style={{ color: "var(--purple)", fontWeight: 700 }}>{sound.name}</span>
        </div>

        <div className="searchBar" style={{ marginBottom: 12, padding: "6px 12px" }}>
          <MagnifyingGlass size={14} className="searchIcon" />
          <input
            placeholder="Pesquisar pastas existentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>

        <div style={{
          maxHeight: "180px",
          overflowY: "auto",
          background: "var(--bg-card-secondary)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
          padding: 4,
          marginBottom: 16
        }}>
          {filteredCategories.length === 0 ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>
              Nenhuma pasta encontrada.
            </div>
          ) : (
            filteredCategories.map((c) => (
              <div
                key={c.name}
                onClick={() => handleSelectCategory(c.name)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: sound.category === c.name ? 700 : 500,
                  color: sound.category === c.name ? "var(--purple)" : "var(--text)",
                  background: sound.category === c.name ? "rgba(var(--accent-rgb),  0.1)" : "transparent",
                  transition: "var(--transition)"
                }}
                className="category-row-hover"
              >
                <span>{c.name}</span>
                <span style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  background: "var(--bg-card)",
                  padding: "2px 6px",
                  borderRadius: 10,
                  border: "1px solid var(--border)"
                }}>{c.count} {c.count === 1 ? "som" : "sons"}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", display: "block", marginBottom: 6 }}>
            Criar Nova Pasta / Categoria
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              className="form-control"
              placeholder="Nome da nova pasta..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateCategory(); }}
              style={{ flex: 1, padding: "6px 12px", fontSize: 12 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleCreateCategory}
              style={{ padding: "6px 12px", fontSize: 12, background: "linear-gradient(135deg, var(--purple), var(--purple-dim))" }}
            >
              Criar
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- Perfil do usuario ---
// Reduz a foto para um quadrado pequeno (JPEG): fotos grandes estouravam o armazenamento local e quebravam o salvamento.
function resizeAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Escolha um arquivo de imagem (PNG, JPG ou WEBP)."));
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const sx = (image.naturalWidth - side) / 2;
      const sy = (image.naturalHeight - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.getContext("2d").drawImage(image, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não consegui abrir essa imagem."));
    };
    image.src = url;
  });
}

function ProfileAvatar({ image, position = 50, size = 72 }) {
  return (
    <div className="profile-avatar" style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, var(--purple-dim), var(--purple))", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", flexShrink: 0 }}>
      {image ? (
        <img src={image} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", objectPosition: `center ${position}%` }} />
      ) : (
        <Waveform size={Math.round(size * 0.46)} weight="fill" color="#fff" />
      )}
    </div>
  );
}

// --- UserProfileModal ---
export function UserProfileModal({ onClose, onEdit, profileName, profileSub, profilePlan, profileImage, profileImagePosition, profileBio, profileReadme, stats }) {
  const items = stats ? [
    ["Sons", stats.sounds],
    ["Reproduções", stats.plays],
    ["Vozes favoritas", stats.favoriteVoices],
    ["Sons favoritos", stats.favoriteSounds],
    ["Vozes criadas", stats.customVoices],
    ["Perfis de áudio", stats.profiles]
  ] : [];
  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent profileViewModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, width: "92%", padding: 24 }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="profileViewHead">
          <ProfileAvatar image={profileImage} position={profileImagePosition} size={84} />
          <div className="profileViewWho">
            <div className="profileViewName">
              <h2>{profileName}</h2>
              {profilePlan && <span className="pro-badge">{profilePlan}</span>}
            </div>
            {profileSub && <div className="profileViewSub">{profileSub}</div>}
            {profileBio && <div className="profileViewBio">{profileBio}</div>}
          </div>
          <div className="profileViewButtons">
            <button className="btn btn-ghost" onClick={onEdit}><Pencil size={13} /> Editar</button>
            <button className="closeBtn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="profileStats">
            {items.map(([label, value]) => (
              <div key={label} className="profileStat">
                <strong>{Number(value || 0).toLocaleString("pt-BR")}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="readme-container profileReadme">
          {profileReadme && profileReadme.trim()
            ? renderMarkdown(profileReadme)
            : <p className="profileReadmeEmpty">Você ainda não escreveu nada sobre você. Clique em Editar para criar a sua página.</p>}
        </div>
      </motion.div>
    </div>
  );
}

const README_TEMPLATE = "# Sobre mim\n\nEscreva aqui quem você é, o que faz com o VozLab Studio e quais são suas vozes favoritas.\n\n### Minhas vozes favoritas\n- **Voz 1**: para que serve\n- **Voz 2**: para que serve\n\n> Dica: use **negrito**, *itálico* e listas com `-`.";

// --- EditProfileModal ---
export function EditProfileModal({ onClose, profileName, setProfileName, profileSub, setProfileSub, profilePlan, setProfilePlan, profileImage, setProfileImage, profileImagePosition, setProfileImagePosition, profileBio, setProfileBio, profileReadme, setProfileReadme }) {
  const fileInputRef = useRef(null);
  const [readmeMode, setReadmeMode] = useState("edit");
  const [avatarError, setAvatarError] = useState("");

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatarError("");
      setProfileImage(await resizeAvatar(file));
      setProfileImagePosition("50");
    } catch (error) {
      setAvatarError(error.message);
    }
  };

  const field = (label, value, setValue, { max, placeholder, hint } = {}) => (
    <div className="labField">
      <label>{label}{max ? <span className="fieldCount">{String(value || "").length}/{max}</span> : null}</label>
      <input type="text" value={value} maxLength={max} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} />
      {hint && <small className="selectHint">{hint}</small>}
    </div>
  );

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent accountModal editProfileModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "92%" }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="modalHeader">
          <h3>Editar perfil</h3>
          <button className="closeBtn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="modalBody" style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "64vh", overflowY: "auto", paddingRight: 4 }}>
          <div className="profileEditPreview">
            <ProfileAvatar image={profileImage} position={profileImagePosition} size={64} />
            <div className="profileEditPreviewText">
              <div className="profileViewName">
                <strong>{profileName || "Seu nome"}</strong>
                {profilePlan && <span className="pro-badge">{profilePlan}</span>}
              </div>
              <span>{profileSub || "Seu subtítulo"}</span>
            </div>
            <div className="profileEditPhotoButtons">
              <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>Trocar foto</button>
              {profileImage && <button className="btn btn-ghost danger" onClick={() => setProfileImage("")}>Remover</button>}
            </div>
            <input type="file" ref={fileInputRef} accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
          </div>
          {avatarError && <small style={{ color: "var(--danger)" }}>{avatarError}</small>}
          {profileImage && (
            <div className="labField">
              <label>Posição da foto <span className="fieldCount">{profileImagePosition}%</span></label>
              <input type="range" min="0" max="100" value={profileImagePosition} onChange={(e) => setProfileImagePosition(e.target.value)} />
            </div>
          )}

          {field("Nome", profileName, setProfileName, { max: 24, placeholder: "Como você quer ser chamado" })}
          {field("Subtítulo", profileSub, setProfileSub, { max: 40, placeholder: "Ex.: Streamer de fim de semana" })}
          {field("Selo (deixe vazio para ocultar)", profilePlan, setProfilePlan, { max: 12, placeholder: "Ex.: PRO, VIP" })}
          {field("Frase curta", profileBio, setProfileBio, { max: 90, placeholder: "Uma linha sobre você" })}

          <div className="labField">
            <label>
              Sobre mim (aceita Markdown)
              <span className="readmeTabs">
                <button className={readmeMode === "edit" ? "active" : ""} onClick={() => setReadmeMode("edit")}>Escrever</button>
                <button className={readmeMode === "preview" ? "active" : ""} onClick={() => setReadmeMode("preview")}>Prévia</button>
              </span>
            </label>
            {readmeMode === "edit" ? (
              <>
                <textarea rows={7} value={profileReadme} maxLength={4000} onChange={(e) => setProfileReadme(e.target.value)} placeholder="Escreva sobre você..." />
                <div className="readmeActions">
                  <button className="btn btn-ghost" onClick={() => setProfileReadme(README_TEMPLATE)}>Usar modelo</button>
                  <span className="fieldCount">{String(profileReadme || "").length}/4000</span>
                </div>
              </>
            ) : (
              <div className="readme-container profileReadme">{renderMarkdown(profileReadme || "")}</div>
            )}
          </div>
        </div>

        <div className="modalFooter" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 16 }}>
          <small style={{ color: "var(--text-muted)" }}>As alterações são salvas na hora.</small>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "6px 18px", fontSize: 12 }}>Pronto</button>
        </div>
      </motion.div>
    </div>
  );
}

// --- ManageAccountModal ---
export function ManageAccountModal({ onClose, profileName, setProfileName, profileSub, setProfileSub, profileImage, setProfileImage }) {
  const fileInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setProfileImage(event.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent accountModal"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="modalHeader">
          <h3>👤 Gerenciar Perfil</h3>
          <button className="closeBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modalBody" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, alignSelf: "center", flexDirection: "column", marginBottom: 8 }}>
            <div className="profile-avatar" style={{ width: 84, height: 84, fontSize: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--purple-dim), var(--purple))", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              {profileImage ? (
                <img src={profileImage} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
              ) : (
                <Waveform size={36} weight="fill" color="#fff" />
              )}
            </div>
            <button className="manage-btn" onClick={() => fileInputRef.current?.click()} style={{ width: "auto", padding: "6px 14px" }}>
              Carregar Foto
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
          </div>

          <div className="labField">
            <label>Nome do Perfil</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              style={{ width: "100%", padding: "10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}
            />
          </div>

          <div className="labField">
            <label>Subtítulo / Plano</label>
            <input
              type="text"
              value={profileSub}
              onChange={(e) => setProfileSub(e.target.value)}
              style={{ width: "100%", padding: "10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)" }}
            />
          </div>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "8px 20px" }}>Salvar Alterações</button>
        </div>
      </motion.div>
    </div>
  );
}

// --- CloseChoiceModal ---
export function CloseChoiceModal({ onCancel, onMinimize, onQuit }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  return (
    <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="modalContent"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        style={{ maxWidth: 400 }}
      >
        <div className="modalIcon">
          <X size={24} weight="bold" />
        </div>
        <div className="modalTitle">O que você quer fazer?</div>
        <div className="modalDesc">
          Minimize para a bandeja e continue com o áudio pronto, ou feche tudo e restaure a rota virtual.
        </div>
        
        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14, marginBottom: 4, fontSize: 11, color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={dontShowAgain} onChange={(e) => setDontShowAgain(e.target.checked)} style={{ cursor: "pointer" }} />
          Não mostrar esta mensagem novamente
        </label>
        
        <div className="modalActions" style={{ marginTop: 16 }}>
          <button className="btn-modal-primary" onClick={() => onMinimize(dontShowAgain)}>
            <Minus size={16} /> Minimizar para a bandeja
          </button>
          <button className="btn-modal-danger" onClick={() => onQuit(dontShowAgain)}>
            <X size={16} /> Fechar totalmente
          </button>
          <button className="btn-modal-ghost" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function cleanMediaUrl(url) {
  if (!url) return "";
  let cleanUrl = url.trim();
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.hostname.includes("youtube.com") && parsed.pathname === "/watch") {
      const videoId = parsed.searchParams.get("v");
      if (videoId) {
        const t = parsed.searchParams.get("t");
        let result = `https://www.youtube.com/watch?v=${videoId}`;
        if (t) {
          result += `&t=${t}`;
        }
        return result;
      }
    } else if (parsed.hostname.includes("youtu.be")) {
      const videoId = parsed.pathname.slice(1);
      if (videoId) {
        const t = parsed.searchParams.get("t");
        let result = `https://youtu.be/${videoId}`;
        if (t) {
          result += `?t=${t}`;
        }
        return result;
      }
    }
  } catch (e) {
    // Ignore parsing errors
  }
  return cleanUrl;
}

// --- YoutubeImportModal ---
export function YoutubeImportModal({ onClose, call, setToast, state }) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [chosenTab, setChosenTab] = useState("Todos");

  const destinationTabs = useMemo(() => {
    const names = new Set(["Todos", ...(state?.soundCategories || []).filter((name) => name !== "Favoritos")]);
    return Array.from(names);
  }, [state?.soundCategories]);

  // Se ja houver um link do YouTube/TikTok copiado, ja vem preenchido.
  useEffect(() => {
    let alive = true;
    navigator.clipboard?.readText?.().then((value) => {
      const text = String(value || "").trim().toLowerCase();
      if (alive && /^https?:\/\//.test(text) && (text.includes("youtu") || text.includes("tiktok."))) {
        setYoutubeUrl(String(value).trim());
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const detectedSource = useMemo(() => {
    const value = youtubeUrl.toLowerCase();
    if (value.includes("tiktok.")) return "TikTok";
    if (value.includes("youtu")) return "YouTube";
    return "YouTube ou TikTok";
  }, [youtubeUrl]);

  const isYoutubeDownloading = (status) => {
    if (!status) return false;
    const statusLower = status.toLowerCase();
    return (
      status !== "" &&
      !statusLower.startsWith("concluido") &&
      !statusLower.startsWith("erro") &&
      !statusLower.startsWith("importacao cancelada") &&
      !statusLower.startsWith("cancelando")
    );
  };

  const youtubeLoading = localLoading || isYoutubeDownloading(state?.youtubeStatus);

  useEffect(() => {
    if (youtubeLoading && state?.youtubeStatus) {
      const statusLower = state.youtubeStatus.toLowerCase();
      if (statusLower.includes("importado!")) {
        setLocalLoading(false);
        onClose();
      } else if (statusLower.includes("erro:")) {
        setLocalLoading(false);
      } else if (statusLower.includes("cancelada")) {
        setLocalLoading(false);
        onClose();
      }
    }
  }, [state?.youtubeStatus, youtubeLoading, onClose]);

  const handleStartDownload = async () => {
    if (!youtubeUrl || !youtubeUrl.trim()) {
      setToast("Cole um link do YouTube ou TikTok.");
      return;
    }
    const selectedTabs = chosenTab === "Todos" ? ["Todos"] : ["Todos", chosenTab];
    const sanitizedUrl = cleanMediaUrl(youtubeUrl);
    setLocalLoading(true);
    setToast(`Verificando link do ${detectedSource}...`);
    try {
      await call("/api/sounds/import-youtube", { url: sanitizedUrl, tabs: selectedTabs });
    } catch (err) {
      setToast("Erro: " + err.message);
      setLocalLoading(false);
    }
  };

  const handleCancel = async () => {
    if (youtubeLoading) {
      try {
        await call("/api/sounds/import-youtube/cancel");
      } catch (err) {
        setToast("Erro ao cancelar: " + err.message);
      } finally {
        setLocalLoading(false);
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0 }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <YoutubeLogo size={20} color="#FF0000" weight="fill" />
            <span>Baixar audio do YouTube ou TikTok</span>
          </h3>
          <button className="closeBtn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Cole o link do vídeo e clique em Baixar áudio. É só isso.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Link do Vídeo</span>
            <input
              type="text"
              placeholder="https://www.youtube.com/watch?v=... ou https://www.tiktok.com/@perfil/video/..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !youtubeLoading) handleStartDownload(); }}
              disabled={youtubeLoading}
              autoFocus
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                fontFamily: "var(--font)",
                boxSizing: "border-box"
              }}
            />
            <small style={{ color: "var(--text-muted)", fontSize: 11 }}>Detectado: {detectedSource}</small>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Salvar na aba</span>
            <select
              value={chosenTab}
              onChange={(e) => setChosenTab(e.target.value)}
              disabled={youtubeLoading}
              style={{ flex: 1, padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            >
              {destinationTabs.map((tab) => <option key={tab} value={tab}>{tab === "Todos" ? "Só em Todos" : tab}</option>)}
            </select>
          </div>

          {youtubeLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="spinner" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--accent)", animation: "spin 0.6s linear infinite" }} />
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 700 }}>{state?.youtubeStatus || "Processando..."}</span>
            </div>
          )}
          
          <small style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
            💡 O processo roda em segundo plano. Você pode fechar esta tela e continuar navegando livremente pelo aplicativo.
          </small>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          {youtubeLoading ? (
            <>
              <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={handleCancel}>
                Cancelar Download
              </button>
              <button className="btn btn-primary" style={{ padding: "8px 20px", fontSize: 12 }} onClick={onClose}>
                Fechar Tela
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={onClose}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                style={{ padding: "8px 20px", fontSize: 12 }}
                onClick={handleStartDownload}
              >
                Baixar áudio
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- AdvancedSoundEditorModal ---
const EXTRA_FX_KEYS = [
  "chorus_enabled", "chorus_mix", "flanger_enabled", "flanger_mix", "ghost_enabled", "ghost_mix",
  "telephone_enabled", "telephone_mix", "radio_enabled", "radio_mix", "whisper_enabled", "whisper_mix",
  "tremolo_enabled", "tremolo_rate_hz", "wobble_enabled", "wobble_mix"
];

export function AdvancedSoundEditorModal({ state, selected, onClose, call, setToast, onDelete, soundboardFavorites, toggleSoundboardFavorite }) {
  const [draft, setDraft] = useState({});
  const [editorTab, setEditorTab] = useState("som");
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState("");

  // States for audio-embedded effects
  const [distEnabled, setDistEnabled] = useState(false);
  const [distDrive, setDistDrive] = useState(4.0);
  const [robotEnabled, setRobotEnabled] = useState(false);
  const [robotRate, setRobotRate] = useState(35.0);
  const [echoEnabled, setEchoEnabled] = useState(false);
  const [echoMix, setEchoMix] = useState(0.25);
  const [reverbEnabled, setReverbEnabled] = useState(false);
  const [reverbMix, setReverbMix] = useState(0.28);
  const [delayEnabled, setDelayEnabled] = useState(false);
  const [delayMix, setDelayMix] = useState(0.3);
  const [gateEnabled, setGateEnabled] = useState(false);
  const [gateThreshold, setGateThreshold] = useState(0.08);
  const [eqEnabled, setEqEnabled] = useState(false);
  const [eqTone, setEqTone] = useState(0.55);
  const [compressorEnabled, setCompressorEnabled] = useState(false);
  const [compressorAmount, setCompressorAmount] = useState(0.45);
  const [reverseEnabled, setReverseEnabled] = useState(false);
  const [reverseMix, setReverseMix] = useState(0.65);

  // Efeitos extras do motor de voz que tambem podem ser embutidos no audio.
  const [extraFx, setExtraFx] = useState({});
  const extraValue = (key, fallback) => extraFx[key] ?? fallback;
  const toggleExtra = (key) => setExtraFx((prev) => ({ ...prev, [`${key}_enabled`]: !prev[`${key}_enabled`] }));
  const setExtraAmount = (field, value) => setExtraFx((prev) => ({ ...prev, [field]: value }));

  const activateAllAtMax = () => {
    setDraft((prev) => ({
      ...prev,
      volume: 100.0,
      pitch_semitones: 12.0,
      speed: 4.0,
      normalize: true,
      loop: true
    }));
    setReverbEnabled(true);
    setReverbMix(0.9);
    setEchoEnabled(true);
    setEchoMix(0.9);
    setDelayEnabled(true);
    setDelayMix(0.9);
    setDistEnabled(true);
    setDistDrive(100.0);
    setGateEnabled(true);
    setGateThreshold(0.4);
    setReverseEnabled(true);
    setReverseMix(1.0);
    setToast("🔥 Efeitos e volumes estourados no máximo para este som!");
  };

  useEffect(() => {
    if (selected) {
      setDraft({ ...selected });
      setStartSec(selected.start ?? 0);
      setEndSec(selected.end ?? (selected.duration ? Number(selected.duration).toFixed(2) : ""));
      
      const fx = selected.effects || {};
      setDistEnabled(!!fx.distortion_enabled);
      setDistDrive(fx.distortion_drive ?? 4.0);
      setRobotEnabled(!!fx.robot_enabled);
      setRobotRate(fx.robot_rate_hz ?? 35.0);
      setEchoEnabled(!!fx.echo_enabled);
      setEchoMix(fx.echo_mix ?? 0.25);
      setReverbEnabled(!!fx.reverb_enabled);
      setReverbMix(fx.reverb_mix ?? 0.28);
      setDelayEnabled(!!fx.delay_enabled);
      setDelayMix(fx.delay_mix ?? 0.3);
      setGateEnabled(!!fx.noise_gate_enabled);
      setGateThreshold(fx.noise_gate_threshold ?? 0.08);
      setEqEnabled(!!fx.equalizer_enabled);
      setEqTone(fx.equalizer_tone ?? 0.55);
      setCompressorEnabled(!!fx.compressor_enabled);
      setCompressorAmount(fx.compressor_amount ?? 0.45);
      setReverseEnabled(!!fx.reverse_enabled);
      setReverseMix(fx.reverse_mix ?? 0.65);
      const extras = {};
      for (const key of EXTRA_FX_KEYS) if (fx[key] !== undefined) extras[key] = fx[key];
      setExtraFx(extras);
    }
  }, []);

  const chooseCover = async () => {
    const path = await window.micfudiddo?.openImageFile?.();
    if (path) {
      call("/api/sounds/cover", { id: selected.id, path })
        .then(() => {
          setToast("Capa do som atualizada!");
          setDraft((prev) => ({ ...prev, coverUrl: filePathToUrl(path) }));
        })
        .catch((e) => setToast(e.message));
    }
  };

  const getEffectsPayload = () => {
    return {
      distortion_enabled: distEnabled,
      distortion_drive: Number(distDrive),
      robot_enabled: robotEnabled,
      robot_rate_hz: Number(robotRate),
      echo_enabled: echoEnabled,
      echo_mix: Number(echoMix),
      reverb_enabled: reverbEnabled,
      reverb_mix: Number(reverbMix),
      delay_enabled: delayEnabled,
      delay_mix: Number(delayMix),
      noise_gate_enabled: gateEnabled,
      noise_gate_threshold: Number(gateThreshold),
      equalizer_enabled: eqEnabled,
      equalizer_tone: Number(eqTone),
      compressor_enabled: compressorEnabled,
      compressor_amount: Number(compressorAmount),
      reverse_enabled: reverseEnabled,
      reverse_mix: Number(reverseMix),
      ...extraFx
    };
  };

  const handleSave = async (replace) => {
    try {
      const finalName = (draft.name !== undefined ? draft.name : selected.name).trim();
      if (!finalName) {
        setToast("O nome do som não pode ser vazio.");
        return;
      }
      const payload = {
        id: selected.id,
        replace,
        name: finalName,
        category: (draft.category !== undefined ? draft.category : selected.category || "Geral").trim() || "Geral",
        color: draft.color || selected.color || "#8B5CF6",
        volume: Number(draft.volume ?? 1.0),
        pitch_semitones: Number(draft.pitch_semitones ?? 0.0),
        pitch_mode: draft.pitch_mode ?? "preserve",
        speed: Number(draft.speed ?? 1.0),
        normalize: !!draft.normalize,
        fade_in_ms: Number(draft.fade_in_ms ?? 0),
        fade_out_ms: Number(draft.fade_out_ms ?? 0),
        repeats: Number(draft.repeats ?? 1),
        shortcut: draft.shortcut || "",
        block_voice: !!draft.block_voice,
        loop: !!draft.loop,
        playback_mode: draft.playback_mode ?? "restart",
        stop_other_sounds: !!draft.stop_other_sounds,
        mute_other_sounds: !!draft.mute_other_sounds,
        output_route: draft.output_route ?? "both",
        start: Number(startSec) || 0.0,
        end: endSec === "" ? null : Number(endSec),
        clipVoiceEnabled: draft.clipVoiceEnabled !== undefined ? !!draft.clipVoiceEnabled : !!selected.clipVoiceEnabled,
        clipPcEnabled: draft.clipPcEnabled !== undefined ? !!draft.clipPcEnabled : !!selected.clipPcEnabled,
        effects: getEffectsPayload()
      };
      await call("/api/sounds/save-edited", payload);
      setToast(replace ? "Som original substituído!" : "Cópia criada com sucesso!");
      onClose();
    } catch (e) {
      setToast("Erro ao salvar: " + e.message);
    }
  };

  const isCurrentlyPlaying = state?.player?.state === "playing" && state?.player?.name?.startsWith("Previa:");

  const handleStopPreview = async () => {
    try {
      await call("/api/sounds/stop");
      setToast("Prévia interrompida.");
    } catch (e) {
      setToast("Erro ao parar prévia: " + e.message);
    }
  };

  const handlePreview = async () => {
    try {
      const finalName = (draft.name !== undefined ? draft.name : selected.name).trim();
      if (!finalName) {
        setToast("O nome do som não pode ser vazio.");
        return;
      }
      const payload = {
        id: selected.id,
        name: finalName,
        volume: Number(draft.volume ?? 1.0),
        pitch_semitones: Number(draft.pitch_semitones ?? 0.0),
        pitch_mode: draft.pitch_mode ?? "preserve",
        speed: Number(draft.speed ?? 1.0),
        normalize: !!draft.normalize,
        fade_in_ms: Number(draft.fade_in_ms ?? 0),
        fade_out_ms: Number(draft.fade_out_ms ?? 0),
        repeats: Number(draft.repeats ?? 1),
        block_voice: !!draft.block_voice,
        loop: !!draft.loop,
        output_route: "monitor",
        start: Number(startSec) || 0.0,
        end: endSec === "" ? null : Number(endSec),
        effects: getEffectsPayload()
      };
      await call("/api/sounds/preview", payload);
      setToast("Tocando prévia editada...");
    } catch (e) {
      setToast("Erro na prévia: " + e.message);
    }
  };

  const handleRestore = () => {
    setExtraFx({});
    setDraft({
      ...selected,
      name: selected.name,
      category: selected.category || "Geral",
      shortcut: selected.shortcut || "",
      volume: 1.0,
      pitch_semitones: 0.0,
      speed: 1.0,
      normalize: false,
      loop: false,
      fade_in_ms: 0,
      fade_out_ms: 0,
      repeats: 1,
      playback_mode: "restart",
      output_route: "both"
    });
    setStartSec(0);
    setEndSec(selected.duration ? Number(selected.duration).toFixed(2) : "");
    setDistEnabled(false);
    setRobotEnabled(false);
    setEchoEnabled(false);
    setReverbEnabled(false);
    setDelayEnabled(false);
    setGateEnabled(false);
    setEqEnabled(false);
    setCompressorEnabled(false);
    setReverseEnabled(false);
    setToast("Configurações originais restauradas localmente!");
  };

  const handleRestoreOriginalFile = async () => {
    if (!window.confirm("Deseja realmente restaurar este som para o arquivo original? Isso apagará todas as edições feitas no áudio.")) {
      return;
    }
    try {
      const res = await call("/api/sounds/restore-original", { id: selected.id });
      setToast("Som restaurado para o arquivo original com sucesso!");
      const restored = res.sounds?.find((s) => s.id === selected.id) || selected;
      setDraft({ ...restored });
      setStartSec(0);
      setEndSec(restored.duration ? Number(restored.duration).toFixed(2) : "");
      setDistEnabled(false);
      setRobotEnabled(false);
      setEchoEnabled(false);
      setReverbEnabled(false);
      setDelayEnabled(false);
      setGateEnabled(false);
      setEqEnabled(false);
      setCompressorEnabled(false);
      setReverseEnabled(false);
    } catch (e) {
      setToast("Erro ao restaurar arquivo original: " + e.message);
    }
  };

  const extraActive = Object.entries(extraFx).filter(([key, value]) => key.endsWith("_enabled") && value).length;
  const activeEffects = [reverbEnabled, echoEnabled, delayEnabled, distEnabled, gateEnabled, reverseEnabled, robotEnabled, eqEnabled, compressorEnabled].filter(Boolean).length + extraActive;
  const turnOffAllEffects = () => {
    setReverbEnabled(false); setEchoEnabled(false); setDelayEnabled(false); setDistEnabled(false);
    setGateEnabled(false); setReverseEnabled(false); setRobotEnabled(false); setEqEnabled(false); setCompressorEnabled(false);
    setExtraFx((prev) => Object.fromEntries(Object.entries(prev).map(([key, value]) => [key, key.endsWith("_enabled") ? false : value])));
  };
  const durationTotal = Number(selected.duration || 6);
  const EDITOR_TABS = [
    { id: "som", label: "Som" },
    { id: "efeitos", label: "Efeitos", badge: activeEffects },
    { id: "toca", label: "Como toca" },
    { id: "detalhes", label: "Detalhes" }
  ];

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent advanced-sound-modal"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="sound-modal-header">
          <h3>Editor de som <span className="editorSoundName">{selected.name}</span></h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="editorLayout">
          {/* Sempre visivel: forma de onda e player */}
          <div className="editorStage">
            <WaveformVisualizer
              soundId={selected.id}
              path={selected.path}
              start={startSec}
              end={endSec}
              duration={durationTotal}
              onUpdateTrim={(s, e) => { setStartSec(s); setEndSec(e); }}
              previewPlaying={Boolean(isCurrentlyPlaying)}
              previewBase={Number(state?.player?.current || 0)}
              previewSpeed={Number(draft.speed ?? 1.0)}
            />

            <div className="editorTransport">
              <button className={`btn ${isCurrentlyPlaying ? "btn-ghost danger" : "btn-primary"}`} onClick={isCurrentlyPlaying ? handleStopPreview : handlePreview}>
                {isCurrentlyPlaying ? <><StopCircle size={15} weight="fill" /> Parar</> : <><Play size={15} weight="fill" /> Ouvir a seleção</>}
              </button>
              <label className="editorTime">
                <span>Início</span>
                <input type="number" min="0" step="0.05" value={Number(startSec).toFixed(2)}
                  onChange={(e) => {
                    const limit = endSec === "" || endSec == null ? durationTotal : Number(endSec);
                    setStartSec(Math.max(0, Math.min(Number(e.target.value) || 0, limit - 0.05)));
                  }} />
                <em>s</em>
              </label>
              <label className="editorTime">
                <span>Fim</span>
                <input type="number" min="0" step="0.05" value={(endSec === "" || endSec == null ? durationTotal : Number(endSec)).toFixed(2)}
                  onChange={(e) => setEndSec(Math.min(durationTotal, Math.max(Number(startSec) + 0.05, Number(e.target.value) || durationTotal)))} />
                <em>s</em>
              </label>
              <span className="editorSelection">
                Seleção: <strong>{Math.max(0, (endSec === "" || endSec == null ? durationTotal : Number(endSec)) - Number(startSec)).toFixed(2)}s</strong> de {durationTotal.toFixed(2)}s
              </span>
              <button className="btn btn-ghost" onClick={() => { setStartSec(0); setEndSec(durationTotal); }}>Zerar corte</button>
            </div>
          </div>

          <div className="editorTabs" role="tablist" aria-label="Seções do editor">
            {EDITOR_TABS.map((tab) => (
              <button key={tab.id} role="tab" aria-selected={editorTab === tab.id} className={editorTab === tab.id ? "active" : ""} onClick={() => setEditorTab(tab.id)}>
                {tab.label}
                {tab.badge > 0 && <em>{tab.badge}</em>}
              </button>
            ))}
          </div>

          <div className="editorPanel">
            {/* ---------- SOM ---------- */}
            {editorTab === "som" && (
              <div className="editorGrid">
                <section className="editorCard">
                  <div className="optTitle">Volume, tom e velocidade</div>
                  <Slider label="Volume" value={draft.volume ?? 1.0} min={0} max={10} suffix="x" quadratic={true} onChange={(v) => setDraft((prev) => ({ ...prev, volume: v }))} />
                  <Slider label="Tom" value={draft.pitch_semitones ?? 0} min={-12} max={12} step={1} suffix="st" onChange={(v) => setDraft((prev) => ({ ...prev, pitch_semitones: v }))} />
                  <Slider label="Velocidade" value={draft.speed ?? 1.0} min={0.25} max={4.0} step={0.05} suffix="x" onChange={(v) => setDraft((prev) => ({ ...prev, speed: v }))} />
                  <label className="optSelectRow">
                    <span className="optLabel">Ao mudar a velocidade</span>
                    <select value={draft.pitch_mode || "preserve"} onChange={(e) => setDraft((prev) => ({ ...prev, pitch_mode: e.target.value }))}>
                      <option value="preserve">O tom continua igual (voz natural)</option>
                      <option value="resample">O tom muda junto (efeito fita ou disco)</option>
                    </select>
                  </label>
                </section>
                <section className="editorCard">
                  <div className="optTitle">Entrada e saída suaves</div>
                  <Slider label="Aparecer devagar (fade in)" value={draft.fade_in_ms ?? 0} min={0} max={5000} step={50} suffix="ms" onChange={(v) => setDraft((prev) => ({ ...prev, fade_in_ms: v }))} />
                  <Slider label="Sumir devagar (fade out)" value={draft.fade_out_ms ?? 0} min={0} max={5000} step={50} suffix="ms" onChange={(v) => setDraft((prev) => ({ ...prev, fade_out_ms: v }))} />
                  <OptionRow label="Igualar o volume" desc="Deixa o som num volume parecido com os outros, sem ficar baixo nem estourar." checked={draft.normalize} onChange={(v) => setDraft({ ...draft, normalize: v })} />
                </section>
              </div>
            )}

            {/* ---------- EFEITOS ---------- */}
            {editorTab === "efeitos" && (
              <div className="editorEffects">
                <div className="editorEffectsBar">
                  <span><strong>{activeEffects}</strong> {activeEffects === 1 ? "efeito ligado" : "efeitos ligados"}. Ligue a chave para usar e arraste para ajustar a força.</span>
                  <button className="btn btn-ghost" onClick={turnOffAllEffects} disabled={activeEffects === 0}>Desligar todos</button>
                </div>
                <div className="editorGrid">
                  <section className="editorCard">
                    <div className="optTitle">Espaço e eco</div>
                    <EffectSliderRow label="Reverb" enabled={reverbEnabled} value={reverbMix * 100} min={0} max={90} suffix="%" onToggle={() => setReverbEnabled(!reverbEnabled)} onChange={(v) => setReverbMix(v / 100)} />
                    <EffectSliderRow label="Eco curto" enabled={echoEnabled} value={echoMix * 100} min={0} max={90} suffix="%" onToggle={() => setEchoEnabled(!echoEnabled)} onChange={(v) => setEchoMix(v / 100)} />
                    <EffectSliderRow label="Delay" enabled={delayEnabled} value={delayMix * 100} min={0} max={90} suffix="%" onToggle={() => setDelayEnabled(!delayEnabled)} onChange={(v) => setDelayMix(v / 100)} />
                    <EffectSliderRow label="Fantasma" enabled={!!extraFx.ghost_enabled} value={extraValue("ghost_mix", 0.35) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("ghost")} onChange={(v) => setExtraAmount("ghost_mix", v / 100)} />
                  </section>
                  <section className="editorCard">
                    <div className="optTitle">Timbre</div>
                    <EffectSliderRow label="Equalizador (graves ↔ agudos)" enabled={eqEnabled} value={eqTone * 100} min={0} max={100} suffix="%" onToggle={() => setEqEnabled(!eqEnabled)} onChange={(v) => setEqTone(v / 100)} />
                    <EffectSliderRow label="Compressor" enabled={compressorEnabled} value={compressorAmount * 100} min={0} max={100} suffix="%" onToggle={() => setCompressorEnabled(!compressorEnabled)} onChange={(v) => setCompressorAmount(v / 100)} />
                    <EffectSliderRow label="Distorção" enabled={distEnabled} value={distDrive} min={1} max={100} suffix="x" onToggle={() => setDistEnabled(!distEnabled)} onChange={(v) => setDistDrive(v)} />
                    <EffectSliderRow label="Chorus" enabled={!!extraFx.chorus_enabled} value={extraValue("chorus_mix", 0.28) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("chorus")} onChange={(v) => setExtraAmount("chorus_mix", v / 100)} />
                    <EffectSliderRow label="Flanger" enabled={!!extraFx.flanger_enabled} value={extraValue("flanger_mix", 0.24) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("flanger")} onChange={(v) => setExtraAmount("flanger_mix", v / 100)} />
                  </section>
                  <section className="editorCard">
                    <div className="optTitle">Vozes e estilos</div>
                    <EffectSliderRow label="Robô" enabled={robotEnabled} value={robotRate} min={5} max={120} suffix="Hz" onToggle={() => setRobotEnabled(!robotEnabled)} onChange={(v) => setRobotRate(v)} />
                    <EffectSliderRow label="Telefone" enabled={!!extraFx.telephone_enabled} value={extraValue("telephone_mix", 0.8) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("telephone")} onChange={(v) => setExtraAmount("telephone_mix", v / 100)} />
                    <EffectSliderRow label="Rádio" enabled={!!extraFx.radio_enabled} value={extraValue("radio_mix", 0.7) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("radio")} onChange={(v) => setExtraAmount("radio_mix", v / 100)} />
                    <EffectSliderRow label="Sussurro" enabled={!!extraFx.whisper_enabled} value={extraValue("whisper_mix", 0.35) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("whisper")} onChange={(v) => setExtraAmount("whisper_mix", v / 100)} />
                    <EffectSliderRow label="Tremolo" enabled={!!extraFx.tremolo_enabled} value={extraValue("tremolo_rate_hz", 8)} min={1} max={20} suffix="Hz" onToggle={() => toggleExtra("tremolo")} onChange={(v) => setExtraAmount("tremolo_rate_hz", v)} />
                    <EffectSliderRow label="Wobble" enabled={!!extraFx.wobble_enabled} value={extraValue("wobble_mix", 0.35) * 100} min={0} max={100} suffix="%" onToggle={() => toggleExtra("wobble")} onChange={(v) => setExtraAmount("wobble_mix", v / 100)} />
                    <EffectSliderRow label="Tocar ao contrário" enabled={reverseEnabled} value={reverseMix * 100} min={0} max={100} suffix="%" onToggle={() => setReverseEnabled(!reverseEnabled)} onChange={(v) => setReverseMix(v / 100)} />
                  </section>
                  <section className="editorCard">
                    <div className="optTitle">Limpeza</div>
                    <EffectSliderRow label="Redução de ruído" enabled={gateEnabled} value={gateThreshold * 100} min={0} max={40} suffix="%" onToggle={() => setGateEnabled(!gateEnabled)} onChange={(v) => setGateThreshold(v / 100)} />
                    <p className="optModeDesc">Abaixa o chiado e o barulho de fundo nos trechos mais baixos do som.</p>
                  </section>
                </div>
              </div>
            )}

            {/* ---------- COMO TOCA ---------- */}
            {editorTab === "toca" && (
              <div className="editorOptions">
                <div className="optTitle">Como este som toca</div>
                <label className="optSelectRow">
                  <span className="optLabel">Ao tocar de novo</span>
                  <select value={draft.playback_mode || "restart"} onChange={(e) => setDraft({ ...draft, playback_mode: e.target.value })}>
                    {playbackModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <p className="optModeDesc">{(playbackModes.find((m) => m.value === (draft.playback_mode || "restart")) || playbackModes[0]).desc}</p>

                <OptionRow label="Repetir em loop" desc="O som toca de novo sem parar até você interromper." checked={draft.loop} onChange={(v) => setDraft({ ...draft, loop: v })} />
                <OptionRow label="Calar a minha voz" desc="Sua voz não vai para o Discord enquanto este som toca." checked={draft.block_voice} onChange={(v) => setDraft({ ...draft, block_voice: v })} />
                <OptionRow label="Parar os outros sons" desc="Ao tocar este, os outros sons são interrompidos." checked={draft.stop_other_sounds} onChange={(v) => setDraft({ ...draft, stop_other_sounds: v })} />
                <OptionRow label="Silenciar os outros sons" desc="Os outros sons ficam mudos enquanto este toca." checked={draft.mute_other_sounds} onChange={(v) => setDraft({ ...draft, mute_other_sounds: v })} />
                {selected.isClip && (
                  <>
                    <div className="optTitle" style={{ marginTop: 14 }}>Canais do clipe</div>
                    <OptionRow label="Incluir a minha voz" checked={draft.clipVoiceEnabled !== undefined ? !!draft.clipVoiceEnabled : !!selected.clipVoiceEnabled} onChange={(v) => setDraft({ ...draft, clipVoiceEnabled: v })} />
                    <OptionRow label="Incluir o áudio do PC ou do jogo" checked={draft.clipPcEnabled !== undefined ? !!draft.clipPcEnabled : !!selected.clipPcEnabled} onChange={(v) => setDraft({ ...draft, clipPcEnabled: v })} />
                  </>
                )}
              </div>
            )}

            {/* ---------- DETALHES ---------- */}
            {editorTab === "detalhes" && (
              <div className="editorDetails">
                <div className="sound-modal-cover-box" style={{ background: `color-mix(in srgb, ${selected.color || "#8B5CF6"} 15%, var(--bg-card-secondary))` }}>
                  {draft.coverUrl || selected.coverUrl ? (
                    <img src={draft.coverUrl || selected.coverUrl} alt="" />
                  ) : (
                    <MusicNotes size={42} color={selected.color || "var(--purple)"} />
                  )}
                  <div className="sound-modal-cover-overlay" onClick={chooseCover}>
                    <span style={{ fontSize: 11, fontWeight: 700 }}>Escolher capa</span>
                  </div>
                </div>
                <div className="editorDetailsFields">
                  <div className="labField">
                    <label>Nome do som</label>
                    <input type="text" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                  </div>
                  <div className="labField">
                    <label>Categoria ou pasta</label>
                    <input type="text" value={draft.category || ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                  </div>
                  <div className="labField">
                    <label>Atalho de teclado</label>
                    <input type="text" value={draft.shortcut || ""} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} placeholder="Ex.: Ctrl+Alt+1" />
                  </div>
                  <div className="labField">
                    <label>Para onde o som vai</label>
                    <select value={draft.output_route || "both"} onChange={(e) => setDraft({ ...draft, output_route: e.target.value })}>
                      {soundOutputRoutes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="sound-modal-footer">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost footerDanger" onClick={onDelete}><Trash size={14} /> Remover som</button>
            <button className="btn btn-ghost" onClick={handleRestore} title="Volta volume, tom, velocidade e efeitos ao normal (ainda não salva)"><ArrowClockwise size={14} /> Restaurar padrões</button>
            {selected.hasOriginal && (
              <button className="btn btn-ghost footerDanger" onClick={handleRestoreOriginalFile} title="Devolve o arquivo de áudio original, desfazendo cortes salvos">
                <ArrowCounterClockwise size={14} /> Restaurar original
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => handleSave(false)} title="Cria um som novo com estas alterações e mantém o atual como está">Salvar como cópia</button>
            <button className="btn btn-primary" onClick={() => handleSave(true)} title="Aplica as alterações neste som">Salvar alterações</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const LOCAL_CHANGELOGS = {
  "v2.3.1": `### Versão 2.3.1
* Editor de som reorganizado: a forma de onda e o player ficam sempre visíveis no topo, e embaixo há abas simples: Som (volume, tom, velocidade, fades), Efeitos, Como toca e Detalhes (nome, pasta, atalho, capa e para onde o som vai).
* Efeitos agrupados por finalidade (espaço e eco, timbre, vozes e estilos, limpeza), com contador de efeitos ligados na aba e botão "Desligar todos".
* Rodapé mais limpo: saiu o botão "Tudo no máximo" e o "Ouvir prévia" repetido (o player do topo já faz isso). Os botões de salvar ganharam explicação ao passar o mouse.
* Textos em português simples no lugar de termos técnicos em inglês.`,
  "v2.3.0": `### Versão 2.3.0
* Editor de som corrigido: a forma de onda e o corte tinham ficado esmagados (altura zero) depois dos efeitos novos. Agora aparecem de novo, com player de verdade: botão para ouvir a seleção, cabeça de reprodução em movimento, campos de início e fim, "zerar corte" e as cores do tema. O emoji do título saiu.
* Atalhos de segurar e de apertar corrigidos: segurar a tecla de um som não reinicia mais dezenas de vezes por segundo, o modo "segurar para repetir" agora toca enquanto a tecla está apertada e para ao soltar, e o glitch não fica mais preso se o evento de soltar se perder. Segurar um atalho global (mutar, ligar a voz) também não alterna sem parar.
* Explorar Sons redesenhado: cabeçalho, busca com botão, abas segmentadas, filtros num popover (sem painel dentro de painel, com as cores do tema), chips dos filtros ativos, cards limpos, carregamento com esqueleto e estados vazios claros.
* Cartão "Como este som toca" refeito no editor: chaves com explicação do que cada uma faz, e agora os cinco modos aparecem (recomeçar, tocar por cima, tocar e parar, pausar e continuar, segurar para repetir), além de "parar os outros sons" e "silenciar os outros sons".
* Texto para voz fica só no menu "Adicionar" do Soundboard.
* Ícone do app com fundo violeta e microfone mais fino, para aparecer bem na barra de tarefas.`,
  "v2.2.1": `### Versão 2.2.1
* Ícone atualizado: só o microfone violeta, maior e mais limpo, sem as ondas laterais.
* Menos travadinhas ao tocar sons: tocar um som não regrava mais a biblioteca inteira na hora (o placar de plays é salvo em segundo plano) nem faz a interface baixar e redesenhar os 270 sons de novo. Só o card do som tocado é atualizado.`,
  "v2.2.0": `### Versão 2.2.0
* Temas de verdade: ao trocar a cor (Rubi Carmim, Ouro Âmbar, etc.), botões, destaques, brilhos, bordas e o logo mudam junto. O texto sobre botões claros fica escuro para continuar legível.
* Configurações refeitas do zero: menu lateral agrupado, uma coluna de leitura, cada opção com texto curto explicando o que faz, e as opções técnicas escondidas em "Avançado". Cada seção tem "Restaurar padrão".
* Redução de ruído (Noise Gate) refeita: agora usa um gate de verdade, com tempo de ataque, espera e liberação. Antes ela cortava a onda a cada cruzamento por zero e distorcia até a voz alta.
* Favoritos agora mostra também os sons favoritos (o coração do Soundboard), e "Tocados recentemente" só lista o que foi tocado de fato.
* Perfil do usuário melhorado: estatísticas (sons, reproduções, favoritos, perfis), prévia ao vivo na edição, contadores de caracteres, aba de prévia do "Sobre mim", modelo pronto e foto redimensionada automaticamente (fotos grandes podiam quebrar o salvamento).
* Correções: o botão "Restaurar padrão" da Aparência e o da aba Atalhos gravavam valores errados ou não funcionavam; textos da manutenção agora dizem exatamente o que cada botão faz (ele não apaga seus sons); a opacidade da barra flutuante voltou a funcionar; botões do Explorar Sons ganharam nomes para leitores de tela.`,
  "v2.1.0": `### Versão 2.1.0
* O app agora se chama VozLab Studio, com ícone novo (microfone violeta com ondas). Seus sons, perfis, favoritos e configurações continuam exatamente onde estavam.
* Muito mais fluido: a aba Vozes foi de cerca de 29 para 140 quadros por segundo na rolagem (as 1.316 barrinhas animadas dos cards agora só se mexem com o mouse em cima), o Soundboard foi de 70 para 106 e o Explorar Sons de 110 para 126. As atualizações periódicas deixaram de travar a tela.
* Cards de voz e de som são atualizados só quando mudam, e o dock e o player não usam mais desfoque sobre a lista que rola.`,
  "v2.0.0": `### Versão 2.0.0
* Abertura mais rápida: os dispositivos de áudio agora são consultados em paralelo com o carregamento da biblioteca (a criação do estado caiu de cerca de 1,0 s para 0,3 s nos testes), o Electron inicia o servidor de áudio antes de criar a janela e a interface confirma o servidor mais cedo.
* Código reorganizado por dentro: TTS, clipes, importação do YouTube/TikTok, sons online e perfis agora ficam em módulos próprios, o que facilita as próximas versões. Nada muda para quem usa.`,
  "v1.8.0": `### Versão 1.8.0
* Nova aba Perfis: salve a voz, os efeitos, os volumes e, se quiser, o microfone e o fone, e aplique com um clique.
* Cada perfil pode ter um atalho próprio e trocar sozinho quando um programa abrir em primeiro plano (Discord, um jogo, OBS). O botão "Detectar o programa que eu abrir" descobre o nome do programa para você.
* Perfis podem ser atualizados com o estado atual, exportados e importados (com validação do arquivo).
* Configurações de áudio explicadas passo a passo: seu microfone, o CABLE Input como saída da voz e o fone para você se ouvir. O guia de primeiros passos também foi atualizado.`,
  "v1.7.1": `### Versão 1.7.1
* A voz agora abre ligada e sem filtro (Sem efeito) por padrão, e o aviso de "voz desligada" não aparece mais ao abrir. A opção continua em Configurações ("Ligar a voz ao abrir o app") para quem preferir ligar manualmente.`,
  "v1.7.0": `### Versão 1.7.0
* App leve em segundo plano: ao minimizar para a bandeja, a interface é fechada depois de alguns segundos e a memória cai pela metade (de cerca de 530 MB para 260 MB nos testes). A voz, o soundboard, os atalhos e a bandeja continuam funcionando, e a janela reabre ao clicar no ícone.
* Os atalhos de mutar o microfone, mutar o soundboard e ligar/desligar a voz funcionam direto, sem reabrir a janela, e mostram uma notificação discreta. Os demais atalhos acordam a janela escondida e executam.
* Ao reabrir a janela pela bandeja, o app não religa a voz que você desligou.
* Nova opção em Configurações: "Liberar memória na bandeja" (ligada por padrão).`,
  "v1.5.6": `### Versão 1.5.6
* Texto para voz (TTS): textos longos não travam mais o app inteiro durante a geração (antes um texto de 15 mil caracteres congelava tudo por mais de um minuto).
* O TTS e o YouTube/TikTok agora também ficam no menu "Adicionar" do Soundboard.
* Importar do YouTube/TikTok em um passo só: cole o link (ou já vem preenchido se estiver copiado), escolha a aba e baixe.
* Editor de áudio: acelerar ou desacelerar não muda mais o tom por padrão. O modo "efeito fita" continua disponível. Novos efeitos: Robô, Equalizador, Compressor, Chorus, Flanger, Fantasma, Telefone, Rádio, Sussurro, Tremolo e Wobble.
* Menu do botão direito reorganizado em grupos, com nomes e ícones corretos.
* As abas do Soundboard e de Vozes rolam com a roda do mouse e arrastando.
* Arrastar o ajuste rápido de volume não seleciona mais textos da página.
* O guia de boas-vindas aparece só uma vez, e só para quem é novo no app.`,
  "v1.5.5": `### Versão 1.5.5
* O player de áudio agora tem o mesmo visual de vidro do dock e fica logo acima dele, com um pequeno espaço entre os dois.
* Nova tela de carregamento, com barras de onda animadas e etapas.
* Tocar vários sons ao mesmo tempo continua funcionando: o botão de tocar no card e a prévia do painel param só aquele som, sem derrubar os outros que estão tocando.
* Novos testes cobrem sons simultâneos, parar e pausar um som isolado e o modo de um som por vez.`,
  "v1.5.4": `### Versão 1.5.4
* O ajuste rápido de volume do Soundboard agora acompanha o arrasto do mouse sem atraso nem voltar para trás.
* Soundboard redesenhado: cabeçalho único com busca e menu "Adicionar" (arquivos, pasta ou link), gravação em uma faixa própria e botão de tocar direto na capa de cada som.
* Voice Lab redesenhado: ações no topo (Salvar como preset, Exportar, Importar), layout em duas colunas e botões não ficam mais atrás do dock. Removido o botão "Ouvir Prévia", que só mostrava um aviso.
* O player de áudio agora flutua acima do dock, sem mudar a altura da tela, e usa as cores do novo design.`,
  "v1.5.3": `### Versão 1.5.3
* Corrigido: os botões "Ligar voz" e "Como resolver" do aviso do dock não respondiam ao clique.
* O player do topo agora flutua sobre o conteúdo e não muda mais a altura da tela ao tocar ou parar um som. Também ganhou as cores do novo design.
* Guia de primeiros passos na primeira abertura, e guia de uso no Discord, OBS, jogos e chamadas.
* Assistente de áudio ganhou medidor do microfone e botão "Copiar relatório" para pedir ajuda.
* Se o microfone sumir, o app troca para outro disponível e avisa qual foi escolhido.`,
  "v1.5.2": `### Versão 1.5.2
* Trocar microfone, saída ou fone em Configurações agora aparece na hora, sem precisar reiniciar o app.
* Se a voz cair sozinha (microfone desconectado, driver), o app tenta reconectar automaticamente e avisa o motivo se não conseguir.
* Novo assistente "Problemas de áudio?": verifica microfone, cabo virtual, voz, mudo e retorno em linguagem simples, com botões que resolvem e "Arrumar tudo automaticamente".
* Ao abrir o app com a voz desligada, um aviso explica o que fazer.
* O botão de voz do dock mostra o erro quando falha, em vez de falhar em silêncio.`,
  "v1.5.1": `### Versão 1.5.1
* O botão de alto-falante do dock agora liga e desliga o retorno da própria voz. Antes, com o monitor da voz desligado e o do soundboard ligado, o clique desligava tudo e nunca ligava o retorno da voz.
* Ao ligar o retorno com o volume em 0%, o volume volta para 100% em vez de ligar mudo.`,
  "v1.5.0": `### Versão 1.5.0
* Novo visual premium: paleta grafite com um único acento roxo, barra lateral por seções (Estúdio, Biblioteca, Sistema), dock com efeito de vidro e cards, botões e modais redesenhados.
* Seletor de temas removido: o app tem um único design. A cor de destaque continua personalizável.
* O app abre sempre em Sem efeito. Nova opção "Lembrar a última voz ao abrir", desligada por padrão.
* Rota virtual automática e monitoramento da própria voz vêm desligados por padrão, e os padrões antigos são migrados uma única vez.
* TTS com mais de 300 vozes, geração paralela de textos longos, cache de frases repetidas, controle de tom e voz offline do Windows como reserva.
* Erros do TTS aparecem na tela em vez de falhar em silêncio.
* Interface mais ágil: o estado do soundboard muda na hora ao tocar ou parar um som, os sliders respondem sem atraso e o app abre mais rápido.`,
  "v1.4.3": `### Versão 1.4.3
* Aviso de atualização somente uma vez por abertura do aplicativo. Voltar para a janela não repete o aviso; consultas periódicas de releases removidas.
* Menu de versões continua consultando atualizações ao abrir ou ao clicar em atualizar a lista.
* Vídeo de apresentação abre uma vez por versão, incluindo atualização pelo aplicativo e primeira instalação.
* Menus de contexto medem seu tamanho real, adaptam a posição à tela e permitem rolagem em janelas menores.
* Soundboard com abas e filtro de origem separados, sem duas fileiras de categorias repetidas.
* Removidos títulos e subtítulos repetidos das páginas. Polimento de Vozes, Explorar Sons, Favoritos, Voice Lab e Configurações.
* Menos consultas de estado em segundo plano e animações decorativas pausadas. Player não mantém timer ocioso nem anima progresso com a janela fora de foco.
* Corrigida consulta de estado em ciclo ao abrir o TTS. O gerador usa as configurações já carregadas, sem buscar a biblioteca em sequência.
* Áudio, gravações, atalhos e funções da barra rápida preservados.`,
  "v1.4.2": `### Versão 1.4.2
* Primeira instalação abre o vídeo de apresentação no navegador. Atualizações e reinstalações não repetem a abertura.
* Glitched Temporal separa a voz normal da repetição: corrupção digital, bitcrush e ambiente passam a afetar somente os trechos repetidos.
* Ganho padrão corrigido de 2,8x para 1x. Mix com margem para evitar saturação ao somar a fala e a repetição, além de transições mais suaves.
* Volume da repetição e redução da voz normal ajustáveis no painel do Glitched Temporal. Ajustes antigos de tempo e repetição preservados.
* Soundboard com cartões compactos, capas ao lado do nome, favoritos com coração, menu de opções visível e ícones consistentes.
* Bordas, contraste, sombras e painel de som refinados, com foco de teclado e mensagem para abas vazias.
* Temas, configurações, reprodução por duplo clique e barra rápida fixa preservados.`,
  "v1.4.1": `### Versão 1.4.1
* Mantidos o design atual, os temas e a barra rápida fixa. Sem o redesign experimental.
* Corrigido o carregamento infinito quando o backend está ausente ou falha na inicialização. Erros específicos, nova tentativa, acesso aos logs e orientação de reinstalação sem apagar configurações.
* Requisições de estado e saúde com tempo limite. Inicialização lenta não fica presa em uma mensagem genérica.
* Backend validado antes do empacotamento e após a instalação. Logs de execução mesmo sem console Python; falhas na preparação do áudio são registradas com código de erro.
* Glitch Sob Comando não perde mais o disparo ao trocar de voz ou quando ainda está formando o histórico de áudio.
* Velocidade, pitch, direção e quantidade passam a atualizar a repetição em andamento. Segurar continua repetindo até soltar, inclusive após mudar ajustes.
* Parar não permite que ajustes posteriores ressuscitem a repetição. Soltar teclas sem ter iniciado o atalho não interrompe o botão de segurar.
* Glitched Temporal não é mais interrompido por ajustes de volume e monitoramento. Mudanças de intervalo passam a valer sem esperar o intervalo antigo.
* Indicação de bypass no painel de voz e motivo dos controles de repetição estarem desativados.
* Notas disponíveis dentro do aplicativo, inclusive offline.`,
  "v1.4.0": `### Versão 1.4.0
* 14 novas vozes: Banana Caótica, Bebê Revoltado, Desenho Emborrachado, Voz de Gelatina, Palhaço Digital, Dupla Desafinada, NPC Travado, Internet de Batata, Robô de Brinquedo, Interfone do Caos, Locutor de Promoção, Fita Derretendo, Eco Escadinha e Rewind de Meme.
* Glitch Sob Comando com captura e contagem exatas de 1 a 10.000 repetições, direção normal, reversa ou ida e volta, velocidade, pitch, volume independente e redução da voz original.
* Disparo e parada na lateral e no Voice Lab. Segurar funciona até soltar a tecla ou o botão, sem repetir automaticamente ao manter uma tecla no modo de disparo.
* Desativar temporariamente a voz não grava mais os efeitos desligados no preset. Ajustes antigos recuperam os efeitos principais ao selecionar a voz.
* Atalho global preservado entre vozes e ajustes enviados em ordem, sem respostas antigas sobrescrevendo controles novos.
* Wobble contínuo com velocidade ajustável. Eco e delay com controles de tempo e decaimento.
* Limpeza dos buffers ao desligar efeitos temporais e trocar de voz. Pitch e repetição processados em blocos para reduzir o trabalho no áudio.
* Lateral responsiva, sliders sem corte, controles específicos por voz, filtro Novas, Recentes corrigido e busca por tags.
* Descrições corrigidas para distinguir efeitos sintéticos de correção automática de afinação. Histórico disponível também offline.`,
  "v1.3.11": `### Versão 1.3.11
* Corrigida a falha fatal incorreta quando o backend demora para preparar o áudio.
* O aplicativo permanece na tela de carregamento e se recupera automaticamente quando o backend fica pronto.
* Inicializações lentas não fecham mais o aplicativo nem exibem alerta de antivírus sem evidência.
* Os logs agora registram o executável, PID, criação, encerramento e estado real do backend.`,

  "v1.3.10": `### Versão 1.3.10
* Corrigido o carregamento parcial da interface durante a preparação do backend.
* A janela só é exibida depois que o estado de áudio está pronto para uso.
* A espera de inicialização agora diferencia backend respondendo de backend pronto.
* O tempo máximo de preparação foi ampliado para evitar falsos erros em computadores mais lentos.`,

  "v1.3.9": `### Versão 1.3.9
* Corrigido o alerta falso de backend indisponível durante a inicialização.
* A porta de saúde responde imediatamente enquanto os dispositivos de áudio são preparados.
* A interface aguarda o estado pronto sem tratar essa preparação como conflito de porta.
* A sincronização de iniciar com o Windows agora espera o backend terminar de carregar.
* O estado de áudio não é mais inicializado antes do servidor começar a responder.`,

  "v1.3.8": `### Versão 1.3.8
* Trocas de microfone, cabo virtual e fone passam a valer imediatamente, sem reiniciar o aplicativo.
* O Windows recebe novas tentativas curtas para liberar a saída anterior antes de abrir o dispositivo escolhido.
* Uma escolha só é salva depois que o novo stream de áudio abre com sucesso.
* Em caso de falha, o aplicativo restaura automaticamente o dispositivo anterior e informa o erro na tela.
* Corrigida a inicialização indevida do estado de áudio ao apenas importar o módulo do backend.`,

  "v1.3.7": `### Versão 1.3.7
* Removido o corte fixo que encerrava sons após 6 minutos.
* Áudios longos comuns agora são reproduzidos em fluxo diretamente do disco, mantendo o uso de memória controlado.
* Reprodução longa suporta busca, pausa, loop e ajuste de velocidade durante o play.`,

  "v1.3.6": `### Versão 1.3.6
* A janela do aplicativo aparece imediatamente enquanto o sistema de áudio termina de iniciar.
* Backend empacotado em formato mais rápido e confiável, sem extração temporária a cada abertura.
* Configurações, perfil, soundboard, categorias, temas e lixeira agora usam escrita atômica com backup automático.
* Arquivos corrompidos durante desligamentos são recuperados do último backup válido em vez de resetar silenciosamente.
* A interface reconhece quando o backend reinicia e recarrega todo o estado do aplicativo.
* Atalhos antigos do Menu Iniciar são removidos para evitar a abertura de instalações legadas.
* Restauração do microfone ganhou fallback pelo nome do dispositivo quando o Windows altera seu identificador.`,

  "v1.3.5": `### Versão 1.3.5
* Nova opção para abrir o MicFudiddo junto com o Windows, desativada por padrão.
* A restauração do microfone acontece antes do encerramento dos streams de áudio.
* Backup do microfone original passa a ser salvo de forma atômica para resistir a desligamentos abruptos.
* O processo de áudio detecta o encerramento do app mais rápido e tenta restaurar o microfone por mais tempo.
* Encerrar pelo aplicativo agora solicita a restauração antes de desligar o backend.`,

  "v1.3.4": `### Versão 1.3.4
* Corrigido o volume das prévias do Explorar Sons: 0% agora fica realmente silencioso.
* O valor configurado passa a ser aplicado no multiplicador real de reprodução do áudio.
* Adicionado teste de regressão para garantir o volume inicial das prévias.`,

  "v1.3.3": `### Versão 1.3.3
* Volume separado para as prévias do Explorar Sons, com ajuste direto na tela e nas configurações.
* A barra rápida de retorno de voz não altera mais o volume do Soundboard.
* O volume do Soundboard continua disponível no mixer próprio do botão direito.
* Disparos antigos do Glitch Sob Comando são cancelados ao trocar/desativar o modo.
* Proteção contra callbacks de atalhos que chegam atrasados durante a troca de voz.`,

  "v1.3.2": `### Versão 1.3.2
* Reverb, eco e delay foram reconstruídos com buffers independentes e caudas contínuas.
* Delay de áudios curtos agora continua audível na prévia e no arquivo salvo.
* Chorus, flanger e fantasma mantêm continuidade entre blocos sem misturar memória com outros efeitos.
* Desligar um efeito limpa sua cauda imediatamente e impede áudio antigo de reaparecer.
* Sliders do VoiceLab agora usam valores e escalas corretos para todos os módulos.
* Controles específicos de cada voz ganharam interruptores para ativar e desativar os efeitos.
* Robô Quebrado, Glitched Temporal e Glitch Sob Comando foram testados e corrigidos no fluxo completo.
* Processamento dos efeitos temporais foi otimizado para reduzir falhas e cortes em tempo real.`,

  "v1.3.1": `### Versão 1.3.1
* Reduz drasticamente o uso de CPU, memória e rede interna com atualizações leves e sem requisições sobrepostas.
* Capas do Soundboard agora são carregadas sob demanda, em vez de serem reenviadas dentro de cada atualização.
* Cache, reprodução simultânea, renderização e gravações ganharam limites de segurança para proteger o computador.
* O backend agora acompanha o processo correto do aplicativo e sempre encerra junto com ele.
* Instâncias antigas são encerradas antes da abertura e o aplicativo não reutiliza mais backends órfãos.
* A interface tenta se recuperar de uma falha isolada e encerra o áudio após falhas repetidas.
* Logs do backend são preservados e rotacionados para facilitar o diagnóstico de novos problemas.`,

  "v1.3.0": `### Versão 1.3.0
* Repetições de 1 a 10.000 agora usam controle logarítmico preciso, sem campo numérico separado.
* Glitch Sob Comando ganhou velocidade, pitch, volume, redução da voz normal, reverso e ping-pong configuráveis.
* Reverse reconstruído com buffer de fala real, janela, velocidade, pitch e ganho próprios.
* Ajustes são salvos por voz por padrão; é possível restaurar uma voz ou desativar a persistência nas configurações.
* O atalho do Glitch Sob Comando também pode ser configurado em Atalhos Globais.
* Proteção reforçada para restaurar o microfone original ao fechar, reiniciar ou desligar o Windows.
* Histórico interno completado para releases que ainda não tinham notas no aplicativo.`,

  "v1.2.1": `### Versão 1.2.1
* Corrige o botão inferior Voz Normal para desligar todos os efeitos sem sobreposição.
* Controles rápidos agora usam sempre o estado mais recente, evitando efeitos antigos reaparecendo.
* Ganho do microfone e volume da voz aceitam precisão de 0,01 pelo slider ou campo numérico.`,

  "v1.2.0": `### Versão 1.2.0
* Nova voz Glitch Sob Comando: permanece totalmente limpa até o atalho global ser usado.
* Modo Disparar com repetição configurável de 1 a 10.000 vezes.
* Modo Segurar mantém o trecho em loop e encerra suavemente quando a tecla é solta.
* Volume exclusivo da repetição e redução independente da voz normal.
* Configuração completa na lateral da voz e no Modular Voice Lab.`,

  "v1.1.1": `### Versão 1.1.1
* Corrige o corte lateral dos controles no painel de edição de vozes.
* Sliders agora se adaptam corretamente à largura do painel sem rolagem horizontal invisível.`,

  "v1.1.0": `### Versão 1.1.0
* Controles personalizados para cada voz, com nomes, unidades e limites próprios.
* Glitched Temporal avançado com intervalo, fragmento, rewind, repetições, reverso e ping-pong.
* Novos módulos de segunda voz, estática de rádio e ambientes procedurais.
* Novas vozes Possuído, Arquétipo Colossal, Anime Spark e Mic Troll.
* Demônio, Fantasma, Alien, Rádio de Combate e Robô Quebrado foram reconstruídos.`,

  "v1.0.4": `### Versão 1.0.4
* O verificador de atualizações agora ignora respostas antigas em cache.
* Novas releases são verificadas novamente ao focar o aplicativo e periodicamente.
* A janela de versões ganhou atualização manual e fallback recente.`,

  "v1.0.3": `### Versão 1.0.3
* Criação direta e persistente de abas vazias no Soundboard.
* Novo efeito Glitched Temporal com repetição, rewind e reversão de microtrechos.`,

  "v1.0.2": `### Versão 1.0.2
* A escolha das abas de destino passou a aparecer somente durante importações.
* Importações do YouTube e TikTok ganharam fluxo de destino mais claro.
* Adicionar ao Soundboard passou a permitir escolher em quais abas o áudio será salvo.`,

  "v1.0.1": `### Versão 1.0.1
* Restauração do microfone padrão reforçada ao fechar ou interromper a rota virtual.
* Soundboard ganhou múltiplas abas por áudio e destinos configuráveis de importação.
* Importador passou a identificar YouTube e TikTok com mensagens e validações próprias.
* Categorias e metadados de sons ficaram mais resistentes a dados antigos ou incompletos.`,

  "v1.0": `### Versao 1.0
* TTS sem limite agora processa textos longos de verdade: o backend divide blocos gigantes em partes menores, gera cada trecho e junta tudo antes de tocar ou salvar.
* O atalho global de focar digitacao voltou a abrir/focar o Widget TTS mesmo quando a barra flutuante esta fechada.
* O campo de texto remove o limite de 10.000 caracteres de forma limpa quando a opcao "Remover limite de caracteres" esta ativa.`,

  "v0.5.47": `### 🌟 Versão 0.5.47 (Versão Atual)
* 🎯 **Foco e Escopo Definidos do Atalho**: Correção robusta para o atalho global do Widget TTS. Usando uma transição rápida de visibilidade da janela (\`hide\`/\`show\`), o Windows agora é forçado a conceder o foco de digitação de forma imediata à janela flutuante ao acionar o atalho a partir de outros programas. Além disso, o atalho passa a ficar ativo e interceptar teclas **apenas quando o widget estiver aberto** na tela, respeitando o uso geral do teclado no PC.`,

  "v0.5.46": `### 🌟 Versão 0.5.46
* 🎯 **Foco de Digitação Forçado**: Ajuste fino no atalho global para contornar a prevenção de roubo de foco do Windows. Agora, ao pressionar o atalho a partir de qualquer aplicativo ou jogo, o campo de texto ganha foco e teclado automaticamente, sem a necessidade de clicar manualmente na janela do widget.`,

  "v0.5.45": `### 🌟 Versão 0.5.45
* 🎯 **Abertura por Atalho Restaurada**: O atalho global para focar a digitação (Widget TTS) agora pode abrir novamente a janela flutuante quando ela estiver fechada. A segurança contra bloqueio do teclado continua ativa, exigindo chaves com modificadores para evitar conflito.`,

  "v0.5.44": `### 🌟 Versão 0.5.44
* ⚡ **Segurança de Limite TTS**: Ajuste da velocidade mínima do TTS para -95% em vez de -100%. Com step de 5, isso garante que o valor 0% (velocidade normal) continue perfeitamente selecionável no slider, além de evitar travamentos ou silêncio absoluto gerados pelo limite físico do motor de voz.`,

  "v0.5.43": `### 🌟 Versão 0.5.43
* ⚡ **Velocidade do TTS Ampliada**: Limite de velocidade da síntese de voz estendido para até +200% tanto no modal normal de TTS quanto no Widget TTS flutuante, ideal para quem precisa ler/falar de forma super lenta ou super ágil.
* 🔊 **Feedback de Volume**: Confirmação visual de que o indicador da porcentagem de volume está sempre visível na barra de digitação rápida.`,

  "v0.5.42": `### 🌟 Versão 0.5.42
* 🛡️ **Segurança e Proteção de Atalhos**: Os atalhos globais agora possuem validação inteligente contra sequestro de teclado. Atalhos de tecla simples (como letras/números isolados) são bloqueados e marcados como inseguros, exigindo modificadores (Ctrl, Alt, Shift) ou teclas de função (F1-F12) para evitar o travamento do sistema.
* 🚪 **Ativação Dinâmica**: O atalho global do Widget TTS é desregistrado imediatamente assim que a janela do widget é fechada, devolvendo o controle da tecla inteiramente ao Windows e outros programas.
* 🔌 **Atalhos Otimizados**: Atalhos de recursos desativados (como clipes de retrocesso com clipping desligado) não são mais registrados em background.`,

  "v0.5.41": `### 🌟 Versão 0.5.41
* 🎨 **Sincronização de Temas no Widget TTS**: O Widget flutuante de TTS agora responde instantaneamente à mudança de temas nas configurações, aplicando a paleta de cores selecionada (Cyberpunk, Dracula, Vampire, Neon, Synthwave) de forma síncrona.`,

  "v0.5.40": `### 🌟 Versão 0.5.40
* 🎯 **Atalho de Digitação Inteligente**: O atalho global para focar a digitação (Widget TTS) agora só foca o input se o widget já estiver aberto ou fixado na tela. Ele não abre mais a janela flutuante acidentalmente caso ela esteja fechada.
* 📜 **Changelog Atualizado**: Histórico de notas de atualização exibindo informações completas desde a versão v0.5.34 em diante.`,

  "v0.5.39": `### 🌟 Versão 0.5.39
* ⚡ **Sem Lag no Mixer**: Implementado debouncing inteligente nas chamadas de controle do mixer rápido. O pitch e volumes atualizam visualmente na hora e enviam as requisições ao backend de forma suave sem causar resvalos ou fazer o controle pular ao soltá-lo.
* 🔄 **Reset por Aba**: Adicionado botão no rodapé das Configurações que permite restaurar de fábrica as definições exclusivamente da aba ativa.
* 🛑 **Bloqueio de Soundboard Cheio**: Validação de segurança que bloqueia importações quando o limite do Soundboard é atingido, exibindo indicador vermelho de alerta.`,

  "v0.5.38": `### 🌟 Versão 0.5.38
* 🧹 **Limpeza Snappy**: Deseleção e limpeza do campo de digitação do Widget TTS ocorrem instantaneamente ao apertar Enter, sem aguardar o retorno da rede.
* 🔊 **Volume no Widget**: Mini slider de volume (0% a 200%) embutido na segunda linha do painel flutuante, ativado por padrão.
* 🚪 **Atalho Esc**: Pressione Esc na barra de digitação rápida para fechar o widget imediatamente.
* ⚠️ **Aviso de Textos Longos**: Confirmação visual obrigatória antes de processar ou salvar textos gigantes com 5.000 ou mais linhas.
* ⌨️ **Enter no TTS Modal**: Pressione Enter na janela normal de digitação do TTS para reproduzir a voz diretamente (Shift+Enter para pular linha).`,

  "v0.5.37": `### 🌟 Versão 0.5.37
* 🔊 **Ajuste de Volume do TTS**: Adicionada opção de volume padrão (0% a 200%) nas configurações de síntese de voz, afetando a geração dos áudios e previews.`,

  "v0.5.36": `### 🌟 Versão 0.5.36
* ⚙️ **Redesign das Configurações**: Interface reorganizada em 6 abas temáticas modernas (Áudio, TTS, Soundboard, Atalhos, Personalização, Sistema).
* 🔮 **Salvamento Automático**: Opções estéticas e de tema salvam dinamicamente sem necessidade de botão salvar.
* 📊 **Barra de Armazenamento**: Gráfico linear que indica o espaço consumido pelos áudios salvos na pasta da soundboard.`,

  "v0.5.35": `### 🌟 Versão 0.5.35
* 🎯 **Atalho Focar Digitação**: Atalho global para abrir/focar a barra rápida de digitação instantaneamente.
* 💾 **Manter Texto**: Configuração para impedir que a escrita do widget limpe após falar.
* 🧹 **Auto-Limpeza de Cache**: Otimização do cache de reprodução de TTS para excluir arquivos temporários antigos.`,

  "v0.5.34": `### 🌟 Versão 0.5.34
* 📜 **Fallback de Changelogs**: Histórico detalhado de notas de lançamentos integrada localmente para exibição offline e consultas rápidas.`,

  "v0.5.33": `### 🌟 Versão 0.5.33
* 🎛️ **Novo Layout do Widget TTS**: Redesenhamos o widget de TTS flutuante com uma estrutura de duas linhas. Os controles principais ficam no topo e o slider de velocidade horizontal estende-se por toda a largura na linha inferior para maior precisão e design elegante. A altura da janela foi aumentada para 90px.
* 🗂️ **Agrupamento de Vozes por Região**: Vozes em português agrupadas por região (todas as BR primeiro: Antonio, Francisca, Thalita; seguidas das de Portugal: Duarte, Raquel).`,

  "v0.5.32": `### 🌟 Versão 0.5.32
* 🔓 **Sem Limite de Caracteres no TTS**: Adicionada opção nas Configurações (desativada por padrão) para remover o limite máximo de 10.000 caracteres, permitindo sintetizar textos gigantescos sem restrições.`,

  "v0.5.31": `### 🌟 Versão 0.5.31
* 🧹 **Limpeza de Vozes Inválidas**: Remoção das vozes pt-BR/pt-PT que falhavam no Edge TTS. Mantidas apenas as vozes estáveis, dispostas de forma alternada (Masculino ➔ Feminino).
* 📈 **Aumento do Limite do TTS**: Elevação do limite prático padrão de caracteres de 1.000 para 10.000 para maior estabilidade e capacidade.`,

  "v0.5.30": `### 🌟 Versão 0.5.30
* ⏱️ **Velocidade no Widget TTS**: Adicionado mini-slider de velocidade de fala (-50% a +50%) diretamente no widget flutuante, sincronizado com o modal principal.
* ⚙️ **Visibilidade Customizável**: Opção nas Configurações para exibir ou ocultar o slider de velocidade no widget.`,

  "v0.5.29": `### 🌟 Versão 0.5.29
* 🎙️ **Alternância e Persistência**: Vozes do TTS reordenadas para Masculino ➔ Feminino, com salvamento unificado sob a chave "tts_default_voice".
* 🎮 **Visibilidade em Jogos (Always-on-top)**: Prioridade da janela flutuante elevada para "screen-saver" com visibilidade persistente em tela cheia.
* 🎨 **Cantos Arredondados do Widget**: Ajuste de borda (16px) e plano de fundo transparente forçado no Electron para renderizar cantos arredondados sem bordas pretas.`,

  "v0.5.28": `### 🌟 Versão 0.5.28
* ⚙️ **Correção de Presets no Mixer**: Correção no comparador de efeitos para tratar strings (como Magic Chords), evitando que presets ativos aparecessem incorretamente como "Voz Personalizada".
* 📌 **Botão Fixar Minimalista**: Remoção de texto do botão de fixar no TTSModal, mantendo apenas o ícone de alfinete (PushPin) elegante.`,

  "v0.5.27": `### 🌟 Versão 0.5.27
* 🔇 **Cancelamento de Eco em Clipes**: Algoritmo matemático para detecção de latência do Windows e cancelamento de eco da voz monitorada no áudio gravado do PC (clipes de Voz + PC).
* 📝 **Contador de Caracteres no TTS**: Adicionado limite inicial de 1.000 caracteres com contador dinâmico na tela e no widget.
* 📌 **Botão Fixar Widget**: Atalho rápido para alternar do modal completo para a barra flutuante compacta.
* 🏷️ **Nomes Claros de Dispositivos**: Identificação simplificada de dispositivos de áudio na página de Configurações.`,

  "v0.5.26": `### 🌟 Versão 0.5.26
* 🐛 **Correção de Inicialização e Conexão**: Resolvidos problemas críticos de colisão de porta e falhas de inicialização do backend que causavam erro de conexão ao abrir o aplicativo.
* 🎵 **Ritmo & Harmonia**: Lançamento do harmonizador polifônico **Magic Chords** (escalas Major, Minor, Space, Octaves, Mystic) e da bateria procedural **Beatbox Jam** (bumbo, caixa e chimbal sintetizados em tempo real). Expostos controles de BPM e Modo no Modular Voice Lab e na edição de presets.
* 🎛️ **Faders Mestres Globais**: Ganho do Microfone e Volume da Voz no Quick Mixer agora atuam de forma global, garantindo que presets e efeitos nunca desconfigurem ou silenciem seu volume configurado.
* 🎬 **Separação de Faixas de Clipe**: Clipes gravados com Voz + PC agora salvam faixas brutas individuais. No editor avançado de som, você pode optar por isolar apenas a voz ou o PC a qualquer momento com remixagem automática.
* ✍️ **Correção na Renomeação**: Resolvido o problema onde o campo de digitação de nome de som resetava a cada 700ms devido ao polling de atualização de estado.
* 📋 **Cópia de Link Segura**: Correção na cópia de links mágicos de compartilhamento e códigos de voz através de roteamento IPC nativo do Electron.`,

  "v0.5.25": `### 🌟 Versão 0.5.25
* 🎵 **Ritmo & Harmonia**: Lançamento do harmonizador polifônico Magic Chords e Beatbox Jam.
* 🎛️ **Faders Mestres Globais**: Ganho do Microfone e Volume da Voz no Quick Mixer agora atuam de forma global.
* 🎬 **Separação de Faixas de Clipe**: Suporte para isolar apenas a voz ou o PC a qualquer momento com remixagem automática.
* ✍️ **Correção na Renomeação**: Resolvido o problema onde o campo de digitação de nome de som resetava.
* 📋 **Cópia de Link Segura**: Correção na cópia de links de compartilhamento.`,

  "v0.5.24": `### 🌟 Versão 0.5.24
* 🎬 **Gravação de Clipes Retroativos (Clipping)**: Salve momentos engraçados depois que eles acontecem! Configure a duração e o atalho nas Configurações do app.
* 💾 **Medidor de Armazenamento**: Acompanhe o tamanho ocupado pela pasta de áudios e gravações diretamente na aba de Configurações.
* ✍️ **Liberdade de Nomenclatura**: Os nomes e categorias dos áudios agora preservam perfeitamente letras maiúsculas, espaços e pontuações de acordo com o que você digitar.`,

  "v0.5.23": `### 🌟 Versão 0.5.23
* 🎙️ **Síntese de Voz (TTS) via Edge TTS**: Crie vozes realistas por IA e salve-as no seu Soundboard!
* 📺 **Importação Assíncrona do YouTube**: Fechar a janela ou clicar fora não cancela mais o download. Ele continuará baixando em segundo plano e você verá o progresso em uma barra flutuante.
* ⚙️ **Detecção Eficiente do VB-CABLE**: O instalador agora usa o registro do Windows nativo para checar o Cabo Virtual, eliminando falsos alertas demorados.
* 🎹 **Registro de Atalhos Corrigido**: Atalhos de teclado da Soundboard migrados para o Python em segundo plano, evitando conflitos ou teclas travadas em jogos.`,

  "v0.5.22": `### 🌟 Versão 0.5.22
* 🐛 **Correção de Reprodução de Áudio**: Corrigido um bug interno (UnboundLocalError) no servidor que impedia a reprodução de efeitos locais e online (retornando status 500).`,

  "v0.5.21": `### 🌟 Versão 0.5.21
* ⛔ **Cancelamento de Downloads**: Adicionado um botão "X" na notificação flutuante para você conseguir cancelar qualquer download em andamento no fundo!
* ☁️ **Progresso de Importação na Nuvem**: Importar links mágicos agora roda em segundo plano e mostra o progresso no canto da tela, igual ao YouTube.`,

  "v0.5.20": `### 🌟 Versão 0.5.20`,

  "v0.5.19": `### 🌟 Versão 0.5.19`,

  "v0.5.18": `### 🌟 Versão 0.5.18
* 🎨 **Melhorias Visuais (UX)**: A cópia do Link Mágico agora abre uma janelinha para você visualizar o link antes de copiar.
* ⬇️ **Download do YouTube Invisível**: A barra de status de download do YouTube agora fica flutuando na tela principal caso você feche a janela enquanto ele baixa em segundo plano!`,

  "v0.5.17": `### 🌟 Versão 0.5.17
* 🩹 **Hotfix**: Correção no bloqueio de segurança do navegador que impedia a cópia do Link Mágico de Compartilhamento na Nuvem para a área de transferência.`,

  "v0.5.16": `### 🌟 Versão 0.5.16
* ☁️ **Compartilhamento em Nuvem**: Agora você pode gerar "Links Mágicos" dos seus áudios ou importar pacotes de amigos apenas colando a URL! Chega de mandar arquivos pesados pelo Discord.
* ✂️ **Cortador de Áudio Embutido Melhorado**: O editor visual de cortes agora carrega as ondas sonoras REAIS do seu arquivo de áudio para cortes precisos e milimétricos (antes era apenas uma onda visual decorativa).`,

  "v0.5.15": `### 🌟 Versão 0.5.15
* 📺 **Descongelamento do YouTube**: O download de áudios longos do YouTube agora é feito de forma 100% assíncrona, não travando mais o aplicativo enquanto você baixa.
* 🐛 **Bug do Status Consertado**: O nome da música sendo tocada no momento não vai mais sobrescrever o texto de progresso de download dentro da tela do YouTube.
* 🛠️ **Cabo Virtual sem Falhas**: Correção na comunicação entre o instalador e o PowerShell para garantir que falsos-positivos não exibam o pop-up de ausência do driver.`,

  "v0.5.14": `### 🌟 Versão 0.5.14
* 🚀 **Instalador Inteligente e Silencioso**: A instalação agora é automática (OneClick) e só exibe mensagens caso haja problemas com dependências (como o driver de áudio).
* 🎧 **Correção Crítica no VB-CABLE**: O instalador agora detecta o Cabo Virtual ativamente no Windows (via \`Get-PnpDevice\`), encerrando os alertas falsos onde o instalador achava que ele não estava instalado.
* 🧹 **Importação Simplificada**: Botões de Importar Áudio e Importar Pacotes na Soundboard foram fundidos em um só para deixar a interface mais enxuta e bonita.
* 🐛 **Bugfix de Tema Visual**: Corrigido um problema onde selecionar o tema "Synthwave" impedia a deseleção posterior.`,

  "v0.5.13": `### 🌟 Versão 0.5.13
* 🌆 **Novo Tema Synthwave Retrowave**: Adicionado um novo tema escuro inspirado nos anos 80, com neon rosa e ciano, selecionável nas Configurações.
* 🔔 **Notificações Flutuantes (HUD)**: Agora, sempre que você usar um atalho global (Mutar Mic, Bypass, Gravar, etc.), uma notificação visual bonita aparecerá na tela avisando o status, dando uma sensação muito mais interativa ao aplicativo.`,

  "v0.5.12": `### 🛠️ Versão 0.5.12
* 🔄 **Substituição de Atalhos Corrigida**: Resolvida falha silenciosa na API do Windows ao recriar o atalho de Área de Trabalho e do Menu Iniciar. Agora o atalho antigo é explicitamente removido antes de escrever o novo, forçando a atualização correta para a nova pasta de instalação.
* ⚙️ **Alinhamento de Diretório de Desenvolvimento**: Alinhamento do diretório de instalação do script PowerShell (\`install_studio_start_menu.ps1\`) com o diretório padrão de produção (\`AppData\\Local\\Programs\\MicFudiddo Studio\`), evitando duplicidade de instalações e conflitos de atalhos.
* 🗑️ **Limpeza Automática de Pastas Legadas**: Adicionada remoção automática da pasta legada \`Programs\\micfudiddo-studio\` (com hífen) durante o processo de atualização e inicialização do app.`,

  "v0.5.11": `### 🛠️ Versão 0.5.11
* 🛡️ **Correção Crítica de Remoção do Executável**: Removidas exclusões automáticas das pastas de instalação sob \`AppData\\Local\\Programs\\...\` que causavam a remoção acidental de \`MicFudiddo Studio.exe\` e quebravam o atalho.
* ☁️ **Suporte ao OneDrive**: Correção na resolução da pasta da Área de Trabalho para usuários com redirecionamento ativo do OneDrive (como \`OneDrive\\Área de Trabalho\`), garantindo que o atalho seja atualizado corretamente.`,

  "v0.5.10": `### 🛠️ Versão 0.5.10
* ☁️ **Suporte ao OneDrive**: Correção na resolução da pasta da Área de Trabalho para usuários com redirecionamento ativo do OneDrive (como \`OneDrive\\Área de Trabalho\`), garantindo que o atalho seja atualizado corretamente.
* 🗑️ **Limpeza de Pastas Duplicadas**: Exclusão definitiva de resquícios da instalação antiga na pasta \`AppData\\Local\\Programs\\MicFudiddo Studio\` (com espaço), garantindo que cliques no atalho não executem versões antigas.`,

  "v0.5.9": `### 🛠️ Versão 0.5.9
* ⚡ **Sincronização de Atalhos Aprimorada**: Correção definitiva na criação de atalhos apontando o ícone diretamente para o executável principal, evitando falhas silenciosas na API do Windows.
* 🌐 **Changelogs Online Dinâmicos**: A interface agora prioriza e exibe as notas de atualização diretamente do corpo da release no GitHub em tempo real, permitindo ver as novidades online sem necessidade de atualização imediata.
* 🗑️ **Limpeza Avançada de Resquícios**: Adicionada detecção e remoção automática de diretórios obsoletos deixados por antigas instalações do Squirrel.Windows.`,

  "v0.5.8": `### 🛠️ Versão 0.5.8
* 🔄 **Reconstrução e Correção de Atalhos**: Adicionada rotina robusta para garantir a presença e a integridade do atalho "MicFudiddo Studio.lnk" na Área de Trabalho e no Menu Iniciar sempre que o aplicativo for aberto.
* 🗑️ **Limpeza Completa de Legados**: Remoção completa do diretório antigo do Python (\`AppData\\Local\\MicFudiddo\`), da antiga pasta no Menu Iniciar (\`MicFudiddo\`) e dos atalhos obsoletos (\`MicFudiddo.lnk\`, \`Mic Fudido.lnk\`), evitando qualquer inicialização acidental de versões antigas.`,

  "v0.5.7": `### 🛠️ Versão 0.5.7
* 🗑️ **Limpeza Dupla de Versões Antigas**: Adicionada rotina de exclusão completa do diretório antigo de instalação (\`AppData\\Local\\MicFudiddoStudio\`) e dos atalhos obsoletos no Menu Iniciar e Desktop, tanto na inicialização do instalador quanto na abertura do aplicativo. Isso evita conflitos e impede que atalhos antigos continuem executando a versão anterior.`,

  "v0.5.6": `### 🛠️ Versão 0.5.6
* 🔄 **Unificação de Diretórios de Instalação**: Alinhamento do diretório de instalação dos scripts automatizados (\`instalar.ps1\` e \`install_studio_start_menu.ps1\`) com o diretório padrão do instalador oficial do Electron Builder (\`AppData\\Local\\Programs\\micfudiddo-studio\`). Isso impede que o aplicativo retorne a versões antigas após a atualização ao ser executado por atalhos existentes.
* 🗑️ **Remoção do Indicador de Voz**: Removido o widget visualizador de status de processamento da voz ("VOZ STATUS: PROCESSANDO") do painel lateral (Sidebar) conforme solicitado.`,

  "v0.5.5": `### 🛠️ Versão 0.5.5
* 🐛 **Correção de Crash no Canvas**: Correção de um erro na barra lateral (Sidebar) causado por falha no Canvas ao renderizar variáveis CSS de cores no gradiente do visualizador de voz.
* 🛡️ **Tratamento de Erros de Interface**: Adicionada proteção de tela ('ErrorBoundary') ao redor do menu lateral e do painel de atalhos inferior (Floating Dock) para impedir que problemas isolados travem todo o aplicativo.`,

  "v0.5.4": `### 🛠️ Versão 0.5.4
* 🐛 **Correção na Atualização**: Resolução do bug de conexão e da tela travada em cor de fundo padrão ao atualizar o aplicativo.
* 🛡️ **Fechamento Automático do Instalador**: Encerramento forçado de processos ativos do app (\`MicFudiddo Studio.exe\` e \`MicFudiddoBackend.exe\`) ao iniciar a instalação para evitar arquivos travados (locks) e impedir o retorno indesejado à versão anterior.
* ⏱️ **Timeout no Desligamento**: Implementação de tempo limite (timeout) na chamada de desligamento do backend para evitar travamentos da janela ao fechar ou atualizar.`,

  "v0.5.3": `### 🚀 Versão 0.5.3
* ✨ **Compartilhamento de Vozes**: Nova opção no menu de contexto das vozes para copiar código de compartilhamento (Base64 compacto com prefixo \`MFVOICE-\`) e botão "Importar por Código" na barra de ferramentas.
* 📦 **Compartilhamento de Sons (.mfsound)**: Nova funcionalidade para exportar/importar sons contendo o áudio original e todas as configurações da soundboard (volume, tom, loop, atalho, cor, fade, etc.) em pacotes zip \`.mfsound\`. Suporte completo a arrastar e soltar (Drag & Drop) pacotes na soundboard.
* 🎨 **Temas Visuais & Cor Customizada**: Criação dos novos temas estéticos \`Cyberpunk\`, \`Dracula\`, \`Vampire\` e \`Neon\` selecionáveis nas Configurações, além de um Color Picker para escolher cores de destaque personalizadas com botão **Salvar** definitivo.
* 📊 **Visualizador de Frequências (Sidebar)**: Adicionado visualizador Canvas espectral animado a 60fps na barra lateral que reage em tempo real ao volume e atividade da voz.
* 🎚️ **Controles de Fade In & Fade Out**: Adicionados controles deslizantes (0 a 5000ms) no editor avançado de som para transições de volume graduais ao iniciar e terminar a reprodução dos sons.`,

  "v0.5.2": `### 🛠️ Versão 0.5.2
* 🐛 **Correção na Soundboard**: Resolução do erro crítico "X is not defined" e otimização da indexação de categorias de som.
* ⚡ **Melhorias de Estabilidade**: Ajustes no loop de inicialização e tratamento de exceções no servidor de processamento de áudio.`,

  "v0.5.1": `### 🚀 Versão 0.5.1
* ✨ **Verificação de Updates Automática**: O app verifica se há novas atualizações no GitHub toda vez que é aberto e notifica o usuário se houver uma nova versão.
* 🔄 **Histórico de Versões Detalhado**: Nova tela ao clicar na versão no painel lateral mostrando o histórico completo de atualizações e mudanças.
* 🗂️ **Seletor de Categorias Avançado**: Substituição do campo de digitação manual de categorias na Soundboard por um dropdown seletor, permitindo escolher pastas existentes ou criar novas.
* 🛠️ **Área de Voz Personalizada**: Módulo separado para o perfil personalizado, permitindo salvar configurações persistentemente e redefinir valores padrões.
* 🖱️ **Menu de Contexto nas Vozes**: Clique direito nas predefinições de voz com opções avançadas: Renomear (apenas vozes customizadas), Duplicar, Editar parâmetros, Importar/Exportar e Restaurar.
* 🎛️ **Ajustes na Barra Rápida**: Reorganização dos sliders de áudio (Ganho de Microfone, Volume da Voz, Pitch, Retorno de Voz, Retorno de Sons) e expansão do limite de Ganho de Microfone e Volume da Voz para 100x.
* 🔗 **Sanitizador do YouTube**: Links de playlist/rádio agora são convertidos automaticamente para links de vídeos individuais no modal de importação.
* 📄 **Margens de Listas Markdown**: Correção de recuo e alinhamento de marcadores (bullets) em janelas de visualização Markdown.`,
  
  "v0.5.0": `### 🎙️ Versão 0.5.0 (Lançamento do Voice Lab)
* 🎨 **Modularização Completa e Refatoração**: Código do frontend dividido em componentes React limpos e organizados (\`Sidebar\`, \`Modals\`, \`SoundboardPage\`, etc.).
* 🎛️ **Laboratório de Voz (Voice Lab)**: Adicionados efeitos de Pitch avançados, filtros Equalizer, Noise Gate, Reverberação e Compressor em tempo real.
* 💾 **Perfis de Som Reestruturados**: Sincronização e controle aprimorado dos perfis de som de entrada/saída.`,
  
  "v0.4.6": `### 🐛 Versão 0.4.6
* 🛠️ **Correções do Sistema**: Correção do ícone de fechar (\`X\`) ausente no painel de Soundboard.
* ⚙️ **Estabilidade do Mixer**: Ajustes internos de concorrência e buffer do servidor de áudio Python.`,
  
  "v0.4.5": `### 🍪 Versão 0.4.5
* 🍪 **Autenticação YouTube**: Suporte a envio de cookies do navegador para contornar a detecção de bot do YouTube ao baixar sons online.
* 🔉 **Persistência de Monitoramento**: Mantém o volume de retorno/monitoramento intacto ao alternar entre diferentes efeitos de voz.`,
  
  "v0.4.4": `### 📦 Versão 0.4.4
* 📦 **Instalador NSIS**: Geração automática de instalador profissional (.exe) com termos de aceitação de dependências.
* 🚲 **Modo Portátil**: Distribuição opcional portátil (zip/exe auto-extraível).`,
  
  "v0.4.2": `### 🎥 Versão 0.4.2
* 🎥 **Importador YouTube Modal**: Substituição do painel lateral antigo de importação do YouTube por um modal limpo, focado e amigável.`,
  
  "v0.4.1": `### 🔇 Versão 0.4.1
* 🔇 **Correções Rápidas**: Ajuste no controle de Mute de áudio e no ganho padrão do microfone.
* ⚠️ **Alerta de VB-Cable**: Aviso aprimorado sobre a ausência do driver de áudio virtual obrigatório VB-CABLE.`,
  
  "v0.4.0": `### 🚀 Versão 0.4.0
* 🚀 **Primeiro Lançamento com Instalador**: Script completo de automação (\`instalar.ps1\` e \`instalar.bat\`) para configurar o ambiente Python de processamento e o frontend Electron.`
};

const FALLBACK_RELEASES = [
  {
    id: "v1.3.2",
    tag_name: "v1.3.2",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.3.2"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.3.2.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.3.2/MicFudiddo-Studio-Setup-1.3.2.exe"
    }]
  },
  {
    id: "v1.3.1",
    tag_name: "v1.3.1",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.3.1"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.3.1.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.3.1/MicFudiddo-Studio-Setup-1.3.1.exe"
    }]
  },
  {
    id: "v1.3.0",
    tag_name: "v1.3.0",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.3.0"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.3.0.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.3.0/MicFudiddo-Studio-Setup-1.3.0.exe"
    }]
  },
  {
    id: "v1.2.1",
    tag_name: "v1.2.1",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.2.1"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.2.1.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.2.1/MicFudiddo-Studio-Setup-1.2.1.exe"
    }]
  },
  {
    id: "v1.2.0",
    tag_name: "v1.2.0",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.2.0"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.2.0.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.2.0/MicFudiddo-Studio-Setup-1.2.0.exe"
    }]
  },
  {
    id: "v1.1.1",
    tag_name: "v1.1.1",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.1.1"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.1.1.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.1.1/MicFudiddo-Studio-Setup-1.1.1.exe"
    }]
  },
  {
    id: "v1.1.0",
    tag_name: "v1.1.0",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.1.0"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.1.0.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.1.0/MicFudiddo-Studio-Setup-1.1.0.exe"
    }]
  },
  {
    id: "v1.0.4",
    tag_name: "v1.0.4",
    published_at: new Date().toISOString(),
    body: LOCAL_CHANGELOGS["v1.0.4"],
    assets: [{
      name: "MicFudiddo-Studio-Setup-1.0.4.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.0.4/MicFudiddo-Studio-Setup-1.0.4.exe"
    }]
  },
  {
    id: "v1.0.3",
    tag_name: "v1.0.3",
    published_at: "2026-07-16T15:48:48Z",
    body: LOCAL_CHANGELOGS["v1.0.3"],
    assets: [{
      name: "MicFudiddo.Studio.Setup.1.0.3.exe",
      browser_download_url: "https://github.com/OtavioBiazzi/MicStudio/releases/download/v1.0.3/MicFudiddo.Studio.Setup.1.0.3.exe"
    }]
  },
  { id: "v1.0.2", tag_name: "v1.0.2", published_at: "2026-07-06T18:42:11Z", body: LOCAL_CHANGELOGS["v1.0.2"] },
  { id: "v1.0.1", tag_name: "v1.0.1", published_at: "2026-07-06T18:28:05Z", body: LOCAL_CHANGELOGS["v1.0.1"] },
  { id: "v1.0", tag_name: "v1.0", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.47", tag_name: "v0.5.47", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.46", tag_name: "v0.5.46", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.45", tag_name: "v0.5.45", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.44", tag_name: "v0.5.44", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.43", tag_name: "v0.5.43", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.42", tag_name: "v0.5.42", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.41", tag_name: "v0.5.41", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.40", tag_name: "v0.5.40", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.39", tag_name: "v0.5.39", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.38", tag_name: "v0.5.38", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.37", tag_name: "v0.5.37", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.36", tag_name: "v0.5.36", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.35", tag_name: "v0.5.35", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.34", tag_name: "v0.5.34", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.33", tag_name: "v0.5.33", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.32", tag_name: "v0.5.32", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.31", tag_name: "v0.5.31", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.30", tag_name: "v0.5.30", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.29", tag_name: "v0.5.29", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.28", tag_name: "v0.5.28", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.27", tag_name: "v0.5.27", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.26", tag_name: "v0.5.26", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.25", tag_name: "v0.5.25", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.24", tag_name: "v0.5.24", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.23", tag_name: "v0.5.23", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.22", tag_name: "v0.5.22", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.21", tag_name: "v0.5.21", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.18", tag_name: "v0.5.18", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.17", tag_name: "v0.5.17", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.16", tag_name: "v0.5.16", published_at: "2026-06-06T19:45:00Z", body: "" },
  { id: "v0.5.15", tag_name: "v0.5.15", published_at: "2026-06-06T19:20:00Z", body: "" },
  { id: "v0.5.14", tag_name: "v0.5.14", published_at: "2026-06-06T18:45:00Z", body: "" },
  { id: "v0.5.13", tag_name: "v0.5.13", published_at: "2026-06-06T18:30:00Z", body: "" },
  { id: "v0.5.12", tag_name: "v0.5.12", published_at: "2026-06-06T18:05:00Z", body: "" },
  { id: "v0.5.11", tag_name: "v0.5.11", published_at: "2026-06-06T17:42:00Z", body: "" },
  { id: "v0.5.10", tag_name: "v0.5.10", published_at: "2026-06-06T17:30:00Z", body: "" },
  { id: "v0.5.9", tag_name: "v0.5.9", published_at: "2026-06-06T14:20:00Z", body: "" },
  { id: "v0.5.8", tag_name: "v0.5.8", published_at: "2026-06-06T02:05:00Z", body: "" },
  { id: "v0.5.7", tag_name: "v0.5.7", published_at: "2026-06-06T02:00:00Z", body: "" },
  { id: "v0.5.6", tag_name: "v0.5.6", published_at: "2026-06-06T01:35:00Z", body: "" },
  { id: "v0.5.5", tag_name: "v0.5.5", published_at: "2026-06-06T01:30:00Z", body: "" },
  { id: "v0.5.4", tag_name: "v0.5.4", published_at: "2026-06-06T00:30:00Z", body: "" },
  { id: "v0.5.3", tag_name: "v0.5.3", published_at: "2026-06-06T00:00:00Z", body: "" },
  { id: "v0.5.2", tag_name: "v0.5.2", published_at: "2026-06-06T00:00:00Z", body: "" },
  { id: "v0.5.1", tag_name: "v0.5.1", published_at: "2026-06-06T00:00:00Z", body: "" },
  { id: "v0.5.0", tag_name: "v0.5.0", published_at: "2026-06-05T00:00:00Z", body: "" },
  { id: "v0.4.6", tag_name: "v0.4.6", published_at: "2026-06-04T00:00:00Z", body: "" },
  { id: "v0.4.5", tag_name: "v0.4.5", published_at: "2026-06-03T23:58:00Z", body: "" },
  { id: "v0.4.4", tag_name: "v0.4.4", published_at: "2026-06-03T19:50:00Z", body: "" },
  { id: "v0.4.2", tag_name: "v0.4.2", published_at: "2026-06-03T19:27:00Z", body: "" },
  { id: "v0.4.1", tag_name: "v0.4.1", published_at: "2026-06-03T19:18:00Z", body: "" },
  { id: "v0.4.0", tag_name: "v0.4.0", published_at: "2026-06-03T18:09:00Z", body: "" }
];

// --- ReleasesModal ---
const OFFLINE_RELEASES = [
  ...Object.entries(LOCAL_CHANGELOGS).filter(([tag]) => !FALLBACK_RELEASES.some((release) => release.tag_name === tag))
    .map(([tag, body]) => ({ id: tag, tag_name: tag, body })),
  ...FALLBACK_RELEASES
].sort((a, b) => b.tag_name.localeCompare(a.tag_name, undefined, { numeric: true }));

export function ReleasesModal({ onClose, currentVersion, onUpdateApp }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUrl, setUpdatingUrl] = useState(null);
  const requestRef = useRef(null);

  const loadReleases = () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort("timeout"), 8000);
    setLoading(true);
    setError(null);
    fetch(`https://api.github.com/repos/OtavioBiazzi/MicStudio/releases?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal
    })
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao carregar do GitHub");
        return res.json();
      })
      .then((data) => {
        if (requestRef.current !== controller) return;
        setReleases(data && data.length ? data : OFFLINE_RELEASES);
        setLoading(false);
      })
      .catch((err) => {
        if (requestRef.current !== controller) return;
        console.warn("Falha ao buscar releases do GitHub, usando dados estáticos:", err);
        setReleases(OFFLINE_RELEASES);
        setLoading(false);
      }).finally(() => clearTimeout(timeout));
  };

  useEffect(() => {
    loadReleases();
    return () => {
      const controller = requestRef.current;
      requestRef.current = null;
      controller?.abort();
    };
  }, []);

  const handleUpdate = async (release) => {
    const asset = release.assets?.find(a => a.name.includes("Setup") && a.name.endsWith(".exe")) || 
                  release.assets?.find(a => a.name.includes("Studio") && a.name.endsWith(".exe")) || 
                  release.assets?.find(a => a.name.endsWith(".exe"));
    if (!asset) {
      alert("Nenhum executável de instalação encontrado para esta release.");
      return;
    }
    setUpdatingUrl(asset.browser_download_url);
    try {
      await onUpdateApp(asset.browser_download_url);
    } catch (err) {
      alert("Erro ao atualizar: " + err.message);
      setUpdatingUrl(null);
    }
  };

  const isNewer = (latestTag) => {
    const clean = (v) => v.replace(/^v/, "").split(".").map(Number);
    const cParts = clean(currentVersion);
    const lParts = clean(latestTag);
    for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
      const cVal = cParts[i] || 0;
      const lVal = lParts[i] || 0;
      if (lVal > cVal) return true;
      if (cVal > lVal) return false;
    }
    return false;
  };

  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: "90%", maxHeight: "80vh", display: "flex", flexDirection: "column", padding: 24 }}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="modalHeader" style={{ paddingBottom: 12, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
            🚀 Histórico de Versões & Updates
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="closeBtn" onClick={loadReleases} disabled={loading} title="Atualizar releases" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
              <ArrowClockwise size={18} className={loading ? "spin" : ""} />
            </button>
            <button className="closeBtn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
          </div>
        </div>

        <div className="modalBody" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingRight: 4 }}>
          {updatingUrl ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 0", gap: 12 }}>
              <div className="spinner" style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.08)", borderTopColor: "var(--purple)", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Baixando atualização...</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>O aplicativo será fechado automaticamente para iniciar o instalador assim que o download terminar.</span>
            </div>
          ) : loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
              <div className="spinner" style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.08)", borderTopColor: "var(--purple)", animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : error ? (
            <div style={{ color: "var(--danger)", fontSize: 12, textAlign: "center", padding: "20px 0" }}>
              {error}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ fontSize: 11.5, background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", padding: "10px 12px", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Versão Atual Instalada:</span>
                <strong style={{ color: "var(--cyan)", fontSize: 13 }}>{currentVersion}</strong>
              </div>

              {releases.map((release) => {
                const isNew = isNewer(release.tag_name);
                const isCurrent = release.tag_name.replace(/^v/, "") === currentVersion.replace(/^v/, "");
                return (
                  <div key={release.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: isCurrent ? "rgba(var(--accent-rgb),  0.04)" : "rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: isCurrent ? "var(--purple)" : "var(--text)" }}>{release.tag_name}</span>
                        {isCurrent && <span style={{ fontSize: 9, background: "var(--purple-soft)", color: "var(--purple)", padding: "2px 6px", borderRadius: 10, fontWeight: 800 }}>ATUAL</span>}
                        {isNew && <span style={{ fontSize: 9, background: "rgba(16,185,129,0.1)", color: "#10b981", padding: "2px 6px", borderRadius: 10, fontWeight: 800 }}>NOVO</span>}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{release.published_at ? new Date(release.published_at).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : ""}</span>
                    </div>

                    <div className="readme-container changelog-markdown" style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--text-secondary)", maxHeight: 150, overflowY: "auto", padding: "8px 10px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(255,255,255,0.02)" }}>
                      {renderMarkdown((release.body && release.body.trim()) || LOCAL_CHANGELOGS[release.tag_name] || "*Nenhuma nota de versão fornecida.*")}
                    </div>

                    {isNew && release.assets && release.assets.length > 0 && (
                      <button 
                        className="btn btn-primary" 
                        onClick={() => handleUpdate(release)} 
                        style={{ padding: "6px 12px", fontSize: 11, background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", alignSelf: "flex-end", border: "none" }}
                      >
                        ⚡ Atualizar para {release.tag_name}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// --- UpdateAlertModal ---
export function UpdateAlertModal({ onClose, latestVersion, changelog, onConfirm }) {
  const displayChangelog = changelog || LOCAL_CHANGELOGS[latestVersion];
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--purple)", display: "flex", alignItems: "center", gap: 8 }}>
            🚀 Nova Atualização Disponível!
          </h3>
          <button className="closeBtn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Uma nova versão <strong>{latestVersion}</strong> do MicFudiddo Studio está disponível para download.
          </p>
          
          <div style={{ fontSize: 11.5, maxHeight: 150, overflowY: "auto", padding: "10px 12px", background: "rgba(0,0,0,0.15)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>Novidades desta versão:</div>
            <div className="changelog-markdown" style={{ color: "var(--text-secondary)" }}>
              {renderMarkdown(displayChangelog || "*Nenhuma nota de versão fornecida.*")}
            </div>
          </div>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={onClose}>
            Depois
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 16px", fontSize: 12, background: "linear-gradient(135deg, var(--purple), var(--purple-dim))" }}
            onClick={onConfirm}
          >
            ⚡ Atualizar Agora
          </button>
        </div>
      </div>
    </div>
  );
}

// --- TTSModal ---
export function TTSModal({ onClose, call, setToast, settings }) {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(() => {
    return localStorage.getItem("tts_default_voice") || "pt-BR-AntonioNeural";
  });
  const [rate, setRate] = useState(() => {
    return Number(localStorage.getItem("tts_default_rate") || 0);
  }); // Slider: -50 to +50
  const [pitch, setPitch] = useState(() => {
    return Number(localStorage.getItem("tts_default_pitch") || 0);
  }); // Slider: -50 to +50 Hz
  const [soundName, setSoundName] = useState("");
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [pinHover, setPinHover] = useState(false);
  const unlimited = settings?.unlimitedTts === true;

  // Auto-fill soundName when text changes
  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    
    // Auto-generate name from first few words
    const words = val.trim();
    if (words) {
      const truncated = words.length > 22 ? words.substring(0, 20) + "..." : words;
      setSoundName(truncated);
    } else {
      setSoundName("");
    }
  };

  const handleVoiceChange = (e) => {
    const val = e.target.value;
    setSelectedVoice(val);
    localStorage.setItem("tts_default_voice", val);
  };

  const handleRateChange = (val) => {
    setRate(val);
    localStorage.setItem("tts_default_rate", val);
  };

  const handleSpeak = async () => {
    if (!text.trim()) {
      setToast("Digite algum texto para falar.");
      return;
    }
    const lineCount = text.split('\n').length;
    if (lineCount >= 5000) {
      const confirm = window.confirm(`Aviso: O texto contém ${lineCount.toLocaleString()} linhas. A geração do áudio pode demorar bastante. Deseja continuar mesmo assim?`);
      if (!confirm) return;
    }
    setSpeaking(true);
    const formattedRate = rate >= 0 ? `+${rate}%` : `${rate}%`;
    try {
      await call("/api/tts/speak", {
        text: text.trim(),
        voice: selectedVoice,
        rate: formattedRate,
        pitch
      });
      setToast("📢 Falando...");
    } catch (err) {
      setToast("Erro ao falar: " + err.message);
    } finally {
      setSpeaking(false);
    }
  };

  const handleSave = async () => {
    if (!text.trim()) {
      setToast("Digite algum texto antes de salvar.");
      return;
    }
    const lineCount = text.split('\n').length;
    if (lineCount >= 5000) {
      const confirm = window.confirm(`Aviso: O texto contém ${lineCount.toLocaleString()} linhas. A geração do áudio pode demorar bastante. Deseja continuar mesmo assim?`);
      if (!confirm) return;
    }
    setLoading(true);
    const formattedRate = rate >= 0 ? `+${rate}%` : `${rate}%`;
    try {
      const res = await call("/api/tts/save", {
        text: text.trim(),
        voice: selectedVoice,
        rate: formattedRate,
        pitch,
        name: soundName.trim()
      });
      setToast(`💾 Som "${res.sound?.name || "TTS"}" adicionado ao Soundboard!`);
      onClose();
    } catch (err) {
      setToast("Erro ao salvar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading && !speaking) {
      onClose();
    }
  };

  const voicesList = useTtsVoices();

  const isWorking = loading || speaking;

  return (
    <div className="modalOverlay" onClick={handleClose}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--purple)", display: "flex", alignItems: "center", gap: 8 }}>
            🎙️ Gerar Voz por Texto (TTS)
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => {
                window.micfudiddo?.openTtsWidget();
                onClose();
              }}
              onMouseEnter={() => setPinHover(true)}
              onMouseLeave={() => setPinHover(false)}
              disabled={isWorking}
              style={{
                background: "none",
                border: "none",
                color: pinHover ? "var(--purple)" : "var(--text-muted)",
                cursor: isWorking ? "not-allowed" : "pointer",
                transition: "color 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4
              }}
              title="Fixar Widget Flutuante"
            >
              <PushPin size={18} weight={pinHover ? "fill" : "bold"} />
            </button>
            <button className="closeBtn" onClick={handleClose} disabled={isWorking} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: isWorking ? "not-allowed" : "pointer" }}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Texto para Falar</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{text.length}{unlimited ? "" : `/${TTS_CHARACTER_LIMIT}`}</span>
            </div>
            <textarea
              placeholder="Digite aqui o que você quer que o robô fale..."
              value={text}
              onChange={handleTextChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSpeak();
                }
              }}
              disabled={isWorking}
              {...(!unlimited ? { maxLength: TTS_CHARACTER_LIMIT } : {})}
              autoFocus
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                fontFamily: "var(--font)",
                boxSizing: "border-box",
                resize: "none"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Selecionar Voz</span>
              <select
                value={selectedVoice}
                onChange={handleVoiceChange}
                disabled={isWorking}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                  fontSize: 13,
                  outline: "none",
                  fontFamily: "var(--font)",
                  cursor: "pointer"
                }}
              >
                {voicesList.map((v) => (
                  <option key={v.id} value={v.id} style={{ background: "var(--bg-card)", color: "var(--text)" }}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
                <span>Velocidade</span>
                <span style={{ color: "var(--purple)", fontWeight: 800 }}>{rate >= 0 ? `+${rate}%` : `${rate}%`}</span>
              </span>
              <input
                type="range"
                min={-95}
                max={200}
                step={5}
                value={rate}
                onChange={(e) => handleRateChange(Number(e.target.value))}
                disabled={isWorking}
                style={{
                  width: "100%",
                  height: 36,
                  accentColor: "var(--purple)",
                  cursor: "pointer"
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              <span>Tom da voz</span>
              <span style={{ color: "var(--purple)", fontWeight: 800 }}>{pitch >= 0 ? `+${pitch}Hz` : `${pitch}Hz`}</span>
            </span>
            <input
              type="range"
              min={-50}
              max={50}
              step={5}
              value={pitch}
              onChange={(e) => {
                const val = Number(e.target.value);
                setPitch(val);
                localStorage.setItem("tts_default_pitch", val);
              }}
              disabled={isWorking}
              style={{ width: "100%", height: 36, accentColor: "var(--purple)", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Nome do Som (Para salvar)</span>
            <input
              type="text"
              placeholder="Ex: Minha frase engraçada"
              value={soundName}
              onChange={(e) => setSoundName(e.target.value)}
              disabled={isWorking}
              style={{
                width: "100%",
                padding: "10px 14px",
                background: "var(--bg-input)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                color: "var(--text)",
                fontSize: 13,
                outline: "none",
                fontFamily: "var(--font)",
                boxSizing: "border-box"
              }}
            />
          </div>
        </div>

        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} disabled={isWorking} onClick={handleClose}>
            Fechar
          </button>
          
          <button
            className="btn"
            style={{
              padding: "8px 16px",
              fontSize: 12,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: isWorking ? "not-allowed" : "pointer"
            }}
            onClick={handleSpeak}
            disabled={isWorking || !text.trim()}
          >
            {speaking ? (
              <div className="spinner" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--text)", animation: "spin 0.6s linear infinite" }} />
            ) : (
              <Play size={14} weight="fill" />
            )}
            <span>Falar</span>
          </button>

          <button
            className="btn btn-primary"
            style={{
              padding: "8px 16px",
              fontSize: 12,
              background: "linear-gradient(135deg, var(--purple), var(--purple-dim))",
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: isWorking ? "not-allowed" : "pointer"
            }}
            onClick={handleSave}
            disabled={isWorking || !text.trim()}
          >
            {loading ? (
              <div className="spinner" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite" }} />
            ) : (
              <UploadSimple size={14} weight="bold" />
            )}
            <span>Salvar no Soundboard</span>
          </button>
        </div>
      </div>
    </div>
  );
}
