from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class AudioDevice:
    index: int
    name: str
    hostapi: str
    max_input_channels: int
    max_output_channels: int
    default_samplerate: float

    @property
    def label(self) -> str:
        return f"{self.index} - {self.name} [{self.hostapi}]"


def _sounddevice():
    try:
        import sounddevice as sd
    except Exception as exc:  # pragma: no cover - depends on user environment
        raise RuntimeError(
            "A biblioteca sounddevice nao esta instalada. Rode: pip install -r requirements.txt"
        ) from exc
    return sd


def query_audio_devices() -> list[AudioDevice]:
    sd = _sounddevice()
    hostapis = sd.query_hostapis()
    devices = []
    for index, raw in enumerate(sd.query_devices()):
        hostapi_index = int(raw.get("hostapi", -1))
        hostapi = hostapis[hostapi_index]["name"] if 0 <= hostapi_index < len(hostapis) else "Unknown"
        devices.append(
            AudioDevice(
                index=index,
                name=str(raw.get("name", f"Device {index}")),
                hostapi=hostapi,
                max_input_channels=int(raw.get("max_input_channels", 0)),
                max_output_channels=int(raw.get("max_output_channels", 0)),
                default_samplerate=float(raw.get("default_samplerate", 48000.0)),
            )
        )
    return devices


def default_input_index() -> int | None:
    return _default_device_index(0)


def default_output_index() -> int | None:
    return _default_device_index(1)


def _default_device_index(position: int) -> int | None:
    sd = _sounddevice()
    value = sd.default.device
    if isinstance(value, (tuple, list)):
        index = value[position]
    else:
        index = value
    try:
        index = int(index)
    except (TypeError, ValueError):
        return None
    return index if index >= 0 else None


def input_devices(devices: Iterable[AudioDevice]) -> list[AudioDevice]:
    return [device for device in devices if device.max_input_channels > 0]


def output_devices(devices: Iterable[AudioDevice]) -> list[AudioDevice]:
    return [device for device in devices if device.max_output_channels > 0]


def choose_input_device(devices: list[AudioDevice]) -> AudioDevice | None:
    inputs = input_devices(devices)
    if not inputs:
        return None

    fifine = [device for device in inputs if "fifine" in device.name.lower()]
    if fifine:
        return _prefer_wasapi(fifine)

    default_index = default_input_index()
    if default_index is not None:
        for device in inputs:
            if device.index == default_index:
                return device

    mic_like = [
        device
        for device in inputs
        if any(token in device.name.lower() for token in ("microphone", "microfone", "mic "))
    ]
    return _prefer_wasapi(mic_like or inputs)


def choose_virtual_output_device(devices: list[AudioDevice]) -> AudioDevice | None:
    candidates: list[tuple[int, AudioDevice]] = []
    for device in output_devices(devices):
        name = device.name.lower()
        score = 0
        if "cable input" in name:
            score += 120
        if "vb-audio" in name or "vb audio" in name:
            score += 90
        if "voicemeeter input" in name or "voicemeeter aux input" in name:
            score += 80
        if "virtual audio cable" in name:
            score += 75
        if "line 1" in name and "virtual cable" in name:
            score += 70
        if "jbl" in name:
            score -= 60
        if "oculus" in name:
            score -= 120
        if score > 0:
            if "wasapi" in device.hostapi.lower():
                score += 10
            candidates.append((score, device))

    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item[0], reverse=True)[0][1]


def choose_monitor_output_device(devices: list[AudioDevice], virtual_output_index: int | None) -> AudioDevice | None:
    outputs = output_devices(devices)
    if not outputs:
        return None

    default_index = default_output_index()
    if default_index is not None:
        for device in outputs:
            if device.index == default_index and device.index != virtual_output_index and not is_virtual_output(device):
                return device

    scored: list[tuple[int, AudioDevice]] = []
    for device in outputs:
        if device.index == virtual_output_index:
            continue
        name = device.name.lower()
        score = 0
        if is_virtual_output(device):
            score -= 100
        if any(token in name for token in ("headphone", "fone", "speaker", "alto-falante", "alto falante", "jbl")):
            score += 40
        if "wasapi" in device.hostapi.lower():
            score += 10
        scored.append((score, device))

    if not scored:
        return None
    return sorted(scored, key=lambda item: item[0], reverse=True)[0][1]


def is_virtual_output(device: AudioDevice) -> bool:
    name = device.name.lower()
    return any(
        token in name
        for token in (
            "cable input",
            "vb-audio",
            "vb audio",
            "voicemeeter",
            "virtual audio cable",
        )
    )


def likely_recording_pair_name(output_device_name: str) -> str:
    name = output_device_name
    replacements = (
        ("CABLE Input", "CABLE Output"),
        ("Cable Input", "Cable Output"),
        ("cable input", "cable output"),
        ("Voicemeeter Input", "Voicemeeter Output"),
        ("Voicemeeter Aux Input", "Voicemeeter Aux Output"),
    )
    for source, target in replacements:
        if source in name:
            return name.replace(source, target)
    return "o dispositivo virtual de gravacao correspondente"


def sample_rate_candidates(input_device: AudioDevice, output_device: AudioDevice | None) -> list[int]:
    values = [48000, 44100, int(round(input_device.default_samplerate))]
    if output_device is not None:
        values.append(int(round(output_device.default_samplerate)))

    unique: list[int] = []
    for value in values:
        if 8000 <= value <= 192000 and value not in unique:
            unique.append(value)
    return unique


def _prefer_wasapi(devices: list[AudioDevice]) -> AudioDevice:
    for device in devices:
        if "wasapi" in device.hostapi.lower():
            return device
    return devices[0]
