"""Extraer el isotipo del PDF oficial sin reconstruir ni alterar sus trazados."""
import argparse
from pathlib import Path
import fitz

parser = argparse.ArgumentParser()
parser.add_argument('manual')
parser.add_argument('--refresh', action='store_true')
args = parser.parse_args()
source = fitz.open(args.manual)
target = fitz.open()
page = target.new_page(width=256, height=256)
page.draw_rect(page.rect, color=None, fill=(247/255, 238/255, 227/255))
page.show_pdf_page(fitz.Rect(63, 40, 193, 216), source, 2, clip=fitz.Rect(350, 212, 402, 282), keep_proportion=True)
folder = Path('public/brand/icons')
folder.mkdir(parents=True, exist_ok=True)
svg = folder / 'favicon.svg'
if args.refresh or not svg.exists():
    svg.write_text(page.get_svg_image(text_as_path=True))
for size in (32, 180, 192, 512):
    filename = folder / f'app-{size}.png'
    if args.refresh or not filename.exists():
        page.get_pixmap(matrix=fitz.Matrix(size/256, size/256)).save(str(filename))
print('Isotipo extraído a tamaños de aplicación; proporciones originales y margen conservados.')
