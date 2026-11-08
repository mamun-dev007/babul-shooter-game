"""Generate the five separate transparent gift artwork PNGs.

Drawn with PIL to match the reference: blue/green/purple boxes, golden
chest and pink striped box, each in its own file (no card/button/background).
"""
from PIL import Image, ImageDraw
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "gifts")
os.makedirs(OUT, exist_ok=True)

S = 280  # 280x280 canvas, art centred with transparent margin

def new():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))

def bow(d, cx, cy, s, color, dark):
    # Two loops + two tails + centre knot.
    d.ellipse([cx - 34*s, cy - 26*s, cx - 2*s, cy + 2*s], fill=color, outline=dark, width=max(2, int(3*s)))
    d.ellipse([cx + 2*s, cy - 26*s, cx + 34*s, cy + 2*s], fill=color, outline=dark, width=max(2, int(3*s)))
    d.polygon([(cx - 6*s, cy + 2*s), (cx - 22*s, cy + 26*s), (cx - 8*s, cy + 28*s)], fill=dark)
    d.polygon([(cx + 6*s, cy + 2*s), (cx + 22*s, cy + 26*s), (cx + 8*s, cy + 28*s)], fill=dark)
    d.ellipse([cx - 7*s, cy - 8*s, cx + 7*s, cy + 8*s], fill=dark)

def shade(base, f):
    return tuple(max(0, min(255, int(c * f))) for c in base[:3]) + (255,)

