from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def make_icon() -> None:
    ASSETS.mkdir(exist_ok=True)
    size = 1024
    source = Path(r"C:\Users\giova\Downloads\imagem_2026-05-30_201123179-removebg-preview-removebg-preview.png")
    if not source.exists():
        raise FileNotFoundError(f"Icone base nao encontrado: {source}")

    original = Image.open(source).convert("RGBA")
    bbox = original.getbbox()
    if bbox:
        original = original.crop(bbox)

    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # Keep only a small transparent margin so Windows taskbar and desktop icons
    # display the mark roughly 40% larger than the previous padded icon.
    target = int(size * 0.9)
    original.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (size - original.width) // 2
    y = (size - original.height) // 2
    image.alpha_composite(original, (x, y))

    for target in (
        ASSETS / "micfudiddo.png",
        ASSETS / "micfudiddo.ico",
    ):
        if target.suffix == ".ico":
            image.save(target, sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
        else:
            image.save(target)


if __name__ == "__main__":
    make_icon()
