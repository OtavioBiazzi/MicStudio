"""Compare representative realtime pipelines with the previous committed DSP."""
import json
import subprocess
import sys
import time
import types
from dataclasses import fields
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from micfudiddo import processing as current

baseline = types.ModuleType("baseline_processing")
sys.modules[baseline.__name__] = baseline
source = subprocess.check_output(["git", "show", "6289fa9:micfudiddo/processing.py"], cwd=ROOT, text=True, encoding="utf-8")
exec(compile(source, "baseline_processing.py", "exec"), baseline.__dict__)
presets = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", "import {voicePresets} from './src/voicePresets.js';console.log(JSON.stringify(voicePresets));"], cwd=ROOT, text=True, encoding="utf-8"))
selected = {"glitched_temporal", "glitch_sob_comando", "magic_chords_major", "voz_glitch", "voz_dimensao_paralela", "banana_caotica"}
results = []
for voice in (voice for voice in presets if voice["id"] in selected):
    row = {"voice": voice["id"]}
    for name, module in (("previous", baseline), ("current", current)):
        supported = {field.name for field in fields(module.EffectsSettings)}
        settings = module.EffectsSettings(**{key: value for key, value in voice["effects"].items() if key in supported})
        processor = module.VoiceEffectsProcessor(48000)
        processor.noise_rng = np.random.default_rng(7)
        pitch = module.DualDelayPitchShifter(48000)
        pitch.set_pitch_semitones(voice["pitch"])
        samples = (np.sin(np.arange(512, dtype=np.float32) * 0.025) * 0.15).astype(np.float32)
        times = []
        for index in range(150):
            if index == 75 and settings.time_glitch_trigger_mode == "shortcut":
                processor.trigger_time_glitch(hold=True)
            start = time.perf_counter()
            processor.process(module.apply_gain(pitch.process(samples), voice["gain"]), settings)
            times.append((time.perf_counter() - start) * 1000)
        row[name] = {"meanMs": round(float(np.mean(times)), 3), "p95Ms": round(float(np.percentile(times, 95)), 3)}
    row["meanSpeedup"] = round(row["previous"]["meanMs"] / max(0.001, row["current"]["meanMs"]), 2)
    results.append(row)
print(json.dumps({"blockBudgetMs": round(512 / 48000 * 1000, 3), "results": results}, indent=2))
