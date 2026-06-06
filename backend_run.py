import sys
import imageio_ffmpeg
import yt_dlp

if sys.stdout is None:
    class DummyWriter:
        def write(self, *args, **kwargs): pass
        def flush(self, *args, **kwargs): pass
    sys.stdout = DummyWriter()

if sys.stderr is None:
    class DummyWriter:
        def write(self, *args, **kwargs): pass
        def flush(self, *args, **kwargs): pass
    sys.stderr = DummyWriter()

try:
    from micfudiddo.backend import main
    if __name__ == "__main__":
        main()
except Exception as e:
    import traceback
    with open("backend_crash.log", "w") as f:
        traceback.print_exc(file=f)
    sys.exit(1)

