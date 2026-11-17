# Regenerates public/brand/* from resources/brand/figuraid-logo-original.webp:
#   python3 scripts/brand-make.py resources/brand/figuraid-logo-original.webp public/brand
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()
# transparent: alpha from distance to white, un-premultiply colour
rgba = Image.new('RGBA', (W, H))
o = rgba.load()
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        a = 255 - min(r, g, b)
        if a < 12:
            o[x, y] = (0, 0, 0, 0); continue
        af = a / 255
        un = lambda c: max(0, min(255, round((c - 255 * (1 - af)) / af)))
        o[x, y] = (un(r), un(g), un(b), a)
def band_bbox(y0, y1):
    box = rgba.crop((0, y0, W, y1)).getbbox()
    return (box[0], box[1] + y0, box[2], box[3] + y0)
# find vertical bands of content
rows = [any(o[x, y][3] > 40 for x in range(0, W, 2)) for y in range(H)]
bands, inb = [], None
for y, on in enumerate(rows):
    if on and inb is None: inb = y
    if not on and inb is not None:
        if y - inb > 6: bands.append((inb, y))
        inb = None
print('bands', bands)
mark_b = band_bbox(*bands[0])
word_b = band_bbox(*bands[1])
full_b = rgba.getbbox()
from PIL import ImageFilter
def fill_holes(img):
    # transparent areas fully enclosed by the shape (globe lines, cursor) become solid white,
    # so the icon reads correctly on dark backgrounds too
    w, h = img.size
    a = img.getchannel('A').point(lambda v: 255 if v > 100 else 0)
    outside = Image.new('L', (w + 2, h + 2), 0)
    outside.paste(a, (1, 1))
    from PIL import ImageDraw
    ImageDraw.floodfill(outside, (0, 0), 128)
    holes = outside.crop((1, 1, w + 1, h + 1)).point(lambda v: 255 if v == 0 else 0).filter(ImageFilter.MaxFilter(3))
    white = Image.new('RGBA', (w, h), (255, 255, 255, 0))
    white.putalpha(holes)
    return Image.alpha_composite(white, img)
rgba = fill_holes(rgba)
mark = rgba.crop(mark_b); word = rgba.crop(word_b); full = rgba.crop(full_b)
full.save(f'{out}/logo-full.png', optimize=True)
mark.save(f'{out}/logo-mark.png', optimize=True)
# horizontal lockup: mark + wordmark, wordmark height = 55% of mark height
mh = 300
m = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)
wh = round(mh * 0.6)
w = word.resize((round(word.width * wh / word.height), wh), Image.LANCZOS)
gap = round(mh * 0.12)
lock = Image.new('RGBA', (m.width + gap + w.width, mh), (0, 0, 0, 0))
lock.paste(m, (0, 0), m); lock.paste(w, (m.width + gap, (mh - wh) // 2), w)
lock.save(f'{out}/logo-horizontal.png', optimize=True)
# dark-background variant: navy -> white, blue -> brighter blue
def recolor(img):
    d = img.copy(); p = d.load()
    for y in range(d.height):
        for x in range(d.width):
            r, g, b, a = p[x, y]
            if a == 0: continue
            if r > 200 and g > 200 and b > 200:  # white globe lines stay white
                continue
            if b > 140 and b - r > 90:      # brand blue
                p[x, y] = (77, 155, 255, a)
            elif r < 60 and g < 80 and b < 140:  # navy
                p[x, y] = (255, 255, 255, a)
    return d
recolor(lock).save(f'{out}/logo-horizontal-dark.png', optimize=True)
recolor(full).save(f'{out}/logo-full-dark.png', optimize=True)
# square icons from the mark on white
for size in (32, 180, 192, 512):
    can = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    s = round(size * 0.84)
    k = mark.resize((s, round(mark.height * s / mark.width)), Image.LANCZOS)
    can.paste(k, ((size - k.width) // 2, (size - k.height) // 2), k)
    can.save(f'{out}/icon-{size}.png', optimize=True)
print('mark', mark.size, 'word', word.size, 'lock', lock.size)
