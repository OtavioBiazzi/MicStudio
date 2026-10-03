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
test('generated controls only expose effects used by that voice', () => {
  for (const voice of voicePresets.filter((voice) => !voice.controls)) {
    for (const control of controlsForVoice(voice, voicePresets).filter((control) => control.enableKey)) {
      assert.equal(voice.effects[control.enableKey], true, `${voice.id}: ${control.key}`);
    }
  }
});
