"""Update policy, page layout and viewport-bound menus with isolated fixtures."""
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright
from ui_startup import fixture_state, URL


def main():
    state = fixture_state()
    state["sounds"] = [{
        "id": "fixture", "name": "Som de teste", "category": "Geral", "tabs": ["Geral"],
        "duration": 15, "volume": .8, "path": "fixture.wav", "source": "local",
        "created_at": 0, "last_played_at": 0, "color": "#22b8cf",
    }]
    release = {"tag_name": "v9.9.9", "body": "Notas de teste", "assets": [{
        "name": "MicFudiddo.Studio.Setup.9.9.9.exe", "browser_download_url": "https://example.com/fixture.exe",
    }]}
    requests, errors, api_requests = [], [], []
    artifacts = Path(__file__).resolve().parents[1] / ".codex-temp"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, channel="chrome")
        context = browser.new_context(viewport={"width": 1280, "height": 860})
        context.add_init_script("""window.micfudiddo = {
            getVersion: async () => '1.4.3',
            claimUpdateCheck: async () => {
                if (sessionStorage.getItem('updateClaimed')) return false;
                sessionStorage.setItem('updateClaimed', '1'); return true;
            }
        };""")

        def api(route):
            headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*"}
            if route.request.method == "OPTIONS":
                route.fulfill(status=204, headers=headers)
                return
            path = urlparse(route.request.url).path
            api_requests.append(path)
            data = {"sounds": [], "hasMore": False} if path in ("/api/sounds/trending", "/api/sounds/search") else state
            route.fulfill(status=200, headers=headers, content_type="application/json", body=json.dumps(data))

        def github(route):
            path = urlparse(route.request.url).path
            requests.append(path)
            route.fulfill(status=200, content_type="application/json", body=json.dumps(release if path.endswith("/latest") else [release]))

        context.route("http://127.0.0.1:38717/**", api)
        context.route("https://api.github.com/**", github)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.clock.install()
        page.goto(URL, wait_until="networkidle")
        page.clock.run_for(4500)
        expect(page.get_by_role("button", name="Depois", exact=True)).to_be_visible()
        page.get_by_role("button", name="Depois", exact=True).click()
        page.evaluate("window.dispatchEvent(new Event('focus'))")
        page.clock.fast_forward(360000)
        assert sum(path.endswith("/latest") for path in requests) == 1, requests
        expect(page.get_by_role("button", name="Depois", exact=True)).to_have_count(0)
        page.reload(wait_until="networkidle")
        page.clock.run_for(4500)
        assert sum(path.endswith("/latest") for path in requests) == 1, requests
        page.get_by_title("Ver histórico de atualizações").click()
        expect(page.get_by_role("button", name="Atualizar para v9.9.9", exact=False)).to_be_visible()
        assert sum(path.endswith("/releases") for path in requests) == 1
        page.get_by_title("Atualizar releases").click()
        page.wait_for_timeout(100)
        assert sum(path.endswith("/releases") for path in requests) == 2
        context.close()

        # Layout animations use the real browser clock, separate from the six-minute policy test.
        context = browser.new_context(viewport={"width": 1280, "height": 860})
        context.route("http://127.0.0.1:38717/**", api)
        context.route("https://api.github.com/**", github)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(URL, wait_until="networkidle")
        page.get_by_title("Ver histórico de atualizações").click()
        expect(page.get_by_title("Atualizar releases")).to_be_visible()
        page.locator(".modalHeader .closeBtn").last.click()
        expect(page.locator(".modalOverlay")).to_have_count(0)

        for label in ("Vozes", "Soundboard", "Explorar Sons", "Favoritos", "Voice Lab", "Configurações"):
            page.locator(".sidebar nav").get_by_role("button", name=label, exact=True).click()
            page.wait_for_timeout(300)
            expect(page.locator(".page h2.srOnly")).to_have_count(1)
            expect(page.locator(".page .labHeader")).to_have_count(0)
            for width in (1280, 800, 390):
                page.set_viewport_size({"width": width, "height": 860})
                page.wait_for_timeout(300)
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), (label, width)
                page.screenshot(path=str(artifacts / f"workspace-1.4.3-{label.replace(' ', '-')}-{width}.png"))
                assert page.locator(".page").evaluate("el => el.scrollWidth <= el.clientWidth + 1"), (label, width, "page overflow", page.locator(".page").evaluate("el => [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).slice(0, 12).map(child => [child.className, child.getBoundingClientRect().width])"))
            page.set_viewport_size({"width": 1280, "height": 860})

        page.locator(".sidebar nav").get_by_role("button", name="Explorar Sons", exact=True).click()
        page.wait_for_timeout(300)
        before = api_requests.count("/api/state")
        page.get_by_role("button", name="Gerar Voz por Texto (TTS)", exact=True).click()
        page.wait_for_timeout(2000)
        assert api_requests.count("/api/state") == before, "TTS must not refetch state on every parent render"
        page.locator(".modalContent .closeBtn").first.click()
        expect(page.locator(".modalOverlay")).to_have_count(0)

        for label, card in (("Soundboard", ".soundCard"), ("Vozes", ".voiceCard:not(.createCard)")):
            page.locator(".sidebar nav").get_by_role("button", name=label, exact=True).click()
            page.wait_for_timeout(300)
            if label == "Soundboard":
                expect(page.locator(".soundSourceFilters")).to_have_count(0)
                page.get_by_label("Filtrar sons", exact=True).select_option("YouTube")
                expect(page.locator(".soundCard")).to_have_count(0)
                page.get_by_label("Filtrar sons", exact=True).select_option("Todos")
                expect(page.locator(".soundCard")).to_have_count(1)
            for width, height in ((1280, 860), (390, 740), (390, 240)):
                page.set_viewport_size({"width": width, "height": height})
                page.locator(card).first.evaluate("(el, point) => el.dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, button: 2}))", {"x": width - 3, "y": height - 3})
                menu = page.locator(".adaptiveContextMenu")
                expect(menu).to_be_visible()
                assert menu.evaluate("el => el.parentElement === document.body")
                rect = menu.bounding_box()
                assert rect["x"] >= 7 and rect["y"] >= 7, (label, rect, menu.evaluate("el => ({style: el.getAttribute('style'), computed: {position: getComputedStyle(el).position, left: getComputedStyle(el).left, top: getComputedStyle(el).top}, body: getComputedStyle(document.body).transform})"))
                assert rect["x"] + rect["width"] <= width - 7 and rect["y"] + rect["height"] <= height - 7, rect
                menu.get_by_role("button").last.scroll_into_view_if_needed()
                expect(menu.get_by_role("button").last).to_be_in_viewport()
                if height == 240 and label == "Soundboard":
                    assert menu.evaluate("el => el.scrollHeight > el.clientHeight")
                page.keyboard.press("Escape")
                expect(menu).to_have_count(0)
            page.set_viewport_size({"width": 1280, "height": 860})
        assert not errors, errors
        browser.close()
    print("Update once/session, manual refresh, all six pages in three widths, source filter and edge menus passed")


if __name__ == "__main__":
    main()
