import assert from 'node:assert/strict';
import test from 'node:test';
import { restoreVoiceEdits, voiceEditSnapshot } from '../src/voiceState.js';
import { controlsForVoice } from '../src/voiceControls.js';
import { voicePresets } from '../src/voicePresets.js';

const defaults = { time_glitch_enabled: false, time_glitch_mix: 0.72 };
const base = { gain: 1, pitch: 0, effects: { time_glitch_enabled: true, time_glitch_mix: 1 } };
test('legacy bypass flags cannot turn off the principal effect', () => {
  const restored = restoreVoiceEdits(base, { effects: { time_glitch_enabled: false, time_glitch_mix: 0.5 } }, defaults);
  assert.equal(restored.effects.time_glitch_enabled, true);
  assert.equal(restored.effects.time_glitch_mix, 0.5);
});
test('explicit v2 disabled effects remain disabled', () => {
  const snapshot = voiceEditSnapshot({ ...base, effects: { time_glitch_enabled: false } });
  assert.equal(restoreVoiceEdits(base, snapshot, defaults).effects.time_glitch_enabled, false);
});
test('invalid saved values cannot poison the active controls', () => {
  assert.deepEqual(restoreVoiceEdits(base, { gain: Infinity, effects: { time_glitch_enabled: 'false', time_glitch_mix: NaN, unknown: 10 } }, defaults), base);
});
test('old temporal presets preserve timing while migrating the distorted dry voice', () => {
  const temporal = { gain: 1, pitch: 0, effects: { time_glitch_clean_voice: true, time_glitch_voice_duck: .35 } };
  const defaults = { ...temporal.effects, time_glitch_fragment_ms: 55 };
  const saved = { version: 2, gain: 2.8, effects: { time_glitch_voice_duck: 1, time_glitch_fragment_ms: 120 } };
  const restored = restoreVoiceEdits(temporal, saved, defaults);
  assert.equal(restored.gain, 1);
  assert.equal(restored.effects.time_glitch_clean_voice, true);
  assert.equal(restored.effects.time_glitch_voice_duck, .35);
  assert.equal(restored.effects.time_glitch_fragment_ms, 120);
  assert.equal(restoreVoiceEdits(temporal, { ...saved, gain: 1.4 }, defaults).gain, 1.4);
});
test('new temporal snapshots retain intentionally customized gain and ducking', () => {
  const temporal = { gain: 1, pitch: 0, effects: { time_glitch_clean_voice: true, time_glitch_voice_duck: .35 } };
  const restored = restoreVoiceEdits(temporal, voiceEditSnapshot({ ...temporal, gain: 2.8,
    effects: { time_glitch_clean_voice: true, time_glitch_voice_duck: 1 } }), temporal.effects);
  assert.equal(restored.gain, 2.8);
  assert.equal(restored.effects.time_glitch_voice_duck, 1);
});
test('generated controls only expose effects used by that voice', () => {
  for (const voice of voicePresets.filter((voice) => !voice.controls)) {
    for (const control of controlsForVoice(voice, voicePresets).filter((control) => control.enableKey)) {
      assert.equal(voice.effects[control.enableKey], true, `${voice.id}: ${control.key}`);
    }
  }
});
