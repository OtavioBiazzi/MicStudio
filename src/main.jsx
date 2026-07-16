import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import "./styles.css";

// Utils & Helpers
import {
  makeDisabledEffects,
  countEnabledEffects,
  controlsForPreset,
  isVoicePresetActive,
  ErrorBoundary
} from "./utils";

// Voice Presets
import { voicePresets } from "./voicePresets";

// API Client
import { API } from "./apiClient";

const TTS_CHARACTER_LIMIT = 10000;

// Layout Components
import { Sidebar } from "./components/Sidebar";
import { WindowControls } from "./components/WindowControls";
import { AudioPlayer } from "./components/AudioPlayer";
import { FloatingDock } from "./components/FloatingDock";

// Page Components
import { VozesPage } from "./components/VozesPage";
import { SoundboardPage } from "./components/SoundboardPage";
import { OnlineSoundsPage } from "./components/OnlineSoundsPage";
import { FavoritosPage } from "./components/FavoritosPage";
import { VoiceLabPage } from "./components/VoiceLabPage";
import { ConfigPage, colorPalettes } from "./components/ConfigPage";

// Modals
import {
  ChooseMicOnCloseModal,
  CloseChoiceModal,
  UserProfileModal,
  EditProfileModal,
  MoveCategoryModal,
  ReleasesModal,
  UpdateAlertModal
} from "./components/Modals";

