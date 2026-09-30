# Pixel diff of two screenshots, restricted to a box (default: the game pane
# area, left 1422×969 CSS px at DPR 2). Prints the count of differing pixels,
# the max channel delta, the rows (in cells) that differ, and writes a diff
# image with the differing pixels in magenta.
#   python3 perf/imgdiff.py a.png b.png out.png [x0 y0 x1 y1]
import sys
from PIL import Image, ImageChops
a = Image.open(sys.argv[1]).convert('RGB')
b = Image.open(sys.argv[2]).convert('RGB')
box = tuple(int(v) for v in sys.argv[4:8]) if len(sys.argv) >= 8 else (0, 0, 2844, 1938)
a = a.crop(box); b = b.crop(box)
d = ImageChops.difference(a, b)
px = d.load()
w, h = d.size
n = 0; mx = 0; rows = {}
for y in range(h):
    for x in range(w):
        p = px[x, y]
        m = max(p)
        if m > 0:
            n += 1; mx = max(mx, m)
            rows[y // 34] = rows.get(y // 34, 0) + 1
print(f'differing pixels: {n} of {w*h} ({100*n/(w*h):.3f}%), max channel delta {mx}')
print('rows (17 css px = 34 device px) with differences (row: pixels):', sorted(rows.items())[:60])
out = b.copy()
op = out.load()
for y in range(h):
    for x in range(w):
        if max(px[x, y]) > 0: op[x, y] = (255, 0, 255)
out.save(sys.argv[3])
