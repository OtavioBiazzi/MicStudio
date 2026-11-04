"""Clipe retroativo: guarda os ultimos segundos de voz e de audio do PC para salvar como som."""

from __future__ import annotations

import numpy as np
import threading
import time


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
