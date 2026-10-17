"""
Готовит оригинальные цветочные изображения для сайта.

Источник: assets-src/peony-garland.png и assets-src/peony-stem.png (предоставлены заказчицей).
1. Белая «заливка» лепестков переводится в прозрачность (color-to-alpha по белому):
   линии и их цвет не меняются, поверх белого результат идентичен оригиналу,
   а на розовой бумаге сквозь цветы проступает фон.
2. Изображения сохраняются целиком, без кадрирования, в WebP с прозрачностью в нескольких размерах.

Запуск: python3 scripts/prepare-art.py
"""
from PIL import Image
import numpy as np
import os

SRC, OUT = "assets-src", "public/art"
os.makedirs(OUT, exist_ok=True)


def unwhite(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert("RGBA")).astype(np.float64) / 255.0
    rgb, al = a[..., :3], a[..., 3:4]
    rgb = rgb * al + (1 - al)  # сначала на белый — как исходник выглядит
    alpha = np.max(1 - rgb, axis=2, keepdims=True)  # насколько пиксель темнее белого
    safe = np.where(alpha > 1e-6, alpha, 1)
    color = np.clip((rgb - (1 - alpha)) / safe, 0, 1)
    out = np.concatenate([color, alpha], axis=2)
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA")


def feather(img: Image.Image, px: int = 44) -> Image.Image:
    """Мягко растушёвывает края фрагмента, чтобы не было видно прямой линии обреза."""
    a = np.asarray(img).astype(np.float64)
    h, w = a.shape[:2]
    ry = np.minimum(np.arange(h), np.arange(h)[::-1]) / px
    rx = np.minimum(np.arange(w), np.arange(w)[::-1]) / px
    m = np.clip(np.minimum.outer(ry, rx), 0, 1)
    m = m * m * (3 - 2 * m)  # плавная кривая
    a[..., 3] *= m
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def save(img: Image.Image, name: str, widths):
    for w in widths:
        im = img if w >= img.width else img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)
        im.save(f"{OUT}/{name}-{w}.webp", quality=80, method=6)
        print(f"{name}-{w}.webp", im.size, os.path.getsize(f"{OUT}/{name}-{w}.webp") // 1024, "KB")


garland = unwhite(Image.open(f"{SRC}/peony-garland.png"))
stem = unwhite(Image.open(f"{SRC}/peony-stem.png"))

# Только целые изображения — без нарезки фрагментов. Если цветок выходит за край,
# его обрезает граница экрана, а не прямоугольник файла.
save(garland, "garland", [1536, 860, 560])
save(stem, "peony-stem", [640, 360])
