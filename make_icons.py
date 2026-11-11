"""Генерирует PNG-иконки PWA (192 и 512): синий фон, золотой круг, буква S.
Запуск: python3 make_icons.py"""
from PIL import Image, ImageDraw, ImageFont

NAVY, AMBER = (30, 58, 138), (245, 158, 11)

def make(size, path):
    img = Image.new("RGB", (size, size), NAVY)
    d = ImageDraw.Draw(img)
    m = int(size * 0.16)                      # запас под maskable-иконку
    d.ellipse([m, m, size - m, size - m], fill=AMBER)
    font = None
    for name in ("DejaVuSans-Bold.ttf", "Arial Bold.ttf", "arialbd.ttf"):
        try:
            font = ImageFont.truetype(name, int(size * 0.5))
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    d.text((size / 2, size / 2), "S", fill=NAVY, font=font, anchor="mm")
    img.save(path)

make(192, "icons/icon-192.png")
make(512, "icons/icon-512.png")
print("icons ok")
