"""Perfis de audio: guardam voz, efeitos, volumes e (opcionalmente) dispositivos, e podem
ser aplicados com um clique, por atalho ou automaticamente quando um programa fica em primeiro plano."""

from __future__ import annotations

import ctypes
import os
import time
import uuid
from ctypes import wintypes

MAX_PROFILES = 50
MAX_PROCESSES_PER_PROFILE = 20

NUMERIC_CONTROL_LIMITS = {
    "gain": (0.0, 20.0),
    "pitch": (-24.0, 24.0),
    "masterMicGain": (0.0, 20.0),
    "masterVoiceVolume": (0.0, 20.0),
    "masterPitch": (-24.0, 24.0),
    "monitorVolume": (0.0, 3.0),
    "soundboardMonitorVolume": (0.0, 3.0),
}
BOOL_CONTROL_KEYS = ("masterMute", "monitor", "soundboardMonitor")


def normalize_process_name(value) -> str:
    """'C:\\Games\\Valorant.EXE' -> 'valorant.exe'. Vazio se nao for um nome valido."""
    text = str(value or "").strip().replace("/", "\\")
    name = text.rsplit("\\", 1)[-1].strip().lower()
    if not name or any(ch in name for ch in '<>:"|?*'):
        return ""
    if "." not in name:
        name += ".exe"
    return name[:80]


def _clamp(value, low, high, default):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if number != number:  # NaN
        return default
    return max(low, min(high, number))


def sanitize_controls(raw: dict | None, fallback: dict | None = None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    fallback = fallback if isinstance(fallback, dict) else {}
    controls: dict = {}
    for key, (low, high) in NUMERIC_CONTROL_LIMITS.items():
        base = fallback.get(key, 0.0 if "pitch" in key.lower() else 1.0)
        controls[key] = _clamp(raw.get(key, base), low, high, base)
    for key in BOOL_CONTROL_KEYS:
        controls[key] = bool(raw.get(key, fallback.get(key, False)))
    effects = raw.get("effects", fallback.get("effects"))
    controls["effects"] = dict(effects) if isinstance(effects, dict) else {}
    return controls


def _sanitize_device(raw) -> dict | None:
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    hostapi = raw.get("hostapi")
    return {"name": name[:200], "hostapi": str(hostapi)[:80] if hostapi else None}


def sanitize_profile(raw, *, keep_id: bool = True) -> dict | None:
    """Valida um perfil vindo do disco ou de um arquivo importado. Devolve None se for invalido."""
    if not isinstance(raw, dict):
        return None
    name = str(raw.get("name") or "").strip()[:40]
    if not name:
        return None
    emoji = str(raw.get("emoji") or "🎙️").strip()[:8] or "🎙️"
    profile_id = str(raw.get("id") or "").strip() if keep_id else ""
    if not profile_id or not all(ch.isalnum() or ch in "-_" for ch in profile_id):
        profile_id = uuid.uuid4().hex[:12]
    processes: list[str] = []
    for item in raw.get("processes") or []:
        normalized = normalize_process_name(item)
        if normalized and normalized not in processes:
            processes.append(normalized)
    devices_raw = raw.get("devices") if isinstance(raw.get("devices"), dict) else {}
    devices = {key: _sanitize_device(devices_raw.get(key)) for key in ("input", "output", "monitor")}
    return {
        "id": profile_id,
        "name": name,
        "emoji": emoji,
        "voiceId": str(raw.get("voiceId") or "clean")[:80],
        "controls": sanitize_controls(raw.get("controls")),
        "devices": devices,
        "applyDevices": bool(raw.get("applyDevices", False)),
        "processes": processes[:MAX_PROCESSES_PER_PROFILE],
        "hotkey": str(raw.get("hotkey") or "").strip()[:40],
        "createdAt": float(raw.get("createdAt") or time.time()),
    }


def sanitize_profile_list(raw) -> list[dict]:
    profiles: list[dict] = []
    seen: set[str] = set()
    for item in raw if isinstance(raw, list) else []:
        profile = sanitize_profile(item)
        if profile is None or profile["id"] in seen:
            continue
        seen.add(profile["id"])
        profiles.append(profile)
        if len(profiles) >= MAX_PROFILES:
            break
    return profiles


def make_profile(name, emoji, voice_id, controls, devices, *, apply_devices=False, processes=None, hotkey="") -> dict:
    profile = sanitize_profile(
        {
            "name": name,
            "emoji": emoji,
            "voiceId": voice_id,
            "controls": controls,
            "devices": devices,
            "applyDevices": apply_devices,
            "processes": processes or [],
            "hotkey": hotkey,
        },
        keep_id=False,
    )
    if profile is None:
        raise ValueError("Dê um nome para o perfil.")
    return profile


def match_profile_for_process(profiles: list[dict], exe_name: str) -> dict | None:
    exe = normalize_process_name(exe_name)
    if not exe:
        return None
    for profile in profiles:
        if exe in profile.get("processes", []):
            return profile
    return None


def foreground_process_name() -> str:
    """Nome do programa da janela em primeiro plano (ex.: 'discord.exe'), ou '' se nao der para saber."""
    if os.name != "nt":
        return ""
    try:
        user32 = ctypes.windll.user32
        kernel32 = ctypes.windll.kernel32
        user32.GetForegroundWindow.restype = wintypes.HWND
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return ""
        pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return ""
        kernel32.OpenProcess.restype = wintypes.HANDLE
        handle = kernel32.OpenProcess(0x1000, False, pid.value)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return ""
        try:
            size = wintypes.DWORD(1024)
            buffer = ctypes.create_unicode_buffer(size.value)
            if not kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
                return ""
            return normalize_process_name(buffer.value)
        finally:
            kernel32.CloseHandle(handle)
    except Exception:
        return ""
