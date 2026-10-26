"""Render every page of a project PDF to a small WebP, for the lightweight page-by-page reader on phones and slow connections.
usage: python tools/build-doc-pages.py <slug> <path-to-pdf>
Writes media/docs/pages/<slug>/001.webp ... and prints the numbers to put on the #doc element (data-pages, data-w, data-h).
The PDF itself is not modified. Needs PyMuPDF and Pillow."""
import fitz, io, os, sys
from PIL import Image
slug, pdf = sys.argv[1], sys.argv[2]
W = 900; Q = 68
out = os.path.join(os.path.dirname(__file__), "..", "media", "docs", "pages", slug)
os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))
d = fitz.open(pdf); total = 0; sizes = set()
for i, page in enumerate(d, 1):
    z = W / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    sizes.add((pix.width, pix.height))
    b = io.BytesIO(); im.save(b, "WEBP", quality=Q, method=6); data = b.getvalue(); total += len(data)
    open(os.path.join(out, f"{i:03d}.webp"), "wb").write(data)
w, h = sorted(sizes)[0]
print(f"{slug}: {d.page_count} pages, {round(total / 1e6, 2)} MB total, avg {round(total / d.page_count / 1024)} KB/page, distinct sizes {len(sizes)} -> data-pages=\"{d.page_count}\" data-w=\"{w}\" data-h=\"{h}\"")
