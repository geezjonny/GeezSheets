#!/usr/bin/env python3
"""
Shrink .dd2vtt battle maps by re-saving the map picture inside them as WebP.
Walls, doors, lights and grid stay exactly the same; only the picture changes.

Usage (from the GeezSheets folder):
    pip install pillow
    python tools/dd2vtt_to_webp.py                 # converts everything in battlemap/
    python tools/dd2vtt_to_webp.py battlemap 80    # folder, quality (1-100, default 82)

Originals are copied to battlemap_original/ first, so nothing is lost.
Files that are already WebP, or that wouldn't get smaller, are left alone.
"""
import base64, io, json, shutil, sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing. Run:  pip install pillow")

Image.MAX_IMAGE_PIXELS = None  # big battle maps are fine

folder = Path(sys.argv[1] if len(sys.argv) > 1 else "battlemap")
quality = int(sys.argv[2]) if len(sys.argv) > 2 else 82
backup = folder.parent / (folder.name + "_original")

files = sorted(folder.glob("*.dd2vtt"))
if not files:
    sys.exit(f"No .dd2vtt files in {folder.resolve()}")

mb = lambda n: f"{n / 1048576:.1f} MB"
before = after = 0
for f in files:
    size = f.stat().st_size
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
        img_b64 = data.get("image", "")
        prefix = ""
        if img_b64.startswith("data:"):            # "data:image/png;base64,...."
            prefix, img_b64 = img_b64.split(",", 1)
        if img_b64.startswith("UklGR"):
            print(f"  skip  {f.name}  (already WebP, {mb(size)})"); before += size; after += size; continue
        im = Image.open(io.BytesIO(base64.b64decode(img_b64)))
        im.load()
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        if has_alpha and im.getchannel("A").getextrema() == (255, 255):
            has_alpha = False                       # alpha channel that's fully opaque: drop it
        im = im.convert("RGBA" if has_alpha else "RGB")
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=quality, method=6)
        new_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        if len(new_b64) >= len(img_b64):
            print(f"  skip  {f.name}  (WebP wasn't smaller)"); before += size; after += size; continue
        data["image"] = new_b64                     # raw base64, like Dungeondraft/DA write it
        backup.mkdir(exist_ok=True)
        if not (backup / f.name).exists():
            shutil.copy2(f, backup / f.name)
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        tmp.replace(f)
        new = f.stat().st_size
        before += size; after += new
        print(f"  done  {f.name}  {mb(size)} -> {mb(new)}  ({im.width}x{im.height})")
    except Exception as e:
        before += size; after += size
        print(f"  FAIL  {f.name}: {e}")

print(f"\n{len(files)} maps: {mb(before)} -> {mb(after)}")
if backup.exists():
    print(f"Originals saved in {backup}/ (delete it once the maps look right, and don't push it to GitHub).")