function hexToRgba(hex, alpha) {
  let r = 0, g = 0, b = 0;
  hex = (hex || "").replace("#", "");
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function adjustColor(hex, percent) {
  hex = (hex || "").replace("#", "");
  if (isNaN(parseInt(hex, 16))) return "#8b5cf6";
  let num = parseInt(hex, 16);
  let amt = Math.round(2.55 * percent);
  let R = (num >> 16) + amt;
  let G = (num >> 8 & 0x00FF) + amt;
  let B = (num & 0x0000FF) + amt;
  R = Math.max(0, Math.min(255, R));
  G = Math.max(0, Math.min(255, G));
  B = Math.max(0, Math.min(255, B));
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem("micfudiddo.page") || "vozes";
    const validPages = ["vozes", "soundboard", "online_library", "favoritos", "voicelab", "config"];
    return validPages.includes(saved) ? saved : "vozes";
  });
  const [selectedSound, setSelectedSound] = useState(null);
  const [pinnedSoundId, setPinnedSoundId] = useState(null);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("micfudiddo.voiceFavorites") || "[]"); } catch { return []; }
  });
  const [customVoices, setCustomVoices] = useState(() => {
    try { return JSON.parse(localStorage.getItem("micfudiddo.customPresets") || "[]"); } catch { return []; }
  });
  const [selectedRecordDevices, setSelectedRecordDevices] = useState([]);
  const [toast, setToast] = useState("");
  const [autoBootTried, setAutoBootTried] = useState(false);
  const [closeChoiceOpen, setCloseChoiceOpen] = useState(false);
  const [chooseMicOnCloseOpen, setChooseMicOnCloseOpen] = useState(false);
  const [bootError, setBootError] = useState(null);
  const controlsOptimisticRef = useRef(null);
  const lastYoutubeStatusRef = useRef("");
  const controlsTimerRef = useRef(null);
  const latestControlsRef = useRef(null);
  const categoriesHydratedRef = useRef(false);

  const [bypassActive, setBypassActive] = useState(false);
  const [lastActivePresetId, setLastActivePresetId] = useState(null);
  const [savedCustomControls, setSavedCustomControls] = useState(null);
  const [forcedPresetId, setForcedPresetId] = useState(null);

  const [lastNonZeroGain, setLastNonZeroGain] = useState(() => {
    try {
      const g = parseFloat(localStorage.getItem("micfudiddo.lastNonZeroGain"));
      return isNaN(g) ? 1.0 : g;
    } catch {
      return 1.0;
    }
  });

  useEffect(() => {
    if (state?.controls?.gain > 0) {
      setLastNonZeroGain(state.controls.gain);
      localStorage.setItem("micfudiddo.lastNonZeroGain", state.controls.gain.toString());
    }
  }, [state?.controls?.gain]);



  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem("micfudiddo.accentColor") || "purple";
  });
  const [customAccentColor, setCustomAccentColor] = useState(() => {
    return localStorage.getItem("micfudiddo.customAccentColor") || "#8B5CF6";
  });
  const [appTheme, setAppTheme] = useState(() => {
    return localStorage.getItem("micfudiddo.theme") || "theme-cyberpunk";
  });
  const [profileName, setProfileName] = useState(() => {
    return localStorage.getItem("micfudiddo.profileName") || "MicFudido";
  });
  const [profileSub, setProfileSub] = useState(() => {
    return localStorage.getItem("micfudiddo.profileSub") || "Plano Vitalício";
  });
  const [profileImage, setProfileImage] = useState(() => {
    return localStorage.getItem("micfudiddo.profileImage") || "";
  });
  const [userProfileOpen, setUserProfileOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profilePlan, setProfilePlan] = useState(() => {
    return localStorage.getItem("micfudiddo.profilePlan") !== null ? localStorage.getItem("micfudiddo.profilePlan") : "PRO";
  });
  const [profileBio, setProfileBio] = useState(() => {
    return localStorage.getItem("micfudiddo.profileBio") !== null ? localStorage.getItem("micfudiddo.profileBio") : "Olá! Bem-vindo ao meu perfil.";
  });
  const [profileReadme, setProfileReadme] = useState(() => {
    return localStorage.getItem("micfudiddo.profileReadme") !== null ? localStorage.getItem("micfudiddo.profileReadme") : "# Sobre Mim\n\nOlá! Bem-vindo ao meu perfil no **MicFudiddo Studio**.\n\n### Meus Presets Favoritos\n- **Monstro Mecânico**: Voz grossa com modulação metálica\n- **Esquilo**: Voz super aguda para zoeira\n- **Rádio Antigo**: Perfeito para roleplay militar\n\n> Sinta-se livre para editar meu README clicando em *Editar Perfil*!\n\n_Criado com amor no MicFudiddo._";
  });
  const [profileImagePosition, setProfileImagePosition] = useState(() => {
    return localStorage.getItem("micfudiddo.profileImagePosition") || "50";
  });
  const [dockMinimized, setDockMinimized] = useState(() => {
    return localStorage.getItem("micfudiddo.dockMinimized") === "true";
  });
  
  // Opções de personalização visual
  const [prefFontSize, setPrefFontSize] = useState(() => localStorage.getItem("micfudiddo.prefFontSize") || "normal");
  const [prefGlow, setPrefGlow] = useState(() => localStorage.getItem("micfudiddo.prefGlow") || "medium");
  const [prefRadius, setPrefRadius] = useState(() => localStorage.getItem("micfudiddo.prefRadius") || "rounded");
  const [prefGlass, setPrefGlass] = useState(() => localStorage.getItem("micfudiddo.prefGlass") !== "false");
  const [prefGamerMode, setPrefGamerMode] = useState(() => localStorage.getItem("micfudiddo.prefGamerMode") === "true");
  const [prefDockOpacity, setPrefDockOpacity] = useState(() => Number(localStorage.getItem("micfudiddo.prefDockOpacity") || 0.95));

  const [customCategories, setCustomCategories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("micfudiddo.customCategories") || "[]");
    } catch {
      return [];
    }
  });

  const [customVoiceCategories, setCustomVoiceCategories] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("micfudiddo.customVoiceCategories") || "[]");
    } catch {
      return [];
    }
  });

  const [promptState, setPromptState] = useState(null);
  const [moveCategorySoundId, setMoveCategorySoundId] = useState(null);

  const [soundboardFavorites, setSoundboardFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem("micfudiddo.soundboardFavorites") || "[]"); } catch { return []; }
  });

  const [appVersion, setAppVersion] = useState("v0.5.2");
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [showReleasesModal, setShowReleasesModal] = useState(false);

  useEffect(() => {
    window.micfudiddo?.getVersion?.().then((v) => {
      if (v) setAppVersion("v" + v.replace(/^v/, ""));
    });
  }, []);

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const currentVersion = await window.micfudiddo?.getVersion?.();
        if (!currentVersion) return;

        const res = await fetch(
          `https://api.github.com/repos/OtavioBiazzi/MicStudio/releases/latest?ts=${Date.now()}`,
          { cache: "no-store", headers: { Accept: "application/vnd.github+json" } }
        );
        if (!res.ok) return;
        const latestRelease = await res.json();
        if (!latestRelease?.tag_name) return;
        const latestVersion = latestRelease.tag_name;
        
        const isNewer = (curr, lat) => {
          const clean = (v) => v.replace(/^v/, "").split(".").map(Number);
          const cParts = clean(curr);
          const lParts = clean(lat);
          for (let i = 0; i < Math.max(cParts.length, lParts.length); i++) {
            const cVal = cParts[i] || 0;
            const lVal = lParts[i] || 0;
            if (lVal > cVal) return true;
            if (cVal > lVal) return false;
          }
          return false;
        };

        if (isNewer(currentVersion, latestVersion)) {
          const assets = latestRelease.assets || [];
          const asset = assets.find(a => a.name.includes("Setup") && a.name.endsWith(".exe")) ||
                        assets.find(a => a.name.includes("Studio") && a.name.endsWith(".exe")) ||
                        assets.find(a => a.name.endsWith(".exe"));
          if (asset) {
            setUpdateAvailable({
              version: latestVersion,
              changelog: latestRelease.body,
              downloadUrl: asset.browser_download_url
            });
          }
        } else {
          setUpdateAvailable(null);
        }
      } catch (err) {
        console.error("Erro ao verificar atualizações:", err);
      }
    };
    const timer = setTimeout(checkUpdates, 4000);
    const interval = setInterval(checkUpdates, 5 * 60 * 1000);
    const handleFocus = () => checkUpdates();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const handleUpdateApp = async (downloadUrl) => {
    if (window.micfudiddo?.updateApp) {
      await window.micfudiddo.updateApp(downloadUrl);
    } else {
      window.open(downloadUrl, "_blank");
    }
  };

  // Apply theme class
  useEffect(() => {
    const r = document.documentElement;
    r.classList.remove("theme-cyberpunk", "theme-dracula", "theme-vampire", "theme-neon", "theme-synthwave");
    r.classList.add(appTheme);
  }, [appTheme]);

  // Apply accent color
  useEffect(() => {
    const applyAccentColor = (key) => {
      let p;
      if (key === "custom") {
        const hex = customAccentColor;
        p = {
          primary: hex,
          hover: adjustColor(hex, 15),
          dim: adjustColor(hex, -15),
          glow: hexToRgba(hex, 0.35),
          soft: hexToRgba(hex, 0.12),
          bg: hexToRgba(hex, 0.08),
          borderHover: hexToRgba(hex, 0.25),
          borderActive: hexToRgba(hex, 0.5)
        };
      } else {
        p = colorPalettes[key] || colorPalettes.purple;
      }
      const r = document.documentElement;
      r.style.setProperty("--purple", p.primary);
      r.style.setProperty("--purple-hover", p.hover);
      r.style.setProperty("--purple-dim", p.dim);
      r.style.setProperty("--purple-glow", p.glow);
      r.style.setProperty("--purple-soft", p.soft);
      r.style.setProperty("--purple-bg", p.bg);
      r.style.setProperty("--border-hover", p.borderHover);
      r.style.setProperty("--border-active", p.borderActive);
    };
    applyAccentColor(accentColor);
  }, [accentColor, customAccentColor]);

  // Efeitos para aplicar as opções de personalização visual
  useEffect(() => {
    localStorage.setItem("micfudiddo.prefFontSize", prefFontSize);
    const szMap = { small: "12px", normal: "13px", large: "15px" };
    document.documentElement.style.setProperty("--font-size-base", szMap[prefFontSize] || "13px");
  }, [prefFontSize]);

  useEffect(() => {
    localStorage.setItem("micfudiddo.prefGlow", prefGlow);
    const glowMap = {
      none: "none",
      soft: "0 0 10px rgba(139, 92, 246, 0.15)",
      medium: "0 0 20px rgba(139, 92, 246, 0.25)",
      high: "0 0 35px rgba(139, 92, 246, 0.45)"
    };
    document.documentElement.style.setProperty("--shadow-glow-purple", glowMap[prefGlow] || glowMap.medium);
    document.documentElement.style.setProperty("--shadow-glow-cyan", (glowMap[prefGlow] || glowMap.medium).replace(/139,\s*92,\s*246/g, "0, 229, 255"));
    document.documentElement.style.setProperty("--shadow-glow-green", (glowMap[prefGlow] || glowMap.medium).replace(/139,\s*92,\s*246/g, "34, 197, 94"));
  }, [prefGlow]);

  useEffect(() => {
    localStorage.setItem("micfudiddo.prefRadius", prefRadius);
    const radMap = {
      sharp: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px" },
      rounded: { xs: "6px", sm: "8px", md: "12px", lg: "16px", xl: "20px" },
      soft: { xs: "10px", sm: "14px", md: "20px", lg: "26px", xl: "32px" }
    };
    const current = radMap[prefRadius] || radMap.rounded;
    document.documentElement.style.setProperty("--radius-xs", current.xs);
    document.documentElement.style.setProperty("--radius-sm", current.sm);
    document.documentElement.style.setProperty("--radius-md", current.md);
    document.documentElement.style.setProperty("--radius-lg", current.lg);
    document.documentElement.style.setProperty("--radius-xl", current.xl);
  }, [prefRadius]);

  useEffect(() => {
    localStorage.setItem("micfudiddo.prefGlass", String(prefGlass));
    document.documentElement.style.setProperty("--backdrop-filter-value", prefGlass ? "blur(12px)" : "none");
  }, [prefGlass]);

  useEffect(() => {
    localStorage.setItem("micfudiddo.prefGamerMode", String(prefGamerMode));
    if (prefGamerMode) {
      document.body.classList.add("gamer-mode-active");
      document.documentElement.style.setProperty("--transition", "none");
      document.documentElement.style.setProperty("--transition-fast", "none");
      document.documentElement.style.setProperty("--transition-slow", "none");
    } else {
      document.body.classList.remove("gamer-mode-active");
      document.documentElement.style.setProperty("--transition", ".18s ease");
      document.documentElement.style.setProperty("--transition-fast", ".1s ease");
      document.documentElement.style.setProperty("--transition-slow", ".3s ease");
    }
  }, [prefGamerMode]);

  useEffect(() => {
    localStorage.setItem("micfudiddo.prefDockOpacity", String(prefDockOpacity));
    document.documentElement.style.setProperty("--dock-opacity", String(prefDockOpacity));
  }, [prefDockOpacity]);

  // Persistence hooks
  useEffect(() => { localStorage.setItem("micfudiddo.page", page); }, [page]);
  useEffect(() => { localStorage.setItem("micfudiddo.accentColor", accentColor); }, [accentColor]);
  useEffect(() => { localStorage.setItem("micfudiddo.theme", appTheme); }, [appTheme]);
  useEffect(() => { localStorage.setItem("micfudiddo.customAccentColor", customAccentColor); }, [customAccentColor]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileName", profileName); }, [profileName]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileSub", profileSub); }, [profileSub]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileImage", profileImage); }, [profileImage]);
  useEffect(() => { localStorage.setItem("micfudiddo.profilePlan", profilePlan); }, [profilePlan]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileBio", profileBio); }, [profileBio]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileReadme", profileReadme); }, [profileReadme]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileImagePosition", profileImagePosition); }, [profileImagePosition]);
  useEffect(() => { localStorage.setItem("micfudiddo.dockMinimized", String(dockMinimized)); }, [dockMinimized]);
  useEffect(() => { localStorage.setItem("micfudiddo.customCategories", JSON.stringify(customCategories)); }, [customCategories]);
  useEffect(() => { localStorage.setItem("micfudiddo.customVoiceCategories", JSON.stringify(customVoiceCategories)); }, [customVoiceCategories]);
  useEffect(() => { localStorage.setItem("micfudiddo.soundboardFavorites", JSON.stringify(soundboardFavorites)); }, [soundboardFavorites]);
  useEffect(() => { localStorage.setItem("micfudiddo.voiceFavorites", JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem("micfudiddo.customPresets", JSON.stringify(customVoices)); }, [customVoices]);

  const applyIncomingState = (data) => {
    if (!data) return;

    if (!categoriesHydratedRef.current && Array.isArray(data.customSoundCategories)) {
      setCustomCategories((current) => Array.from(new Set([...data.customSoundCategories, ...current])));
      categoriesHydratedRef.current = true;
    }
    
    // Normalizar a duração de todos os sons para números decimais limpos no frontend
    if (data.sounds && Array.isArray(data.sounds)) {
      data.sounds = data.sounds.map((sound) => {
        let dur = sound.duration;
        if (dur === null || dur === undefined) {
          dur = 3.0;
        } else if (typeof dur === "string") {
          const cleanDur = dur.replace("s", "").trim();
          if (cleanDur === "N/A" || cleanDur === "") {
            dur = 3.0;
          } else {
            const parsed = parseFloat(cleanDur);
            dur = isNaN(parsed) || parsed <= 0 ? 3.0 : parsed;
          }
        } else if (typeof dur === "number") {
          if (dur <= 0) dur = 3.0;
        } else {
          dur = 3.0;
        }
        return { ...sound, duration: dur };
      });
    }

    const optimistic = controlsOptimisticRef.current;
    setState((prev) => {
      let normalizedData = data;
      if (data.sounds && Array.isArray(data.sounds)) {
        normalizedData = { ...data };
      }
      if (!prev) return normalizedData;
      const nextState = { ...prev, ...normalizedData };
      if (optimistic && Date.now() < optimistic.until && nextState.controls) {
        nextState.controls = { ...nextState.controls, ...optimistic.controls };
      } else {
        controlsOptimisticRef.current = null;
      }
      return nextState;
    });
  };

  const call = async (path, body = {}) => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Erro no backend");
    applyIncomingState(data);
    return data;
  };

  const callSilent = async (path, body = {}) => {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let message = "Erro no backend";
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
  };

  const refresh = async () => {
    const res = await fetch(`${API}/api/state`);
    applyIncomingState(await res.json());
  };

  const selected = useMemo(
    () => state?.sounds?.find((s) => s.id === selectedSound) || state?.sounds?.[0],
    [state, selectedSound]
  );

  const updateControls = (patch) => {
    const controls = { ...state.controls, ...patch };
    controlsOptimisticRef.current = { controls, until: Date.now() + 1200 };
    setState({ ...state, controls });

    // Se mudou algum controle não-limpo enquanto em bypassActive, desativa o bypass
    const isCurrentlyClean = Math.abs(Number(controls.pitch ?? 0)) < 0.05 && 
      countEnabledEffects(controls.effects) === 0;
    if (!isCurrentlyClean && bypassActive) {
      setBypassActive(false);
    }

    // Salvar configurações de Voz Personalizada se ativo
    if (forcedPresetId === "personalizado") {
      localStorage.setItem("personalizado_settings", JSON.stringify({
        gain: controls.gain,
        pitch: controls.pitch,
        effects: controls.effects
      }));
    }

    latestControlsRef.current = controls;
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    
    controlsTimerRef.current = setTimeout(() => {
      const controlsToSend = latestControlsRef.current;
      call("/api/controls", { controls: controlsToSend }).catch((e) => {
        controlsOptimisticRef.current = null;
        setToast(e.message);
      });
    }, 60);
  };

  const toggleMute = () => {
    if (!state) return;
    const isCurrentlyMuted = !!state.controls?.masterMute;
    updateControls({ masterMute: !isCurrentlyMuted });
  };

  const updateEffects = (patch) => {
    updateControls({ effects: { ...state.controls.effects, ...patch } });
  };

  const applyVoicePreset = (voice) => {
    if (!state || !voice) return;
    setForcedPresetId(voice.id);
    if (voice.id !== "clean") {
      setBypassActive(false);
      setLastActivePresetId(voice.id);
      setSavedCustomControls(null);
    } else {
      setBypassActive(true);
    }

    let targetControls;
    if (voice.id === "personalizado") {
      const saved = localStorage.getItem("personalizado_settings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          targetControls = {
            ...state.controls,
            gain: parsed.gain,
            pitch: parsed.pitch,
            effects: { ...state.controls.effects, ...parsed.effects }
          };
        } catch (e) {
          targetControls = controlsForPreset(state.controls, voice);
        }
      } else {
        targetControls = controlsForPreset(state.controls, voice);
      }
    } else {
      targetControls = controlsForPreset(state.controls, voice);
    }

    updateControls(targetControls);
  };

  const toggleFavorite = (voiceId) => {
    setFavorites((prev) => prev.includes(voiceId) ? prev.filter((f) => f !== voiceId) : [...prev, voiceId]);
  };

  const toggleSoundboardFavorite = (soundId) => {
    setSoundboardFavorites((prev) =>
      prev.includes(soundId) ? prev.filter((id) => id !== soundId) : [...prev, soundId]
    );
  };

  const activePreset = useMemo(() => {
    const all = [...voicePresets, ...customVoices];
    if (forcedPresetId) {
      const forced = all.find(p => p.id === forcedPresetId);
      if (forced) {
        if (forced.id === "personalizado" || customVoices.some(cv => cv.id === forced.id)) {
          return forced;
        }
        if (isVoicePresetActive(state?.controls, forced)) {
          return forced;
        }
      }
    }
    const matched = all.find((p) => p.id !== "personalizado" && isVoicePresetActive(state?.controls, p));
    if (matched) return matched;
    
    return all.find(p => p.id === "personalizado") || null;
  }, [state?.controls, customVoices, forcedPresetId]);

  function toggleBypass() {
    if (!state) return;
    const isCurrentlyClean = Math.abs(Number(state.controls?.pitch ?? 0)) < 0.05 && 
      countEnabledEffects(state.controls?.effects) === 0;
      
    if (!isCurrentlyClean) {
      setSavedCustomControls({
        gain: state.controls.gain,
        pitch: state.controls.pitch,
        effects: { ...state.controls.effects }
      });
      if (activePreset && activePreset.id !== "clean") {
        setLastActivePresetId(activePreset.id);
      }
      setBypassActive(true);
      updateControls({
        gain: 1.0,
        pitch: 0.0,
        effects: {
          ...makeDisabledEffects(),
          output_volume: 1.0,
          output_volume_enabled: false
        }
      });
    } else {
      setBypassActive(false);
      if (savedCustomControls) {
        updateControls({
          gain: savedCustomControls.gain,
          pitch: savedCustomControls.pitch,
          effects: savedCustomControls.effects
        });
      } else {
        const targetId = lastActivePresetId || "alien";
        const all = [...voicePresets, ...customVoices];
        const targetVoice = all.find((v) => v.id === targetId) || voicePresets.find(v => v.id === "alien") || voicePresets[0];
        applyVoicePreset(targetVoice);
      }
    }
  }

  const lastPlayedSound = useMemo(() => {
    if (!state?.sounds || state.sounds.length === 0) return null;
    const played = state.sounds.filter(s => s.last_played_at > 0);
    if (played.length > 0) {
      return played.sort((a, b) => b.last_played_at - a.last_played_at)[0];
    }
    return state.sounds[0];
  }, [state?.sounds]);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;
    
    const runRefresh = async () => {
      try {
        await refresh();
        if (active) setBootError(null);
      } catch (err) {
        // Ignore connection errors during polling
      }
    };

    runRefresh();
    
    const timeoutId = setTimeout(() => {
      if (active && !stateRef.current) {
        setBootError("Não foi possível conectar ao backend. Verifique se outra instância do MicFudiddo está em execução ou se há um conflito de porta (38717).");
      }
    }, 20000);

    const intervalId = setInterval(runRefresh, 700);
    
    return () => {
      active = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state?.recordSelected) setSelectedRecordDevices(state.recordSelected);
  }, [state?.recordSelected?.join("|")]);

  const allowMultiple = state?.settings?.allowMultipleSounds;
  useEffect(() => {
    if (lastPlayedSound) {
      if (!allowMultiple || !pinnedSoundId) {
        setSelectedSound(lastPlayedSound.id);
      }
    }
  }, [lastPlayedSound?.id, allowMultiple, pinnedSoundId]);

  useEffect(() => {
    if (!state || autoBootTried) return;
    setAutoBootTried(true);
    if (state.settings?.autoStartVirtual && !state.running && !state.virtualMode) {
      call("/api/virtual/start").catch((e) => setToast(e.message));
    }
  }, [state, autoBootTried]);

  const handleConfirmMicOnClose = useCallback(async (device_id) => {
    setChooseMicOnCloseOpen(false);
    try {
      await callSilent("/api/windows/set-default-mic", { device_id });
    } catch (e) {
      console.error("Erro ao alterar o microfone padrao:", e);
    }
    window.micfudiddo?.quitApp?.();
  }, []);

  const handleCloseRequest = useCallback(() => {
    const confirmClose = state?.settings?.confirmClose !== false;
    const closeBehavior = state?.settings?.closeBehavior || "ask";
    const defaultMicBehavior = state?.settings?.defaultMicOnClose || "restore";
    
    if (!confirmClose || closeBehavior !== "ask") {
      if (closeBehavior === "tray") {
        window.micfudiddo?.closeToTray?.();
      } else {
        if (defaultMicBehavior === "choose") {
          setChooseMicOnCloseOpen(true);
        } else {
          window.micfudiddo?.quitApp?.();
        }
      }
    } else {
      setCloseChoiceOpen(true);
    }
  }, [state?.settings]);

  const handleMinimizeClose = useCallback((dontShow) => {
    setCloseChoiceOpen(false);
    if (dontShow) {
      call("/api/settings", { settings: { confirmClose: false, closeBehavior: "tray" } }).catch(() => {});
    }
    window.micfudiddo?.closeToTray?.();
  }, [call]);

  const handleQuitClose = useCallback((dontShow) => {
    setCloseChoiceOpen(false);
    if (dontShow) {
      call("/api/settings", { settings: { confirmClose: false, closeBehavior: "quit" } }).catch(() => {});
    }
    const defaultMicBehavior = state?.settings?.defaultMicOnClose || "restore";
    if (defaultMicBehavior === "choose") {
      setChooseMicOnCloseOpen(true);
    } else {
      window.micfudiddo?.quitApp?.();
    }
  }, [call, state?.settings]);

  useEffect(() => {
    return window.micfudiddo?.onCloseChoiceRequested?.(handleCloseRequest);
  }, [handleCloseRequest]);

  useEffect(() => {
    if (!window.micfudiddo?.onHotkeyTriggered) return;
    return window.micfudiddo.onHotkeyTriggered((action) => {
      if (action === "mute_mic") {
        toggleMute();
        setToast(state?.controls?.micMute ? "🎙️ Microfone Desmutado" : "🎙️ Microfone Mutado");
      } else if (action === "toggle_bypass") {
        toggleBypass();
        setToast(bypassActive ? "🎧 Bypass Desativado" : "🎧 Bypass Ativado");
      } else if (action === "toggle_soundboard") {
        updateControls({ soundboardMonitor: !state?.controls?.soundboardMonitor });
        setToast(state?.controls?.soundboardMonitor ? "🔊 Som da Soundboard Mutado" : "🔊 Som da Soundboard Ativado");
      } else if (action === "toggle_voicechanger") {
        const isVoiceChangerActive = (state?.running && !state?.monitorOnly) || state?.virtualMode;
        const togglePath = isVoiceChangerActive ? "/api/stop" : "/api/virtual/start";
        call(togglePath).then(() => setToast(isVoiceChangerActive ? "🎛️ Voice Changer Desativado" : "🎛️ Voice Changer Ativado")).catch((err) => setToast(err.message));
      } else if (action === "record_voice") {
        const isRecording = state?.recording?.voice;
        call(isRecording ? "/api/record/voice/stop" : "/api/record/voice/start").then(() => setToast(isRecording ? "⏹️ Gravação de Voz Parada" : "⏺️ Gravação de Voz Iniciada")).catch((e) => setToast(e.message));
      } else if (action === "record_pc") {
        const isRecording = state?.recording?.pc;
        call(isRecording ? "/api/record/pc/stop" : "/api/record/pc/start", { indexes: selectedRecordDevices }).then(() => setToast(isRecording ? "⏹️ Gravação do PC Parada" : "⏺️ Gravação do PC Iniciada")).catch((e) => setToast(e.message));
      } else if (action === "record_combo") {
        const isRecording = state?.recording?.combo;
        call(isRecording ? "/api/record/combo/stop" : "/api/record/combo/start", { indexes: selectedRecordDevices }).then(() => setToast(isRecording ? "⏹️ Gravação Combo Parada" : "⏺️ Gravação Combo Iniciada")).catch((e) => setToast(e.message));
      } else if (action === "clip") {
        if (!state?.settings?.clipEnabled) {
          setToast("⚠️ Clipping desativado nas configurações");
          return;
        }
        const duration = Number(state?.settings?.clipDuration || 30);
        setToast("🎬 Salvando clipe...");
        call("/api/record/clip", { duration })
          .then((res) => setToast(`🎬 Clipe de ${duration}s salvo!`))
          .catch((e) => setToast("Erro ao clipar: " + e.message));
      }
    });
  }, [state, bypassActive, toggleBypass, updateControls, toggleMute, call, selectedRecordDevices]);

  // Toast automatic clear
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(id);
    }
  }, [toast]);

  // Global YouTube status change monitoring (shows toast even if modal is closed)
  useEffect(() => {
    if (state?.youtubeStatus) {
      const currentStatus = state.youtubeStatus;
      const lastStatus = lastYoutubeStatusRef.current;
      if (currentStatus !== lastStatus) {
        lastYoutubeStatusRef.current = currentStatus;
        const lower = currentStatus.toLowerCase();
        if (
          lower.startsWith("concluido:") ||
          lower.startsWith("erro:") ||
          lower.startsWith("importacao cancelada")
        ) {
          setToast(currentStatus);
        }
      }
    } else if (state?.youtubeStatus === "") {
      lastYoutubeStatusRef.current = "";
    }
  }, [state?.youtubeStatus, setToast]);

  if (bootError && !state) {
    return (
      <div className="boot" style={{ display: "flex", flexDirection: "column", gap: 16, padding: 32, textAlign: "center", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <h2 style={{ color: "var(--danger)", margin: 0 }}>Ops! Erro de Conexão</h2>
        <p style={{ maxWidth: 450, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>{bootError}</p>
        <button onClick={() => window.location.reload()} className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 13, background: "linear-gradient(135deg, var(--danger), var(--danger-soft))" }}>Tentar Novamente</button>
      </div>
    );
  }

  if (!state) {
    return <div className="boot">Carregando MicFudido Studio...</div>;
  }

  const processingActive = state.running && !state.monitorOnly;

  return (
    <div className="appFrame">
      {/* Titlebar */}
      <header className="appTitlebar">
        <WindowControls onCloseRequest={handleCloseRequest} />
      </header>

      {/* Body */}
      <div className="appBody">
        <ErrorBoundary>
          <Sidebar
            page={page}
            setPage={setPage}
            state={state}
            profileName={profileName}
            profileSub={profileSub}
            profilePlan={profilePlan}
            profileImage={profileImage}
            profileImagePosition={profileImagePosition}
            onOpenProfile={() => setUserProfileOpen(true)}
            onManageAccount={() => setEditProfileOpen(true)}
            appVersion={appVersion}
            onVersionClick={() => setShowReleasesModal(true)}
          />
        </ErrorBoundary>

        <main className="mainContent">
          <ErrorBoundary>
            <AudioPlayer
              state={state}
              selected={selected}
              call={call}
              pinnedSoundId={pinnedSoundId}
              setPinnedSoundId={setPinnedSoundId}
              setSelectedSound={setSelectedSound}
            />
          </ErrorBoundary>

          {state.virtualCableDetected === false && (
            <div style={{ 
              margin: "16px 28px 0 28px",
              padding: "14px 18px", 
              background: "rgba(239, 68, 68, 0.06)", 
              border: "1px solid var(--danger-soft)", 
              borderRadius: "var(--radius-md)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "space-between", 
              gap: 16,
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, color: "var(--danger)", fontWeight: 700 }}>
                    Cabo Virtual (VB-CABLE) não detectado
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    Para transmitir sua voz modificada e os sons da Soundboard no Discord ou em jogos, você precisa de um cabo virtual instalado.
                  </span>
                </div>
              </div>
              <a 
                href="https://vb-audio.com/Cable/" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-primary" 
                style={{ 
                  padding: "8px 16px", 
                  fontSize: 11.5, 
                  background: "linear-gradient(135deg, var(--danger), var(--danger-dim))", 
                  border: "1px solid var(--danger)",
                  textDecoration: "none", 
                  color: "#fff", 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: 6, 
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  borderRadius: "var(--radius-sm)",
                  boxShadow: "0 2px 8px rgba(239, 68, 68, 0.2)"
                }}
              >
                📥 Baixar VB-CABLE
              </a>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="page"
            >
              {page === "vozes" && (
                <ErrorBoundary>
                  <VozesPage
                    state={state}
                    call={call}
                    updateControls={updateControls}
                    updateEffects={updateEffects}
                    applyVoicePreset={applyVoicePreset}
                    selectedVoice={selectedVoice}
                    setSelectedVoice={setSelectedVoice}
                    favorites={favorites}
                    toggleFavorite={toggleFavorite}
                    customVoices={customVoices}
                    setCustomVoices={setCustomVoices}
                    setToast={setToast}
                    setPage={setPage}
                    promptState={promptState}
                    setPromptState={setPromptState}
                    customVoiceCategories={customVoiceCategories}
                    setCustomVoiceCategories={setCustomVoiceCategories}
                    activePreset={activePreset}
                  />
                </ErrorBoundary>
              )}
              {page === "soundboard" && (
                <ErrorBoundary>
                  <SoundboardPage
                    state={state}
                    call={call}
                    selected={selected}
                    selectedSound={selectedSound}
                    setSelectedSound={setSelectedSound}
                    setToast={setToast}
                    selectedRecordDevices={selectedRecordDevices}
                    setSelectedRecordDevices={setSelectedRecordDevices}
                    soundboardFavorites={soundboardFavorites}
                    toggleSoundboardFavorite={toggleSoundboardFavorite}
                    updateControls={updateControls}
                    customCategories={customCategories}
                    setCustomCategories={setCustomCategories}
                    promptState={promptState}
                    setPromptState={setPromptState}
                    setMoveCategorySoundId={setMoveCategorySoundId}
                  />
                </ErrorBoundary>
              )}
              {page === "online_library" && (
                <ErrorBoundary>
                  <OnlineSoundsPage
                    state={state}
                    call={call}
                    setToast={setToast}
                    soundboardFavorites={soundboardFavorites}
                    toggleSoundboardFavorite={toggleSoundboardFavorite}
                  />
                </ErrorBoundary>
              )}
              {page === "favoritos" && (
                <ErrorBoundary>
                  <FavoritosPage
                    state={state}
                    call={call}
                    favorites={favorites}
                    toggleFavorite={toggleFavorite}
                    updateControls={updateControls}
                    applyVoicePreset={applyVoicePreset}
                    selectedVoice={selectedVoice}
                    setSelectedVoice={setSelectedVoice}
                    setSelectedSound={setSelectedSound}
                    setPage={setPage}
                    customVoices={customVoices}
                    activePreset={activePreset}
                  />
                </ErrorBoundary>
              )}
              {page === "voicelab" && (
                <ErrorBoundary>
                  <VoiceLabPage
                    state={state}
                    call={call}
                    updateControls={updateControls}
                    updateEffects={updateEffects}
                    customVoices={customVoices}
                    setCustomVoices={setCustomVoices}
                    setToast={setToast}
                    setPage={setPage}
                    customVoiceCategories={customVoiceCategories}
                  />
                </ErrorBoundary>
              )}
              {page === "config" && (
                <ErrorBoundary>
                  <ConfigPage
                    state={state}
                    call={call}
                    setToast={setToast}
                    selectedRecordDevices={selectedRecordDevices}
                    setSelectedRecordDevices={setSelectedRecordDevices}
                    setPage={setPage}
                    accentColor={accentColor}
                    setAccentColor={setAccentColor}
                    customAccentColor={customAccentColor}
                    setCustomAccentColor={setCustomAccentColor}
                    appTheme={appTheme}
                    setAppTheme={setAppTheme}
                    updateEffects={updateEffects}
                    prefFontSize={prefFontSize}
                    setPrefFontSize={setPrefFontSize}
                    prefGlow={prefGlow}
                    setPrefGlow={setPrefGlow}
                    prefRadius={prefRadius}
                    setPrefRadius={setPrefRadius}
                    prefGlass={prefGlass}
                    setPrefGlass={setPrefGlass}
                    prefGamerMode={prefGamerMode}
                    setPrefGamerMode={setPrefGamerMode}
                    prefDockOpacity={prefDockOpacity}
                    setPrefDockOpacity={setPrefDockOpacity}
                  />
                </ErrorBoundary>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Dock */}
      <ErrorBoundary>
        <FloatingDock
          state={state}
          call={call}
          updateControls={updateControls}
          toggleMute={toggleMute}
          activePreset={activePreset}
          processingActive={processingActive}
          lastPlayedSound={lastPlayedSound}
          toggleBypass={toggleBypass}
          bypassActive={bypassActive}
          setPage={setPage}
          soundboardFavorites={soundboardFavorites}
          dockMinimized={dockMinimized}
          setDockMinimized={setDockMinimized}
          setSelectedSound={setSelectedSound}
          forcedPresetId={forcedPresetId}
        />
      </ErrorBoundary>

      {/* Modals */}
      <AnimatePresence>
        {chooseMicOnCloseOpen && (
          <ChooseMicOnCloseModal
            state={state}
            onConfirm={handleConfirmMicOnClose}
            onCancel={() => setChooseMicOnCloseOpen(false)}
          />
        )}
        {closeChoiceOpen && (
          <CloseChoiceModal
            onCancel={() => setCloseChoiceOpen(false)}
            onMinimize={handleMinimizeClose}
            onQuit={handleQuitClose}
          />
        )}
        {userProfileOpen && (
          <UserProfileModal
            onClose={() => setUserProfileOpen(false)}
            onEdit={() => {
              setUserProfileOpen(false);
              setEditProfileOpen(true);
            }}
            profileName={profileName}
            profileSub={profileSub}
            profilePlan={profilePlan}
            profileImage={profileImage}
            profileImagePosition={profileImagePosition}
            profileBio={profileBio}
            profileReadme={profileReadme}
          />
        )}
        {editProfileOpen && (
          <EditProfileModal
            onClose={() => setEditProfileOpen(false)}
            profileName={profileName}
            setProfileName={setProfileName}
            profileSub={profileSub}
            setProfileSub={setProfileSub}
            profilePlan={profilePlan}
            setProfilePlan={setProfilePlan}
            profileImage={profileImage}
            setProfileImage={setProfileImage}
            profileImagePosition={profileImagePosition}
            setProfileImagePosition={setProfileImagePosition}
            profileBio={profileBio}
            setProfileBio={setProfileBio}
            profileReadme={profileReadme}
            setProfileReadme={setProfileReadme}
          />
        )}
        {moveCategorySoundId && (
          <MoveCategoryModal
            soundId={moveCategorySoundId}
            state={state}
            call={call}
            onClose={() => setMoveCategorySoundId(null)}
            setToast={setToast}
            customCategories={customCategories}
            setCustomCategories={setCustomCategories}
          />
        )}
        {promptState && (
          <div className="modalOverlay" onClick={() => setPromptState(null)}>
            <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360, padding: 24 }}>
              <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0 }}>
                <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{promptState.title}</h3>
              </div>
              <div className="modalBody" style={{ padding: 0 }}>
                <input
                  type="text"
                  className="form-control"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--text)",
                    outline: "none",
                    fontSize: 13,
                    fontFamily: "var(--font)",
                    boxSizing: "border-box"
                  }}
                  value={promptState.value}
                  onChange={(e) => {
                    if (!promptState.readOnly) setPromptState({ ...promptState, value: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      promptState.onConfirm(promptState.value);
                      setPromptState(null);
                    }
                  }}
                  readOnly={!!promptState.readOnly}
                  onClick={(e) => {
                    if (promptState.readOnly) e.target.select();
                  }}
                  autoFocus
                />
              </div>
              <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setPromptState(null)}>Cancelar</button>
                <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => {
                  promptState.onConfirm(promptState.value);
                  if (promptState.closeOnConfirm !== false) setPromptState(null);
                }}>{promptState.confirmText || "Confirmar"}</button>
              </div>
            </div>
          </div>
        )}
        {showReleasesModal && (
          <ReleasesModal
            onClose={() => setShowReleasesModal(false)}
            currentVersion={appVersion}
            onUpdateApp={handleUpdateApp}
          />
        )}
        {updateAvailable && (
          <UpdateAlertModal
            onClose={() => setUpdateAvailable(null)}
            latestVersion={updateAvailable.version}
            changelog={updateAvailable.changelog}
            onConfirm={() => {
              handleUpdateApp(updateAvailable.downloadUrl);
              setUpdateAvailable(null);
            }}
          />
        )}
        {state?.youtubeStatus && state.youtubeStatus !== "" && !state.youtubeStatus.startsWith("Concluido") && !state.youtubeStatus.startsWith("Erro") && !state.youtubeStatus.startsWith("Importacao cancelada") && (
          <div className="floating-yt-status">
            <span className="yt-spinner"></span>
            <span>{state.youtubeStatus}</span>
            <button 
              className="btn btn-ghost" 
              style={{ padding: "4px 8px", marginLeft: "auto", minWidth: 0, color: "var(--text-muted)" }}
              onClick={() => fetch("http://127.0.0.1:38717/api/sounds/import-youtube/cancel")}
              title="Cancelar"
            >
              <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg>
            </button>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TTSWidget() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(() => {
    return localStorage.getItem("tts_default_voice") || "pt-BR-AntonioNeural";
  });
  const [speaking, setSpeaking] = useState(false);
  const [showSpeed, setShowSpeed] = useState(true);
  const [showVolume, setShowVolume] = useState(true);
  const [volume, setVolume] = useState(100);
  const [unlimited, setUnlimited] = useState(false);
  const [opacity, setOpacity] = useState(0.82);
  const [keepText, setKeepText] = useState(false);
  const [focusShortcut, setFocusShortcut] = useState("");
  const [rate, setRate] = useState(() => {
    return Number(localStorage.getItem("tts_default_rate") || 0);
  });
  const [appTheme, setAppTheme] = useState(() => {
    return localStorage.getItem("micfudiddo.theme") || "theme-cyberpunk";
  });

  const inputRef = useRef(null);
  const volumeDraggingRef = useRef(false);

  // Apply theme class to widget root
  useEffect(() => {
    const r = document.documentElement;
    r.classList.remove("theme-cyberpunk", "theme-dracula", "theme-vampire", "theme-neon", "theme-synthwave");
    r.classList.add(appTheme);
  }, [appTheme]);

  // Sync theme when localStorage updates
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "micfudiddo.theme" && e.newValue) {
        setAppTheme(e.newValue);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const voicesList = [
    { id: "pt-BR-AntonioNeural", name: "Antonio (Masculina - BR)" },
    { id: "pt-BR-FranciscaNeural", name: "Francisca (Feminina - BR)" },
    { id: "pt-BR-ThalitaNeural", name: "Thalita (Feminina - BR)" },
    { id: "pt-PT-DuarteNeural", name: "Duarte (Masculina - PT)" },
    { id: "pt-PT-RaquelNeural", name: "Raquel (Feminina - PT)" },
    { id: "en-US-GuyNeural", name: "Guy (Masculina - US)" },
    { id: "en-US-AriaNeural", name: "Aria (Feminina - US)" },
    { id: "es-MX-JorgeNeural", name: "Jorge (Masculina - MX)" },
    { id: "es-ES-ElviraNeural", name: "Elvira (Feminina - ES)" },
    { id: "ja-JP-KeitaNeural", name: "Keita (Masculina - JP)" },
    { id: "ja-JP-NanamiNeural", name: "Nanami (Feminina - JP)" },
    { id: "de-DE-ConradNeural", name: "Conrad (Masculina - DE)" },
    { id: "de-DE-KatjaNeural", name: "Katja (Feminina - DE)" }
  ];

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch(`${API}/api/state`);
        const json = await res.json();
        if (json && json.settings) {
          setShowSpeed(json.settings.showTtsWidgetSpeed !== false);
          setShowVolume(json.settings.showTtsWidgetVolume !== false);
          setUnlimited(json.settings.unlimitedTts === true);
          setOpacity((json.settings.ttsWidgetOpacity ?? 82) / 100);
          setKeepText(json.settings.keepTtsTextAfterSpeak === true);
          setFocusShortcut(json.settings.shortcutFocusTtsWidget || "");
          if (!volumeDraggingRef.current) {
            setVolume(Number(json.settings.ttsVolume ?? 100));
          }
        }
      } catch (err) {
        console.error("Error fetching state:", err);
      }
      const currentTheme = localStorage.getItem("micfudiddo.theme") || "theme-cyberpunk";
      setAppTheme(currentTheme);
    };
    fetchSettings();
    const interval = setInterval(fetchSettings, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (window.micfudiddo?.onTtsWidgetFocusInput) {
      return window.micfudiddo.onTtsWidgetFocusInput(() => {
        const focusInput = () => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
          }
        };
        focusInput();
        setTimeout(focusInput, 50);
        setTimeout(focusInput, 150);
      });
    }
  }, []);

  const handleSpeak = async () => {
    if (!text.trim() || speaking) return;

    const lineCount = text.split('\n').length;
    if (lineCount >= 5000) {
      const confirm = window.confirm(`Aviso: O texto contém ${lineCount.toLocaleString()} linhas. A geração do áudio pode demorar bastante. Deseja continuar mesmo assim?`);
      if (!confirm) return;
    }

    const ttsText = text.trim();
    if (!keepText) {
      setText("");
    } else {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(text.length, text.length);
      }
    }

    setSpeaking(true);
    const formattedRate = rate >= 0 ? `+${rate}%` : `${rate}%`;
    try {
      await fetch(`${API}/api/tts/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ttsText,
          voice: selectedVoice,
          rate: formattedRate
        })
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSpeaking(false);
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

  const handleVolumeChange = async (val) => {
    setVolume(val);
    try {
      await fetch(`${API}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ttsVolume: val })
      });
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "8px 12px",
      height: (showSpeed || showVolume) ? "88px" : "60px",
      width: "100vw",
      borderRadius: "16px",
      background: `rgba(10, 18, 30, ${opacity})`,
      backdropFilter: "blur(20px)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      boxSizing: "border-box",
      overflow: "hidden",
      gap: "6px",
      color: "#f3f4f6",
      fontFamily: "system-ui, sans-serif"
    }}>
      {/* Row 1: Controls */}
      <div style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        width: "100%",
        gap: "8px",
        height: "36px"
      }}>
        {/* Drag Handle */}
        <div 
          title="Arraste para mover" 
          style={{
            cursor: "move",
            width: "18px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "3px",
            padding: "0 4px",
            color: "rgba(255, 255, 255, 0.25)",
            WebkitAppRegion: "drag",
            userSelect: "none"
          }}
        >
          <div style={{ display: "flex", gap: "3px" }}><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div></div>
          <div style={{ display: "flex", gap: "3px" }}><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div></div>
          <div style={{ display: "flex", gap: "3px" }}><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div><div style={{ width: "3px", height: "3px", background: "currentColor", borderRadius: "50%" }}></div></div>
        </div>

        {/* Voice Select */}
        <select 
          value={selectedVoice} 
          onChange={handleVoiceChange}
          style={{
            WebkitAppRegion: "no-drag",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "6px",
            color: "#fff",
            padding: "6px 8px",
            fontSize: "12px",
            maxWidth: "110px",
            cursor: "pointer",
            outline: "none"
          }}
        >
          {voicesList.map(v => (
            <option key={v.id} value={v.id} style={{ background: "#0a121e", color: "#fff" }}>
              {v.name}
            </option>
          ))}
        </select>

        {/* Input Field with Character Limit & Counter */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", position: "relative", WebkitAppRegion: "no-drag" }}>
          <input 
            ref={inputRef}
            type="text" 
            autoFocus
            placeholder={focusShortcut ? `Digite para falar... (${focusShortcut} para escrever)` : "Digite para falar..."} 
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSpeak();
              } else if (e.key === "Escape") {
                window.micfudiddo?.closeTtsWidget();
              }
            }}
            {...(!unlimited ? { maxLength: TTS_CHARACTER_LIMIT } : {})}
            style={{
              width: "100%",
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "6px",
              color: "#fff",
              padding: "6px 50px 6px 12px",
              fontSize: "12px",
              outline: "none"
            }}
          />
          <span style={{
            position: "absolute",
            right: "10px",
            fontSize: "10px",
            color: "rgba(255, 255, 255, 0.4)",
            pointerEvents: "none"
          }}>
            {text.length}{unlimited ? "" : `/${TTS_CHARACTER_LIMIT}`}
          </span>
        </div>

        {/* Speak Button */}
        <button 
          onClick={handleSpeak}
          disabled={speaking}
          style={{
            WebkitAppRegion: "no-drag",
            background: speaking ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg, #a855f7, #7c3aed)",
            border: "none",
            borderRadius: "6px",
            color: "#fff",
            padding: "6px 12px",
            fontSize: "12px",
            fontWeight: "bold",
            cursor: speaking ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            outline: "none"
          }}
        >
          <span>{speaking ? "📢" : "Falar"}</span>
        </button>

        {/* Close Button */}
        <button 
          onClick={() => window.micfudiddo?.closeTtsWidget()}
          style={{
            WebkitAppRegion: "no-drag",
            background: "none",
            border: "none",
            color: "rgba(255, 255, 255, 0.4)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "24px",
            height: "24px",
            borderRadius: "4px",
            outline: "none"
          }}
          title="Fechar Widget"
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"; e.currentTarget.style.color = "#ef4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"></path></svg>
        </button>
      </div>

      {/* Row 2: Speed and Volume Sliders */}
      {(showSpeed || showVolume) && (
        <div style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          width: "100%",
          gap: "16px",
          paddingLeft: "26px",
          paddingRight: "32px",
          height: "24px",
          WebkitAppRegion: "no-drag"
        }}>
          {showSpeed && (
            <div style={{ display: "flex", flex: 1, flexDirection: "row", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", whiteSpace: "nowrap" }}>
                Velocidade:
              </span>
              <input
                type="range"
                min={-95}
                max={200}
                step={5}
                value={rate}
                onChange={(e) => handleRateChange(Number(e.target.value))}
                style={{
                  flex: 1,
                  height: "4px",
                  accentColor: "#a855f7",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  outline: "none"
                }}
              />
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.7)", minWidth: "35px", textAlign: "right" }}>
                {rate >= 0 ? `+${rate}%` : `${rate}%`}
              </span>
            </div>
          )}
          {showVolume && (
            <div style={{ display: "flex", flex: 1, flexDirection: "row", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", whiteSpace: "nowrap" }}>
                Volume:
              </span>
              <input
                type="range"
                min={0}
                max={200}
                step={5}
                value={volume}
                onMouseDown={() => { volumeDraggingRef.current = true; }}
                onMouseUp={() => { volumeDraggingRef.current = false; }}
                onTouchStart={() => { volumeDraggingRef.current = true; }}
                onTouchEnd={() => { volumeDraggingRef.current = false; }}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                style={{
                  flex: 1,
                  height: "4px",
                  accentColor: "#a855f7",
                  cursor: "pointer",
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  outline: "none"
                }}
              />
              <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.7)", minWidth: "35px", textAlign: "right" }}>
                {volume}%
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const isTtsWidget = window.location.search.includes("widget=tts");

const container = document.getElementById("root");
const root = createRoot(container);
if (isTtsWidget) {
  // Override background colors of root elements to enable transparent window corners
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  if (container) container.style.background = "transparent";
  
  root.render(<TTSWidget />);
} else {
  root.render(<App />);
}
