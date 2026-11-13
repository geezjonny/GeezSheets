"""Rerun: python tools/render_props.py [--source PATH] [--scratch PATH].
Requires Blender 5.2 and Pillow. Copies source assets into an isolated temporary
project; never imports or writes in the source project. Renders authored GLBs
with a strictly vertical orthographic camera, then adds a soft shadow/rim in Pillow.
"""
import argparse, json, os, pathlib, shutil, subprocess
from PIL import Image, ImageFilter, ImageDraw, ImageEnhance

ROOT = pathlib.Path(__file__).resolve().parents[1]
IDS = 'altar barrel bed bench bone_pile bookshelf campfire candelabra cauldron chains chair chest coffin crate gravestone iron_cage ladder light rug skull_pillar spike_trap stairs statue stool table torch_sconce'.split()
SIZES = {k: (1, 2 if k in ('bed', 'coffin', 'rug', 'ladder') else 3 if k == 'stairs' else 1) for k in IDS}

def effects(im, kind):
    """Freeze the source's live fire / green cauldron effects into map-scale marks."""
    points = {'campfire': [(128,128,29)], 'candelabra': [(61,114,5),(128,114,5),(195,114,5)],
              'torch_sconce': [(128,142,11)], 'altar': [(128,78,5)]}.get(kind, [])
    fx = Image.new('RGBA', im.size)
    d = ImageDraw.Draw(fx)
    for x,y,r in points:
        for radius in range(r*3,0,-1):
            d.ellipse((x-radius,y-radius,x+radius,y+radius), fill=(255,122,26,int(75*(1-radius/(r*3+1)))))
    im.alpha_composite(fx.filter(ImageFilter.GaussianBlur(3)))
    fx = Image.new('RGBA', im.size); d = ImageDraw.Draw(fx)
    for x,y,r in points:
        for dx,dy,s in ([(-12,8,.65),(13,6,.6),(0,-12,.8),(0,0,1)] if kind == 'campfire' else [(0,0,1)]):
            rr = r*s
            d.polygon([(x+dx-rr,y+dy),(x+dx-rr*.35,y+dy-rr*.8),(x+dx+rr*.3,y+dy-rr*1.15),(x+dx+rr,y+dy),(x+dx+rr*.3,y+dy+rr*.7)], fill='#ed6a19')
            d.ellipse((x+dx-rr*.53,y+dy-rr*.5,x+dx+rr*.55,y+dy+rr*.5),fill='#ffc65a')
            d.ellipse((x+dx-rr*.22,y+dy-rr*.25,x+dx+rr*.25,y+dy+rr*.2),fill='#fff2b6')
    if kind == 'cauldron':
        # Keep the authored bone/stirrer readable above a translucent luminous broth.
        for radius in range(47,0,-1):
            d.ellipse((128-radius,128-radius,128+radius,128+radius), fill=(94,170,47,80+int((47-radius)*1.4)))
        for x,y,r in [(113,107,5),(144,119,3),(137,148,6),(109,133,3)]:
            d.ellipse((x-r,y-r,x+r,y+r),outline=(189,235,108,205),width=2)
    im.alpha_composite(fx)
    return im

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--post-only', action='store_true', help='Reuse existing raw renders for sprite/preview adjustments')
    ap.add_argument('--source', default=str(ROOT.parent / 'godot-vtt'))
    ap.add_argument('--scratch', default=os.path.join(os.environ['TEMP'], 'claude', 'C--Users-jg-Documents-GitHub-GeezSheets', 'e7aef6c7-1b43-434a-b628-bd7738615fcb', 'scratchpad', 'proprender'))
    args = ap.parse_args()
    scratch = pathlib.Path(args.scratch)
    scratch.mkdir(parents=True, exist_ok=True)
    (scratch / 'assets').mkdir(exist_ok=True)
    (scratch / 'raw').mkdir(exist_ok=True)
    source = pathlib.Path(args.source) / 'assets/kit/props'
    for f in source.iterdir():
        if f.suffix in ('.glb', '.webp', '.png') and any(f.stem == k or f.stem.startswith(k + '_') for k in IDS):
            shutil.copy2(f, scratch / 'assets' / f.name)
    blender_script = '''import bpy, math, pathlib
from mathutils import Vector, Matrix
scratch = pathlib.Path(%SCRATCH%)
ids = %IDS%
for kind in ids:
    if kind == 'light': continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.image_settings.color_mode = 'RGBA'
    sc.world = bpy.data.worlds.new('Ambient')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs[0].default_value = (.48,.52,.62,1)
    sc.world.node_tree.nodes['Background'].inputs[1].default_value = .7
    sc.view_settings.view_transform = 'AgX'
    bpy.ops.import_scene.gltf(filepath=str(scratch/'assets'/(kind+'.glb')))
    objs = list(sc.objects)
    if kind == 'ladder':
        rot = Matrix.Rotation(math.pi/2, 4, 'X')
        for o in objs:
            if o.parent is None: o.matrix_world = rot @ o.matrix_world
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(v) for o in objs if o.type == 'MESH' for v in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c = (lo+hi)/2
    cells = 2 if kind in ('bed','coffin','rug','ladder') else 3 if kind == 'stairs' else 1
    width = max(1.04,(hi.x-lo.x)*1.12,(hi.y-lo.y)/cells*1.12)
    bpy.ops.object.camera_add(location=(c.x,c.y,hi.z+12))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = width*cells
    sc.camera = cam
    for pos,energy,size in [((-3,-4,8),650,5),((4,3,6),450,4)]:
        bpy.ops.object.light_add(type='AREA',location=c+Vector(pos))
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (c-light.location).to_track_quat('-Z','Y').to_euler()
    sc.render.resolution_x = 512
    sc.render.resolution_y = 512*cells
    sc.render.resolution_percentage = 100
    sc.render.filepath = str(scratch/'raw'/(kind+'.png'))
    bpy.ops.render.render(write_still=True)
'''
    (scratch/'render_blender.py').write_text(blender_script.replace('%SCRATCH%', repr(str(scratch))).replace('%IDS%',repr(IDS)), encoding='utf-8')
    if not args.post_only:
        subprocess.run([r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe', '--background', '--factory-startup', '--python', str(scratch/'render_blender.py')], check=True, timeout=1200, stdout=(scratch/'blender.log').open('w'), stderr=subprocess.STDOUT)
    out = ROOT / 'props'
    out.mkdir(exist_ok=True)
    for k in IDS:
        w, h = SIZES[k]
        if k == 'light':
            im = Image.new('RGBA', (256, 256))
            d = ImageDraw.Draw(im)
            for r in range(70, 4, -1):
                d.ellipse((128-r,128-r,128+r,128+r), fill=(255,181+int((70-r)*0.8),100+int((70-r)*2),int(160*(1-r/71)**0.6)))
            d.ellipse((118,118,138,138), fill=(255,247,214,255))
        else:
            im = Image.open(scratch / 'raw' / (k+'.png')).convert('RGBA').resize((w*256,h*256), Image.Resampling.LANCZOS)
            # Lift textured dark wood/iron enough to remain readable on dark floors.
            alpha = im.getchannel('A')
            im = ImageEnhance.Brightness(im).enhance(1.22)
            im.putalpha(alpha)
            rim = alpha.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))
            rim = rim.point(lambda a: int(a * .28))
            shadow = alpha.filter(ImageFilter.GaussianBlur(6)).point(lambda a: int(a*.5))
            base = Image.new('RGBA', im.size, (0,0,0,0))
            layer = Image.new('RGBA', im.size, (3,2,5,0)); layer.putalpha(shadow)
            base.alpha_composite(layer, (2,4))
            layer = Image.new('RGBA', im.size, (188,179,158,0)); layer.putalpha(rim)
            base.alpha_composite(layer); base.alpha_composite(im); im = base
        im = effects(im, k)
        # Retain true RGBA output while limiting colour entropy / file size.
        alpha = im.getchannel('A')
        im = im.quantize(colors=192, method=Image.Quantize.FASTOCTREE).convert('RGBA')
        im.putalpha(alpha)
        im.save(out / (k+'.png'), optimize=True)
    entries = []
    for k in IDS:
        light = {'range': 4 if k != 'campfire' else 6, 'color': '#79d34e' if k == 'cauldron' else '#ffb35c'} if k in ('campfire','candelabra','torch_sconce','light','cauldron') else None
        tag = 'light' if k in ('campfire','candelabra','torch_sconce','light') else 'furniture' if k in ('bed','bench','bookshelf','chair','chest','stool','table','crate','barrel') else 'decor' if k in ('rug','statue','cauldron') else 'dungeon'
        entries.append(dict(id=k, name=k.replace('_',' ').title(), src='props/'+k+'.png', w=SIZES[k][0], h=SIZES[k][1], light=light, blocks=k in ('bookshelf','iron_cage','statue','skull_pillar'), tags=[tag]))
    (ROOT/'js/props.js').write_text('// Dark-fantasy top-down props for battle maps. One cell represents 5 feet.\n// Used by index.html. PNGs have transparent backgrounds at 256 pixels per cell.\n// Add a prop by dropping a PNG in props/ and listing its footprint and light here.\nwindow.GEEZ_PROPS = '+json.dumps(entries, indent=2)+';\n', encoding='utf-8')
    preview = Image.new('RGB', (1050, 1020), '#292c30')
    d = ImageDraw.Draw(preview)
    for y in range(0,1020,35):
        for x in range(-35,1050,70):
            xx = x + (35 if y//35%2 else 0)
            d.rectangle((xx,y,xx+68,y+33), fill=(46+(x+y)%7,47+(x+y)%7,49+(x+y)%7), outline='#222427')
    for i,k in enumerate(IDS):
        x,y = (i%7)*150, (i//7)*250
        w,h = SIZES[k]
        im = Image.open(out/(k+'.png')).resize((w*70,h*70), Image.Resampling.LANCZOS)
        preview.paste(im,(x+(150-im.width)//2,y+12),im)
        d.text((x+8,y+225), k, fill='#ddd4c3')
    preview.save(scratch.parent/'props_preview.png')
    print('Preview:', scratch.parent/'props_preview.png')
    print('Total sprites:', len(IDS), 'Largest PNG:', max((out/(k+'.png')).stat().st_size for k in IDS))

if __name__ == '__main__':
    main()
