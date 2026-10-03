export function restoreVoiceEdits(base, saved, defaults) {
  if (!saved || typeof saved !== "object") return base;
  const effects = { ...base.effects };
  for (const [key, value] of Object.entries(saved.effects || {})) {
    if (!(key in defaults)) continue;
    // Old snapshots included temporary bypass flags; only v2 records explicit toggles.
    if (saved.version !== 2 && key.endsWith("_enabled")) continue;
    if (typeof value !== typeof defaults[key]) continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    effects[key] = value;
  }
  return {
    ...base,
    gain: Number.isFinite(saved.gain) ? saved.gain : base.gain,
    pitch: Number.isFinite(saved.pitch) ? saved.pitch : base.pitch,
    effects
  };
}

export function voiceEditSnapshot(controls) {
  return { version: 2, gain: controls.gain, pitch: controls.pitch, effects: controls.effects };
}
