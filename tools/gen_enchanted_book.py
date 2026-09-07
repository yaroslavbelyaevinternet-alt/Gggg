#!/usr/bin/env python3
"""
Ultimate Hammer — «Книга Расширения I»: ДВА варианта.

ВАРИАНТ 1 (ultimate_book_expansion*.png): ванильная book_enchanted.png
  (bedrock-samples), перекраска ПО РОЛЯМ (обложка→индиго, страницы→пергамент,
  лента→золото) + эмблема «3×3→5×5», ПОВЁРНУТАЯ по главной оси книги
  (угол считается PCA-анализом ванильного силуэта — эмблема лежит на обложке,
  а не «стоит ровно»). Ни один пиксель силуэта не пропадает (проверяется).

ВАРИАНТ 2 (ultimate_book_expansion_v2*.png): книга с нуля, 32×32 (+16×16):
  индиго-обложка с градиентом, корешок со стежками, золотые угловые накладки,
  застёжка с замочной скважиной, блок страниц с линиями, золотая ленточка
  с V-вырезом, руна-круг с молотом внутри, искры, тёмный контур.
  Книга наклонена на тот же угол, что и ванильная (консистентность).
"""
import zlib, struct, os, math, json, base64, urllib.request, zipfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
RP = os.path.join(ROOT, "resource_packs", "ultimate_hammer_rp")
VANILLA = "/tmp/book_enchanted.png"
VANILLA_API = "https://api.github.com/repos/Mojang/bedrock-samples/contents/resource_pack/textures/items/book_enchanted.png"
ZIP = os.path.join(ROOT, "Ultimate_Book_Expansion_I.zip")

# ── PNG I/O ───────────────────────────────────────────────────────────────
def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)

def read_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, plte, trns, meta = 8, b"", b"", b"", {}
    while pos < len(d):
        ln, tag = struct.unpack(">I4s", d[pos:pos + 8])
        data = d[pos + 8:pos + 8 + ln]
        if tag == b"IHDR":
            meta = dict(zip("whdbcc", struct.unpack(">IIBBBBB", data)))
        elif tag == b"IDAT": idat += data
        elif tag == b"PLTE": plte = data
        elif tag == b"tRNS": trns = data
        pos += 12 + ln
    raw = zlib.decompress(idat)
    w, h, depth, ctype = meta["w"], meta["h"], meta["d"], meta["b"]
    assert depth == 8, depth
    nch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = w * nch
    rows, prev = [], bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(nch, stride): line[i] = (line[i] + line[i - nch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - nch] if i >= nch else 0
                line[i] = (line[i] + (a + prev[i]) // 2) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - nch] if i >= nch else 0
                c = prev[i - nch] if i >= nch else 0
                line[i] = (line[i] + paeth(a, prev[i], c)) & 255
        rows.append(bytes(line)); prev = line
    px = []
    for line in rows:
        row = []
        for x in range(w):
            i = x * nch
            if ctype == 3:
                idx = line[i]
                r, g, b = plte[idx * 3:idx * 3 + 3]
                a = trns[idx] if idx < len(trns) else 255
            elif ctype == 6:
                r, g, b, a = line[i:i + 4]
            elif ctype == 2:
                r, g, b, a = *line[i:i + 3], 255
            elif ctype == 4:
                g, a = line[i:i + 2]; r = g; b = g
            else:
                r = g = b = line[i]; a = 255
            row.append((r, g, b, a))
        px.append(row)
    return px, w, h

def write_png(path, w, h, pixels):
    raw = b""
    for y in range(h):
        raw += b"\x00" + b"".join(bytes(pixels[y][x]) for x in range(w))
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)
    print("write", path, f"{w}x{h}")

def fetch_vanilla():
    if os.path.exists(VANILLA):
        return
    req = urllib.request.Request(VANILLA_API, headers={"User-Agent": "uh-gen"})
    d = json.load(urllib.request.urlopen(req, timeout=30))
    open(VANILLA, "wb").write(base64.b64decode(d["content"]))
    print("fetched vanilla book_enchanted.png")

def hx(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))

# ── Палитра ───────────────────────────────────────────────────────────────
RAMP = [hx("14101F"), hx("2A1F4A"), hx("453170"), hx("5D4291"), hx("7E63B8")]
PAGE = [hx("C9C2DE"), hx("DAD5EA"), hx("EDEAF6")]
PAGE_LINE = hx("B4A9CE")
EMBLEM_OUT = hx("4AEDD9")
EMBLEM_IN = hx("A7F7EC")
GOLD = hx("F6CF47")
GOLD_DARK = hx("B8891E")
SPARK = (255, 255, 255)
SPARK2 = hx("9FF5E8")

