"""Texto para voz (TTS): divisao de textos longos, vozes do edge-tts, sintese em paralelo e voz offline do Windows."""

from __future__ import annotations

import os
import time
import threading
from collections import OrderedDict
from pathlib import Path

import numpy as np

from .soundboard import load_audio_mono, resample_linear

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


TTS_CHUNK_TIMEOUT_SECONDS = 30
TTS_MAX_PARALLEL_CHUNKS = 4
TTS_CACHE_LIMIT = 24
TTS_VOICES_TTL_SECONDS = 3600
TTS_FALLBACK_VOICES = [
    {"id": "pt-BR-AntonioNeural", "name": "Antonio (Masculina - BR)", "lang": "pt-BR"},
    {"id": "pt-BR-FranciscaNeural", "name": "Francisca (Feminina - BR)", "lang": "pt-BR"},
    {"id": "pt-BR-ThalitaMultilingualNeural", "name": "Thalita (Feminina - BR)", "lang": "pt-BR"},
    {"id": "pt-PT-DuarteNeural", "name": "Duarte (Masculina - PT)", "lang": "pt-PT"},
    {"id": "pt-PT-RaquelNeural", "name": "Raquel (Feminina - PT)", "lang": "pt-PT"},
    {"id": "en-US-GuyNeural", "name": "Guy (Masculina - US)", "lang": "en-US"},
    {"id": "en-US-AriaNeural", "name": "Aria (Feminina - US)", "lang": "en-US"},
    {"id": "es-MX-JorgeNeural", "name": "Jorge (Masculina - MX)", "lang": "es-MX"},
    {"id": "es-ES-ElviraNeural", "name": "Elvira (Feminina - ES)", "lang": "es-ES"},
    {"id": "ja-JP-KeitaNeural", "name": "Keita (Masculina - JP)", "lang": "ja-JP"},
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Feminina - JP)", "lang": "ja-JP"},
    {"id": "de-DE-ConradNeural", "name": "Conrad (Masculina - DE)", "lang": "de-DE"},
    {"id": "de-DE-KatjaNeural", "name": "Katja (Feminina - DE)", "lang": "de-DE"},
]
_tts_audio_cache: "OrderedDict[tuple, np.ndarray]" = OrderedDict()
_tts_audio_cache_lock = threading.Lock()
_tts_voices_cache: dict = {"voices": None, "expires": 0.0}


def format_tts_offset(value, unit: str, limit: int) -> str:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError):
        number = 0
    number = max(-limit, min(limit, number))
    return f"{number:+d}{unit}"


def list_tts_voices() -> list[dict]:
    """Vozes do edge-tts (cache de 1h). Sem internet, cai na lista embutida."""
    now = time.time()
    if _tts_voices_cache["voices"] and _tts_voices_cache["expires"] > now:
        return _tts_voices_cache["voices"]
    try:
        import asyncio
        import edge_tts

        async def fetch():
            return await asyncio.wait_for(edge_tts.list_voices(), timeout=8)

        raw = asyncio.run(fetch())
        voices = []
        for item in raw:
            short = str(item.get("ShortName", ""))
            if not short:
                continue
            first = str(item.get("FriendlyName", short)).split(" Online")[0].replace("Microsoft ", "")
            gender = "Feminina" if item.get("Gender") == "Female" else "Masculina"
            locale = str(item.get("Locale", ""))
            voices.append({"id": short, "name": f"{first} ({gender} - {locale})", "lang": locale})
        if voices:
            preferred = {"pt-BR": 0, "pt-PT": 1, "en-US": 2}
            voices.sort(key=lambda v: (preferred.get(v["lang"], 9), v["lang"], v["name"]))
            _tts_voices_cache["voices"] = voices
            _tts_voices_cache["expires"] = now + TTS_VOICES_TTL_SECONDS
            return voices
    except Exception as exc:
        print("TTS: nao foi possivel listar vozes online:", exc)
    return TTS_FALLBACK_VOICES


