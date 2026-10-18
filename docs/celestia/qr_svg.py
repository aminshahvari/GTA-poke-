# Machine-generated QR for the Celestia card, made with reportlab's QR encoder (reportlab.graphics.barcode.qrencoder,
# a port of the reference QR implementation). Writes an SVG of the exact module grid: error correction M, 4-module quiet zone.
# Usage: python3 -I qr_svg.py <url> <out.svg> [level: L|M|Q|H]
import sys
from reportlab.graphics.barcode import qrencoder as q

url, out = sys.argv[1], sys.argv[2]
level = getattr(q.QRErrorCorrectLevel, sys.argv[3] if len(sys.argv) > 3 else 'M')
qr = q.QRCode(None, level)  # None: the smallest version that fits
qr.addData(url)
qr.make()
n, quiet = qr.getModuleCount(), 4
size = n + 2 * quiet
rects = ''.join(f'<rect x="{c + quiet}" y="{r + quiet}" width="1" height="1"/>' for r in range(n) for c in range(n) if qr.isDark(r, c))
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" shape-rendering="crispEdges">'
       f'<rect width="{size}" height="{size}" fill="#ffffff"/><g fill="#000000">{rects}</g></svg>')
open(out, 'w').write(svg)
print(f'version {(n - 17) // 4}, {n}x{n} modules + {quiet}-module quiet zone = {size} units, level {sys.argv[3] if len(sys.argv) > 3 else "M"}')
