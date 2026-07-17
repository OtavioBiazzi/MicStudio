from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import sys
import threading
import uuid

import numpy as np

from .devices import AudioDevice, sample_rate_candidates
from .processing import (
    DualDelayPitchShifter,
    EffectsSettings,
    VoiceEffectsProcessor,
    apply_gain,
    hard_clip_for_output,
)


class AudioEngineError(RuntimeError):
    pass


def _sanitize_output_route(value: str) -> str:
    text = str(value or "both").strip().lower()
    if text in {"microphone", "monitor", "both"}:
        return text
    return "both"


def block_size_candidates(preferred_block_size: int | None = None) -> list[int]:
    values = []
    if preferred_block_size is not None:
        values.append(int(preferred_block_size))
    values.extend([1024, 512, 256, 128])

    unique: list[int] = []
    for value in values:
        if 64 <= value <= 4096 and value not in unique:
            unique.append(value)
    return unique


def input_channel_count(input_device: AudioDevice, requested_channels: int | None = None) -> int:
    try:
        requested = int(requested_channels or 1)
    except (TypeError, ValueError):
        requested = 1
    available = max(1, int(input_device.max_input_channels or 1))
    return max(1, min(requested, available))


@dataclass
class EngineConfig:
    input_device: AudioDevice
    processed_output_device: AudioDevice | None
    monitor_output_device: AudioDevice | None
    gain: float = 1.0
    pitch_semitones: float = 0.0
    effects: EffectsSettings = EffectsSettings()
    monitor_enabled: bool = False
    monitor_volume: float = 1.0
    soundboard_monitor_enabled: bool = False
    soundboard_monitor_volume: float = 0.65
    primary_outputs_monitor_mix: bool = False
    master_mic_gain: float = 1.0
    master_voice_volume: float = 1.0
    master_pitch: float = 0.0
    master_mute: bool = False
    preferred_sample_rate: int | None = None
    preferred_block_size: int | None = None
    input_channels: int = 1


class AudioRingBuffer:
    def __init__(self, capacity_frames: int) -> None:
        self.capacity_frames = max(1024, int(capacity_frames))
        self._chunks: deque[np.ndarray] = deque()
        self._available = 0
        self._lock = threading.Lock()

    def clear(self) -> None:
        with self._lock:
            self._chunks.clear()
            self._available = 0

    def write(self, samples: np.ndarray) -> None:
        chunk = np.asarray(samples, dtype=np.float32).reshape(-1).copy()
        if chunk.size == 0:
            return

        if not self._lock.acquire(blocking=False):
            return
        try:
            self._chunks.append(chunk)
            self._available += chunk.size
            self._trim_unlocked()
        finally:
            self._lock.release()

    def read(self, frames: int) -> np.ndarray:
        out = np.zeros(int(frames), dtype=np.float32)
        offset = 0
        if not self._lock.acquire(blocking=False):
            return out
        try:
            # If backlog exceeds 8 * frames (~40ms), proactively discard the oldest samples to keep a safe, low-latency buffer of 3 * frames.
            if self._available > 8 * frames:
                to_discard = self._available - 3 * frames
                while to_discard > 0 and self._chunks:
                    first = self._chunks[0]
                    discard_now = min(to_discard, first.size)
                    if discard_now == first.size:
                        self._chunks.popleft()
                    else:
                        self._chunks[0] = first[discard_now:].copy()
                    self._available -= discard_now
                    to_discard -= discard_now

            while offset < frames and self._chunks:
                first = self._chunks[0]
                take = min(frames - offset, first.size)
                out[offset : offset + take] = first[:take]
                if take == first.size:
                    self._chunks.popleft()
                else:
                    self._chunks[0] = first[take:].copy()
                self._available -= take
                offset += take
        finally:
            self._lock.release()
        return out

    def _trim_unlocked(self) -> None:
        while self._available > self.capacity_frames and self._chunks:
            overflow = self._available - self.capacity_frames
            first = self._chunks[0]
            if first.size <= overflow:
                self._chunks.popleft()
                self._available -= first.size
            else:
                self._chunks[0] = first[int(overflow) :].copy()
                self._available -= int(overflow)


