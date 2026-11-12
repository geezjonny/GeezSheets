#!/usr/bin/env python3
"""
Save the map picture out of each .dd2vtt file, e.g. to upload to Owlbear Rodeo.
The picture is copied byte for byte (no re-encoding); the .dd2vtt files are not changed.

Usage (from the GeezSheets folder, no installs needed):
    python tools/dd2vtt_images.py                       # battlemap/  ->  battlemap_images/
    python tools/dd2vtt_images.py maps out_folder       # any folder, any output folder
    python tools/dd2vtt_images.py battlemap out 70      # also scale every map to 70 px per square (needs: pip install pillow)

It prints each map's grid size: in Owlbear, set the map's grid to that many
squares across (or "pixels per square" to the number shown).
With a px value, each picture is resized to exactly squares x px, so the grid
still lines up and every map uses the same px per square (saved as WebP).
"""
import base64, io, json, sys
from pathlib import Path

src = Path(sys.argv[1] if len(sys.argv) > 1 else "battlemap")
out = Path(sys.argv[2]) if len(sys.argv) > 2 else src.parent / (src.name + "_images")
px = int(sys.argv[3]) if len(sys.argv) > 3 else None
if px:
    try:
        from PIL import Image
    except ImportError:
        sys.exit("Scaling needs Pillow. Run:  pip install pillow")
    Image.MAX_IMAGE_PIXELS = None  # big battle maps are fine
files = sorted(src.glob("*.dd2vtt"))
if not files:
    sys.exit(f"No .dd2vtt files in {src.resolve()}")

# file type from the first bytes, so the extension is right whatever the map was saved as
KINDS = [(b"\x89PNG", ".png"), (b"\xff\xd8", ".jpg"), (b"RIFF", ".webp"), (b"GIF8", ".gif")]
out.mkdir(parents=True, exist_ok=True)
print(f"{'map':40} {'squares':>9} {'px/square':>9}  file")
for f in files:
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        b64 = data.get("image", "")
        if b64.startswith("data:"):                 # "data:image/png;base64,...."
            b64 = b64.split(",", 1)[1]
        raw = base64.b64decode(b64)
        ext = next((e for magic, e in KINDS if raw.startswith(magic)), None)
        if not raw or not ext:
            print(f"{f.stem:40} skipped (no picture, or an unknown image type)"); continue
        res = data.get("resolution", {})
        size = res.get("map_size", {})
        sq = f"{size.get('x', '?'):g}x{size.get('y', '?'):g}" if size else "?"
        grid, note = res.get("pixels_per_grid", "?"), ""
        if px:
            if not size:
                print(f"{f.stem:40} skipped (no grid size in the file)"); continue
            im = Image.open(io.BytesIO(raw)); im.load()
            target = (round(size["x"] * px), round(size["y"] * px))
            # The picture spans map_size squares; its real px/square can differ from the file's pixels_per_grid.
            if im.size != (round(size["x"] * grid), round(size["y"] * grid)):
                note = f"  (picture was really {im.size[0] / size['x']:.1f} px/square, not {grid})"
            alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
            im = im.convert("RGBA" if alpha else "RGB")
            if im.size != target:
                im = im.resize(target, Image.LANCZOS)
            buf = io.BytesIO(); im.save(buf, "WEBP", quality=88, method=6)
            raw, ext, grid = buf.getvalue(), ".webp", px
        dest = out / (f.stem + ext)
        dest.write_bytes(raw)
        print(f"{f.stem:40} {sq:>9} {grid:>9}  {dest.name} ({len(raw) / 1048576:.1f} MB){note}")
    except Exception as e:
        print(f"{f.stem:40} failed: {e}")
print(f"\nSaved to {out.resolve()}")
