"""Prepara um som do soundboard para mandar no chat das salas.

Sons do soundboard podem ser WAV enormes; o chat aceita ate ~6 MB. Aqui o som vira um MP3 leve (ate 3 minutos),
com o ffmpeg que ja vem junto com o app. O resultado fica num cache e e reaproveitado enquanto o arquivo nao mudar.
"""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

MAX_SECONDS = 180
BITRATE = "128k"
MAX_BYTES = 6 * 1024 * 1024


def _ffmpeg() -> str | None:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def chat_export(source: str, cache_dir: Path, duration: float = 0.0, ffmpeg: str | None = None, run=subprocess.run) -> dict:
    """Converte `source` para MP3 de ate 3 minutos. Devolve {path, trimmed, duration}."""
    src = Path(source)
    if not src.is_file():
        raise RuntimeError("Nao achei o arquivo desse som.")
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    stat = src.stat()
    key = hashlib.sha1(f"{src.resolve()}|{stat.st_size}|{int(stat.st_mtime)}".encode("utf-8")).hexdigest()[:16]
    target = cache_dir / f"{key}.mp3"
    trimmed = bool(duration and duration > MAX_SECONDS + 0.5)
    if target.is_file() and target.stat().st_size > 0:
        return {"path": str(target), "trimmed": trimmed, "duration": min(duration or 0.0, MAX_SECONDS)}

    exe = ffmpeg or _ffmpeg()
    if not exe:
        raise RuntimeError("O conversor de audio (ffmpeg) nao foi encontrado.")
    temp = target.with_suffix(".tmp.mp3")
    command = [
        exe, "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(src),
        "-t", str(MAX_SECONDS),
        "-vn", "-ac", "2", "-ar", "44100",
        "-c:a", "libmp3lame", "-b:a", BITRATE,
        str(temp),
    ]
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    result = run(command, capture_output=True, text=True, check=False, creationflags=creationflags)
    if result.returncode != 0 or not temp.is_file():
        try:
            temp.unlink()
        except OSError:
            pass
        raise RuntimeError("Nao consegui preparar esse som para o chat.")
    if temp.stat().st_size > MAX_BYTES:
        temp.unlink()
        raise RuntimeError("Esse som ficou grande demais para o chat.")
    temp.replace(target)
    return {"path": str(target), "trimmed": trimmed, "duration": min(duration or 0.0, MAX_SECONDS)}
