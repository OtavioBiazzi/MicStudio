"""Browser regression checks against a mocked API, without changing live audio settings."""
import copy
import json
import os
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright, expect


def main():
    state = json.load(urllib.request.urlopen("http://127.0.0.1:38717/api/state", timeout=5))
    state.update(running=True, monitorOnly=False, activeVoiceId="clean", voiceRecents=[], controlsRevision=0)
    state["settings"]["voiceEditPersistence"] = "save"
    state["settings"]["shortcutCommandGlitch"] = "Ctrl+Alt+G"
    state["controls"]["voiceBypassed"] = False
    calls = []
    errors = []
    root = Path(__file__).resolve().parents[1]
    artifacts = root / ".codex-temp"
    artifacts.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route_api(route):
            request = route.request
            path = urllib.parse.urlparse(request.url).path
            if request.method == "OPTIONS":
                route.fulfill(status=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"})
                return
            body = request.post_data_json if request.method == "POST" else {}
            calls.append((path, copy.deepcopy(body)))
            if path == "/api/controls":
                state["controls"] = body["controls"]
                state["controls"]["voiceBypassed"] = body.get("voiceBypassed", False)
                state["activeVoiceId"] = body.get("activeVoiceId", "clean")
                state["controlsRevision"] += 1
                state["voiceRecents"] = [state["activeVoiceId"]] + [voice for voice in state["voiceRecents"] if voice != state["activeVoiceId"]]
            elif path == "/api/settings":
                state["settings"].update(body)
            route.fulfill(status=200, content_type="application/json", body=json.dumps(state), headers={"Access-Control-Allow-Origin": "*"})

        context.route("http://127.0.0.1:38717/**", route_api)
        context.route("https://api.github.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body="[]"))
        context.add_init_script("""localStorage.setItem('micfudiddo.page', 'vozes');
            localStorage.setItem('micfudiddo.voiceEdits', JSON.stringify({glitch_sob_comando:{gain:1,pitch:0,effects:{time_glitch_enabled:false}}}));""")
        page.goto(os.environ.get("VOICE_TEST_URL", "http://127.0.0.1:5178"), wait_until="networkidle")
        expect(page.get_by_role("heading", name="Biblioteca de Vozes")).to_be_visible()
        page.get_by_role("button", name="Novas", exact=True).click()
        expect(page.locator(".voiceCard:not(.createCard)")).to_have_count(14)
        page.get_by_role("button", name="Todas", exact=True).click()
        page.get_by_placeholder("Buscar voz...").fill("Glitch Sob Comando")
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.locator(".voiceCard:not(.createCard)").click()
        assert state["controls"]["effects"]["time_glitch_enabled"] is True
        assert state["settings"]["shortcutCommandGlitch"] == "Ctrl+Alt+G"
        repeat = page.get_by_role("slider", name="Repetições ao disparar", exact=True)
        with page.expect_response(lambda response: "/api/controls" in response.url):
            repeat.fill("0")
        assert state["controls"]["effects"]["time_glitch_repeats"] == 1
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.get_by_role("button", name="Aumentar Repetições ao disparar", exact=True).click()
        assert state["controls"]["effects"]["time_glitch_repeats"] == 2
        with page.expect_response(lambda response: "/api/controls" in response.url):
            repeat.fill("1000")
        assert state["controls"]["effects"]["time_glitch_repeats"] == 10000
        with page.expect_response(lambda response: "/api/glitch/trigger" in response.url):
            page.get_by_role("button", name="Disparar repetição", exact=True).click()
        with page.expect_response(lambda response: "/api/glitch/stop" in response.url):
            page.get_by_role("button", name="Parar repetição", exact=True).click()
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.locator(".voiceSidePanel select").first.select_option("hold")
        hold = page.get_by_role("button", name="Segurar para repetir", exact=True)
        hold.scroll_into_view_if_needed()
        bounds = hold.bounding_box()
        page.mouse.move(bounds["x"] + 20, bounds["y"] + 15)
        with page.expect_response(lambda response: "/api/glitch/trigger" in response.url):
            page.mouse.down()
        assert next(body for path, body in reversed(calls) if path == "/api/glitch/trigger")["hold"] is True
        with page.expect_response(lambda response: "/api/glitch/stop" in response.url):
            page.mouse.up()
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.locator(".voiceSidePanel select").first.select_option("press")

        for width, height in ((1600, 1000), (1100, 850), (800, 900), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            panel = page.locator(".voiceSidePanel")
            panel.evaluate("element => element.scrollTop = 0")
            expect(panel).to_be_visible()
            assert panel.evaluate("element => element.scrollWidth <= element.clientWidth + 1"), width
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), width
            page.screenshot(path=str(artifacts / f"voices-1.4.0-{width}.png"))

        page.set_viewport_size({"width": 1600, "height": 1000})
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.locator(".dock-active-avatar-container").click()
        assert state["controls"]["voiceBypassed"] is True
        saved = page.evaluate("JSON.parse(localStorage.getItem('micfudiddo.voiceEdits')).glitch_sob_comando")
        assert saved["effects"]["time_glitch_enabled"] is True
        with page.expect_response(lambda response: "/api/controls" in response.url):
            page.locator(".dock-active-avatar-container").click()
        assert state["controls"]["effects"]["time_glitch_enabled"] is True
        assert state["controls"]["effects"]["time_glitch_repeats"] == 10000
        page.get_by_role("button", name="Recentes", exact=True).click()
        page.get_by_placeholder("Buscar voz...").fill("")
        expect(page.locator(".voiceCard:not(.createCard)")).to_have_count(1)
        page.get_by_role("button", name="Voice Lab", exact=True).click()
        expect(page.get_by_role("button", name="Disparar repetição", exact=True)).to_be_visible()
        assert not errors, errors
        print(json.dumps({"browser": "passed", "viewports": [1600, 1100, 800, 390], "jsErrors": errors, "apiCalls": len(calls)}))
        browser.close()


if __name__ == "__main__":
    main()
