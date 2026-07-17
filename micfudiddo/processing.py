from __future__ import annotations

from dataclasses import dataclass
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
    delay_enabled: bool = False
    delay_mix: float = 0.3
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


class VoiceEffectsProcessor:
    def __init__(self, sample_rate: int) -> None:
        self.sample_rate = int(sample_rate)
        self.robot_phase = 0.0
        self.tremolo_phase = 0.0
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
        self._time_glitch_pitch_shifter = DualDelayPitchShifter(self.sample_rate)
        self.reverse_input_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_output_buffer = np.zeros(0, dtype=np.float32)
        self.reverse_window_samples = 0
        self._reverse_pitch_shifter = DualDelayPitchShifter(self.sample_rate)
        self.echo_feedback = 0.28
        self.echo_delay_samples = max(1, int(self.sample_rate * 0.135))
        self.echo_buffer = np.zeros(max(self.echo_delay_samples + 1, int(self.sample_rate * 0.5)), dtype=np.float32)
        self.echo_pos = 0
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

    def process(self, samples: np.ndarray, settings: EffectsSettings) -> np.ndarray:
        y = np.asarray(samples, dtype=np.float32).reshape(-1).copy()
        if y.size == 0:
            return y

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
            y = self._echo(y, _finite_clamped(settings.echo_mix, 0.0, 1.0, 0.25))

        if settings.delay_enabled:
            y = self._echo(y, _finite_clamped(settings.delay_mix, 0.0, 1.0, 0.3))

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
            y = self._wobble(y, _finite_clamped(settings.wobble_mix, 0.0, 1.0, 0.35))

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
        if hold:
            self._time_glitch_hold.set()
        else:
            self._time_glitch_hold.clear()
        self._time_glitch_trigger.set()

    def release_time_glitch(self) -> None:
        self._time_glitch_hold.clear()
        fade_samples = max(1, int(self.sample_rate * 0.01))
        if self.time_glitch_event_remaining > fade_samples:
            self.time_glitch_event_remaining = fade_samples

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

    def _echo(self, samples: np.ndarray, mix: float) -> np.ndarray:
        out = np.empty_like(samples)
        for i, sample in enumerate(samples):
            delayed = self.echo_buffer[self.echo_pos]
            out[i] = sample + (delayed * mix)
            self.echo_buffer[self.echo_pos] = sample + (delayed * self.echo_feedback)
            self.echo_pos = (self.echo_pos + 1) % self.echo_buffer.size
        return out

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
        wet = self._echo(samples, mix * 0.55)
        wet = self._echo(wet, mix * 0.35)
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _demon(self, samples: np.ndarray, drive: float) -> np.ndarray:
        growl = self._ring_modulate(samples, 31.0)
        driven = np.tanh((samples + growl * 0.45) * np.float32(drive))
        return driven.astype(np.float32, copy=False)

    def _alien(self, samples: np.ndarray, rate_hz: float) -> np.ndarray:
        carrier = self._ring_modulate(samples, rate_hz)
        return ((samples * 0.35) + (carrier * 0.85)).astype(np.float32, copy=False)

    def _ghost(self, samples: np.ndarray, mix: float) -> np.ndarray:
        airy = self._echo(samples, mix)
        airy = self._tremolo(airy, 2.8)
        return ((samples * (1.0 - mix)) + (airy * mix)).astype(np.float32, copy=False)

    def _chorus(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 12 or mix <= 0.0:
            return samples.copy()
        delay_a = max(2, int(self.sample_rate * 0.012))
        delay_b = max(3, int(self.sample_rate * 0.019))
        wet = np.zeros_like(samples)
        wet[delay_a:] += samples[:-delay_a] * np.float32(0.62)
        wet[delay_b:] += samples[:-delay_b] * np.float32(0.38)
        wet = self._tremolo(wet, 1.6)
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _flanger(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 8 or mix <= 0.0:
            return samples.copy()
        delay = max(1, int(self.sample_rate * 0.004))
        wet = np.zeros_like(samples)
        wet[delay:] = samples[:-delay]
        wet = np.tanh(samples + wet * np.float32(0.82)).astype(np.float32, copy=False)
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
        for index, sample in enumerate(shifted):
            read_pos = (self.double_voice_pos - delay_samples) % self.double_voice_buffer.size
            wet[index] = self.double_voice_buffer[read_pos]
            self.double_voice_buffer[self.double_voice_pos] = sample
            self.double_voice_pos = (self.double_voice_pos + 1) % self.double_voice_buffer.size
        return (
            samples * np.float32(1.0 - mix * 0.32) + wet * np.float32(mix * 0.82)
        ).astype(np.float32, copy=False)

    def _wobble(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 8 or mix <= 0.0:
            return samples.copy()
        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = (2.0 * math.pi * 4.4) / self.sample_rate
        wobble = 0.68 + (0.32 * ((np.sin(self.tremolo_phase + indexes * phase_step) + 1.0) * 0.5))
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
    ) -> np.ndarray:
        """Replay short pieces of recent audio to create temporal stutters and rewinds."""
        if samples.size == 0 or mix <= 0.0:
            return samples.copy()

        output = samples.copy()
        history = self.time_glitch_history
        history_size = history.size
        fade_samples = max(1, int(self.sample_rate * 0.0015))

        for index, clean_sample in enumerate(samples):
            history[self.time_glitch_history_pos] = clean_sample
            self.time_glitch_history_pos = (self.time_glitch_history_pos + 1) % history_size
            self.time_glitch_history_filled = min(history_size, self.time_glitch_history_filled + 1)

            shortcut_mode = trigger_mode.strip().lower() == "shortcut"
            trigger_requested = shortcut_mode and self._time_glitch_trigger.is_set()
            if trigger_requested:
                self._time_glitch_trigger.clear()
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
                )
            elif self.time_glitch_event_remaining <= 0 and not shortcut_mode:
                self.time_glitch_samples_until_event -= 1
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
                    )

            if self.time_glitch_event_remaining <= 0 or self.time_glitch_grain.size == 0:
                continue

            wet_sample = self.time_glitch_grain[self.time_glitch_grain_pos]
            self.time_glitch_grain_pos = (self.time_glitch_grain_pos + 1) % self.time_glitch_grain.size

            edge = min(self.time_glitch_event_elapsed, self.time_glitch_event_remaining - 1)
            event_mix = mix * min(1.0, max(0.0, edge / fade_samples))
            dry_gain = 1.0 - (voice_duck * event_mix)
            output[index] = (clean_sample * dry_gain) + (wet_sample * event_mix * repeat_volume)
            self.time_glitch_event_elapsed += 1
            if not self._time_glitch_hold.is_set():
                self.time_glitch_event_remaining -= 1

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
    ) -> None:
        jitter = float(self.noise_rng.uniform(0.65, 1.4))
        self.time_glitch_samples_until_event = max(1, int(self.sample_rate * interval_s * jitter))

        minimum_history = max(16, int(self.sample_rate * 0.045))
        if self.time_glitch_history_filled < minimum_history:
            return

        target_grain = self.sample_rate * fragment_ms / 1000.0
        grain_min = max(8, int(target_grain * (0.72 - depth * 0.12)))
        grain_max = max(grain_min, int(target_grain * (1.08 + depth * 0.42)))
        grain_size = int(self.noise_rng.integers(grain_min, grain_max + 1))
        available_lookback = self.time_glitch_history_filled - grain_size - 1
        if available_lookback <= 1:
            return

        lookback_min = min(available_lookback, max(1, int(self.sample_rate * 0.025)))
        lookback_max = min(
            available_lookback,
            max(lookback_min, int(self.sample_rate * lookback_s)),
        )
        lookback = int(self.noise_rng.integers(lookback_min, lookback_max + 1))
        end = (self.time_glitch_history_pos - lookback) % self.time_glitch_history.size
        start = (end - grain_size) % self.time_glitch_history.size
        if start < end:
            grain = self.time_glitch_history[start:end].copy()
        else:
            grain = np.concatenate((self.time_glitch_history[start:], self.time_glitch_history[:end])).copy()
        if grain.size == 0:
            return

        mode_roll = float(self.noise_rng.random())
        if mode_roll < pingpong_chance:
            grain = np.concatenate((grain, grain[::-1])).astype(np.float32, copy=False)
        elif mode_roll < pingpong_chance + reverse_chance:
            grain = grain[::-1].copy()
        elif mode_roll < pingpong_chance + reverse_chance + depth * 0.32:
            slice_size = max(8, grain.size // 3)
            grain = np.tile(grain[:slice_size], 3)

        if abs(speed - 1.0) > 0.001:
            positions = (np.arange(grain.size, dtype=np.float64) * speed) % grain.size
            grain = np.interp(
                positions,
                np.arange(grain.size, dtype=np.float64),
                grain,
            ).astype(np.float32)

        if abs(pitch_semitones) > 0.01:
            self._time_glitch_pitch_shifter.reset()
            self._time_glitch_pitch_shifter.set_pitch_semitones(pitch_semitones)
            grain = self._time_glitch_pitch_shifter.process(grain)

        repeat_variation = max(0, int(round(depth * 2.0)))
        actual_repeats = int(
            self.noise_rng.integers(max(1, repeats - repeat_variation), min(10000, repeats + repeat_variation) + 1)
        )
        self.time_glitch_grain = grain.astype(np.float32, copy=False)
        self.time_glitch_grain_pos = 0
        self.time_glitch_event_total = grain.size * actual_repeats
        self.time_glitch_event_remaining = self.time_glitch_event_total
        self.time_glitch_event_elapsed = 0

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

        for i, sample in enumerate(block):
            self.buffer[self.write_pos] = sample

            p1 = self.phase
            p2 = (self.phase + 0.5) % 1.0

            if ratio > 1.0:
                delay1 = self.max_delay_samples - (p1 * self.delay_range)
                delay2 = self.max_delay_samples - (p2 * self.delay_range)
            else:
                delay1 = self.min_delay_samples + (p1 * self.delay_range)
                delay2 = self.min_delay_samples + (p2 * self.delay_range)

            window1 = math.sin(math.pi * p1) ** 2
            window2 = math.sin(math.pi * p2) ** 2
            mixed = (self._read_delay(delay1) * window1) + (self._read_delay(delay2) * window2)
            out[i] = mixed / max(window1 + window2, 0.000001)

            self.write_pos = (self.write_pos + 1) % self.buffer_len
            self.phase = (self.phase + phase_step) % 1.0

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
