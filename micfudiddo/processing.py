from __future__ import annotations

from dataclasses import dataclass
import math

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
    alien_glitch_enabled: bool = False
    alien_glitch_mix: float = 0.62
    glitch_enabled: bool = False
    glitch_mix: float = 0.55
    glitch_rate_hz: float = 18.0
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
        self.echo_feedback = 0.28
        self.echo_delay_samples = max(1, int(self.sample_rate * 0.135))
        self.echo_buffer = np.zeros(max(self.echo_delay_samples + 1, int(self.sample_rate * 0.5)), dtype=np.float32)
        self.echo_pos = 0
        self.noise_rng = np.random.default_rng()
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

        if settings.wobble_enabled:
            y = self._wobble(y, _finite_clamped(settings.wobble_mix, 0.0, 1.0, 0.35))

        if settings.reverse_enabled:
            y = self._reverse_fragments(y, _finite_clamped(settings.reverse_mix, 0.0, 1.0, 0.65))

        if settings.alien_glitch_enabled:
            y = self._alien_glitch(y, _finite_clamped(settings.alien_glitch_mix, 0.0, 1.0, 0.62))

        if settings.glitch_enabled:
            y = self._glitch(
                y,
                _finite_clamped(settings.glitch_mix, 0.0, 1.0, 0.55),
                _finite_clamped(settings.glitch_rate_hz, 4.0, 60.0, 18.0),
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

    def _wobble(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 8 or mix <= 0.0:
            return samples.copy()
        indexes = np.arange(samples.size, dtype=np.float32)
        phase_step = (2.0 * math.pi * 4.4) / self.sample_rate
        wobble = 0.68 + (0.32 * ((np.sin(self.tremolo_phase + indexes * phase_step) + 1.0) * 0.5))
        wet = (samples * wobble.astype(np.float32)).astype(np.float32, copy=False)
        return ((samples * (1.0 - mix)) + (wet * mix)).astype(np.float32, copy=False)

    def _reverse_fragments(self, samples: np.ndarray, mix: float) -> np.ndarray:
        if samples.size < 4 or mix <= 0.0:
            return samples.copy()

        grain = max(8, min(samples.size, int(self.sample_rate * 0.014)))
        reversed_block = np.empty_like(samples)
        fade_len = min(grain // 3, max(2, samples.size // 8))

        for start in range(0, samples.size, grain):
            chunk = samples[start : start + grain]
            flipped = chunk[::-1]
            if flipped.size >= fade_len * 2:
                fade = np.linspace(0.35, 1.0, fade_len, dtype=np.float32)
                flipped = flipped.copy()
                flipped[:fade_len] *= fade
                flipped[-fade_len:] *= fade[::-1]
            reversed_block[start : start + flipped.size] = flipped

        smeared = np.roll(self._bitcrush(reversed_block, 8), grain // 2)
        smeared = self._band_limited(smeared)
        safe_mix = min(0.58, mix)
        return ((samples * (1.0 - safe_mix)) + (smeared * safe_mix)).astype(np.float32, copy=False)

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

    def _band_limited(self, samples: np.ndarray) -> np.ndarray:
        if samples.size < 3:
            return samples.copy()
        previous = np.empty_like(samples)
        previous[0] = samples[0]
        previous[1:] = samples[:-1]
        high_pass = samples - previous * np.float32(0.94)
        kernel = np.array([0.18, 0.24, 0.24, 0.2, 0.14], dtype=np.float32)
        return np.convolve(high_pass, kernel, mode="same").astype(np.float32, copy=False)

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
