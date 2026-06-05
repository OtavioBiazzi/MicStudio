import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Broadcast,
  CaretDown,
  CaretUp,
  Cards,
  ChartBar,
  CheckCircle,
  Circuitry,
  Copy,
  DotsThreeVertical,
  Export,
  FadersHorizontal,
  FloppyDisk,
  Flask,
  FolderOpen,
  GearSix,
  Ghost,
  Hexagon,
  House,
  Keyboard,
  Lightning,
  MagicWand,
  MagnifyingGlass,
  Megaphone,
  Microphone,
  MicrophoneSlash,
  MicrophoneStage,
  Minus,
  MusicNotes,
  Palette, Pencil,
  PauseCircle,
  Pause,
  Phone,
  Play,
  PushPin,
  Plus,
  Radio,
  Record,
  Robot,
  Scissors,
  Shuffle,
  SlidersHorizontal,
  Sparkle,
  SpeakerHigh,
  SpeakerSlash,
  Star,
  SignOut,
  Square,
  StopCircle,
  Sun,
  Trash,
  UploadSimple,
  WaveSawtooth,
  WaveSine,
  Waveform,
  X,
  XCircle,
  YoutubeLogo
} from "@phosphor-icons/react";
import "./styles.css";

/* ============================================================
   CONSTANTS & DATA
   ============================================================ */

const API = "http://127.0.0.1:38717";

// Dynamically import all voice images from assets/voices/
const voiceImageModules = import.meta.glob("../assets/voices/*.png", { eager: true, import: "default" });
function getVoiceImage(id) {
  for (const [path, url] of Object.entries(voiceImageModules)) {
    if (path.includes(`/${id}.`)) return url;
  }
  return null;
}

const pages = [
  { id: "vozes", label: "Vozes", icon: MicrophoneStage },
  { id: "soundboard", label: "Soundboard", icon: MusicNotes },
  { id: "online_library", label: "Explorar Sons", icon: Broadcast },
  { id: "favoritos", label: "Favoritos", icon: Star },
  { id: "voicelab", label: "Voice Lab", icon: Flask },
  { id: "config", label: "Configurações", icon: GearSix }
];

const voiceCategories = [
  "Todas", "Favoritas", "Recentes", "Reverb", "Fina e Aguda", "Grave", "Robótica", "Música", "Rádio", "Humor", "Monstros", "Jogos e Streaming", "Avançados", "Exclusivos", "Especiais", "Customizadas"
];

export const colorPalettes = {
  purple: {
    label: "Violeta Cyber",
    primary: "#8B5CF6",
    hover: "#A78BFA",
    dim: "#6D42D9",
    glow: "rgba(139, 92, 246, 0.35)",
    soft: "rgba(139, 92, 246, 0.12)",
    bg: "rgba(139, 92, 246, 0.08)",
    borderHover: "rgba(139, 92, 246, 0.25)",
    borderActive: "rgba(139, 92, 246, 0.5)"
  },
  cyan: {
    label: "Ciano Neon",
    primary: "#00E5FF",
    hover: "#33EBFF",
    dim: "#00B8D4",
    glow: "rgba(0, 229, 255, 0.35)",
    soft: "rgba(0, 229, 255, 0.12)",
    bg: "rgba(0, 229, 255, 0.08)",
    borderHover: "rgba(0, 229, 255, 0.25)",
    borderActive: "rgba(0, 229, 255, 0.5)"
  },
  green: {
    label: "Esmeralda",
    primary: "#10B981",
    hover: "#34D399",
    dim: "#059669",
    glow: "rgba(16, 185, 129, 0.35)",
    soft: "rgba(16, 185, 129, 0.12)",
    bg: "rgba(16, 185, 129, 0.08)",
    borderHover: "rgba(16, 185, 129, 0.25)",
    borderActive: "rgba(16, 185, 129, 0.5)"
  },
  gold: {
    label: "Ouro Âmbar",
    primary: "#F59E0B",
    hover: "#FBBF24",
    dim: "#D97706",
    glow: "rgba(245, 158, 11, 0.35)",
    soft: "rgba(245, 158, 11, 0.12)",
    bg: "rgba(245, 158, 11, 0.08)",
    borderHover: "rgba(245, 158, 11, 0.25)",
    borderActive: "rgba(245, 158, 11, 0.5)"
  },
  red: {
    label: "Rubi Carmim",
    primary: "#EF4444",
    hover: "#F87171",
    dim: "#DC2626",
    glow: "rgba(239, 68, 68, 0.35)",
    soft: "rgba(239, 68, 68, 0.12)",
    bg: "rgba(239, 68, 68, 0.08)",
    borderHover: "rgba(239, 68, 68, 0.25)",
    borderActive: "rgba(239, 68, 68, 0.5)"
  },
  pink: {
    label: "Rosa Choque",
    primary: "#EC4899",
    hover: "#F472B6",
    dim: "#DB2777",
    glow: "rgba(236, 72, 153, 0.35)",
    soft: "rgba(236, 72, 153, 0.12)",
    bg: "rgba(236, 72, 153, 0.08)",
    borderHover: "rgba(236, 72, 153, 0.25)",
    borderActive: "rgba(236, 72, 153, 0.5)"
  }
};

