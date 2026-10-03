"""Startup error/retry checks using an isolated API; never touches live audio."""
import copy
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
URL = os.environ.get("VOICE_TEST_URL", "http://127.0.0.1:5178")


def fixture_state():
    return {
        "status": "Pronto", "running": True, "virtualMode": False, "monitorOnly": False,
        "sampleRate": 48000, "blockSize": 1024, "level": 0, "lastError": "",
        "activeVoiceId": "clean", "voiceRecents": [], "controlsRevision": 0,
        "controls": {"gain": 1, "pitch": 0, "masterMicGain": 1, "masterVoiceVolume": 1,
                     "masterPitch": 0, "masterMute": False, "monitor": True, "monitorVolume": .8,
                     "soundboardMonitor": True, "soundboardMonitorVolume": .65,
                     "voiceBypassed": False, "effects": {}},
        "settings": {"voiceEditPersistence": "save", "autoStartVirtual": False,
                     "allowMultipleSounds": False, "shortcutCommandGlitch": "Ctrl+Alt+G"},
        "sounds": [], "players": [], "player": {}, "devices": {"inputs": [], "outputs": []}, "selected": {},
        "recordDevices": [], "recordSelected": [], "recording": {}, "windowsCaptureEndpoints": [],
        "virtualCableDetected": True, "customVoices": [], "customVoiceCategories": [],
        "customSoundCategories": [], "voiceFavorites": [], "soundboardFavorites": [],
        "soundCategories": [], "soundDefaults": {}, "totalPlayCount": 0,
        "storageUsed": 0, "folders": {}, "diagnostics": {"pid": 123}, "libraryRevision": 1,
    }


def install_api(context, state, ready, health=None):
    def route_api(route):
        path = urlparse(route.request.url).path
        headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
        if route.request.method == "OPTIONS":
            route.fulfill(status=204, headers=headers)
            return
        data = health if path == "/api/health" and health is not None else state if ready[0] else {"error": "initializing"}
        route.fulfill(status=200 if "error" not in data else 503, content_type="application/json", body=json.dumps(data), headers=headers)
    context.route("http://127.0.0.1:38717/**", route_api)
    context.route("https://api.github.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body="[]"))


def main():
    artifacts = ROOT / ".codex-temp"
    artifacts.mkdir(exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        failure = browser.new_context(viewport={"width": 1100, "height": 760})
        install_api(failure, fixture_state(), [False])
        failure.add_init_script("""window.micfudiddo = {
            getBackendStatus: async () => ({phase:'error',code:'ENOENT',repairRequired:true,
                message:'O servidor de audio nao foi encontrado na instalacao.',detail:'resources/backend/MicFudiddoBackend.exe'}),
            openBackendLogs: async () => {}, openExternal: async () => {}
        };""")
        page = failure.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        expect(page.get_by_role("button", name="Baixar instalador")).to_be_visible(timeout=5000)
        expect(page.get_by_role("alert")).to_contain_text("nao foi encontrado")
        expect(page.get_by_role("button", name="Abrir logs")).to_be_visible()
        page.screenshot(path=str(artifacts / "startup-missing-1.4.1.png"))
        failure.close()

        recovery = browser.new_context()
        ready = [False]
        install_api(recovery, fixture_state(), ready)
        recovery.add_init_script("""window.micfudiddo = {getBackendStatus: async () => ({phase:'error', message:'Falha temporaria'}),
            retryBackend: async () => { await window.recoverFixture(); return {phase:'ready'}; }};""")
        recovery.expose_function("recoverFixture", lambda: ready.__setitem__(0, True))
        page = recovery.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        page.get_by_role("button", name="Tentar novamente").click()
        expect(page.get_by_role("heading", name="Biblioteca de Vozes")).to_be_visible()
        assert page.locator(".dock-active-avatar-container > .dock-active-avatar").count() == 1
        assert page.locator(".dock-voice-info").count() == 0
        recovery.close()

        stalled = browser.new_context()
        install_api(stalled, fixture_state(), [False], health={"ok": True, "ready": False})
        page = stalled.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.clock.install()
        page.goto(URL, wait_until="networkidle")
        page.clock.fast_forward(62000)
        expect(page.get_by_role("alert")).to_contain_text("nao concluiu")
        expect(page.get_by_role("button", name="Tentar novamente")).to_be_visible()
        stalled.close()
        assert not errors, errors
        print(json.dumps({"startup": "missing, retry, stalled readiness passed", "jsErrors": errors}))
        browser.close()


if __name__ == "__main__":
    main()
