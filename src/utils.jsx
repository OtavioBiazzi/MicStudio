import React, { useState, useEffect, useRef } from "react";
import {
  WaveSawtooth,
  Robot,
  Circuitry,
  SlidersHorizontal,
  MicrophoneSlash,
  Radio,
  Phone,
  Megaphone,
  Ghost,
  Microphone,
  ArrowCounterClockwise,
  WaveSine
} from "@phosphor-icons/react";

export const effectDefaults = {
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
  alien_glitch_enabled: false, alien_glitch_mix: 0.62,
  harmony_enabled: false, harmony_mode: "Major", harmony_mix: 0.5,
  drum_loop_enabled: false, drum_loop_bpm: 90.0, drum_loop_volume: 0.3
};

export function makeDisabledEffects() {
  return { ...effectDefaults };
}

export function controlsForPreset(controls, preset) {
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

export function isVoicePresetActive(controls, preset) {
  if (!controls) return false;
  const isMuted = Number(controls.gain) === 0;
  if (!isMuted && Math.abs(Number(controls.gain) - preset.gain) > 0.15) return false;
  if (Math.abs(Number(controls.pitch) - preset.pitch) > 0.15) return false;
  const expected = { ...makeDisabledEffects(), ...preset.effects };
  return Object.keys(expected).every((key) => {
    const left = controls.effects?.[key];
    const right = expected[key];
    if (typeof right === "boolean") return Boolean(left) === right;
    if (typeof right === "string") return left === right;
    return Math.abs(Number(left ?? 0) - Number(right)) < 0.03;
  });
}

export function countEnabledEffects(effects = {}) {
  return Object.entries(effects).filter(([key, value]) => key.endsWith("_enabled") && Boolean(value)).length;
}

export function effectIconFor(label) {
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

export function deviceName(items, idx) {
  if (!items || idx == null) return "—";
  const d = items.find((i) => i.index === idx);
  return d ? d.name : "—";
}

export function displayEffectValue(key, value) {
  if (key.endsWith("_mix") || key.endsWith("_amount") || key.endsWith("_tone") || key.endsWith("_threshold"))
    return Math.round(Number(value) * 100);
  return Math.round(Number(value));
}

export function storeEffectValue(key, value) {
  if (key.endsWith("_mix") || key.endsWith("_amount") || key.endsWith("_tone") || key.endsWith("_threshold"))
    return Number(value) / 100;
  return Number(value);
}

export function formatValue(v, suffix) {
  const n = Math.round(Number(v));
  return suffix ? `${n}${suffix}` : `${n}`;
}

export function formatTime(s) {
  if (s === undefined || s === null || s === "" || s === "N/A" || s === "Nuvem") return "00:00";
  const totalSeconds = parseFloat(s);
  if (isNaN(totalSeconds) || !isFinite(totalSeconds) || totalSeconds <= 0) return "00:00";
  const m = Math.floor(totalSeconds / 60);
  const sec = Math.floor(totalSeconds % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function formatLastUsed(timestamp) {
  const value = Number(timestamp || 0);
  if (!value) return "Nunca usado";
  return new Date(value * 1000).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function filePathToUrl(p) {
  if (!p) return "";
  return "file:///" + String(p).replace(/\\/g, "/");
}

export function renderMarkdown(text) {
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
  
  return React.createElement("div", {
    className: "readme-rendered",
    dangerouslySetInnerHTML: { __html: result.join("\n") }
  });
}

export class ErrorBoundary extends React.Component {
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

export function Slider({ label, value, min, max, suffix, onChange, enabled, onToggle, quadratic, step }) {
  const toSlider = (val) => quadratic ? Math.sqrt(val) : val;
  const fromSlider = (val) => quadratic ? Math.pow(val, 2) : val;

  const [localValue, setLocalValue] = useState(() => toSlider(value));
  const draggingRef = useRef(false);
  const commitTimerRef = useRef(null);

  useEffect(() => {
    if (!draggingRef.current) setLocalValue(toSlider(value));
  }, [value]);

  useEffect(() => {
    return () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); };
  }, []);

  const handleChange = (e) => {
    const v = Number(e.target.value);
    setLocalValue(v);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      onChange(fromSlider(v));
    }, 80);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    onChange(fromSlider(localValue));
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
          type="range" min={min} max={max} step={step || (quadratic ? 0.05 : (max - min > 50 ? 1 : 0.1))}
          value={localValue}
          onChange={handleChange}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={handlePointerUp}
          onTouchStart={() => { draggingRef.current = true; }}
          onTouchEnd={handlePointerUp}
        />
      </div>
      <span className="sliderRowValue">{formattedText}</span>
    </div>
  );
}

export function EffectSliderRow({ label, enabled, value, min, max, suffix, onToggle, onChange }) {
  const Icon = effectIconFor(label);
  const [localValue, setLocalValue] = useState(value);
  const draggingRef = useRef(false);
  const commitTimerRef = useRef(null);

  useEffect(() => {
    if (!draggingRef.current) setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => { if (commitTimerRef.current) clearTimeout(commitTimerRef.current); };
  }, []);

  const handleChange = (e) => {
    const v = Number(e.target.value);
    setLocalValue(v);
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => {
      onChange(v);
    }, 80);
  };

  const handlePointerUp = () => {
    draggingRef.current = false;
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    onChange(localValue);
  };

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
        <input
          type="range" min={min} max={max} step={1}
          value={localValue}
          onChange={handleChange}
          onMouseDown={() => { draggingRef.current = true; }}
          onMouseUp={handlePointerUp}
          onTouchStart={() => { draggingRef.current = true; }}
          onTouchEnd={handlePointerUp}
        />
      </div>
      <span className="sliderRowValue">{formatValue(localValue, suffix)}</span>
    </div>
  );
}

export const effectGroups = [
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
  },
  {
    title: "Ritmo & Harmonia",
    items: [
      ["harmony_enabled", "harmony_mix", "Magic Chords (Mix)", "%", 0, 100],
      ["drum_loop_enabled", "drum_loop_volume", "Beatbox Jam (Vol)", "%", 0, 100]
    ]
  }
];

export function copyTextToClipboard(text) {
  if (window.micfudiddo?.copyText) {
    return Promise.resolve(window.micfudiddo.copyText(text));
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      document.body.appendChild(input);
      input.select();
      const result = document.execCommand("copy");
      document.body.removeChild(input);
      if (result) resolve();
      else reject(new Error("Falha ao copiar"));
    } catch (err) {
      reject(err);
    }
  });
}

