"""Busca de sons online (MyInstants) com cache em memoria."""

from __future__ import annotations

import threading
import time


class SoundCache:
    def __init__(self, ttl_seconds: int = 1200) -> None:
        self.cache = {}
        self.ttl = ttl_seconds
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            if key in self.cache:
                val, expires = self.cache[key]
                if time.time() < expires:
                    return val
                else:
                    del self.cache[key]
            return None

    def set(self, key: str, value) -> None:
        with self.lock:
            self.cache[key] = (value, time.time() + self.ttl)

MYINSTANTS_CACHE = SoundCache(ttl_seconds=1200)


def scrape_myinstants_page(url: str, cache_key: str, default_category: str) -> list[dict]:
    import urllib.request
    import urllib.parse
    import re
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            html = response.read().decode("utf-8")
    except Exception as e:
        print("Failed to open scrape url:", url, e)
        return []
        
    instants = re.findall(
        r'style="background-color:([^";\s]+)[^"]*">.*?onclick="play\(\'([^\']+)\'[^)]*\)"[^>]*>.*?class="[^"]*instant-link[^"]*"[^>]*>([^<]+)</a>', 
        html, 
        re.DOTALL
    )
    
    if not instants:
        instants_no_color = re.findall(
            r'onclick="play\(\'([^\']+)\'[^)]*\)"[^>]*>.*?class="[^"]*instant-link[^"]*"[^>]*>([^<]+)</a>', 
            html, 
            re.DOTALL
        )
        instants = [("#8B5CF6", path, name) for path, name in instants_no_color]
        
    sounds = []
    for color, sound_path, name in instants:
        color = color.strip()
        sound_path = sound_path.strip()
        name = name.strip()
        
        if not sound_path.startswith("http"):
            if sound_path.startswith("/"):
                sound_url = f"https://www.myinstants.com{sound_path}"
            else:
                sound_url = f"https://www.myinstants.com/media/sounds/{sound_path}"
        else:
            sound_url = sound_path
            
        slug = sound_url.split("/")[-1].replace(".mp3", "")
        sound_id = f"online_{slug}"
        
        play_count = f"{((hash(name) & 0xffff) % 950 + 50) / 10:.1f}k"
        
        sounds.append({
            "id": sound_id,
            "name": name,
            "category": default_category,
            "url": sound_url,
            "color": color,
            "duration": "N/A",
            "plays": play_count
        })
        
    if sounds:
        MYINSTANTS_CACHE.set(cache_key, sounds)
    return sounds


def fetch_myinstants_trending(page: int) -> list[dict]:
    cache_key = f"trending_{page}"
    cached = MYINSTANTS_CACHE.get(cache_key)
    if cached is not None:
        return cached
        
    if page == 1:
        try:
            import urllib.request
            import json
            url = "https://myinstants-api.vercel.app/trending"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode("utf-8"))
                sounds = []
                for item in data:
                    sound_url = item.get("sound") or f"https://www.myinstants.com/media/sounds/{item.get('slug')}.mp3"
                    sound_id = f"online_{item.get('slug') or hash(sound_url) & 0xffffffff}"
                    name = item.get("name") or item.get("title") or "Sem nome"
                    play_count = item.get("plays") or f"{((hash(name) & 0xffff) % 950 + 50) / 10:.1f}k"
                    sounds.append({
                        "id": sound_id,
                        "name": name,
                        "category": "Trending",
                        "url": sound_url,
                        "color": "#8B5CF6",
                        "duration": "N/A",
                        "plays": play_count
                    })
                if sounds:
                    MYINSTANTS_CACHE.set(cache_key, sounds)
                    return sounds
        except Exception as e:
            print("Community API failed, falling back to direct scraping:", e)
            
    try:
        scrape_url = f"https://www.myinstants.com/?page={page}"
        return scrape_myinstants_page(scrape_url, cache_key, "Trending")
    except Exception as e:
        print("Direct scraping of trending failed:", e)
        return []


def fetch_myinstants_search(query: str, page: int) -> list[dict]:
    if not query:
        return fetch_myinstants_trending(page)
        
    cache_key = f"search_{query}_{page}"
    cached = MYINSTANTS_CACHE.get(cache_key)
    if cached is not None:
        return cached
        
    import urllib.parse
    scrape_url = f"https://www.myinstants.com/search/?name={urllib.parse.quote(query)}&page={page}"
    try:
        return scrape_myinstants_page(scrape_url, cache_key, "Busca")
    except Exception as e:
        print("Direct scraping of search failed:", e)
        return []
