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
  onOpenProfile
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
        <div style={{ padding: "8px 4px 0 4px", fontSize: "9px", color: "var(--text-muted)", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "12px", width: "100%", opacity: 0.8 }}>
          v0.4.0
        </div>
      </div>
    </aside>
  );
}
