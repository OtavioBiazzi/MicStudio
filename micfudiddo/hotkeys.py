"""Controle de "apertar" x "segurar" para atalhos globais.

Problema que isto resolve: o teclado repete o evento de tecla pressionada enquanto a tecla esta segurada. Sem controle,
um atalho de som reiniciava (ou alternava play/pause) dezenas de vezes por segundo, o modo "segurar para repetir" nao
sabia quando a tecla foi solta e o glitch podia ficar "preso" se o evento de soltar se perdesse.

HoldTracker garante: um disparo por pressionamento, aviso ao soltar, e recuperacao se a soltura nao foi percebida."""

from __future__ import annotations

import threading
from typing import Callable

_ALIASES = {
    "control": "ctrl",
    "commandorcontrol": "ctrl",
    "cmdorctrl": "ctrl",
    "windows": "win",
    "meta": "win",
    "super": "win",
    "return": "enter",
    "escape": "esc",
}


def normalize_key_name(name) -> str:
    """'Left Ctrl' -> 'ctrl', 'Windows' -> 'win'. Nomes que vem do teclado e do texto do atalho ficam iguais."""
    text = str(name or "").strip().lower()
    for prefix in ("left ", "right ", "esquerda ", "direita "):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return _ALIASES.get(text, text)


def hotkey_keys(hotkey) -> frozenset[str]:
    """'Ctrl+Alt+G' -> {'ctrl', 'alt', 'g'}."""
    parts = [normalize_key_name(part) for part in str(hotkey or "").replace(" ", "").split("+")]
    return frozenset(part for part in parts if part)


def normalize_hotkey_text(hotkey) -> str:
    """Texto no formato que a biblioteca `keyboard` aceita ('ctrl+alt+g')."""
    return "+".join(sorted(hotkey_keys(hotkey), key=lambda key: (key not in ("ctrl", "alt", "shift", "win"), key)))


class HoldTracker:
    def __init__(self, still_held: Callable[[str], bool] | None = None) -> None:
        self._down: dict[str, tuple[frozenset[str], str]] = {}
        self._lock = threading.Lock()
        # Pergunta ao sistema se o atalho ainda esta realmente apertado (usado para se recuperar de uma soltura perdida).
        self._still_held = still_held or (lambda hotkey: True)

    def press(self, hotkey_id: str, hotkey: str) -> bool:
        """True se este e um pressionamento novo (deve disparar); False se for repeticao do teclado."""
        with self._lock:
            current = self._down.get(hotkey_id)
            if current is not None:
                try:
                    held = bool(self._still_held(current[1]))
                except Exception:
                    held = True
                if held:
                    return False  # repeticao automatica: a tecla continua apertada
                del self._down[hotkey_id]  # a soltura nao foi percebida; trata como um pressionamento novo
            self._down[hotkey_id] = (hotkey_keys(hotkey), hotkey)
            return True

    def key_up(self, key_name) -> list[str]:
        """Uma tecla foi solta: devolve os atalhos que deixaram de estar apertados."""
        name = normalize_key_name(key_name)
        released: list[str] = []
        with self._lock:
            for hotkey_id, (keys, _text) in list(self._down.items()):
                if name in keys:
                    released.append(hotkey_id)
                    del self._down[hotkey_id]
        return released

    def release(self, hotkey_id: str) -> bool:
        with self._lock:
            return self._down.pop(hotkey_id, None) is not None

    def is_down(self, hotkey_id: str) -> bool:
        with self._lock:
            return hotkey_id in self._down

    def clear(self) -> list[str]:
        with self._lock:
            ids = list(self._down)
            self._down.clear()
            return ids
