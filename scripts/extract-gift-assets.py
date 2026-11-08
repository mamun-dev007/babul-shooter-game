"""Extract individual gift artworks from the uploaded card screenshots.

Each source is a card screenshot; the crop below isolates the gift box
(inside the card border, above the footer/button). Corner flood-fill then
removes the card gradient background to transparency, and the result is
trimmed with transparent padding. One PNG per gift — no combined sheet.
"""
from PIL import Image, ImageDraw
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "src", "game", "gifts", "gift-img")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "gifts")
os.makedirs(OUT, exist_ok=True)

# (source file, output name, crop box l/t/r/b estimated from each screenshot)
JOBS = [
    ("Screenshot 2026-11-07 162244.png", "gift-blue.png", (18, 16, 115, 104)),
    ("Screenshot 2026-11-07 170141.png", "gift-green.png", (28, 36, 174, 140)),
    ("Screenshot 2026-11-07 170209.png", "gift-purple.png", (28, 46, 177, 160)),
    ("Screenshot 2026-11-07 170227.png", "gift-golden.png", (22, 32, 168, 158)),
    ("Screenshot 2026-11-07 170307.png", "gift-pink.png", (50, 38, 172, 128)),
    ("Screenshot 2026-11-07 170440.png", "gift-silver.png", (12, 8, 132, 90)),
    ("Screenshot 2026-11-07 170529.png", "gift-shell.png", (58, 8, 188, 102)),
    ("Screenshot 2026-11-07 170545.png", "gift-heart.png", (28, 22, 148, 108)),
    ("Screenshot 2026-11-07 170601.png", "gift-knot.png", (28, 18, 132, 102)),
    ("Screenshot 2026-11-07 170619.png", "gift-pod.png", (22, 18, 142, 102)),
    ("Screenshot 2026-11-07 170635.png", "gift-ice.png", (28, 8, 137, 98)),
]

def flood_transparent(im):
    rgba = im.convert("RGBA")
    w, h = rgba.size
    # Flood from all four corners; outline around each gift blocks leakage.
    for corner in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgba, corner, (0, 0, 0, 0), thresh=42)
    return rgba

for src, dest, box in JOBS:
    path = os.path.join(SRC, src)
    im = Image.open(path).convert("RGB").crop(box)
    rgba = flood_transparent(im)
    bbox = rgba.getbbox()
    if bbox:
        l, t, r, b = bbox
        pad = 8
        rgba = rgba.crop((max(0, l - pad), max(0, t - pad), min(rgba.width, r + pad), min(rgba.height, b + pad)))
    out = os.path.join(OUT, dest)
    rgba.save(out)
    print(dest, rgba.size)