const voicePresets = [
  {
    id: "clean", label: "Sem efeito", description: "Voz limpa, ganho normal e efeitos desligados.",
    emoji: "🎙️", category: "Humanos", gradient: "linear-gradient(135deg, #1a2a3a, #0d1820)",
    gain: 1, pitch: 0, effects: {}
  },
  {
    id: "personalizado", label: "Personalizado", description: "Controle e edite efeitos de voz livremente em tempo real.",
    emoji: "🎛️", category: "Todas", gradient: "linear-gradient(135deg, #a855f7, #06b6d4)",
    gain: 1, pitch: 0, effects: {}
  },
  // --- Reverb e Ambiência ---
  {
    id: "reverb_leve", label: "Reverb Leve", description: "Um reverb sutil para dar ar e brilho de forma polida.",
    emoji: "✨", category: "Reverb", gradient: "linear-gradient(135deg, #2a2a3a, #4a4a5a)",
    gain: 2.0, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.15 }
  },
  {
    id: "reverb_sala", label: "Reverb de Sala", description: "Simula o espaço acústico de uma sala pequena.",
    emoji: "🏠", category: "Reverb", gradient: "linear-gradient(135deg, #1a2a3a, #3a3a4a)",
    gain: 2.2, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "reverb_auditorio", label: "Reverb de Auditório", description: "Espaço amplo com reflexões longas e limpas.",
    emoji: "🏛️", category: "Reverb", gradient: "linear-gradient(135deg, #0d2a3a, #1a4a5a)",
    gain: 2.5, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.65 }
  },
  {
    id: "reverb_catedral", label: "Reverb de Catedral", description: "Presença enorme com reverb de caimento longo.",
    emoji: "⛪", category: "Reverb", gradient: "linear-gradient(135deg, #2a0d3a, #4a1a5a)",
    gain: 2.8, pitch: 0, effects: { reverb_enabled: true, reverb_mix: 0.88 }
  },
  {
    id: "eco_simples", label: "Eco Simples", description: "Eco clássico com tempo de decaimento natural.",
    emoji: "🗣️", category: "Reverb", gradient: "linear-gradient(135deg, #1a3a2a, #2a5a3a)",
    gain: 2.0, pitch: 0, effects: { echo_enabled: true, echo_mix: 0.35 }
  },
  {
    id: "eco_profundo", label: "Eco Profundo", description: "Ecos longos e repetitivos que preenchem o ambiente.",
    emoji: "⛰️", category: "Reverb", gradient: "linear-gradient(135deg, #1a1a3a, #2a2a5a)",
    gain: 2.4, pitch: 0, effects: { echo_enabled: true, echo_mix: 0.7, reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "delay_sfx", label: "Delay", description: "Delay estéreo clássico para dar dimensão à fala.",
    emoji: "⏳", category: "Reverb", gradient: "linear-gradient(135deg, #3a2a0d, #5a4a1a)",
    gain: 2.2, pitch: 0, effects: { delay_enabled: true, delay_mix: 0.55 }
  },
  // --- Voz Fina e Aguda ---
  {
    id: "voz_feminina", label: "Voz Feminina", description: "Pitch shift agudo calibrado com chorus suave.",
    emoji: "👩", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #ec4899, #f43f5e)",
    gain: 2.5, pitch: 4, effects: { chorus_enabled: true, chorus_mix: 0.18 }
  },
  {
    id: "voz_infantil", label: "Voz Infantil", description: "Voz fina, comprimida e com características infantis.",
    emoji: "👶", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #38bdf8, #0ea5e9)",
    gain: 2.4, pitch: 8, effects: { compressor_enabled: true, compressor_amount: 0.35 }
  },
  {
    id: "voz_aguda_extrema", label: "Voz Aguda Extrema", description: "Agudo máximo com formante metalizado.",
    emoji: "⚡", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #f59e0b, #e11d48)",
    gain: 2.8, pitch: 16, effects: { robot_enabled: true, robot_rate_hz: 60 }
  },
  {
    id: "esquilo", label: "Esquilo", description: "Esquilo clássico super agudo e rápido.",
    emoji: "🐿️", category: "Fina e Aguda", gradient: "linear-gradient(135deg, #b45309, #d97706)",
    gain: 2.5, pitch: 12, effects: { robot_enabled: true, robot_rate_hz: 52, bitcrush_enabled: true, bitcrush_bits: 4 }
  },
  // --- Anime ---
  {
    id: "voz_anime", label: "Voz Anime", description: "Voz super fina, fofa e brilhante no estilo anime japonês.",
    emoji: "🌸", category: "Anime", gradient: "linear-gradient(135deg, #ff9a9e, #fecfef)",
    gain: 2.8, pitch: 9, effects: { chorus_enabled: true, chorus_mix: 0.25, compressor_enabled: true, compressor_amount: 0.5, reverb_enabled: true, reverb_mix: 0.15 }
  },
  {
    id: "voz_miku", label: "Vocaloid Miku", description: "Sintetizador de voz fofo inspirado na Hatsune Miku.",
    emoji: "🎤", category: "Anime", gradient: "linear-gradient(135deg, #06b6d4, #ff79c6)",
    gain: 2.8, pitch: 10, effects: { robot_enabled: true, robot_rate_hz: 180, chorus_enabled: true, chorus_mix: 0.45, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "voz_chibi", label: "Voz Chibi", description: "Voz super aguda e infantilizada, estilo desenho animado fofo.",
    emoji: "✨", category: "Anime", gradient: "linear-gradient(135deg, #ff758c, #ff7eb3)",
    gain: 2.7, pitch: 11, effects: { chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.6 }
  },
  // --- Voz Grave ---
  {
    id: "voz_masculina_profunda", label: "Masculino Profundo", description: "Um grave robusto e imponente de locução.",
    emoji: "🧔", category: "Grave", gradient: "linear-gradient(135deg, #1e293b, #0f172a)",
    gain: 2.6, pitch: -4, effects: { compressor_enabled: true, compressor_amount: 0.35 }
  },
  {
    id: "narrador", label: "Narrador de Cinema", description: "Voz de cinema cheia, profunda e comprimida.",
    emoji: "🎭", category: "Grave", gradient: "linear-gradient(135deg, #475569, #334155)",
    gain: 2.8, pitch: -3, effects: { compressor_enabled: true, compressor_amount: 0.72, chorus_enabled: true, chorus_mix: 0.14 }
  },
  {
    id: "gigante", label: "Gigante", description: "Grave extremo com reverb cavernoso de presença gigantesca.",
    emoji: "🧌", category: "Grave", gradient: "linear-gradient(135deg, #3f6212, #166534)",
    gain: 3.5, pitch: -10, effects: { demon_enabled: true, demon_drive: 3.0, reverb_enabled: true, reverb_mix: 0.38 }
  },
  {
    id: "voz_cinematografica", label: "Voz Cinematográfica", description: "Voz épica cheia de graves, ideal para trailers.",
    emoji: "🎬", category: "Grave", gradient: "linear-gradient(135deg, #111827, #1f2937)",
    gain: 3.0, pitch: -5, effects: { compressor_enabled: true, compressor_amount: 0.8, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "monstro_grave", label: "Monstro Grave", description: "Modulação bestial grave para criaturas e monstros.",
    emoji: "👹", category: "Grave", gradient: "linear-gradient(135deg, #7f1d1d, #991b1b)",
    gain: 3.8, pitch: -8, effects: { demon_enabled: true, demon_drive: 6.0, distortion_enabled: true, distortion_drive: 6 }
  },
  // --- Robótica ---
  {
    id: "robo_classico", label: "Robô Clássico", description: "Robô sci-fi clássico com modulação de frequência de 42Hz.",
    emoji: "🤖", category: "Robótica", gradient: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
    gain: 3.2, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 42, telephone_enabled: true, telephone_mix: 0.58 }
  },
  {
    id: "android", label: "Android", description: "Voz cibernética android com flanger metalizado.",
    emoji: "⚙️", category: "Robótica", gradient: "linear-gradient(135deg, #4b5563, #374151)",
    gain: 3.4, pitch: 1, effects: { robot_enabled: true, robot_rate_hz: 80, flanger_enabled: true, flanger_mix: 0.4 }
  },
  {
    id: "ia_futurista", label: "IA Futurista", description: "Voz de inteligência artificial limpa e sintetizada.",
    emoji: "🧠", category: "Robótica", gradient: "linear-gradient(135deg, #06b6d4, #0891b2)",
    gain: 3.0, pitch: 2, effects: { robot_enabled: true, robot_rate_hz: 110, chorus_enabled: true, chorus_mix: 0.3, reverb_enabled: true, reverb_mix: 0.2 }
  },
  {
    id: "cyberpunk", label: "Cyborg Cyberpunk", description: "Modulação meia máquina, meio humano estourada.",
    emoji: "🦾", category: "Robótica", gradient: "linear-gradient(135deg, #6b21a8, #7e22ce)",
    gain: 3.8, pitch: -1, effects: { radio_enabled: true, radio_mix: 0.58, flanger_enabled: true, flanger_mix: 0.28, chorus_enabled: true, chorus_mix: 0.32 }
  },
  {
    id: "radio_robotica", label: "Rádio Robótica", description: "Robô falando através de rádio militar antigo.",
    emoji: "📟", category: "Robótica", gradient: "linear-gradient(135deg, #14532d, #15803d)",
    gain: 3.6, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 35, radio_enabled: true, radio_mix: 0.8 }
  },
  // --- Beatbox e Música ---
  {
    id: "beatbox_leve", label: "Beatbox Leve", description: "EQ forte com presença de subgraves para ritmos de voz.",
    emoji: "🎙️", category: "Música", gradient: "linear-gradient(135deg, #065f46, #047857)",
    gain: 2.8, pitch: 0, effects: { equalizer_enabled: true, equalizer_tone: 0.75, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "beatbox_avancado", label: "Beatbox Avançado", description: "Comprimido e saturado para simular batida de estúdio.",
    emoji: "🥁", category: "Música", gradient: "linear-gradient(135deg, #0f766e, #115e59)",
    gain: 3.2, pitch: -2, effects: { equalizer_enabled: true, equalizer_tone: 0.85, compressor_enabled: true, compressor_amount: 0.85, distortion_enabled: true, distortion_drive: 2 }
  },
  {
    id: "beatbox_eletronico", label: "Beatbox Eletrônico", description: "Ritmo com modulação robótica que imita bateria eletrônica.",
    emoji: "🎹", category: "Música", gradient: "linear-gradient(135deg, #1e1b4b, #312e81)",
    gain: 3.2, pitch: 0, effects: { robot_enabled: true, robot_rate_hz: 90, compressor_enabled: true, compressor_amount: 0.7 }
  },
  {
    id: "autotune", label: "Auto-Tune", description: "Efeito pop-trap digital de sintonia vocal.",
    emoji: "🎵", category: "Música", gradient: "linear-gradient(135deg, #ec4899, #d946ef)",
    gain: 2.8, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.5, reverb_enabled: true, reverb_mix: 0.35, compressor_enabled: true, compressor_amount: 0.5 }
  },
  {
    id: "cantor_pop", label: "Cantor Pop", description: "Voz ultra polida com reverb e chorus de estúdio pop.",
    emoji: "🎤", category: "Música", gradient: "linear-gradient(135deg, #ec4899, #a855f7)",
    gain: 2.8, pitch: 1, effects: { chorus_enabled: true, chorus_mix: 0.25, reverb_enabled: true, reverb_mix: 0.2, compressor_enabled: true, compressor_amount: 0.45 }
  },
  {
    id: "cantor_trap", label: "Cantor Trap", description: "Modulador forte de formante com delay ideal para trap.",
    emoji: "💸", category: "Música", gradient: "linear-gradient(135deg, #030712, #1f2937)",
    gain: 3.0, pitch: -1, effects: { robot_enabled: true, robot_rate_hz: 120, echo_enabled: true, echo_mix: 0.4, delay_enabled: true, delay_mix: 0.4 }
  },
  {
    id: "cantor_rock", label: "Cantor Rock", description: "Leve saturação e compressão para voz rock rasgada.",
    emoji: "🎸", category: "Música", gradient: "linear-gradient(135deg, #1c1917, #44403c)",
    gain: 3.0, pitch: 0, effects: { distortion_enabled: true, distortion_drive: 3.5, chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "harmonizador", label: "Harmonizador", description: "Adiciona sub-vozes para criar harmonia estéreo.",
    emoji: "🎼", category: "Música", gradient: "linear-gradient(135deg, #0891b2, #4f46e5)",
    gain: 3.0, pitch: 0, effects: { chorus_enabled: true, chorus_mix: 0.6, flanger_enabled: true, flanger_mix: 0.3, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "coral_automatico", label: "Coral Automático", description: "Chorus extremo com reverb longo simulando coral.",
    emoji: "🏛️", category: "Música", gradient: "linear-gradient(135deg, #312e81, #4338ca)",
    gain: 3.2, pitch: 3, effects: { chorus_enabled: true, chorus_mix: 0.8, reverb_enabled: true, reverb_mix: 0.5, delay_enabled: true, delay_mix: 0.3 }
  },
  // --- Rádio e Comunicação ---
  {
    id: "radio_policial", label: "Rádio Policial", description: "Rádio com bitcrush e gate de ruído cortado.",
    emoji: "🚓", category: "Rádio", gradient: "linear-gradient(135deg, #1d4ed8, #1e40af)",
    gain: 5.0, pitch: -1, effects: { radio_enabled: true, radio_mix: 0.9, bitcrush_enabled: true, bitcrush_bits: 6, noise_gate_enabled: true, noise_gate_threshold: 0.15 }
  },
  {
    id: "walkie_talkie", label: "Walkie-Talkie", description: "Comunicação de curto alcance seca e estreita.",
    emoji: "📳", category: "Rádio", gradient: "linear-gradient(135deg, #14532d, #166534)",
    gain: 4.8, pitch: 0, effects: { radio_enabled: true, radio_mix: 0.8, telephone_enabled: true, telephone_mix: 0.7, bitcrush_enabled: true, bitcrush_bits: 7 }
  },
  {
    id: "megafone", label: "Megafone", description: "Megafone clássico de voz gritante e distorcida.",
    emoji: "📣", category: "Rádio", gradient: "linear-gradient(135deg, #7c2d12, #9a3412)",
    gain: 10.0, pitch: 1, effects: { megaphone_enabled: true, megaphone_drive: 9, distortion_enabled: true, distortion_drive: 12 }
  },
  {
    id: "radio_militar", label: "Rádio Militar", description: "Walkie militar com alta saturação e clipping.",
    emoji: "🪖", category: "Rádio", gradient: "linear-gradient(135deg, #27270a, #3f3f12)",
    gain: 5.5, pitch: -2, effects: { radio_enabled: true, radio_mix: 0.95, telephone_enabled: true, telephone_mix: 0.85, distortion_enabled: true, distortion_drive: 4 }
  },
  {
    id: "interfone", label: "Interfone", description: "Interfone telefônico de condomínio antigo.",
    emoji: "📞", category: "Rádio", gradient: "linear-gradient(135deg, #2a2a1a, #4a3a2a)",
    gain: 4.0, pitch: 0, effects: { telephone_enabled: true, telephone_mix: 0.9, bitcrush_enabled: true, bitcrush_bits: 7, compressor_enabled: true, compressor_amount: 0.48 }
  },
  // --- Humor ---
  {
    id: "helium", label: "Gás Hélio", description: "Efeito clássico de balão de hélio super agudo.",
    emoji: "🎈", category: "Humor", gradient: "linear-gradient(135deg, #f43f5e, #fda4af)",
    gain: 2.6, pitch: 14, effects: { compressor_enabled: true, compressor_amount: 0.22 }
  },
  {
    id: "voz_lenta_exagerada", label: "Voz Lenta", description: "Grave lento com tremolo de decaimento longo.",
    emoji: "🐌", category: "Humor", gradient: "linear-gradient(135deg, #78350f, #92400e)",
    gain: 2.2, pitch: -6, effects: { tremolo_enabled: true, tremolo_rate_hz: 4 }
  },
  {
    id: "voz_acelerada", label: "Voz Acelerada", description: "Voz rápida, aguda e trêmula de energia.",
    emoji: "🏃", category: "Humor", gradient: "linear-gradient(135deg, #047857, #059669)",
    gain: 2.4, pitch: 6, effects: { tremolo_enabled: true, tremolo_rate_hz: 18 }
  },
  {
    id: "voz_engracada", label: "Voz Engraçada", description: "Modulação de vibrato (wobble) para palhaçada.",
    emoji: "🤡", category: "Humor", gradient: "linear-gradient(135deg, #ea580c, #f97316)",
    gain: 2.5, pitch: 5, effects: { wobble_enabled: true, wobble_mix: 0.45, flanger_enabled: true, flanger_mix: 0.3 }
  },
  {
    id: "voz_caricata", label: "Voz Caricata", description: "Voz caricata trêmula esticada no limite.",
    emoji: "🤪", category: "Humor", gradient: "linear-gradient(135deg, #a855f7, #c084fc)",
    gain: 2.5, pitch: 7, effects: { robot_enabled: true, robot_rate_hz: 75, wobble_enabled: true, wobble_mix: 0.35 }
  },
  // --- Monstros e Fantasia ---
  {
    id: "demonio", label: "Demônio", description: "Grave de demônio com distorção e reverb.",
    emoji: "👹", category: "Monstros", gradient: "linear-gradient(135deg, #4a1a1a, #6a2a2a)",
    gain: 4.0, pitch: -9, effects: { demon_enabled: true, demon_drive: 5.8, distortion_enabled: true, distortion_drive: 5, reverb_enabled: true, reverb_mix: 0.32 }
  },
  {
    id: "ghost", label: "Fantasma", description: "Voz fria do além com eco reverso e reverb longo.",
    emoji: "👻", category: "Monstros", gradient: "linear-gradient(135deg, #1e1b4b, #312e81)",
    gain: 3.4, pitch: -2, effects: { ghost_enabled: true, ghost_mix: 0.52, reverse_enabled: true, reverse_mix: 0.24, reverb_enabled: true, reverb_mix: 0.35 }
  },
  {
    id: "dragao", label: "Dragão Ancestral", description: "Grave e rugido extremo com saturação forte.",
    emoji: "🐉", category: "Monstros", gradient: "linear-gradient(135deg, #451a03, #78350f)",
    gain: 4.2, pitch: -12, effects: { demon_enabled: true, demon_drive: 8.0, distortion_enabled: true, distortion_drive: 8, reverb_enabled: true, reverb_mix: 0.45 }
  },
  {
    id: "orc", label: "Orc Brutal", description: "Presença monstruosa e gutural rústica.",
    emoji: "🧌", category: "Monstros", gradient: "linear-gradient(135deg, #3f4911, #4d5d14)",
    gain: 3.8, pitch: -6, effects: { demon_enabled: true, demon_drive: 4.0, distortion_enabled: true, distortion_drive: 10, compressor_enabled: true, compressor_amount: 0.6 }
  },
  {
    id: "alien", label: "Alienígena", description: "Modulação espacial glitch, ideal para ficção científica.",
    emoji: "👽", category: "Monstros", gradient: "linear-gradient(135deg, #064e3b, #047857)",
    gain: 3.0, pitch: 5, effects: { alien_enabled: true, alien_rate_hz: 104, alien_glitch_enabled: true, alien_glitch_mix: 0.76, reverse_enabled: true, reverse_mix: 0.42 }
  },
  {
    id: "criatura_sombria", label: "Criatura Sombria", description: "Sussurro fantasmagórico misturado com grave demoníaco.",
    emoji: "👾", category: "Monstros", gradient: "linear-gradient(135deg, #111827, #1f2937)",
    gain: 3.8, pitch: -7, effects: { whisper_enabled: true, whisper_mix: 0.6, demon_enabled: true, demon_drive: 3.5, reverb_enabled: true, reverb_mix: 0.4 }
  },
  // --- Jogos e Streaming ---
  {
    id: "narrador_trailer", label: "Narrador de Trailer", description: "Narrador dramático de cinema de ação.",
    emoji: "🎥", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #090d16, #151c2d)",
    gain: 3.0, pitch: -4, effects: { compressor_enabled: true, compressor_amount: 0.9, reverb_enabled: true, reverb_mix: 0.2 }
  },
  {
    id: "streamer", label: "Streamer Pro", description: "Voz com muita presença, limpa e altamente comprimida.",
    emoji: "🎙️", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #111827, #0369a1)",
    gain: 2.6, pitch: -1, effects: { compressor_enabled: true, compressor_amount: 0.55, equalizer_enabled: true, equalizer_tone: 0.65, noise_gate_enabled: true, noise_gate_threshold: 0.12 }
  },
  {
    id: "npc", label: "NPC de Jogo", description: "Voz limpa e repetitiva de aldeão com chorus leve.",
    emoji: "🤖", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #78350f, #b45309)",
    gain: 2.5, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.2, compressor_enabled: true, compressor_amount: 0.3 }
  },
  {
    id: "vilao", label: "Vilão Supremo", description: "Voz fria, ameaçadora com reverb cavernoso e grave.",
    emoji: "🦹", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #581c87, #4c1d95)",
    gain: 3.5, pitch: -5, effects: { demon_enabled: true, demon_drive: 3.5, compressor_enabled: true, compressor_amount: 0.6, reverb_enabled: true, reverb_mix: 0.25 }
  },
  {
    id: "heroi", label: "Herói Lendário", description: "Voz inspiradora com chorus brilhante e reverb leve.",
    emoji: "🦸", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #1d4ed8, #2563eb)",
    gain: 2.8, pitch: -2, effects: { compressor_enabled: true, compressor_amount: 0.5, chorus_enabled: true, chorus_mix: 0.15, reverb_enabled: true, reverb_mix: 0.1 }
  },
  {
    id: "locutor_esports", label: "Locutor de eSports", description: "Presença brilhante de EQ com compressão limpa de rádio esportivo.",
    emoji: "🎮", category: "Jogos e Streaming", gradient: "linear-gradient(135deg, #065f46, #0f766e)",
    gain: 2.8, pitch: -2, effects: { compressor_enabled: true, compressor_amount: 0.8, equalizer_enabled: true, equalizer_tone: 0.75 }
  },
  // --- Efeitos Exclusivos Cyber/Glitch ---
  {
    id: "voz_glitch", label: "Glitch Cibernético", description: "Modulação de glitch estourada com bitcrush cibernético.",
    emoji: "📟", category: "Exclusivos", gradient: "linear-gradient(135deg, #1f2937, #dc2626)",
    gain: 3.5, pitch: 2, effects: { alien_glitch_enabled: true, alien_glitch_mix: 0.9, wobble_enabled: true, wobble_mix: 0.6, bitcrush_enabled: true, bitcrush_bits: 4 }
  },
  {
    id: "voz_holografica", label: "Holograma Sci-Fi", description: "Chorus/Flanger misturado com sussurro do além.",
    emoji: "💿", category: "Exclusivos", gradient: "linear-gradient(135deg, #0891b2, #0d9488)",
    gain: 3.2, pitch: 3, effects: { flanger_enabled: true, flanger_mix: 0.5, chorus_enabled: true, chorus_mix: 0.4, reverb_enabled: true, reverb_mix: 0.4, whisper_enabled: true, whisper_mix: 0.3 }
  },
  {
    id: "voz_dimensao_paralela", label: "Dimensão Paralela", description: "Voz invertida com reverb longo e ecos fantasmagóricos.",
    emoji: "🌀", category: "Exclusivos", gradient: "linear-gradient(135deg, #312e81, #1e1b4b)",
    gain: 3.0, pitch: -3, effects: { reverse_enabled: true, reverse_mix: 0.55, ghost_enabled: true, ghost_mix: 0.45, reverb_enabled: true, reverb_mix: 0.5 }
  },
  {
    id: "voz_sonho", label: "Voz de Sonho", description: "Reverb enorme com delay modulado para ambiente etéreo.",
    emoji: "💭", category: "Exclusivos", gradient: "linear-gradient(135deg, #db2777, #c084fc)",
    gain: 2.8, pitch: 2, effects: { chorus_enabled: true, chorus_mix: 0.5, reverb_enabled: true, reverb_mix: 0.6, delay_enabled: true, delay_mix: 0.45 }
  },
  {
    id: "voz_corrompida", label: "Sistema Corrompido", description: "Distorção máxima com bitcrush analógico agressivo.",
    emoji: "⚠️", category: "Exclusivos", gradient: "linear-gradient(135deg, #7f1d1d, #450a0a)",
    gain: 5.0, pitch: -5, effects: { distortion_enabled: true, distortion_drive: 12.0, bitcrush_enabled: true, bitcrush_bits: 3, radio_enabled: true, radio_mix: 0.7 }
  },
  {
    id: "voz_fantasma_digital", label: "Fantasma Digital", description: "Eco flutuante digital modulado por robotizador.",
    emoji: "👻", category: "Exclusivos", gradient: "linear-gradient(135deg, #1e1b4b, #4f46e5)",
    gain: 3.4, pitch: 1, effects: { ghost_enabled: true, ghost_mix: 0.6, robot_enabled: true, robot_rate_hz: 95, reverb_enabled: true, reverb_mix: 0.3 }
  },
  {
    id: "voz_entidade", label: "Entidade Divina", description: "Voz demoníaca misturada com sussurro de subgraves e reverb longo.",
    emoji: "🔮", category: "Exclusivos", gradient: "linear-gradient(135deg, #090514, #1c0e35)",
    gain: 4.0, pitch: -8, effects: { demon_enabled: true, demon_drive: 6.0, whisper_enabled: true, whisper_mix: 0.4, reverb_enabled: true, reverb_mix: 0.45 }
  },
  {
    id: "voz_interestelar", label: "Interestelar", description: "Modulação de astronauta espacial com delay e flanger longo.",
    emoji: "🛸", category: "Exclusivos", gradient: "linear-gradient(135deg, #051622, #0d3856)",
    gain: 3.2, pitch: 4, effects: { alien_enabled: true, alien_rate_hz: 120, flanger_enabled: true, flanger_mix: 0.4, reverb_enabled: true, reverb_mix: 0.45, delay_enabled: true, delay_mix: 0.35 }
  },
  {
    id: "voz_retro_80s", label: "Retrô Anos 80", description: "Efeito synthpop clássico de chorus com delay modulado.",
    emoji: "📼", category: "Exclusivos", gradient: "linear-gradient(135deg, #a21caf, #f43f5e)",
    gain: 2.8, pitch: 1, effects: { chorus_enabled: true, chorus_mix: 0.7, delay_enabled: true, delay_mix: 0.4, equalizer_enabled: true, equalizer_tone: 0.45 }
  },
  {
    id: "voz_vhs", label: "VHS Desgastado", description: "Tremolo forte com rádio e bitcrush imitando fita VHS velha.",
    emoji: "📼", category: "Exclusivos", gradient: "linear-gradient(135deg, #27272a, #18181b)",
    gain: 3.2, pitch: -2, effects: { wobble_enabled: true, wobble_mix: 0.4, bitcrush_enabled: true, bitcrush_bits: 6, radio_enabled: true, radio_mix: 0.65 }
  },
  // --- Especiais e Extremos ---
  {
    id: "micfudiddo_extremo", label: "FUDIDDO TOTAL", description: "Aviso: Cuidado com os ouvidos! Todos os efeitos no absoluto talo e ganho extremo.",
    emoji: "👺", category: "Especiais", gradient: "linear-gradient(135deg, #ff0000, #ff5555)",
    gain: 100.0, pitch: 36, effects: {
      equalizer_enabled: true, equalizer_tone: 1.0,
      noise_gate_enabled: true, noise_gate_threshold: 0.4,
      echo_enabled: true, echo_mix: 0.9,
      reverb_enabled: true, reverb_mix: 0.9,
      megaphone_enabled: true, megaphone_drive: 40.0,
      distortion_enabled: true, distortion_drive: 200.0,
      robot_enabled: true, robot_rate_hz: 500.0,
      output_volume_enabled: true, output_volume: 100.0
    }
  }
];

const visibleVoicePresets = voicePresets.filter((voice) => voice.id !== "clean");

const effectGroups = [
  {
    title: "Textura",
    items: [
      ["distortion_enabled", "distortion_drive", "Distorção", "x", 1, 30],
      ["robot_enabled", "robot_rate_hz", "Robô", "Hz", 5, 120],
      ["bitcrush_enabled", "bitcrush_bits", "Bitcrush", "bits", 3, 12],
      ["equalizer_enabled", "equalizer_tone", "Equalizador", "%", 0, 100],
      ["noise_gate_enabled", "noise_gate_threshold", "Noise Gate", "%", 0, 40],
      ["radio_enabled", "radio_mix", "Rádio antigo", "%", 0, 100],
      ["telephone_enabled", "telephone_mix", "Telefone", "%", 0, 100]
    ]
  },
  {
    title: "Espaço",
    items: [
      ["echo_enabled", "echo_mix", "Eco curto", "%", 0, 90],
      ["delay_enabled", "delay_mix", "Delay", "%", 0, 90],
      ["reverb_enabled", "reverb_mix", "Reverb", "%", 0, 90],
      ["ghost_enabled", "ghost_mix", "Fantasma", "%", 0, 90],
      ["chorus_enabled", "chorus_mix", "Chorus", "%", 0, 90],
      ["flanger_enabled", "flanger_mix", "Flanger", "%", 0, 90],
      ["tremolo_enabled", "tremolo_rate_hz", "Tremolo", "Hz", 1, 30]
    ]
  },
  {
    title: "Personagem",
    items: [
      ["megaphone_enabled", "megaphone_drive", "Megafone", "x", 1, 12],
      ["demon_enabled", "demon_drive", "Demôniaca", "x", 1, 12],
      ["alien_enabled", "alien_rate_hz", "Alienígena", "Hz", 20, 140],
      ["whisper_enabled", "whisper_mix", "Sussurro digital", "%", 0, 90],
      ["compressor_enabled", "compressor_amount", "Compressor", "%", 0, 100],
      ["wobble_enabled", "wobble_mix", "Vibrato estranho", "%", 0, 90],
      ["reverse_enabled", "reverse_mix", "Reverse estranho", "%", 0, 100],
      ["alien_glitch_enabled", "alien_glitch_mix", "Glitch alien", "%", 0, 100]
    ]
  }
];

const effectDefaults = {
  output_volume_enabled: false, output_volume: 1,
  distortion_enabled: false, distortion_drive: 2,
  robot_enabled: false, robot_rate_hz: 35,
  noise_gate_enabled: false, noise_gate_threshold: 0.08,
  equalizer_enabled: false, equalizer_tone: 0.55,
  echo_enabled: false, echo_mix: 0.25,
  delay_enabled: false, delay_mix: 0.3,
  tremolo_enabled: false, tremolo_rate_hz: 8,
  bitcrush_enabled: false, bitcrush_bits: 8,
  radio_enabled: false, radio_mix: 0.7,
  megaphone_enabled: false, megaphone_drive: 4,
  telephone_enabled: false, telephone_mix: 0.8,
  reverb_enabled: false, reverb_mix: 0.28,
  demon_enabled: false, demon_drive: 3.5,
  alien_enabled: false, alien_rate_hz: 64,
  ghost_enabled: false, ghost_mix: 0.35,
  chorus_enabled: false, chorus_mix: 0.28,
  flanger_enabled: false, flanger_mix: 0.24,
  whisper_enabled: false, whisper_mix: 0.35,
  compressor_enabled: false, compressor_amount: 0.45,
  wobble_enabled: false, wobble_mix: 0.35,
  reverse_enabled: false, reverse_mix: 0.65,
  alien_glitch_enabled: false, alien_glitch_mix: 0.62
};

const playbackModes = [
  { value: "restart", label: "Reiniciar ao clicar de novo" },
  { value: "pause", label: "Tocar / pausar" },
  { value: "stop", label: "Tocar / parar" },
  { value: "overlap", label: "Sobrepor múltiplas instâncias" },
  { value: "hold_loop", label: "Segurar para tocar em loop" }
];

const pitchModes = [
  { value: "preserve", label: "Pitch sem acelerar" },
  { value: "resample", label: "Pitch meme / resample" }
];

const soundOutputRoutes = [
  { value: "both", label: "Microfone virtual + monitor" },
  { value: "microphone", label: "Microfone virtual" },
  { value: "monitor", label: "Monitor local" }
];

const soundboardCategories = ["Todos", "Memes", "Anime", "Jogos", "Troll", "Notificações", "Customizados", "Favoritos", "Gravações"];

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

function makeDisabledEffects() {
  return { ...effectDefaults };
}

function controlsForPreset(controls, preset) {
  if (preset.id === "clean") {
    return {
      ...controls,
      gain: 1.0,
      pitch: 0.0,
      effects: makeDisabledEffects()
    };
  }
  return {
    ...controls,
    gain: preset.gain,
    pitch: preset.pitch,
    effects: { ...controls.effects, ...makeDisabledEffects(), ...preset.effects }
  };
}

function isVoicePresetActive(controls, preset) {
  if (!controls) return false;
  const isMuted = Number(controls.gain) === 0;
  if (!isMuted && Math.abs(Number(controls.gain) - preset.gain) > 0.15) return false;
  if (Math.abs(Number(controls.pitch) - preset.pitch) > 0.15) return false;
  const expected = { ...makeDisabledEffects(), ...preset.effects };
  return Object.keys(expected).every((key) => {
    const left = controls.effects?.[key];
    const right = expected[key];
    if (typeof right === "boolean") return Boolean(left) === right;
    return Math.abs(Number(left ?? 0) - Number(right)) < 0.03;
  });
}

function countEnabledEffects(effects = {}) {
  return Object.entries(effects).filter(([key, value]) => key.endsWith("_enabled") && Boolean(value)).length;
}

function effectIconFor(label) {
  const n = String(label || "").toLowerCase();
  if (n.includes("distor")) return WaveSawtooth;
  if (n.includes("robo") || n.includes("robô")) return Robot;
  if (n.includes("bitcrush") || n.includes("glitch") || n.includes("alien")) return Circuitry;
  if (n.includes("equalizador") || n.includes("compressor")) return SlidersHorizontal;
  if (n.includes("noise")) return MicrophoneSlash;
  if (n.includes("radio") || n.includes("rádio")) return Radio;
  if (n.includes("telefone")) return Phone;
  if (n.includes("megafone")) return Megaphone;
  if (n.includes("fantasma") || n.includes("ghost") || n.includes("reverb")) return Ghost;
  if (n.includes("sussurro")) return Microphone;
  if (n.includes("reverse")) return ArrowCounterClockwise;
  return WaveSine;
}

function deviceName(items, idx) {
  if (!items || idx == null) return "—";
  const d = items.find((i) => i.index === idx);
  return d ? d.name : "—";
}

function displayEffectValue(key, value) {
  if (key.endsWith("_mix") || key.endsWith("_amount") || key.endsWith("_tone") || key.endsWith("_threshold"))
    return Math.round(Number(value) * 100);
  return Math.round(Number(value));
}

function storeEffectValue(key, value) {
  if (key.endsWith("_mix") || key.endsWith("_amount") || key.endsWith("_tone") || key.endsWith("_threshold"))
    return Number(value) / 100;
  return Number(value);
}

function formatValue(v, suffix) {
  const n = Math.round(Number(v));
  return suffix ? `${n}${suffix}` : `${n}`;
}

function formatTime(s) {
  if (s === undefined || s === null || s === "" || s === "N/A" || s === "Nuvem") return "00:00";
  const totalSeconds = parseFloat(s);
  if (isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds <= 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

function formatLastUsed(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "Nunca usado";
  return new Date(value * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function filePathToUrl(p) {
  if (!p) return "";
  return "file:///" + String(p).replace(/\\/g, "/");
}

/* ============================================================
   ERROR BOUNDARY
   ============================================================ */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" style={{ padding: 24, background: "rgba(220, 53, 69, 0.1)", border: "1px solid var(--danger)", borderRadius: 8, margin: 16 }}>
          <h3 style={{ color: "var(--danger)", marginTop: 0 }}>Algo deu errado nesta seção</h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{this.state.error?.message || String(this.state.error)}</p>
          <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => this.setState({ hasError: false, error: null })}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================================
   VIRTUAL CABLE WARNING MODAL
   ============================================================ */

function VirtualCableWarningModal({ onClose }) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleConfirm = () => {
    if (dontShowAgain) {
      localStorage.setItem("micfudiddo.ignoreVirtualCableWarning", "true");
    }
    onClose();
  };

  return (
    <div className="modalOverlay" onClick={handleConfirm}>
      <div className="modalContent" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, padding: 24 }}>
        <div className="modalHeader" style={{ borderBottom: "none", marginBottom: 12, padding: 0 }}>
          <h3 className="modalTitle" style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
            ⚠️ Cabo Virtual Não Detectado
          </h3>
        </div>
        <div className="modalBody" style={{ padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            O MicFudido Studio precisa de um driver de <strong>cabo virtual (VB-CABLE)</strong> para transmitir a sua voz modificada e os sons do soundboard para outros aplicativos (como o Discord ou jogos).
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
            Sem ele, você só conseguirá ouvir o monitoramento local no seu próprio fone.
          </p>
          
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <a 
              href="https://vb-audio.com/Cable/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-primary" 
              style={{ 
                padding: "8px 16px", 
                fontSize: 12, 
                background: "var(--danger)", 
                textDecoration: "none", 
                color: "#fff", 
                display: "inline-flex", 
                alignItems: "center", 
                justifyContent: "center", 
                fontWeight: 600, 
                borderRadius: "var(--radius-sm)",
                flex: 1 
              }}
            >
              📥 Baixar VB-CABLE
            </a>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11.5, color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
            <input 
              type="checkbox" 
              checked={dontShowAgain} 
              onChange={(e) => setDontShowAgain(e.target.checked)} 
              style={{ cursor: "pointer" }}
            />
            Não avisar novamente
          </label>
        </div>
        <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={handleConfirm}>
            Ignorar por enquanto
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CHOOSE MIC ON CLOSE MODAL
   ============================================================ */

function ChooseMicOnCloseModal({ state, onConfirm, onCancel }) {
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

function App() {
  const [state, setState] = useState(null);
  const [page, setPage] = useState(() => {
    const saved = localStorage.getItem("micfudiddo.page") || "vozes";
    return pages.some((p) => p.id === saved) ? saved : "vozes";
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

  const [bypassActive, setBypassActive] = useState(false);
  const [lastActivePresetId, setLastActivePresetId] = useState(null);
  const [savedCustomControls, setSavedCustomControls] = useState(null);

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

  const [showVirtualCableWarning, setShowVirtualCableWarning] = useState(false);
  const [checkedVirtualCable, setCheckedVirtualCable] = useState(false);

  useEffect(() => {
    if (state && !checkedVirtualCable) {
      setCheckedVirtualCable(true);
      if (state.virtualCableDetected === false) {
        const ignored = localStorage.getItem("micfudiddo.ignoreVirtualCableWarning") === "true";
        if (!ignored) {
          setShowVirtualCableWarning(true);
        }
      }
    }
  }, [state, checkedVirtualCable]);

  // Custom premium theme and account configurations
  const [accentColor, setAccentColor] = useState(() => {
    return localStorage.getItem("micfudiddo.accentColor") || "purple";
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

  // Apply accent color
  useEffect(() => {
    const applyAccentColor = (key) => {
      const p = colorPalettes[key] || colorPalettes.purple;
      const root = document.documentElement;
      root.style.setProperty("--purple", p.primary);
      root.style.setProperty("--purple-hover", p.hover);
      root.style.setProperty("--purple-dim", p.dim);
      root.style.setProperty("--purple-glow", p.glow);
      root.style.setProperty("--purple-soft", p.soft);
      root.style.setProperty("--purple-bg", p.bg);
      root.style.setProperty("--border-hover", p.borderHover);
      root.style.setProperty("--border-active", p.borderActive);
    };
    applyAccentColor(accentColor);
    localStorage.setItem("micfudiddo.accentColor", accentColor);
  }, [accentColor]);

  // Persist account and soundboard favorites
  useEffect(() => { localStorage.setItem("micfudiddo.profileName", profileName); }, [profileName]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileSub", profileSub); }, [profileSub]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileImage", profileImage); }, [profileImage]);
  useEffect(() => { localStorage.setItem("micfudiddo.profilePlan", profilePlan); }, [profilePlan]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileBio", profileBio); }, [profileBio]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileReadme", profileReadme); }, [profileReadme]);
  useEffect(() => { localStorage.setItem("micfudiddo.profileImagePosition", profileImagePosition); }, [profileImagePosition]);
  useEffect(() => { localStorage.setItem("micfudiddo.dockMinimized", dockMinimized); }, [dockMinimized]);
  useEffect(() => { localStorage.setItem("micfudiddo.customCategories", JSON.stringify(customCategories)); }, [customCategories]);
  useEffect(() => { localStorage.setItem("micfudiddo.customVoiceCategories", JSON.stringify(customVoiceCategories)); }, [customVoiceCategories]);
  useEffect(() => { localStorage.setItem("micfudiddo.soundboardFavorites", JSON.stringify(soundboardFavorites)); }, [soundboardFavorites]);

  // Persist favorites
  useEffect(() => { localStorage.setItem("micfudiddo.voiceFavorites", JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem("micfudiddo.customPresets", JSON.stringify(customVoices)); }, [customVoices]);

  const applyIncomingState = (data) => {
    if (!data) return;
    
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
      // Se não havia estado anterior, normaliza o 'data' inicial e o define
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

    call("/api/controls", { controls }).catch((e) => {
      controlsOptimisticRef.current = null;
      setToast(e.message);
    });
  };

  const toggleMute = () => {
    if (!state) return;
    const isCurrentlyMuted = state.controls?.gain === 0;
    if (isCurrentlyMuted) {
      updateControls({ gain: lastNonZeroGain || 1.0 });
    } else {
      updateControls({ gain: 0.0 });
    }
  };

  const updateEffects = (patch) => {
    updateControls({ effects: { ...state.controls.effects, ...patch } });
  };

  const applyVoicePreset = (voice) => {
    if (!state || !voice) return;
    if (voice.id !== "clean") {
      setBypassActive(false);
      setLastActivePresetId(voice.id);
      setSavedCustomControls(null);
    } else {
      setBypassActive(true);
    }
    updateControls(controlsForPreset(state.controls, voice));
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
    return all.find((p) => isVoicePresetActive(state?.controls, p)) || null;
  }, [state?.controls, customVoices]);

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
  };

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
    }, 5000);

    const intervalId = setInterval(runRefresh, 700);
    
    return () => {
      active = false;
      clearTimeout(timeoutId);
      clearInterval(intervalId);
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
      } else if (action === "toggle_bypass") {
        toggleBypass();
      } else if (action === "toggle_soundboard") {
        updateControls({ soundboardMonitor: !state?.controls?.soundboardMonitor });
      } else if (action === "toggle_voicechanger") {
        const togglePath = (state?.running && !state?.monitorOnly) || state?.virtualMode ? "/api/stop" : "/api/virtual/start";
        call(togglePath).catch((err) => setToast(err.message));
      } else if (action === "record_voice") {
        call(state?.recording?.voice ? "/api/record/voice/stop" : "/api/record/voice/start").catch((e) => setToast(e.message));
      } else if (action === "record_pc") {
        call(state?.recording?.pc ? "/api/record/pc/stop" : "/api/record/pc/start", { indexes: selectedRecordDevices }).catch((e) => setToast(e.message));
      } else if (action === "record_combo") {
        call(state?.recording?.combo ? "/api/record/combo/stop" : "/api/record/combo/start", { indexes: selectedRecordDevices }).catch((e) => setToast(e.message));
      }
    });
  }, [state, bypassActive, toggleBypass, updateControls, toggleMute, call, selectedRecordDevices]);

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
        />

        <main className="mainContent">
          <ErrorBoundary>
            <AudioPlayer state={state} selected={selected} call={call} pinnedSoundId={pinnedSoundId} setPinnedSoundId={setPinnedSoundId} setSelectedSound={setSelectedSound} />
          </ErrorBoundary>
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
                    state={state} call={call} updateControls={updateControls} updateEffects={updateEffects}
                    applyVoicePreset={applyVoicePreset}
                    selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice}
                    favorites={favorites} toggleFavorite={toggleFavorite}
                    customVoices={customVoices} setPage={setPage}
                    promptState={promptState} setPromptState={setPromptState}
                    customVoiceCategories={customVoiceCategories} setCustomVoiceCategories={setCustomVoiceCategories}
                  />
                </ErrorBoundary>
              )}
              {page === "soundboard" && (
                <ErrorBoundary>
                  <SoundboardPage
                    state={state} call={call} selected={selected} selectedSound={selectedSound} setSelectedSound={setSelectedSound}
                    setToast={setToast} selectedRecordDevices={selectedRecordDevices}
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
                    state={state} call={call} setToast={setToast}
                    soundboardFavorites={soundboardFavorites}
                    toggleSoundboardFavorite={toggleSoundboardFavorite}
                  />
                </ErrorBoundary>
              )}
              {page === "favoritos" && (
                <ErrorBoundary>
                  <FavoritosPage
                    state={state} call={call} favorites={favorites} toggleFavorite={toggleFavorite}
                    updateControls={updateControls} applyVoicePreset={applyVoicePreset}
                    selectedVoice={selectedVoice} setSelectedVoice={setSelectedVoice}
                    setSelectedSound={setSelectedSound} setPage={setPage} customVoices={customVoices}
                  />
                </ErrorBoundary>
              )}
              {page === "voicelab" && (
                <ErrorBoundary>
                  <VoiceLabPage
                    state={state} call={call} updateControls={updateControls} updateEffects={updateEffects}
                    customVoices={customVoices} setCustomVoices={setCustomVoices}
                    setToast={setToast} setPage={setPage}
                    customVoiceCategories={customVoiceCategories}
                  />
                </ErrorBoundary>
              )}
              {page === "config" && (
                <ErrorBoundary>
                  <ConfigPage
                    state={state} call={call} setToast={setToast}
                    selectedRecordDevices={selectedRecordDevices}
                    setSelectedRecordDevices={setSelectedRecordDevices} setPage={setPage}
                    accentColor={accentColor} setAccentColor={setAccentColor}
                    updateEffects={updateEffects}
                  />
                </ErrorBoundary>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Floating Dock */}
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
      />

      {/* Modals */}
      <AnimatePresence>
        {showVirtualCableWarning && (
          <VirtualCableWarningModal
            onClose={() => setShowVirtualCableWarning(false)}
          />
        )}
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
                  onChange={(e) => setPromptState({ ...promptState, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      promptState.onConfirm(promptState.value);
                      setPromptState(null);
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="modalFooter" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button className="btn btn-ghost" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => setPromptState(null)}>Cancelar</button>
                <button className="btn btn-primary" style={{ padding: "8px 16px", fontSize: 12 }} onClick={() => {
                  promptState.onConfirm(promptState.value);
                  setPromptState(null);
                }}>Confirmar</button>
              </div>
            </div>
          </div>
        )}
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {toast}
            <button onClick={() => setToast("")}>OK</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   MARKDOWN PARSER
   ============================================================ */

function renderMarkdown(text) {
  if (!text) return null;
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  html = html.replace(/^# (.*?)$/gm, "<h1>$1</h1>");
  html = html.replace(/^## (.*?)$/gm, "<h2>$1</h2>");
  html = html.replace(/^### (.*?)$/gm, "<h3>$1</h3>");
  html = html.replace(/^#### (.*?)$/gm, "<h4>$1</h4>");
  html = html.replace(/^&gt; (.*?)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px; margin: 8px 0; border: 1px solid var(--border);" />');
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: var(--purple); font-weight: 700; text-decoration: underline;">$1</a>');
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
  html = html.replace(/_(.*?)_/g, "<em>$1</em>");
  html = html.replace(/`(.*?)`/g, "<code>$1</code>");
  html = html.replace(/^\- (.*?)$/gm, "<li>$1</li>");
  html = html.replace(/^\* (.*?)$/gm, "<li>$1</li>");
  
  const lines = html.split("\n");
  let insideList = false;
  let result = [];
  
  for (let line of lines) {
    if (line.startsWith("<li>")) {
      if (!insideList) {
        result.push("<ul>");
        insideList = true;
      }
      result.push(line);
    } else {
      if (insideList) {
        result.push("</ul>");
        insideList = false;
      }
      if (line.trim()) {
        if (!line.startsWith("<h") && !line.startsWith("<blockquote") && !line.startsWith("<ul>") && !line.startsWith("</ul>")) {
          result.push(`<p>${line}</p>`);
        } else {
          result.push(line);
        }
      }
    }
  }
  if (insideList) {
    result.push("</ul>");
  }
  
  return <div className="readme-rendered" dangerouslySetInnerHTML={{ __html: result.join("\n") }} />;
}

/* ============================================================
   MOVE CATEGORY MODAL
   ============================================================ */

function MoveCategoryModal({ soundId, state, call, onClose, setToast, customCategories, setCustomCategories }) {
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
    
    // Ensure all custom categories are represented too
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
    
    // Auto-select and move to it!
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

        {/* Search bar */}
        <div className="searchBar" style={{ marginBottom: 12, padding: "6px 12px" }}>
          <MagnifyingGlass size={14} className="searchIcon" />
          <input
            placeholder="Pesquisar pastas existentes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>

        {/* Categories list */}
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

        {/* Create new category */}
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

/* ============================================================
   USER PROFILE MODAL
   ============================================================ */

function UserProfileModal({ onClose, onEdit, profileName, profileSub, profilePlan, profileImage, profileImagePosition, profileBio, profileReadme }) {
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

/* ============================================================
   EDIT PROFILE MODAL (ManageAccountModal renamed/expanded)
   ============================================================ */

function EditProfileModal({ onClose, profileName, setProfileName, profileSub, setProfileSub, profilePlan, setProfilePlan, profileImage, setProfileImage, profileImagePosition, setProfileImagePosition, profileBio, setProfileBio, profileReadme, setProfileReadme }) {
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

/* ============================================================
   SIDEBAR
   ============================================================ */

function Sidebar({ page, setPage, state, profileName, profileSub, profilePlan, profileImage, profileImagePosition, onOpenProfile, onManageAccount }) {
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

/* ============================================================
   MANAGE ACCOUNT MODAL
   ============================================================ */

function ManageAccountModal({ onClose, profileName, setProfileName, profileSub, setProfileSub, profileImage, setProfileImage }) {
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

/* ============================================================
   GLOBAL FLOATING DOCK
   ============================================================ */

function FloatingDock({ state, call, updateControls, toggleMute, activePreset, processingActive, lastPlayedSound, bypassActive, setBypassActive, toggleBypass, setPage, soundboardFavorites, dockMinimized, setDockMinimized, setSelectedSound }) {
  const togglePath = processingActive || state.virtualMode ? "/api/stop" : "/api/virtual/start";
  const [showMenu, setShowMenu] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const handleSoundboardJump = (e) => {
    e.preventDefault();
    if (lastPlayedSound) {
      setPage("soundboard");
      setSelectedSound(lastPlayedSound.id);
      setTimeout(() => {
        const el = document.querySelector(`.soundCard.active`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  };

  const handleMixerToggle = (e) => {
    e.preventDefault();
    setShowMixer(!showMixer);
  };

  useEffect(() => {
    const handler = () => { setShowMenu(false); setShowMixer(false); };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const favoriteSounds = useMemo(() => {
    return (state.sounds || []).filter((s) => soundboardFavorites.includes(s.id)).slice(0, 3);
  }, [state.sounds, soundboardFavorites]);

  const activePresetAvatar = activePreset ? (
    getVoiceImage(activePreset.id) ? (
      <img src={getVoiceImage(activePreset.id)} alt={activePreset.label} />
    ) : (
      <span style={{ fontSize: 26 }}>{activePreset.emoji}</span>
    )
  ) : (
    <span style={{ fontSize: 26 }}>🎙️</span>
  );

  const isSoundPlaying = lastPlayedSound && state.players?.some((p) => p.soundId === lastPlayedSound.id && p.state === "playing");

  if (dockMinimized) {
    return (
      <div className="bottomBar dock-minimized">
        <div className="floating-dock-inner-minimized">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`status-dot-pulse ${processingActive ? "on" : ""}`} style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: processingActive ? "var(--purple)" : "var(--text-muted)",
              boxShadow: processingActive ? "0 0 8px var(--purple)" : "none",
              display: "inline-block"
            }} />
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em", color: "var(--text-secondary)" }}>
              {processingActive ? "VOZ ATIVA" : "VOZ OFF"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              className={`bbBtn icon-only ${state.controls?.gain === 0 ? "on" : ""}`}
              onClick={toggleMute}
              title="Mute"
              style={{ width: 28, height: 28 }}
            >
              {state.controls?.gain === 0 ? <MicrophoneSlash size={14} color="var(--danger)" /> : <Microphone size={14} />}
            </button>

            <button
              className="bbBtn icon-only"
              onClick={() => call("/api/sounds/stop").catch(() => {})}
              title="Parar todos os sons"
              style={{ width: 28, height: 28 }}
            >
              <StopCircle size={14} />
            </button>

            <button
              className="bbBtn icon-only"
              onClick={() => setDockMinimized(false)}
              title="Maximizar Dock"
              style={{ width: 28, height: 28 }}
            >
              <CaretUp size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bottomBar">
      <div className="floating-dock-inner">
        <div className="bbSection">
          <button
            className={`bbBtn toggle ${processingActive ? "on" : ""}`}
            onClick={() => call(togglePath).catch(() => {})}
            title="Ativar/Desativar Voice Changer"
          >
            <Microphone size={16} weight="bold" />
            {processingActive ? "VOZ ON" : "VOZ OFF"}
          </button>

          <button
            className={`bbBtn icon-only ${state.controls?.gain === 0 ? "on" : ""}`}
            onClick={toggleMute}
            title="Mute"
          >
            {state.controls?.gain === 0 ? <MicrophoneSlash size={16} color="var(--danger)" /> : <Microphone size={16} />}
          </button>

          <button
            className={`bbBtn icon-only ${(state.controls?.monitor || state.controls?.soundboardMonitor) ? "on" : ""}`}
            onClick={() => {
              const isCurrentlyActive = !!(state.controls?.monitor || state.controls?.soundboardMonitor);
              if (isCurrentlyActive) {
                localStorage.setItem("prev_monitor", state.controls?.monitor ? "true" : "false");
                localStorage.setItem("prev_soundboardMonitor", state.controls?.soundboardMonitor ? "true" : "false");
                updateControls({ monitor: false, soundboardMonitor: false });
              } else {
                const prevMonitor = localStorage.getItem("prev_monitor") !== "false";
                const prevSoundboardMonitor = localStorage.getItem("prev_soundboardMonitor") !== "false";
                updateControls({ monitor: prevMonitor, soundboardMonitor: prevSoundboardMonitor });
              }
            }}
            onContextMenu={handleMixerToggle}
            title="Monitoramento Local (Esquerdo: Liga/Desliga, Direito: Mixer Rápido)"
          >
            {(state.controls?.monitor || state.controls?.soundboardMonitor) ? <SpeakerHigh size={16} /> : <SpeakerSlash size={16} color="var(--danger)" />}
          </button>

          <div className="bbVolume" style={{ gap: 8 }}>
            <input
              type="range" min={0} max={200} step={1}
              value={Math.round((state.controls?.monitorVolume ?? 1) * 100)}
              onChange={(e) => updateControls({ monitorVolume: Number(e.target.value) / 100 })}
              style={{ width: 80 }}
            />
            <span className="bbVolumeValue" style={{ fontSize: 10, width: 28 }}>{Math.round((state.controls?.monitorVolume ?? 1) * 100)}%</span>
          </div>
        </div>

        <div className="dockDivider" />

        <div className="dock-active-avatar-container" onClick={toggleBypass}>
          <div className={`dock-active-avatar ${processingActive && !bypassActive && activePreset?.id !== "clean" ? "processing" : ""}`} style={{
            background: bypassActive || activePreset?.id === "clean" 
              ? "linear-gradient(135deg, #1f2937, #111827)" 
              : (activePreset?.gradient || "linear-gradient(135deg, var(--purple-dim), var(--purple))")
          }}>
            {bypassActive || activePreset?.id === "clean" ? (
              <span style={{ fontSize: 26 }}>⚪</span>
            ) : (
              activePresetAvatar
            )}
          </div>
          <span className="dock-active-label">
            {bypassActive || activePreset?.id === "clean" ? "Voz Normal" : (activePreset?.label || "Normal")}
          </span>
        </div>

        <div className="dockDivider" />

        <div className="bbSection" style={{ gap: 10 }}>
          {lastPlayedSound && (
            <div
              className={`dock-soundboard-quick-play ${isSoundPlaying ? "playing" : ""}`}
              onClick={() => {
                if (isSoundPlaying) {
                  call("/api/sounds/stop").catch(() => {});
                } else {
                  call("/api/sounds/play", { id: lastPlayedSound.id }).catch(() => {});
                }
              }}
              onContextMenu={handleSoundboardJump}
              title={isSoundPlaying ? "Parar Som | Ir p/ Soundboard (Direito)" : "Play | Ir p/ Soundboard (Direito)"}
              style={{ position: "relative" }}
            >
              {lastPlayedSound.coverUrl ? (
                <img src={lastPlayedSound.coverUrl} alt="" />
              ) : (
                <MusicNotes size={18} color={lastPlayedSound.color || "var(--purple)"} />
              )}
            </div>
          )}
          <button
            className="bbBtn icon-only dock-status-btn"
            onClick={() => setPage("config")}
          >
            <GearSix size={16} />
          </button>
          <button
            className="bbBtn icon-only"
            onClick={() => setDockMinimized(true)}
            title="Minimizar Dock"
          >
            <CaretDown size={16} />
          </button>
        </div>
      </div>

      {/* Floating Menu */}
      {showMenu && (
        <div className="dock-soundboard-quick-play-menu" style={{ left: menuPos.x, top: menuPos.y }} onClick={(e) => e.stopPropagation()}>
          <div className="menu-title">Últimos Tocados</div>
          {recentSounds.map((s) => (
            <button key={s.id} onClick={() => { call("/api/sounds/play", { id: s.id }).catch(() => {}); setShowMenu(false); }}>
              <Play size={12} /> {s.name}
            </button>
          ))}
          {recentSounds.length === 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 12px" }}>Nenhum som tocado</div>}

          <div className="menu-title">Favoritos</div>
          {favoriteSounds.map((s) => (
            <button key={s.id} onClick={() => { call("/api/sounds/play", { id: s.id }).catch(() => {}); setShowMenu(false); }}>
              <Star size={12} color="var(--amber)" weight="fill" /> {s.name}
            </button>
          ))}
          {favoriteSounds.length === 0 && <div style={{ fontSize: 10, color: "var(--text-muted)", padding: "4px 12px" }}>Sem favoritos</div>}

          <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
          <button onClick={() => { setPage("soundboard"); setShowMenu(false); }}>
            <FolderOpen size={12} color="var(--cyan)" /> Abrir Soundboard
          </button>
        </div>
      )}

      {/* Quick Mixer Popup */}
      {showMixer && (
        <div className="dock-quick-mixer" onClick={(e) => e.stopPropagation()}>
          <div className="mixer-header">
            <div className="mixer-title">
              <SlidersHorizontal size={16} color="var(--purple)" />
              <h4>Mixer Rápido</h4>
            </div>
            <div className="mixer-header-actions">
              <button
                className="mixer-action-btn reset"
                title="Resetar Valores"
                onClick={() => {
                  updateControls({
                    gain: 1.0,
                    monitor: true,
                    monitorVolume: 1.0,
                    soundboardMonitor: true,
                    soundboardMonitorVolume: 0.65,
                    pitch: 0.0,
                    effects: {
                      ...state.controls?.effects,
                      output_volume: 1.0,
                      output_volume_enabled: false
                    }
                  });
                }}
              >
                <ArrowCounterClockwise size={12} />
                <span>Redefinir</span>
              </button>
              <button className="mixer-action-btn close" title="Fechar" onClick={() => setShowMixer(false)}>
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="mixer-body">
            <div className="mixer-row">
              <div className="row-label">
                <Microphone size={14} className="row-icon" />
                <span className="label-text">Ganho do Microfone</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={30}
                  step={0.5}
                  value={state.controls?.gain ?? 1}
                  onChange={(e) => updateControls({ gain: Number(e.target.value) })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.gain ?? 1)}x</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <SpeakerHigh size={14} className="row-icon" />
                <span className="label-text">Retorno de Voz</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={1}
                  value={Math.round((state.controls?.monitorVolume ?? 1) * 100)}
                  onChange={(e) => updateControls({ monitorVolume: Number(e.target.value) / 100 })}
                  className="mixer-slider"
                />
                <span className="slider-value">{Math.round((state.controls?.monitorVolume ?? 1) * 100)}%</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <MusicNotes size={14} className="row-icon" />
                <span className="label-text">Retorno de Sons</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={1}
                  value={Math.round((state.controls?.soundboardMonitorVolume ?? 0.65) * 100)}
                  onChange={(e) => updateControls({ soundboardMonitorVolume: Number(e.target.value) / 100 })}
                  className="mixer-slider"
                />
                <span className="slider-value">{Math.round((state.controls?.soundboardMonitorVolume ?? 0.65) * 100)}%</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <MicrophoneStage size={14} className="row-icon" />
                <span className="label-text">Volume da Voz</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={0}
                  max={3000}
                  step={50}
                  value={Math.round((state.controls?.effects?.output_volume ?? 1) * 100)}
                  onChange={(e) => updateControls({
                    effects: {
                      ...state.controls?.effects,
                      output_volume: Number(e.target.value) / 100,
                      output_volume_enabled: true
                    }
                  })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.effects?.output_volume ?? 1.0).toFixed(1)}x</span>
              </div>
            </div>

            <div className="mixer-row">
              <div className="row-label">
                <Waveform size={14} className="row-icon" />
                <span className="label-text">Pitch</span>
              </div>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min={-36}
                  max={36}
                  step={1}
                  value={state.controls?.pitch ?? 0}
                  onChange={(e) => updateControls({ pitch: Number(e.target.value) })}
                  className="mixer-slider"
                />
                <span className="slider-value">{(state.controls?.pitch ?? 0) > 0 ? `+${state.controls?.pitch}` : state.controls?.pitch}st</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   VOZES PAGE (Main Page)
   ============================================================ */

function VozesPage({ state, call, updateControls, updateEffects, applyVoicePreset, selectedVoice, setSelectedVoice, favorites, toggleFavorite, customVoices, setPage, promptState, setPromptState, customVoiceCategories, setCustomVoiceCategories }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");

  const allVoices = useMemo(() => [...visibleVoicePresets, ...customVoices], [customVoices]);
  const allDetectableVoices = useMemo(() => [...voicePresets, ...customVoices], [customVoices]);

  const categories = useMemo(() => {
    return ["Todas", "Favoritas", "Recentes", "Humanos", "Robôs", "Monstros", "Anime", "Jogos", "Sci-Fi", "Memes", "Customizadas", ...customVoiceCategories];
  }, [customVoiceCategories]);

  const filtered = useMemo(() => {
    let list = allVoices;
    if (category === "Favoritas") {
      list = list.filter((v) => favorites.includes(v.id) || v.id === "personalizado");
    } else if (category === "Customizadas") {
      list = list.filter((v) => customVoices.some((c) => c.id === v.id) || v.id === "personalizado");
    } else if (category !== "Todas" && category !== "Recentes" && !customVoiceCategories.includes(category)) {
      list = list.filter((v) => {
        if (v.id === "personalizado") return true;
        const voiceCat = v.category;
        if (category === "Humanos") return voiceCat === "Humanos" || voiceCat === "Reverb" || voiceCat === "Grave" || voiceCat === "Fina e Aguda" || voiceCat === "Rádio";
        if (category === "Robôs") return voiceCat === "Robótica";
        if (category === "Monstros") return voiceCat === "Monstros";
        if (category === "Anime") return voiceCat === "Anime";
        if (category === "Jogos") return voiceCat === "Jogos e Streaming" || voiceCat === "Música";
        if (category === "Sci-Fi") return voiceCat === "Exclusivos";
        if (category === "Memes") return voiceCat === "Humor" || voiceCat === "Especiais";
        return voiceCat === category;
      });
    } else if (customVoiceCategories.includes(category)) {
      list = list.filter((v) => v.category === category || v.id === "personalizado");
    }
    
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((v) => v.id === "personalizado" || v.label.toLowerCase().includes(q) || v.description.toLowerCase().includes(q));
    }

    // Garante que 'personalizado' está presente na lista
    const hasPersonalizado = list.some((v) => v.id === "personalizado");
    if (!hasPersonalizado) {
      const pers = allVoices.find((v) => v.id === "personalizado");
      if (pers) {
        list = [pers, ...list];
      }
    }
    
    // Pinar "personalizado" no topo de tudo, seguido por favoritas
    const sorted = [...list].sort((a, b) => {
      if (a.id === "personalizado") return -1;
      if (b.id === "personalizado") return 1;
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;
      return 0;
    });

    // Remove eventuais duplicados para segurança
    const unique = [];
    const seen = new Set();
    for (const v of sorted) {
      if (!seen.has(v.id)) {
        seen.add(v.id);
        unique.push(v);
      }
    }
    return unique;
  }, [allVoices, category, query, favorites, customVoices, customVoiceCategories]);

  const activeVoice = useMemo(() => allDetectableVoices.find((v) => isVoicePresetActive(state?.controls, v)), [state?.controls, allDetectableVoices]);
  const panelVoice = selectedVoice ? allVoices.find((v) => v.id === selectedVoice) : null;

  const selectVoice = (voice) => {
    setSelectedVoice(voice.id);
    applyVoicePreset(voice);
  };

  return (
    <>
      <div className="labHeader">
        <h2>🎙️ Biblioteca de Vozes</h2>
        <p>Selecione, personalize e modele timbres de estúdio premium em tempo real</p>
      </div>

      {/* Toolbar */}
      <div className="pageToolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div className="toolbarLeft" style={{ flex: 1 }}>
          <div className="searchBar" style={{ marginBottom: 0, maxWidth: 420 }}>
            <MagnifyingGlass size={16} className="searchIcon" />
            <input placeholder="Buscar voz..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="toolbarRight" style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => {
            setPromptState({
              title: "Nova Categoria de Voz",
              value: "",
              onConfirm: (name) => {
                if (name && name.trim()) {
                  const trimmed = name.trim();
                  if (customVoiceCategories.includes(trimmed) || ["Todas", "Favoritas", "Recentes", "Humanos", "Robôs", "Monstros", "Anime", "Jogos", "Sci-Fi", "Memes", "Customizadas"].includes(trimmed)) {
                    alert("Categoria já existe!");
                    return;
                  }
                  setCustomVoiceCategories([...customVoiceCategories, trimmed]);
                }
              }
            });
          }} title="Nova Categoria de Voz">
            <Plus size={14} /> Adicionar Categoria
          </button>
          {customVoiceCategories.includes(category) && (
            <button className="btn btn-ghost" onClick={() => {
              if (confirm(`Deseja excluir a categoria de voz "${category}"? As vozes não serão excluídas, apenas perderão a categoria.`)) {
                setCustomVoiceCategories(customVoiceCategories.filter(c => c !== category));
                setCategory("Todas");
              }
            }} title="Excluir Categoria" style={{ color: "var(--danger)" }}>
              <Trash size={14} /> Excluir Cat.
            </button>
          )}
        </div>
      </div>

      {/* Categories */}
      <div className="categoryPills">
        {categories.map((cat) => (
          <button key={cat} className={category === cat ? "active" : ""} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* Section header */}
      <div className="sectionHeader">TODAS AS VOZES</div>

      {/* Grid + Panel */}
      <div className={`voiceGridArea ${panelVoice ? "" : "no-panel"}`}>
        <div className="voiceGrid">
          {filtered.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isActive={activeVoice?.id === voice.id}
              isFavorite={favorites.includes(voice.id)}
              onSelect={() => selectVoice(voice)}
              onEditOnly={() => setSelectedVoice(voice.id)}
              onToggleFavorite={() => toggleFavorite(voice.id)}
            />
          ))}
          {/* Create voice card */}
          <div className="voiceCard createCard" onClick={() => setPage("voicelab")}>
            <div className="cardImage">
              <span className="createPlus">+</span>
            </div>
            <div className="cardInfo">
              <div className="cardName">Criar voz</div>
              <div className="cardDesc">personalizada</div>
            </div>
          </div>
        </div>

        {/* Side Panel */}
        {panelVoice && (
          <VoiceSidePanel
            voice={panelVoice}
            state={state}
            updateControls={updateControls}
            updateEffects={updateEffects}
            onApplyPreset={() => applyVoicePreset(panelVoice)}
            isFavorite={favorites.includes(panelVoice.id)}
            onToggleFavorite={() => toggleFavorite(panelVoice.id)}
            onClose={() => setSelectedVoice(null)}
          />
        )}
      </div>
    </>
  );
}

/* ============================================================
   VOICE CARD
   ============================================================ */

function VoiceCard({ voice, isActive, isFavorite, onSelect, onEditOnly, onToggleFavorite }) {
  const image = getVoiceImage(voice.id);
  return (
    <motion.div
      className={`voiceCard ${isActive ? "active" : ""}`}
      onClick={onSelect}
      onContextMenu={(e) => {
        if (onEditOnly) {
          e.preventDefault();
          onEditOnly();
        }
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="cardImage">
        {image ? (
          <img src={image} alt={voice.label} />
        ) : (
          <>
            <div className="cardGradient" style={{ background: voice.gradient }} />
            <span className="cardEmoji">{voice.emoji}</span>
          </>
        )}
        <div className="cardWaveform">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ "--i": i }} />
          ))}
        </div>
      </div>
      <button className={`favBtn ${isFavorite ? "favorited" : ""}`} onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}>
        <Star size={14} weight={isFavorite ? "fill" : "regular"} />
      </button>
      <div className="cardInfo">
        <div className="cardName">{voice.label}</div>
        <div className="cardDesc">{voice.description}</div>
      </div>
    </motion.div>
  );
}

/* ============================================================
   VOICE SIDE PANEL
   ============================================================ */

function VoiceSidePanel({ voice, state, updateControls, updateEffects, onApplyPreset, isFavorite, onToggleFavorite, onClose }) {
  const [showMore, setShowMore] = useState(false);
  const image = getVoiceImage(voice.id);
  const controls = state.controls;

  // Map simplified sliders to actual effect parameters
  const gainValue = Math.round((Number(controls.gain ?? 1.0) / 3.0) * 100);
  const monitorVolumeValue = Math.round((Number(controls.monitorVolume ?? 1.0) / 3.0) * 100);
  const outputVolumeValue = Math.round((Number(controls.effects?.output_volume ?? 1.0) / 10.0) * 100);
  const pitchValue = Math.round(((Number(controls.pitch) + 12) / 24) * 100);
  const reverbValue = Math.round((Number(controls.effects?.reverb_mix ?? 0)) * 100);
  const echoValue = Math.round((Number(controls.effects?.echo_mix ?? 0)) * 100);
  const distortionValue = Math.round(((Number(controls.effects?.distortion_drive ?? 1) - 1) / 29) * 100);
  const formantValue = Math.round(((Number(controls.effects?.robot_rate_hz ?? 5) - 5) / 115) * 100);

  return (
    <div className="voiceSidePanel">
      <button className="panelCopy" title="Duplicar"><Copy size={16} /></button>
      <button className="panelClose" onClick={onClose}><X size={16} /></button>

      <div className="panelImage">
        {image ? <img src={image} alt={voice.label} /> : (
          <>
            <div className="cardGradient" style={{ background: voice.gradient, position: "absolute", inset: 0 }} />
            <span className="panelEmoji">{voice.emoji}</span>
          </>
        )}
      </div>

      <div className="panelBody">
        <div className="panelName">
          {voice.label}
          <span className="proBadge">PRO</span>
        </div>
        <p className="panelDesc">{voice.description}</p>

        <button className={`addFavBtn ${isFavorite ? "favorited" : ""}`} onClick={onToggleFavorite}>
          <Star size={16} weight={isFavorite ? "fill" : "regular"} />
          {isFavorite ? "Nos favoritos" : "Adicionar aos favoritos"}
        </button>

        {voice.id === "clean" ? (
          <div className="cleanVoiceNotice">
            <Microphone size={32} weight="duotone" color="var(--purple)" />
            <p>Voz original sem processamento</p>
            <span>Esta voz transmite o áudio limpo e natural do seu microfone.</span>
          </div>
        ) : (
          <>
            <div className="panelSection">
              <div className="panelSectionTitle">
                CONTROLE DE MICROFONE
              </div>
              <PanelSlider label="Ganho (Mic)" value={gainValue} onChange={(v) => updateControls({ gain: (v / 100) * 3.0 })} />
              <PanelSlider label="Vol. Retorno" value={monitorVolumeValue} onChange={(v) => updateControls({ monitorVolume: (v / 100) * 3.0 })} />
              <PanelSlider label="Volume Geral" value={outputVolumeValue} onChange={(v) => updateEffects({ output_volume: (v / 100) * 10.0, output_volume_enabled: true })} />
            </div>

            <div className="panelSection">
              <div className="panelSectionTitle">
                CONFIGURAÇÕES DO EFEITO
                <button className="moreBtn"><DotsThreeVertical size={16} /></button>
              </div>

              <PanelSlider label="Pitch" value={pitchValue} onChange={(v) => updateControls({ pitch: (v / 100) * 24 - 12 })} />
              <PanelSlider label="Formant" value={formantValue} onChange={(v) => updateEffects({ robot_rate_hz: (v / 100) * 115 + 5, robot_enabled: v > 0 })} />
              <PanelSlider label="Reverb" value={reverbValue} onChange={(v) => updateEffects({ reverb_mix: v / 100, reverb_enabled: v > 0 })} />
              <PanelSlider label="Echo" value={echoValue} onChange={(v) => updateEffects({ echo_mix: v / 100, echo_enabled: v > 0 })} />
              <PanelSlider label="Distorção" value={distortionValue} onChange={(v) => updateEffects({ distortion_drive: (v / 100) * 29 + 1, distortion_enabled: v > 0 })} />
            </div>

            <button className="moreConfigsBtn" onClick={() => setShowMore(!showMore)}>
              {showMore ? "Menos configurações" : "Mais configurações"}
              {showMore ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
          </>
        )}

        {showMore && (
          <div style={{ marginTop: 16 }}>
            {effectGroups.map((group) => (
              <div key={group.title} className="effectGroup">
                <div className="effectGroupTitle">{group.title}</div>
                {group.items.map(([enableKey, valueKey, label, suffix, min, max]) => {
                  const enabled = Boolean(controls.effects?.[enableKey]);
                  const raw = controls.effects?.[valueKey] ?? effectDefaults[valueKey];
                  const displayed = displayEffectValue(valueKey, raw);
                  return (
                    <EffectSliderRow
                      key={valueKey}
                      label={label}
                      enabled={enabled}
                      value={displayed}
                      min={min}
                      max={max}
                      suffix={suffix}
                      onToggle={() => updateEffects({ [enableKey]: !enabled })}
                      onChange={(v) => updateEffects({ [valueKey]: storeEffectValue(valueKey, v) })}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="panelActions">
          <button onClick={onApplyPreset}>
            <ArrowClockwise size={14} /> Restaurar
          </button>
          <button className="primary" onClick={onApplyPreset}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}

function PanelSlider({ label, value, onChange }) {
  return (
    <div className="panelSlider">
      <span className="sliderLabel">{label}</span>
      <input type="range" min={0} max={100} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="sliderValue">{value}</span>
    </div>
  );
}

/* ============================================================
   VOICE LAB PAGE (Premium Modular Tweak Lab)
   ============================================================ */

function VoiceLabPage({ state, call, updateControls, updateEffects, customVoices, setCustomVoices, setToast, setPage, customVoiceCategories }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Customizadas");
  const [emoji, setEmoji] = useState("🎤");

  const saveVoice = () => {
    if (!name.trim()) { setToast("Nome da voz é obrigatório."); return; }
    const newVoice = {
      id: `custom_${Date.now()}`,
      label: name.trim(),
      description: description.trim() || "Voz personalizada de estúdio",
      emoji,
      category,
      gradient: "linear-gradient(135deg, #1e1b4b, #311042)",
      gain: state.controls.gain,
      pitch: state.controls.pitch,
      effects: { ...state.controls.effects }
    };
    setCustomVoices((prev) => [...prev, newVoice]);
    setToast(`Voz "${name}" salva com snapshots de estúdio!`);
    setName("");
    setDescription("");
  };

  const deleteCustomVoice = (voiceId) => {
    setCustomVoices((prev) => prev.filter((v) => v.id !== voiceId));
    setToast("Voz personalizada removida.");
  };

  const exportVoices = () => {
    const data = JSON.stringify(customVoices, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "micfudido_vozes.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importVoices = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (Array.isArray(imported)) {
          setCustomVoices((prev) => [...prev, ...imported.map((v) => ({ ...v, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}` }))]);
          setToast(`${imported.length} voz(es) importada(s)!`);
        }
      } catch { setToast("Erro ao importar arquivo."); }
    };
    input.click();
  };

  const activateAllAtMax = () => {
    const maxControls = {
      pitch: 36,
      gain: 100,
      effects: {
        ...state.controls?.effects,
        // Principal
        distortion_enabled: true,
        distortion_drive: 200,
        output_volume_enabled: true,
        output_volume: 100,
        robot_enabled: true,
        robot_rate_hz: 500,
        reverb_enabled: true,
        reverb_mix: 1.0,
        // Espaço
        echo_enabled: true,
        echo_mix: 1.0,
        delay_enabled: true,
        delay_mix: 1.0,
        chorus_enabled: true,
        chorus_mix: 1.0,
        flanger_enabled: true,
        flanger_mix: 1.0,
        bitcrush_enabled: true,
        bitcrush_bits: 12,
        equalizer_enabled: true,
        equalizer_tone: 1.0,
        // Especiais
        megaphone_enabled: true,
        megaphone_drive: 40,
        telephone_enabled: true,
        telephone_mix: 1.0,
        demon_enabled: true,
        demon_drive: 40,
        alien_enabled: true,
        alien_rate_hz: 500,
        whisper_enabled: true,
        whisper_mix: 1.0,
        compressor_enabled: true,
        compressor_amount: 1.0,
        wobble_enabled: true,
        wobble_mix: 1.0,
        reverse_enabled: true,
        reverse_mix: 1.0,
        alien_glitch_enabled: true,
        alien_glitch_mix: 1.0
      }
    };
    updateControls(maxControls);
    setToast("💥 FUDIDDO AO EXTREMO! Todos os efeitos ativados no máximo!");
  };

  const modules = [
    {
      title: "🚀 Controles Principais de Áudio (Escala até 1000%)",
      items: [
        { key: "pitch", label: "Tom (Pitch)", icon: WaveSine, min: -36, max: 36, step: 1, suffix: "st", isControl: true },
        { key: "gain", label: "Ganho de Entrada", icon: Microphone, min: 0, max: 100, step: 0.1, suffix: "x", isControl: true },
        { key: "distortion_drive", label: "Gain Boost (Saturação)", icon: WaveSawtooth, min: 1, max: 200, step: 1, suffix: "x", isControl: false, enableKey: "distortion_enabled" },
        { key: "output_volume", label: "Volume de Saída", icon: SpeakerHigh, min: 0, max: 100, step: 0.1, suffix: "x", isControl: false, enableKey: "output_volume_enabled" },
        { key: "robot_rate_hz", label: "Modulador de Formante", icon: Robot, min: 5, max: 500, step: 1, suffix: "Hz", isControl: false, enableKey: "robot_enabled" },
        { key: "reverb_mix", label: "Efeito Mix (Reverb)", icon: Ghost, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "reverb_enabled" }
      ]
    },
    {
      title: "🌌 Espaço & Textura (Escala até 1000%)",
      items: [
        { key: "echo_mix", label: "Eco / Retardo", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "echo_enabled" },
        { key: "delay_mix", label: "Delay Tridimensional", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "delay_enabled" },
        { key: "chorus_mix", label: "Stereo Width (Chorus)", icon: Sparkle, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "chorus_enabled" },
        { key: "flanger_mix", label: "Flanger", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "flanger_enabled" },
        { key: "bitcrush_bits", label: "Bitcrush (Redução)", icon: Circuitry, min: 3, max: 12, step: 1, suffix: "bits", isControl: false, enableKey: "bitcrush_enabled" },
        { key: "equalizer_tone", label: "Equalizador", icon: ChartBar, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "equalizer_enabled" }
      ]
    },
    {
      title: "👾 Efeitos Especiais Extremos (Escala até 1000%)",
      items: [
        { key: "megaphone_drive", label: "Megafone", icon: Megaphone, min: 1, max: 40, step: 0.5, suffix: "x", isControl: false, enableKey: "megaphone_enabled" },
        { key: "telephone_mix", label: "Telefone", icon: Phone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "telephone_enabled" },
        { key: "demon_drive", label: "Distorção Demoníaca", icon: Robot, min: 1, max: 40, step: 0.5, suffix: "x", isControl: false, enableKey: "demon_enabled" },
        { key: "alien_rate_hz", label: "Alienígena Ring Mod", icon: Circuitry, min: 20, max: 500, step: 1, suffix: "Hz", isControl: false, enableKey: "alien_enabled" },
        { key: "whisper_mix", label: "Sussurro", icon: Microphone, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "whisper_enabled" },
        { key: "compressor_amount", label: "Compressor / Limiter", icon: SlidersHorizontal, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "compressor_enabled" },
        { key: "wobble_mix", label: "Vibrato Wobble", icon: Sparkle, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "wobble_enabled" },
        { key: "reverse_mix", label: "Reverse", icon: ArrowCounterClockwise, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "reverse_enabled" },
        { key: "alien_glitch_mix", label: "Glitch", icon: Circuitry, min: 0, max: 1.0, step: 0.01, suffix: "%", isPercent: true, isControl: false, enableKey: "alien_glitch_enabled" }
      ]
    }
  ];

  return (
    <div className="voiceLab">
      <div className="labHeader">
        <h2>🧪 Modular Voice Lab v3.0</h2>
        <p>Desenhe e modele timbres e efeitos premium com snaps analógicos em tempo real</p>
      </div>

      <div className="voice-lab-grid-modular">
        {/* Left: Identity Snapshot */}
        <div className="voice-lab-card-modular" style={{ alignSelf: "flex-start" }}>
          <div className="voice-lab-module-title">
            <Sparkle size={18} color="var(--purple)" />
            <span>Perfil da Voz Customizada</span>
          </div>

          <div className="labField">
            <label>Nome do Preset</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Megafone Cyber" />
          </div>
          <div className="labField">
            <label>Descrição Opcional</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Modelagem de tom puxada..." style={{ minHeight: 70 }} />
          </div>
          <div className="labField">
            <label>Categoria principal</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {[...voiceCategories.filter((c) => !["Todas", "Favoritas", "Recentes"].includes(c)), ...(customVoiceCategories || [])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="labField">
            <label>Ícone (Emoji)</label>
            <input type="text" value={emoji} onChange={(e) => setEmoji(e.target.value)} style={{ width: 60, fontSize: 22, textAlign: "center" }} />
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 6 }}>
            <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 800, marginBottom: 8 }}>Snap do Motor de Áudio:</div>
            <div style={{ display: "flex", gap: 10, fontSize: 12 }}>
              <span style={{ color: "var(--text-secondary)" }}>Ganho: <strong>{Number(state.controls?.gain ?? 1).toFixed(1)}x</strong></span>
              <span style={{ color: "var(--border-active)" }}>Tom: <strong>{Number(state.controls?.pitch ?? 0).toFixed(0)} st</strong></span>
              <span style={{ color: "var(--cyan)" }}>Módulos Ativos: <strong>{countEnabledEffects(state.controls?.effects)}</strong></span>
            </div>
          </div>
        </div>

        {/* Right: Modular Effects Studio Grid */}
        <div className="voice-lab-card-modular">
          <div className="voice-lab-module-title">
            <FadersHorizontal size={18} color="var(--cyan)" />
            <span>Painel Modular de Efeitos (Escala Premium 0% a 1000%)</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxHeight: "68vh", overflowY: "auto", paddingRight: 6 }}>
            {modules.map((group) => (
              <div key={group.title} className="effectGroup" style={{ marginBottom: 4 }}>
                <div className="effectGroupTitle">{group.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {group.items.map((item) => {
                    const isControl = item.isControl;
                    const enabled = isControl ? true : Boolean(state.controls?.effects?.[item.enableKey]);
                    const raw = isControl ? state.controls?.[item.key] : (state.controls?.effects?.[item.key] ?? effectDefaults[item.key]);
                    
                    const maxVal = item.max;
                    let sliderPct;
                    if (item.key === "pitch") {
                      sliderPct = Math.round(((Number(raw) + 24) / 48) * 1000);
                    } else if (item.key === "robot_rate_hz") {
                      sliderPct = Math.round(((Number(raw) - 5) / 245) * 1000);
                    } else if (item.key === "alien_rate_hz") {
                      sliderPct = Math.round(((Number(raw) - 20) / 280) * 1000);
                    } else if (item.key === "bitcrush_bits") {
                      sliderPct = Math.round(((Number(raw) - 3) / 9) * 1000);
                    } else {
                      sliderPct = Math.round((Number(raw) / maxVal) * 100);
                    }

                    const handleSliderChange = (e) => {
                      const pct = Number(e.target.value); // 0 to 1000
                      let val;
                      if (item.key === "pitch") {
                        val = (pct / 1000) * 48 - 24;
                      } else if (item.key === "robot_rate_hz") {
                        val = (pct / 1000) * 245 + 5;
                      } else if (item.key === "alien_rate_hz") {
                        val = (pct / 1000) * 280 + 20;
                      } else if (item.key === "bitcrush_bits") {
                        val = Math.round((pct / 1000) * 9 + 3);
                      } else {
                        val = (pct / 100) * maxVal;
                      }
                      
                      if (isControl) {
                        updateControls({ [item.key]: val });
                      } else {
                        updateEffects({ [item.key]: val, [item.enableKey]: true });
                      }
                    };

                    const handleToggle = () => {
                      if (isControl) return;
                      updateEffects({ [item.enableKey]: !enabled });
                    };

                    const Icon = item.icon;
                    const showClipping = sliderPct > 200;

                    return (
                      <div key={item.key} className={`voice-lab-effect-card ${enabled ? "active" : ""}`}>
                        <div className="voice-lab-effect-header">
                          <div className="voice-lab-effect-title-group">
                            <Icon size={16} weight="duotone" />
                            <span className="voice-lab-effect-name">
                              {item.label}
                              {showClipping && <span className="clipping-alert-badge">🔥 OVERDRIVE</span>}
                            </span>
                          </div>
                          {!isControl ? (
                            <label className="toggleSwitch" style={{ scale: 0.8 }}>
                              <input type="checkbox" checked={enabled} onChange={handleToggle} />
                              <span className="toggleTrack" />
                            </label>
                          ) : (
                            <span className="voice-lab-status-badge">Fixo</span>
                          )}
                        </div>
                        
                        <div className="voice-lab-effect-control">
                          <div className="voice-lab-effect-slider">
                            <input
                              type="range"
                              min={0}
                              max={1000}
                              step={5}
                              value={sliderPct}
                              onChange={handleSliderChange}
                              disabled={!enabled && !isControl}
                              style={{ width: "100%", cursor: enabled || isControl ? "pointer" : "not-allowed" }}
                            />
                          </div>
                          <span className="voice-lab-effect-value">
                            {isControl 
                              ? (item.key === "pitch" ? `${Number(raw).toFixed(0)}st` : `${Number(raw).toFixed(1)}x`)
                              : `${Math.round(sliderPct)}%`
                            }
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="labActions" style={{ marginTop: 28 }}>
        <button
          className="labSaveBtn"
          onClick={activateAllAtMax}
          style={{
            background: "linear-gradient(135deg, #ef4444, #b91c1c)",
            border: "1px solid #f87171",
            boxShadow: "0 0 15px rgba(239, 68, 68, 0.4)",
            fontWeight: 800,
            color: "#ffffff"
          }}
        >
          💥 ATIVAR TUDO NO MÁXIMO
        </button>
        <button className="labSaveBtn" onClick={saveVoice}>
          <FloppyDisk size={16} /> Salvar Snapshot Voz
        </button>
        <button className="labPreviewBtn" onClick={() => setToast("Preview Analógico: Ajuste os sliders modulares e fale no mic com o processamento Ativo!")}>
          <Play size={16} /> Ouvir Prévia
        </button>
        <button className="labPreviewBtn" onClick={exportVoices}>
          <Export size={16} /> Exportar Biblioteca
        </button>
        <button className="labPreviewBtn" onClick={importVoices}>
          <UploadSimple size={16} /> Importar Presets
        </button>
      </div>

      {/* Custom voices list */}
      {customVoices.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="sectionHeader">SUA BIBLIOTECA DE VOZES CUSTOMIZADAS</div>
          <div className="voiceGrid">
            {customVoices.map((voice) => (
              <div key={voice.id} className="voiceCard" style={{ position: "relative" }}>
                <div className="cardImage">
                  <div className="cardGradient" style={{ background: voice.gradient }} />
                  <span className="cardEmoji">{voice.emoji}</span>
                </div>
                <div className="cardInfo">
                  <div className="cardName">{voice.label}</div>
                  <div className="cardDesc">{voice.description}</div>
                </div>
                <button
                  className="favBtn"
                  onClick={() => deleteCustomVoice(voice.id)}
                  title="Remover"
                  style={{ color: "var(--danger)", background: "none", border: "none", cursor: "pointer", zIndex: 3 }}
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SOUNDBOARD PAGE
   ============================================================ */

function SoundboardPage({ state, call, selected, selectedSound, setSelectedSound, setToast, selectedRecordDevices, setSelectedRecordDevices, soundboardFavorites, toggleSoundboardFavorite, updateControls, customCategories, setCustomCategories, promptState, setPromptState, setMoveCategorySoundId }) {
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
    // Sort so favorites are at the top
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

  // Import functions
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

  // Keyboard undo
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

  // Close context menu on click
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

      {/* Toolbar */}
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

      {/* Recording controls */}
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

      {/* Categories */}
      <div className="categoryPills">
        {categories.map((cat) => (
          <button key={cat} className={category === cat ? "active" : ""} onClick={() => setCategory(cat)}>
            {cat}
          </button>
        ))}
      </div>


      {/* Grid */}
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
                  onMouseDown={(e) => {
                    if (e.button === 0) {
                      call("/api/sounds/play", { id: sound.id }).catch((e) => setToast(e.message));
                    }
                  }}
                  onClick={() => { setSelectedSound(sound.id); }}
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
          />
        )}
      </div>

      {/* Advanced Sound Editor Modal Overlay */}
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

      {/* Drag overlay */}
      {dragActive && (
        <div className="dropOverlay">
          <UploadSimple size={32} /> Solte para importar no Soundboard
        </div>
      )}

      {/* Context menu */}
      {/* Context menu */}
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

/* ============================================================
   ADVANCED WAVEFORM EDITOR & TIMELINE
   ============================================================ */

function WaveformVisualizer({ soundId, path, start, end, duration, onUpdateTrim, playingPosition }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(null);

  // Generate a beautiful, deterministic wave shape from the sound ID
  const peaks = useMemo(() => {
    const list = [];
    let seed = 0;
    const key = String(soundId || "clean");
    for (let i = 0; i < key.length; i++) {
      seed += key.charCodeAt(i);
    }
    const nextRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < 300; i++) {
      const envelope = Math.sin((i / 300) * Math.PI) * 0.4 + Math.sin((i / 300) * Math.PI * 4) * 0.3 + 0.3;
      const noise = nextRandom() * 0.4;
      list.push(Math.min(1.0, Math.max(0.05, (envelope + noise) * 0.85)));
    }
    return list;
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

/* ============================================================
   ADVANCED SOUND EDITOR MODAL
   ============================================================ */

function AdvancedSoundEditorModal({ state, selected, onClose, call, setToast, onDelete, soundboardFavorites, toggleSoundboardFavorite }) {
  const [draft, setDraft] = useState({});
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState("");
  const [showEffects, setShowEffects] = useState(true);

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
        output_route: draft.output_route ?? "both",
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

  const isFav = soundboardFavorites.includes(selected.id);

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

/* ============================================================
   AUDIO PLAYER
   ============================================================ */

function AudioPlayer({ state, selected, call, pinnedSoundId, setPinnedSoundId, setSelectedSound }) {
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

/* ============================================================
   FAVORITOS PAGE
   ============================================================ */

function FavoritosPage({ state, call, favorites, toggleFavorite, updateControls, applyVoicePreset, selectedVoice, setSelectedVoice, setSelectedSound, setPage, customVoices }) {
  const allVoices = [...visibleVoicePresets, ...customVoices];
  const favoriteVoices = allVoices.filter((v) => favorites.includes(v.id));
  const recentSounds = [...(state.sounds || [])].sort((a, b) => Number(b.last_played_at || 0) - Number(a.last_played_at || 0)).slice(0, 8);
  const customList = customVoices;

  return (
    <div>
      <div className="labHeader">
        <h2>⭐ Favoritos</h2>
        <p>Suas vozes e sons favoritos em um só lugar</p>
      </div>

      {/* Favorite voices */}
      <div className="favSection">
        <div className="favSectionTitle"><Star size={18} weight="fill" color="var(--purple)" /> Vozes Favoritas</div>
        {favoriteVoices.length > 0 ? (
          <div className="voiceGrid">
            {favoriteVoices.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isActive={isVoicePresetActive(state?.controls, voice)}
                isFavorite={true}
                onSelect={() => {
                  setSelectedVoice(voice.id);
                  applyVoicePreset(voice);
                  setPage("vozes");
                }}
                onToggleFavorite={() => toggleFavorite(voice.id)}
              />
            ))}
          </div>
        ) : (
          <div className="favEmpty">Nenhuma voz favorita. Marque vozes como favorita na página de Vozes.</div>
        )}
      </div>

      {/* Recent sounds */}
      <div className="favSection">
        <div className="favSectionTitle"><ArrowClockwise size={18} color="var(--cyan)" /> Recentes</div>
        {recentSounds.length > 0 ? (
          <div className="soundGrid">
            {recentSounds.map((sound) => (
              <div
                key={sound.id}
                className="soundCard"
                onClick={() => call("/api/sounds/play", { id: sound.id }).catch(() => {})}
              >
                <div className="soundCover" style={{ background: `color-mix(in srgb, ${sound.color || "#8B5CF6"} 20%, var(--bg-card-secondary))` }}>
                  {sound.coverUrl ? <img src={sound.coverUrl} alt="" /> : <MusicNotes size={18} />}
                </div>
                <div className="soundName">{sound.name.replace(/\.[^/.]+$/, "")}</div>
                <div className="soundCategory">
                  {sound.category || ""} • {formatTime(sound.duration)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="favEmpty">Nenhum som reproduzido recentemente.</div>
        )}
      </div>

      {/* Custom voices */}
      {customList.length > 0 && (
        <div className="favSection">
          <div className="favSectionTitle"><Flask size={18} color="var(--green)" /> Vozes Personalizadas</div>
          <div className="voiceGrid">
            {customList.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                isActive={isVoicePresetActive(state?.controls, voice)}
                isFavorite={favorites.includes(voice.id)}
                onSelect={() => {
                  applyVoicePreset(voice);
                  setPage("vozes");
                }}
                onToggleFavorite={() => toggleFavorite(voice.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIG PAGE
   ============================================================ */

function HotkeyInput({ label, value, onChange, onClear }) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const keys = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.shiftKey) keys.push("Shift");
    if (e.altKey) keys.push("Alt");
    if (e.metaKey) keys.push("Win");
    
    const key = e.key.toUpperCase();
    if (key !== "CONTROL" && key !== "SHIFT" && key !== "ALT" && key !== "META") {
      keys.push(key);
    }
    
    const nextVal = keys.join("+");
    if (nextVal) {
      onChange(nextVal);
      setIsRecording(false);
    }
  };

  return (
    <div className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div className="settingInfo">
        <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      </div>
      <div className="settingControl" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          className="btn"
          style={{
            minWidth: 140,
            fontSize: 11,
            padding: "6px 12px",
            background: isRecording ? "var(--purple)" : "var(--bg-input)",
            border: isRecording ? "1px solid var(--purple-hover)" : "1px solid var(--border)",
            color: isRecording ? "#fff" : "var(--text)",
            cursor: "pointer",
            fontWeight: 800,
            textTransform: "uppercase",
            borderRadius: 6
          }}
          onClick={() => setIsRecording(!isRecording)}
          onKeyDown={isRecording ? handleKeyDown : undefined}
          tabIndex={0}
        >
          {isRecording ? "Pressione as teclas..." : (value || "Clique para gravar")}
        </button>
        {value && (
          <button
            className="btn btn-ghost"
            onClick={onClear}
            style={{ padding: "4px 8px", color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", fontSize: 11 }}
          >
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}

function ConfigPage({ state, call, setToast, selectedRecordDevices, setSelectedRecordDevices, setPage, accentColor, setAccentColor, updateEffects }) {
  const [tab, setTab] = useState("audio");

  return (
    <div>
      <div className="labHeader">
        <h2>⚙️ Configurações</h2>
        <p>Gerencie dispositivos, aparência, atalhos e manutenção</p>
      </div>

      <div className="config-layout">
        {/* Settings Sidebar */}
        <div className="config-sidebar">
          <button
            className={`config-sidebar-btn ${tab === "audio" ? "active" : ""}`}
            onClick={() => setTab("audio")}
          >
            <MicrophoneStage size={18} weight="duotone" />
            <span>Áudio e Mic</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "aparencia" ? "active" : ""}`}
            onClick={() => setTab("aparencia")}
          >
            <Palette size={18} weight="duotone" />
            <span>Aparência</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "atalhos" ? "active" : ""}`}
            onClick={() => setTab("atalhos")}
          >
            <Keyboard size={18} weight="duotone" />
            <span>Atalhos</span>
          </button>
          <button
            className={`config-sidebar-btn ${tab === "manutencao" ? "active" : ""}`}
            onClick={() => setTab("manutencao")}
          >
            <Lightning size={18} weight="duotone" />
            <span>Manutenção</span>
          </button>
        </div>

        {/* Settings Content Area */}
        <div className="config-content" style={{ flex: 1 }}>
          {tab === "audio" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <MicrophoneStage size={18} />
                <span>Dispositivos de Entrada e Saída</span>
              </div>

              {!state.virtualCableDetected && (
                <div style={{
                  background: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.25)",
                  borderRadius: "var(--radius-sm)",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
                    <span>⚠️ Cabo Virtual Não Detectado!</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                    O driver de cabo de áudio virtual (VB-CABLE) não foi encontrado no sistema. Para usar o voice changer e o soundboard no Discord, você precisa dele instalado.
                  </p>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <a href="https://vb-audio.com/Cable/" target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 11, background: "var(--danger)", textDecoration: "none", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }}>
                      📥 Baixar VB-CABLE
                    </a>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <SelectField
                  label="Dispositivo de entrada"
                  value={state.selected?.input}
                  items={state.devices?.inputs || []}
                  onChange={(v) => call("/api/selection", { input: v })}
                />
                <SelectField
                  label="Dispositivo de saída (virtual)"
                  value={state.selected?.output}
                  items={state.devices?.outputs || []}
                  onChange={(v) => call("/api/selection", { output: v })}
                />
                <SelectField
                  label="Dispositivo de monitor"
                  value={state.selected?.monitor}
                  items={state.devices?.outputs || []}
                  onChange={(v) => call("/api/selection", { monitor: v })}
                  allowNone
                />
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => call("/api/devices/refresh").then(() => setToast("Dispositivos atualizados!"))}>
                  <ArrowClockwise size={14} /> Atualizar dispositivos
                </button>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <MicrophoneSlash size={18} />
                  <span>Redução de Ruído (Noise Gate)</span>
                </div>
                <ToggleSetting
                  label="Ativar Noise Gate"
                  description="Impede a transmissão de ruídos de fundo quando você não está falando"
                  checked={state.controls?.effects?.noise_gate_enabled}
                  onChange={(v) => updateEffects({ noise_gate_enabled: v })}
                />
                {state.controls?.effects?.noise_gate_enabled && (
                  <div style={{ marginTop: 12 }}>
                    <Slider
                      label="Sensibilidade do Gate"
                      value={state.controls?.effects?.noise_gate_threshold * 100}
                      min={0}
                      max={40}
                      suffix="%"
                      onChange={(v) => updateEffects({ noise_gate_threshold: v / 100 })}
                    />
                    <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                      Valores maiores silenciam ruídos mais altos, mas podem cortar palavras sussurradas.
                    </small>
                  </div>
                )}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <FadersHorizontal size={18} />
                  <span>Configurações Adicionais</span>
                </div>
                <ToggleSetting
                  label="Iniciar rota automaticamente"
                  description="Ativar rota de áudio virtual ao iniciar o MicFudido"
                  checked={state.settings?.autoStartVirtual}
                  onChange={(v) => call("/api/settings", { autoStartVirtual: v })}
                />
                <ToggleSetting
                  label="Restaurar microfone original"
                  description="Restaurar o microfone padrão do Windows ao fechar o app"
                  checked={state.settings?.restoreOnDisable}
                  onChange={(v) => call("/api/settings", { restoreOnDisable: v })}
                />
                {state.settings?.restoreOnDisable && (
                  <div className="selectField" style={{ marginTop: 12 }}>
                    <label>Microfone padrão ao fechar o app</label>
                    <select
                      value={state.settings?.defaultMicOnClose || "restore"}
                      onChange={(e) => call("/api/settings", { defaultMicOnClose: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text)",
                        outline: "none",
                        fontSize: 12
                      }}
                    >
                      <option value="restore">Restaurar microfone anterior (Recomendado)</option>
                      <option value="keep">Manter microfone atual</option>
                      <option value="choose">Escolher microfone ao fechar</option>
                      {(state.windowsCaptureEndpoints || []).map((ep) => (
                        <option key={ep.id} value={ep.id}>{ep.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  <Slider
                    label="Volume máximo dos sons"
                    value={Number(state.settings?.maxSoundVolume ?? 1.0) * 100}
                    min={0}
                    max={200}
                    suffix="%"
                    onChange={(v) => call("/api/settings", { maxSoundVolume: String(v / 100) })}
                  />
                  <small style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                    Define um limite máximo global para o volume de reprodução de todos os sons do soundboard.
                  </small>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <XCircle size={18} />
                  <span>Fechamento do Aplicativo</span>
                </div>
                <ToggleSetting
                  label="Confirmar fechamento"
                  description="Exibir confirmação com opções ao tentar fechar o aplicativo"
                  checked={state.settings?.confirmClose !== false}
                  onChange={(v) => call("/api/settings", { confirmClose: v })}
                />
                <div className="selectField" style={{ marginTop: 12 }}>
                  <label>Ação padrão ao fechar o app</label>
                  <select
                    value={state.settings?.closeBehavior || "ask"}
                    onChange={(e) => call("/api/settings", { closeBehavior: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      color: "var(--text)",
                      outline: "none",
                      fontSize: 12
                    }}
                  >
                    <option value="ask">Perguntar toda vez (Padrão)</option>
                    <option value="tray">Minimizar para a bandeja / sistema</option>
                    <option value="quit">Encerrar o aplicativo totalmente</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {tab === "aparencia" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Palette size={18} />
                <span>Personalização Visual</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Escolha a paleta de cores para os realces, neon e botões do MicFudido Studio:
              </p>

              <div className="palette-grid">
                {Object.entries(colorPalettes).map(([key, item]) => (
                  <button
                    key={key}
                    className={`palette-btn ${accentColor === key ? "active" : ""}`}
                    style={{ "--palette-color": item.primary }}
                    onClick={() => setAccentColor(key)}
                  >
                    <span className="palette-color-dot" style={{ backgroundColor: item.primary }} />
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{item.label}</span>
                  </button>
                ))}
              </div>

              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Tema Integrado</span>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                  O MicFudido Studio utiliza o tema premium Cyberpunk Escuro por padrão, otimizado para não forçar os olhos durante longas jogatinas e transmissões ao vivo.
                </p>
              </div>
            </div>
          )}

          {tab === "atalhos" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Keyboard size={18} />
                <span>Atalhos Globais do Sistema</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Configure atalhos globais de sistema para acionar funções rápidas mesmo com o aplicativo em segundo plano.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <HotkeyInput
                  label="Mutar Microfone"
                  value={state.settings?.shortcutMuteMic}
                  onChange={(val) => call("/api/settings", { shortcutMuteMic: val })}
                  onClear={() => call("/api/settings", { shortcutMuteMic: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Efeitos (Bypass)"
                  value={state.settings?.shortcutToggleBypass}
                  onChange={(val) => call("/api/settings", { shortcutToggleBypass: val })}
                  onClear={() => call("/api/settings", { shortcutToggleBypass: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Retorno do Soundboard"
                  value={state.settings?.shortcutToggleSoundboard}
                  onChange={(val) => call("/api/settings", { shortcutToggleSoundboard: val })}
                  onClear={() => call("/api/settings", { shortcutToggleSoundboard: "" })}
                />
                <HotkeyInput
                  label="Ativar/Desativar Voice Changer"
                  value={state.settings?.shortcutToggleVoiceChanger}
                  onChange={(val) => call("/api/settings", { shortcutToggleVoiceChanger: val })}
                  onClear={() => call("/api/settings", { shortcutToggleVoiceChanger: "" })}
                />
                <HotkeyInput
                  label="Gravar Voz (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordVoice}
                  onChange={(val) => call("/api/settings", { shortcutRecordVoice: val })}
                  onClear={() => call("/api/settings", { shortcutRecordVoice: "" })}
                />
                <HotkeyInput
                  label="Gravar Som do PC (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordPC}
                  onChange={(val) => call("/api/settings", { shortcutRecordPC: val })}
                  onClear={() => call("/api/settings", { shortcutRecordPC: "" })}
                />
                <HotkeyInput
                  label="Gravar Voz + Som do PC (Iniciar/Parar)"
                  value={state.settings?.shortcutRecordCombo}
                  onChange={(val) => call("/api/settings", { shortcutRecordCombo: val })}
                  onClear={() => call("/api/settings", { shortcutRecordCombo: "" })}
                />
              </div>

              <div className="labCardTitle" style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <MusicNotes size={18} />
                <span>Atalhos do Soundboard Cadastrados</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                Para adicionar ou modificar um atalho de áudio, abra a aba Soundboard, selecione o som desejado e pressione as teclas no campo de atalho.
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {(state.sounds || []).filter((s) => s.shortcut).map((sound) => (
                  <div key={sound.id} className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div className="settingInfo">
                      <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{sound.name}</div>
                      <div className="settingDesc" style={{ fontSize: 11, color: "var(--text-muted)" }}>{sound.category || "Soundboard"}</div>
                    </div>
                    <div className="settingControl">
                      <span style={{ fontSize: 11, padding: "4px 10px", background: "var(--purple-soft)", border: "1px solid var(--purple)", borderRadius: 6, color: "var(--purple)", fontWeight: 800, textTransform: "uppercase" }}>
                        {sound.shortcut}
                      </span>
                    </div>
                  </div>
                ))}
                {!(state.sounds || []).some((s) => s.shortcut) && (
                  <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "32px 0", border: "1px dashed var(--border)", borderRadius: "var(--radius-sm)" }}>
                    Nenhum atalho configurado até o momento.
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "manutencao" && (
            <div className="labCard" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="labCardTitle">
                <Lightning size={18} />
                <span>Manutenção do Sistema</span>
              </div>
              
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "voice" }).then(() => setToast("Configurações de voz restauradas!"))}>
                  Restaurar voz padrão
                </button>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "effects" }).then(() => setToast("Efeitos de voz limpos!"))}>
                  Restaurar efeitos
                </button>
                <button className="btn btn-ghost" style={{ border: "1px solid var(--border)", justifyContent: "center" }} onClick={() => call("/api/reset-section", { section: "soundboard" }).then(() => setToast("Sons restaurados!"))}>
                  Restaurar soundboard
                </button>
                <button className="btn btn-danger" style={{ justifyContent: "center" }} onClick={() => { if(confirm("Deseja realmente apagar todas as configurações e presets?")) call("/api/reset").then(() => setToast("Reset completo efetuado!")); }}>
                  Reset de fábrica completo
                </button>
              </div>

              {/* Soundboard Settings */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <MusicNotes size={18} />
                  <span>Comportamento do Soundboard</span>
                </div>
                <ToggleSetting
                  label="Sobrepor reprodução de sons"
                  description="Permite tocar múltiplos sons simultaneamente no soundboard"
                  checked={state.settings?.allowMultipleSounds}
                  onChange={(v) => call("/api/settings", { allowMultipleSounds: v })}
                />
              </div>

              {/* PC Recording Toggles */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 8 }}>
                  <Record size={18} />
                  <span>Fontes para Gravação de Som do PC</span>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                  Selecione os canais de áudio que deseja capturar ao clicar em "Gravar PC".
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(state.recordDevices || []).map((device) => (
                    <div key={device.index} className="settingItem" style={{ background: "rgba(255,255,255,0.01)", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="settingInfo">
                        <div className="settingLabel" style={{ fontSize: 13, fontWeight: 700 }}>{device.name}</div>
                        <div className="settingDesc" style={{ fontSize: 11, color: "var(--text-muted)" }}>{device.is_loopback ? "Loopback (Saída)" : "Entrada (Captura)"}</div>
                      </div>
                      <div className="settingControl">
                        <label className="toggleSwitch">
                          <input
                            type="checkbox"
                            checked={selectedRecordDevices.includes(device.index)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selectedRecordDevices, device.index]
                                : selectedRecordDevices.filter((i) => i !== device.index);
                              setSelectedRecordDevices(next);
                              call("/api/record/selection", { indexes: next });
                            }}
                          />
                          <span className="toggleTrack" />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* System Diagnostics */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                <div className="labCardTitle" style={{ marginBottom: 12 }}>
                  <ChartBar size={18} />
                  <span>Diagnósticos de Áudio</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <StatusLine label="Serviço de Processamento" value={state.running ? "ONLINE" : "OFFLINE"} active={state.running} />
                  <StatusLine label="Integração Virtual Windows" value={state.virtualMode ? "ONLINE" : "OFFLINE"} active={state.virtualMode} />
                  <StatusLine label="Hardware de Entrada (Mic)" value={deviceName(state.devices?.inputs, state.selected?.input)} />
                  <StatusLine label="Hardware de Saída (CABLE)" value={deviceName(state.devices?.outputs, state.selected?.output)} />
                  <StatusLine label="Monitor de Áudio Local" value={deviceName(state.devices?.outputs, state.selected?.monitor)} />
                  {state.sampleRate && <StatusLine label="Taxa de Amostragem do Driver" value={`${state.sampleRate} Hz`} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SHARED COMPONENTS
   ============================================================ */

function Slider({ label, value, min, max, suffix, onChange, enabled, onToggle, quadratic }) {
  const toSlider = (val) => quadratic ? Math.sqrt(val) : val;
  const fromSlider = (val) => quadratic ? Math.pow(val, 2) : val;

  const [localValue, setLocalValue] = useState(() => toSlider(value));
  const [isDragging, setIsDragging] = useState(false);
  const commitTimerRef = useRef(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setLocalValue(toSlider(value));
  }, [value]);

  const commit = (v) => {
    clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => onChange(fromSlider(v)), 90);
  };

  const handleChange = (e) => {
    const v = Number(e.target.value);
    setLocalValue(v);
    commit(v);
  };

  const displayVal = fromSlider(localValue);
  const formattedText = suffix === "x"
    ? `${displayVal.toFixed(displayVal < 10 ? 1 : 0)}x`
    : (suffix ? `${Math.round(displayVal)}${suffix}` : `${Math.round(displayVal)}`);

  return (
    <div className="sliderRow">
      {onToggle && (
        <label className="effectToggle">
          <input type="checkbox" checked={enabled} onChange={() => onToggle()} />
          <span className="etTrack" />
        </label>
      )}
      <span className="sliderRowLabel">{label}</span>
      <div className="sliderTrack">
        <input
          type="range" min={min} max={max} step={quadratic ? 0.05 : (max - min > 50 ? 1 : 0.1)}
          value={localValue}
          onChange={handleChange}
          onMouseDown={() => { setIsDragging(true); draggingRef.current = true; }}
          onMouseUp={() => { setIsDragging(false); draggingRef.current = false; }}
          onTouchStart={() => { setIsDragging(true); draggingRef.current = true; }}
          onTouchEnd={() => { setIsDragging(false); draggingRef.current = false; }}
        />
      </div>
      <span className="sliderRowValue">{formattedText}</span>
    </div>
  );
}

function EffectSliderRow({ label, enabled, value, min, max, suffix, onToggle, onChange }) {
  const Icon = effectIconFor(label);
  return (
    <div className="sliderRow">
      <label className="effectToggle">
        <input type="checkbox" checked={enabled} onChange={onToggle} />
        <span className="etTrack" />
      </label>
      <span className="sliderRowLabel">
        <Icon size={14} className="effectIcon" weight="duotone" />
        {label}
      </span>
      <div className="sliderTrack">
        <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
      <span className="sliderRowValue">{formatValue(value, suffix)}</span>
    </div>
  );
}

function ToggleSetting({ label, description, checked, onChange }) {
  return (
    <div className="settingItem">
      <div className="settingInfo">
        <div className="settingLabel">{label}</div>
        {description && <div className="settingDesc">{description}</div>}
      </div>
      <div className="settingControl">
        <label className="toggleSwitch">
          <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
          <span className="toggleTrack" />
        </label>
      </div>
    </div>
  );
}

function StatusLine({ label, value, active }) {
  return (
    <div className="settingItem">
      <div className="settingInfo">
        <div className="settingLabel">{label}</div>
      </div>
      <div className="settingControl">
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: active ? "var(--green)" : "var(--text-muted)"
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

function SelectField({ label, value, items, onChange, allowNone }) {
  return (
    <div className="selectField">
      <label>{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}>
        {allowNone && <option value="">Nenhum</option>}
        {(items || []).map((item) => (
          <option key={item.index} value={item.index}>{item.name}</option>
        ))}
      </select>
    </div>
  );
}

/* ============================================================
   WINDOW CONTROLS & MODALS
   ============================================================ */

function WindowControls({ onCloseRequest }) {
  const controls = window.micfudiddo;
  return (
    <div className="windowControls">
      <button title="Minimizar" onClick={() => controls?.minimize?.()}>
        <Minus size={16} />
      </button>
      <button title="Maximizar" onClick={() => controls?.toggleMaximize?.()}>
        <Square size={13} />
      </button>
      <button className="close" title="Fechar" onClick={onCloseRequest || (() => controls?.closeWithChoice?.())}>
        <X size={16} />
      </button>
    </div>
  );
}

function CloseChoiceModal({ onCancel, onMinimize, onQuit }) {
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

/* ============================================================
   SOUNDBOARD QUICK PANEL (Soundboard Quick Panel)
   ============================================================ */

function SoundboardQuickPanel({ sound, state, call, setToast, onClose, toggleSoundboardFavorite, isFavorite, setEditingSoundId }) {
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
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              onBlur={() => handleSaveField("category", category)}
              style={{ width: "100%", padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: 12 }}
            />
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
            
            {/* Volume slider */}
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

            {/* Loop Toggle */}
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

/* ============================================================
   YOUTUBE IMPORT MODAL
   ============================================================ */

function YoutubeImportModal({ onClose, call, setToast, state }) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  useEffect(() => {
    if (youtubeLoading && state?.status) {
      if (state.status.includes("importado do YouTube!")) {
        setYoutubeLoading(false);
        setToast(state.status);
        onClose();
      } else if (state.status.includes("Erro na importação")) {
        setYoutubeLoading(false);
        setToast(state.status);
      } else if (state.status.includes("cancelada")) {
        setYoutubeLoading(false);
        setToast("Importação cancelada!");
        onClose();
      }
    }
  }, [state?.status, youtubeLoading, setToast, onClose]);

  const handleImport = async () => {
    if (!youtubeUrl || !youtubeUrl.trim()) {
      setToast("Cole uma URL válida do YouTube.");
      return;
    }
    setYoutubeLoading(true);
    setToast("Verificando vídeo do YouTube...");
    try {
      await call("/api/sounds/import-youtube", { url: youtubeUrl.trim() });
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
              <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 700 }}>{state?.status || "Baixando..."}</span>
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

/* ============================================================
   ONLINE SOUNDS EXPLORER PAGE (Online Library)
   ============================================================ */

function OnlineSoundsPage({ state, call, setToast, soundboardFavorites, toggleSoundboardFavorite }) {
  const [queryInput, setQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedPill, setSelectedPill] = useState("Populares");
  const [sounds, setSounds] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState({});
  const [playingUrl, setPlayingUrl] = useState(null);
  const audioRef = useRef(null);

  const [minDur, setMinDur] = useState(0);
  const [maxDur, setMaxDur] = useState(300);
  const [showFilters, setShowFilters] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);

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

  // Buscar duração dinamicamente na nuvem (usando Audio metadata)
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

  const handleImport = async (sound) => {
    setDownloading((prev) => ({ ...prev, [sound.id]: "downloading" }));
    try {
      await call("/api/sounds/download", {
        id: sound.id,
        url: sound.url,
        name: sound.name,
        category: "Online",
        color: sound.color || "#8B5CF6",
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
              setShowYoutubePanel(false);
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
            onMouseEnter={(e) => { if (!showFilters) e.currentTarget.style.borderColor = "var(--purple-soft)"; }}
            onMouseLeave={(e) => { if (!showFilters) e.currentTarget.style.borderColor = "var(--border)"; }}
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
            onMouseEnter={(e) => { if (!showYoutubeModal) e.currentTarget.style.borderColor = "var(--purple-soft)"; }}
            onMouseLeave={(e) => { if (!showYoutubeModal) e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <YoutubeLogo size={16} color="#FF0000" />
            <span>Adicionar Som do YouTube</span>
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
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.borderColor = "var(--cyan)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
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
                        onClick={() => handleImport(sound)}
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
      </AnimatePresence>
    </div>
  );
}

/* ============================================================
   RENDER
   ============================================================ */

createRoot(document.getElementById("root")).render(<App />);
