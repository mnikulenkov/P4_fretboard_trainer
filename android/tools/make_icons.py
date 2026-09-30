#!/usr/bin/env python3
"""Generates the legacy launcher PNGs (square + round) from the same fretboard
motif as res/drawable/ic_launcher_foreground.xml.

Requires Pillow (python3 -m pip install pillow). Re-run after changing the motif:
    python3 tools/make_icons.py
"""
import os

from PIL import Image, ImageDraw

# Same geometry/colors as ic_launcher_foreground.xml, on the dark app background.
BG = (26, 26, 26, 255)        # #1A1A1A
STRING = (176, 176, 176, 255) # #B0B0B0
FRET = (102, 102, 102, 255)   # #666666
DOT = (0, 204, 153, 255)      # #00CC99
STRINGS_Y = (38, 48, 58, 68)
FRETS_X = (40, 54, 68)
DOTS = ((47, 48), (61, 58))
DOT_R = 4.2

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
SS = 4  # supersampling factor

RES = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "..", "app", "src", "main", "res")


def draw_motif(size):
    px = size * SS
    scale = px / 108.0

    def v(units):
        return units * scale

    img = Image.new("RGBA", (px, px), BG)
    d = ImageDraw.Draw(img)
    for y in STRINGS_Y:
        d.line([(v(32), v(y)), (v(76), v(y))], fill=STRING, width=max(1, round(v(2))))
    for x in FRETS_X:
        d.line([(v(x), v(32)), (v(x), v(78))], fill=FRET, width=max(1, round(v(2.5))))
    for cx, cy in DOTS:
        r = v(DOT_R)
        d.ellipse([v(cx) - r, v(cy) - r, v(cx) + r, v(cy) + r], fill=DOT)
    return img.resize((size, size), Image.LANCZOS)


def circle_mask(img):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def main():
    for dpi, size in SIZES.items():
        out_dir = os.path.join(RES, f"mipmap-{dpi}")
        os.makedirs(out_dir, exist_ok=True)
        draw_motif(size).save(os.path.join(out_dir, "ic_launcher.png"))
        circle_mask(draw_motif(size)).save(os.path.join(out_dir, "ic_launcher_round.png"))
        print(f"wrote mipmap-{dpi} ({size}px)")


if __name__ == "__main__":
    main()
