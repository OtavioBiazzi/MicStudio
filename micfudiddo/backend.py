from __future__ import annotations

from dataclasses import asdict
import argparse
import json
import random
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
from urllib.parse import urlparse

import numpy as np

from .devices import (
    AudioDevice,
    choose_input_device,
    choose_monitor_output_device,
    choose_virtual_output_device,
    input_devices,
    likely_recording_pair_name,
    output_devices,
    query_audio_devices,
)
from .engine import AudioEngine, EngineConfig
from .processing import EffectsSettings
from .recording import MultiDeviceRecorder, query_record_devices
from .soundboard import (
    SoundDefaults,
    SoundLibrary,
    audio_duration_seconds,
    image_data_url,
    load_audio_mono,
    render_audio_file_edit,
    render_sound_for_playback,
    resample_linear,
)
from .windows_audio import (
    com_initialized,
    find_virtual_microphone_endpoint,
    get_default_capture_ids,
    restore_default_capture_ids,
    set_default_capture_id,
    list_capture_endpoints,
)


class SoundCache:
    def __init__(self, ttl_seconds: int = 1200) -> None:
        self.cache = {}
        self.ttl = ttl_seconds
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            if key in self.cache:
                val, expires = self.cache[key]
                if time.time() < expires:
                    return val
                else:
                    del self.cache[key]
            return None

    def set(self, key: str, value) -> None:
        with self.lock:
            self.cache[key] = (value, time.time() + self.ttl)

MYINSTANTS_CACHE = SoundCache(ttl_seconds=1200)


def scrape_myinstants_page(url: str, cache_key: str, default_category: str) -> list[dict]:
    import urllib.request
    import urllib.parse
    import re
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            html = response.read().decode("utf-8")
    except Exception as e:
        print("Failed to open scrape url:", url, e)
        return []
        
    instants = re.findall(
        r'style="background-color:([^";\s]+)[^"]*">.*?onclick="play\(\'([^\']+)\'[^)]*\)"[^>]*>.*?class="[^"]*instant-link[^"]*"[^>]*>([^<]+)</a>', 
        html, 
        re.DOTALL
    )
    
    if not instants:
        instants_no_color = re.findall(
            r'onclick="play\(\'([^\']+)\'[^)]*\)"[^>]*>.*?class="[^"]*instant-link[^"]*"[^>]*>([^<]+)</a>', 
            html, 
            re.DOTALL
        )
        instants = [("#8B5CF6", path, name) for path, name in instants_no_color]
        
    sounds = []
    for color, sound_path, name in instants:
        color = color.strip()
        sound_path = sound_path.strip()
        name = name.strip()
        
        if not sound_path.startswith("http"):
            if sound_path.startswith("/"):
                sound_url = f"https://www.myinstants.com{sound_path}"
            else:
                sound_url = f"https://www.myinstants.com/media/sounds/{sound_path}"
        else:
            sound_url = sound_path
            
        slug = sound_url.split("/")[-1].replace(".mp3", "")
        sound_id = f"online_{slug}"
        
        play_count = f"{((hash(name) & 0xffff) % 950 + 50) / 10:.1f}k"
        
        sounds.append({
            "id": sound_id,
            "name": name,
            "category": default_category,
            "url": sound_url,
            "color": color,
            "duration": "N/A",
            "plays": play_count
        })
        
    if sounds:
        MYINSTANTS_CACHE.set(cache_key, sounds)
    return sounds


def fetch_myinstants_trending(page: int) -> list[dict]:
    cache_key = f"trending_{page}"
    cached = MYINSTANTS_CACHE.get(cache_key)
    if cached is not None:
        return cached
        
    if page == 1:
        try:
            import urllib.request
            import json
            url = "https://myinstants-api.vercel.app/trending"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
                sounds = []
                for item in data:
                    sound_url = item.get("sound") or f"https://www.myinstants.com/media/sounds/{item.get('slug')}.mp3"
                    sound_id = f"online_{item.get('slug') or hash(sound_url) & 0xffffffff}"
                    name = item.get("name") or item.get("title") or "Sem nome"
                    play_count = item.get("plays") or f"{((hash(name) & 0xffff) % 950 + 50) / 10:.1f}k"
                    sounds.append({
                        "id": sound_id,
                        "name": name,
                        "category": "Trending",
                        "url": sound_url,
                        "color": "#8B5CF6",
                        "duration": "N/A",
                        "plays": play_count
                    })
                if sounds:
                    MYINSTANTS_CACHE.set(cache_key, sounds)
                    return sounds
        except Exception as e:
            print("Community API failed, falling back to direct scraping:", e)
            
    try:
        scrape_url = f"https://www.myinstants.com/?page={page}"
        return scrape_myinstants_page(scrape_url, cache_key, "Trending")
    except Exception as e:
        print("Direct scraping of trending failed:", e)
        return []


def fetch_myinstants_search(query: str, page: int) -> list[dict]:
    if not query:
        return fetch_myinstants_trending(page)
        
    cache_key = f"search_{query}_{page}"
    cached = MYINSTANTS_CACHE.get(cache_key)
    if cached is not None:
        return cached
        
    import urllib.parse
    scrape_url = f"https://www.myinstants.com/search/?name={urllib.parse.quote(query)}&page={page}"
    try:
        return scrape_myinstants_page(scrape_url, cache_key, "Busca")
    except Exception as e:
        print("Direct scraping of search failed:", e)
        return []


DEFAULT_APP_SETTINGS = {
    "autoStartVirtual": True,
    "restoreOnDisable": True,
    "minimizeToTray": True,
    "allowMultipleSounds": False,
    "shortcutMuteMic": "",
    "shortcutToggleBypass": "",
    "shortcutToggleSoundboard": "",
    "shortcutToggleVoiceChanger": "",
    "shortcutRecordVoice": "",
    "shortcutRecordPC": "",
    "shortcutRecordCombo": "",
    "defaultMicOnClose": "restore",
    "confirmClose": True,
    "closeBehavior": "ask",
    "onlinePlaybackRoute": "both",
}

DEFAULT_PROFILE = {
    "gain": 1.0,
    "pitch": 0.0,
    "monitor": True,
    "monitorVolume": 1.0,
    "soundboardMonitor": True,
    "soundboardMonitorVolume": 0.65,
    "effects": asdict(EffectsSettings()),
    "selected": {},
    "recordSelected": [],
}