@dataclass
class _SplitPrimaryStreams:
    input_stream: object
    output_stream: object

    def start(self) -> None:
        self.output_stream.start()
        self.input_stream.start()

    def stop(self) -> None:
        for stream in (self.input_stream, self.output_stream):
            try:
                stream.stop()
            except Exception:
                pass

    def close(self) -> None:
        for stream in (self.input_stream, self.output_stream):
            try:
                stream.close()
            except Exception:
                pass


@dataclass
class _Playback:
    samples: np.ndarray
    playback_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    sound_id: str = ""
    name: str = ""
    block_voice: bool = False
    mute_others: bool = False
    output_route: str = "both"
    loop: bool = False
    position: float = 0.0
    paused: bool = False
    volume_override: float = 1.0
    speed_override: float = 1.0
    gain_override: float = 1.0
    initial_volume: float = 1.0
    initial_speed: float = 1.0


class AudioEngine:
    def __init__(self) -> None:
        self._stream = None
        self._monitor_stream = None
        self._monitor_buffer: AudioRingBuffer | None = None
        self._primary_output_buffer: AudioRingBuffer | None = None
        self._pitch = DualDelayPitchShifter(48000)
        self._effects_processor = VoiceEffectsProcessor(48000)
        self._control_lock = threading.Lock()
        self._gain = 1.0
        self._master_mic_gain = 1.0
        self._master_voice_volume = 1.0
        self._master_pitch_semitones = 0.0
        self._master_mute = False
        self._pitch_semitones = 0.0
        self._effects = EffectsSettings()
        self._monitor_enabled = False
        self._monitor_volume = 1.0
        self._soundboard_monitor_enabled = False
        self._soundboard_monitor_volume = 0.65
        self._primary_outputs_monitor_mix = False
        self._monitor_device: AudioDevice | None = None
        self._primary_output_device: AudioDevice | None = None
        self._input_device: AudioDevice | None = None
        self._sample_rate = 48000
        self._block_size = 1024
        self._last_level = 0.0
        self._last_error = ""
        self._last_callback_status = ""
        self._running = False
        self._playbacks: list[_Playback] = []
        self._playback_lock = threading.Lock()
        self._recording = False
        self._recorded_chunks: list[np.ndarray] = []
        self._recording_lock = threading.Lock()

    @property
    def running(self) -> bool:
        return self._running

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    @property
    def block_size(self) -> int:
        return self._block_size

    @property
    def last_level(self) -> float:
        return self._last_level

    @property
    def last_error(self) -> str:
        return self._last_error

    @property
    def last_callback_status(self) -> str:
        return self._last_callback_status

    def set_controls(
        self,
        gain: float,
        pitch_semitones: float,
        effects: EffectsSettings | None = None,
        monitor_volume: float | None = None,
        soundboard_monitor_enabled: bool | None = None,
        soundboard_monitor_volume: float | None = None,
        master_mic_gain: float | None = None,
        master_voice_volume: float | None = None,
        master_pitch: float | None = None,
        master_mute: bool | None = None,
    ) -> None:
        with self._control_lock:
            self._gain = max(0.0, float(gain))
            self._pitch_semitones = float(pitch_semitones)
            if effects is not None:
                self._effects = effects
                if not effects.time_glitch_enabled or effects.time_glitch_trigger_mode != "shortcut":
                    self._effects_processor.release_time_glitch()
            if monitor_volume is not None:
                self._monitor_volume = max(0.0, min(3.0, float(monitor_volume)))
            if soundboard_monitor_enabled is not None:
                self._soundboard_monitor_enabled = bool(soundboard_monitor_enabled)
            if soundboard_monitor_volume is not None:
                self._soundboard_monitor_volume = max(0.0, min(3.0, float(soundboard_monitor_volume)))
            if master_mic_gain is not None:
                self._master_mic_gain = max(0.0, float(master_mic_gain))
            if master_voice_volume is not None:
                self._master_voice_volume = max(0.0, float(master_voice_volume))
            if master_pitch is not None:
                self._master_pitch_semitones = float(master_pitch)
            if master_mute is not None:
                self._master_mute = bool(master_mute)

    def trigger_time_glitch(self, hold: bool = False) -> None:
        self._effects_processor.trigger_time_glitch(hold=hold)

    def release_time_glitch(self) -> None:
        self._effects_processor.release_time_glitch()

    def play_sound(
        self,
        samples: np.ndarray,
        block_voice: bool = False,
        mute_others: bool = False,
        sound_id: str = "",
        name: str = "",
        replace: bool = True,
        start_seconds: float = 0.0,
        loop: bool = False,
        output_route: str = "both",
        initial_volume: float = 1.0,
        initial_speed: float = 1.0,
    ) -> str:
        block = np.asarray(samples, dtype=np.float32).reshape(-1)
        if block.size == 0:
            return ""
        playback = _Playback(
            block.copy(),
            sound_id=str(sound_id),
            name=str(name),
            block_voice=bool(block_voice),
            mute_others=bool(mute_others),
            output_route=_sanitize_output_route(output_route),
            loop=bool(loop),
            initial_volume=float(initial_volume),
            initial_speed=float(initial_speed),
        )
        start_frame = max(0.0, float(int(float(start_seconds or 0.0) * self._sample_rate)))
        playback.position = start_frame % playback.samples.size if playback.loop else min(start_frame, float(playback.samples.size))
        with self._playback_lock:
            if replace:
                self._playbacks.clear()
            self._playbacks.append(playback)
        return playback.playback_id

    def stop_sounds(self) -> None:
        with self._playback_lock:
            self._playbacks.clear()

    def stop_sound(self, sound_id: str = "", playback_id: str = "") -> int:
        sound_id = str(sound_id or "")
        playback_id = str(playback_id or "")
        with self._playback_lock:
            before = len(self._playbacks)
            self._playbacks = [
                item
                for item in self._playbacks
                if not ((sound_id and item.sound_id == sound_id) or (playback_id and item.playback_id == playback_id))
            ]
            return before - len(self._playbacks)

    def pause_sounds(self) -> None:
        with self._playback_lock:
            for playback in self._playbacks:
                playback.paused = True

    def resume_sounds(self) -> None:
        with self._playback_lock:
            for playback in self._playbacks:
                playback.paused = False

    def pause_sound(self, sound_id: str = "", playback_id: str = "") -> int:
        sound_id = str(sound_id or "")
        playback_id = str(playback_id or "")
        changed = 0
        with self._playback_lock:
            for playback in self._playbacks:
                if (sound_id and playback.sound_id == sound_id) or (playback_id and playback.playback_id == playback_id):
                    if not playback.paused:
                        playback.paused = True
                        changed += 1
        return changed

    def resume_sound(self, sound_id: str = "", playback_id: str = "") -> int:
        sound_id = str(sound_id or "")
        playback_id = str(playback_id or "")
        changed = 0
        with self._playback_lock:
            for playback in self._playbacks:
                if (sound_id and playback.sound_id == sound_id) or (playback_id and playback.playback_id == playback_id):
                    if playback.paused:
                        playback.paused = False
                        changed += 1
        return changed

    def seek_sound(self, seconds: float, playback_id: str = "") -> None:
        frame = max(0.0, float(int(float(seconds) * self._sample_rate)))
        with self._playback_lock:
            if not self._playbacks:
                return
            playback = self._playbacks[0]
            if playback_id:
                playback = next((item for item in self._playbacks if item.playback_id == playback_id), playback)
            playback.position = min(max(0.0, frame), float(playback.samples.size))

    def player_state(self) -> dict:
        states = self.player_states()
        if states:
            return states[0]
        return {
            "state": "stopped",
            "playbackId": "",
            "soundId": "",
            "name": "",
            "current": 0.0,
            "duration": 0.0,
            "progress": 0.0,
            "activeCount": 0,
        }

    def player_states(self) -> list[dict]:
        with self._playback_lock:
            if not self._playbacks:
                return []
            active_count = len(self._playbacks)
            states = []
            for playback in self._playbacks:
                duration = playback.samples.size / max(1.0, float(self._sample_rate))
                current = min(duration, playback.position / max(1.0, float(self._sample_rate)))
                states.append(
                    {
                        "state": "paused" if playback.paused else "playing",
                        "playbackId": playback.playback_id,
                        "soundId": playback.sound_id,
                        "name": playback.name,
                        "loop": playback.loop,
                        "muteOthers": playback.mute_others,
                        "current": current,
                        "duration": duration,
                        "progress": 0.0 if duration <= 0.0 else current / duration,
                        "activeCount": active_count,
                        "volume": playback.volume_override,
                        "speed": playback.speed_override,
                        "gain": playback.gain_override,
                    }
                )
            return states

    def update_playback(self, playback_id: str, patch: dict) -> bool:
        playback_id = str(playback_id or "")
        with self._playback_lock:
            for playback in self._playbacks:
                if playback.playback_id == playback_id:
                    if "paused" in patch:
                        playback.paused = bool(patch["paused"])
                    if "loop" in patch:
                        playback.loop = bool(patch["loop"])
                    if "volume" in patch:
                        playback.volume_override = max(0.0, float(patch["volume"]))
                    if "speed" in patch:
                        playback.speed_override = max(0.05, min(10.0, float(patch["speed"])))
                    if "gain" in patch:
                        playback.gain_override = max(0.0, float(patch["gain"]))
                    return True
        return False

    def start_recording(self) -> None:
        with self._recording_lock:
            self._recorded_chunks = []
            self._recording = True

    def stop_recording(self, output_path: str) -> int:
        try:
            import soundfile as sf
        except Exception as exc:  # pragma: no cover - depends on user environment
            raise AudioEngineError("A biblioteca soundfile nao esta instalada.") from exc

        with self._recording_lock:
            self._recording = False
            chunks = self._recorded_chunks
            self._recorded_chunks = []

        if chunks:
            audio = np.concatenate(chunks).astype(np.float32, copy=False)
        else:
            audio = np.zeros(0, dtype=np.float32)
        sf.write(output_path, audio, self._sample_rate)
        return int(audio.size)

    @property
    def recording(self) -> bool:
        return self._recording

    def start(self, config: EngineConfig) -> None:
        self.stop()
        self._last_error = ""
        self._last_callback_status = ""
        self._input_device = config.input_device
        self._monitor_device = config.monitor_output_device
        self._primary_output_device = config.processed_output_device
        self._primary_outputs_monitor_mix = bool(config.primary_outputs_monitor_mix)
        self.set_controls(
            config.gain,
            config.pitch_semitones,
            config.effects,
            monitor_volume=config.monitor_volume,
            soundboard_monitor_enabled=config.soundboard_monitor_enabled,
            soundboard_monitor_volume=config.soundboard_monitor_volume,
            master_mic_gain=config.master_mic_gain,
            master_voice_volume=config.master_voice_volume,
            master_pitch=config.master_pitch,
            master_mute=config.master_mute,
        )
        self._monitor_enabled = bool(config.monitor_enabled)

        primary_output = config.processed_output_device
        if primary_output is None:
            if (config.monitor_enabled or config.soundboard_monitor_enabled) and config.monitor_output_device is not None:
                primary_output = config.monitor_output_device
            else:
                raise AudioEngineError("Selecione uma saida virtual ou ative o monitoramento para teste local.")

        self._primary_output_device = primary_output
        try:
            self._stream = self._open_primary_stream(
                config.input_device,
                primary_output,
                preferred_sample_rate=config.preferred_sample_rate,
                preferred_block_size=config.preferred_block_size,
                input_channels=config.input_channels,
            )
            self._stream.start()
        except Exception:
            stream = self._stream
            self._stream = None
            if stream is not None:
                try:
                    stream.stop()
                except Exception:
                    pass
                try:
                    stream.close()
                except Exception:
                    pass
            if self._primary_output_buffer is not None:
                self._primary_output_buffer.clear()
            self._primary_output_buffer = None
            raise

        self._running = True
        if (
            (config.monitor_enabled or config.soundboard_monitor_enabled)
            and config.monitor_output_device is not None
            and config.monitor_output_device.index != primary_output.index
        ):
            self._start_monitor_stream(config.monitor_output_device)

    def stop(self) -> None:
        streams = [self._monitor_stream, self._stream]
        self._monitor_stream = None
        self._stream = None
        self._running = False

        for stream in streams:
            if stream is None:
                continue
            try:
                stream.stop()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass

        if self._monitor_buffer is not None:
            self._monitor_buffer.clear()
        self._monitor_buffer = None
        if self._primary_output_buffer is not None:
            self._primary_output_buffer.clear()
        self._primary_output_buffer = None
        self._last_level = 0.0
        self.stop_sounds()
        with self._recording_lock:
            self._recording = False
            self._recorded_chunks = []

    def set_monitor(
        self,
        enabled: bool,
        monitor_device: AudioDevice | None = None,
        *,
        monitor_volume: float | None = None,
        soundboard_monitor_enabled: bool | None = None,
        soundboard_monitor_volume: float | None = None,
    ) -> None:
        self._monitor_enabled = bool(enabled)
        if monitor_device is not None:
            self._monitor_device = monitor_device
        with self._control_lock:
            if monitor_volume is not None:
                self._monitor_volume = max(0.0, min(3.0, float(monitor_volume)))
            if soundboard_monitor_enabled is not None:
                self._soundboard_monitor_enabled = bool(soundboard_monitor_enabled)
            if soundboard_monitor_volume is not None:
                self._soundboard_monitor_volume = max(0.0, min(3.0, float(soundboard_monitor_volume)))

        if not self._running:
            return

        if not self._monitor_enabled and not self._soundboard_monitor_enabled:
            self._stop_monitor_stream()
            return

        if self._monitor_device is None:
            raise AudioEngineError("Nenhuma saida de monitoramento foi encontrada.")

        if self._primary_output_device is not None and self._monitor_device.index == self._primary_output_device.index:
            self._stop_monitor_stream()
            return

        if self._monitor_stream is None:
            self._start_monitor_stream(self._monitor_device)

    def _open_primary_stream(
        self,
        input_device: AudioDevice,
        output_device: AudioDevice,
        *,
        preferred_sample_rate: int | None = None,
        preferred_block_size: int | None = None,
        input_channels: int = 1,
    ):
        import sounddevice as sd
        import sys

        errors: list[str] = []
        candidates: list[tuple[int, int]] = []
        input_channels = input_channel_count(input_device, input_channels)
        
        # No Windows, usar um unico stream duplex (sd.Stream) com dispositivos de hardware diferentes
        # (como um microfone USB e um cabo virtual) no host API WASAPI causa desorganização de clock
        # e chiado contínuo/estático insuportável. Nesses casos, priorizamos o modo de streams separados
        # (split streams), que usa um buffer de anel (ring buffer) para absorver o drift de clock.
        is_windows = sys.platform.startswith("win")
        is_different_device = input_device.index != output_device.index
        
        if is_windows and is_different_device:
            for sample_rate in sample_rate_candidates(input_device, output_device, preferred_sample_rate):
                for block_size in block_size_candidates(preferred_block_size):
                    candidates.append((sample_rate, block_size))
                    try:
                        return self._open_split_primary_stream(
                            sd,
                            input_device,
                            output_device,
                            sample_rate,
                            block_size,
                            input_channels,
                        )
                    except Exception as exc:
                        errors.append(f"{sample_rate} Hz / bloco {block_size} separado: {exc}")

        for sample_rate in sample_rate_candidates(input_device, output_device, preferred_sample_rate):
            for block_size in block_size_candidates(preferred_block_size):
                if (sample_rate, block_size) not in candidates:
                    candidates.append((sample_rate, block_size))
                try:
                    self._sample_rate = sample_rate
                    self._block_size = block_size
                    self._pitch = DualDelayPitchShifter(sample_rate)
                    self._effects_processor = VoiceEffectsProcessor(sample_rate)
                    latency_val = 0.05 if sys.platform.startswith("win") else "low"
                    return sd.Stream(
                        device=(input_device.index, output_device.index),
                        samplerate=sample_rate,
                        blocksize=block_size,
                        channels=(input_channels, 1),
                        dtype="float32",
                        latency=latency_val,
                        callback=self._audio_callback,
                        clip_off=False,
                        dither_off=True,
                    )
                except Exception as exc:
                    errors.append(f"{sample_rate} Hz / bloco {block_size}: {exc}")

        if not (is_windows and is_different_device):
            for sample_rate, block_size in candidates:
                try:
                    return self._open_split_primary_stream(
                        sd,
                        input_device,
                        output_device,
                        sample_rate,
                        block_size,
                        input_channels,
                    )
                except Exception as exc:
                    errors.append(f"{sample_rate} Hz / bloco {block_size} separado: {exc}")

        joined = "\n".join(errors[-6:])
        raise AudioEngineError(f"Nao foi possivel abrir o fluxo de audio.\n{joined}")

    def _open_split_primary_stream(
        self,
        sd,
        input_device: AudioDevice,
        output_device: AudioDevice,
        sample_rate: int,
        block_size: int,
        input_channels: int = 1,
    ):
        self._sample_rate = sample_rate
        self._block_size = block_size
        self._pitch = DualDelayPitchShifter(sample_rate)
        self._effects_processor = VoiceEffectsProcessor(sample_rate)
        self._primary_output_buffer = AudioRingBuffer(int(sample_rate * 0.45))
        input_stream = None
        output_stream = None
        try:
            latency_val = 0.05 if sys.platform.startswith("win") else "low"
            output_stream = sd.OutputStream(
                device=output_device.index,
                samplerate=sample_rate,
                blocksize=block_size,
                channels=1,
                dtype="float32",
                latency=latency_val,
                callback=self._split_output_callback,
                clip_off=False,
                dither_off=True,
            )
            input_stream = sd.InputStream(
                device=input_device.index,
                samplerate=sample_rate,
                blocksize=block_size,
                channels=input_channels,
                dtype="float32",
                latency=latency_val,
                callback=self._split_input_callback,
                clip_off=False,
                dither_off=True,
            )
            self._last_callback_status = "Modo compatibilidade: entrada e saida separadas."
            return _SplitPrimaryStreams(input_stream=input_stream, output_stream=output_stream)
        except Exception:
            self._primary_output_buffer = None
            for stream in (input_stream, output_stream):
                if stream is None:
                    continue
                try:
                    stream.close()
                except Exception:
                    pass
            raise

    def _start_monitor_stream(self, output_device: AudioDevice) -> None:
        import sounddevice as sd

        self._stop_monitor_stream()
        self._monitor_buffer = AudioRingBuffer(int(self._sample_rate * 0.4))
        try:
            latency_val = 0.05 if sys.platform.startswith("win") else "low"
            self._monitor_stream = sd.OutputStream(
                device=output_device.index,
                samplerate=self._sample_rate,
                blocksize=self._block_size,
                channels=1,
                dtype="float32",
                latency=latency_val,
                callback=self._monitor_callback,
                clip_off=False,
                dither_off=True,
            )
            self._monitor_stream.start()
        except Exception as exc:
            self._monitor_stream = None
            self._monitor_buffer = None
            raise AudioEngineError(f"Nao foi possivel ativar o monitoramento: {exc}") from exc

    def _stop_monitor_stream(self) -> None:
        stream = self._monitor_stream
        self._monitor_stream = None
        if stream is not None:
            try:
                stream.stop()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass
        if self._monitor_buffer is not None:
            self._monitor_buffer.clear()
        self._monitor_buffer = None

    def _input_to_mono(self, indata) -> np.ndarray:
        block = np.asarray(indata, dtype=np.float32)
        if block.ndim == 1:
            return block
        if block.shape[1] <= 1:
            return np.asarray(block[:, 0], dtype=np.float32)
        return block.mean(axis=1).astype(np.float32, copy=False)

    def _audio_callback(self, indata, outdata, frames, _time, status) -> None:
        try:
            if status:
                self._last_callback_status = str(status)

            mono = self._input_to_mono(indata)
            processed, monitor_mix = self._process_audio_block(mono, frames)

            outdata.fill(0.0)
            outdata[:, 0] = hard_clip_for_output(monitor_mix) if self._primary_outputs_monitor_mix else processed

            if (
                (self._monitor_enabled or self._soundboard_monitor_enabled)
                and self._monitor_stream is not None
                and self._monitor_buffer is not None
            ):
                self._monitor_buffer.write(hard_clip_for_output(monitor_mix))
        except Exception as exc:
            self._last_error = str(exc)
            outdata.fill(0.0)

    def _split_input_callback(self, indata, frames, _time, status) -> None:
        try:
            if status:
                self._last_callback_status = str(status)
            mono = self._input_to_mono(indata)
            processed, monitor_mix = self._process_audio_block(mono, frames)
            primary = hard_clip_for_output(monitor_mix) if self._primary_outputs_monitor_mix else processed
            if self._primary_output_buffer is not None:
                self._primary_output_buffer.write(primary)
            if (
                (self._monitor_enabled or self._soundboard_monitor_enabled)
                and self._monitor_stream is not None
                and self._monitor_buffer is not None
            ):
                self._monitor_buffer.write(hard_clip_for_output(monitor_mix))
        except Exception as exc:
            self._last_error = str(exc)

    def _split_output_callback(self, outdata, frames, _time, status) -> None:
        if status:
            self._last_callback_status = str(status)
        if self._primary_output_buffer is None:
            outdata.fill(0.0)
            return
        data = self._primary_output_buffer.read(frames)
        outdata.fill(0.0)
        outdata[:, 0] = data

    def _process_audio_block(self, mono: np.ndarray, frames: int) -> tuple[np.ndarray, np.ndarray]:
        try:
            with self._control_lock:
                gain = (self._gain * self._master_mic_gain) if not self._master_mute else 0.0
                pitch_semitones = self._pitch_semitones + self._master_pitch_semitones
                effects = self._effects
                monitor_enabled = self._monitor_enabled
                monitor_volume = self._monitor_volume
                master_voice_volume = self._master_voice_volume
            soundboard_monitor_enabled = self._soundboard_monitor_enabled
            soundboard_monitor_volume = self._soundboard_monitor_volume

            self._pitch.set_pitch_semitones(pitch_semitones)
            gained = apply_gain(self._pitch.process(mono), gain)
            effected = self._effects_processor.process(gained, effects)
            effected = apply_gain(effected, master_voice_volume)
            soundboard_mix, soundboard_local_mix, block_voice = self._read_soundboard_mix(frames)
            voice_bus = np.zeros_like(effected) if block_voice else effected
            mixed = voice_bus + soundboard_mix
            processed = hard_clip_for_output(mixed)
            monitor_mix = np.zeros_like(processed)
            if monitor_enabled:
                monitor_mix += voice_bus * np.float32(monitor_volume)
            if soundboard_monitor_enabled:
                monitor_mix += soundboard_local_mix * np.float32(soundboard_monitor_volume)

            self._last_level = min(2.0, float(np.max(np.abs(processed))) if processed.size else 0.0)

            if self._recording:
                with self._recording_lock:
                    if self._recording:
                        self._recorded_chunks.append(processed.copy())
            clipping_mgr = getattr(self, "_clipping_manager", None)
            if clipping_mgr:
                clipping_mgr.write_voice(
                    processed,
                    monitor_voice=(voice_bus * np.float32(monitor_volume)) if monitor_enabled else None
                )
            return processed, monitor_mix
        except Exception as exc:
            self._last_error = str(exc)
            silence = np.zeros(int(frames), dtype=np.float32)
            return silence, silence

    def _read_soundboard_mix(self, frames: int) -> tuple[np.ndarray, np.ndarray, bool]:
        virtual_normal_mix = np.zeros(int(frames), dtype=np.float32)
        virtual_priority_mix = np.zeros(int(frames), dtype=np.float32)
        local_normal_mix = np.zeros(int(frames), dtype=np.float32)
        local_priority_mix = np.zeros(int(frames), dtype=np.float32)
        block_voice = False
        priority_active = False
        with self._playback_lock:
            remaining: list[_Playback] = []
            for playback in self._playbacks:
                if playback.paused:
                    remaining.append(playback)
                    continue
                virtual_target = virtual_priority_mix if playback.mute_others else virtual_normal_mix
                local_target = local_priority_mix if playback.mute_others else local_normal_mix
                use_virtual = playback.output_route in {"microphone", "both"}
                use_local = playback.output_route in {"monitor", "both"}
                
                speed = playback.speed_override
                volume = playback.volume_override
                gain = playback.gain_override
                mult = volume * gain
                
                # Check if we can use the ultra-fast slice path (speed is 1.0 and position is integer-ish)
                is_pos_int = abs(playback.position - int(playback.position)) < 1e-5
                if abs(speed - 1.0) < 1e-5 and is_pos_int:
                    pos_int = int(round(playback.position))
                    write_at = 0
                    while write_at < frames:
                        available = playback.samples.size - pos_int
                        if available <= 0:
                            if playback.loop:
                                pos_int = 0
                                continue
                            break
                        take = min(frames - write_at, available)
                        chunk = playback.samples[pos_int : pos_int + take] * np.float32(mult)
                        if use_virtual:
                            virtual_target[write_at : write_at + take] += chunk
                        if use_local:
                            local_target[write_at : write_at + take] += chunk
                        write_at += take
                        pos_int += take
                        if pos_int >= playback.samples.size and playback.loop:
                            pos_int = 0
                    playback.position = float(pos_int)
                else:
                    # High-performance NumPy resampling path
                    steps = np.arange(frames) * speed
                    indices = playback.position + steps
                    
                    if playback.loop:
                        indices = indices % playback.samples.size
                        idx_low = indices.astype(np.int32)
                        idx_high = (idx_low + 1) % playback.samples.size
                        frac = indices - idx_low
                        chunk = (1.0 - frac) * playback.samples[idx_low] + frac * playback.samples[idx_high]
                        chunk = chunk * np.float32(mult)
                        
                        if use_virtual:
                            virtual_target += chunk
                        if use_local:
                            local_target += chunk
                        playback.position = (playback.position + frames * speed) % playback.samples.size
                        write_at = frames
                    else:
                        valid_mask = indices < (playback.samples.size - 1)
                        take = int(np.sum(valid_mask))
                        if take > 0:
                            indices_valid = indices[valid_mask]
                            idx_low = indices_valid.astype(np.int32)
                            idx_high = np.minimum(idx_low + 1, playback.samples.size - 1)
                            frac = indices_valid - idx_low
                            chunk_valid = (1.0 - frac) * playback.samples[idx_low] + frac * playback.samples[idx_high]
                            chunk_valid = chunk_valid * np.float32(mult)
                            
                            if use_virtual:
                                virtual_target[:take] += chunk_valid
                            if use_local:
                                local_target[:take] += chunk_valid
                            playback.position += frames * speed
                            write_at = take
                        else:
                            playback.position = float(playback.samples.size)
                            write_at = 0
                            
                if write_at > 0:
                    block_voice = block_voice or bool(playback.block_voice)
                    priority_active = priority_active or bool(playback.mute_others)
                if playback.loop or playback.position < playback.samples.size:
                    remaining.append(playback)
            self._playbacks = remaining
        if priority_active:
            return virtual_priority_mix, local_priority_mix, block_voice
        return virtual_normal_mix + virtual_priority_mix, local_normal_mix + local_priority_mix, block_voice

    def _monitor_callback(self, outdata, frames, _time, status) -> None:
        if status:
            self._last_callback_status = str(status)
        if self._monitor_buffer is None:
            outdata.fill(0.0)
            return
        data = self._monitor_buffer.read(frames)
        outdata.fill(0.0)
        outdata[:, 0] = data
