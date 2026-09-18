import sys
import imageio_ffmpeg
import yt_dlp


class SafeWriter:
    def __init__(self, stream):
        self.stream = stream

    def write(self, value):
        try:
            return self.stream.write(value) if self.stream is not None else 0
        except (OSError, ValueError):
            return 0

    def flush(self):
        try:
            if self.stream is not None:
                self.stream.flush()
        except (OSError, ValueError):
            pass


sys.stdout = SafeWriter(sys.stdout)
sys.stderr = SafeWriter(sys.stderr)

try:
    from micfudiddo.backend import main
    if __name__ == "__main__":
        main()
except Exception as e:
    import traceback
    with open("backend_crash.log", "w") as f:
        traceback.print_exc(file=f)
    sys.exit(1)

