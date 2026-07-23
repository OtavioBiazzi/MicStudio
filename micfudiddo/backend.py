from __future__ import annotations

from dataclasses import asdict
import atexit
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import mimetypes
import os
import random
import signal
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import time
from urllib.parse import unquote, urlparse

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

TTS_CHUNK_LIMIT = 3500
TTS_CHUNK_GAP_SECONDS = 0.12


def split_tts_text(text: str, limit: int = TTS_CHUNK_LIMIT) -> list[str]:
    text = str(text or "").strip()
    if not text:
        return []

    chunks: list[str] = []
    remaining = text
    min_split = max(1, int(limit * 0.45))
    separators = ("\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " ")

    while len(remaining) > limit:
        window = remaining[: limit + 1]
        split_at = -1
        for separator in separators:
            idx = window.rfind(separator)
            if idx >= min_split:
                split_at = idx + len(separator)
                break
        if split_at < min_split:
            split_at = limit
        chunk = remaining[:split_at].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_at:].strip()

    if remaining:
        chunks.append(remaining)
    return chunks


async def synthesize_tts_text_to_audio(
    text: str,
    voice: str,
    rate: str,
    sample_rate: int,
    temp_dir: Path,
) -> np.ndarray:
    import edge_tts
    import uuid

    chunks = split_tts_text(text)
    if not chunks:
        raise RuntimeError("Texto vazio.")

    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_paths: list[Path] = []
    parts: list[np.ndarray] = []
    try:
        for index, chunk in enumerate(chunks):
            temp_path = temp_dir / f"tts_{uuid.uuid4().hex}_{index}.mp3"
            temp_paths.append(temp_path)
            communicate = edge_tts.Communicate(chunk, voice, rate=rate)
            await communicate.save(str(temp_path))
            part = load_audio_mono(str(temp_path), sample_rate)
            if part.size:
                parts.append(part.astype(np.float32, copy=False))
    finally:
        for temp_path in temp_paths:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass

    if not parts:
        raise RuntimeError("A sintese nao gerou audio.")
    if len(parts) == 1:
        return parts[0]

    gap = np.zeros(max(1, int(sample_rate * TTS_CHUNK_GAP_SECONDS)), dtype=np.float32)
    with_gaps: list[np.ndarray] = []
    for index, part in enumerate(parts):
        if index:
            with_gaps.append(gap)
        with_gaps.append(part)
    return np.concatenate(with_gaps).astype(np.float32, copy=False)


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
    "shortcutCommandGlitch": "Ctrl+Alt+G",
    "defaultMicOnClose": "restore",
    "voiceEditPersistence": "save",
    "confirmClose": True,
    "closeBehavior": "ask",
    "onlinePlaybackRoute": "both",
    "onlinePreviewVolume": "0.25",
    "maxSoundVolume": "1.0",
    "clipEnabled": False,
    "clipDuration": "30",
    "shortcutClip": "",
    "clipSource": "both",
    "showTtsWidgetSpeed": True,
    "showTtsWidgetVolume": True,
    "unlimitedTts": False,
    "ttsWidgetOpacity": 82,
    "shortcutFocusTtsWidget": "",
    "keepTtsTextAfterSpeak": False,
    "ttsVolume": 100,
    "maxSoundboardStorage": 0,
    "audioSampleRate": "48000",
    "audioBufferSize": "1024",
    "inputChannels": "mono",
    "youtubeUseBrowserCookies": False,
    "importDestinationMode": "ask",
    "importDestinationTabs": ["Todos"],
    "rememberLastImportTabs": True,
    "autoOrganizeBySource": False,
}

DEFAULT_PROFILE = {
    "gain": 1.0,
    "pitch": 0.0,
    "masterMicGain": 1.0,
    "masterVoiceVolume": 1.0,
    "masterPitch": 0.0,
    "masterMute": False,
    "monitor": True,
    "monitorVolume": 1.0,
    "soundboardMonitor": True,
    "soundboardMonitorVolume": 0.65,
    "effects": asdict(EffectsSettings()),
    "selected": {},
    "recordSelected": [],
    "voiceFavorites": [],
    "soundboardFavorites": [],
    "voiceRecents": [],
    "activeVoiceId": "clean",
}


from collections import deque

class AudioClippingManager:
    def __init__(self, app_state: AppState) -> None:
        self.app_state = app_state
        self._voice_chunks: deque[np.ndarray] = deque()
        self._pc_chunks: deque[np.ndarray] = deque()
        self._voice_available = 0
        self._pc_available = 0
        self._lock = threading.Lock()
        self._running = False
        self._pa = None
        self._pc_streams = []
        self._monitor_history: deque[np.ndarray] = deque()
        self._monitor_history_size = 0
        self._dropped_voice_chunks = 0
        self._dropped_pc_chunks = 0

    def write_voice(self, samples: np.ndarray, monitor_voice: np.ndarray | None = None) -> None:
        if not self._running:
            return
        source = str(self.app_state.settings.get("clipSource", "both"))
        if source == "pc":
            return
        chunk = np.asarray(samples, dtype=np.float32).copy()
        if chunk.size == 0:
            return
        if not self._lock.acquire(blocking=False):
            self._dropped_voice_chunks += 1
            return
        try:
            self._voice_chunks.append(chunk)
            self._voice_available += chunk.size
            max_samples = 60 * 48000
            while self._voice_available > max_samples and self._voice_chunks:
                overflow = self._voice_available - max_samples
                first = self._voice_chunks[0]
                if first.size <= overflow:
                    self._voice_chunks.popleft()
                    self._voice_available -= first.size
                else:
                    self._voice_chunks[0] = first[overflow:].copy()
                    self._voice_available -= overflow

            # Handle monitor history synchronously to preserve timing alignment
            if monitor_voice is not None:
                m_chunk = np.asarray(monitor_voice, dtype=np.float32).copy()
            else:
                m_chunk = np.zeros_like(chunk)
            self._monitor_history.append(m_chunk)
            self._monitor_history_size += m_chunk.size
            while self._monitor_history_size > max_samples and self._monitor_history:
                overflow = self._monitor_history_size - max_samples
                first = self._monitor_history[0]
                if first.size <= overflow:
                    self._monitor_history.popleft()
                    self._monitor_history_size -= first.size
                else:
                    self._monitor_history[0] = first[overflow:].copy()
                    self._monitor_history_size -= overflow
        finally:
            self._lock.release()

    def _make_pc_callback(self, device, stream_rate: int):
        import pyaudiowpatch as pyaudio
        def callback(in_data, frame_count, _time_info, status_flags):
            if not self._running:
                return (None, pyaudio.paComplete)
            source = str(self.app_state.settings.get("clipSource", "both"))
            if source == "voice":
                return (None, pyaudio.paComplete)
            data = np.frombuffer(in_data, dtype=np.float32)
            if data.size == 0:
                return (None, pyaudio.paContinue)
            try:
                data = data.reshape(-1, device.channels)
                mono = data.mean(axis=1).astype(np.float32, copy=False)
            except ValueError:
                mono = data.astype(np.float32, copy=False)
            
            if int(stream_rate) != 48000:
                from .recording import _resample_linear
                mono = _resample_linear(mono, int(stream_rate), 48000)
            
            if not self._lock.acquire(blocking=False):
                self._dropped_pc_chunks += 1
                return (None, pyaudio.paContinue)
            try:
                self._pc_chunks.append(mono.copy())
                self._pc_available += mono.size
                max_samples = 60 * 48000
                while self._pc_available > max_samples and self._pc_chunks:
                    overflow = self._pc_available - max_samples
                    first = self._pc_chunks[0]
                    if first.size <= overflow:
                        self._pc_chunks.popleft()
                        self._pc_available -= first.size
                    else:
                        self._pc_chunks[0] = first[overflow:].copy()
                        self._pc_available -= overflow
            finally:
                self._lock.release()
            return (None, pyaudio.paContinue)
        return callback

    def update(self) -> None:
        enabled = bool(self.app_state.settings.get("clipEnabled", False))
        source = str(self.app_state.settings.get("clipSource", "both"))
        
        if enabled:
            if source in ("both", "pc"):
                self.start_capture()
            else:
                self.stop_pc_capture()
                self._running = True
        else:
            self.stop_capture()

    def start_capture(self) -> None:
        self._running = True
        self._dropped_voice_chunks = 0
        self._dropped_pc_chunks = 0
        if self._pc_streams:
            return
        
        indexes = self.app_state.record_selected_indexes
        devices = self.app_state.resolve_pc_record_devices(indexes)
        
        import pyaudiowpatch as pyaudio
        self._pa = pyaudio.PyAudio()
        self._pc_streams = []
        
        for device in devices:
            try:
                stream_rate = max(8000, int(device.sample_rate or 48000))
                stream = self._pa.open(
                    format=pyaudio.paFloat32,
                    channels=device.channels,
                    rate=stream_rate,
                    input=True,
                    input_device_index=device.index,
                    frames_per_buffer=1024,
                    stream_callback=self._make_pc_callback(device, stream_rate),
                )
                stream.start_stream()
                self._pc_streams.append(stream)
            except Exception as e:
                print(f"Clipping: Error opening stream for {device.name}: {e}")
                
        print(f"Clipping: Started capturing PC audio on {len(self._pc_streams)} streams.")

    def stop_pc_capture(self) -> None:
        for stream in self._pc_streams:
            try:
                stream.stop_stream()
                stream.close()
            except Exception:
                pass
        self._pc_streams = []
        
        if self._pa:
            try:
                self._pa.terminate()
            except Exception:
                pass
        self._pa = None
        
        with self._lock:
            self._pc_chunks.clear()
            self._pc_available = 0
            self._monitor_history.clear()
            self._monitor_history_size = 0
            
        print("Clipping: Stopped PC capture streams.")

    def stop_capture(self) -> None:
        self._running = False
        self.stop_pc_capture()
        with self._lock:
            self._voice_chunks.clear()
            self._voice_available = 0
        print("Clipping: Stopped all capturing.")

    def stats(self) -> dict:
        with self._lock:
            return {
                "running": self._running,
                "voiceBufferedSamples": self._voice_available,
                "pcBufferedSamples": self._pc_available,
                "droppedVoiceChunks": self._dropped_voice_chunks,
                "droppedPcChunks": self._dropped_pc_chunks,
            }

    def save_clip(self, duration_sec: int) -> dict | None:
        if not self._running:
            return None
        
        source = str(self.app_state.settings.get("clipSource", "both"))
        
        with self._lock:
            voice_chunks = list(self._voice_chunks)
            pc_chunks = list(self._pc_chunks)
            monitor_chunks = list(self._monitor_history)
        
        needed_samples = int(duration_sec * 48000)
        
        voice_audio = np.zeros(0, dtype=np.float32)
        if source in ("both", "voice") and voice_chunks:
            full_voice = np.concatenate(voice_chunks)
            if full_voice.size > needed_samples:
                voice_audio = full_voice[-needed_samples:]
            else:
                voice_audio = full_voice
        
        pc_audio = np.zeros(0, dtype=np.float32)
        if source in ("both", "pc") and pc_chunks:
            full_pc = np.concatenate(pc_chunks)
            if full_pc.size > needed_samples:
                pc_audio = full_pc[-needed_samples:]
            else:
                pc_audio = full_pc
                
        monitor_audio = np.zeros(0, dtype=np.float32)
        if monitor_chunks:
            full_monitor = np.concatenate(monitor_chunks)
            if full_monitor.size > needed_samples:
                monitor_audio = full_monitor[-needed_samples:]
            else:
                monitor_audio = full_monitor

        # Align and subtract monitored voice from pc_audio if both exist to cancel duplication
        if pc_audio.size > 0 and monitor_audio.size > 0:
            try:
                max_size = min(monitor_audio.size, pc_audio.size)
                seg_len = 48000
                search_margin = 12000
                if max_size >= (seg_len + search_margin):
                    num_windows = (max_size - search_margin) // seg_len
                    best_energy = -1.0
                    best_window_idx = 0
                    for w in range(num_windows):
                        start = w * seg_len
                        end = start + seg_len
                        energy = np.sum(monitor_audio[start:end] ** 2)
                        if energy > best_energy:
                            best_energy = energy
                            best_window_idx = start
                    
                    if best_energy > 1e-3:
                        voice_sig = monitor_audio[best_window_idx : best_window_idx + seg_len]
                        pc_start = best_window_idx
                        pc_end = best_window_idx + seg_len + search_margin
                        if pc_end <= pc_audio.size:
                            pc_sig = pc_audio[pc_start:pc_end]
                            
                            # Downsample by 4 for coarse search to be fast and light
                            voice_ds = voice_sig[::4]
                            pc_ds = pc_sig[::4]
                            
                            corr = np.correlate(pc_ds, voice_ds, mode='valid')
                            if corr.size > 0:
                                coarse_delay_ds = int(np.argmax(corr))
                                coarse_delay = coarse_delay_ds * 4
                                
                                # Refine delay in [coarse_delay - 6, coarse_delay + 6]
                                refine_min = max(0, coarse_delay - 6)
                                refine_max = min(search_margin, coarse_delay + 6)
                                
                                best_d = coarse_delay
                                best_dot = -1.0
                                for d in range(refine_min, refine_max + 1):
                                    dot_val = np.dot(pc_sig[d : d + seg_len], voice_sig)
                                    if dot_val > best_dot:
                                        best_dot = dot_val
                                        best_d = d
                                
                                # Calculate optimal scale
                                ref_voice = voice_sig
                                ref_pc = pc_sig[best_d : best_d + seg_len]
                                denom = np.dot(ref_voice, ref_voice)
                                scale = np.dot(ref_pc, ref_voice) / denom if denom > 1e-5 else 0.0
                                
                                # If scale is reasonable, subtract from pc_audio
                                if 0.05 < scale < 2.5:
                                    pc_audio[best_d:] -= scale * monitor_audio[:pc_audio.size - best_d]
                                    print(f"Offline Clipping Cancelation: aligned at {best_d} samples ({best_d/48000*1000:.2f}ms), scale={scale:.3f}", flush=True)
            except Exception as e:
                print(f"Error in offline clipping cancelation: {e}", flush=True)

        max_len = max(voice_audio.size, pc_audio.size)
        if max_len == 0:
            return None
            
        mixed = np.zeros(max_len, dtype=np.float32)
        if voice_audio.size > 0:
            mixed[:voice_audio.size] += voice_audio
        if pc_audio.size > 0:
            mixed[:pc_audio.size] += pc_audio
            
        if source == "both" and voice_audio.size > 0 and pc_audio.size > 0:
            mixed /= 2.0
            
        import soundfile as sf
        stamp = time.strftime("%Y%m%d_%H%M%S")
        output_dir = self.app_state.library.base_dir / "recordings"
        output_dir.mkdir(parents=True, exist_ok=True)
        filename = f"clip_{stamp}.wav"
        output_path = output_dir / filename
        
        sf.write(str(output_path), mixed, 48000)
        
        # Save individual tracks for future clip remixing/separation
        if voice_audio.size > 0:
            sf.write(str(output_path.parent / f"{output_path.stem}.voice.wav"), voice_audio, 48000)
        if pc_audio.size > 0:
            sf.write(str(output_path.parent / f"{output_path.stem}.pc.wav"), pc_audio, 48000)
        
        item = self.app_state.add_recording_to_soundboard(output_path, name=f"Clip {time.strftime('%H%M%S')}")
        self.app_state.status = f"Clipe de {duration_sec}s salvo: {item.name}"
        return {"soundId": item.id, "name": item.name}


