import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import {
  X, Play, Minus, Trash, Star, UploadSimple, FolderOpen, MagnifyingGlass,
  Pencil, Waveform, MusicNotes, ArrowClockwise, ArrowCounterClockwise,
  StopCircle, Sparkle, YoutubeLogo
} from "@phosphor-icons/react";
import {
  filePathToUrl,
  renderMarkdown,
  formatTime,
  formatValue,
  Slider,
  EffectSliderRow
} from "../utils";

const playbackModes = [
  { value: "restart", label: "Reiniciar ao clicar" },
  { value: "stop", label: "Parar ao clicar" },
  { value: "overlap", label: "Sobrepor áudio" }
];

const soundOutputRoutes = [
  { value: "both", label: "Microfone + Monitoramento" },
  { value: "cable", label: "Apenas Microfone" },
  { value: "monitor", label: "Apenas Monitoramento" }
];

// --- WaveformVisualizer ---
export function WaveformVisualizer({ soundId, path, start, end, duration, onUpdateTrim, playingPosition }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(null);

  const [peaks, setPeaks] = useState([]);
  
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
        grad.addColorStop(0, "#00E5FF");
        grad.addColorStop(1, "#8B5CF6");
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
        <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>✂️ EDITOR DE CORTE WAVEFORM</span>
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
                  background: sound.category === c.name ? "rgba(139, 92, 246, 0.1)" : "transparent",
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

// --- UserProfileModal ---
export function UserProfileModal({ onClose, onEdit, profileName, profileSub, profilePlan, profileImage, profileImagePosition, profileBio, profileReadme }) {
  return (
    <div className="modalOverlay" onClick={onClose}>
      <motion.div
        className="modalContent profileViewModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540, width: "90%", padding: 24 }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>👤 Perfil do Usuário</h3>
          <button className="closeBtn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>
          <div className="profile-avatar" style={{ width: 72, height: 72, fontSize: 32, borderRadius: "50%", background: "linear-gradient(135deg, var(--purple-dim), var(--purple))", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", flexShrink: 0 }}>
            {profileImage ? (
              <img src={profileImage} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", objectPosition: `center ${profileImagePosition}%` }} />
            ) : (
              <Waveform size={32} weight="fill" color="#fff" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 18, margin: 0, fontWeight: 800, color: "var(--text)" }}>{profileName}</h2>
              {profilePlan && <span className="pro-badge" style={{ display: "inline-block", padding: "1px 6px", fontSize: 9, fontWeight: 800, color: "var(--purple)", background: "var(--purple-soft)", borderRadius: "var(--radius-full)" }}>{profilePlan}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginTop: 2 }}>{profileSub}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>{profileBio}</div>
          </div>
          <button className="btn btn-ghost" onClick={onEdit} style={{ padding: "6px 12px", fontSize: 11, alignSelf: "flex-start", gap: 4 }}>
            <Pencil size={12} /> Editar
          </button>
        </div>
        <div className="readme-container" style={{ background: "rgba(0,0,0,0.2)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", maxHeight: 300, overflowY: "auto", fontSize: 12, lineHeight: 1.6 }}>
          {renderMarkdown(profileReadme)}
        </div>
      </motion.div>
    </div>
  );
}

// --- EditProfileModal ---
export function EditProfileModal({ onClose, profileName, setProfileName, profileSub, setProfileSub, profilePlan, setProfilePlan, profileImage, setProfileImage, profileImagePosition, setProfileImagePosition, profileBio, setProfileBio, profileReadme, setProfileReadme }) {
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
        className="modalContent accountModal editProfileModal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: "90%" }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
        <div className="modalHeader">
          <h3>👤 Editar Perfil</h3>
          <button className="closeBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modalBody" style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "center", flexDirection: "column", marginBottom: 4 }}>
            <div className="profile-avatar" style={{ width: 72, height: 72, fontSize: 28, borderRadius: "50%", background: "linear-gradient(135deg, var(--purple-dim), var(--purple))", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
              {profileImage ? (
                <img src={profileImage} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", objectPosition: `center ${profileImagePosition}%` }} />
              ) : (
                <Waveform size={32} weight="fill" color="#fff" />
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="manage-btn" onClick={() => fileInputRef.current?.click()} style={{ width: "auto", padding: "4px 10px" }}>
                Carregar Foto
              </button>
              {profileImage && (
                <button className="manage-btn" onClick={() => setProfileImage("")} style={{ width: "auto", padding: "4px 10px", background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                  Remover
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
            {profileImage && (
              <div style={{ width: "100%", minWidth: 160, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)" }}>
                  <span>Ajuste Vertical</span>
                  <span>{profileImagePosition}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={profileImagePosition}
                  onChange={(e) => setProfileImagePosition(e.target.value)}
                  style={{ width: "100%", height: 3, cursor: "pointer" }}
                />
              </div>
            )}
          </div>

          <div className="labField">
            <label>Nome do Perfil</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Subtítulo / Descrição</label>
            <input
              type="text"
              value={profileSub}
              onChange={(e) => setProfileSub(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Nome do Plano (Deixe vazio para ocultar)</label>
            <input
              type="text"
              placeholder="Ex: PRO, VIP, VIP PRO"
              value={profilePlan}
              onChange={(e) => setProfilePlan(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Biografia / Descrição Curta</label>
            <input
              type="text"
              value={profileBio}
              onChange={(e) => setProfileBio(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
          </div>

          <div className="labField">
            <label>Página Pessoal README (Suporta Markdown)</label>
            <textarea
              rows={4}
              value={profileReadme}
              onChange={(e) => setProfileReadme(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontFamily: "monospace", fontSize: 11, resize: "vertical" }}
            />
          </div>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose} style={{ padding: "6px 16px", fontSize: 12 }}>Salvar Alterações</button>
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

function cleanYoutubeUrl(url) {
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
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  useEffect(() => {
    if (youtubeLoading && state?.youtubeStatus) {
      const statusLower = state.youtubeStatus.toLowerCase();
      if (statusLower.includes("importado!")) {
        setYoutubeLoading(false);
        setToast(state.youtubeStatus);
        onClose();
      } else if (statusLower.includes("erro:")) {
        setYoutubeLoading(false);
        setToast(state.youtubeStatus);
      } else if (statusLower.includes("cancelada")) {
        setYoutubeLoading(false);
        setToast("Importação cancelada!");
        onClose();
      }
    }
  }, [state?.youtubeStatus, youtubeLoading, setToast, onClose]);

  const handleImport = async () => {
    if (!youtubeUrl || !youtubeUrl.trim()) {
      setToast("Cole uma URL válida do YouTube.");
      return;
    }
    const sanitizedUrl = cleanYoutubeUrl(youtubeUrl);
    setYoutubeLoading(true);
    setToast("Verificando vídeo do YouTube...");
    try {
      await call("/api/sounds/import-youtube", { url: sanitizedUrl });
    } catch (err) {
      setToast("Erro: " + err.message);
      setYoutubeLoading(false);
    }
  };

  const handleCancel = async () => {
    if (youtubeLoading) {
      try {
        await call("/api/sounds/import-youtube/cancel");
      } catch (err) {
        setToast("Erro ao cancelar: " + err.message);
      } finally {
        setYoutubeLoading(false);
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="modalOverlay" onClick={handleCancel}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0 }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <YoutubeLogo size={20} color="#FF0000" weight="fill" />
            <span>Adicionar Som do YouTube</span>
          </h3>
          <button className="closeBtn" onClick={handleCancel} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Cole o link de um vídeo do YouTube abaixo para converter e importar o áudio diretamente para o seu Soundboard.
          </p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>Link do Vídeo</span>
            <input
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
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
          </div>
          
          {youtubeLoading && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
              <div className="spinner" style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", borderTopColor: "var(--accent)", animation: "spin 0.6s linear infinite" }} />
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 700 }}>{state?.youtubeStatus || "Processando..."}</span>
            </div>
          )}
          
          <small style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
            💡 O processo pode demorar alguns segundos dependendo do tamanho do vídeo.
          </small>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 24 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={handleCancel}>
            {youtubeLoading ? "Cancelar Download" : "Cancelar"}
          </button>
          <button
            className="btn btn-primary"
            style={{ padding: "8px 20px", fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}
            onClick={handleImport}
            disabled={youtubeLoading}
          >
            {youtubeLoading && (
              <div
                className="spinner"
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.2)",
                  borderTopColor: "#fff",
                  animation: "spin 0.6s linear infinite",
                }}
              />
            )}
            {youtubeLoading ? "Baixando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- AdvancedSoundEditorModal ---
export function AdvancedSoundEditorModal({ state, selected, onClose, call, setToast, onDelete, soundboardFavorites, toggleSoundboardFavorite }) {
  const [draft, setDraft] = useState({});
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
    }
  }, [selected?.id]);

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
      reverse_mix: Number(reverseMix)
    };
  };

  const handleSave = async (replace) => {
    try {
      const payload = {
        id: selected.id,
        replace,
        name: draft.name || selected.name,
        category: draft.category || "Geral",
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
      const payload = {
        id: selected.id,
        name: draft.name || selected.name,
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
          <h3>🎚️ Editor de Som Avançado: <span style={{ color: "var(--purple)" }}>{selected.name}</span></h3>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="sound-modal-body">
          {/* Left panel: File Identity */}
          <div className="sound-modal-left">
            <div className="sound-modal-cover-box" style={{ background: `color-mix(in srgb, ${selected.color || "#8B5CF6"} 15%, var(--bg-card-secondary))` }}>
              {draft.coverUrl || selected.coverUrl ? (
                <img src={draft.coverUrl || selected.coverUrl} alt="" />
              ) : (
                <MusicNotes size={42} color={selected.color || "var(--purple)"} />
              )}
              <div className="sound-modal-cover-overlay" onClick={chooseCover}>
                <span style={{ fontSize: 11, fontWeight: 700 }}>ESCOLHER CAPA</span>
              </div>
            </div>

            <div className="labField">
              <label>Nome do Som</label>
              <input type="text" value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>

            <div className="labField">
              <label>Categoria / Pasta</label>
              <input type="text" value={draft.category || ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            </div>

            <div className="labField">
              <label>Atalho de Teclado</label>
              <input type="text" value={draft.shortcut || ""} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} placeholder="Ex: Ctrl+Alt+1" />
            </div>

            <div className="labField">
              <label>Rota de Saída</label>
              <select value={draft.output_route || "both"} onChange={(e) => setDraft({ ...draft, output_route: e.target.value })}>
                {soundOutputRoutes.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {/* Right panel: Sliders, Waveform, FX */}
          <div className="sound-modal-right">
            {/* Professional Waveform */}
            <WaveformVisualizer
              soundId={selected.id}
              path={selected.path}
              start={startSec}
              end={endSec}
              duration={selected.duration || 6.0}
              onUpdateTrim={(s, e) => { setStartSec(s); setEndSec(e); }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 16 }}>
              {/* Sliders Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Slider label="Volume Geral / Ganho" value={draft.volume ?? 1.0} min={0} max={10} suffix="x" quadratic={true} onChange={(v) => setDraft((prev) => ({ ...prev, volume: v }))} />
                <Slider label="Tom (Pitch)" value={draft.pitch_semitones ?? 0} min={-12} max={12} step={1} suffix="st" onChange={(v) => setDraft((prev) => ({ ...prev, pitch_semitones: v }))} />
                <Slider label="Velocidade" value={draft.speed ?? 1.0} min={0.25} max={4.0} step={0.05} suffix="x" onChange={(v) => setDraft((prev) => ({ ...prev, speed: v }))} />
                <Slider label="Fade In" value={draft.fade_in_ms ?? 0} min={0} max={5000} step={50} suffix="ms" onChange={(v) => setDraft((prev) => ({ ...prev, fade_in_ms: v }))} />
                <Slider label="Fade Out" value={draft.fade_out_ms ?? 0} min={0} max={5000} step={50} suffix="ms" onChange={(v) => setDraft((prev) => ({ ...prev, fade_out_ms: v }))} />
              </div>

              {/* Behavior & Options */}
              <div style={{ background: "var(--bg-card-secondary)", padding: 12, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>Playback:</span>
                  <select value={draft.playback_mode || "restart"} onChange={(e) => setDraft({ ...draft, playback_mode: e.target.value })} style={{ padding: "4px 8px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", color: "var(--text)", fontSize: 11 }}>
                    {playbackModes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!draft.loop} onChange={(e) => setDraft({ ...draft, loop: e.target.checked })} /> Looping Contínuo
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!draft.normalize} onChange={(e) => setDraft({ ...draft, normalize: e.target.checked })} /> Normalizar Picos
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!draft.block_voice} onChange={(e) => setDraft({ ...draft, block_voice: e.target.checked })} /> Bloquear Minha Voz
                  </label>
                </div>
              </div>
            </div>

            {/* Premium FX Grid inside Modal */}
            <div style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Sparkle size={14} color="var(--purple)" />
                <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-secondary)" }}>EFEITOS EMBUTIDOS NO ÁUDIO</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <EffectSliderRow label="Reverb" enabled={reverbEnabled} value={reverbMix * 100} min={0} max={90} suffix="%" onToggle={() => setReverbEnabled(!reverbEnabled)} onChange={(v) => setReverbMix(v / 100)} />
                  <EffectSliderRow label="Eco Curto" enabled={echoEnabled} value={echoMix * 100} min={0} max={90} suffix="%" onToggle={() => setEchoEnabled(!echoEnabled)} onChange={(v) => setEchoMix(v / 100)} />
                  <EffectSliderRow label="Delay" enabled={delayEnabled} value={delayMix * 100} min={0} max={90} suffix="%" onToggle={() => setDelayEnabled(!delayEnabled)} onChange={(v) => setDelayMix(v / 100)} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <EffectSliderRow label="Distorção (Gain Boost)" enabled={distEnabled} value={distDrive} min={1} max={100} suffix="x" onToggle={() => setDistEnabled(!distEnabled)} onChange={(v) => setDistDrive(v)} />
                  <EffectSliderRow label="Noise Reduction" enabled={gateEnabled} value={gateThreshold * 100} min={0} max={40} suffix="%" onToggle={() => setGateEnabled(!gateEnabled)} onChange={(v) => setGateThreshold(v / 100)} />
                  <EffectSliderRow label="Reverse Audio" enabled={reverseEnabled} value={reverseMix * 100} min={0} max={100} suffix="%" onToggle={() => setReverseEnabled(!reverseEnabled)} onChange={(v) => setReverseMix(v / 100)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sound-modal-footer">
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" onClick={onDelete} style={{ background: "none", border: "1px solid var(--danger-soft)" }}><Trash size={14} /> Remover Som</button>
            <button className="btn btn-ghost" onClick={handleRestore}><ArrowClockwise size={14} /> Restaurar Padrões</button>
            {selected.hasOriginal && (
              <button
                className="btn btn-ghost"
                onClick={handleRestoreOriginalFile}
                style={{
                  border: "1px solid var(--danger-soft)",
                  color: "var(--danger)"
                }}
              >
                <ArrowCounterClockwise size={14} /> Restaurar Original
              </button>
            )}
            <button
              className="btn btn-danger"
              onClick={activateAllAtMax}
              style={{
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                border: "1px solid #f87171",
                boxShadow: "0 0 10px rgba(239, 68, 68, 0.3)",
                color: "#fff",
                fontWeight: 700
              }}
            >
              💥 ATIVAR NO MÁXIMO
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={isCurrentlyPlaying ? handleStopPreview : handlePreview}
              style={{
                background: isCurrentlyPlaying
                  ? "linear-gradient(135deg, var(--danger-glow), var(--danger-soft))"
                  : "linear-gradient(135deg, var(--danger), var(--danger-dim))",
                border: isCurrentlyPlaying ? "1px solid var(--danger)" : "1px solid var(--cyan)",
                color: isCurrentlyPlaying ? "var(--danger)" : "var(--cyan)",
                textShadow: isCurrentlyPlaying ? "0 0 4px var(--danger-glow)" : "0 0 4px var(--cyan-glow)"
              }}
            >
              {isCurrentlyPlaying ? (
                <>
                  <StopCircle size={14} weight="fill" /> Parar Prévia
                </>
              ) : (
                <>
                  <Play size={14} weight="bold" /> Ouvir Prévia
                </>
              )}
            </button>
            <button className="btn btn-ghost" onClick={() => handleSave(false)}>Salvar como Cópia</button>
            <button className="btn btn-primary" onClick={() => handleSave(true)} style={{ background: "linear-gradient(135deg, var(--purple), var(--purple-dim))" }}>Substituir Original</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// --- LOCAL_CHANGELOGS & FALLBACKS ---
const LOCAL_CHANGELOGS = {
  "v0.5.21": `### 🌟 Versão 0.5.21 (Versão Atual)
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
  { id: "v0.5.21", tag_name: "v0.5.21", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.20", tag_name: "v0.5.20", published_at: new Date().toISOString(), body: "" },
  { id: "v0.5.19", tag_name: "v0.5.19", published_at: new Date().toISOString(), body: "" },
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
export function ReleasesModal({ onClose, currentVersion, onUpdateApp }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingUrl, setUpdatingUrl] = useState(null);

  useEffect(() => {
    fetch("https://api.github.com/repos/OtavioBiazzi/MicStudio/releases")
      .then((res) => {
        if (!res.ok) throw new Error("Erro ao carregar do GitHub");
        return res.json();
      })
      .then((data) => {
        setReleases(data && data.length ? data : FALLBACK_RELEASES);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("Falha ao buscar releases do GitHub, usando dados estáticos:", err);
        setReleases(FALLBACK_RELEASES);
        setLoading(false);
      });
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
          <button className="closeBtn" onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}><X size={18} /></button>
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
                  <div key={release.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 14, background: isCurrent ? "rgba(139, 92, 246, 0.04)" : "rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: isCurrent ? "var(--purple)" : "var(--text)" }}>{release.tag_name}</span>
                        {isCurrent && <span style={{ fontSize: 9, background: "var(--purple-soft)", color: "var(--purple)", padding: "2px 6px", borderRadius: 10, fontWeight: 800 }}>ATUAL</span>}
                        {isNew && <span style={{ fontSize: 9, background: "rgba(16,185,129,0.1)", color: "#10b981", padding: "2px 6px", borderRadius: 10, fontWeight: 800 }}>NOVO</span>}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{release.published_at ? new Date(release.published_at).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : ""}</span>
                    </div>

                    <div className="readme-container changelog-markdown" style={{ fontSize: 11.5, lineHeight: 1.6, color: "var(--text-secondary)", maxHeight: 150, overflowY: "auto", padding: "8px 10px", background: "rgba(0,0,0,0.2)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(255,255,255,0.02)" }}>
                      {renderMarkdown(release.body || LOCAL_CHANGELOGS[release.tag_name] || "*Nenhuma nota de versão fornecida.*")}
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

