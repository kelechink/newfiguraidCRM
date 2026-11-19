# Rebuilds the Figuraid logo as clean vector artwork (SVG) from the original raster, by tracing each colour layer.
#   python3 scripts/brand-vector.py resources/brand/figuraid-logo-original.webp public/brand
# Produces: logo-horizontal.svg (light backgrounds), logo-horizontal-dark.svg (dark backgrounds), logo-mark.svg,
# plus crisp PNG fallbacks rendered from the SVGs.
import os, re, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
SCALE = 3  # trace at 3x for smooth curves
im = Image.open(src).convert('RGB')
W, H = im.size

def bbox_of(mask_img, box):
    b = mask_img.crop(box).getbbox()
    return (b[0] + box[0], b[1] + box[1], b[2] + box[0], b[3] + box[1])

def ink(px):
    r, g, b = px
    return min(r, g, b) < 200

ink_mask = im.point(lambda v: 0).convert('L')
ink_mask = Image.eval(im.convert('L'), lambda v: 255 if v < 215 else 0)
mark_box = bbox_of(ink_mask, (0, 80, W, 590))
word_box = bbox_of(ink_mask, (0, 600, W, 775))
mark, word = im.crop(mark_box), im.crop(word_box)

# Lock-up layout (same proportions as the PNG version): mark height 300, wordmark 60% of it, gap 12%.
mh = 300 * SCALE
m = mark.resize((round(mark.width * mh / mark.height), mh), Image.LANCZOS)
wh = round(mh * 0.6)
w = word.resize((round(word.width * wh / word.height), wh), Image.LANCZOS)
gap = round(mh * 0.12)
CW, CH = m.width + gap + w.width, mh
canvas = Image.new('RGB', (CW, CH), (255, 255, 255))
canvas.paste(m, (0, 0)); canvas.paste(w, (m.width + gap, (mh - wh) // 2))

def classify(img):
    px = img.load()
    blue = Image.new('1', img.size, 0); navy = Image.new('1', img.size, 0)
    bp, np_ = blue.load(), navy.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = px[x, y]
            if b - r > 70 and b > 110:
                bp[x, y] = 1
            elif r < 90 and g < 100 and b < 150 and (b - r) < 90:
                np_[x, y] = 1
    return blue, navy

def holes(shape):
    """White areas fully enclosed by a shape (globe lines, cursor)."""
    L = shape.convert('L')
    pad = Image.new('L', (L.width + 2, L.height + 2), 0); pad.paste(L, (1, 1))
    ImageDraw.floodfill(pad, (0, 0), 128)
    return pad.crop((1, 1, L.width + 1, L.height + 1)).point(lambda v: 255 if v == 0 else 0).convert('1')

def trace(mask, name, tmp):
    pbm = os.path.join(tmp, name + '.pbm'); svg = os.path.join(tmp, name + '.svg')
    Image.eval(mask.convert('L'), lambda v: 0 if v else 255).convert('1').save(pbm)  # potrace traces black
    subprocess.run(['potrace', pbm, '-s', '-o', svg, '-t', '120', '-a', '1.0', '-O', '0.4', '-u', '10'], check=True)
    txt = open(svg).read()
    g = re.search(r'<g transform="([^"]+)"[^>]*>(.*?)</g>', txt, re.S)
    return g.group(1), re.findall(r'<path d="([^"]+)"', g.group(2))

def svg_doc(layers, vb):
    body = ''.join(f'<g transform="{t}" fill="{c}" stroke="none">' + ''.join(f'<path d="{d}"/>' for d in ds) + '</g>' for t, ds, c in layers)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb[0]} {vb[1]}" role="img" aria-label="Figuraid Ltd"><title>Figuraid Ltd</title>{body}</svg>\n'

with tempfile.TemporaryDirectory() as tmp:
    blue, _ = classify(canvas)
    mark_w = m.width + gap // 2
    blue_mark = Image.new('1', blue.size, 0); blue_mark.paste(blue.crop((0, 0, mark_w, CH)), (0, 0))
    # Wordmark: take all ink by lightness (solid strokes, no colour fringes), then colour it by column:
    # the run of columns that is mostly blue is "AID"; everything else (FIGUR, LTD) is navy.
    ink = Image.eval(canvas.convert('L'), lambda v: 255 if v < 150 else 0).convert('1')
    bpx, ipx = blue.load(), ink.load()
    cols = []
    for x in range(mark_w, CW):
        n = sum(1 for y in range(CH) if ipx[x, y]); nb = sum(1 for y in range(CH) if bpx[x, y])
        cols.append(n > 0 and nb > 0.5 * n)
    xs = [mark_w + i for i, c in enumerate(cols) if c]
    a0, a1 = xs[0], xs[-1] + 1  # AID spans from first to last mostly-blue column
    word_ink = Image.new('1', ink.size, 0); word_ink.paste(ink.crop((mark_w, 0, CW, CH)), (mark_w, 0))
    blue_word = Image.new('1', ink.size, 0); blue_word.paste(word_ink.crop((a0, 0, a1, CH)), (a0, 0))
    navy = word_ink.copy(); navy.paste(Image.new('1', (a1 - a0, CH), 0), (a0, 0))
    solid_mark = blue_mark.convert('L').filter(ImageFilter.MaxFilter(3)).point(lambda v: 255 if v > 0 else 0).convert('1')
    hole = holes(solid_mark)
    layers = {n: trace(mk, n, tmp) for n, mk in [('mark', blue_mark), ('holes', hole), ('navy', navy), ('aid', blue_word)]}

palettes = {
    'logo-horizontal.svg': {'mark': '#075BBC', 'holes': '#FFFFFF', 'navy': '#021E52', 'aid': '#075BBC'},
    'logo-horizontal-dark.svg': {'mark': '#1F6FE5', 'holes': '#FFFFFF', 'navy': '#FFFFFF', 'aid': '#4C8DFF'},
}
for fname, pal in palettes.items():
    order = ['mark', 'holes', 'navy', 'aid']
    open(os.path.join(out, fname), 'w').write(svg_doc([(layers[k][0], layers[k][1], pal[k]) for k in order], (CW, CH)))
# mark only (cropped viewBox)
open(os.path.join(out, 'logo-mark.svg'), 'w').write(svg_doc([(layers['mark'][0], layers['mark'][1], '#075BBC'), (layers['holes'][0], layers['holes'][1], '#FFFFFF')], (m.width, CH)))
print('canvas', CW, CH, {k: len(v[1]) for k, v in layers.items()})