def lum(c):
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

# ── Угол наклона книги (PCA ванильного силуэта) ───────────────────────────
def book_angle(van, w, h):
    pts = [(x, y) for y in range(h) for x in range(w) if van[y][x][3] > 40]
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    return 0.5 * math.atan2(2 * sxy, sxx - syy)

# ═══════════════════════════ ВАРИАНТ 1 ═══════════════════════════════════
def role(r, g, b):
    l = lum((r, g, b))
    mx, mn = max(r, g, b), min(r, g, b)
    if l > 145 and mx - mn < 40:
        return "page", min(2, int((l - 145) / 30))
    if r > 120 and r > g * 2 and r > b * 1.5:
        return "band", 0
    if l < 25:  return "cover", 0
    if l < 42:  return "cover", 1
    if l < 55:  return "cover", 2
    if l < 70:  return "cover", 3
    return "cover", 4

def repaint(vanilla_px, w, h):
    out = [[None] * w for _ in range(h)]
    cover_px = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = vanilla_px[y][x]
            if a < 40:
                out[y][x] = (0, 0, 0, 0)
                continue
            rl, lvl = role(r, g, b)
            if rl == "page":
                c = PAGE[lvl]
            elif rl == "band":
                c = GOLD if (x + y) % 4 else GOLD_DARK
            else:
                c = RAMP[lvl]
                if lvl >= 2:
                    cover_px.append((x, y))
            out[y][x] = c + (255,)
    cx = sum(p[0] for p in cover_px) // max(1, len(cover_px))
    cy = sum(p[1] for p in cover_px) // max(1, len(cover_px))
    return out, (cx, cy)

def add_emblem_rotated(px, cx, cy, unit, theta, ss=4):
    """Эмблема 5×5/3×3, ПОВЁРНУТАЯ на угол книги (лежит на обложке).
    Заменяет только существующие непрозрачные пиксели — силуэт не трогаем."""
    cos, sin = math.cos(theta), math.sin(theta)
    h5, h3 = 2.5 * unit, 1.5 * unit
    rad = int(h5 * 1.6) + 2
    for y in range(max(0, cy - rad), min(len(px), cy + rad + 1)):
        for x in range(max(0, cx - rad), min(len(px[0]), cx + rad + 1)):
            if px[y][x][3] != 255:
                continue
            votes = {}
            for i in range(ss):
                for j in range(ss):
                    dx = (x + (i + .5) / ss - cx - 0.5)
                    dy = (y + (j + .5) / ss - cy - 0.5)
                    ex = dx * cos - dy * sin
                    ey = dx * sin + dy * cos
                    m = max(abs(ex), abs(ey))
                    if m <= h3:
                        k = "center" if (abs(ex) <= 0.55 * unit and abs(ey) <= 0.55 * unit) else "inner"
                    elif m <= h5:
                        k = "ring"
                    else:
                        k = None
                    if k:
                        votes[k] = votes.get(k, 0) + 1
            if votes:
                k = max(votes.items(), key=lambda kv: kv[1])[0]
                c = {"ring": EMBLEM_OUT, "inner": RAMP[1], "center": EMBLEM_IN}[k]
                px[y][x] = c + (255,)

def add_sparks(px, coords):
    for (x, y, c) in coords:
        if 0 <= y < len(px) and 0 <= x < len(px[0]) and px[y][x][3] == 255:
            px[y][x] = c + (255,)

