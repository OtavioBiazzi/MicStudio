from __future__ import annotations

from dataclasses import dataclass, asdict
import math
import threading

import numpy as np


def semitones_to_ratio(semitones: float) -> float:
    """Convert musical semitones to a playback-rate ratio."""
    if not math.isfinite(semitones):
        return 1.0
    # Keep the pitch shifter in a sane operating range even if the UI is edited.
    semitones = max(-36.0, min(36.0, float(semitones)))
    return 2.0 ** (semitones / 12.0)


def apply_gain(samples: np.ndarray, gain: float) -> np.ndarray:
    """Apply intentionally unclipped gain while guarding against NaN/Inf."""
    if not math.isfinite(gain):
        gain = 1.0
    gain = max(0.0, float(gain))
    scaled = np.asarray(samples, dtype=np.float32) * np.float32(gain)
    return np.nan_to_num(scaled, nan=0.0, posinf=1_000_000.0, neginf=-1_000_000.0).astype(
        np.float32,
        copy=False,
    )


def soft_clip(samples: np.ndarray, threshold: float = 0.8) -> np.ndarray:
    """Piecewise soft clipping to maintain perfect linearity below threshold."""
    abs_samples = np.abs(samples)
    mask = abs_samples > threshold
    if not np.any(mask):
        return samples

    clipped = samples.copy()
    scale = 1.0 - threshold
    if scale > 0.0001:
        val = (abs_samples[mask] - threshold) / scale
        compressed = threshold + scale * np.tanh(val)
        clipped[mask] = np.sign(samples[mask]) * compressed
    else:
        clipped = np.clip(samples, -1.0, 1.0)
    return clipped


def hard_clip_for_output(samples: np.ndarray, ceiling: float = 0.98) -> np.ndarray:
    """Flatten peaks after gain so downstream apps receive already-distorted audio."""
    if not math.isfinite(ceiling) or ceiling <= 0.0:
        ceiling = 0.98
    ceiling = float(ceiling)
    clean = np.nan_to_num(
        np.asarray(samples, dtype=np.float32),
        nan=0.0,
        posinf=ceiling,
        neginf=-ceiling,
    )
    soft = soft_clip(clean, threshold=0.8 * ceiling)
    return np.clip(soft, -ceiling, ceiling).astype(np.float32, copy=False)


@dataclass(frozen=True)
class EffectsSettings:
    output_volume_enabled: bool = False
    output_volume: float = 1.0
    distortion_enabled: bool = False
    distortion_drive: float = 2.0
    robot_enabled: bool = False
    robot_rate_hz: float = 35.0
    noise_gate_enabled: bool = False
    noise_gate_threshold: float = 0.08
    equalizer_enabled: bool = False
    equalizer_tone: float = 0.55
    echo_enabled: bool = False
    echo_mix: float = 0.25
    echo_time_ms: float = 160.0
    echo_feedback: float = 0.34
    delay_enabled: bool = False
    delay_mix: float = 0.3
    delay_time_ms: float = 320.0
    delay_feedback: float = 0.48
    tremolo_enabled: bool = False
    tremolo_rate_hz: float = 8.0
    bitcrush_enabled: bool = False
    bitcrush_bits: int = 8
    radio_enabled: bool = False
    radio_mix: float = 0.7
    radio_static_enabled: bool = False
    radio_static_mix: float = 0.12
    radio_crackle_rate_hz: float = 7.0
    megaphone_enabled: bool = False
    megaphone_drive: float = 4.0
    telephone_enabled: bool = False
    telephone_mix: float = 0.8
    reverb_enabled: bool = False
    reverb_mix: float = 0.28
    demon_enabled: bool = False
    demon_drive: float = 3.5
    alien_enabled: bool = False
    alien_rate_hz: float = 64.0
    ghost_enabled: bool = False
    ghost_mix: float = 0.35
    chorus_enabled: bool = False
    chorus_mix: float = 0.28
    flanger_enabled: bool = False
    flanger_mix: float = 0.24
    whisper_enabled: bool = False
    whisper_mix: float = 0.35
    compressor_enabled: bool = False
    compressor_amount: float = 0.45
    wobble_enabled: bool = False
    wobble_mix: float = 0.35
    wobble_rate_hz: float = 4.4
    reverse_enabled: bool = False
    reverse_mix: float = 0.65
    reverse_window_ms: float = 480.0
    reverse_speed: float = 1.0
    reverse_pitch_semitones: float = 0.0
    reverse_gain: float = 1.0
    alien_glitch_enabled: bool = False
    alien_glitch_mix: float = 0.62
    glitch_enabled: bool = False
    glitch_mix: float = 0.55
    glitch_rate_hz: float = 18.0
    time_glitch_enabled: bool = False
    time_glitch_mix: float = 0.72
    time_glitch_rate_hz: float = 6.0
    time_glitch_depth: float = 0.7
    time_glitch_interval_s: float = 0.0
    time_glitch_fragment_ms: float = 55.0
    time_glitch_lookback_s: float = 0.45
    time_glitch_repeats: int = 4
    time_glitch_reverse_chance: float = 0.38
    time_glitch_pingpong_chance: float = 0.28
    time_glitch_trigger_mode: str = "automatic"
    time_glitch_shortcut_mode: str = "press"
    time_glitch_shortcut: str = ""
    time_glitch_repeat_volume: float = 1.0
    time_glitch_voice_duck: float = 1.0
    time_glitch_speed: float = 1.0
    time_glitch_pitch_semitones: float = 0.0
    time_glitch_direction: str = "random"
    double_voice_enabled: bool = False
    double_voice_mix: float = 0.4
    double_voice_delay_ms: float = 45.0
    double_voice_pitch_semitones: float = -5.0
    ambience_enabled: bool = False
    ambience_mode: str = "space"
    ambience_volume: float = 0.12
    harmony_enabled: bool = False
    harmony_mode: str = "Major"
    harmony_mix: float = 0.5
    drum_loop_enabled: bool = False
    drum_loop_bpm: float = 90.0
    drum_loop_volume: float = 0.3

    @classmethod
    def from_mapping(cls, values: dict, base: EffectsSettings | None = None) -> EffectsSettings:
        defaults = asdict(cls())
        result = asdict(base) if base is not None else defaults.copy()
        for key, value in (values.items() if isinstance(values, dict) else []):
            if key not in defaults:
                continue
            expected = defaults[key]
            if isinstance(expected, bool):
                if isinstance(value, bool):
                    result[key] = value
            elif isinstance(expected, (int, float)):
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    result[key] = int(value) if isinstance(expected, int) else float(value)
            elif isinstance(value, str):
                result[key] = value
        return cls(**result)


