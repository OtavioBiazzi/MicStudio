import sys
import os
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import traceback


class SafeWriter:
    def __init__(self, stream, log=None):
        self.stream = stream
        self.log = log

    def write(self, value):
        for stream in (self.stream, self.log):
            if stream is not None:
                try:
                    stream.write(value)
                except (OSError, ValueError):
                    pass
        return len(value)

    def flush(self):
        for stream in (self.stream, self.log):
            if stream is not None:
                try:
                    stream.flush()
                except (OSError, ValueError):
                    pass

    def isatty(self):
        return False

    @property
    def encoding(self):
        return "utf-8"


def open_runtime_log():
    root = Path(os.environ.get("MICFUDIDDO_LOG_DIR") or Path(os.environ.get("APPDATA", tempfile.gettempdir())) / "micfudiddo-studio" / "logs")
    try:
        root.mkdir(parents=True, exist_ok=True)
        log_path = root / "backend-runtime.log"
        if log_path.exists() and log_path.stat().st_size > 2 * 1024 * 1024:
            log_path.replace(root / "backend-runtime.previous.log")
        return log_path.open("a", encoding="utf-8", buffering=1)
    except OSError:
        return None

def run():
    log = open_runtime_log()
    sys.stdout = SafeWriter(sys.stdout, log)
    sys.stderr = SafeWriter(sys.stderr, log)
    print(f"\n--- backend pid={os.getpid()} {datetime.now(timezone.utc).isoformat()} ---", flush=True)
    try:
        import imageio_ffmpeg
        import yt_dlp
        from micfudiddo.backend import main
        main()
    except Exception:
        traceback.print_exc()
        sys.stderr.flush()
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())

