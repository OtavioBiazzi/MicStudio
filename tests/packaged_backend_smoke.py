"""Exercise the windowed executable without using the user's profile or audio streams."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
EXECUTABLE = ROOT / "backend-dist" / "MicFudiddoBackend" / "MicFudiddoBackend.exe"


def main():
    with tempfile.TemporaryDirectory(prefix="micfudiddo-package-") as temporary:
        home = Path(temporary)
        profile = home / "AppData" / "Roaming" / "MicFudiddo"
        profile.mkdir(parents=True)
        (profile / "app_settings.json").write_text(json.dumps({
            "autoStartVirtual": False, "restoreOnDisable": False, "clipEnabled": False,
        }), encoding="utf-8")
        log_dir = home / "logs"
        env = {**os.environ, "USERPROFILE": str(home), "APPDATA": str(home / "AppData" / "Roaming"),
               "MICFUDIDDO_LOG_DIR": str(log_dir)}
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        api = f"http://127.0.0.1:{port}"
        child = subprocess.Popen([str(EXECUTABLE), "--port", str(port), "--parent-pid", str(os.getpid())],
                                 cwd=home, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
        started = time.monotonic()
        try:
            while time.monotonic() - started < 30:
                assert child.poll() is None, "Packaged backend exited before readiness"
                try:
                    with urlopen(api + "/api/health", timeout=1) as response:
                        health = json.load(response)
                    if health.get("ready"):
                        break
                except (URLError, TimeoutError):
                    pass
                time.sleep(.15)
            else:
                raise AssertionError("Packaged backend did not become ready")
            with urlopen(api + "/api/state", timeout=5) as response:
                state = json.load(response)
            assert not state["running"], "Smoke test must not open audio streams"
            assert not state["settings"]["restoreOnDisable"]
            assert Path(state["folders"]["sounds"]).is_relative_to(home), "Profile is not isolated"
            with urlopen(Request(api + "/api/shutdown", data=b"{}", method="POST"), timeout=5):
                pass
            assert child.wait(timeout=15) == 0
            log = (log_dir / "backend-runtime.log").read_text(encoding="utf-8")
            assert "backend listening" in log
            print(f"Packaged backend: ready in {time.monotonic() - started:.2f}s, isolated profile, clean shutdown, runtime log present")
        finally:
            if child.poll() is None:
                child.kill()
                child.wait(timeout=5)


if __name__ == "__main__":
    main()