class AppState:
    def __init__(self) -> None:
        self.lock = threading.RLock()
        self.engine = AudioEngine()
        self.library = SoundLibrary()
        self.app_settings_path = self.library.base_dir / "app_settings.json"
        self.profile_path = self.library.base_dir / "profile.json"
        self.settings = self.load_app_settings()
        self.profile = self.load_profile()
        self.pc_recorder = MultiDeviceRecorder(self.library.base_dir / "pc_recordings")
        self.combo_recording = False
        self.sound_cache: dict[str, tuple[float, int, np.ndarray]] = {}
        self.duration_cache: dict[str, tuple[int, float]] = {}
        self.cover_url_cache: dict[str, tuple[int, str]] = {}
        self.devices: list[AudioDevice] = []
        self.record_devices = []
        self.windows_capture_endpoints: list[dict[str, str]] = []
        self.selected_input: int | None = None
        self.selected_output: int | None = None
        self.selected_monitor: int | None = None
        self.gain = 1.0
        self.pitch = 0.0
        self.effects = EffectsSettings()
        self.monitor_enabled = True
        self.monitor_volume = 1.0
        self.soundboard_monitor_enabled = True
        self.soundboard_monitor_volume = 0.65
        self.record_selected_indexes: set[int] = set()
        self.saved_capture_defaults_path = self.library.base_dir / "temp_capture_defaults.json"
        self.saved_capture_defaults: dict[int, str] = {}
        if self.saved_capture_defaults_path.exists():
            try:
                import json
                raw = json.loads(self.saved_capture_defaults_path.read_text(encoding="utf-8"))
                self.saved_capture_defaults = {int(k): v for k, v in raw.items()}
            except Exception as e:
                print("Erro ao recuperar microfone padrao temporario:", e)
        self.virtual_mode_active = False
        self.monitor_only_active = False
        self.status = "Backend pronto"
        self.refresh_devices()
        self.refresh_record_devices()
        self.apply_profile()
        self.online_cache_dir = self.library.base_dir / "online_cache"
        self.clean_online_cache()
        self.refresh_windows_capture_endpoints()

    def clean_online_cache(self) -> None:
        try:
            if self.online_cache_dir.exists():
                import shutil
                shutil.rmtree(self.online_cache_dir)
            self.online_cache_dir.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            print("Erro ao limpar cache temporario online:", e)

    def refresh_windows_capture_endpoints(self) -> None:
        try:
            self.windows_capture_endpoints = [
                {"id": endpoint.id, "name": endpoint.name}
                for endpoint in list_capture_endpoints()
            ]
        except Exception as exc:
            print("Erro ao listar endpoints de captura do Windows:", exc)
            self.windows_capture_endpoints = []

    def cached_audio_duration(self, path: str) -> float:
        try:
            stat = Path(path).stat()
        except OSError:
            return 0.0
        cached = self.duration_cache.get(path)
        if cached and cached[0] == stat.st_mtime_ns:
            return cached[1]
        duration = audio_duration_seconds(path)
        self.duration_cache[path] = (stat.st_mtime_ns, duration)
        return duration

    def cached_cover_url(self, path: str) -> str:
        if not path:
            return ""
        try:
            stat = Path(path).stat()
        except OSError:
            return ""
        cached = self.cover_url_cache.get(path)
        if cached and cached[0] == stat.st_mtime_ns:
            return cached[1]
        cover_url = image_data_url(path)
        self.cover_url_cache[path] = (stat.st_mtime_ns, cover_url)
        return cover_url

    def load_app_settings(self) -> dict:
        if not self.app_settings_path.exists():
            return dict(DEFAULT_APP_SETTINGS)
        try:
            raw = json.loads(self.app_settings_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return dict(DEFAULT_APP_SETTINGS)
        settings = dict(DEFAULT_APP_SETTINGS)
        if isinstance(raw, dict):
            settings.update({key: raw[key] for key in DEFAULT_APP_SETTINGS if key in raw})
        return settings

    def save_app_settings(self) -> None:
        self.app_settings_path.write_text(
            json.dumps(self.settings, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def update_settings(self, patch: dict) -> None:
        for key in DEFAULT_APP_SETTINGS:
            if key in patch:
                default_val = DEFAULT_APP_SETTINGS[key]
                if isinstance(default_val, bool):
                    self.settings[key] = bool(patch[key])
                else:
                    self.settings[key] = str(patch[key])
        self.save_app_settings()

    def load_profile(self) -> dict:
        if not self.profile_path.exists():
            return json.loads(json.dumps(DEFAULT_PROFILE))
        try:
            raw = json.loads(self.profile_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return json.loads(json.dumps(DEFAULT_PROFILE))
        profile = json.loads(json.dumps(DEFAULT_PROFILE))
        if isinstance(raw, dict):
            for key in DEFAULT_PROFILE:
                if key in raw:
                    profile[key] = raw[key]
        return profile

    def apply_profile(self) -> None:
        self.gain = max(0.0, float(self.profile.get("gain", 1.0)))
        self.pitch = float(self.profile.get("pitch", 0.0))
        self.monitor_enabled = bool(self.profile.get("monitor", False))
        self.monitor_volume = max(0.0, min(3.0, float(self.profile.get("monitorVolume", 1.0))))
        self.soundboard_monitor_enabled = bool(self.profile.get("soundboardMonitor", False))
        self.soundboard_monitor_volume = max(0.0, min(3.0, float(self.profile.get("soundboardMonitorVolume", 0.65))))
        effects = self.profile.get("effects", {})
        if isinstance(effects, dict):
            self.effects = EffectsSettings(**{**asdict(EffectsSettings()), **effects})

        selected = self.profile.get("selected", {})
        if isinstance(selected, dict):
            self.selected_input = _existing_device_index(self.devices, selected.get("input"), self.selected_input)
            self.selected_output = _existing_device_index(self.devices, selected.get("output"), self.selected_output)
            self.selected_monitor = _existing_device_index(self.devices, selected.get("monitor"), self.selected_monitor)

        selected_records = self.profile.get("recordSelected", [])
        try:
            self.record_selected_indexes = {int(value) for value in selected_records}
        except (TypeError, ValueError):
            self.record_selected_indexes = set()

    def save_profile(self) -> None:
        self.profile = {
            "gain": self.gain,
            "pitch": self.pitch,
            "monitor": self.monitor_enabled,
            "monitorVolume": self.monitor_volume,
            "soundboardMonitor": self.soundboard_monitor_enabled,
            "soundboardMonitorVolume": self.soundboard_monitor_volume,
            "effects": asdict(self.effects),
            "selected": {
                "input": self.selected_input,
                "output": self.selected_output,
                "monitor": self.selected_monitor,
            },
            "recordSelected": sorted(self.record_selected_indexes),
        }
        self.profile_path.write_text(json.dumps(self.profile, ensure_ascii=False, indent=2), encoding="utf-8")

    def refresh_devices(self) -> None:
        self.devices = query_audio_devices()
        input_device = choose_input_device(self.devices)
        output_device = choose_virtual_output_device(self.devices)
        monitor_device = choose_monitor_output_device(self.devices, output_device.index if output_device else None)
        self.selected_input = input_device.index if input_device else None
        self.selected_output = output_device.index if output_device else None
        self.selected_monitor = monitor_device.index if monitor_device else None
        self.refresh_windows_capture_endpoints()

    def refresh_record_devices(self) -> None:
        self.record_devices = query_record_devices(include_inputs=True, include_loopback=True)

    def device_by_index(self, index: int | None) -> AudioDevice | None:
        if index is None:
            return None
        for device in self.devices:
            if device.index == index:
                return device
        return None

    def config(self) -> EngineConfig:
        input_device = self.device_by_index(self.selected_input)
        if input_device is None:
            raise RuntimeError("Nenhum microfone selecionado.")
        return EngineConfig(
            input_device=input_device,
            processed_output_device=self.device_by_index(self.selected_output),
            monitor_output_device=self.device_by_index(self.selected_monitor),
            gain=self.gain,
            pitch_semitones=self.pitch,
            effects=self.effects,
            monitor_enabled=self.monitor_enabled,
            monitor_volume=self.monitor_volume,
            soundboard_monitor_enabled=self.soundboard_monitor_enabled,
            soundboard_monitor_volume=self.soundboard_monitor_volume,
        )

    def start(self) -> None:
        self.monitor_only_active = False
        self.engine.start(self.config())
        self.status = f"Processando em {self.engine.sample_rate} Hz"

    def stop(self) -> None:
        self.engine.stop()
        self.monitor_only_active = False
        self.status = "Processamento desligado"

    def start_monitor_only(self) -> None:
        input_device = self.device_by_index(self.selected_input)
        monitor_device = self.device_by_index(self.selected_monitor)
        if input_device is None or monitor_device is None:
            self.stop()
            return
        self.monitor_only_active = False
        self.engine.start(
            EngineConfig(
                input_device=input_device,
                processed_output_device=monitor_device,
                monitor_output_device=None,
                gain=self.gain,
                pitch_semitones=self.pitch,
                effects=self.effects,
                monitor_enabled=self.monitor_enabled,
                monitor_volume=self.monitor_volume,
                soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                soundboard_monitor_volume=self.soundboard_monitor_volume,
                primary_outputs_monitor_mix=True,
            )
        )
        self.monitor_only_active = True
        self.status = "Monitoramento local ativo"

    def activate_virtual(self) -> None:
        self.monitor_only_active = False
        if not self.saved_capture_defaults:
            self.saved_capture_defaults = get_default_capture_ids()
            try:
                import json
                self.saved_capture_defaults_path.write_text(
                    json.dumps(self.saved_capture_defaults), encoding="utf-8"
                )
            except Exception as e:
                print("Erro ao persistir microfone padrao temporario:", e)
        endpoint = find_virtual_microphone_endpoint()
        try:
            if endpoint is not None:
                set_default_capture_id(endpoint.id)
                self.virtual_mode_active = True
            self.start()
        except Exception:
            restore_default_capture_ids(self.saved_capture_defaults)
            self.saved_capture_defaults = {}
            if self.saved_capture_defaults_path.exists():
                try:
                    self.saved_capture_defaults_path.unlink(missing_ok=True)
                except Exception:
                    pass
            self.virtual_mode_active = False
            raise

    def deactivate_virtual(self) -> None:
        self.stop()
        restore_mic = bool(self.settings.get("restoreOnDisable", True))
        default_mic = str(self.settings.get("defaultMicOnClose", "restore"))
        if restore_mic:
            if default_mic == "restore" or default_mic == "choose":
                restore_default_capture_ids(self.saved_capture_defaults)
            elif default_mic == "keep":
                pass
            else:
                try:
                    from .windows_audio import set_default_capture_id
                    set_default_capture_id(default_mic)
                except Exception as e:
                    print("Erro ao restaurar o microfone selecionado no encerramento:", e)
                    restore_default_capture_ids(self.saved_capture_defaults)
        self.saved_capture_defaults = {}
        if self.saved_capture_defaults_path.exists():
            try:
                self.saved_capture_defaults_path.unlink(missing_ok=True)
            except Exception:
                pass
        self.virtual_mode_active = False

    def reset_defaults(self) -> None:
        if self.pc_recorder.running:
            self.pc_recorder.stop(discard=True)
        self.combo_recording = False
        self.deactivate_virtual()
        self.gain = 1.0
        self.pitch = 0.0
        self.effects = EffectsSettings()
        self.monitor_enabled = True
        self.monitor_volume = 1.0
        self.soundboard_monitor_enabled = True
        self.soundboard_monitor_volume = 0.65
        self.engine.set_controls(
            self.gain,
            self.pitch,
            self.effects,
            monitor_volume=self.monitor_volume,
            soundboard_monitor_enabled=self.soundboard_monitor_enabled,
            soundboard_monitor_volume=self.soundboard_monitor_volume,
        )
        if self.monitor_enabled or self.soundboard_monitor_enabled:
            self.engine.set_monitor(
                self.monitor_enabled,
                self.device_by_index(self.selected_monitor),
                monitor_volume=self.monitor_volume,
                soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                soundboard_monitor_volume=self.soundboard_monitor_volume,
            )
        else:
            self.engine.set_monitor(False, None, soundboard_monitor_enabled=False)
        self.engine.stop_sounds()
        self.refresh_devices()
        self.refresh_record_devices()
        self.save_profile()
        self.status = "Padrao restaurado"

    def reset_section(self, section: str) -> None:
        section = str(section or "").lower()
        if section == "voice":
            self.gain = 1.0
            self.pitch = 0.0
            self.engine.set_controls(
                self.gain,
                self.pitch,
                self.effects,
                monitor_volume=self.monitor_volume,
                soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                soundboard_monitor_volume=self.soundboard_monitor_volume,
            )
            if self.monitor_only_active:
                self.engine.set_controls(
                    1.0,
                    0.0,
                    EffectsSettings(),
                    monitor_volume=self.monitor_volume,
                    soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                    soundboard_monitor_volume=self.soundboard_monitor_volume,
                )
            elif self.engine.running and (self.monitor_enabled or self.soundboard_monitor_enabled):
                self.engine.set_monitor(
                    self.monitor_enabled,
                    self.device_by_index(self.selected_monitor),
                    monitor_volume=self.monitor_volume,
                    soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                    soundboard_monitor_volume=self.soundboard_monitor_volume,
                )
            self.status = "Voz restaurada"
        elif section == "effects":
            self.effects = EffectsSettings()
            self.engine.set_controls(
                self.gain,
                self.pitch,
                self.effects,
                monitor_volume=self.monitor_volume,
                soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                soundboard_monitor_volume=self.soundboard_monitor_volume,
            )
            self.status = "Efeitos restaurados"
        elif section == "soundboard":
            self.engine.stop_sounds()
            self.library.defaults = SoundDefaults()
            self.library.save_settings()
            self.status = "Soundboard restaurado"
        elif section == "recorder":
            if self.pc_recorder.running:
                self.pc_recorder.stop(discard=True)
            self.combo_recording = False
            if self.engine.recording:
                out = self.library.base_dir / "recordings" / "_discarded.wav"
                out.parent.mkdir(parents=True, exist_ok=True)
                self.engine.stop_recording(str(out))
                try:
                    out.unlink(missing_ok=True)
                except OSError:
                    pass
            self.record_selected_indexes = set()
            self.status = "Gravador restaurado"
        elif section == "interface":
            self.settings = dict(DEFAULT_APP_SETTINGS)
            self.save_app_settings()
            self.status = "Interface restaurada"
        else:
            raise RuntimeError("Secao de reset desconhecida.")
        self.save_profile()

    def resolve_pc_record_devices(self, indexes: set[int]) -> list:
        if not self.record_devices:
            self.refresh_record_devices()
        devices = [device for device in self.record_devices if device.index in indexes]
        if indexes and not devices:
            self.record_devices = query_record_devices(include_inputs=True, include_loopback=True)
            devices = [device for device in self.record_devices if device.index in indexes]
        selected_loopbacks = [device for device in devices if device.is_loopback]
        if selected_loopbacks:
            return selected_loopbacks
        if devices:
            return devices
        jbl_loopbacks = [
            device
            for device in self.record_devices
            if device.is_loopback and "jbl" in device.name.lower() and "quantum" in device.name.lower()
        ]
        devices = jbl_loopbacks or [device for device in self.record_devices if device.is_loopback]
        self.record_selected_indexes = {device.index for device in devices[:2]}
        self.save_profile()
        return devices[:2]

    def start_combo_recording(self, indexes: set[int]) -> None:
        if self.combo_recording:
            return
        if self.engine.recording or self.pc_recorder.running:
            raise RuntimeError("Pare a gravacao atual antes de iniciar voz + PC.")
        devices = self.resolve_pc_record_devices(indexes)
        if not devices:
            raise RuntimeError("Nenhuma fonte de PC/loopback encontrada para gravar junto com a voz.")
        if not self.engine.running:
            self.start()
        self.pc_recorder.start(devices)
        try:
            self.engine.start_recording()
        except Exception:
            self.pc_recorder.stop(discard=True)
            raise
        self.combo_recording = True
        self.status = f"Gravando voz + PC: {', '.join(device.name for device in devices)}"

    def stop_combo_recording(self) -> dict:
        if not self.combo_recording:
            raise RuntimeError("Gravacao voz + PC nao esta ativa.")
        stamp = time.strftime("%Y%m%d_%H%M%S")
        voice_out = self.library.base_dir / "recordings" / f"voz_combo_{stamp}.wav"
        voice_out.parent.mkdir(parents=True, exist_ok=True)
        frames = self.engine.stop_recording(str(voice_out))
        pc_paths = self.pc_recorder.stop()
        self.combo_recording = False
        mix_path = self.library.base_dir / "recordings" / f"voz_pc_mix_{stamp}.wav"
        self.write_recording_mix(voice_out, pc_paths, mix_path)
        item = self.add_recording_to_soundboard(mix_path, name=f"Voz + PC {time.strftime('%H%M%S')}")
        self.status = f"Gravacao voz + PC salva no soundboard: {item.name}"
        return {
            "path": str(mix_path),
            "voicePath": str(voice_out),
            "pcPaths": [str(path) for path in pc_paths],
            "frames": frames,
            "soundId": item.id,
        }

    def write_recording_mix(self, voice_path: Path, pc_paths: list[Path], output_path: Path) -> None:
        try:
            import soundfile as sf
        except Exception as exc:  # pragma: no cover - depends on user environment
            raise RuntimeError("A biblioteca soundfile nao esta instalada.") from exc

        sample_rate = int(self.engine.sample_rate or 48000)
        tracks: list[np.ndarray] = []
        if voice_path.exists():
            voice = load_audio_mono(str(voice_path), sample_rate)
            if voice.size:
                tracks.append(voice)
        pc_candidates = [path for path in pc_paths if path.name.startswith("mix_pc_")] or pc_paths[:1]
        for path in pc_candidates:
            if Path(path).exists():
                pc_audio = load_audio_mono(str(path), sample_rate)
                if pc_audio.size:
                    tracks.append(pc_audio)
        if not tracks:
            tracks.append(np.zeros(1, dtype=np.float32))
        max_len = max(track.size for track in tracks)
        mix = np.zeros(max_len, dtype=np.float32)
        for track in tracks:
            mix[: track.size] += track
        mix /= max(1.0, float(len(tracks)))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(output_path, np.nan_to_num(mix, nan=0.0, posinf=1.0, neginf=-1.0).astype(np.float32), sample_rate)

    def load_sound_source(self, item: SoundItem) -> np.ndarray:
        path = Path(item.path)
        if not path.exists():
            return np.zeros(1, dtype=np.float32)
        stamp = path.stat().st_mtime
        sr = self.engine.sample_rate or 48000
        with self.lock:
            cached = self.sound_cache.get(item.id)
            if cached and cached[0] == stamp and cached[1] == sr:
                return cached[2]
        audio = load_audio_mono(item.path, sr)
        with self.lock:
            self.sound_cache[item.id] = (stamp, sr, audio)
        return audio

    def play_online_sound(self, sound_id: str, url: str, name: str) -> None:
        suffix = ".mp3"
        if ".wav" in url.lower():
            suffix = ".wav"
        elif ".ogg" in url.lower():
            suffix = ".ogg"
        elif ".m4a" in url.lower():
            suffix = ".m4a"
            
        cached_path = self.online_cache_dir / f"{sound_id}{suffix}"
        
        if not cached_path.exists():
            import urllib.request
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            req = urllib.request.Request(url, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=8) as response, open(cached_path, "wb") as out_file:
                    out_file.write(response.read())
            except Exception as e:
                raise RuntimeError(f"Erro ao baixar audio da nuvem: {e}")
                
        sr = self.engine.sample_rate or 48000
        try:
            audio = load_audio_mono(str(cached_path), sr)
        except Exception as e:
            raise RuntimeError(f"Erro ao carregar audio: {e}")
            
        route = str(self.settings.get("onlinePlaybackRoute", "both")).strip().lower()
        
        rendered = render_sound_for_playback(
            audio,
            volume=1.0,
            pitch_semitones=0.0,
            repeats=1,
            sample_rate=sr
        )
        
        with self.lock:
            for p in list(self.engine._playbacks):
                if p.sound_id.startswith("online_"):
                    self.engine.stop_sound(playback_id=p.playback_id)
                    
        self.engine.play_sound(
            rendered,
            block_voice=False,
            mute_others=False,
            sound_id=sound_id,
            name=f"Online: {name}",
            replace=False,
            loop=False,
            output_route=route
        )
        
        with self.lock:
            self.status = f"Tocando online: {name}"

    def play_sound(self, item_id: str, start_seconds: float = 0.0) -> None:
        item = self.library.by_id(item_id)
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        if not self.engine.running:
            with self.lock:
                if not self.engine.running:
                    self.start()

        mode = str(item.playback_mode or "restart").strip().lower()
        if mode == "pause":
            matching = [player for player in self.engine.player_states() if player.get("soundId") == item.id]
            if matching and any(player.get("state") == "playing" for player in matching):
                self.engine.pause_sound(sound_id=item.id)
                with self.lock:
                    self.status = f"Pausado: {item.name}"
                return
            if matching and any(player.get("state") == "paused" for player in matching):
                self.engine.resume_sound(sound_id=item.id)
                with self.lock:
                    self.status = f"Continuando: {item.name}"
                return
        elif mode == "stop":
            if self.engine.stop_sound(sound_id=item.id):
                with self.lock:
                    self.status = f"Parado: {item.name}"
                return
        elif mode == "hold_loop":
            if self.engine.stop_sound(sound_id=item.id):
                with self.lock:
                    self.status = f"Loop parado: {item.name}"
                return
        elif mode == "restart":
            self.engine.stop_sound(sound_id=item.id)

        source = self.load_sound_source(item)
        rendered = render_sound_for_playback(
            source,
            item.volume,
            item.pitch_semitones,
            item.repeats,
            pitch_mode=item.pitch_mode,
            speed=item.speed,
            normalize=item.normalize,
            fade_in_ms=item.fade_in_ms,
            fade_out_ms=item.fade_out_ms,
            sample_rate=self.engine.sample_rate,
        )
        replace = bool(item.stop_other_sounds or not self.settings.get("allowMultipleSounds", False))
        if mode == "overlap":
            replace = False
        loop = bool(item.loop or mode == "hold_loop")
        self.engine.play_sound(
            rendered,
            block_voice=item.block_voice,
            mute_others=item.mute_other_sounds,
            sound_id=item.id,
            name=item.name,
            replace=replace,
            start_seconds=start_seconds,
            loop=loop,
            output_route=item.output_route,
        )
        with self.lock:
            self.library.record_play(item.id)
            self.status = f"Tocando: {item.name}"

    def preview_sound_edit(self, data: dict) -> None:
        item = self.library.by_id(str(data["id"]))
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        if not self.engine.running:
            with self.lock:
                if not self.engine.running:
                    self.start()
        rendered, sample_rate = render_audio_file_edit(
            item.path,
            data.get("start", 0.0),
            data.get("end"),
            volume=max(0.0, float(data.get("volume", item.volume))),
            pitch_semitones=float(data.get("pitch_semitones", item.pitch_semitones)),
            pitch_mode=str(data.get("pitch_mode", item.pitch_mode)),
            speed=float(data.get("speed", item.speed)),
            normalize=bool(data.get("normalize", item.normalize)),
            fade_in_ms=float(data.get("fade_in_ms", item.fade_in_ms)),
            fade_out_ms=float(data.get("fade_out_ms", item.fade_out_ms)),
            repeats=max(1, min(20, int(round(float(data.get("repeats", item.repeats)))))),
            effects=data.get("effects"),
        )
        if sample_rate != self.engine.sample_rate:
            from .soundboard import resample_linear

            rendered = resample_linear(rendered, sample_rate, self.engine.sample_rate)
        name = str(data.get("name") or item.name or "Som").strip() or "Som"
        self.engine.play_sound(
            rendered,
            block_voice=bool(data.get("block_voice", item.block_voice)),
            loop=bool(data.get("loop", item.loop)),
            sound_id=item.id,
            name=f"Previa: {name}",
            output_route=str(data.get("output_route", item.output_route)),
        )
        with self.lock:
            self.status = f"Previa: {name}"

    def save_sound_edit(self, data: dict, replace: bool):
        item = self.library.by_id(str(data["id"]))
        if item is None:
            raise RuntimeError("Som nao encontrado.")
        saved = self.library.save_edited(
            item.id,
            replace=replace,
            name=str(data.get("name") or item.name),
            category=str(data.get("category") or item.category),
            color=_sanitize_color(data.get("color", item.color)),
            volume=max(0.0, float(data.get("volume", item.volume))),
            pitch_semitones=float(data.get("pitch_semitones", item.pitch_semitones)),
            pitch_mode=str(data.get("pitch_mode", item.pitch_mode)),
            speed=float(data.get("speed", item.speed)),
            normalize=bool(data.get("normalize", item.normalize)),
            fade_in_ms=float(data.get("fade_in_ms", item.fade_in_ms)),
            fade_out_ms=float(data.get("fade_out_ms", item.fade_out_ms)),
            repeats=max(1, min(20, int(round(float(data.get("repeats", item.repeats)))))),
            shortcut=str(data.get("shortcut", item.shortcut) or ""),
            block_voice=bool(data.get("block_voice", item.block_voice)),
            loop=bool(data.get("loop", item.loop)),
            playback_mode=str(data.get("playback_mode", item.playback_mode)),
            stop_other_sounds=bool(data.get("stop_other_sounds", item.stop_other_sounds)),
            mute_other_sounds=bool(data.get("mute_other_sounds", item.mute_other_sounds)),
            output_route=str(data.get("output_route", item.output_route)),
            start_seconds=float(data.get("start") or 0.0),
            end_seconds=data.get("end"),
            effects=data.get("effects"),
        )
        with self.lock:
            self.status = f"{'Som atualizado' if replace else 'Copia criada'}: {saved.name}"
        return saved

    def add_recording_to_soundboard(self, path: Path, name: str | None = None):
        return self.library.add_file(str(path), category="Gravacoes", name=name or Path(path).stem, color="#49e2d1")

    def snapshot(self) -> dict:
        input_device = self.device_by_index(self.selected_input)
        output_device = self.device_by_index(self.selected_output)
        route = ""
        if input_device and output_device:
            route = (
                f"Entrada: {input_device.name} -> Saida: {output_device.name}. "
                f"No Discord use: {likely_recording_pair_name(output_device.name)}."
            )
        return {
            "status": self.status,
            "running": self.engine.running,
            "monitorOnly": self.monitor_only_active,
            "sampleRate": self.engine.sample_rate,
            "level": self.engine.last_level,
            "route": route,
            "virtualMode": self.virtual_mode_active,
            "virtualCableDetected": choose_virtual_output_device(self.devices) is not None,
            "selected": {
                "input": self.selected_input,
                "output": self.selected_output,
                "monitor": self.selected_monitor,
            },
            "controls": {
                "gain": self.gain,
                "pitch": self.pitch,
                "monitor": self.monitor_enabled,
                "monitorVolume": self.monitor_volume,
                "soundboardMonitor": self.soundboard_monitor_enabled,
                "soundboardMonitorVolume": self.soundboard_monitor_volume,
                "effects": asdict(self.effects),
            },
            "devices": {
                "inputs": [asdict(device) for device in input_devices(self.devices)],
                "outputs": [asdict(device) for device in output_devices(self.devices)],
            },
            "player": self.engine.player_state(),
            "players": self.engine.player_states(),
            "totalPlayCount": sum(max(0, int(item.play_count or 0)) for item in self.library.items),
            "sounds": [
                {**asdict(item), "plays": item.play_count, "duration": self.cached_audio_duration(item.path), "coverUrl": self.cached_cover_url(item.cover_path)}
                for item in self.library.items
            ],
            "soundCategories": self.library.categories(),
            "soundDefaults": asdict(self.library.defaults),
            "settings": dict(self.settings),
            "recordDevices": [asdict(device) for device in self.record_devices],
            "recordSelected": sorted(self.record_selected_indexes),
            "recording": {
                "voice": self.engine.recording,
                "pc": self.pc_recorder.running,
                "combo": self.combo_recording,
            },
            "folders": {
                "sounds": str(self.library.sounds_dir),
                "recordings": str(self.library.base_dir / "recordings"),
                "pcRecordings": str(self.library.base_dir / "pc_recordings"),
            },
            "windowsCaptureEndpoints": list(self.windows_capture_endpoints)
        }

def _optional_int(value, fallback: int | None) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _existing_device_index(devices: list[AudioDevice], value, fallback: int | None) -> int | None:
    index = _optional_int(value, None)
    if index is None:
        return fallback
    for device in devices:
        if device.index == index:
            return index
    return fallback


def _sanitize_color(value) -> str:
    text = str(value or "#25a7f2").strip()
    if len(text) == 7 and text.startswith("#"):
        try:
            int(text[1:], 16)
            return text.lower()
        except ValueError:
            pass
    return "#25a7f2"


STATE = AppState()


class Handler(BaseHTTPRequestHandler):
    server_version = "MicFudiddoBackend/0.1"

    def do_OPTIONS(self) -> None:
        self._empty(204)

    def do_GET(self) -> None:
        try:
            path = urlparse(self.path).path
            if path == "/api/state":
                with STATE.lock:
                    self._json(STATE.snapshot())
                return
            if path == "/api/health":
                self._json({"ok": True, "time": time.time()})
                return
            if path == "/api/sounds/trending":
                from urllib.parse import parse_qs
                query_params = parse_qs(urlparse(self.path).query)
                page = int(query_params.get("page", [1])[0])
                results = fetch_myinstants_trending(page)
                self._json({"sounds": results})
                return
            if path == "/api/sounds/search":
                from urllib.parse import parse_qs
                query_params = parse_qs(urlparse(self.path).query)
                q = query_params.get("q", [""])[0].strip()
                page = int(query_params.get("page", [1])[0])
                results = fetch_myinstants_search(q, page)
                self._json({"sounds": results})
                return
            self._json({"error": "not found"}, 404)
        except Exception as exc:
            self._json({"error": str(exc)}, 500)

    def do_HEAD(self) -> None:
        try:
            path = urlparse(self.path).path
            if path in ("/api/state", "/api/health", "/api/sounds/trending", "/api/sounds/search"):
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self._cors()
                self.end_headers()
                return
            self.send_response(404)
            self._cors()
            self.end_headers()
        except Exception:
            self.send_response(500)
            self._cors()
            self.end_headers()

    def do_POST(self) -> None:
        try:
            path = urlparse(self.path).path
            data = self._read_json()
            # If the path is a slow audio rendering path, run it without holding the global STATE.lock
            # to prevent blocking other HTTP requests (like /api/state polling) during loading & DSP.
            slow_paths = {
                "/api/sounds/play",
                "/api/sounds/play-online",
                "/api/sounds/random",
                "/api/sounds/preview",
                "/api/sounds/save-edited",
                "/api/sounds/trim",
                "/api/sounds/trending",
                "/api/sounds/search",
                "/api/sounds/import-youtube"
            }
            if path in slow_paths:
                with com_initialized():
                    result = self._route_post(path, data)
            else:
                with STATE.lock:
                    with com_initialized():
                        result = self._route_post(path, data)
            self._json(result if result is not None else STATE.snapshot())
        except Exception as exc:
            self._json({"error": str(exc)}, 500)

    def _route_post(self, path: str, data: dict):
        if path == "/api/devices/refresh":
            STATE.refresh_devices()
            STATE.refresh_record_devices()
            return None
        if path == "/api/selection":
            selected = data.get("selected", data)
            STATE.selected_input = _optional_int(selected.get("input"), STATE.selected_input)
            STATE.selected_output = _optional_int(selected.get("output"), STATE.selected_output)
            STATE.selected_monitor = _optional_int(selected.get("monitor"), STATE.selected_monitor)
            STATE.save_profile()
            return None
        if path == "/api/controls":
            controls = data.get("controls", data)
            STATE.gain = max(0.0, float(controls.get("gain", STATE.gain)))
            STATE.pitch = float(controls.get("pitch", STATE.pitch))
            STATE.monitor_enabled = bool(controls.get("monitor", STATE.monitor_enabled))
            STATE.monitor_volume = max(0.0, min(3.0, float(controls.get("monitorVolume", STATE.monitor_volume))))
            STATE.soundboard_monitor_enabled = bool(controls.get("soundboardMonitor", STATE.soundboard_monitor_enabled))
            STATE.soundboard_monitor_volume = max(0.0, min(3.0, float(controls.get("soundboardMonitorVolume", STATE.soundboard_monitor_volume))))
            effects = controls.get("effects")
            if effects:
                STATE.effects = EffectsSettings(**{**asdict(STATE.effects), **effects})
            if STATE.monitor_only_active:
                if STATE.monitor_enabled or STATE.soundboard_monitor_enabled:
                    STATE.engine.set_controls(
                        1.0,
                        0.0,
                        EffectsSettings(),
                        monitor_volume=STATE.monitor_volume,
                        soundboard_monitor_enabled=STATE.soundboard_monitor_enabled,
                        soundboard_monitor_volume=STATE.soundboard_monitor_volume,
                    )
                    STATE.engine.set_monitor(
                        STATE.monitor_enabled,
                        STATE.device_by_index(STATE.selected_monitor),
                        monitor_volume=STATE.monitor_volume,
                        soundboard_monitor_enabled=STATE.soundboard_monitor_enabled,
                        soundboard_monitor_volume=STATE.soundboard_monitor_volume,
                    )
                else:
                    STATE.stop()
            else:
                STATE.engine.set_controls(
                    STATE.gain,
                    STATE.pitch,
                    STATE.effects,
                    monitor_volume=STATE.monitor_volume,
                    soundboard_monitor_enabled=STATE.soundboard_monitor_enabled,
                    soundboard_monitor_volume=STATE.soundboard_monitor_volume,
                )
                STATE.engine.set_monitor(
                    STATE.monitor_enabled,
                    STATE.device_by_index(STATE.selected_monitor),
                    monitor_volume=STATE.monitor_volume,
                    soundboard_monitor_enabled=STATE.soundboard_monitor_enabled,
                    soundboard_monitor_volume=STATE.soundboard_monitor_volume,
                )
                if (STATE.monitor_enabled or STATE.soundboard_monitor_enabled) and not STATE.engine.running:
                    STATE.start_monitor_only()
            STATE.save_profile()
            return None
        if path == "/api/start":
            STATE.start()
            return None
        if path == "/api/stop":
            if STATE.virtual_mode_active and STATE.settings.get("restoreOnDisable", True):
                STATE.deactivate_virtual()
            else:
                STATE.stop()
            if STATE.monitor_enabled or STATE.soundboard_monitor_enabled:
                STATE.start_monitor_only()
            return None
        if path == "/api/virtual/start":
            STATE.activate_virtual()
            return None
        if path == "/api/virtual/stop":
            STATE.deactivate_virtual()
            if STATE.monitor_enabled or STATE.soundboard_monitor_enabled:
                STATE.start_monitor_only()
            return None
        if path == "/api/reset":
            STATE.reset_defaults()
            return None
        if path == "/api/reset-section":
            STATE.reset_section(str(data.get("section", "")))
            return None
        if path == "/api/settings":
            STATE.update_settings(data.get("settings", data))
            return None
        if path == "/api/sounds/add":
            paths = data.get("paths", [])
            def bg_add():
                added = 0
                for file_path in paths:
                    try:
                        STATE.library.add_file(file_path)
                        added += 1
                    except Exception as e:
                        print("Error adding file:", e)
                with STATE.lock:
                    STATE.status = f"{added} som(ns) importado(s)" if added else STATE.status
            threading.Thread(target=bg_add, daemon=True).start()
            STATE.status = "Importando sons..."
            return None
        if path == "/api/sounds/import-youtube":
            youtube_url = data.get("url")
            if not youtube_url:
                raise RuntimeError("URL do YouTube ausente.")
            
            import yt_dlp
            import imageio_ffmpeg
            import tempfile
            from pathlib import Path
            import uuid
            from .soundboard import sanitize_sound_name
            
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            temp_dir = tempfile.gettempdir()
            
            temp_id = uuid.uuid4().hex
            outtmpl = str(Path(temp_dir) / f"yt_{temp_id}.%(ext)s")
            
            ydl_opts = {
                'format': 'bestaudio/best',
                'outtmpl': outtmpl,
                'ffmpeg_location': ffmpeg_path,
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'quiet': True,
                'no_warnings': True,
            }
            
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(youtube_url, download=True)
                    mp3_path = Path(temp_dir) / f"yt_{temp_id}.mp3"
                    if not mp3_path.exists():
                        raise RuntimeError("Falha ao extrair áudio do YouTube.")
                    
                    title = info.get("title", "Som do YouTube")
                    sanitized_title = sanitize_sound_name(title)
                    if not sanitized_title:
                        sanitized_title = "som_youtube"
                        
                    with STATE.lock:
                        item = STATE.library.add_file(str(mp3_path), category="Geral", name=sanitized_title)
                        try:
                            mp3_path.unlink(missing_ok=True)
                        except OSError:
                            pass
                        STATE.status = f"Som '{item.name}' importado do YouTube!"
                        return {"soundId": item.id, **STATE.snapshot()}
            except Exception as e:
                try:
                    Path(str(Path(temp_dir) / f"yt_{temp_id}.mp3")).unlink(missing_ok=True)
                except OSError:
                    pass
                raise RuntimeError(f"Erro ao importar do YouTube: {str(e)}")

        if path == "/api/sounds/download":
            url = data.get("url")
            name = data.get("name")
            category = data.get("category", "Online")
            color = data.get("color")
            if not url:
                raise RuntimeError("URL de download ausente.")
            
            sound_id = data.get("id") or f"online_{name.replace(' ', '_')}"
            suffix = ".mp3"
            if ".wav" in url.lower():
                suffix = ".wav"
            elif ".ogg" in url.lower():
                suffix = ".ogg"
            elif ".m4a" in url.lower():
                suffix = ".m4a"
                
            cached_file = STATE.online_cache_dir / f"{sound_id}{suffix}"
            if cached_file.exists():
                item = STATE.library.add_file(str(cached_file), category=category, name=name, color=color)
                STATE.status = f"Som '{item.name}' importado do cache!"
            else:
                import urllib.request
                import tempfile
                from pathlib import Path
                sanitized_name = "".join(c for c in name if c.isalnum() or c in "._- ").strip() if name else "online_sound"
                if not sanitized_name:
                    sanitized_name = "online_sound"
                temp_dir = tempfile.gettempdir()
                temp_path = Path(temp_dir) / f"{sanitized_name}_{random.randint(1000,9999)}{suffix}"
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                req = urllib.request.Request(url, headers=headers)
                with urllib.request.urlopen(req) as response, open(temp_path, "wb") as out_file:
                    out_file.write(response.read())
                item = STATE.library.add_file(str(temp_path), category=category, name=name, color=color)
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass
                STATE.status = f"Som '{item.name}' baixado com sucesso!"
            return {"soundId": item.id, **STATE.snapshot()}
            
        if path == "/api/windows/set-default-mic":
            device_id = data.get("device_id")
            if device_id:
                set_default_capture_id(device_id)
                STATE.status = f"Microfone padrao alterado para: {device_id}"
                return {"ok": True}
            raise RuntimeError("ID do dispositivo ausente.")

        if path == "/api/sounds/play-online":
            def run_play_online() -> None:
                with com_initialized():
                    try:
                        STATE.play_online_sound(
                            str(data["id"]),
                            str(data["url"]),
                            str(data["name"])
                        )
                    except Exception as exc:
                        with STATE.lock:
                            STATE.status = f"Erro ao tocar online: {exc}"

            threading.Thread(target=run_play_online, daemon=True).start()
            return {"queued": True, "status": STATE.status, "running": STATE.engine.running}
        if path == "/api/sounds/trending":
            from urllib.parse import parse_qs, urlparse
            query_params = parse_qs(urlparse(self.path).query)
            page = int(data.get("page") or query_params.get("page", [1])[0])
            results = fetch_myinstants_trending(page)
            return {"sounds": results}

        if path == "/api/sounds/search":
            from urllib.parse import parse_qs, urlparse
            query_params = parse_qs(urlparse(self.path).query)
            q = str(data.get("q") or query_params.get("q", [""])[0]).strip()
            page = int(data.get("page") or query_params.get("page", [1])[0])
            results = fetch_myinstants_search(q, page)
            return {"sounds": results}

        if path == "/api/sounds/online-search":
            query = data.get("query", "").strip()
            category = data.get("category", "Todos")
            provider = data.get("provider", "myinstants")
            
            LOCAL_STATIC_CATALOG = [
                { "id": "myinst_bruh", "name": "Bruh Effect", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/bruh.mp3", "duration": "1.2s", "plays": "9.9M" },
                { "id": "myinst_airhorn", "name": "Airhorn MLG", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/mlg-airhorn.mp3", "duration": "2.1s", "plays": "7.5M" },
                { "id": "myinst_emotional", "name": "Emotional Damage", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/emotional-damage.mp3", "duration": "1.8s", "plays": "6.2M" },
                { "id": "myinst_fbi", "name": "FBI Open Up!", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/fbi-open-up-sfx.mp3", "duration": "3.5s", "plays": "4.8M" },
                { "id": "myinst_sad_violin", "name": "Sad Violin", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/sad-violin.mp3", "duration": "8.5s", "plays": "2.1M" },
                { "id": "myinst_mgs_alert", "name": "Metal Gear Alert", "category": "Jogos", "url": "https://www.myinstants.com/media/sounds/metal-gear-solid-alert.mp3", "duration": "1.5s", "plays": "5.5M" },
                { "id": "myinst_zelda_secret", "name": "Zelda Secret Sound", "category": "Jogos", "url": "https://www.myinstants.com/media/sounds/zelda-secret-sound.mp3", "duration": "2.2s", "plays": "4.1M" },
                { "id": "myinst_nani", "name": "NANI?!", "category": "Anime", "url": "https://www.myinstants.com/media/sounds/omae-wa-mou-shindeiru.mp3", "duration": "3.2s", "plays": "3.8M" },
                { "id": "myinst_tuturu", "name": "Tuturu - Mayuri", "category": "Anime", "url": "https://www.myinstants.com/media/sounds/tuturu_1.mp3", "duration": "1.0s", "plays": "2.5M" },
                { "id": "myinst_drumroll", "name": "Drum Roll", "category": "Sonoplastia", "url": "https://www.myinstants.com/media/sounds/drum-roll.mp3", "duration": "3.0s", "plays": "1.9M" },
                { "id": "myinst_fart", "name": "Fart Meme", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/fart-meme-sound-effect.mp3", "duration": "1.2s", "plays": "8.2M" },
                { "id": "myinst_tada", "name": "Tadaa Sound", "category": "Sonoplastia", "url": "https://www.myinstants.com/media/sounds/tada.mp3", "duration": "1.5s", "plays": "3.0M" },
                { "id": "myinst_yeet", "name": "Yeet Effect", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/yeet.mp3", "duration": "0.8s", "plays": "5.2M" },
                { "id": "myinst_wow", "name": "Wow - Anime", "category": "Anime", "url": "https://www.myinstants.com/media/sounds/anime-wow.mp3", "duration": "1.1s", "plays": "4.5M" },
                { "id": "myinst_coffin", "name": "Coffin Dance", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/coffin-dance-meme.mp3", "duration": "10.0s", "plays": "6.8M" },
                { "id": "myinst_windows", "name": "Windows Error", "category": "Memes", "url": "https://www.myinstants.com/media/sounds/windows-xp-error-sound.mp3", "duration": "1.0s", "plays": "3.2M" },
                { "id": "myinst_headshot", "name": "Boom Headshot", "category": "Jogos", "url": "https://www.myinstants.com/media/sounds/boom-headshot_1.mp3", "duration": "1.8s", "plays": "2.8M" }
            ]
            
            FREESOUND_STATIC_CATALOG = [
                { "id": "free_laser", "name": "Laser Blast", "category": "Sci-Fi", "url": "https://actions.google.com/sounds/v1/science_fiction/alien_creature_glitch.ogg", "duration": "2.0s", "plays": "Freesound" },
                { "id": "free_retro", "name": "Retro Game Jump", "category": "Jogos", "url": "https://actions.google.com/sounds/v1/science_fiction/retro_game_jump.ogg", "duration": "1.2s", "plays": "Freesound" },
                { "id": "free_explosion", "name": "Crash Impact SFX", "category": "Jogos", "url": "https://actions.google.com/sounds/v1/impacts/crash_and_smash.ogg", "duration": "3.5s", "plays": "Freesound" },
                { "id": "free_synth", "name": "Ambient Synth Pad", "category": "Sonoplastia", "url": "https://actions.google.com/sounds/v1/ambiences/morning_birds.ogg", "duration": "10.0s", "plays": "Freesound" },
                { "id": "free_glitch", "name": "Cyber Glitch Beep", "category": "Sci-Fi", "url": "https://actions.google.com/sounds/v1/science_fiction/alien_signal.ogg", "duration": "2.5s", "plays": "Freesound" },
                { "id": "free_sweep", "name": "Swoosh Sweep", "category": "Sonoplastia", "url": "https://actions.google.com/sounds/v1/cartoon/cartoon_swoosh.ogg", "duration": "1.5s", "plays": "Freesound" },
                { "id": "free_powerup", "name": "Power Up Retro", "category": "Jogos", "url": "https://actions.google.com/sounds/v1/cartoon/slide_whistle_up.ogg", "duration": "2.0s", "plays": "Freesound" }
            ]
            
            combined = []
            seen_urls = set()
            
            if provider == "freesound":
                q_clean = query.lower().strip()
                for item in FREESOUND_STATIC_CATALOG:
                    cat_match = (category == "Todos" or item["category"] == category)
                    name_match = (not q_clean or q_clean in item["name"].lower())
                    if cat_match and name_match:
                        if item["url"] not in seen_urls:
                            seen_urls.add(item["url"])
                            combined.append(item)
            else:
                results = []
                if query:
                    try:
                        import urllib.request
                        import urllib.parse
                        import re
                        
                        search_url = f"https://www.myinstants.com/search/?name={urllib.parse.quote(query)}"
                        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                        req = urllib.request.Request(search_url, headers=headers)
                        
                        with urllib.request.urlopen(req, timeout=4) as response:
                            html = response.read().decode("utf-8")
                            
                        instants = re.findall(r'onclick="play\(\'([^\']+)\'\)"[^>]*>.*?class="instant-link"[^>]*>([^<]+)</a>', html, re.DOTALL)
                        for sound_path, name in instants:
                            sound_path = sound_path.strip()
                            name = name.strip()
                            if not sound_path.startswith("http"):
                                sound_url = f"https://www.myinstants.com{sound_path}"
                            else:
                                sound_url = sound_path
                            sound_id = f"online_{hash(sound_url) & 0xffffffff}"
                            results.append({
                                "id": sound_id,
                                "name": name,
                                "category": "Online",
                                "url": sound_url,
                                "duration": "N/A",
                                "plays": "Meme Web"
                            })
                    except Exception as e:
                        print("MyInstants search failed, fallback active:", e)
                        
                local_filtered = []
                q_clean = query.lower().strip()
                for item in LOCAL_STATIC_CATALOG:
                    cat_match = (category == "Todos" or item["category"] == category)
                    name_match = (not q_clean or q_clean in item["name"].lower())
                    if cat_match and name_match:
                        local_filtered.append(item)
                        
                for item in local_filtered:
                    if item["url"] not in seen_urls:
                        seen_urls.add(item["url"])
                        combined.append(item)
                for item in results:
                    if item["url"] not in seen_urls:
                        seen_urls.add(item["url"])
                        combined.append(item)
                        
            return {"sounds": combined}
            
        if path == "/api/sounds/add-folder":
            paths = data.get("paths", [])
            def bg_add_folder():
                added = 0
                for folder_path in paths:
                    try:
                        added += len(STATE.library.add_folder(folder_path))
                    except Exception as e:
                        print("Error adding folder:", e)
                with STATE.lock:
                    STATE.status = f"{added} som(ns) importado(s) da pasta" if added else "Nenhum som encontrado na pasta"
            threading.Thread(target=bg_add_folder, daemon=True).start()
            STATE.status = "Importando pasta..."
            return None
        if path == "/api/sounds/play":
            def run_play() -> None:
                with com_initialized():
                    try:
                        STATE.play_sound(str(data["id"]), start_seconds=float(data.get("seconds") or 0.0))
                    except Exception as exc:
                        with STATE.lock:
                            STATE.status = f"Erro ao tocar som: {exc}"

            threading.Thread(target=run_play, daemon=True).start()
            return {"queued": True, "status": STATE.status, "running": STATE.engine.running}
        if path == "/api/sounds/random":
            category = str(data.get("category") or "").strip()
            items = [
                item
                for item in STATE.library.items
                if not category or category == "Todos" or (item.category or "Geral") == category
            ]
            if not items:
                raise RuntimeError("Nenhum som encontrado para sortear.")
            item_id = random.choice(items).id

            def run_random() -> None:
                with com_initialized():
                    try:
                        STATE.play_sound(item_id)
                    except Exception as exc:
                        with STATE.lock:
                            STATE.status = f"Erro ao sortear som: {exc}"

            threading.Thread(target=run_random, daemon=True).start()
            return {"queued": True, "status": STATE.status, "running": STATE.engine.running}
        if path == "/api/sounds/stop":
            playback_id = str(data.get("playbackId") or "")
            if playback_id:
                STATE.engine.stop_sound(playback_id=playback_id)
            else:
                STATE.engine.stop_sounds()
            STATE.status = "Sons parados" if STATE.engine.running else "Soundboard em espera"
            return None
        if path == "/api/player/playback-update":
            playback_id = str(data.get("playbackId") or "")
            patch = data.get("patch", {})
            STATE.engine.update_playback(playback_id, patch)
            return None
        if path == "/api/player/pause":
            STATE.engine.pause_sounds()
            STATE.status = "Soundboard pausado"
            return None
        if path == "/api/player/resume":
            STATE.engine.resume_sounds()
            STATE.status = "Soundboard tocando"
            return None
        if path == "/api/player/toggle":
            player = STATE.engine.player_state()
            if player.get("state") == "paused":
                STATE.engine.resume_sounds()
                STATE.status = "Soundboard tocando"
            elif player.get("state") == "playing":
                STATE.engine.pause_sounds()
                STATE.status = "Soundboard pausado"
            elif data.get("id"):
                STATE.play_sound(str(data["id"]))
            return None
        if path == "/api/player/seek":
            seconds = float(data.get("seconds") or data.get("position") or 0.0)
            STATE.engine.seek_sound(seconds, str(data.get("playbackId") or ""))
            return None
        if path == "/api/player/stop":
            STATE.engine.stop_sound(str(data.get("soundId") or ""), str(data.get("playbackId") or ""))
            return None
        if path == "/api/sounds/delete-category":
            category_to_delete = data.get("category")
            if not category_to_delete:
                raise RuntimeError("Categoria ausente.")
            modified = 0
            for item in STATE.library.items:
                if item.category == category_to_delete:
                    item.category = "Geral"
                    STATE.library.update(item)
                    modified += 1
            if modified > 0:
                STATE.library.save()
            STATE.status = f"Categoria '{category_to_delete}' excluída, {modified} som(ns) movidos para Geral."
            return STATE.snapshot()

        if path == "/api/sounds/delete":
            removed = STATE.library.detach(str(data["id"]))
            if removed:
                STATE.engine.stop_sound(sound_id=str(data["id"]))
                STATE.status = "Som removido da biblioteca"
            return {"removed": [removed] if removed else [], **STATE.snapshot()}
        if path == "/api/sounds/delete-batch":
            ids = [str(value) for value in data.get("ids", [])]
            removed = STATE.library.detach_many(ids)
            for item_id in ids:
                STATE.engine.stop_sound(sound_id=item_id)
            STATE.status = f"{len(removed)} som(ns) removido(s) da biblioteca"
            return {"removed": removed, **STATE.snapshot()}
        if path == "/api/sounds/restore":
            restored = STATE.library.restore_items(data.get("items", []))
            STATE.status = f"{len(restored)} som(ns) restaurado(s)"
            return {"restoredIds": [item.id for item in restored], **STATE.snapshot()}
        if path == "/api/sounds/cover":
            STATE.library.set_cover(str(data["id"]), str(data["path"]))
            STATE.status = "Capa do som atualizada"
            return None
        if path == "/api/sounds/trim":
            start = float(data.get("start", 0.0))
            end_raw = data.get("end")
            end = None if end_raw in (None, "") else float(end_raw)
            item = STATE.library.trimmed_copy(str(data["id"]), start, end)
            STATE.status = f"Corte criado: {item.name}"
            return None
        if path == "/api/sounds/preview":
            def run_preview() -> None:
                with com_initialized():
                    try:
                        STATE.preview_sound_edit(data)
                    except Exception as exc:
                        with STATE.lock:
                            STATE.status = f"Erro na previa: {exc}"

            threading.Thread(target=run_preview, daemon=True).start()
            return {"queued": True, "status": STATE.status, "running": STATE.engine.running}
        if path == "/api/sounds/save-edited":
            item = STATE.save_sound_edit(data, replace=bool(data.get("replace", False)))
            return {"soundId": item.id, **STATE.snapshot()}
        if path == "/api/sounds/update":
            item = STATE.library.by_id(str(data["id"]))
            if item is None:
                raise RuntimeError("Som nao encontrado.")
            for key in (
                "name",
                "category",
                "color",
                "volume",
                "pitch_semitones",
                "pitch_mode",
                "speed",
                "normalize",
                "fade_in_ms",
                "fade_out_ms",
                "repeats",
                "loop",
                "playback_mode",
                "stop_other_sounds",
                "mute_other_sounds",
                "output_route",
                "shortcut",
                "block_voice",
            ):
                if key in data:
                    setattr(item, key, data[key])
            from .soundboard import sanitize_sound_name
            item.name = sanitize_sound_name(str(item.name or "Som"))
            if not item.name:
                item.name = "som"
            item.category = str(item.category or "Geral").strip() or "Geral"
            item.color = _sanitize_color(item.color)
            item.volume = max(0.0, float(item.volume))
            item.speed = max(0.25, min(4.0, float(item.speed)))
            item.fade_in_ms = max(0.0, min(5000.0, float(item.fade_in_ms)))
            item.fade_out_ms = max(0.0, min(5000.0, float(item.fade_out_ms)))
            item.repeats = max(1, min(20, int(round(float(item.repeats)))))
            item.loop = bool(item.loop)
            if "loop" in data:
                with STATE.engine._playback_lock:
                    for pb in STATE.engine._playbacks:
                        if pb.sound_id == item.id:
                            pb.loop = bool(data["loop"])
            item.normalize = bool(item.normalize)
            item.block_voice = bool(item.block_voice)
            item.stop_other_sounds = bool(item.stop_other_sounds)
            item.mute_other_sounds = bool(item.mute_other_sounds)
            item.output_route = str(item.output_route or "both")
            STATE.library._sanitize_item(item)
            STATE.library.update(item)
            return None
        if path == "/api/sounds/defaults":
            STATE.library.defaults = SoundDefaults(
                volume=max(0.0, float(data.get("volume", STATE.library.defaults.volume))),
                pitch_semitones=float(data.get("pitch_semitones", STATE.library.defaults.pitch_semitones)),
                pitch_mode=str(data.get("pitch_mode", STATE.library.defaults.pitch_mode)),
                speed=max(0.25, min(4.0, float(data.get("speed", STATE.library.defaults.speed)))),
                normalize=bool(data.get("normalize", STATE.library.defaults.normalize)),
                fade_in_ms=max(0.0, min(5000.0, float(data.get("fade_in_ms", STATE.library.defaults.fade_in_ms)))),
                fade_out_ms=max(0.0, min(5000.0, float(data.get("fade_out_ms", STATE.library.defaults.fade_out_ms)))),
                repeats=max(1, min(20, int(round(float(data.get("repeats", STATE.library.defaults.repeats)))))),
                category=str(data.get("category", STATE.library.defaults.category) or "Geral").strip() or "Geral",
                color=_sanitize_color(data.get("color", STATE.library.defaults.color)),
            playback_mode=str(data.get("playback_mode", STATE.library.defaults.playback_mode)),
            stop_other_sounds=bool(data.get("stop_other_sounds", STATE.library.defaults.stop_other_sounds)),
            mute_other_sounds=bool(data.get("mute_other_sounds", STATE.library.defaults.mute_other_sounds)),
            output_route=str(data.get("output_route", STATE.library.defaults.output_route)),
        )
            STATE.library._sanitize_defaults()
            STATE.library.save_settings()
            return None
        if path == "/api/record/voice/start":
            if STATE.combo_recording:
                raise RuntimeError("Pare a gravacao voz + PC antes de gravar so a voz.")
            if not STATE.engine.running:
                STATE.start()
            STATE.engine.start_recording()
            return None
        if path == "/api/record/voice/stop":
            if STATE.combo_recording:
                raise RuntimeError("Use Parar voz + PC para finalizar a gravacao combinada.")
            out = STATE.library.base_dir / "recordings" / f"voz_processada_{time.strftime('%Y%m%d_%H%M%S')}.wav"
            out.parent.mkdir(parents=True, exist_ok=True)
            frames = STATE.engine.stop_recording(str(out))
            item = STATE.add_recording_to_soundboard(out, name=f"Voz {time.strftime('%H%M%S')}")
            STATE.status = f"Gravacao salva no soundboard: {item.name}"
            return {"path": str(out), "frames": frames, "soundId": item.id, **STATE.snapshot()}
        if path == "/api/record/selection":
            STATE.record_selected_indexes = {int(value) for value in data.get("indexes", [])}
            STATE.save_profile()
            return None
        if path == "/api/record/pc/start":
            if STATE.combo_recording:
                raise RuntimeError("Pare a gravacao voz + PC antes de gravar so o PC.")
            indexes = {int(value) for value in data.get("indexes", STATE.record_selected_indexes)}
            STATE.record_selected_indexes = indexes
            STATE.save_profile()
            devices = STATE.resolve_pc_record_devices(indexes)
            STATE.pc_recorder.start(devices)
            STATE.status = f"Gravando PC: {', '.join(device.name for device in devices)}"
            return None
        if path == "/api/record/pc/stop":
            if STATE.combo_recording:
                raise RuntimeError("Use Parar voz + PC para finalizar a gravacao combinada.")
            paths = STATE.pc_recorder.stop()
            sound_ids = []
            for path_item in paths:
                item = STATE.add_recording_to_soundboard(path_item)
                sound_ids.append(item.id)
            STATE.status = f"{len(sound_ids)} gravacao(oes) adicionada(s) ao soundboard"
            return {"paths": [str(path_item) for path_item in paths], "soundIds": sound_ids, **STATE.snapshot()}
        if path == "/api/record/combo/start":
            indexes = {int(value) for value in data.get("indexes", STATE.record_selected_indexes)}
            STATE.record_selected_indexes = indexes
            STATE.save_profile()
            STATE.start_combo_recording(indexes)
            return None
        if path == "/api/record/combo/stop":
            result = STATE.stop_combo_recording()
            return {**result, **STATE.snapshot()}
        if path == "/api/shutdown":
            STATE.deactivate_virtual()
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return {"ok": True}
        raise RuntimeError("Endpoint desconhecido.")

    def _read_json(self) -> dict:
        length = int(self.headers.get("content-length") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _empty(self, status: int) -> None:
        self.send_response(status)
        self._cors()
        self.end_headers()

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")

    def log_message(self, _format: str, *_args) -> None:
        return


def watch_parent_process() -> None:
    import os
    import time
    import ctypes

    parent_pid = os.getppid()
    if parent_pid <= 1:
        return

    PROCESS_QUERY_INFORMATION = 0x0400
    STILL_ACTIVE = 259
    kernel32 = ctypes.windll.kernel32

    while True:
        time.sleep(2.0)
        handle = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, parent_pid)
        if not handle:
            break
        exit_code = ctypes.c_ulong()
        try:
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)) or exit_code.value != STILL_ACTIVE:
                break
        finally:
            kernel32.CloseHandle(handle)

    print("Parent process exited, shutting down backend...", flush=True)
    try:
        STATE.deactivate_virtual()
    except Exception:
        pass
    os._exit(0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=38717)
    args = parser.parse_args()

    import threading
    threading.Thread(target=watch_parent_process, daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"MicFudiddo backend listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        with STATE.lock:
            STATE.deactivate_virtual()


if __name__ == "__main__":
    main()
