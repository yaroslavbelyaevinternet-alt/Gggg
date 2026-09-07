#!/usr/bin/env python3
"""
Ultimate Hammer — генератор пиксельных текстур (без внешних зависимостей).

Предметы 32×32: кувалда наискось, СИЛУЭТ ЦЕНТРИРОВАН, голова заметно больше
рукояти; боёк (яркая ударная грань) на северо-запад, пятка в тень на ЮВ,
тёмный контур. Освещение с северо-запада.

Иконки паков 512×512 — обложка: глубокий градиент, сетка «блоков», свечение
за бойком, крупный молот с отражением на «глянцевом полу», искры, бевел-рамка.
"""
import zlib, struct, os, math

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "resource_packs", "ultimate_hammer_rp")
BP = os.path.join(ROOT, "behavior_packs", "ultimate_hammer_bp")

def write_png(path, w, h, pixels):
    raw = b""
    for y in range(h):
        raw += b"\x00" + b"".join(bytes(pixels[y][x]) for x in range(w))
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("write", path, f"{w}x{h}")

def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))

PALS = {
    "wooden":    dict(base="#B8945F", hi="#D9B981", dark="#8B6B3F", edge="#5C4626", face="#E8CD96"),
    "stone":     dict(base="#9C9C9C", hi="#C0C0C0", dark="#757575", edge="#4F4F4F", face="#D2D2D2"),
    "iron":      dict(base="#DCDFE4", hi="#FFFFFF", dark="#A6ACB6", edge="#575D66", face="#FFFFFF"),
    "golden":    dict(base="#F6CF47", hi="#FDEB9E", dark="#C9931F", edge="#6E4F0E", face="#FFF3B0"),
    "diamond":   dict(base="#4AEDD9", hi="#A7F7EC", dark="#23A99B", edge="#0E5D55", face="#C6FBF4"),
    "netherite": dict(base="#6A626D", hi="#8E848F", dark="#4A434E", edge="#2A242C", face="#A1989E"),
}
HANDLE = dict(h_base="#A97F4F", h_hi="#C9A46E", h_dark="#7C5B33")
OUTLINE = (29, 29, 33, 255)
SQ2 = math.sqrt(2) / 2.0

# u — вдоль рукояти к СВ, v — поперёк (v>0 = СВЕРХО-ЗАПАД, сторона бойка).
# Сдвиг u на −1 центрирует силуэт в кадре.
U_SHIFT = 4.0

def classify(u, v):
    u = u + U_SHIFT
    # Голова-кувалда (заметно больше): длина 9.3, полуширина до 8.2
    if 5.5 <= u <= 14.8:
        vmax = 8.2 if 6.4 <= u <= 13.8 else 6.8      # фаски углов
        if abs(v) > vmax:
            return None
        if v >= 6.8:  return "face"                   # боёк → СЗ (свет)
        if v <= -6.8: return "dark"                   # пятка → ЮВ (тень)
        if v >= 4.4:  return "hi"
        if v <= -4.4: return "dark"
        if u >= 13.6: return "dark"                   # задний обод
        if u <= 6.4:  return "edge"                   # обод у шейки
        return "base"
    # Обжимка рукояти под головой
    if 4.0 <= u < 5.5 and abs(v) <= 2.3:
        return "h_dark"
    # Рукоять
    if -13.5 <= u < 4.0 and abs(v) <= 1.6:
        if v >= 0.8:  return "h_hi"
        if v <= -0.8: return "h_dark"
        return "h_base"
    return None

def make_palette(mat):
    pal = {k: hx(v) for k, v in PALS[mat].items()}
    hnd = {k: hx(v) for k, v in HANDLE.items()}
    def pick(k):
        return (hnd if k.startswith("h_") else pal)[k]
    return pick

def tool_uv(x, y, size, span):
    t = span / size
    dx = (x + 0.5 - size / 2.0) * t
    dy = (size / 2.0 - y - 0.5) * t
    return (dx + dy) * SQ2, (dy - dx) * SQ2

def sample_tool(x, y, size, span, ss):
    counts = {}
    for i in range(ss):
        for j in range(ss):
            u, v = tool_uv(x + (i + .5) / ss, y + (j + .5) / ss, size, span)
            k = classify(u, v)
            if k:
                counts[k] = counts.get(k, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0] if counts else None

