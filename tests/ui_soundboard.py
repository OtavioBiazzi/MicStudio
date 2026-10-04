"""Soundboard appearance and interaction checks with an isolated API fixture."""
import copy
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from ui_startup import fixture_state, URL


def main():
    root = Path(__file__).resolve().parents[1]
    artifacts = root / ".codex-temp"
    state = fixture_state()
    state["sounds"] = [{
        "id": str(index), "name": name, "category": "Geral", "tabs": ["Geral"],
        "color": color, "duration": duration, "plays": index + 1, "volume": .8,
        "shortcut": "Ctrl+1" if index == 0 else "", "loop": False, "last_played_at": 0,
        "created_at": 0, "coverUrl": "", "source": "local", "path": "fixture.wav",
    } for index, (name, color, duration) in enumerate([
        ("Saudacao de radio", "#22b8cf", 4), ("Repeticao de meme", "#e64980", 8),
        ("Trecho com nome muito comprido para conferir quebra e espaco dos controles", "#40c057", 18),
        ("Efeito de campainha", "#fab005", 3), ("Aplausos", "#9775fa", 9),
        ("Musica de guitarra", "#15aabf", 223), ("Gravacao da voz", "#fa5252", 36),
        ("Risada digital", "#f783ac", 6), ("Introducao do podcast", "#4dabf7", 20),
    ])]
    errors, calls = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1672, "height": 940})
        context.add_init_script("localStorage.setItem('micfudiddo.page','soundboard');")
        def route_api(route):
            request = route.request
            headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
            if request.method == "OPTIONS":
                route.fulfill(status=204, headers=headers)
                return
            path = urlparse(request.url).path
            body = request.post_data_json if request.method == "POST" else {}
            calls.append((path, copy.deepcopy(body)))
            if path == "/api/sounds/update":
                next(sound for sound in state["sounds"] if sound["id"] == body["id"]).update(body)
            if path == "/api/controls":
                state["controls"] = body["controls"]
                state["controlsRevision"] += 1
            route.fulfill(status=200, headers=headers, content_type="application/json", body=json.dumps(state))
        context.route("http://127.0.0.1:38717/**", route_api)
        context.route("https://api.github.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body="[]"))
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        expect(page.get_by_role("heading", name="Soundboard Studio")).to_be_visible()
        expect(page.locator(".soundCard")).to_have_count(9)
        page.locator(".soundCard").first.click()
        expect(page.locator(".soundboardSidePanel")).to_be_visible()
        page.get_by_role("button", name="Adicionar aos favoritos: Saudacao de radio", exact=True).click()
        expect(page.get_by_role("button", name="Remover dos favoritos: Saudacao de radio", exact=True)).to_be_visible()
        page.get_by_role("button", name="Mais opções: Saudacao de radio", exact=True).click()
        expect(page.locator(".contextMenu")).to_be_visible()
        with page.expect_response(lambda response: "/api/sounds/play" in response.url):
            page.locator(".contextMenu").get_by_role("button", name="Tocar", exact=True).click()
        assert calls[-1][1]["id"] == "0" or any(path == "/api/sounds/play" and body["id"] == "0" for path, body in calls)
        with page.expect_response(lambda response: "/api/sounds/update" in response.url):
            page.locator(".soundboardSidePanel input[type=range]").fill("0.35")
        assert state["sounds"][0]["volume"] == .35
        page.get_by_placeholder("Buscar som...").fill("sem resultado")
        expect(page.locator(".soundboardEmpty")).to_contain_text("Nenhum som encontrado")
        page.get_by_placeholder("Buscar som...").fill("")
        for width in (1672, 1100, 800, 390):
            page.set_viewport_size({"width": width, "height": 940})
            page.locator(".mainContent").evaluate("element => element.scrollTop = 0")
            page.wait_for_timeout(350)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"Page overflow at {width}"
            assert page.locator(".soundboardPage").evaluate("element => element.scrollWidth <= element.clientWidth + 1"), f"Soundboard overflow at {width}"
            assert page.locator(".floating-dock-inner").count() == 1
            page.screenshot(path=str(artifacts / f"soundboard-1.4.2-{width}.png"))
        assert not errors, errors
        browser.close()
    print("Soundboard selection, favorites, menu playback, volume, empty search, dock and four viewport checks passed; no JS errors")


if __name__ == "__main__":
    main()