async def _synthesize_tts_chunk(chunk, voice, rate, pitch, sample_rate, temp_dir, index, semaphore):
    import asyncio
    import edge_tts
    import uuid

    async with semaphore:
        temp_path = temp_dir / f"tts_{uuid.uuid4().hex}_{index}.mp3"
        last_error: Exception | None = None
        try:
            for _attempt in range(2):
                try:
                    communicate = edge_tts.Communicate(chunk, voice, rate=rate, pitch=pitch)
                    await asyncio.wait_for(communicate.save(str(temp_path)), timeout=TTS_CHUNK_TIMEOUT_SECONDS)
                    return load_audio_mono(str(temp_path), sample_rate).astype(np.float32, copy=False)
                except Exception as exc:
                    last_error = exc
            try:
                return await _synthesize_sapi_chunk(chunk, voice, rate, sample_rate, temp_dir, index)
            except Exception as sapi_error:
                print("TTS: voz offline indisponivel:", sapi_error)
            raise RuntimeError(
                "Nao foi possivel gerar a voz. Verifique a conexao com a internet "
                f"({type(last_error).__name__})."
            )
        finally:
            try:
                temp_path.unlink()
            except Exception:
                pass


async def _synthesize_sapi_chunk(chunk, voice, rate, sample_rate, temp_dir, index) -> np.ndarray:
    """Reserva offline: voz instalada no Windows (SAPI), escolhida pelo idioma da voz pedida."""
    import asyncio
    import subprocess
    import uuid

    if os.name != "nt":
        raise RuntimeError("SAPI so existe no Windows.")
    culture = "-".join(str(voice).split("-")[:2]) or "pt-BR"
    try:
        sapi_rate = max(-10, min(10, int(round(int(str(rate).replace("%", "").replace("+", "")) / 10))))
    except ValueError:
        sapi_rate = 0
    token = uuid.uuid4().hex
    text_path = temp_dir / f"sapi_{token}_{index}.txt"
    wav_path = temp_dir / f"sapi_{token}_{index}.wav"
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        f"$s.Rate = {sapi_rate};"
        f"$v = $s.GetInstalledVoices() | Where-Object {{ $_.VoiceInfo.Culture.Name -eq '{culture}' }} | Select-Object -First 1;"
        "if ($v) { $s.SelectVoice($v.VoiceInfo.Name) };"
        f"$s.SetOutputToWaveFile('{wav_path}');"
        f"$s.Speak([IO.File]::ReadAllText('{text_path}', [Text.Encoding]::UTF8));"
        "$s.Dispose()"
    )
    text_path.write_text(chunk, encoding="utf-8")

    def run() -> None:
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            check=True, capture_output=True, timeout=TTS_CHUNK_TIMEOUT_SECONDS,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )

    try:
        await asyncio.get_running_loop().run_in_executor(None, run)
        return load_audio_mono(str(wav_path), sample_rate).astype(np.float32, copy=False)
    finally:
        for path in (text_path, wav_path):
            try:
                path.unlink()
            except Exception:
                pass


async def synthesize_tts_text_to_audio(
    text: str,
    voice: str,
    rate: str,
    sample_rate: int,
    temp_dir: Path,
    pitch: str = "+0Hz",
) -> np.ndarray:
    import asyncio

    chunks = split_tts_text(text)
    if not chunks:
        raise RuntimeError("Texto vazio.")

    cache_key = (str(text).strip(), voice, rate, pitch, int(sample_rate))
    with _tts_audio_cache_lock:
        cached = _tts_audio_cache.get(cache_key)
        if cached is not None:
            _tts_audio_cache.move_to_end(cache_key)
            return cached.copy()

    temp_dir.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(TTS_MAX_PARALLEL_CHUNKS)
    parts = await asyncio.gather(*(
        _synthesize_tts_chunk(chunk, voice, rate, pitch, sample_rate, temp_dir, index, semaphore)
        for index, chunk in enumerate(chunks)
    ))
    parts = [part for part in parts if part.size]
    if not parts:
        raise RuntimeError("A sintese nao gerou audio.")

    gap = np.zeros(max(1, int(sample_rate * TTS_CHUNK_GAP_SECONDS)), dtype=np.float32)
    with_gaps: list[np.ndarray] = []
    for index, part in enumerate(parts):
        if index:
            with_gaps.append(gap)
        with_gaps.append(part)
    audio = np.concatenate(with_gaps).astype(np.float32, copy=False)

    with _tts_audio_cache_lock:
        _tts_audio_cache[cache_key] = audio.copy()
        while len(_tts_audio_cache) > TTS_CACHE_LIMIT:
            _tts_audio_cache.popitem(last=False)
    return audio