class VoiceEffectsProcessor:
    def __init__(self, sample_rate: int) -> None:
        self.sample_rate = int(sample_rate)
        self.robot_phase = 0.0
        self.tremolo_phase = 0.0
        self.wobble_phase = 0.0
        self.glitch_phase = 0.0
        self.time_glitch_history = np.zeros(max(64, int(self.sample_rate * 4.5)), dtype=np.float32)
        self.time_glitch_history_pos = 0
        self.time_glitch_history_filled = 0
        self.time_glitch_grain = np.zeros(0, dtype=np.float32)
        self.time_glitch_grain_pos = 0
        self.time_glitch_event_remaining = 0
        self.time_glitch_event_total = 0
        self.time_glitch_event_elapsed = 0
        self.time_glitch_samples_until_event = max(1, int(self.sample_rate * 0.08))
        self._time_glitch_trigger = threading.Event()
        self._time_glitch_hold = threading.Event()
        self._time_glitch_mode = None
        self._time_glitch_pitch_shifter = DualDelayPitchShifter(self.sample_rate)
        self._time_glitch_source = np.zeros(0, dtype=np.float32)
        self._time_glitch_render_settings = None
        self._time_glitch_event_direction = "forward"
        self._time_glitch_stop_pending = False
        self._time_glitch_interval = None
        self.reverse_input_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_output_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_window_samples = 0
        self._reverse_pitch_shifter = DualDelayPitchShifter(self.sample_rate)
        self.echo_delay_samples = max(1, int(self.sample_rate * 0.16))
        self.echo_buffer = np.zeros(self.echo_delay_samples + 1, dtype=np.float32)
        self.echo_pos = 0
        self.delay_delay_samples = max(1, int(self.sample_rate * 0.32))
        self.delay_buffer = np.zeros(self.delay_delay_samples + 1, dtype=np.float32)
        self.delay_pos = 0
        self.reverb_buffers = [
            np.zeros(max(2, int(self.sample_rate * seconds)), dtype=np.float32)
            for seconds in (0.0297, 0.0371, 0.0411, 0.0437)
        ]
        self.reverb_positions = [0] * len(self.reverb_buffers)
        self.ghost_delay_samples = max(1, int(self.sample_rate * 0.21))
        self.ghost_buffer = np.zeros(self.ghost_delay_samples + 1, dtype=np.float32)
        self.ghost_pos = 0
        self.chorus_buffer = np.zeros(max(64, int(self.sample_rate * 0.05)), dtype=np.float32)
        self.chorus_pos = 0
        self.chorus_phase = 0.0
        self.flanger_buffer = np.zeros(max(64, int(self.sample_rate * 0.015)), dtype=np.float32)
        self.flanger_pos = 0
        self.flanger_phase = 0.0
        self._temporal_enabled = {
            "echo": False,
            "delay": False,
            "reverb": False,
            "ghost": False,
            "chorus": False,
            "flanger": False,
        }
        self.noise_rng = np.random.default_rng()
        self.double_voice_buffer = np.zeros(max(64, int(self.sample_rate * 0.3)), dtype=np.float32)
        self.double_voice_pos = 0
        self._double_voice_shifter = DualDelayPitchShifter(self.sample_rate)
        self._ambience_sample_index = 0
        self._harm_shifters = [
            DualDelayPitchShifter(self.sample_rate),
            DualDelayPitchShifter(self.sample_rate),
            DualDelayPitchShifter(self.sample_rate),
            DualDelayPitchShifter(self.sample_rate),
        ]
        self._drum_sample_index = 0

    def reset(self) -> None:
        self.robot_phase = 0.0
        self.tremolo_phase = 0.0
        self.wobble_phase = 0.0
        self.glitch_phase = 0.0
        self.time_glitch_history.fill(0.0)
        self.time_glitch_history_pos = 0
        self.time_glitch_history_filled = 0
        self.time_glitch_grain = np.zeros(0, dtype=np.float32)
        self.time_glitch_grain_pos = 0
        self.time_glitch_event_remaining = 0
        self.time_glitch_event_total = 0
        self.time_glitch_event_elapsed = 0
        self.time_glitch_samples_until_event = max(1, int(self.sample_rate * 0.08))
        self._time_glitch_trigger.clear()
        self._time_glitch_hold.clear()
        self._time_glitch_pitch_shifter.reset()
        self._time_glitch_mode = None
        self._time_glitch_source = np.zeros(0, dtype=np.float32)
        self._time_glitch_render_settings = None
        self._time_glitch_stop_pending = False
        self._time_glitch_interval = None
        self.reverse_input_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_output_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_window_samples = 0
        self._reverse_pitch_shifter.reset()
        self.double_voice_buffer.fill(0.0)
        self.double_voice_pos = 0
        self._double_voice_shifter.reset()
        self._ambience_sample_index = 0
        self.echo_buffer.fill(0.0)
        self.echo_pos = 0
        self.delay_buffer.fill(0.0)
        self.delay_pos = 0
        for buffer in self.reverb_buffers:
            buffer.fill(0.0)
        self.reverb_positions = [0] * len(self.reverb_buffers)
        self.ghost_buffer.fill(0.0)
        self.ghost_pos = 0
        self.chorus_buffer.fill(0.0)
        self.chorus_pos = 0
        self.chorus_phase = 0.0
        self.flanger_buffer.fill(0.0)
        self.flanger_pos = 0
        self.flanger_phase = 0.0
        for key in self._temporal_enabled:
            self._temporal_enabled[key] = False

    def process(self, samples: np.ndarray, settings: EffectsSettings) -> np.ndarray:
        y = np.asarray(samples, dtype=np.float32).reshape(-1).copy()
        if y.size == 0:
            return y
        self._sync_temporal_effect_state(settings)

        if settings.noise_gate_enabled:
            y = self._noise_gate(y, _finite_clamped(settings.noise_gate_threshold, 0.0, 0.4, 0.08))

        if settings.equalizer_enabled:
            y = self._equalizer(y, _finite_clamped(settings.equalizer_tone, 0.0, 1.0, 0.55))

        if settings.distortion_enabled:
            drive = _finite_clamped(settings.distortion_drive, 1.0, 200.0, 4.0)
            y = np.clip(y * np.float32(drive), -1.0, 1.0).astype(np.float32, copy=False)

        if settings.robot_enabled:
            y = self._ring_modulate(y, _finite_clamped(settings.robot_rate_hz, 5.0, 500.0, 35.0))

        if settings.echo_enabled:
            self._configure_delay("echo", settings.echo_time_ms)
            y = self._echo(y, _finite_clamped(settings.echo_mix, 0.0, 1.0, 0.25),
                           _finite_clamped(settings.echo_feedback, 0.0, 0.9, 0.34))

        if settings.delay_enabled:
            self._configure_delay("delay", settings.delay_time_ms)
            y = self._delay(y, _finite_clamped(settings.delay_mix, 0.0, 1.0, 0.3),
                            _finite_clamped(settings.delay_feedback, 0.0, 0.9, 0.48))

        if settings.tremolo_enabled:
            y = self._tremolo(y, _finite_clamped(settings.tremolo_rate_hz, 1.0, 30.0, 8.0))

        if settings.bitcrush_enabled:
            y = self._bitcrush(y, settings.bitcrush_bits)

        if settings.radio_enabled:
            y = self._radio(y, _finite_clamped(settings.radio_mix, 0.0, 1.0, 0.7))

        if settings.radio_static_enabled:
            y = self._radio_static(
                y,
                _finite_clamped(settings.radio_static_mix, 0.0, 1.0, 0.12),
                _finite_clamped(settings.radio_crackle_rate_hz, 0.0, 40.0, 7.0),
            )

        if settings.megaphone_enabled:
            y = self._megaphone(y, _finite_clamped(settings.megaphone_drive, 1.0, 40.0, 4.0))

        if settings.telephone_enabled:
            y = self._telephone(y, _finite_clamped(settings.telephone_mix, 0.0, 1.0, 0.8))

        if settings.reverb_enabled:
            y = self._reverb(y, _finite_clamped(settings.reverb_mix, 0.0, 1.0, 0.28))

        if settings.demon_enabled:
            y = self._demon(y, _finite_clamped(settings.demon_drive, 1.0, 40.0, 3.5))

        if settings.alien_enabled:
            y = self._alien(y, _finite_clamped(settings.alien_rate_hz, 20.0, 500.0, 64.0))

        if settings.ghost_enabled:
            y = self._ghost(y, _finite_clamped(settings.ghost_mix, 0.0, 1.0, 0.35))

        if settings.chorus_enabled:
            y = self._chorus(y, _finite_clamped(settings.chorus_mix, 0.0, 1.0, 0.28))

        if settings.flanger_enabled:
            y = self._flanger(y, _finite_clamped(settings.flanger_mix, 0.0, 1.0, 0.24))

        if settings.whisper_enabled:
            y = self._whisper(y, _finite_clamped(settings.whisper_mix, 0.0, 1.0, 0.35))

        if settings.compressor_enabled:
            y = self._compressor(y, _finite_clamped(settings.compressor_amount, 0.0, 1.0, 0.45))

        if settings.double_voice_enabled:
            y = self._double_voice(
                y,
                _finite_clamped(settings.double_voice_mix, 0.0, 1.0, 0.4),
                _finite_clamped(settings.double_voice_delay_ms, 0.0, 250.0, 45.0),
                _finite_clamped(settings.double_voice_pitch_semitones, -24.0, 24.0, -5.0),
            )

        if settings.wobble_enabled:
            y = self._wobble(y, _finite_clamped(settings.wobble_mix, 0.0, 1.0, 0.35),
                             _finite_clamped(settings.wobble_rate_hz, 0.2, 20.0, 4.4))

        if settings.reverse_enabled:
            y = self._reverse_fragments(
                y,
                _finite_clamped(settings.reverse_mix, 0.0, 1.0, 0.65),
                _finite_clamped(settings.reverse_window_ms, 120.0, 1500.0, 480.0),
                _finite_clamped(settings.reverse_speed, 0.5, 2.0, 1.0),
                _finite_clamped(settings.reverse_pitch_semitones, -24.0, 24.0, 0.0),
                _finite_clamped(settings.reverse_gain, 0.0, 3.0, 1.0),
            )

        if settings.alien_glitch_enabled:
            y = self._alien_glitch(y, _finite_clamped(settings.alien_glitch_mix, 0.0, 1.0, 0.62))

        if settings.glitch_enabled:
            y = self._glitch(
                y,
                _finite_clamped(settings.glitch_mix, 0.0, 1.0, 0.55),
                _finite_clamped(settings.glitch_rate_hz, 4.0, 60.0, 18.0),
            )

        if settings.time_glitch_enabled:
            interval_s = _finite_clamped(settings.time_glitch_interval_s, 0.0, 5.0, 0.0)
            if interval_s <= 0.0:
                interval_s = 1.0 / _finite_clamped(settings.time_glitch_rate_hz, 1.0, 16.0, 6.0)
            y = self._time_glitch(
                y,
                _finite_clamped(settings.time_glitch_mix, 0.0, 1.0, 0.72),
                _finite_clamped(settings.time_glitch_depth, 0.0, 1.0, 0.7),
                interval_s,
                _finite_clamped(settings.time_glitch_fragment_ms, 10.0, 1500.0, 55.0),
                _finite_clamped(settings.time_glitch_lookback_s, 0.02, 2.0, 0.45),
                int(_finite_clamped(float(settings.time_glitch_repeats), 1.0, 10000.0, 4.0)),
                _finite_clamped(settings.time_glitch_reverse_chance, 0.0, 1.0, 0.38),
                _finite_clamped(settings.time_glitch_pingpong_chance, 0.0, 1.0, 0.28),
                str(settings.time_glitch_trigger_mode or "automatic"),
                _finite_clamped(settings.time_glitch_repeat_volume, 0.0, 3.0, 1.0),
                _finite_clamped(settings.time_glitch_voice_duck, 0.0, 1.0, 1.0),
                _finite_clamped(settings.time_glitch_speed, 0.25, 4.0, 1.0),
                _finite_clamped(settings.time_glitch_pitch_semitones, -24.0, 24.0, 0.0),
                str(settings.time_glitch_direction or "random"),
            )

        if settings.ambience_enabled:
            y += self._ambience(
                y.size,
                settings.ambience_mode,
                _finite_clamped(settings.ambience_volume, 0.0, 1.0, 0.12),
            )

        if settings.harmony_enabled:
            y = self._harmony(y, settings.harmony_mode, _finite_clamped(settings.harmony_mix, 0.0, 1.0, 0.5))

        if settings.drum_loop_enabled:
            y += self._drum_loop(y.size, settings.drum_loop_bpm, settings.drum_loop_volume)

        if settings.output_volume_enabled:
            y = apply_gain(y, _finite_clamped(settings.output_volume, 0.0, 100.0, 1.0))

        return np.nan_to_num(y, nan=0.0, posinf=1_000_000.0, neginf=-1_000_000.0).astype(
            np.float32,
            copy=False,
        )

    def trigger_time_glitch(self, hold: bool = False) -> None:
        self._time_glitch_stop_pending = False
        if hold:
            self._time_glitch_hold.set()
        else:
            self._time_glitch_hold.clear()
        self._time_glitch_trigger.set()

    def release_time_glitch(self) -> None:
        self._time_glitch_trigger.clear()
        self._time_glitch_hold.clear()
        self._time_glitch_stop_pending = True
        self._time_glitch_source = np.zeros(0, dtype=np.float32)
        self._time_glitch_render_settings = None
        fade_samples = max(1, int(self.sample_rate * 0.01))
        if self.time_glitch_event_remaining > fade_samples:
            self.time_glitch_event_remaining = fade_samples

    def _sync_temporal_effect_state(self, settings: EffectsSettings) -> None:
        mode = settings.time_glitch_trigger_mode
        if self._time_glitch_mode is not None and mode != self._time_glitch_mode:
            self.release_time_glitch()
            self.time_glitch_event_remaining = 0
        self._time_glitch_mode = mode
        current = {
            "echo": bool(settings.echo_enabled),
            "delay": bool(settings.delay_enabled),
            "reverb": bool(settings.reverb_enabled),
            "ghost": bool(settings.ghost_enabled),
            "chorus": bool(settings.chorus_enabled),
            "flanger": bool(settings.flanger_enabled),
            "reverse": bool(settings.reverse_enabled),
            "time_glitch": bool(settings.time_glitch_enabled),
            "double_voice": bool(settings.double_voice_enabled),
            "harmony": bool(settings.harmony_enabled),
        }
        for key, enabled in current.items():
            if self._temporal_enabled.get(key, False) and not enabled:
                self._clear_temporal_state(key)
            self._temporal_enabled[key] = enabled

    def _clear_temporal_state(self, key: str) -> None:
        if key == "time_glitch":
            self.release_time_glitch()
            self.time_glitch_event_remaining = 0
            self.time_glitch_event_elapsed = 0
            self.time_glitch_grain = np.zeros(0, dtype=np.float32)
            self._time_glitch_source = np.zeros(0, dtype=np.float32)
            self._time_glitch_render_settings = None
            self.time_glitch_history.fill(0.0)
            self.time_glitch_history_filled = 0
            self.time_glitch_history_pos = 0
            self.time_glitch_samples_until_event = max(1, int(self.sample_rate * 0.08))
        elif key == "reverse":
            self.reverse_input_buffer = np.zeros(0, dtype=np.float32)
            self.reverse_output_buffer = np.zeros(0, dtype=np.float32)
            self.reverse_window_samples = 0
            self._reverse_pitch_shifter.reset()
        elif key == "double_voice":
            self.double_voice_buffer.fill(0.0)
            self.double_voice_pos = 0
            self._double_voice_shifter.reset()
        elif key == "harmony":
            for shifter in self._harm_shifters:
                shifter.reset()
        elif key == "echo":
            self.echo_buffer.fill(0.0)
            self.echo_pos = 0
        elif key == "delay":
            self.delay_buffer.fill(0.0)
            self.delay_pos = 0
        elif key == "reverb":
            for buffer in self.reverb_buffers:
                buffer.fill(0.0)
            self.reverb_positions = [0] * len(self.reverb_buffers)
        elif key == "ghost":
            self.ghost_buffer.fill(0.0)
            self.ghost_pos = 0
        elif key == "chorus":
            self.chorus_buffer.fill(0.0)
            self.chorus_pos = 0
            self.chorus_phase = 0.0
        elif key == "flanger":
            self.flanger_buffer.fill(0.0)
            self.flanger_pos = 0
            self.flanger_phase = 0.0

    def _ring_modulate(self, samples: np.ndarray, rate_hz: float) -> np.ndarray:
        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = (2.0 * math.pi * rate_hz) / self.sample_rate
        carrier = np.sin(self.robot_phase + indexes * phase_step).astype(np.float32)
        self.robot_phase = (self.robot_phase + samples.size * phase_step) % (2.0 * math.pi)
        return (samples * carrier).astype(np.float32, copy=False)

    def _tremolo(self, samples: np.ndarray, rate_hz: float) -> np.ndarray:
        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = (2.0 * math.pi * rate_hz) / self.sample_rate
        lfo = 0.25 + (0.75 * ((np.sin(self.tremolo_phase + indexes * phase_step) + 1.0) * 0.5))
        self.tremolo_phase = (self.tremolo_phase + samples.size * phase_step) % (2.0 * math.pi)
        return (samples * lfo.astype(np.float32)).astype(np.float32, copy=False)

    def _noise_gate(self, samples: np.ndarray, threshold: float) -> np.ndarray:
        if threshold <= 0.0:
            return samples.copy()
        magnitude = np.abs(samples)
        open_ratio = np.clip((magnitude - (threshold * 0.45)) / max(threshold * 0.75, 1e-6), 0.0, 1.0)
        return (samples * open_ratio.astype(np.float32)).astype(np.float32, copy=False)

    def _equalizer(self, samples: np.ndarray, tone: float) -> np.ndarray:
        if samples.size < 5:
            return samples.copy()
        kernel = np.array([0.08, 0.18, 0.48, 0.18, 0.08], dtype=np.float32)
        low = np.convolve(samples, kernel, mode="same").astype(np.float32, copy=False)
        high = (samples - low).astype(np.float32, copy=False)
        warm = low * np.float32(1.18)
        bright = samples + (high * np.float32(1.35))
        return ((warm * (1.0 - tone)) + (bright * tone)).astype(np.float32, copy=False)

    def _configure_delay(self, key: str, time_ms: float) -> None:
        delay = max(1, int(self.sample_rate * _finite_clamped(time_ms, 20.0, 1500.0, 160.0) / 1000.0))
        if delay != getattr(self, f"{key}_delay_samples"):
            setattr(self, f"{key}_delay_samples", delay)
            setattr(self, f"{key}_buffer", np.zeros(delay + 1, dtype=np.float32))
            setattr(self, f"{key}_pos", 0)

    def _echo(self, samples: np.ndarray, mix: float, feedback: float = 0.34) -> np.ndarray:
        out, self.echo_pos = self._feedback_delay(
            samples,
            mix,
            self.echo_buffer,
            self.echo_pos,
            self.echo_delay_samples,
            feedback=feedback,
        )
        return out

    def _delay(self, samples: np.ndarray, mix: float, feedback: float = 0.48) -> np.ndarray:
        out, self.delay_pos = self._feedback_delay(
            samples,
            mix,
            self.delay_buffer,
            self.delay_pos,
            self.delay_delay_samples,
            feedback=feedback,
        )
        return out

    @staticmethod
    def _feedback_delay(
        samples: np.ndarray,
        mix: float,
        buffer: np.ndarray,
        position: int,
        delay_samples: int,
        *,
        feedback: float,
    ) -> tuple[np.ndarray, int]:
        out = np.empty_like(samples)
        size = buffer.size
        offset = 0
        while offset < samples.size:
            take = min(delay_samples, samples.size - offset)
            indexes = (position + np.arange(take)) % size
            read_indexes = (indexes - delay_samples) % size
            delayed = buffer[read_indexes].copy()
            chunk = samples[offset : offset + take]
            out[offset : offset + take] = chunk + delayed * np.float32(mix)
            buffer[indexes] = chunk + delayed * np.float32(feedback)
            position = (position + take) % size
            offset += take
        return out, position

    def _bitcrush(self, samples: np.ndarray, bits: int) -> np.ndarray:
        bits = int(_finite_clamped(float(bits), 3.0, 12.0, 8.0))
        levels = float((2**bits) - 1)
        clipped = np.clip(samples, -1.0, 1.0)
        return (np.round(((clipped + 1.0) * 0.5) * levels) / levels * 2.0 - 1.0).astype(
            np.float32,
            copy=False,
        )

    def _radio(self, samples: np.ndarray, mix: float) -> np.ndarray:
        colored = self._band_limited(samples)
        crushed = self._bitcrush(colored * np.float32(1.35), 7)
        return ((samples * (1.0 - mix)) + (crushed * mix)).astype(np.float32, copy=False)

    def _radio_static(self, samples: np.ndarray, mix: float, crackle_rate_hz: float) -> np.ndarray:
        if samples.size == 0 or mix <= 0.0:
            return samples.copy()
        static = self.noise_rng.normal(0.0, 0.055, samples.size).astype(np.float32)
        probability = min(0.25, crackle_rate_hz / max(1, self.sample_rate))
        crackle_mask = self.noise_rng.random(samples.size) < probability
        if np.any(crackle_mask):
            static[crackle_mask] += self.noise_rng.uniform(-0.8, 0.8, int(np.sum(crackle_mask))).astype(np.float32)
        static = self._band_limited(static)
        return np.clip(samples * np.float32(1.0 - mix * 0.08) + static * np.float32(mix), -1.0, 1.0).astype(
            np.float32,
            copy=False,
        )

    def _megaphone(self, samples: np.ndarray, drive: float) -> np.ndarray:
        voiced = self._band_limited(samples)
        return np.tanh(voiced * np.float32(drive)).astype(np.float32, copy=False)

    def _telephone(self, samples: np.ndarray, mix: float) -> np.ndarray:
        narrow = self._band_limited(samples)
        narrow = self._bitcrush(narrow, 8)
        return ((samples * (1.0 - mix)) + (narrow * mix)).astype(np.float32, copy=False)

    def _reverb(self, samples: np.ndarray, mix: float) -> np.ndarray:
        wet = np.zeros_like(samples)
        for buffer_index, buffer in enumerate(self.reverb_buffers):
            position = self.reverb_positions[buffer_index]
            offset = 0
            while offset < samples.size:
                take = min(buffer.size, samples.size - offset)
                indexes = (position + np.arange(take)) % buffer.size
                delayed = buffer[indexes].copy()
                chunk = samples[offset : offset + take]
                wet[offset : offset + take] += delayed
                buffer[indexes] = chunk + delayed * np.float32(0.68 + buffer_index * 0.025)
                position = (position + take) % buffer.size
                offset += take
            self.reverb_positions[buffer_index] = position
        wet *= np.float32(1.0 / len(self.reverb_buffers))
        return (
            samples * np.float32(1.0 - mix * 0.18)
            + wet * np.float32(mix * 0.9)
        ).astype(np.float32, copy=False)

    def _demon(self, samples: np.ndarray, drive: float) -> np.ndarray:
        growl = self._ring_modulate(samples, 31.0)
        driven = np.tanh((samples + growl * 0.45) * np.float32(drive))
        return driven.astype(np.float32, copy=False)

    def _alien(self, samples: np.ndarray, rate_hz: float) -> np.ndarray:
        carrier = self._ring_modulate(samples, rate_hz)
        return ((samples * 0.35) + (carrier * 0.85)).astype(np.float32, copy=False)

    def _ghost(self, samples: np.ndarray, mix: float) -> np.ndarray:
        airy, self.ghost_pos = self._feedback_delay(
            samples,
            0.8,
            self.ghost_buffer,
            self.ghost_pos,
            self.ghost_delay_samples,
            feedback=0.42,
        )
        airy = self._tremolo(airy, 2.8)
        return ((samples * (1.0 - mix)) + (airy * mix)).astype(np.float32, copy=False)

    def _chorus(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size == 0 or mix <= 0.0:
            return samples.copy()
        wet = np.empty_like(samples)
        phase_step = (2.0 * math.pi * 0.8) / self.sample_rate
        for index, sample in enumerate(samples):
            delay_ms = 15.0 + 4.0 * math.sin(self.chorus_phase)
            delay_samples = max(1, int(self.sample_rate * delay_ms / 1000.0))
            read_position = (self.chorus_pos - delay_samples) % self.chorus_buffer.size
            wet[index] = self.chorus_buffer[read_position]
            self.chorus_buffer[self.chorus_pos] = sample
            self.chorus_pos = (self.chorus_pos + 1) % self.chorus_buffer.size
            self.chorus_phase = (self.chorus_phase + phase_step) % (2.0 * math.pi)
        return (
            samples * np.float32(1.0 - mix * 0.2)
            + wet * np.float32(mix * 0.85)
        ).astype(np.float32, copy=False)

    def _flanger(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size == 0 or mix <= 0.0:
            return samples.copy()
        wet = np.empty_like(samples)
        phase_step = (2.0 * math.pi * 0.28) / self.sample_rate
        for index, sample in enumerate(samples):
            delay_ms = 2.4 + 2.0 * math.sin(self.flanger_phase)
            delay_samples = max(1, int(self.sample_rate * delay_ms / 1000.0))
            read_position = (self.flanger_pos - delay_samples) % self.flanger_buffer.size
            delayed = self.flanger_buffer[read_position]
            wet[index] = delayed
            self.flanger_buffer[self.flanger_pos] = sample + delayed * np.float32(0.35)
            self.flanger_pos = (self.flanger_pos + 1) % self.flanger_buffer.size
            self.flanger_phase = (self.flanger_phase + phase_step) % (2.0 * math.pi)
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _whisper(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 4 or mix <= 0.0:
            return samples.copy()
        noise = self.noise_rng.normal(0.0, 0.08, samples.size).astype(np.float32)
        breath = self._band_limited(noise + samples * np.float32(0.25))
        return ((samples * (1.0 - mix)) + (breath * mix)).astype(np.float32, copy=False)

    def _compressor(self, samples: np.ndarray, amount: float) -> np.ndarray:
        if samples.size == 0 or amount <= 0.0:
            return samples.copy()
        threshold = 0.28 + ((1.0 - amount) * 0.42)
        magnitude = np.abs(samples)
        compressed = np.where(
            magnitude > threshold,
            np.sign(samples) * (threshold + ((magnitude - threshold) * (0.28 + (0.5 * (1.0 - amount))))),
            samples,
        )
        makeup = 1.0 + (amount * 0.65)
        return np.tanh(compressed * np.float32(makeup)).astype(np.float32, copy=False)

    def _double_voice(self, samples: np.ndarray, mix: float, delay_ms: float, pitch_semitones: float) -> np.ndarray:
        if samples.size == 0 or mix <= 0.0:
            return samples.copy()
        self._double_voice_shifter.set_pitch_semitones(pitch_semitones)
        shifted = self._double_voice_shifter.process(samples)
        delay_samples = min(
            self.double_voice_buffer.size - 1,
            max(0, int(self.sample_rate * delay_ms / 1000.0)),
        )
        if delay_samples == 0:
            wet = shifted
            return (
                samples * np.float32(1.0 - mix * 0.32) + wet * np.float32(mix * 0.82)
            ).astype(np.float32, copy=False)
        wet = np.empty_like(samples)
        offset = 0
        while offset < shifted.size:
            size = min(delay_samples, shifted.size - offset)
            positions = (self.double_voice_pos + np.arange(size)) % self.double_voice_buffer.size
            wet[offset:offset + size] = self.double_voice_buffer[(positions - delay_samples) % self.double_voice_buffer.size]
            self.double_voice_buffer[positions] = shifted[offset:offset + size]
            self.double_voice_pos = (self.double_voice_pos + size) % self.double_voice_buffer.size
            offset += size
        return (
            samples * np.float32(1.0 - mix * 0.32) + wet * np.float32(mix * 0.82)
        ).astype(np.float32, copy=False)

    def _wobble(self, samples: np.ndarray, mix: float, rate_hz: float = 4.4) -> np.ndarray:
        if samples.size < 8 or mix <= 0.0:
            return samples.copy()
        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = (2.0 * math.pi * rate_hz) / self.sample_rate
        wobble = 0.35 + (0.65 * ((np.sin(self.wobble_phase + indexes * phase_step) + 1.0) * 0.5))
        self.wobble_phase = (self.wobble_phase + samples.size * phase_step) % (2.0 * math.pi)
        wet = (samples * wobble.astype(np.float32)).astype(np.float32, copy=False)
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _reverse_fragments(
        self,
        samples: np.ndarray,
        mix: float,
        window_ms: float = 480.0,
        speed: float = 1.0,
        pitch_semitones: float = 0.0,
        gain: float = 1.0,
    ) -> np.ndarray:
        if samples.size < 4 or mix <= 0.0:
            return samples.copy()

        window_samples = max(64, int(self.sample_rate * window_ms / 1000.0))
        if window_samples != self.reverse_window_samples:
            self.reverse_input_buffer = np.zeros(0, dtype=np.float32)
            self.reverse_output_buffer = np.zeros(0, dtype=np.float32)
            self.reverse_window_samples = window_samples

        self.reverse_input_buffer = np.concatenate((self.reverse_input_buffer, samples))
        while self.reverse_input_buffer.size >= window_samples:
            chunk = self.reverse_input_buffer[:window_samples].copy()
            self.reverse_input_buffer = self.reverse_input_buffer[window_samples:]
            reversed_chunk = chunk[::-1].copy()

            if abs(speed - 1.0) > 0.001:
                positions = (np.arange(window_samples, dtype=np.float64) * speed) % window_samples
                reversed_chunk = np.interp(
                    positions,
                    np.arange(window_samples, dtype=np.float64),
                    reversed_chunk,
                ).astype(np.float32)

            if abs(pitch_semitones) > 0.01:
                self._reverse_pitch_shifter.reset()
                self._reverse_pitch_shifter.set_pitch_semitones(pitch_semitones)
                reversed_chunk = self._reverse_pitch_shifter.process(reversed_chunk)

            fade_len = min(max(8, int(self.sample_rate * 0.012)), window_samples // 8)
            envelope = np.ones(window_samples, dtype=np.float32)
            fade = np.linspace(0.18, 1.0, fade_len, dtype=np.float32)
            envelope[:fade_len] = fade
            envelope[-fade_len:] = fade[::-1]
            reversed_chunk *= envelope * np.float32(gain)
            self.reverse_output_buffer = np.concatenate((self.reverse_output_buffer, reversed_chunk))

        if self.reverse_output_buffer.size < samples.size:
            return samples.copy()

        wet = self.reverse_output_buffer[:samples.size].copy()
        self.reverse_output_buffer = self.reverse_output_buffer[samples.size:]
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _alien_glitch(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 4 or mix <= 0.0:
            return samples.copy()

        indexes = np.arange(samples.size, dtype=np.int32)
        hold = max(2, int(round(22.0 - (mix * 18.0))))
        held = samples[(indexes // hold) * hold]
        ring = self._ring_modulate(samples, 96.0 + (mix * 72.0))
        crushed = self._bitcrush(samples + ring * np.float32(0.35), 4)
        reverse = self._reverse_fragments(samples, min(0.72, mix * 0.85))
        warped = (held * 0.35) + (ring * 0.38) + (crushed * 0.42) + (reverse * 0.28)
        warped = np.tanh(warped * np.float32(1.4 + mix)).astype(np.float32, copy=False)
        return ((samples * (1.0 - mix)) + (warped * mix)).astype(np.float32, copy=False)

    def _glitch(self, samples: np.ndarray, mix: float, rate_hz: float) -> np.ndarray:
        if samples.size < 4 or mix <= 0.0:
            return samples.copy()

        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = rate_hz / max(1, self.sample_rate)
        phase = (self.glitch_phase + indexes * phase_step) % 1.0
        self.glitch_phase = (self.glitch_phase + samples.size * phase_step) % 1.0

        hold = max(2, int(self.sample_rate / max(1.0, rate_hz * (8.0 + mix * 16.0))))
        int_indexes = np.arange(samples.size, dtype=np.int32)
        held = samples[(int_indexes // hold) * hold]
        repeated = np.roll(held, hold // 2)
        crushed = self._bitcrush(repeated + held * np.float32(0.4), 3 + int((1.0 - mix) * 4.0))

        dropout = np.where((phase > 0.16) & (phase < 0.24 + mix * 0.12), 0.0, 1.0).astype(np.float32)
        chop = np.where(phase < 0.5, 1.0, -1.0).astype(np.float32)
        ring = self._ring_modulate(samples, 150.0 + rate_hz * 7.5)

        wet = (crushed * 0.55) + (held * chop * 0.28) + (ring * 0.24)
        wet = np.tanh(wet * np.float32(1.35 + mix * 1.4)).astype(np.float32, copy=False)
        wet *= dropout
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _time_glitch(
        self,
        samples: np.ndarray,
        mix: float,
        depth: float,
        interval_s: float,
        fragment_ms: float,
        lookback_s: float,
        repeats: int,
        reverse_chance: float,
        pingpong_chance: float,
        trigger_mode: str,
        repeat_volume: float,
        voice_duck: float,
        speed: float,
        pitch_semitones: float,
        direction: str = "random",
    ) -> np.ndarray:
        """Replay short pieces of recent audio to create temporal stutters and rewinds."""
        if samples.size == 0:
            return samples.copy()

        output = samples.copy()
        history = self.time_glitch_history
        history_size = history.size
        fade_samples = max(1, int(self.sample_rate * 0.0015))

        shortcut_mode = trigger_mode.strip().lower() == "shortcut"
        if self._time_glitch_interval != interval_s:
            self.time_glitch_samples_until_event = min(self.time_glitch_samples_until_event, max(1, int(self.sample_rate * interval_s)))
            self._time_glitch_interval = interval_s
        render_settings = (speed, pitch_semitones, direction, repeats)
        if (self.time_glitch_event_remaining > 0 and self._time_glitch_source.size and
                self._time_glitch_render_settings != render_settings and not self._time_glitch_stop_pending):
            previous = self._time_glitch_render_settings
            cycles = self.time_glitch_event_elapsed / max(1, self.time_glitch_grain.size)
            actual_repeats = repeats if previous[3] != repeats else self.time_glitch_event_total // max(1, self.time_glitch_grain.size)
            self.time_glitch_grain = self._render_time_glitch_grain(self._time_glitch_source, speed, pitch_semitones, direction)
            self.time_glitch_event_elapsed = round(cycles * self.time_glitch_grain.size)
            self.time_glitch_event_total = self.time_glitch_grain.size * actual_repeats
            self.time_glitch_event_remaining = max(0, self.time_glitch_event_total - self.time_glitch_event_elapsed)
            if self._time_glitch_hold.is_set():
                self.time_glitch_event_remaining = max(self.time_glitch_grain.size, self.time_glitch_event_remaining)
            self.time_glitch_grain_pos = self.time_glitch_event_elapsed % self.time_glitch_grain.size
            self._time_glitch_render_settings = render_settings
        if self._time_glitch_stop_pending:
            self._time_glitch_stop_pending = False
        index = 0
        while index < samples.size:
            trigger_requested = shortcut_mode and self._time_glitch_trigger.is_set()
            if trigger_requested:
                started = self._start_time_glitch_event(
                    depth,
                    interval_s,
                    fragment_ms,
                    lookback_s,
                    repeats,
                    reverse_chance,
                    pingpong_chance,
                    speed,
                    pitch_semitones,
                    exact=True,
                    direction=direction,
                )
                if started:
                    self._time_glitch_trigger.clear()
            elif self.time_glitch_event_remaining <= 0 and not shortcut_mode:
                if self.time_glitch_samples_until_event <= 0:
                    self._start_time_glitch_event(
                        depth,
                        interval_s,
                        fragment_ms,
                        lookback_s,
                        repeats,
                        reverse_chance,
                        pingpong_chance,
                        speed,
                        pitch_semitones,
                        direction=direction,
                    )
            active = self.time_glitch_event_remaining > 0 and self.time_glitch_grain.size > 0
            held = self._time_glitch_hold.is_set()
            size = min(samples.size - index, history_size - self.time_glitch_history_pos)
            if active and not held:
                size = min(size, self.time_glitch_event_remaining)
            elif not active and not shortcut_mode:
                size = min(size, max(1, self.time_glitch_samples_until_event))
            clean = samples[index:index + size]
            if active:
                offsets = np.arange(size)
                wet = self.time_glitch_grain[(self.time_glitch_grain_pos + offsets) % self.time_glitch_grain.size]
                edges = self.time_glitch_event_elapsed + offsets
                if not held:
                    edges = np.minimum(edges, self.time_glitch_event_remaining - 1 - offsets)
                event_mix = mix * np.clip(edges / fade_samples, 0.0, 1.0)
                output[index:index + size] = clean * (1.0 - voice_duck * event_mix) + wet * event_mix * repeat_volume
                self.time_glitch_grain_pos = (self.time_glitch_grain_pos + size) % self.time_glitch_grain.size
                self.time_glitch_event_elapsed += size
                if not held:
                    self.time_glitch_event_remaining -= size
            elif not shortcut_mode:
                self.time_glitch_samples_until_event -= size
            history[self.time_glitch_history_pos:self.time_glitch_history_pos + size] = clean
            self.time_glitch_history_pos = (self.time_glitch_history_pos + size) % history_size
            self.time_glitch_history_filled = min(history_size, self.time_glitch_history_filled + size)
            index += size

        return output.astype(np.float32, copy=False)

    def _start_time_glitch_event(
        self,
        depth: float,
        interval_s: float,
        fragment_ms: float,
        lookback_s: float,
        repeats: int,
        reverse_chance: float,
        pingpong_chance: float,
        speed: float = 1.0,
        pitch_semitones: float = 0.0,
        exact: bool = False,
        direction: str = "random",
    ) -> bool:
        jitter = float(self.noise_rng.uniform(0.65, 1.4))
        self.time_glitch_samples_until_event = max(1, int(self.sample_rate * interval_s * jitter))

        minimum_history = max(16, int(self.sample_rate * 0.045))
        if self.time_glitch_history_filled < minimum_history:
            return False

        target_grain = self.sample_rate * fragment_ms / 1000.0
        grain_min = max(8, int(target_grain * (0.72 - depth * 0.12)))
        grain_max = max(grain_min, int(target_grain * (1.08 + depth * 0.42)))
        grain_size = int(self.noise_rng.integers(grain_min, grain_max + 1))
        if exact:
            grain_size = min(int(target_grain), self.time_glitch_history_filled)
        else:
            grain_size = min(grain_size, self.time_glitch_history_filled)
        available_lookback = self.time_glitch_history_filled - grain_size

        lookback_min = min(available_lookback, max(1, int(self.sample_rate * 0.025)))
        lookback_max = min(
            available_lookback,
            max(lookback_min, int(self.sample_rate * lookback_s)),
        )
        lookback = int(self.noise_rng.integers(lookback_min, lookback_max + 1))
        if exact:
            lookback = min(available_lookback, max(0, int(self.sample_rate * lookback_s)))
        end = (self.time_glitch_history_pos - lookback) % self.time_glitch_history.size
        start = (end - grain_size) % self.time_glitch_history.size
        if start < end:
            grain = self.time_glitch_history[start:end].copy()
        else:
            grain = np.concatenate((self.time_glitch_history[start:], self.time_glitch_history[:end])).copy()
        if grain.size == 0:
            return False

        mode_roll = float(self.noise_rng.random())
        self._time_glitch_event_direction = "forward"
        if direction == "random":
            if mode_roll < pingpong_chance:
                self._time_glitch_event_direction = "pingpong"
            elif mode_roll < pingpong_chance + reverse_chance:
                self._time_glitch_event_direction = "reverse"
            elif not exact and mode_roll < pingpong_chance + reverse_chance + depth * 0.32:
                self._time_glitch_event_direction = "sliced"
        self._time_glitch_source = grain
        grain = self._render_time_glitch_grain(grain, speed, pitch_semitones, direction)
        self._time_glitch_render_settings = (speed, pitch_semitones, direction, repeats)

        repeat_variation = max(0, int(round(depth * 2.0)))
        actual_repeats = int(
            self.noise_rng.integers(max(1, repeats - repeat_variation), min(10000, repeats + repeat_variation) + 1)
        )
        if exact:
            actual_repeats = max(1, min(10000, repeats))
        self.time_glitch_grain = grain
        self.time_glitch_grain_pos = 0
        self.time_glitch_event_total = grain.size * actual_repeats
        self.time_glitch_event_remaining = self.time_glitch_event_total
        self.time_glitch_event_elapsed = 0
        return True

    def _render_time_glitch_grain(self, source: np.ndarray, speed: float, pitch_semitones: float, direction: str) -> np.ndarray:
        grain = source.copy()
        direction = self._time_glitch_event_direction if direction == "random" else direction
        if direction == "pingpong":
            grain = np.concatenate((grain, grain[::-1])).astype(np.float32, copy=False)
        elif direction == "reverse":
            grain = grain[::-1].copy()
        elif direction == "sliced":
            slice_size = max(8, grain.size // 3)
            grain = np.tile(grain[:slice_size], 3)

        if abs(speed - 1.0) > 0.001:
            positions = np.arange(max(8, int(round(grain.size / speed))), dtype=np.float64) * speed
            grain = np.interp(
                positions,
                np.arange(grain.size, dtype=np.float64),
                grain,
            ).astype(np.float32)

        # Warm up on a periodic copy so short grains do not start with an empty pitch delay.
        pitch_correction = pitch_semitones - 12.0 * math.log2(speed)
        if abs(pitch_correction) > 0.01:
            self._time_glitch_pitch_shifter.reset()
            self._time_glitch_pitch_shifter.set_pitch_semitones(pitch_correction)
            warmup = max(grain.size, int(self.sample_rate * 0.12))
            periodic = grain[np.arange(warmup + grain.size) % grain.size]
            grain = self._time_glitch_pitch_shifter.process(periodic)[-grain.size:]

        fade = min(max(1, int(self.sample_rate * 0.0015)), grain.size // 4)
        grain[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)
        grain[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)

        return grain.astype(np.float32, copy=False)

    def _band_limited(self, samples: np.ndarray) -> np.ndarray:
        if samples.size < 3:
            return samples.copy()
        previous = np.empty_like(samples)
        previous[0] = samples[0]
        previous[1:] = samples[:-1]
        high_pass = samples - previous * np.float32(0.94)
        kernel = np.array([0.18, 0.24, 0.24, 0.2, 0.14], dtype=np.float32)
        return np.convolve(high_pass, kernel, mode="same").astype(np.float32, copy=False)

    def _ambience(self, size: int, mode: str, volume: float) -> np.ndarray:
        if size <= 0 or volume <= 0.0:
            return np.zeros(max(0, size), dtype=np.float32)

        indexes = self._ambience_sample_index + np.arange(size, dtype=np.float64)
        time_s = indexes / max(1, self.sample_rate)
        mode = str(mode or "space").strip().lower()

        if mode == "infernal":
            slow = 0.62 + 0.38 * np.sin(2.0 * math.pi * 0.17 * time_s)
            ambience = (
                0.72 * np.sin(2.0 * math.pi * 34.0 * time_s)
                + 0.38 * np.sin(2.0 * math.pi * 51.0 * time_s)
            ) * slow
            noise = self.noise_rng.normal(0.0, 0.18, size)
            ambience += np.convolve(noise, np.ones(24) / 24.0, mode="same")
        elif mode == "haunted":
            breath = self.noise_rng.normal(0.0, 0.42, size).astype(np.float32)
            breath = self._band_limited(breath)
            drift = 0.28 + 0.72 * ((np.sin(2.0 * math.pi * 0.11 * time_s) + 1.0) * 0.5)
            ambience = breath * drift + 0.16 * np.sin(2.0 * math.pi * 91.0 * time_s)
        elif mode == "digital":
            gate = (np.sin(2.0 * math.pi * 7.0 * time_s) > 0.72).astype(np.float32)
            carrier = np.sin(2.0 * math.pi * 780.0 * time_s) + 0.45 * np.sin(2.0 * math.pi * 1170.0 * time_s)
            ticks = (self.noise_rng.random(size) < (12.0 / max(1, self.sample_rate))).astype(np.float32)
            ambience = carrier * gate * 0.3 + ticks * self.noise_rng.uniform(-1.0, 1.0, size)
        else:
            orbit = 0.55 + 0.45 * np.sin(2.0 * math.pi * 0.09 * time_s)
            ambience = (
                0.62 * np.sin(2.0 * math.pi * 48.0 * time_s)
                + 0.28 * np.sin(2.0 * math.pi * 73.0 * time_s)
                + 0.12 * np.sin(2.0 * math.pi * 146.0 * time_s)
            ) * orbit

        self._ambience_sample_index += size
        return (np.asarray(ambience, dtype=np.float32) * np.float32(volume * 0.16)).astype(
            np.float32,
            copy=False,
        )

    def _harmony(self, x: np.ndarray, mode: str, mix: float) -> np.ndarray:
        mix = max(0.0, min(1.0, float(mix)))
        if mix <= 0.01:
            return x
            
        mode = str(mode).capitalize()
        if mode == "Major":
            offsets = [4.0, 7.0, -12.0, 0.0]
        elif mode == "Minor":
            offsets = [3.0, 7.0, -12.0, 0.0]
        elif mode == "Space":
            offsets = [7.0, 12.0, 19.0, -12.0]
        elif mode == "Octaves":
            offsets = [12.0, -12.0, -24.0, 0.0]
        elif mode == "Mystic":
            offsets = [3.0, 6.0, 9.0, -12.0]
        else:
            offsets = [4.0, 7.0, -12.0, 0.0]
            
        harmony_signals = []
        for i, offset in enumerate(offsets):
            if offset == 0.0:
                continue
            self._harm_shifters[i].set_pitch_semitones(offset)
            harmony_signals.append(self._harm_shifters[i].process(x))
            
        if not harmony_signals:
            return x
            
        harm_sum = np.zeros_like(x)
        for sig in harmony_signals:
            harm_sum += sig
        harm_sum /= len(harmony_signals)
        
        return (1.0 - mix) * x + mix * harm_sum

    def _drum_loop(self, size: int, bpm: float, volume: float) -> np.ndarray:
        bpm = max(40.0, min(240.0, float(bpm)))
        volume = max(0.0, min(1.0, float(volume)))
        
        beat_samples = int((60.0 / bpm) * self.sample_rate)
        measure_samples = 4 * beat_samples
        
        out = np.zeros(size, dtype=np.float32)
        start_idx = self._drum_sample_index
        end_idx = self._drum_sample_index + size
        self._drum_sample_index += size
        
        kicks = [0, int(2 * beat_samples), int(2.5 * beat_samples)]
        snares = [int(1 * beat_samples), int(3 * beat_samples)]
        hats = [int(i * 0.5 * beat_samples) for i in range(8)]
        
        kick_len = int(0.2 * self.sample_rate)
        snare_len = int(0.2 * self.sample_rate)
        hat_len = int(0.04 * self.sample_rate)
        
        m_start = (start_idx - kick_len) // measure_samples
        m_end = end_idx // measure_samples + 1
        
        for m in range(m_start, m_end):
            for k in kicks:
                trigger_abs = m * measure_samples + k
                if start_idx - kick_len <= trigger_abs < end_idx:
                    b_start = max(0, trigger_abs - start_idx)
                    b_end = min(size, trigger_abs + kick_len - start_idx)
                    if b_end > b_start:
                        t_sec = (np.arange(b_start, b_end) + start_idx - trigger_abs) / self.sample_rate
                        freq = 45.0 + 100.0 * np.exp(-t_sec * 45.0)
                        phase = 2.0 * np.pi * freq * t_sec
                        out[b_start:b_end] += np.sin(phase) * np.exp(-t_sec * 16.0)
                        
            for s in snares:
                trigger_abs = m * measure_samples + s
                if start_idx - snare_len <= trigger_abs < end_idx:
                    b_start = max(0, trigger_abs - start_idx)
                    b_end = min(size, trigger_abs + snare_len - start_idx)
                    if b_end > b_start:
                        t_sec = (np.arange(b_start, b_end) + start_idx - trigger_abs) / self.sample_rate
                        n_samples = b_end - b_start
                        noise = (np.random.rand(n_samples).astype(np.float32) * 2.0 - 1.0) * np.exp(-t_sec * 20.0)
                        tone = np.sin(2.0 * np.pi * 180.0 * t_sec) * np.exp(-t_sec * 35.0)
                        out[b_start:b_end] += (0.65 * noise + 0.35 * tone)
                        
            for h in hats:
                trigger_abs = m * measure_samples + h
                if start_idx - hat_len <= trigger_abs < end_idx:
                    b_start = max(0, trigger_abs - start_idx)
                    b_end = min(size, trigger_abs + hat_len - start_idx)
                    if b_end > b_start:
                        t_sec = (np.arange(b_start, b_end) + start_idx - trigger_abs) / self.sample_rate
                        n_samples = b_end - b_start
                        noise = (np.random.rand(n_samples).astype(np.float32) * 2.0 - 1.0) * np.exp(-t_sec * 75.0)
                        out[b_start:b_end] += 0.45 * noise
                        
        return out * np.float32(volume)


def _finite_clamped(value: float, minimum: float, maximum: float, fallback: float) -> float:
    try:
        value = float(value)
    except (TypeError, ValueError):
        return fallback
    if not math.isfinite(value):
        return fallback
    return max(minimum, min(maximum, value))


class DualDelayPitchShifter:
    """Small real-time pitch shifter based on two crossfaded modulated delays.

    It is intentionally compact and dependency-light. It favors low latency and
    stable streaming over studio-quality formant preservation.
    """

    def __init__(self, sample_rate: int, min_delay_ms: float = 5.0, max_delay_ms: float = 55.0) -> None:
        self.sample_rate = int(sample_rate)
        self.min_delay_samples = max(2, int(self.sample_rate * min_delay_ms / 1000.0))
        self.max_delay_samples = max(self.min_delay_samples + 8, int(self.sample_rate * max_delay_ms / 1000.0))
        self.delay_range = float(self.max_delay_samples - self.min_delay_samples)
        self.buffer_len = self.max_delay_samples + 8192
        self.buffer = np.zeros(self.buffer_len, dtype=np.float32)
        self.write_pos = 0
        self.phase = 0.0
        self.pitch_ratio = 1.0

    def reset(self) -> None:
        self.buffer.fill(0.0)
        self.write_pos = 0
        self.phase = 0.0

    def set_pitch_semitones(self, semitones: float) -> None:
        self.pitch_ratio = semitones_to_ratio(semitones)

    def process(self, samples: np.ndarray) -> np.ndarray:
        block = np.asarray(samples, dtype=np.float32).reshape(-1)
        if block.size == 0:
            return block.copy()

        if abs(self.pitch_ratio - 1.0) < 0.0001:
            self._write_block(block)
            return block.copy()

        out = np.empty_like(block)
        ratio = self.pitch_ratio
        phase_step = abs(ratio - 1.0) / self.delay_range

        # A chunk never spans the minimum delay, so vector reads cannot see future samples.
        offset = 0
        while offset < block.size:
            size = min(self.min_delay_samples, block.size - offset)
            positions = (self.write_pos + np.arange(size)) % self.buffer_len
            self.buffer[positions] = block[offset:offset + size]
            p1 = (self.phase + np.arange(size) * phase_step) % 1.0
            p2 = (p1 + 0.5) % 1.0
            if ratio > 1.0:
                delays = (self.max_delay_samples - p1 * self.delay_range,
                          self.max_delay_samples - p2 * self.delay_range)
            else:
                delays = (self.min_delay_samples + p1 * self.delay_range,
                          self.min_delay_samples + p2 * self.delay_range)
            mixed = np.zeros(size, dtype=np.float64)
            weight_sum = np.zeros(size, dtype=np.float64)
            for phase, delay in zip((p1, p2), delays):
                read = positions - delay
                floor = np.floor(read)
                left = floor.astype(np.int64) % self.buffer_len
                fraction = read - floor
                values = self.buffer[left] * (1.0 - fraction) + self.buffer[(left + 1) % self.buffer_len] * fraction
                weight = np.sin(np.pi * phase) ** 2
                mixed += values * weight
                weight_sum += weight
            out[offset:offset + size] = mixed / np.maximum(weight_sum, 1e-6)
            self.write_pos = (self.write_pos + size) % self.buffer_len
            self.phase = (self.phase + size * phase_step) % 1.0
            offset += size

        return np.nan_to_num(out, nan=0.0, posinf=1_000_000.0, neginf=-1_000_000.0).astype(
            np.float32,
            copy=False,
        )

    def _write_block(self, block: np.ndarray) -> None:
        remaining = block.size
        offset = 0
        while remaining > 0:
            room = self.buffer_len - self.write_pos
            count = min(room, remaining)
            self.buffer[self.write_pos : self.write_pos + count] = block[offset : offset + count]
            self.write_pos = (self.write_pos + count) % self.buffer_len
            offset += count
            remaining -= count

    def _read_delay(self, delay_samples: float) -> float:
        read_pos = self.write_pos - delay_samples
        while read_pos < 0.0:
            read_pos += self.buffer_len

        left = int(math.floor(read_pos)) % self.buffer_len
        right = (left + 1) % self.buffer_len
        frac = read_pos - math.floor(read_pos)
        return float((self.buffer[left] * (1.0 - frac)) + (self.buffer[right] * frac))