def outline_pass(px, w, h):
    solid = [[p is not None and p[3] == 255 and p != OUTLINE for p in row] for row in px]
    for y in range(h):
        for x in range(w):
            if solid[y][x] or px[y][x] is None:
                continue
            if ((x > 0 and solid[y][x - 1]) or (x < w - 1 and solid[y][x + 1]) or
                    (y > 0 and solid[y - 1][x]) or (y < h - 1 and solid[y + 1][x])):
                px[y][x] = OUTLINE

def render_item(mat, size=32, ss=4, classify_fn=None, span=31.0):
    pick = make_palette(mat)
    classify_fn = classify_fn or classify
    px = [[None] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            k = sample_tool(x, y, size, span, ss, classify_fn)
            px[y][x] = pick(k) + (255,) if k else (0, 0, 0, 0)
    outline_pass(px, size, size)
    return px

def sample_tool(x, y, size, span, ss, classify_fn=None):
    classify_fn = classify_fn or classify
    counts = {}
    for i in range(ss):
        for j in range(ss):
            u, v = tool_uv(x + (i + .5) / ss, y + (j + .5) / ss, size, span)
            k = classify_fn(u, v)
            if k:
                counts[k] = counts.get(k, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0] if counts else None

def classify_big(u, v):
    """Вариант «голова +40%»: восьмигранная кувалда 12.6×21.6 (длина ×1.35,
    ширина ×1.32, площадь ×1.8 к обычной), рукоять укорочена пропорционально."""
    u = u + U_SHIFT
    if 3.85 <= u <= 16.45:
        if 7.75 <= u <= 12.55:
            vmax = 10.8
        elif u < 7.75:
            vmax = 7.2 + (u - 3.85) / (7.75 - 3.85) * (10.8 - 7.2)
        else:
            vmax = 10.8 - (u - 12.55) / (16.45 - 12.55) * (10.8 - 7.2)
        if abs(v) > vmax:
            return None
        if v >= 8.9:  return "face"
        if v <= -8.9: return "dark"
        if v >= 5.9:  return "hi"
        if v <= -5.9: return "dark"
        if u >= 14.6: return "dark"
        if u <= 5.7:  return "edge"
        return "base"
    if 2.0 <= u < 3.85 and abs(v) <= 3.1:
        return "h_dark"
    if -9.0 <= u < 2.0 and abs(v) <= 1.6:
        if v >= 0.8:  return "h_hi"
        if v <= -0.8: return "h_dark"
        return "h_base"
    return None

def blend(c1, c2, t):
    return tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3)) + (255,)