def box(im, body, dark, light, ribbon, ribbon_dark):
    d = ImageDraw.Draw(im)
    cx, cy = S // 2, S // 2 + 18
    bw, bh = 150, 104
    # Soft shadow
    d.ellipse([cx - 78, cy + 52, cx + 78, cy + 72], fill=(0, 0, 0, 70))
    # Body with side shading
    d.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2], 10, fill=body + (255,))
    d.polygon([(cx, cy - bh // 2), (cx + bw // 2, cy - bh // 2), (cx + bw // 2, cy + bh // 2), (cx, cy + bh // 2)], fill=shade(body, 0.82))
    d.rectangle([cx - bw // 2, cy - bh // 2, cx, cy + bh // 2], fill=shade(body, 1.08))
    # Lid
    d.rounded_rectangle([cx - bw // 2 - 6, cy - bh // 2 - 22, cx + bw // 2 + 6, cy - bh // 2 + 6], 12, fill=dark + (255,))
    d.rounded_rectangle([cx - bw // 2 - 6, cy - bh // 2 - 22, cx + bw // 2 + 6, cy - bh // 2 + 2], 12, fill=light + (255,))
    # Ribbon vertical
    d.rectangle([cx - 11, cy - bh // 2 - 22, cx + 11, cy + bh // 2], fill=ribbon + (255,))
    d.rectangle([cx - 11, cy - bh // 2 - 22, cx - 2, cy + bh // 2], fill=shade(ribbon, 1.15))
    d.line([(cx, cy - bh // 2 - 22), (cx, cy + bh // 2)], fill=ribbon_dark + (255,), width=3)
    d.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2], 10, outline=dark + (255,), width=4)
    bow(d, cx, cy - bh // 2 - 22, 1.15, ribbon, ribbon_dark)
    return d, cx, cy

# 1 Blue
im = new()
d, cx, cy = box(im, (56, 170, 255), (14, 116, 233), (125, 211, 255), (255, 193, 40), (217, 119, 6))
for (x, y) in [(-38, -14), (-14, 14), (12, -6), (30, 20), (-8, 32)]:
    d.ellipse([cx + x - 6, cy + y - 6, cx + x + 6, cy + y + 6], fill=(255, 255, 255, 90))
im.save(os.path.join(OUT, "gift-blue.png"))

# 2 Green booster with gem dots
im = new()
d, cx, cy = box(im, (34, 197, 94), (21, 128, 61), (134, 239, 172), (239, 68, 68), (185, 28, 28))
gems = [(-44, -10, (59, 130, 246)), (-18, 16, (168, 85, 247)), (8, -14, (249, 115, 22)), (30, 12, (234, 179, 8)), (-34, 24, (236, 72, 153))]
for (x, y, c) in gems:
    d.ellipse([cx + x - 9, cy + y - 9, cx + x + 9, cy + y + 9], fill=c + (255,), outline=(255, 255, 255, 220), width=2)
    d.ellipse([cx + x - 3, cy + y - 4, cx + x + 1, cy + y - 1], fill=(255, 255, 255, 200))
im.save(os.path.join(OUT, "gift-green.png"))

# 3 Purple with gold trim
im = new()
d, cx, cy = box(im, (124, 58, 237), (76, 29, 149), (192, 132, 252), (255, 193, 40), (217, 119, 6))
for (x, y) in [(-46, -20), (46, -20), (-46, 30), (46, 30)]:
    d.rounded_rectangle([cx + x - 10, cy + y - 10, cx + x + 10, cy + y + 10], 4, outline=(255, 193, 40, 255), width=3)
    d.polygon([(cx + x, cy + y - 5), (cx + x - 5, cy + y + 4), (cx + x + 5, cy + y + 4)], fill=(255, 193, 40, 255))
im.save(os.path.join(OUT, "gift-purple.png"))

# 4 Golden fortune chest
im = new()
d = ImageDraw.Draw(im)
cx, cy = S // 2, S // 2 + 26
d.ellipse([cx - 84, cy + 52, cx + 84, cy + 74], fill=(0, 0, 0, 70))
# Dome lid
d.pieslice([cx - 80, cy - 70, cx + 80, cy + 30], 180, 360, fill=(217, 119, 6, 255))
d.pieslice([cx - 80, cy - 70, cx + 80, cy + 30], 180, 360, outline=(120, 53, 15, 255), width=4)
d.arc([cx - 80, cy - 70, cx + 80, cy + 30], 180, 360, fill=(255, 241, 168, 255), width=6)
# Body
d.rounded_rectangle([cx - 80, cy, cx + 80, cy + 62], 10, fill=(245, 158, 11, 255), outline=(120, 53, 15, 255), width=4)
d.rectangle([cx - 80, cy + 6, cx + 80, cy + 16], fill=(255, 193, 40, 255))
# Ribbons + gem lock
d.rectangle([cx - 12, cy - 70, cx + 12, cy + 62], fill=(219, 39, 119, 255))
d.ellipse([cx - 12, cy + 8, cx + 12, cy + 32], fill=(168, 85, 247, 255), outline=(255, 255, 255, 255), width=3)
d.polygon([(cx, cy + 12), (cx - 7, cy + 22), (cx + 7, cy + 22)], fill=(255, 255, 255, 255))
# Rivets
for x in (-62, -30, 30, 62):
    d.ellipse([cx + x - 5, cy + 40, cx + x + 5, cy + 50], fill=(255, 241, 168, 255), outline=(120, 53, 15, 255), width=2)
for x in (-50, 50):
    d.ellipse([cx + x - 5, cy - 40, cx + x + 5, cy - 30], fill=(255, 241, 168, 255), outline=(120, 53, 15, 255), width=2)
bow(d, cx, cy - 70, 1.0, (255, 193, 40), (217, 119, 6))
# Sparkles
for (x, y, s) in [(-95, -30, 10), (95, -10, 12), (-85, 30, 8), (90, 42, 9)]:
    d.polygon([(cx + x, cy + y), (cx + x + 3, cy + y + 3), (cx + x, cy + y + s), (cx + x - 3, cy + y + 3)], fill=(255, 241, 168, 230))
    d.polygon([(cx + x, cy + y), (cx + x - 3, cy + y + 3), (cx + x, cy + y + s), (cx + x + 3, cy + y + 3)], fill=(255, 241, 168, 230))
im.save(os.path.join(OUT, "gift-golden.png"))

# 5 Pink event striped
im = new()
d = ImageDraw.Draw(im)
cx, cy = S // 2, S // 2 + 18
d.ellipse([cx - 78, cy + 52, cx + 78, cy + 72], fill=(0, 0, 0, 70))
bw, bh = 150, 104
d.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2], 10, fill=(255, 145, 164, 255))
for i in range(-2, 3):
    x0 = cx + i * 34
    d.polygon([(x0, cy + bh // 2), (x0 + 14, cy + bh // 2), (x0 + 8, cy - bh // 2), (x0 - 6, cy - bh // 2)], fill=(249, 115, 22, 220))
d.rounded_rectangle([cx - bw // 2 - 6, cy - bh // 2 - 22, cx + bw // 2 + 6, cy - bh // 2 + 6], 12, fill=(244, 114, 182, 255), outline=(190, 24, 93, 255), width=4)
for i in range(-2, 3):
    x0 = cx + i * 34
    d.polygon([(x0, cy - bh // 2 - 22), (x0 + 12, cy - bh // 2 - 22), (x0 + 6, cy - bh // 2 + 6), (x0 - 6, cy - bh // 2 + 6)], fill=(251, 146, 60, 220))
d.rectangle([cx - 11, cy - bh // 2 - 22, cx + 11, cy + bh // 2], fill=(249, 115, 22, 255))
d.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2], 10, outline=(190, 24, 93, 255), width=4)
bow(d, cx, cy - bh // 2 - 22, 1.2, (249, 115, 22), (194, 65, 12))
# Confetti (kept inside the box)
cols = [(56, 189, 248), (250, 204, 21), (74, 222, 128), (244, 114, 182)]
import random
random.seed(5)
for _ in range(10):
    x = cx + random.randint(-60, 60)
    y = cy + random.randint(-40, 40)
    c = random.choice(cols)
    d.rectangle([x, y, x + 6, y + 3], fill=c + (220,))
im.save(os.path.join(OUT, "gift-pink.png"))

print("saved", sorted(os.listdir(OUT)))