def _write_worker_status(status_path: Path, payload: dict) -> None:
    tmp_path = status_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp_path.replace(status_path)


def _set_low_process_priority() -> None:
    try:
        import ctypes
        import os

        BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
        handle = ctypes.windll.kernel32.GetCurrentProcess()
        ctypes.windll.kernel32.SetPriorityClass(handle, BELOW_NORMAL_PRIORITY_CLASS)
        os.environ["OMP_NUM_THREADS"] = "1"
        os.environ["OPENBLAS_NUM_THREADS"] = "1"
        os.environ["MKL_NUM_THREADS"] = "1"
        os.environ["NUMEXPR_NUM_THREADS"] = "1"
    except Exception:
        pass


def run_youtube_download_worker(job_path: str) -> int:
    _set_low_process_priority()
    job = json.loads(Path(job_path).read_text(encoding="utf-8-sig"))
    youtube_url = str(job["url"])
    work_dir = Path(job["workDir"])
    status_path = Path(job["statusPath"])
    cancel_path = Path(job["cancelPath"])
    use_browser_cookies = bool(job.get("useBrowserCookies", False))
    source_kind = str(job.get("source") or ("tiktok" if "tiktok." in youtube_url.lower() else "youtube"))
    tabs = [str(tab).strip() for tab in job.get("tabs", []) if str(tab).strip()]
    work_dir.mkdir(parents=True, exist_ok=True)

    def cancelled() -> bool:
        return cancel_path.exists()

    def status(message: str, state: str = "running", **extra) -> None:
        payload = {"state": state, "message": message, "time": time.time(), **extra}
        _write_worker_status(status_path, payload)

    try:
        import imageio_ffmpeg
        import yt_dlp

        from .soundboard import sanitize_sound_name

        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        outtmpl = str(work_dir / "download.%(ext)s")
        browsers = [None]
        if use_browser_cookies:
            browsers.extend(["edge", "chrome", "firefox", "brave", "opera"])

        def hook(d):
            if cancelled():
                raise RuntimeError("CANCELLED")
            if d.get("status") == "downloading":
                percent = d.get("_percent_str", "").strip()
                speed = d.get("_speed_str", "").strip()
                suffix = f" ({speed})" if speed else ""
                status(f"Baixando: {percent}{suffix}".strip())
            elif d.get("status") == "finished":
                status("Convertendo audio...")

        last_err = None
        info = None
        status("Iniciando download...")
        for browser in browsers:
            if cancelled():
                raise RuntimeError("CANCELLED")
            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": outtmpl,
                "ffmpeg_location": ffmpeg_path,
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
                "quiet": True,
                "no_warnings": True,
                "progress_hooks": [hook],
                "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
                "retries": 3,
                "fragment_retries": 3,
            }
            if browser:
                ydl_opts["cookiesfrombrowser"] = (browser,)
                status(f"Tentando cookies do {browser}...")
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(youtube_url, download=True)
                break
            except Exception as exc:
                if "CANCELLED" in str(exc) or cancelled():
                    raise RuntimeError("CANCELLED") from exc
                last_err = exc

        if cancelled():
            raise RuntimeError("CANCELLED")
        if not info:
            raise last_err or RuntimeError("Falha ao extrair audio.")

        mp3_path = work_dir / "download.mp3"
        if not mp3_path.exists():
            raise RuntimeError("Falha ao converter audio.")

        title = info.get("title", "Som do YouTube")
        sanitized_title = sanitize_sound_name(title) or "som_youtube"
        status(
            "Download concluido.",
            state="done",
            title=title,
            name=sanitized_title,
            audioPath=str(mp3_path),
            source=source_kind,
            url=youtube_url,
            tabs=tabs,
        )
        return 0
    except Exception as exc:
        if "CANCELLED" in str(exc) or cancelled():
            status("Importacao cancelada.", state="cancelled")
            return 2
        status(f"Erro: {exc}", state="error", error=str(exc))
        return 1


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
        self.clipping_manager = AudioClippingManager(self)
        self.engine._clipping_manager = self.clipping_manager
        self.combo_recording = False
        self.sound_cache: dict[str, tuple[float, int, np.ndarray]] = {}
        self.sound_cache_bytes = 0
        self.sound_cache_limit_bytes = 64 * 1024 * 1024
        self.playback_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="micfudiddo-playback")
        self.duration_cache: dict[str, tuple[int, float]] = {}
        self.cover_url_cache: dict[str, tuple[int, str]] = {}
        self.devices: list[AudioDevice] = []
        self.record_devices = []
        self.windows_capture_endpoints: list[dict[str, str]] = []
        self.youtube_download_cancelled = False
        self.youtube_download_thread = None
        self.youtube_download_process = None
        self.youtube_work_dir: Path | None = None
        self.youtube_status_path: Path | None = None
        self.youtube_cancel_path: Path | None = None
        self.youtube_status = ""
        self.selected_input: int | None = None
        self.selected_input_name: str | None = None
        self.selected_input_hostapi: str | None = None
        self.selected_output: int | None = None
        self.selected_output_name: str | None = None
        self.selected_output_hostapi: str | None = None
        self.selected_monitor: int | None = None
        self.selected_monitor_name: str | None = None
        self.selected_monitor_hostapi: str | None = None
        self.gain = 1.0
        self.pitch = 0.0
        self.master_mic_gain = 1.0
        self.master_voice_volume = 1.0
        self.master_pitch = 0.0
        self.master_mute = False
        self.effects = EffectsSettings()
        self.monitor_enabled = True
        self.monitor_volume = 1.0
        self.soundboard_monitor_enabled = True
        self.soundboard_monitor_volume = 0.65
        self.record_selected_indexes: set[int] = set()
        self.api_port = 38717
        self.saved_capture_defaults_path = self.library.base_dir / "temp_capture_defaults.json"
        self.saved_capture_defaults: dict[int, str] = {}
        if self.saved_capture_defaults_path.exists():
            try:
                import json
                raw = json.loads(self.saved_capture_defaults_path.read_text(encoding="utf-8"))
                self.saved_capture_defaults = {int(k): v for k, v in raw.items()}
                if self.saved_capture_defaults and restore_default_capture_ids(self.saved_capture_defaults):
                    self.saved_capture_defaults_path.unlink(missing_ok=True)
                    self.saved_capture_defaults = {}
                    print("Microfone padrao restaurado apos encerramento inesperado.", flush=True)
                elif self.saved_capture_defaults:
                    print("Restauracao pendente: mantendo os dados de seguranca do microfone.", flush=True)
            except Exception as e:
                print("Erro ao recuperar microfone padrao temporario:", e)
        self.virtual_mode_active = False
        self.monitor_only_active = False
        self.status = "Backend pronto"
        self.hotkey_handles = []
        self.time_glitch_hotkey_handles = []
        self.time_glitch_hotkey_down = False
        self._shutdown_started = False
        
        self.custom_voices_path = self.library.base_dir / "custom_voices.json"
        self.custom_categories_path = self.library.base_dir / "custom_categories.json"
        self.theme_settings_path = self.library.base_dir / "theme_settings.json"
        self.trash_path = self.library.base_dir / "trash.json"
        
        self.custom_voices = self.load_custom_voices()
        self.custom_categories = self.load_custom_categories()
        self.theme_settings = self.load_theme_settings()
        self.trash_bin = self.load_trash_bin()

        self.refresh_devices()
        self.refresh_record_devices()
        self.apply_profile()
        self.online_cache_dir = self.library.base_dir / "online_cache"
        self.clean_online_cache()
        self.refresh_windows_capture_endpoints()
        self.register_hotkeys()
        self.clipping_manager.update()

    def load_custom_voices(self) -> list:
        if not self.custom_voices_path.exists():
            return []
        try:
            raw = json.loads(self.custom_voices_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict) and "voices" in raw:
                return raw["voices"]
            if isinstance(raw, list):
                return raw
        except Exception:
            pass
        return []

    def save_custom_voices(self) -> None:
        data = {
            "version": "1.0",
            "voices": self.custom_voices
        }
        self.custom_voices_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_custom_categories(self) -> dict:
        default_cats = {
            "version": "1.0",
            "soundboard": ["Geral", "Memes", "Anime", "Jogos", "Troll", "Notificações", "Customizados", "Gravações"],
            "voices": ["Humanos", "Robôs", "Monstros", "Anime", "Jogos", "Sci-Fi", "Memes", "Customizadas"]
        }
        if not self.custom_categories_path.exists():
            return default_cats
        try:
            raw = json.loads(self.custom_categories_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for key in ["soundboard", "voices"]:
                    if key not in raw or not isinstance(raw[key], list):
                        raw[key] = default_cats[key]
                return raw
        except Exception:
            pass
        return default_cats

    def save_custom_categories(self) -> None:
        self.custom_categories_path.write_text(json.dumps(self.custom_categories, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_theme_settings(self) -> dict:
        default_theme = {
            "version": "1.0",
            "accentColor": "purple",
            "customPalette": None,
            "glowIntensity": 1.0,
            "animationSpeed": 1.0,
            "layoutDensity": "comfort",
            "cardStyle": "premium",
            "gridSize": "normal",
            "reduceEffects": False,
            "darknessLevel": "normal",
            "savedThemes": []
        }
        if not self.theme_settings_path.exists():
            return default_theme
        try:
            raw = json.loads(self.theme_settings_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                theme = dict(default_theme)
                theme.update(raw)
                return theme
        except Exception:
            pass
        return default_theme

    def save_theme_settings(self) -> None:
        self.theme_settings_path.write_text(json.dumps(self.theme_settings, ensure_ascii=False, indent=2), encoding="utf-8")

    def load_trash_bin(self) -> list:
        if not self.trash_path.exists():
            return []
        try:
            raw = json.loads(self.trash_path.read_text(encoding="utf-8"))
            if isinstance(raw, list):
                return raw
        except Exception:
            pass
        return []

    def save_trash_bin(self) -> None:
        self.trash_path.write_text(json.dumps(self.trash_bin, ensure_ascii=False, indent=2), encoding="utf-8")

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
        patch = dict(patch or {})
        previous_time_glitch_hotkey = self.time_glitch_hotkey_signature()
        if "sampleRate" in patch and "audioSampleRate" not in patch:
            patch["audioSampleRate"] = patch["sampleRate"]
        if "bufferSize" in patch and "audioBufferSize" not in patch:
            patch["audioBufferSize"] = patch["bufferSize"]

        audio_keys = {"audioSampleRate", "audioBufferSize", "inputChannels"}
        audio_changed = any(str(self.settings.get(key)) != str(patch.get(key)) for key in audio_keys if key in patch)
        was_running = self.engine.running
        was_virtual = self.virtual_mode_active
        was_monitor_only = self.monitor_only_active

        for key in DEFAULT_APP_SETTINGS:
            if key in patch:
                default_val = DEFAULT_APP_SETTINGS[key]
                if isinstance(default_val, bool):
                    self.settings[key] = bool(patch[key])
                elif isinstance(default_val, list):
                    self.settings[key] = [str(value).strip() for value in (patch[key] or []) if str(value).strip()]
                else:
                    self.settings[key] = str(patch[key])
        self.save_app_settings()
        self.clipping_manager.update()
        if self.time_glitch_hotkey_signature() != previous_time_glitch_hotkey:
            self.refresh_time_glitch_hotkey()
        if audio_changed and was_running:
            if was_virtual:
                self.activate_virtual()
            elif was_monitor_only:
                self.start_monitor_only()
            else:
                self.start()

    def preferred_sample_rate(self) -> int | None:
        value = str(self.settings.get("audioSampleRate", "auto")).strip().lower()
        if value in {"", "auto", "automatico", "automático"}:
            return None
        try:
            sample_rate = int(float(value))
        except (TypeError, ValueError):
            return None
        return sample_rate if 8000 <= sample_rate <= 192000 else None

    def preferred_block_size(self) -> int | None:
        value = str(self.settings.get("audioBufferSize", "1024")).strip()
        try:
            block_size = int(float(value))
        except (TypeError, ValueError):
            return 1024
        return block_size if 64 <= block_size <= 4096 else 1024

    def preferred_input_channels(self) -> int:
        value = str(self.settings.get("inputChannels", "mono")).strip().lower()
        return 2 if value == "stereo" else 1

    def resolve_import_tabs(self, requested_tabs=None, source_kind: str = "local") -> list[str]:
        source_kind = str(source_kind or "local").strip().lower()
        source_labels = {
            "youtube": "YouTube",
            "tiktok": "TikTok",
            "local": "Importados do PC",
            "online": "Online",
            "tts": "TTS",
            "recording": "Gravacoes",
        }
        tabs = [str(tab).strip() for tab in (requested_tabs or []) if str(tab).strip()]
        mode = str(self.settings.get("importDestinationMode", "ask") or "ask")
        if not tabs:
            if mode in {"auto_tabs", "remember_last"}:
                tabs = [
                    str(tab).strip()
                    for tab in (self.settings.get("importDestinationTabs") or [])
                    if str(tab).strip()
                ]
            elif mode == "source":
                tabs = [source_labels.get(source_kind, source_kind.title()) if source_kind else "Todos"]
            else:
                tabs = ["Todos"]
        if bool(self.settings.get("autoOrganizeBySource", False)) and source_kind in {"youtube", "tiktok", "local", "online", "tts", "recording"}:
            label = source_labels.get(source_kind, source_kind.title())
            if label not in tabs:
                tabs.append(label)
        if "Todos" not in tabs:
            tabs.insert(0, "Todos")
        deduped = []
        for tab in tabs:
            if tab not in deduped:
                deduped.append(tab)
        if bool(self.settings.get("rememberLastImportTabs", True)):
            self.settings["importDestinationTabs"] = deduped
            self.save_app_settings()
        return deduped

    def _youtube_worker_command(self, job_path: Path) -> list[str]:
        import sys

        if getattr(sys, "frozen", False):
            return [sys.executable, "--youtube-worker", str(job_path)]
        return [sys.executable, "-m", "micfudiddo.backend", "--youtube-worker", str(job_path)]

    def start_youtube_import(self, youtube_url: str, tabs=None) -> None:
        import subprocess
        import tempfile
        import uuid

        youtube_url = str(youtube_url or "").strip()
        if not youtube_url:
            raise RuntimeError("URL ausente.")
        source_kind = "tiktok" if "tiktok." in youtube_url.lower() else "youtube"
        destination_tabs = self.resolve_import_tabs(tabs, source_kind)

        with self.lock:
            if self.youtube_download_process and self.youtube_download_process.poll() is None:
                raise RuntimeError("Ja existe um download em andamento.")
            if self.youtube_download_thread and self.youtube_download_thread.is_alive():
                raise RuntimeError("Ja existe um download em andamento.")

            self.youtube_download_cancelled = False
            self.youtube_status = "Iniciando download..."

        work_dir = Path(tempfile.gettempdir()) / f"micfudiddo_yt_{uuid.uuid4().hex}"
        work_dir.mkdir(parents=True, exist_ok=True)
        status_path = work_dir / "status.json"
        cancel_path = work_dir / "cancel.flag"
        job_path = work_dir / "job.json"
        job = {
            "url": youtube_url,
            "workDir": str(work_dir),
            "statusPath": str(status_path),
            "cancelPath": str(cancel_path),
            "useBrowserCookies": bool(self.settings.get("youtubeUseBrowserCookies", False)),
            "source": source_kind,
            "tabs": destination_tabs,
        }
        job_path.write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")

        creationflags = 0
        if hasattr(subprocess, "CREATE_NO_WINDOW"):
            creationflags |= subprocess.CREATE_NO_WINDOW
        if hasattr(subprocess, "BELOW_NORMAL_PRIORITY_CLASS"):
            creationflags |= subprocess.BELOW_NORMAL_PRIORITY_CLASS

        process = subprocess.Popen(
            self._youtube_worker_command(job_path),
            cwd=str(Path(__file__).resolve().parent.parent),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )

        with self.lock:
            self.youtube_download_process = process
            self.youtube_work_dir = work_dir
            self.youtube_status_path = status_path
            self.youtube_cancel_path = cancel_path

        self.youtube_download_thread = threading.Thread(
            target=self._monitor_youtube_import,
            args=(process, work_dir, status_path, cancel_path),
            daemon=True,
        )
        self.youtube_download_thread.start()

    def _monitor_youtube_import(self, process, work_dir: Path, status_path: Path, cancel_path: Path) -> None:
        import shutil

        final_payload: dict | None = None
        while True:
            payload = None
            if status_path.exists():
                try:
                    payload = json.loads(status_path.read_text(encoding="utf-8"))
                except Exception:
                    payload = None
            if payload:
                final_payload = payload
                message = str(payload.get("message") or "")
                if message:
                    with self.lock:
                        self.youtube_status = message
                if payload.get("state") in {"done", "error", "cancelled"}:
                    break

            if process.poll() is not None:
                time.sleep(0.15)
                if status_path.exists():
                    try:
                        final_payload = json.loads(status_path.read_text(encoding="utf-8"))
                    except Exception:
                        pass
                if not final_payload or final_payload.get("state") not in {"done", "error", "cancelled"}:
                    final_payload = {
                        "state": "cancelled" if cancel_path.exists() else "error",
                        "message": "Importacao cancelada." if cancel_path.exists() else "Erro: processo de download encerrou sem resultado.",
                    }
                break

            time.sleep(0.25)

        try:
            state = (final_payload or {}).get("state")
            if state == "done" and not self.youtube_download_cancelled:
                audio_path = Path(str(final_payload.get("audioPath", "")))
                name = str(final_payload.get("name") or "som_youtube")
                tabs = final_payload.get("tabs") or []
                source_kind = str(final_payload.get("source") or "youtube")
                source_url = str(final_payload.get("url") or "")
                if not audio_path.exists():
                    raise RuntimeError("Arquivo baixado nao foi encontrado.")
                with self.lock:
                    self.youtube_status = "Adicionando a biblioteca..."
                    item = self.library.add_file(
                        str(audio_path),
                        category=(tabs[1] if isinstance(tabs, list) and len(tabs) > 1 else "Geral"),
                        name=name,
                        tabs=tabs,
                        source_kind=source_kind,
                        source_url=source_url,
                    )
                    self.youtube_status = f"Concluido: '{item.name}' importado!"
                    self.register_hotkeys()
            elif state == "cancelled":
                with self.lock:
                    self.youtube_status = "Importacao cancelada."
            else:
                with self.lock:
                    self.youtube_status = str((final_payload or {}).get("message") or "Erro ao importar audio.")
        except Exception as exc:
            with self.lock:
                self.youtube_status = f"Erro: {exc}"
        finally:
            with self.lock:
                self.youtube_download_process = None
                self.youtube_work_dir = None
                self.youtube_status_path = None
                self.youtube_cancel_path = None
                self.youtube_download_cancelled = False
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception:
                pass

    def cancel_youtube_import(self) -> None:
        with self.lock:
            self.youtube_download_cancelled = True
            self.youtube_status = "Cancelando..."
            cancel_path = self.youtube_cancel_path
            process = self.youtube_download_process
        if cancel_path is not None:
            try:
                cancel_path.write_text("cancelled", encoding="utf-8")
            except Exception:
                pass
        if process is not None and process.poll() is None:
            try:
                process.terminate()
            except Exception:
                pass

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

    def find_device_index(self, name: str | None, hostapi: str | None, direction: str) -> int | None:
        if name is None:
            return None
        # Try to match both name and hostapi
        for device in self.devices:
            if direction == "input" and device.max_input_channels <= 0:
                continue
            if direction == "output" and device.max_output_channels <= 0:
                continue
            if device.name == name and (hostapi is None or device.hostapi == hostapi):
                return device.index
        # Fallback to name only
        for device in self.devices:
            if direction == "input" and device.max_input_channels <= 0:
                continue
            if direction == "output" and device.max_output_channels <= 0:
                continue
            if device.name == name:
                return device.index
        return None

    def update_device_names(self) -> None:
        input_dev = self.device_by_index(self.selected_input)
        self.selected_input_name = input_dev.name if input_dev else None
        self.selected_input_hostapi = input_dev.hostapi if input_dev else None

        output_dev = self.device_by_index(self.selected_output)
        self.selected_output_name = output_dev.name if output_dev else None
        self.selected_output_hostapi = output_dev.hostapi if output_dev else None

        monitor_dev = self.device_by_index(self.selected_monitor)
        self.selected_monitor_name = monitor_dev.name if monitor_dev else None
        self.selected_monitor_hostapi = monitor_dev.hostapi if monitor_dev else None

    def apply_profile(self) -> None:
        self.gain = max(0.0, float(self.profile.get("gain", 1.0)))
        self.pitch = float(self.profile.get("pitch", 0.0))
        self.master_mic_gain = max(0.0, float(self.profile.get("masterMicGain", 1.0)))
        self.master_voice_volume = max(0.0, float(self.profile.get("masterVoiceVolume", 1.0)))
        self.master_pitch = float(self.profile.get("masterPitch", 0.0))
        self.master_mute = bool(self.profile.get("masterMute", False))
        self.monitor_enabled = bool(self.profile.get("monitor", False))
        self.monitor_volume = max(0.0, min(3.0, float(self.profile.get("monitorVolume", 1.0))))
        self.soundboard_monitor_enabled = bool(self.profile.get("soundboardMonitor", False))
        self.soundboard_monitor_volume = max(0.0, min(3.0, float(self.profile.get("soundboardMonitorVolume", 0.65))))
        effects = self.profile.get("effects", {})
        if isinstance(effects, dict):
            self.effects = EffectsSettings(**{**asdict(EffectsSettings()), **effects})

        self.voice_favorites = list(self.profile.get("voiceFavorites", []))
        self.soundboard_favorites = list(self.profile.get("soundboardFavorites", []))
        self.voice_recents = list(self.profile.get("voiceRecents", []))
        self.active_voice_id = str(self.profile.get("activeVoiceId", "clean"))

        selected = self.profile.get("selected", {})
        selected_names = self.profile.get("selected_names", {})
        if isinstance(selected, dict):
            # Tenta resolver por nome primeiro
            input_idx = self.find_device_index(selected_names.get("input"), selected_names.get("input_hostapi"), "input")
            if input_idx is None:
                input_idx = _existing_device_index(self.devices, selected.get("input"), self.selected_input)
            self.selected_input = input_idx

            output_idx = self.find_device_index(selected_names.get("output"), selected_names.get("output_hostapi"), "output")
            if output_idx is None:
                output_idx = _existing_device_index(self.devices, selected.get("output"), self.selected_output)
            self.selected_output = output_idx

            monitor_idx = self.find_device_index(selected_names.get("monitor"), selected_names.get("monitor_hostapi"), "output")
            if monitor_idx is None:
                monitor_idx = _existing_device_index(self.devices, selected.get("monitor"), self.selected_monitor)
            self.selected_monitor = monitor_idx

        self.update_device_names()

        selected_records = self.profile.get("recordSelected", [])
        try:
            self.record_selected_indexes = {int(value) for value in selected_records}
        except (TypeError, ValueError):
            self.record_selected_indexes = set()

        if self.engine.running:
            self.engine.set_controls(
                self.gain,
                self.pitch,
                self.effects,
                monitor_volume=self.monitor_volume,
                soundboard_monitor_enabled=self.soundboard_monitor_enabled,
                soundboard_monitor_volume=self.soundboard_monitor_volume,
                master_mic_gain=self.master_mic_gain,
                master_voice_volume=self.master_voice_volume,
                master_pitch=self.master_pitch,
                master_mute=self.master_mute,
            )

    def save_profile(self) -> None:
        self.profile = {
            "gain": self.gain,
            "pitch": self.pitch,
            "masterMicGain": self.master_mic_gain,
            "masterVoiceVolume": self.master_voice_volume,
            "masterPitch": self.master_pitch,
            "masterMute": self.master_mute,
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
            "selected_names": {
                "input": self.selected_input_name,
                "input_hostapi": self.selected_input_hostapi,
                "output": self.selected_output_name,
                "output_hostapi": self.selected_output_hostapi,
                "monitor": self.selected_monitor_name,
                "monitor_hostapi": self.selected_monitor_hostapi,
            },
            "recordSelected": sorted(self.record_selected_indexes),
            "voiceFavorites": self.voice_favorites,
            "soundboardFavorites": self.soundboard_favorites,
            "voiceRecents": self.voice_recents,
            "activeVoiceId": self.active_voice_id,
        }
        self.profile_path.write_text(json.dumps(self.profile, ensure_ascii=False, indent=2), encoding="utf-8")

    def refresh_devices(self) -> None:
        self.devices = query_audio_devices()
        
        # Tenta resolver pelos nomes salvos
        input_idx = self.find_device_index(self.selected_input_name, self.selected_input_hostapi, "input")
        if input_idx is not None:
            self.selected_input = input_idx
        elif not self.device_by_index(self.selected_input):
            input_device = choose_input_device(self.devices)
            self.selected_input = input_device.index if input_device else None

        output_idx = self.find_device_index(self.selected_output_name, self.selected_output_hostapi, "output")
        if output_idx is not None:
            self.selected_output = output_idx
        elif not self.device_by_index(self.selected_output):
            output_device = choose_virtual_output_device(self.devices)
            self.selected_output = output_device.index if output_device else None

        monitor_idx = self.find_device_index(self.selected_monitor_name, self.selected_monitor_hostapi, "output")
        if monitor_idx is not None:
            self.selected_monitor = monitor_idx
        elif not self.device_by_index(self.selected_monitor):
            monitor_device = choose_monitor_output_device(self.devices, self.selected_output)
            self.selected_monitor = monitor_device.index if monitor_device else None

        self.update_device_names()
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
            master_mic_gain=self.master_mic_gain,
            master_voice_volume=self.master_voice_volume,
            master_pitch=self.master_pitch,
            master_mute=self.master_mute,
            preferred_sample_rate=self.preferred_sample_rate(),
            preferred_block_size=self.preferred_block_size(),
            input_channels=self.preferred_input_channels(),
        )

    def register_hotkeys(self) -> None:
        try:
            import keyboard
        except Exception as e:
            print("keyboard library not available or error:", e)
            return
            
        with self.lock:
            if hasattr(self, "hotkey_handles"):
                for handle in self.hotkey_handles:
                    try:
                        keyboard.remove_hotkey(handle)
                    except Exception:
                        pass
            self.hotkey_handles = []
            
            for item in self.library.items:
                if not item.shortcut:
                    continue
                hotkey = item.shortcut.strip().lower().replace("control", "ctrl").replace("commandorcontrol", "ctrl").replace("cmdorctrl", "ctrl").replace(" ", "")
                if not hotkey:
                    continue
                try:
                    handle = keyboard.add_hotkey(
                        hotkey, 
                        lambda item_id=item.id: self.play_sound(item_id),
                        suppress=False
                    )
                    self.hotkey_handles.append(handle)
                except Exception as e:
                    print(f"Error registering hotkey {hotkey} for sound {item.name}: {e}")
        self.refresh_time_glitch_hotkey()

    def time_glitch_hotkey_signature(self) -> tuple:
        return (
            bool(self.effects.time_glitch_enabled),
            str(self.effects.time_glitch_trigger_mode or ""),
            str(self.effects.time_glitch_shortcut_mode or ""),
            str(self.settings.get("shortcutCommandGlitch") or self.effects.time_glitch_shortcut or ""),
        )

    def refresh_time_glitch_hotkey(self) -> None:
        try:
            import keyboard
        except Exception as e:
            print("keyboard library not available or error:", e)
            return

        for kind, handle in self.time_glitch_hotkey_handles:
            try:
                if kind == "hotkey":
                    keyboard.remove_hotkey(handle)
                else:
                    keyboard.unhook(handle)
            except Exception:
                pass
        self.time_glitch_hotkey_handles = []
        self.time_glitch_hotkey_down = False
        self.engine.release_time_glitch()

        effects = self.effects
        if not effects.time_glitch_enabled or effects.time_glitch_trigger_mode != "shortcut":
            return

        hotkey = (
            str(self.settings.get("shortcutCommandGlitch") or effects.time_glitch_shortcut or "")
            .strip()
            .lower()
            .replace("control", "ctrl")
            .replace("commandorcontrol", "ctrl")
            .replace("cmdorctrl", "ctrl")
            .replace(" ", "")
        )
        if not hotkey:
            return

        hold_mode = effects.time_glitch_shortcut_mode == "hold"
        registered_signature = self.time_glitch_hotkey_signature()

        def trigger() -> None:
            # Ignore callbacks racing with a refresh or a voice change.
            if self.time_glitch_hotkey_signature() != registered_signature:
                return
            if hold_mode:
                if self.time_glitch_hotkey_down:
                    return
                self.time_glitch_hotkey_down = True
            self.engine.trigger_time_glitch(hold=hold_mode)

        try:
            press_handle = keyboard.add_hotkey(hotkey, trigger, suppress=False)
            self.time_glitch_hotkey_handles.append(("hotkey", press_handle))
            if hold_mode:
                release_key = hotkey.split("+")[-1]

                def release(_event) -> None:
                    self.time_glitch_hotkey_down = False
                    self.engine.release_time_glitch()

                release_handle = keyboard.on_release_key(release_key, release, suppress=False)
                self.time_glitch_hotkey_handles.append(("hook", release_handle))
        except Exception as e:
            print(f"Error registering command glitch hotkey {hotkey}: {e}")
            for kind, handle in self.time_glitch_hotkey_handles:
                try:
                    if kind == "hotkey":
                        keyboard.remove_hotkey(handle)
                    else:
                        keyboard.unhook(handle)
                except Exception:
                    pass
            self.time_glitch_hotkey_handles = []

    def start(self) -> None:
        self.monitor_only_active = False
        self.engine.start(self.config())
        self.status = f"Processando em {self.engine.sample_rate} Hz"

    def stop(self) -> None:
        self.engine.stop()
        self.monitor_only_active = False
        self.status = "Processamento desligado"

    def shutdown_resources(self) -> None:
        with self.lock:
            if self._shutdown_started:
                return
            self._shutdown_started = True

        self.cancel_youtube_import()
        if self.pc_recorder.running:
            self.pc_recorder.stop(discard=True)
        self.combo_recording = False
        self.clipping_manager.stop_capture()
        self.stop()
        self.restore_microphone_safety()

        try:
            import keyboard

            for handle in self.hotkey_handles:
                try:
                    keyboard.remove_hotkey(handle)
                except Exception:
                    pass
            for kind, handle in self.time_glitch_hotkey_handles:
                try:
                    if kind == "hotkey":
                        keyboard.remove_hotkey(handle)
                    else:
                        keyboard.unhook(handle)
                except Exception:
                    pass
        except Exception:
            pass
        self.hotkey_handles = []
        self.time_glitch_hotkey_handles = []
        self.playback_executor.shutdown(wait=False, cancel_futures=True)

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
                preferred_sample_rate=self.preferred_sample_rate(),
                preferred_block_size=self.preferred_block_size(),
                input_channels=self.preferred_input_channels(),
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
            restored = restore_default_capture_ids(self.saved_capture_defaults)
            if restored:
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
        self.restore_microphone_safety()
        self.virtual_mode_active = False

    def restore_microphone_safety(self) -> bool:
        restore_mic = bool(self.settings.get("restoreOnDisable", True))
        default_mic = str(self.settings.get("defaultMicOnClose", "restore"))
        restored = not restore_mic or default_mic == "keep"
        if restore_mic:
            if default_mic == "restore" or default_mic == "choose":
                restored = restore_default_capture_ids(self.saved_capture_defaults)
            elif default_mic == "keep":
                restored = True
            else:
                try:
                    from .windows_audio import set_default_capture_id
                    set_default_capture_id(default_mic)
                    restored = True
                except Exception as e:
                    print("Erro ao restaurar o microfone selecionado no encerramento:", e)
                    restored = restore_default_capture_ids(self.saved_capture_defaults)
        if restored:
            self.saved_capture_defaults = {}
            if self.saved_capture_defaults_path.exists():
                try:
                    self.saved_capture_defaults_path.unlink(missing_ok=True)
                except Exception:
                    pass
        else:
            print("Falha ao confirmar restauracao; arquivo de seguranca preservado.", flush=True)
        return restored

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
            cached = self.sound_cache.pop(item.id, None)
            if cached and cached[0] == stamp and cached[1] == sr:
                self.sound_cache[item.id] = cached
                return cached[2]
            if cached:
                self.sound_cache_bytes = max(0, self.sound_cache_bytes - int(cached[2].nbytes))
        audio = load_audio_mono(item.path, sr)
        if audio.nbytes <= self.sound_cache_limit_bytes:
            with self.lock:
                while self.sound_cache and self.sound_cache_bytes + audio.nbytes > self.sound_cache_limit_bytes:
                    _old_id, old_cached = next(iter(self.sound_cache.items()))
                    self.sound_cache.pop(_old_id, None)
                    self.sound_cache_bytes = max(0, self.sound_cache_bytes - int(old_cached[2].nbytes))
                self.sound_cache[item.id] = (stamp, sr, audio)
                self.sound_cache_bytes += int(audio.nbytes)
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
            output_route=route,
            initial_volume=max(0.0, min(1.0, float(self.settings.get("onlinePreviewVolume", "0.25"))))
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
        max_vol = float(self.settings.get("maxSoundVolume", "1.0"))
        effective_volume = min(float(item.volume), max_vol)
        rendered = render_sound_for_playback(
            source,
            effective_volume,
            item.pitch_semitones,
            item.repeats,
            pitch_mode=item.pitch_mode,
            speed=item.speed,
            normalize=item.normalize,
            fade_in_ms=item.fade_in_ms,
            fade_out_ms=item.fade_out_ms,
            sample_rate=self.engine.sample_rate,
        )
        max_playback_frames = max(1, int(self.engine.sample_rate * 60 * 6))
        if rendered.size > max_playback_frames:
            rendered = rendered[:max_playback_frames].copy()
            with self.lock:
                self.status = "Áudio limitado a 6 minutos para proteger a memória do sistema."
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
            initial_volume=effective_volume,
            initial_speed=item.speed,
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
        
        name_val = data.get("name")
        if name_val is not None:
            name_val = str(name_val).strip()
        if not name_val:
            name_val = item.name

        category_val = data.get("category")
        if category_val is not None:
            category_val = str(category_val).strip()
        if not category_val:
            category_val = item.category

        saved = self.library.save_edited(
            item.id,
            replace=replace,
            name=name_val,
            category=category_val,
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
        tabs = self.resolve_import_tabs(["Todos", "Gravacoes"], "recording")
        return self.library.add_file(
            str(path),
            category="Gravacoes",
            name=name or Path(path).stem,
            color="#49e2d1",
            tabs=tabs,
            source_kind="recording",
        )

    def calculate_total_storage(self) -> int:
        now = time.monotonic()
        cached_at, cached_total = getattr(self, "_storage_cache", (0.0, 0))
        if now - cached_at < 10.0:
            return cached_total
        total = 0
        try:
            if self.library.sounds_dir.exists():
                for f in self.library.sounds_dir.rglob("*"):
                    if f.is_file():
                        total += f.stat().st_size
            recordings_dir = self.library.base_dir / "recordings"
            if recordings_dir.exists():
                for f in recordings_dir.rglob("*"):
                    if f.is_file():
                        total += f.stat().st_size
        except Exception:
            pass
        self._storage_cache = (now, total)
        return total

    def runtime_snapshot(self) -> dict:
        return {
            "status": self.status,
            "running": self.engine.running,
            "monitorOnly": self.monitor_only_active,
            "sampleRate": self.engine.sample_rate,
            "blockSize": self.engine.block_size,
            "level": self.engine.last_level,
            "lastError": self.engine.last_error,
            "lastCallbackStatus": self.engine.last_callback_status,
            "youtubeStatus": self.youtube_status,
            "clipStats": self.clipping_manager.stats(),
            "virtualMode": self.virtual_mode_active,
            "controls": {
                "gain": self.gain,
                "pitch": self.pitch,
                "masterMicGain": self.master_mic_gain,
                "masterVoiceVolume": self.master_voice_volume,
                "masterPitch": self.master_pitch,
                "masterMute": self.master_mute,
                "monitor": self.monitor_enabled,
                "monitorVolume": self.monitor_volume,
                "soundboardMonitor": self.soundboard_monitor_enabled,
                "soundboardMonitorVolume": self.soundboard_monitor_volume,
                "effects": asdict(self.effects),
            },
            "player": self.engine.player_state(),
            "players": self.engine.player_states(),
            "recording": {
                "voice": self.engine.recording,
                "pc": self.pc_recorder.running,
                "combo": self.combo_recording,
            },
            "settings": dict(self.settings),
            "activeVoiceId": self.active_voice_id,
            "libraryRevision": self.library_revision(),
            "diagnostics": {
                "pid": os.getpid(),
                "threads": threading.active_count(),
                "soundCacheMb": round(self.sound_cache_bytes / (1024 * 1024), 2),
                "soundCacheLimitMb": round(self.sound_cache_limit_bytes / (1024 * 1024), 2),
                "activePlaybacks": len(self.engine.player_states()),
            },
        }

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
            "blockSize": self.engine.block_size,
            "level": self.engine.last_level,
            "lastError": self.engine.last_error,
            "lastCallbackStatus": self.engine.last_callback_status,
            "route": route,
            "storageUsed": self.calculate_total_storage(),
            "youtubeStatus": self.youtube_status,
            "audioConfig": {
                "preferredSampleRate": self.settings.get("audioSampleRate", "auto"),
                "preferredBlockSize": self.settings.get("audioBufferSize", "1024"),
                "inputChannels": self.settings.get("inputChannels", "mono"),
            },
            "clipStats": self.clipping_manager.stats(),
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
                "masterMicGain": self.master_mic_gain,
                "masterVoiceVolume": self.master_voice_volume,
                "masterPitch": self.master_pitch,
                "masterMute": self.master_mute,
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
                {
                    **asdict(item),
                    "plays": item.play_count,
                    "duration": self.cached_audio_duration(item.path),
                    "coverUrl": self.cover_http_url(item),
                    "hasOriginal": (self.library.sounds_dir / f"{item.id}.original.wav").exists(),
                    "isClip": Path(item.path).name.startswith("clip_") and (
                        (Path(item.path).parent / f"{Path(item.path).stem}.voice.wav").exists() or
                        (Path(item.path).parent / f"{Path(item.path).stem}.pc.wav").exists()
                    ),
                    "clipVoiceEnabled": not (Path(item.path).parent / f"{Path(item.path).stem}.voice.disabled").exists() if Path(item.path).name.startswith("clip_") else True,
                    "clipPcEnabled": not (Path(item.path).parent / f"{Path(item.path).stem}.pc.disabled").exists() if Path(item.path).name.startswith("clip_") else True,
                }
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
            "windowsCaptureEndpoints": list(self.windows_capture_endpoints),
            "customVoices": self.custom_voices,
            "customVoiceCategories": self.custom_categories.get("voices", []),
            "customSoundCategories": self.custom_categories.get("soundboard", []),
            "themeSettings": self.theme_settings,
            "trash": self.trash_bin,
            "voiceFavorites": self.voice_favorites,
            "soundboardFavorites": self.soundboard_favorites,
            "voiceRecents": self.voice_recents,
            "activeVoiceId": self.active_voice_id,
            "libraryRevision": self.library_revision(),
        }

    def library_revision(self) -> int:
        try:
            return self.library.index_path.stat().st_mtime_ns
        except OSError:
            return 0

    def cover_http_url(self, item: SoundItem) -> str:
        if not item.cover_path:
            return ""
        try:
            stamp = Path(item.cover_path).stat().st_mtime_ns
        except OSError:
            return ""
        return f"http://127.0.0.1:{self.api_port}/api/covers/{item.id}?v={stamp}"

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


STATE = None if "--youtube-worker" in sys.argv else AppState()


def emergency_restore_microphone() -> None:
    state = globals().get("STATE")
    if state is None:
        return
    try:
        state.deactivate_virtual()
    except Exception as exc:
        print("Falha na restauracao emergencial do microfone:", exc, flush=True)


def install_microphone_safety_handlers() -> None:
    atexit.register(emergency_restore_microphone)

    def signal_handler(signum, _frame):
        emergency_restore_microphone()
        raise SystemExit(128 + int(signum))

    for sig_name in ("SIGINT", "SIGTERM", "SIGBREAK"):
        sig = getattr(signal, sig_name, None)
        if sig is not None:
            try:
                signal.signal(sig, signal_handler)
            except Exception:
                pass

    if sys.platform.startswith("win"):
        try:
            import ctypes

            HandlerRoutine = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_uint)

            def console_handler(_event):
                emergency_restore_microphone()
                return False

            globals()["_MICFUDIDDO_CONSOLE_HANDLER"] = HandlerRoutine(console_handler)
            ctypes.windll.kernel32.SetConsoleCtrlHandler(globals()["_MICFUDIDDO_CONSOLE_HANDLER"], True)
        except Exception as exc:
            print("Nao foi possivel registrar handler de encerramento do Windows:", exc, flush=True)


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
            if path == "/api/runtime":
                with STATE.lock:
                    self._json(STATE.runtime_snapshot())
                return
            if path == "/api/hotkeys":
                with STATE.lock:
                    self._json({"settings": dict(STATE.settings)})
                return
            if path.startswith("/api/covers/"):
                item_id = unquote(path.removeprefix("/api/covers/"))
                item = STATE.library.by_id(item_id)
                cover_path = Path(item.cover_path) if item and item.cover_path else None
                if not cover_path or not cover_path.is_file():
                    self._empty(404)
                    return
                body = cover_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", mimetypes.guess_type(cover_path.name)[0] or "application/octet-stream")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "public, max-age=31536000, immutable")
                self._cors()
                self.end_headers()
                self.wfile.write(body)
                return
            if path == "/api/health":
                self._json({"ok": True, "time": time.time()})
                return
            if path == "/api/level":
                self._json({"level": STATE.engine.last_level if STATE.engine else 0.0})
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
            if path in ("/api/state", "/api/runtime", "/api/hotkeys", "/api/health", "/api/sounds/trending", "/api/sounds/search", "/api/level"):
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
                "/api/sounds/import-youtube",
                "/api/sounds/export-mfsound",
                "/api/sounds/import-mfsound"
            }
            if path in slow_paths:
                with com_initialized():
                    result = self._route_post(path, data)
            else:
                with STATE.lock:
                    with com_initialized():
                        result = self._route_post(path, data)
            self._json(result if result is not None else STATE.runtime_snapshot())
        except Exception as exc:
            self._json({"error": str(exc)}, 500)

    def _route_post(self, path: str, data: dict):
        if path == "/api/devices/refresh":
            STATE.refresh_devices()
            STATE.refresh_record_devices()
            return None
        if path == "/api/selection":
            selected = data.get("selected", data)
            was_running = STATE.engine.running
            was_monitor_only = STATE.monitor_only_active
            if was_running or was_monitor_only:
                STATE.stop()
            if "input" in selected:
                STATE.selected_input = _optional_int(selected.get("input"), STATE.selected_input)
            if "output" in selected:
                STATE.selected_output = _optional_int(selected.get("output"), STATE.selected_output)
            if "monitor" in selected:
                STATE.selected_monitor = _optional_int(selected.get("monitor"), STATE.selected_monitor)
            STATE.update_device_names()
            STATE.save_profile()
            if was_running:
                try:
                    STATE.start()
                except Exception as e:
                    STATE.status = f"Erro ao reiniciar: {e}"
            elif was_monitor_only:
                try:
                    STATE.start_monitor_only()
                except Exception as e:
                    STATE.status = f"Erro ao reiniciar monitoramento: {e}"
            return None
        if path == "/api/controls":
            controls = data.get("controls", data)
            previous_time_glitch_hotkey = STATE.time_glitch_hotkey_signature()
            STATE.gain = max(0.0, float(controls.get("gain", STATE.gain)))
            STATE.pitch = float(controls.get("pitch", STATE.pitch))
            STATE.master_mic_gain = max(0.0, float(controls.get("masterMicGain", STATE.master_mic_gain)))
            STATE.master_voice_volume = max(0.0, float(controls.get("masterVoiceVolume", STATE.master_voice_volume)))
            STATE.master_pitch = float(controls.get("masterPitch", STATE.master_pitch))
            STATE.master_mute = bool(controls.get("masterMute", STATE.master_mute))
            STATE.monitor_enabled = bool(controls.get("monitor", STATE.monitor_enabled))
            STATE.monitor_volume = max(0.0, min(3.0, float(controls.get("monitorVolume", STATE.monitor_volume))))
            STATE.soundboard_monitor_enabled = bool(controls.get("soundboardMonitor", STATE.soundboard_monitor_enabled))
            STATE.soundboard_monitor_volume = max(0.0, min(3.0, float(controls.get("soundboardMonitorVolume", STATE.soundboard_monitor_volume))))
            effects = controls.get("effects")
            if effects:
                STATE.effects = EffectsSettings(**{**asdict(STATE.effects), **effects})
            if STATE.time_glitch_hotkey_signature() != previous_time_glitch_hotkey:
                STATE.refresh_time_glitch_hotkey()
            if STATE.monitor_only_active:
                if STATE.monitor_enabled or STATE.soundboard_monitor_enabled:
                    STATE.engine.set_controls(
                        1.0,
                        0.0,
                        EffectsSettings(),
                        monitor_volume=STATE.monitor_volume,
                        soundboard_monitor_enabled=STATE.soundboard_monitor_enabled,
                        soundboard_monitor_volume=STATE.soundboard_monitor_volume,
                        master_mic_gain=STATE.master_mic_gain,
                        master_voice_volume=STATE.master_voice_volume,
                        master_pitch=STATE.master_pitch,
                        master_mute=STATE.master_mute,
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
                    master_mic_gain=STATE.master_mic_gain,
                    master_voice_volume=STATE.master_voice_volume,
                    master_pitch=STATE.master_pitch,
                    master_mute=STATE.master_mute,
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
        if path == "/api/sounds/export-mfsound":
            sound_id = str(data["id"])
            export_path = str(data["exportPath"])
            result_path = STATE.library.export_mfsound(sound_id, export_path)
            with STATE.lock:
                STATE.status = f"Som exportado: {Path(result_path).name}"
            return {"ok": True, "path": result_path}
        if path == "/api/sounds/import-mfsound":
            archive_path = str(data["path"])
            item = STATE.library.import_mfsound(archive_path)
            if data.get("tabs"):
                item.tabs = STATE.resolve_import_tabs(data.get("tabs"), "local")
                STATE.library.update(item)
            with STATE.lock:
                STATE.status = f"Som importado: {item.name}"
            return {"ok": True, "soundId": item.id}
            
        if path == "/api/sounds/waveform":
            item_id = str(data["id"])
            item = STATE.library.by_id(item_id)
            if not item:
                raise RuntimeError("Som não encontrado.")
            
            import soundfile as sf
            import numpy as np
            
            audio_path = item.path
            original_backup = STATE.library.sounds_dir / f"{item.id}.original.wav"
            if original_backup.exists():
                audio_path = str(original_backup)
            
            try:
                data_audio, sr = sf.read(audio_path, dtype="float32", always_2d=True)
                if data_audio.size == 0:
                    return {"peaks": []}
                mono = data_audio.mean(axis=1)
                
                num_peaks = 300
                chunk_size = max(1, len(mono) // num_peaks)
                peaks = []
                for i in range(num_peaks):
                    chunk = mono[i * chunk_size : (i+1) * chunk_size]
                    if len(chunk) > 0:
                        peaks.append(float(np.max(np.abs(chunk))))
                    else:
                        peaks.append(0.0)
                
                max_peak = max(peaks) if peaks else 1.0
                if max_peak > 0:
                    peaks = [p / max_peak for p in peaks]
                    
                return {"peaks": peaks, "duration": len(mono) / sr}
            except Exception as e:
                raise RuntimeError(f"Erro ao extrair waveform: {e}")

        if path == "/api/sounds/share-cloud":
            sound_id = str(data["id"])
            import tempfile
            from pathlib import Path
            import urllib.request
            import urllib.error
            import uuid
            
            with tempfile.TemporaryDirectory() as tmp:
                export_path = str(Path(tmp) / f"export_{uuid.uuid4().hex}.mfsound")
                result_path = STATE.library.export_mfsound(sound_id, export_path)
                
                boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
                body = []
                body.append(f"--{boundary}")
                body.append('Content-Disposition: form-data; name="reqtype"')
                body.append('')
                body.append('fileupload')
                body.append(f"--{boundary}")
                body.append('Content-Disposition: form-data; name="fileToUpload"; filename="sound.mfsound"')
                body.append('Content-Type: application/octet-stream')
                body.append('')
                
                body_bytes = b"\r\n".join([s.encode("utf-8") for s in body]) + b"\r\n"
                with open(result_path, "rb") as f:
                    body_bytes += f.read() + b"\r\n"
                body_bytes += f"--{boundary}--\r\n".encode("utf-8")
                
                req = urllib.request.Request("https://catbox.moe/user/api.php", data=body_bytes)
                req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
                req.add_header("User-Agent", "Mozilla/5.0")
                
                try:
                    with urllib.request.urlopen(req, timeout=30) as response:
                        link = response.read().decode("utf-8").strip()
                        return {"ok": True, "link": link}
                except urllib.error.URLError as e:
                    raise RuntimeError(f"Falha ao enviar para nuvem: {e}")

        if path == "/api/sounds/import-cloud":
            url = str(data["url"]).strip()
            
            def bg_cloud_import():
                import tempfile
                import urllib.request
                from pathlib import Path
                
                STATE.youtube_status = "Iniciando download da nuvem..."
                with tempfile.TemporaryDirectory() as tmp:
                    temp_path = Path(tmp) / "download.mfsound"
                    headers = {"User-Agent": "Mozilla/5.0"}
                    req = urllib.request.Request(url, headers=headers)
                    try:
                        STATE.youtube_status = "Baixando pacote da nuvem..."
                        STATE.youtube_cancel = False
                        with urllib.request.urlopen(req, timeout=60) as response, open(temp_path, "wb") as out_file:
                            while True:
                                if getattr(STATE, "youtube_cancel", False):
                                    STATE.youtube_status = "Importacao cancelada."
                                    return
                                chunk = response.read(65536)
                                if not chunk:
                                    break
                                out_file.write(chunk)
                        
                        item = STATE.library.import_mfsound(str(temp_path))
                        STATE.register_hotkeys()
                        with STATE.lock:
                            STATE.status = f"Som importado da nuvem: {item.name}"
                        STATE.youtube_status = f"Concluido: '{item.name}' importado!"
                    except Exception as e:
                        STATE.youtube_status = f"Erro: Falha ao baixar pacote ({e})"
            
            threading.Thread(target=bg_cloud_import, daemon=True).start()
            return {"ok": True, "message": "Importação em andamento"}
            
        if path == "/api/sounds/add":
            paths = data.get("paths", [])
            tabs = STATE.resolve_import_tabs(data.get("tabs"), "local")
            def bg_add():
                added = 0
                for file_path in paths:
                    try:
                        STATE.library.add_file(file_path, tabs=tabs, source_kind="local")
                        added += 1
                    except Exception as e:
                        print("Error adding file:", e)
                with STATE.lock:
                    STATE.status = f"{added} som(ns) importado(s)" if added else STATE.status
                    STATE.register_hotkeys()
            threading.Thread(target=bg_add, daemon=True).start()
            STATE.status = "Importando sons..."
            return None

        if path == "/api/tts/voices":
            return {
                "voices": [
                    {"id": "pt-BR-FranciscaNeural", "name": "Francisca (Feminina - BR)", "lang": "pt-BR"},
                    {"id": "pt-BR-AntonioNeural", "name": "Antonio (Masculina - BR)", "lang": "pt-BR"},
                    {"id": "en-US-AriaNeural", "name": "Aria (Feminina - US)", "lang": "en-US"},
                    {"id": "en-US-GuyNeural", "name": "Guy (Masculina - US)", "lang": "en-US"},
                    {"id": "es-ES-ElviraNeural", "name": "Elvira (Feminina - ES)", "lang": "es-ES"},
                    {"id": "es-MX-JorgeNeural", "name": "Jorge (Masculina - MX)", "lang": "es-MX"},
                    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Feminina - JP)", "lang": "ja-JP"},
                    {"id": "ja-JP-KeitaNeural", "name": "Keita (Masculina - JP)", "lang": "ja-JP"},
                    {"id": "de-DE-KatjaNeural", "name": "Katja (Feminina - DE)", "lang": "de-DE"},
                    {"id": "de-DE-ConradNeural", "name": "Conrad (Masculina - DE)", "lang": "de-DE"}
                ]
            }

        if path == "/api/tts/speak":
            text = data.get("text", "").strip()
            voice = data.get("voice", "pt-BR-FranciscaNeural")
            rate = data.get("rate", "+0%")
            if not text:
                raise RuntimeError("Texto vazio.")
            import asyncio
            sr = STATE.engine.sample_rate or 48000
            try:
                audio = asyncio.run(synthesize_tts_text_to_audio(text, voice, rate, sr, STATE.online_cache_dir))
            except Exception as e:
                raise RuntimeError(f"Erro na sintese de voz: {e}")
            route = str(STATE.settings.get("onlinePlaybackRoute", "both")).strip().lower()
            tts_volume = float(STATE.settings.get("ttsVolume", 100)) / 100.0
            rendered = render_sound_for_playback(
                audio,
                volume=tts_volume,
                pitch_semitones=0.0,
                repeats=1,
                sample_rate=sr
            )
            with STATE.lock:
                for p in list(STATE.engine._playbacks):
                    if p.sound_id == "tts_preview":
                        STATE.engine.stop_sound(playback_id=p.playback_id)
            STATE.engine.play_sound(
                rendered,
                block_voice=False,
                mute_others=False,
                sound_id="tts_preview",
                name="TTS Preview",
                replace=True,
                loop=False,
                output_route=route
            )
            return {"ok": True}

        if path == "/api/tts/save":
            text = data.get("text", "").strip()
            voice = data.get("voice", "pt-BR-FranciscaNeural")
            rate = data.get("rate", "+0%")
            name = data.get("name", "").strip()
            if not text:
                raise RuntimeError("Texto vazio.")
            if not name:
                name = text[:20] + "..." if len(text) > 20 else text
            import asyncio
            import uuid
            filename = f"tts_{uuid.uuid4().hex}.wav"
            dest_path = STATE.library.sounds_dir / filename
            try:
                audio = asyncio.run(synthesize_tts_text_to_audio(text, voice, rate, 48000, STATE.online_cache_dir))
            except Exception as e:
                raise RuntimeError(f"Erro na sintese de voz: {e}")
            import soundfile as sf
            try:
                sr = 48000
                tts_volume = float(STATE.settings.get("ttsVolume", 100)) / 100.0
                if abs(tts_volume - 1.0) > 0.01:
                    audio = audio * tts_volume
                sf.write(str(dest_path), audio, sr, format="WAV", subtype="PCM_16")
            except Exception as e:
                raise RuntimeError(f"Erro ao salvar audio gerado: {e}")
            tabs = STATE.resolve_import_tabs(data.get("tabs"), "tts")
            item = STATE.library.add_file(str(dest_path), name=name, category="TTS", tabs=tabs, source_kind="tts")
            STATE.save_profile()
            STATE.register_hotkeys()
            return {"ok": True, "sound": asdict(item)}

        if path == "/api/sounds/import-youtube":
            STATE.start_youtube_import(data.get("url"), data.get("tabs"))
            return {"status": "started"}

        if path == "/api/sounds/import-youtube/cancel":
            STATE.cancel_youtube_import()
            return {"status": "cancelled"}

        if path == "/api/sounds/download":
            url = data.get("url")
            name = data.get("name")
            category = data.get("category", "Online")
            color = data.get("color")
            tabs = STATE.resolve_import_tabs(data.get("tabs"), "online")
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
                item = STATE.library.add_file(str(cached_file), category=category, name=name, color=color, tabs=tabs, source_kind="online", source_url=str(url))
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
                item = STATE.library.add_file(str(temp_path), category=category, name=name, color=color, tabs=tabs, source_kind="online", source_url=str(url))
                try:
                    temp_path.unlink(missing_ok=True)
                except OSError:
                    pass
                STATE.status = f"Som '{item.name}' baixado com sucesso!"
            STATE.register_hotkeys()
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

            STATE.playback_executor.submit(run_play_online)
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
            tabs = STATE.resolve_import_tabs(data.get("tabs"), "local")
            def bg_add_folder():
                added = 0
                for folder_path in paths:
                    try:
                        new_items = STATE.library.add_folder(folder_path)
                        for item in new_items:
                            item.tabs = tabs
                            STATE.library.update(item)
                        added += len(new_items)
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

            STATE.playback_executor.submit(run_play)
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

            STATE.playback_executor.submit(run_random)
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
                STATE.trash_bin.append(removed)
                STATE.save_trash_bin()
                STATE.status = "Som movido para a Lixeira"
                STATE.register_hotkeys()
            return {"removed": [removed] if removed else [], **STATE.snapshot()}
        if path == "/api/sounds/delete-batch":
            ids = [str(value) for value in data.get("ids", [])]
            removed = STATE.library.detach_many(ids)
            for item_id in ids:
                STATE.engine.stop_sound(sound_id=item_id)
            if removed:
                STATE.trash_bin.extend(removed)
                STATE.save_trash_bin()
                STATE.status = f"{len(removed)} som(ns) movido(s) para a Lixeira"
                STATE.register_hotkeys()
            return {"removed": removed, **STATE.snapshot()}
        if path == "/api/sounds/restore":
            items_to_restore = data.get("items", [])
            restored = STATE.library.restore_items(items_to_restore)
            restored_ids = {item.id for item in restored}
            STATE.trash_bin = [t for t in STATE.trash_bin if t.get("id") not in restored_ids]
            STATE.save_trash_bin()
            STATE.status = f"{len(restored)} som(ns) restaurado(s)"
            STATE.register_hotkeys()
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

            STATE.playback_executor.submit(run_preview)
            return {"queued": True, "status": STATE.status, "running": STATE.engine.running}
        if path == "/api/sounds/save-edited":
            item = STATE.save_sound_edit(data, replace=bool(data.get("replace", False)))
            handle_clip_remix_payload(item, data)
            STATE.register_hotkeys()
            return {"soundId": item.id, **STATE.snapshot()}
        if path == "/api/sounds/restore-original":
            item_id = str(data["id"])
            item = STATE.library.restore_original(item_id)
            STATE.status = f"Som restaurado para o original: {item.name}"
            return STATE.snapshot()
        if path == "/api/sounds/update":
            item = STATE.library.by_id(str(data["id"]))
            if item is None:
                raise RuntimeError("Som nao encontrado.")
            handle_clip_remix_payload(item, data)
            for key in (
                "name",
                "category",
                "tabs",
                "source",
                "source_url",
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
            if "tabs" in data:
                item.tabs = STATE.resolve_import_tabs(data.get("tabs"), str(getattr(item, "source", "local") or "local"))
            item.color = _sanitize_color(item.color)
            item.volume = max(0.0, float(item.volume))
            item.speed = max(0.25, min(4.0, float(item.speed)))
            item.fade_in_ms = max(0.0, min(5000.0, float(item.fade_in_ms)))
            item.fade_out_ms = max(0.0, min(5000.0, float(item.fade_out_ms)))
            item.repeats = max(1, min(20, int(round(float(item.repeats)))))
            item.loop = bool(item.loop)
            if "loop" in data or "volume" in data or "speed" in data:
                with STATE.engine._playback_lock:
                    for pb in STATE.engine._playbacks:
                        if pb.sound_id == item.id:
                            if "loop" in data:
                                pb.loop = bool(data["loop"])
                            if "volume" in data:
                                max_vol = float(STATE.settings.get("maxSoundVolume", "1.0"))
                                target_volume = min(float(data["volume"]), max_vol)
                                init_vol = getattr(pb, "initial_volume", 1.0) or 1.0
                                if abs(init_vol) < 1e-4:
                                    init_vol = 1.0
                                pb.volume_override = target_volume / init_vol
                            if "speed" in data:
                                init_speed = getattr(pb, "initial_speed", 1.0) or 1.0
                                if abs(init_speed) < 1e-4:
                                    init_speed = 1.0
                                pb.speed_override = float(data["speed"]) / init_speed
            item.normalize = bool(item.normalize)
            item.block_voice = bool(item.block_voice)
            item.stop_other_sounds = bool(item.stop_other_sounds)
            item.mute_other_sounds = bool(item.mute_other_sounds)
            item.output_route = str(item.output_route or "both")
            STATE.library._sanitize_item(item)
            STATE.library.update(item)
            STATE.register_hotkeys()
            return STATE.snapshot()
        if path == "/api/sounds/remove-from-tab":
            item = STATE.library.remove_from_tab(str(data["id"]), str(data.get("tab") or ""))
            if item:
                STATE.status = f"Som removido da aba {data.get('tab')}"
            return STATE.snapshot()
        if path == "/api/sounds/set-tabs":
            item = STATE.library.set_tabs(str(data["id"]), data.get("tabs", []))
            STATE.status = f"Abas atualizadas: {item.name}"
            return STATE.snapshot()
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
        if path == "/api/record/clip":
            duration = int(data.get("duration", 30))
            res = STATE.clipping_manager.save_clip(duration)
            if not res:
                raise RuntimeError("Não foi possível gerar o clipe (o buffer de áudio está vazio ou o clipping está desativado).")
            return {**res, **STATE.snapshot()}
        if path == "/api/custom-voices/save":
            voice = data.get("voice")
            if not voice or not isinstance(voice, dict):
                raise RuntimeError("Dados de voz inválidos.")
            voice_id = voice.get("id")
            if not voice_id:
                voice_id = f"custom_{int(time.time() * 1000)}"
                voice["id"] = voice_id
            
            idx = -1
            for i, v in enumerate(STATE.custom_voices):
                if v.get("id") == voice_id:
                    idx = i
                    break
            if idx != -1:
                STATE.custom_voices[idx] = voice
            else:
                STATE.custom_voices.append(voice)
            STATE.save_custom_voices()
            STATE.status = f"Voz '{voice.get('label')}' salva com sucesso."
            return STATE.snapshot()

        if path == "/api/custom-voices/delete":
            voice_id = data.get("id")
            if not voice_id:
                raise RuntimeError("ID da voz ausente.")
            initial_len = len(STATE.custom_voices)
            STATE.custom_voices = [v for v in STATE.custom_voices if v.get("id") != voice_id]
            if len(STATE.custom_voices) < initial_len:
                STATE.voice_favorites = [f for f in STATE.voice_favorites if f != voice_id]
                STATE.voice_recents = [r for r in STATE.voice_recents if r != voice_id]
                if STATE.active_voice_id == voice_id:
                    STATE.active_voice_id = "clean"
                STATE.save_custom_voices()
                STATE.save_profile()
                STATE.status = "Voz customizada removida."
            else:
                STATE.status = "Voz não encontrada."
            return STATE.snapshot()

        if path == "/api/custom-categories/save":
            cat_type = data.get("type")
            categories = data.get("categories")
            if cat_type not in ("voices", "soundboard") or not isinstance(categories, list):
                raise RuntimeError("Dados inválidos.")
            clean_categories = []
            seen_categories = set()
            for category_name in categories:
                clean_category = str(category_name).strip()
                category_key = clean_category.casefold()
                if clean_category and category_key not in seen_categories and category_key not in {"todos", "favoritos"}:
                    clean_categories.append(clean_category)
                    seen_categories.add(category_key)
            STATE.custom_categories[cat_type] = clean_categories
            STATE.save_custom_categories()
            STATE.status = "Categorias atualizadas."
            return STATE.snapshot()

        if path == "/api/custom-categories/delete":
            cat_type = data.get("type")
            category = data.get("category")
            destination = data.get("destination", "Geral")
            if cat_type not in ("voices", "soundboard") or not category:
                raise RuntimeError("Dados inválidos.")
            
            if category in STATE.custom_categories.get(cat_type, []):
                STATE.custom_categories[cat_type].remove(category)
                STATE.save_custom_categories()
            
            if cat_type == "soundboard":
                modified = 0
                for item in STATE.library.items:
                    changed = False
                    if item.category == category:
                        item.category = destination
                        changed = True
                    if category in item.tabs:
                        item.tabs = [tab for tab in item.tabs if tab != category]
                        changed = True
                    if changed:
                        modified += 1
                if modified:
                    STATE.library.save()
                STATE.status = f"Aba '{category}' removida de {modified} som(ns)."
            else:
                modified = 0
                for voice in STATE.custom_voices:
                    if voice.get("category") == category:
                        voice["category"] = "Customizadas"
                        modified += 1
                if modified:
                    STATE.save_custom_voices()
                STATE.status = f"Categoria de voz '{category}' removida. {modified} voz(es) movida(s) para 'Customizadas'."
            return STATE.snapshot()

        if path == "/api/theme-settings/save":
            settings = data.get("settings")
            if not isinstance(settings, dict):
                raise RuntimeError("Configurações inválidas.")
            STATE.theme_settings.update(settings)
            STATE.save_theme_settings()
            STATE.status = "Tema visual atualizado."
            return STATE.snapshot()

        if path == "/api/migration/import":
            custom_v = data.get("customVoices")
            voice_fav = data.get("voiceFavorites")
            sound_fav = data.get("soundboardFavorites")
            custom_cats = data.get("customCategories")
            custom_v_cats = data.get("customVoiceCategories")
            theme_s = data.get("themeSettings")
            
            if isinstance(custom_v, list):
                existing_ids = {v.get("id") for v in STATE.custom_voices}
                for cv in custom_v:
                    if isinstance(cv, dict) and cv.get("id") and cv.get("id") not in existing_ids:
                        STATE.custom_voices.append(cv)
                STATE.save_custom_voices()
                
            if isinstance(custom_cats, list):
                for c in custom_cats:
                    if c not in STATE.custom_categories["soundboard"]:
                        STATE.custom_categories["soundboard"].append(c)
            if isinstance(custom_v_cats, list):
                for c in custom_v_cats:
                    if c not in STATE.custom_categories["voices"]:
                        STATE.custom_categories["voices"].append(c)
            STATE.save_custom_categories()
            
            if isinstance(theme_s, dict):
                STATE.theme_settings.update(theme_s)
                STATE.save_theme_settings()
                
            if isinstance(voice_fav, list):
                STATE.voice_favorites = list(set(STATE.voice_favorites + voice_fav))
            if isinstance(sound_fav, list):
                STATE.soundboard_favorites = list(set(STATE.soundboard_favorites + sound_fav))
            STATE.save_profile()
            
            STATE.status = "Migração de dados concluída!"
            return STATE.snapshot()

        if path == "/api/sounds/move-batch":
            ids = data.get("ids", [])
            category = data.get("category", "Geral")
            if not isinstance(ids, list):
                raise RuntimeError("IDs inválidos.")
            modified = 0
            for item_id in ids:
                item = STATE.library.by_id(item_id)
                if item:
                    item.category = category
                    STATE.library.update(item)
                    modified += 1
            if modified:
                STATE.library.save()
            STATE.status = f"{modified} som(ns) movidos para '{category}'."
            return STATE.snapshot()

        if path == "/api/sounds/deduplicate":
            seen_paths = {}
            to_remove = []
            for item in STATE.library.items:
                path_str = str(item.path)
                if path_str in seen_paths:
                    to_remove.append(item.id)
                else:
                    seen_paths[path_str] = item.id
            if to_remove:
                removed = STATE.library.detach_many(to_remove)
                STATE.status = f"Removidos {len(removed)} sons duplicados."
            else:
                STATE.status = "Nenhum som duplicado encontrado."
            return STATE.snapshot()

        if path == "/api/sounds/empty-trash":
            purged = 0
            for item in STATE.trash_bin:
                try:
                    Path(item.get("path")).unlink(missing_ok=True)
                    purged += 1
                except Exception:
                    pass
                try:
                    Path(item.get("cover_path")).unlink(missing_ok=True)
                except Exception:
                    pass
            STATE.trash_bin = []
            STATE.save_trash_bin()
            STATE.status = f"Lixeira esvaziada! {purged} arquivo(s) físicos apagados."
            return STATE.snapshot()

        if path == "/api/backup/export":
            import zipfile
            import tempfile
            temp_zip = Path(tempfile.gettempdir()) / f"micfudiddo_backup_{int(time.time())}.zip"
            files_to_zip = [
                "profile.json", "app_settings.json", "soundboard.json", 
                "settings.json", "custom_voices.json", "custom_categories.json", 
                "theme_settings.json", "trash.json"
            ]
            with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for filename in files_to_zip:
                    file_path = STATE.library.base_dir / filename
                    if file_path.exists():
                        zipf.write(file_path, arcname=filename)
            STATE.status = f"Backup gerado em {temp_zip}."
            return {"backupPath": str(temp_zip)}

        if path == "/api/backup/import":
            backup_path = data.get("backupPath")
            if not backup_path or not Path(backup_path).exists():
                raise RuntimeError("Caminho do backup inválido.")
            import zipfile
            STATE.stop()
            with zipfile.ZipFile(backup_path, 'r') as zipf:
                zipf.extractall(STATE.library.base_dir)
            STATE.settings = STATE.load_app_settings()
            STATE.profile = STATE.load_profile()
            STATE.custom_voices = STATE.load_custom_voices()
            STATE.custom_categories = STATE.load_custom_categories()
            STATE.theme_settings = STATE.load_theme_settings()
            STATE.trash_bin = STATE.load_trash_bin()
            STATE.library.load_settings()
            STATE.library.load()
            STATE.apply_profile()
            STATE.status = "Configurações restauradas com sucesso do backup!"
            return STATE.snapshot()

        if path == "/api/shutdown":
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return {"ok": True}
        if path == "/api/microphone/restore":
            return {"ok": STATE.restore_microphone_safety()}
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


def remix_clip(clip_path_str: str) -> None:
    clip_path = Path(clip_path_str)
    base_dir = clip_path.parent
    stem = clip_path.stem
    
    voice_path = base_dir / f"{stem}.voice.wav"
    pc_path = base_dir / f"{stem}.pc.wav"
    
    voice_disabled = (base_dir / f"{stem}.voice.disabled").exists()
    pc_disabled = (base_dir / f"{stem}.pc.disabled").exists()
    
    import soundfile as sf
    import numpy as np
    
    voice_audio = np.zeros(0, dtype=np.float32)
    if voice_path.exists() and not voice_disabled:
        try:
            voice_audio, _ = sf.read(str(voice_path), dtype="float32")
        except Exception:
            pass
            
    pc_audio = np.zeros(0, dtype=np.float32)
    if pc_path.exists() and not pc_disabled:
        try:
            pc_audio, _ = sf.read(str(pc_path), dtype="float32")
        except Exception:
            pass
            
    max_len = max(voice_audio.size, pc_audio.size)
    if max_len == 0:
        sf.write(str(clip_path), np.zeros(1024, dtype=np.float32), 48000)
        return
        
    mixed = np.zeros(max_len, dtype=np.float32)
    if voice_audio.size > 0:
        mixed[:voice_audio.size] += voice_audio
    if pc_audio.size > 0:
        mixed[:pc_audio.size] += pc_audio
        
    if voice_audio.size > 0 and pc_audio.size > 0:
        mixed /= 2.0
        
    sf.write(str(clip_path), mixed, 48000)


def handle_clip_remix_payload(item, data):
    if not item or not item.path:
        return
    clip_path = Path(item.path)
    if not clip_path.name.startswith("clip_"):
        return
    
    stem = clip_path.stem
    base_dir = clip_path.parent
    changed = False
    
    if "clipVoiceEnabled" in data:
        enabled = bool(data["clipVoiceEnabled"])
        sentinel = base_dir / f"{stem}.voice.disabled"
        if enabled:
            if sentinel.exists():
                sentinel.unlink(missing_ok=True)
                changed = True
        else:
            if not sentinel.exists():
                sentinel.write_text("disabled")
                changed = True
                
    if "clipPcEnabled" in data:
        enabled = bool(data["clipPcEnabled"])
        sentinel = base_dir / f"{stem}.pc.disabled"
        if enabled:
            if sentinel.exists():
                sentinel.unlink(missing_ok=True)
                changed = True
        else:
            if not sentinel.exists():
                sentinel.write_text("disabled")
                changed = True
                
    if changed:
        remix_clip(item.path)


def watch_parent_process(parent_pid: int) -> None:
    import os
    import time
    import ctypes

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
        STATE.shutdown_resources()
    except Exception:
        pass
    os._exit(0)


def main() -> None:
    global STATE
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=38717)
    parser.add_argument("--youtube-worker", default="")
    parser.add_argument("--parent-pid", type=int, default=0)
    args = parser.parse_args()

    if args.youtube_worker:
        raise SystemExit(run_youtube_download_worker(args.youtube_worker))

    if STATE is None:
        STATE = AppState()
    STATE.api_port = args.port

    install_microphone_safety_handlers()

    import threading
    watched_parent_pid = args.parent_pid or os.getppid()
    threading.Thread(target=watch_parent_process, args=(watched_parent_pid,), daemon=True).start()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    print(f"MicFudiddo backend listening on http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    finally:
        try:
            server.server_close()
            STATE.shutdown_resources()
        finally:
            sys.stdout.flush()
            sys.stderr.flush()
            os._exit(0)


if __name__ == "__main__":
    main()
