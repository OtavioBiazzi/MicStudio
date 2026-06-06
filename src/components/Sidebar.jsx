import React from "react";
import { motion } from "framer-motion";
import {
  MicrophoneStage,
  MusicNotes,
  Broadcast,
  Star,
  Flask,
  GearSix,
  Waveform
} from "@phosphor-icons/react";

const pages = [
  { id: "vozes", label: "Vozes", icon: MicrophoneStage },
  { id: "soundboard", label: "Soundboard", icon: MusicNotes },
  { id: "online_library", label: "Explorar Sons", icon: Broadcast },
  { id: "favoritos", label: "Favoritos", icon: Star },
  { id: "voicelab", label: "Voice Lab", icon: Flask },
  { id: "config", label: "Configurações", icon: GearSix }
];

export function Sidebar({
  page,
  setPage,
  state,
  profileName,
  profileSub,
  profilePlan,
  profileImage,
  profileImagePosition,
  onOpenProfile,
  appVersion,
  onVersionClick
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">
          <svg viewBox="0 0 32 32" fill="none">
            <rect x="3" y="14" width="3" height="8" rx="1.5" fill="url(#lg1)" opacity="0.7"/>
            <rect x="8" y="10" width="3" height="16" rx="1.5" fill="url(#lg1)" opacity="0.85"/>
            <rect x="13" y="6" width="3" height="24" rx="1.5" fill="url(#lg1)"/>
            <rect x="18" y="8" width="3" height="20" rx="1.5" fill="url(#lg2)"/>
            <rect x="23" y="12" width="3" height="12" rx="1.5" fill="url(#lg2)" opacity="0.85"/>
            <rect x="28" y="14" width="3" height="8" rx="1.5" fill="url(#lg2)" opacity="0.6"/>
            <circle cx="5" cy="12" r="1.5" fill="url(#lg1)" opacity="0.5"/>
            <circle cx="29" cy="12" r="1.5" fill="url(#lg2)" opacity="0.5"/>
            <defs>
              <linearGradient id="lg1" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#00E5FF"/><stop offset="1" stopColor="#8B5CF6"/></linearGradient>
              <linearGradient id="lg2" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8B5CF6"/><stop offset="1" stopColor="#D946EF"/></linearGradient>
            </defs>
          </svg>
        </div>
        <div className="logo-text">
          <span className="brand-name">MicFudido</span>
          <span className="brand-sub">STUDIO</span>
        </div>
      </div>

      <nav>
        {pages.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              className={page === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setPage(item.id)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon size={20} weight="duotone" />
              <span>{item.label}</span>
            </motion.button>
          );
        })}
      </nav>

      <AudioVisualizer running={!!(state?.running || state?.monitorOnly)} />

      <div className="sidebar-bottom">
        <div className="sidebar-profile" onClick={onOpenProfile} style={{ cursor: "pointer" }}>
          <div className="profile-avatar" style={{ overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {profileImage ? (
              <img src={profileImage} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", objectPosition: `center ${profileImagePosition}%` }} />
            ) : (
              <Waveform size={18} weight="fill" color="#fff" />
            )}
            <span className="status-dot" />
          </div>
          <div className="profile-info">
            <strong>{profileName} {profilePlan && <span className="pro-badge">{profilePlan}</span>}</strong>
            <small>{profileSub}</small>
          </div>
        </div>
        <div 
          onClick={onVersionClick}
          onMouseEnter={(e) => e.currentTarget.style.color = "var(--purple)"}
          onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
          style={{ 
            padding: "8px 4px 0 4px", 
            fontSize: "9.5px", 
            color: "var(--text-muted)", 
            textAlign: "center", 
            borderTop: "1px solid rgba(255,255,255,0.06)", 
            marginTop: "12px", 
            width: "100%", 
            opacity: 0.8,
            cursor: "pointer",
            fontWeight: "700",
            transition: "color 0.2s"
          }}
          title="Ver histórico de atualizações"
        >
          {appVersion || "v0.5.0"}
        </div>
      </div>
    </aside>
  );
}

function AudioVisualizer({ running }) {
  const canvasRef = React.useRef(null);
  const [level, setLevel] = React.useState(0);

  React.useEffect(() => {
    if (!running) {
      setLevel(0);
      return;
    }
    let active = true;
    const pollLevel = async () => {
      try {
        const res = await fetch("http://127.0.0.1:38717/api/level");
        const data = await res.json();
        if (active) {
          setLevel(data.level || 0);
        }
      } catch (e) {
        // ignore
      }
    };
    const interval = setInterval(pollLevel, 100);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [running]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    
    let currentLevel = 0;
    const numBars = 16;
    const barHeights = Array(numBars).fill(0);

    const render = () => {
      currentLevel += (level - currentLevel) * 0.15;
      if (currentLevel < 0.01) currentLevel = 0;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const spacing = 3;
      const barWidth = (width - (spacing * (numBars - 1))) / numBars;

      for (let i = 0; i < numBars; i++) {
        const sinVal = Math.sin(Date.now() * 0.003 + i * 0.5) * 0.5 + 0.5;
        const noiseVal = Math.random() * 0.3;
        const baseHeight = running ? 3 : 1;
        let targetHeight = baseHeight + (sinVal * 0.6 + noiseVal * 0.4) * currentLevel * (height - 6);
        if (targetHeight < 2) targetHeight = 2;

        barHeights[i] += (targetHeight - barHeights[i]) * 0.2;

        const x = i * (barWidth + spacing);
        const y = height - barHeights[i];
        
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, "var(--purple-dim, #6D42D9)");
        gradient.addColorStop(1, "var(--purple, #8B5CF6)");
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, barHeights[i], 1.5);
        } else {
          ctx.rect(x, y, barWidth, barHeights[i]);
        }
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [level, running]);

  return (
    <div className="audio-visualizer-container" style={{ padding: "0 14px", marginTop: "16px", marginBottom: "16px", height: "42px", display: "flex", flexDirection: "column", justifyContent: "center", borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", fontSize: "9px", color: "var(--text-muted)", fontWeight: "bold", letterSpacing: "0.5px" }}>
        <span>VOZ STATUS:</span>
        <span style={{ color: running ? "var(--purple)" : "var(--text-muted)", transition: "color 0.2s" }}>
          {running ? "PROCESSANDO" : "DESATIVADA"}
        </span>
      </div>
      <canvas ref={canvasRef} width="188" height="24" style={{ width: "100%", height: "24px", display: "block" }} />
    </div>
  );
}