def upscale2(px16):
    return [[px16[y // 2][x // 2] for x in range(32)] for y in range(32)]

# ═══════════════════════════ ВАРИАНТ 2 (с нуля) ══════════════════════════
# Локальные координаты: ex — вдоль оси книги, ey — поперёк (вверх = свет).
EMBLEM_C = (0.4, 0.2)   # центр эмблемы на обложке (локальные оси книги)

def v2_classify(ex, ey):
    # эмблема «3×3→5×5» в ЛОКАЛЬНЫХ осях книги (лежит на обложке)
    dex, dey = ex - EMBLEM_C[0], ey - EMBLEM_C[1]
    m = max(abs(dex), abs(dey))
    if m <= 2.9:
        if m <= 1.7:
            return EMBLEM_IN if (abs(dex) <= 0.62 and abs(dey) <= 0.62) else RAMP[0]
        return EMBLEM_OUT
    # ленточка-закладка (висит ВНИЗ от блока страниц, ey<0 = вниз)
    if 11.4 <= ex <= 12.8 and -10.4 <= ey <= -6.2:
        if ey < -8.8 and abs(ex - 12.1) < (-8.8 - ey) * 0.55:
            return None  # V-вырез снизу
        return GOLD_DARK if ex <= 11.7 else GOLD
    # блок страниц (справа)
    if 10.5 < ex <= 13.6 and abs(ey) <= 6.4:
        if abs(ey) > 4.8 and ex > 12.3 and (ex - 12.3) + (abs(ey) - 4.8) > 1.0:
            return None  # фаска правых углов
        if ex <= 11.05:
            return PAGE[0]  # линия тени у корешка обложки
        for line in (-3.6, -0.4, 2.9):
            if abs(ey - line) < 0.42:
                return PAGE_LINE
        if ey > 5.1 or ey < -5.1:
            return PAGE[0]
        if ex > 12.9:
            return PAGE[1]
        return PAGE[2]
    # застёжка
    if 9.3 <= ex <= 11.3 and abs(ey) <= 1.8:
        if math.hypot(ex - 10.3, ey) < 0.62:
            return GOLD_DARK  # скважина
        return GOLD
    # корешок (слева) со стежками
    if -10.5 <= ex <= 10.5 and abs(ey) <= 7.0:
        corner = abs(ex) > 8.9 and abs(ey) > 5.4 and (abs(ex) - 8.9) + (abs(ey) - 5.4) > 1.8
        if corner:
            return None  # фаска углов обложки
        # золотые угловые накладки
        if abs(ex) >= 8.6 and abs(ey) >= 5.2:
            return GOLD if (abs(ex) >= 9.8 or abs(ey) >= 6.5) else GOLD_DARK
        if ex < -8.1:
            for st in (-3.5, 0.0, 3.5):
                if abs(ey - st) < 0.55 and -9.9 <= ex <= -8.9:
                    return GOLD_DARK
            return RAMP[1] if ex > -9.4 else RAMP[2]
        # поле обложки: градиент по ey (свет сверху, NW)
        if ey > 3.4:  return RAMP[4]
        if ey > -0.4: return RAMP[3]
        if ey > -4.8: return RAMP[2]
        return RAMP[1]
    return None

def render_v2(size, theta, ss=4):
    span = 31.0
    t = span / size
    cos, sin = math.cos(theta), math.sin(theta)
    px = [[None] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            votes = {}
            for i in range(ss):
                for j in range(ss):
                    vx = (x + (i + .5) / ss + 0.5 - size / 2.0) * t
                    vy = (size / 2.0 - (y + (j + .5) / ss + 0.5)) * t
                    ex = vx * cos + vy * sin
                    ey = -vx * sin + vy * cos
                    k = v2_classify(ex, ey)
                    if k is not None:
                        votes[k] = votes.get(k, 0) + 1
            px[y][x] = max(votes.items(), key=lambda kv: kv[1])[0] + (255,) if votes else (0, 0, 0, 0)
    outline(px)
    return px

def outline(px):
    h, w = len(px), len(px[0])
    solid = [[p[3] == 255 for p in row] for row in px]
    for y in range(h):
        for x in range(w):
            if solid[y][x] or px[y][x] is None:
                continue
            if ((x > 0 and solid[y][x - 1]) or (x < w - 1 and solid[y][x + 1]) or
                    (y > 0 and solid[y - 1][x]) or (y < h - 1 and solid[y + 1][x])):
                px[y][x] = RAMP[0] + (255,)

def add_star(px, x, y):
    """4-конечная звезда: центр белый, лучи циановые."""
    for (dx, dy, c) in [(0, 0, SPARK), (1, 0, SPARK2), (-1, 0, SPARK2), (0, 1, SPARK2), (0, -1, SPARK2),
                        (2, 0, EMBLEM_OUT), (-2, 0, EMBLEM_OUT), (0, 2, EMBLEM_OUT), (0, -2, EMBLEM_OUT)]:
        yy, xx = y + dy, x + dx
        if 0 <= yy < len(px) and 0 <= xx < len(px[0]) and px[yy][xx][3] == 0:
            px[yy][xx] = c + (255,)

def ascii_preview(px, step=1):
    for row in px[::step]:
        line = ""
        for c in row[::step]:
            if c[3] == 0:
                line += " "
            else:
                t = c[:3]
                if t in (EMBLEM_OUT, EMBLEM_IN): line += "$"
                elif t in (GOLD, GOLD_DARK):     line += "G"
                elif t in PAGE or t == PAGE_LINE: line += "="
                elif t == RAMP[4]:               line += "%"
                elif t == RAMP[3]:               line += "#"
                elif t == RAMP[2]:               line += "+"
                elif t == RAMP[1]:               line += ":"
                elif t == RAMP[0]:               line += "."
                else:                             line += "*"
        print(line)

# ── main ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    fetch_vanilla()
    van, w, h = read_png(VANILLA)
    theta = book_angle(van, w, h)
    solid_van = sum(1 for row in van for c in row if c[3] > 40)
    print(f"ваниль: {w}x{h}, solid {solid_van}, угол книги {math.degrees(theta):.1f}°")

    # ВАРИАНТ 1
    p16, (cx, cy) = repaint(van, w, h)
    add_emblem_rotated(p16, cx, cy, 1, theta)
    add_sparks(p16, [(w - 3, 2, SPARK), (2, h - 3, SPARK2)])
    solid_out = sum(1 for row in p16 for c in row if c[3] == 255)
    assert solid_out == solid_van, f"потеряны пиксели: {solid_van} → {solid_out}"
    print(f"v1: все {solid_out} пикселей на месте ✓")
    write_png(os.path.join(RP, "textures", "items", "ultimate_book_expansion.png"), 16, 16, p16)

    p32v1 = upscale2(p16)
    add_emblem_rotated(p32v1, cx * 2 + 1, cy * 2 + 1, 2, theta)
    add_sparks(p32v1, [(52, 5, SPARK), (5, 50, SPARK2), (26, 3, SPARK2)])
    write_png(os.path.join(RP, "textures", "items", "ultimate_book_expansion_32.png"), 32, 32, p32v1)

    # ВАРИАНТ 2 (с нуля)
    p32v2 = render_v2(32, theta)
    add_star(p32v2, 25, 4)
    add_star(p32v2, 4, 27)
    write_png(os.path.join(RP, "textures", "items", "ultimate_book_expansion_v2.png"), 32, 32, p32v2)
    p16v2 = render_v2(16, theta)
    write_png(os.path.join(RP, "textures", "items", "ultimate_book_expansion_v2_16.png"), 16, 16, p16v2)

    print("\nВАРИАНТ 1 (16×16): $=эмблема(повёрнута) G=золото ==страницы :+#%=обложка")
    ascii_preview(p16)
    print("\nВАРИАНТ 2, с нуля (32×32):")
    ascii_preview(p32v2)
    print("\nВАРИАНТ 2 (16×16):")
    ascii_preview(p16v2)

    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(os.path.join(RP, "textures", "items", "ultimate_book_expansion.png"), "variant1/ultimate_book_expansion.png")
        z.write(os.path.join(RP, "textures", "items", "ultimate_book_expansion_32.png"), "variant1/ultimate_book_expansion_32.png")
        z.write(os.path.join(RP, "textures", "items", "ultimate_book_expansion_v2.png"), "variant2/ultimate_book_expansion_v2.png")
        z.write(os.path.join(RP, "textures", "items", "ultimate_book_expansion_v2_16.png"), "variant2/ultimate_book_expansion_v2_16.png")
        z.writestr("README.txt",
            "Ultimate Hammer — Книга «Расширение I»: ДВА варианта\n\n"
            "ВАРИАНТ 1 — ванильная book_enchanted (силуэт 1:1), перекраска по ролям\n"
            "(обложка→индиго-фиолет, страницы→пергамент, лента→золото) + эмблема\n"
            "3x3→5x3, ПОВЁРНУТАЯ по углу наклона книги (угол измерен PCA).\n\n"
            "ВАРИАНТ 2 — новая книга с нуля: индиго-обложка с градиентом, корешок\n"
            "со стежками, золотые угловые накладки, застёжка со скважиной, блок\n"
            "страниц с линиями, ленточка с V-вырезом, руна с молотом, искры.\n"
            "32×32 (основная) и 16×16 (ванильный паритет).\n\n"
            "Куда ставить: resource_packs/ultimate_hammer_rp/textures/items/\n"
            "ключи: ultimate_book_expansion / ultimate_book_expansion_v2\n")
    print("zip:", ZIP)
