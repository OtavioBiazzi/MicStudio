"""Processo auxiliar que baixa audio do YouTube/TikTok sem travar o backend principal."""

from __future__ import annotations

from pathlib import Path
import json
import time


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
