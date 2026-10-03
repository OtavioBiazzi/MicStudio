const parameter = (key, enableKey, label, min, max, step = 1, unit = "", scale = 1) => ({
  target: "effect", key, enableKey, label, min, max, step, unit, scale, group: "Textura"
});
const mix = (key, enableKey, label) => parameter(key, enableKey, label, 0, 100, 1, "%", 100);
const effectParameters = [
  parameter("robot_rate_hz", "robot_enabled", "Metal", 5, 500, 1, "Hz"),
  parameter("alien_rate_hz", "alien_enabled", "Modulação alien", 5, 240, 1, "Hz"),
  parameter("distortion_drive", "distortion_enabled", "Distorção", 1, 30, 0.5, "x"),
  parameter("demon_drive", "demon_enabled", "Peso demoníaco", 1, 20, 0.5, "x"),
  parameter("megaphone_drive", "megaphone_enabled", "Saturação", 1, 40, 0.5, "x"),
  parameter("bitcrush_bits", "bitcrush_enabled", "Resolução", 3, 12, 1, "bits"),
  parameter("tremolo_rate_hz", "tremolo_enabled", "Pulsação", 1, 30, 0.5, "Hz"),
  mix("wobble_mix", "wobble_enabled", "Tremedeira"),
  parameter("wobble_rate_hz", "wobble_enabled", "Velocidade da tremedeira", 0.2, 20, 0.1, "Hz"),
  ...["reverb", "echo", "delay", "chorus", "flanger", "ghost", "radio", "telephone", "whisper", "glitch", "alien_glitch", "double_voice", "harmony"].map((key) =>
    mix(`${key}_mix`, `${key}_enabled`, ({ telephone: "Telefone", double_voice: "Segunda voz", alien_glitch: "Alien glitch", ghost: "Fantasma", whisper: "Sussurro", harmony: "Harmonia" })[key] || key)),
  ...["echo", "delay"].flatMap((key) => [
    parameter(`${key}_time_ms`, `${key}_enabled`, `Tempo do ${key}`, 20, 1500, 10, "ms"),
    parameter(`${key}_feedback`, `${key}_enabled`, `Decaimento do ${key}`, 0, 90, 1, "%", 100)
  ]),
  parameter("double_voice_pitch_semitones", "double_voice_enabled", "Pitch da segunda voz", -24, 24, 1, "st"),
  parameter("double_voice_delay_ms", "double_voice_enabled", "Atraso da segunda voz", 0, 250, 5, "ms"),
  parameter("glitch_rate_hz", "glitch_enabled", "Falhas por segundo", 4, 60, 1, "Hz"),
  mix("radio_static_mix", "radio_static_enabled", "Chiado"),
  parameter("radio_crackle_rate_hz", "radio_static_enabled", "Estalos", 0, 40, 1, "Hz"),
  mix("equalizer_tone", "equalizer_enabled", "Brilho"),
  mix("compressor_amount", "compressor_enabled", "Compressão"),
  mix("noise_gate_threshold", "noise_gate_enabled", "Corte de ruído"),
  mix("ambience_volume", "ambience_enabled", "Ambiente"),
  mix("reverse_mix", "reverse_enabled", "Reverso"),
  parameter("reverse_window_ms", "reverse_enabled", "Janela do reverso", 120, 1500, 10, "ms"),
  parameter("reverse_speed", "reverse_enabled", "Velocidade do reverso", 0.5, 2, 0.05, "x"),
  parameter("reverse_pitch_semitones", "reverse_enabled", "Pitch do reverso", -24, 24, 1, "st"),
  mix("drum_loop_volume", "drum_loop_enabled", "Bateria"),
  parameter("drum_loop_bpm", "drum_loop_enabled", "Ritmo", 40, 240, 1, "BPM")
];

export function controlsForVoice(voice, presets = []) {
  if (voice.controls?.length) return voice.controls;
  const controls = [{ target: "control", key: "pitch", label: "Altura da voz", min: -36, max: 36, step: 1, unit: "st", group: "Identidade" }];
  controls.push(...effectParameters.filter((item) => voice.effects?.[item.enableKey]));
  if (voice.effects?.time_glitch_enabled) {
    const template = presets.find((item) => item.id === (voice.effects.time_glitch_trigger_mode === "shortcut" ? "glitch_sob_comando" : "glitched_temporal"));
    controls.push(...(template?.controls || []).filter((item) => item.enableKey === "time_glitch_enabled"));
  }
  return controls;
}
