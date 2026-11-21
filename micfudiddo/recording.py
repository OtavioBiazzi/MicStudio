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
        self._captured_frames: dict[int, int] = {}
        self._max_frames_per_device = 10 * 60 * self.sample_rate
        self.limit_reached = False
        self._devices: list[RecordDevice] = []
        self._lock = threading.Lock()
        self._running = False
        self._started_at = ""
        self._clock = 0.0

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
        self._captured_frames = {device.index: 0 for device in devices}
        self.limit_reached = False
        self._streams = []
        self._started_at = time.strftime("%Y%m%d_%H%M%S")
        self._clock = time.monotonic()

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
                self._captured_frames = {}
            return []

        with self._lock:
            chunks = {index: list(values) for index, values in self._chunks.items()}
            self._chunks = {}
            self._captured_frames = {}

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
            # Soma as saidas (Game + Chat) sem cortar o volume pela metade; so abaixa se for estourar.
            peak = float(np.max(np.abs(mix))) if mix.size else 0.0
            if peak > 0.99:
                mix *= 0.99 / peak
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
                    captured = self._captured_frames.get(device.index, 0)
                    # Saida que ficou muda nao manda nada: poe o silencio que faltou para nao sair de sincronia.
                    gap = fill_gap(captured, time.monotonic() - self._clock, mono.size, self.sample_rate)
                    if gap and captured + gap < self._max_frames_per_device:
                        self._chunks[device.index].append(np.zeros(gap, dtype=np.float32))
                        captured += gap
                        self._captured_frames[device.index] = captured
                    remaining = self._max_frames_per_device - captured
                    if remaining > 0:
                        block = mono[:remaining].copy()
                        self._chunks[device.index].append(block)
                        self._captured_frames[device.index] = captured + int(block.size)
                    else:
                        self.limit_reached = True
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


def audiotap_path() -> Path | None:
    """Caminho do VozLabAudioTap (o Electron passa pelo ambiente). None se nao existir."""
    import os

    raw = os.environ.get("VOZLAB_AUDIOTAP", "").strip()
    if raw and Path(raw).is_file():
        return Path(raw)
    return None


class AppAudioRecorder:
    """Grava o som de todos os apps do PC (em qualquer saida: Game, Chat...), menos o proprio VozLab.

    Usa o VozLabAudioTap no modo --allow-discord: a call do Discord entra; o retorno da sua voz e os sons do
    soundboard nao (eles ja sao gravados pela gravacao de voz). O ajudante manda um fluxo continuo, entao uma
    saida em silencio nao bagunca a sincronia."""

    RATE = 48000
    CHANNELS = 2

    def __init__(self, output_dir: Path, executable: Path, exclude_pids: list[int] | None = None, popen=None) -> None:
        import subprocess

        self.output_dir = Path(output_dir)
        self.executable = Path(executable)
        self.exclude_pids = [int(pid) for pid in (exclude_pids or []) if pid]
        self._popen = popen or subprocess.Popen
        self._process = None
        self._reader = None
        self._chunks: list[bytes] = []
        self._bytes = 0
        self._max_bytes = 10 * 60 * self.RATE * self.CHANNELS * 2
        self.limit_reached = False
        self._lock = threading.Lock()
        self._running = False
        self._started_at = ""
        self.sources: list[str] = []

    @property
    def running(self) -> bool:
        return self._running

    def start(self, _devices=None) -> None:
        import subprocess

        if self._running:
            return
        self.output_dir.mkdir(parents=True, exist_ok=True)
        args = [str(self.executable), "--system", "--allow-discord"]
        for pid in self.exclude_pids:
            args += ["--exclude-pid", str(pid)]
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self._process = self._popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=creationflags)
        time.sleep(0.4)
        if self._process.poll() is not None:
            self._process = None
            raise RuntimeError("O ajudante de som nao abriu (precisa do Windows 10 versao 2004 ou mais novo).")
        self._chunks = []
        self._bytes = 0
        self.limit_reached = False
        self.sources = []
        self._started_at = time.strftime("%Y%m%d_%H%M%S")
        self._running = True
        self._reader = threading.Thread(target=self._read, daemon=True)
        self._reader.start()
        threading.Thread(target=self._read_events, daemon=True).start()

    def _read(self) -> None:
        stream = self._process.stdout
        while self._running:
            data = stream.read(9600)  # 50 ms
            if not data:
                break
            with self._lock:
                if self._bytes >= self._max_bytes:
                    self.limit_reached = True
                    continue
                self._chunks.append(data)
                self._bytes += len(data)

    def _read_events(self) -> None:
        import json

        stream = self._process.stderr
        for raw in iter(stream.readline, b""):
            try:
                message = json.loads(raw.decode("utf-8", "replace"))
            except Exception:
                continue
            if message.get("type") == "sources":
                self.sources = [str(name) for name in message.get("names", [])]

    def stop(self, discard: bool = False) -> list[Path]:
        if not self._running and self._process is None:
            return []
        self._running = False
        process = self._process
        self._process = None
        if process is not None:
            try:
                process.kill()
            except Exception:
                pass
            try:
                process.wait(timeout=2)
            except Exception:
                pass
        if self._reader is not None:
            self._reader.join(timeout=2)
        with self._lock:
            data = b"".join(self._chunks)
            self._chunks = []
            self._bytes = 0
        if discard or not data:
            return []
        usable = len(data) - (len(data) % (self.CHANNELS * 2))
        audio = np.frombuffer(data[:usable], dtype="<i2").reshape(-1, self.CHANNELS).astype(np.float32) / 32768.0
        path = self.output_dir / f"pc_{self._started_at}.wav"
        sf.write(path, audio, self.RATE)
        return [path]


def fill_gap(captured_frames: int, elapsed_seconds: float, block_frames: int, sample_rate: int, tolerance: float = 0.06) -> int:
    """Quantos quadros de silencio faltam antes deste bloco para ele cair no tempo certo.

    A captura de saida do Windows (loopback) nao manda nada enquanto a saida esta em silencio. Sem preencher esse
    buraco, uma saida que fica muda (ex.: o fone do Discord) "encolhe" e sai fora de sincronia com as outras."""
    expected_start = int(elapsed_seconds * sample_rate) - int(block_frames)
    missing = expected_start - int(captured_frames)
    return missing if missing > int(tolerance * sample_rate) else 0