def render_icon(mat, bg_top, bg_bot, accent, border_hi, border_lo, size=512, ss=2):
    pick = make_palette(mat)
    top, bot = hx(bg_top), hx(bg_bot)
    acc, hi, lo = hx(accent), hx(border_hi), hx(border_lo)
    span = 36.0
    hcx = size / 2 + 4.35 * (size / span)
    hcy = size / 2 - 4.35 * (size / span)
    horizon = int(size * 0.70)
    border = max(8, int(size * 0.022))

    # молот в полный размер
    tool = [[None] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            k = sample_tool(x, y, size, span, ss)
            if k:
                tool[y][x] = pick(k)

    px = [[None] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            # рамка-бевел
            if x < border or y < border or x >= size - border or y >= size - border:
                side_hi = (x < border or y < border)
                px[y][x] = (hi if side_hi else lo) + (255,)
                continue
            # фон: градиент + сетка блоков + виньетка
            t = y / size
            r, g, b = blend(top, bot, t)[:3]
            gx, gy = (x - border) % 43, (y - border) % 43
            if gx == 0 or gy == 0:
                r, g, b = min(255, r + 9), min(255, g + 9), min(255, b + 11)
            dc = math.hypot(x - size / 2, y - size / 2) / (size * 0.74)
            k = max(0.0, 1.0 - 0.42 * max(0.0, dc - 0.32) / 0.68)
            r, g, b = r * k, g * k, b * k
            # свечение за бойком (цветом акцента)
            d = math.hypot(x - hcx, y - hcy)
            if d < size * 0.30:
                glow = (1.0 - d / (size * 0.30)) ** 2
                r += (acc[0] * 0.34 + 40) * glow
                g += (acc[1] * 0.34 + 36) * glow
                b += (acc[2] * 0.34 + 30) * glow
            # «глянцевый пол»: ниже горизонта чуть светлее + отражение молота
            if y > horizon:
                sheen = 0.10 * (1 - (y - horizon) / (size - horizon))
                r, g, b = r + 26 * sheen, g + 28 * sheen, b + 34 * sheen
                my = 2 * horizon - y
                if 0 <= my < size and tool[my][x] is not None:
                    fade = max(0.0, 1 - (y - horizon) / (size * 0.26))
                    c = tool[my][x]
                    r = r * (1 - 0.42 * fade) + c[0] * 0.42 * fade * 0.6
                    g = g * (1 - 0.42 * fade) + c[1] * 0.42 * fade * 0.6
                    b = b * (1 - 0.42 * fade) + c[2] * 0.42 * fade * 0.6
            if tool[y][x] is not None:
                c = tool[y][x]
                px[y][x] = c + (255,)
            else:
                px[y][x] = (min(255, int(r)), min(255, int(g)), min(255, int(b)), 255)

    # контур молота (и отражения не трогаем — только основной силуэт)
    outline_pass(px, size, size)

    # искры у бойка
    for (sx, sy, rad) in [(hcx - 88, hcy - 66, 7), (hcx + 34, hcy - 104, 5), (hcx - 130, hcy + 26, 4)]:
        for (dx, dy) in [(0, 0)] + [(i, 0) for i in range(1, rad)] + [(0, i) for i in range(1, rad)] + \
                        [(-i, 0) for i in range(1, rad)] + [(0, -i) for i in range(1, rad)]:
            x, y = int(sx + dx), int(sy + dy)
            if border + 2 <= x < size - border - 2 and border + 2 <= y < size - border - 2:
                c = px[y][x]
                v = 255 if (dx == 0 and dy == 0) else 215
                px[y][x] = (max(c[0], v), max(c[1], v), max(c[2], min(255, v - 10)), 255)

    # внутренняя акцентная линия рамки
    for i in range(border, size - border):
        for (x, y) in [(i, border), (i, size - border - 1), (border, i), (size - border - 1, i)]:
            c = px[y][x]
            px[y][x] = (min(255, (c[0] + acc[0]) // 2), min(255, (c[1] + acc[1]) // 2), min(255, (c[2] + acc[2]) // 2), 255)
    return px

if __name__ == "__main__":
    for m in PALS:
        write_png(os.path.join(RP, "textures", "items", f"ultimate_hammer_{m}.png"), 32, 32, render_item(m))
    write_png(os.path.join(RP, "pack_icon.png"), 512, 512,
              render_icon("diamond", "#31405C", "#10141F", "#4AEDD9", "#5D77A8", "#0A0D15"))
    write_png(os.path.join(BP, "pack_icon.png"), 512, 512,
              render_icon("netherite", "#4C3A31", "#1C110C", "#8E848F", "#96684E", "#100A06"))

    # ── Вариант «голова +40%» → отдельный ZIP в корне репо ────────────────
    import zipfile
    zpath = os.path.join(ROOT, "Ultimate_Hammer_Textures_Head40.zip")
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for m in PALS:
            tmp = os.path.join("/tmp", "uh_head40", f"ultimate_hammer_{m}.png")
            write_png(tmp, 32, 32, render_item(m, classify_fn=classify_big))
            z.write(tmp, f"ultimate_hammer_{m}.png")
        z.writestr("README.txt", (
            "Ultimate Hammer — текстуры молотов с увеличенной на ~40% головой\n"
            "(восьмигранная кувалда; длина x1.35, ширина x1.32, площадь x1.8).\n\n"
            "Установка (на свой вкус, вместо основных текстур аддона):\n"
            "  1) Открой resource_packs/ultimate_hammer_rp.mcpack (или распакуй mcaddon).\n"
            "  2) Замени 6 файлов в textures/items/ файлами из этого архива\n"
            "     (имена совпадают: ultimate_hammer_wooden.png и т.д.).\n"
            "  3) Перезапусти мир.\n\n"
            "Формат: 32x32 RGBA, пиксель-арт, боёк на северо-запад.\n"
        ))
    print("zip:", zpath)
    print("done")
