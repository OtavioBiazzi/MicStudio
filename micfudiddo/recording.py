from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import threading
import time

import numpy as np
import soundfile as sf


@dataclass(frozen=True)
class RecordDevice:
    index: int
    name: str
    channels: int
    sample_rate: int
    is_loopback: bool

    @property
    def label(self) -> str:
        source = "PC" if self.is_loopback else "Mic"
        return f"{self.index} - {self.name} [{source}]"


def query_record_devices(include_inputs: bool = True, include_loopback: bool = True) -> list[RecordDevice]:
    import pyaudiowpatch as pyaudio

    pa = pyaudio.PyAudio()
    devices: list[RecordDevice] = []
    try:
        for index in range(pa.get_device_count()):
            raw = pa.get_device_info_by_index(index)
            channels = int(raw.get("maxInputChannels", 0))
            is_loopback = bool(raw.get("isLoopbackDevice", False))
            if channels <= 0:
                continue
            if is_loopback and not include_loopback:
                continue
            if (not is_loopback) and not include_inputs:
                continue
            devices.append(
                RecordDevice(
                    index=index,
                    name=str(raw.get("name", f"Device {index}")),
                    channels=max(1, min(2, channels)),
                    sample_rate=int(float(raw.get("defaultSampleRate", 48000))),
                    is_loopback=is_loopback,
                )
            )
    finally:
        pa.terminate()
    return devices


class MultiDeviceRecorder:
    def __init__(self, output_dir: Path, sample_rate: int = 48000, frames_per_buffer: int = 1024) -> None:
        self.output_dir = Path(output_dir)
        self.sample_rate = int(sample_rate)
        self.frames_per_buffer = int(frames_per_buffer)
        self._pa = None
        self._streams = []
        self._chunks: dict[int, list[np.ndarray]] = {}
        self._devices: list[RecordDevice] = []
        self._lock = threading.Lock()
        self._running = False
        self._started_at = ""

    @property
    def running(self) -> bool:
        return self._running

    def start(self, devices: list[RecordDevice]) -> None:
        if self._running:
            return
        if not devices:
            raise RuntimeError("Selecione pelo menos um dispositivo para gravar.")

        import pyaudiowpatch as pyaudio

        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._pa = pyaudio.PyAudio()
        self._devices = devices
        self._chunks = {device.index: [] for device in devices}
        self._streams = []
        self._started_at = time.strftime("%Y%m%d_%H%M%S")

        errors: list[str] = []
        for device in devices:
            try:
                stream_rate = max(8000, int(device.sample_rate or self.sample_rate))
                stream = self._pa.open(
                    format=pyaudio.paFloat32,
                    channels=device.channels,
                    rate=stream_rate,
                    input=True,
                    input_device_index=device.index,
                    frames_per_buffer=self.frames_per_buffer,
                    stream_callback=self._make_callback(device, stream_rate),
                )
                self._streams.append(stream)
            except Exception as exc:
                errors.append(f"{device.name}: {exc}")

        if not self._streams:
            self.stop(discard=True)
            detail = "; ".join(errors[:3]) or "nenhuma fonte abriu"
            raise RuntimeError(f"Nao deu para abrir a gravacao do PC: {detail}")

        try:
            for stream in self._streams:
                stream.start_stream()
        except Exception as exc:
            self.stop(discard=True)
            raise RuntimeError(f"Nao deu para iniciar a gravacao do PC: {exc}") from exc

        self._running = True

    def stop(self, discard: bool = False) -> list[Path]:
        if not self._streams and self._pa is None:
            self._running = False
            return []

        self._running = False
        for stream in self._streams:
            try:
                stream.stop_stream()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass
        self._streams = []
        if self._pa is not None:
            try:
                self._pa.terminate()
            except Exception:
                pass
        self._pa = None

        if discard:
            with self._lock:
                self._chunks = {}
            return []

        with self._lock:
            chunks = {index: list(values) for index, values in self._chunks.items()}
            self._chunks = {}

        written: list[Path] = []
        mono_tracks: list[np.ndarray] = []
        for device in self._devices:
            values = chunks.get(device.index, [])
            if not values:
                continue
            audio = np.concatenate(values).astype(np.float32, copy=False)
            mono_tracks.append(audio)
            path = self.output_dir / f"{self._safe_name(device.name)}_{self._started_at}.wav"
            sf.write(path, audio, self.sample_rate)
            written.append(path)

        if len(mono_tracks) > 1:
            max_len = max(track.size for track in mono_tracks)
            mix = np.zeros(max_len, dtype=np.float32)
            for track in mono_tracks:
                mix[: track.size] += track
            mix /= max(1.0, float(len(mono_tracks)))
            mix_path = self.output_dir / f"mix_pc_{self._started_at}.wav"
            sf.write(mix_path, mix, self.sample_rate)
            written.append(mix_path)

        return written

    def _make_callback(self, device: RecordDevice, stream_rate: int):
        import pyaudiowpatch as pyaudio

        def callback(in_data, frame_count, _time_info, status_flags):
            if not self._running and not self._streams:
                return (None, pyaudio.paComplete)
            data = np.frombuffer(in_data, dtype=np.float32)
            if data.size == 0:
                return (None, pyaudio.paContinue)
            try:
                data = data.reshape(-1, device.channels)
                mono = data.mean(axis=1).astype(np.float32, copy=False)
            except ValueError:
                mono = data.astype(np.float32, copy=False)
            if int(stream_rate) != self.sample_rate:
                mono = _resample_linear(mono, int(stream_rate), self.sample_rate)
            with self._lock:
                if device.index in self._chunks:
                    self._chunks[device.index].append(mono.copy())
            return (None, pyaudio.paContinue)

        return callback

    def _safe_name(self, name: str) -> str:
        clean = "".join(char if char.isalnum() else "_" for char in name)
        clean = "_".join(part for part in clean.split("_") if part)
        return clean[:48] or "audio"


def _resample_linear(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or samples.size == 0:
        return samples.astype(np.float32, copy=False)
    duration = samples.size / max(1.0, float(source_rate))
    target_len = max(1, int(round(duration * target_rate)))
    source_x = np.linspace(0.0, duration, samples.size, endpoint=False)
    target_x = np.linspace(0.0, duration, target_len, endpoint=False)
    return np.interp(target_x, source_x, samples).astype(np.float32)
