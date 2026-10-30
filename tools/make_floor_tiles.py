"""Seeded, toroidal dark-fantasy floor textures (Python 3.10+, Pillow, NumPy).
Run: python tools/make_floor_tiles.py [--preview PATH]
All fields and geometry wrap; no edge-copy strips or nonperiodic filters.
"""
from pathlib import Path
import argparse
import hashlib
import numpy as np
from PIL import Image, ImageDraw

SIZE = 128
ROOT = Path(__file__).resolve().parents[1]
MATERIALS = {
    'grass': ('Mossy grass', (49, 59, 40)),
    'dirt': ('Packed earth', (76, 63, 48)),
    'mud': ('Mud', (54, 47, 39)),
    'sand': ('Ashen sand', (105, 96, 75)),
    'wood': ('Dark planks', (68, 51, 37)),
    'stone': ('Flagstones', (69, 71, 67)),
    'cobble': ('Cobblestone', (71, 73, 68)),
    'tile': ('Dungeon tiles', (65, 67, 64)),
    'marble': ('Dark marble', (45, 49, 52)),
    'water': ('Deep water', (27, 43, 44)),
    'shallow': ('Shallow water', (48, 65, 59)),
    'ice': ('Cracked ice', (85, 104, 111)),
    'snow': ('Old snow', (142, 147, 144)),
    'lava': ('Lava crust', (38, 34, 32)),
    'swamp': ('Swamp', (42, 48, 33)),
    'carpet': ('Faded crimson carpet', (69, 32, 33)),
    'bone': ('Crypt bones and ash', (63, 60, 54)),
    'void': ('Void mist', (16, 14, 23)),
    'gravel': ('Gravel', (69, 66, 60)),
    'moss': ('Mossy ruins', (58, 64, 49)),
}
MATERIALS['tile'] = ('Checkered tiles', MATERIALS['tile'][1])
# These come from the godot-vtt project's painted textures (512px, seamless) when it's next to this repo:
# tiled 3x3, downscaled, centre cropped so the wrap stays seamless. (key -> file, brightness, saturation)
GODOT = ROOT.parent / 'godot-vtt' / 'assets' / 'textures'
IMPORTS = {'wood': ('floor_wood.png', 1, 1), 'tile': ('floor_tile.png', 1, 1), 'dirt': ('floor_dirt.png', 1, 1), 'carpet': ('floor_carpet.png', .72, .7)}
y, x = np.mgrid[0:SIZE, 0:SIZE].astype(float)


def imported(key):
    file, bright, sat = IMPORTS[key]
    src = GODOT / file
    if not src.exists():
        print(f'warning: {src} not found, generating {key} instead'); return None
    from PIL import ImageEnhance
    im = Image.open(src).convert('RGB'); w, h = im.size
    big = Image.new('RGB', (w * 3, h * 3))
    for i in range(3):
        for j in range(3): big.paste(im, (i * w, j * h))
    big = big.resize((SIZE * 3, SIZE * 3), Image.LANCZOS).crop((SIZE, SIZE, SIZE * 2, SIZE * 2))
    if bright != 1 or sat != 1: big = ImageEnhance.Color(ImageEnhance.Brightness(big).enhance(bright)).enhance(sat)
    return big

def noise(rng, scale):
    """Periodic smooth value noise sampled on a torus."""
    g = rng.normal(size=(scale, scale))
    u, v = x * scale / SIZE, y * scale / SIZE
    ix, iy = u.astype(int), v.astype(int)
    a, b = u-ix, v-iy
    a, b = a*a*(3-2*a), b*b*(3-2*b)
    return ((1-a)*(1-b)*g[iy,ix] + a*(1-b)*g[iy,(ix+1)%scale]
            + (1-a)*b*g[(iy+1)%scale,ix] + a*b*g[(iy+1)%scale,(ix+1)%scale])

def delta(a, b):
    return (a-b+SIZE/2) % SIZE-SIZE/2

def cells(rng, count, regular=False):
    if regular:
        n = int(count**.5)
        pts = [((i+.24)*SIZE/n+rng.uniform(-5,5), (j+.31)*SIZE/n+rng.uniform(-5,5)) for j in range(n) for i in range(n)]
    else:
        pts = []
        while len(pts) < count:
            px, py = rng.uniform(0, SIZE, 2)
            if all(delta(px,qx)**2 + delta(py,qy)**2 > (SIZE / count**.5 * .5)**2 for qx,qy in pts):
                pts.append((px,py))
    wx = x + noise(rng, 8)*1.4 + noise(rng,32)*.35
    wy = y + noise(rng, 8)*1.4 + noise(rng,32)*.35
    distances = np.array([delta(wx,px)**2+delta(wy,py)**2 for px,py in pts])
    order = np.argsort(distances,axis=0)
    d = np.take_along_axis(distances,order[:2],axis=0)**.5
    return order[0], d[0], d[1]-d[0]

def make(key, base):
    rng = np.random.default_rng(int.from_bytes(hashlib.sha256(key.encode()).digest()[:8],'little'))
    broad, medium, fine = noise(rng,4), noise(rng,16), noise(rng,48)
    grain = rng.normal(0,1,(SIZE,SIZE))
    field = broad*3+medium*2+fine*1.4+grain*.8
    rgb = np.empty((SIZE,SIZE,3)); rgb[:] = base
    rgb += field[:,:,None]
    def tint(mask, color, strength=1):
        nonlocal rgb
        a = np.clip(mask*strength,0,1)[:,:,None]
        rgb = rgb*(1-a)+np.array(color)*a
    if key in ('stone','cobble','tile','moss'):
        count = {'stone':9,'cobble':36,'tile':16,'moss':9}[key]
        ids, dist, gap = cells(rng,count,True)
        shades = rng.uniform(-7,7,count)
        rgb += shades[ids,None]
        if key == 'tile':
            # Slightly irregular square joints, deliberately offset from tile borders.
            dx = np.abs((x+9+medium*.2)%32-16)
            dy = np.abs((y+5+broad*.3)%32-16)
            joint = np.minimum(dx,dy)
        else:
            joint = gap if key != 'cobble' else np.minimum(gap-1.0, (11.8-dist)*2)
        tint(np.clip(1-joint/2,0,1), (30,32,28), .8)
        tint(np.exp(-((joint-2.2)/1.2)**2), (96,97,87), .19)
        if key == 'moss': tint(np.clip(broad+medium*.3-.1,0,1),(42,57,30),.6)
    elif key == 'wood':
        seam = np.abs((y+7)%32-16)
        rgb += (np.sin(x*2*np.pi/128*15 + noise(rng,4)*2+np.sin(y*2*np.pi/128)*2)*2)[:,:,None]
        tint(np.exp(-(seam/.85)**2),(25,22,18),.9)
        for row in range(4):
            end = (row*47+21)%128
            mask = (np.abs(delta(x,end))<.8)&(((y+7)//32)%4==row)
            tint(mask,(27,23,19),.8)
    elif key in ('marble','ice','lava'):
        _, dist, gap = cells(rng,14)
        crack = np.exp(-(gap/(.55 if key != 'lava' else .65))**2)
        if key == 'marble':
            veins = np.exp(-(np.sin(x*2*np.pi/128*2 + broad*1.2+np.sin(y*2*np.pi/128))/.15)**2)
            tint(veins,(95,97,93),.26)
            tint(crack,(22,26,29),.7)
        elif key == 'ice':
            tint(crack,(152,171,176),.65)
            tint(np.exp(-((gap-1.5)/.6)**2),(43,66,76),.25)
        else:
            tint(np.exp(-(gap/3)**2),(105,43,22),.7)
            tint(crack,(199,90,31),.84)
            tint(np.clip(fine*.5,0,1),(22,23,22),.5)
    elif key in ('water','shallow','swamp'):
        ripple = np.sin(y*2*np.pi/128*8 + broad*2 + np.sin(x*2*np.pi/128)*2)
        tint(np.clip(ripple-.7,0,1),(87,107,96),.35)
        if key == 'shallow':
            _, dist, gap = cells(rng,38)
            tint(np.clip(gap/5,0,1),(75,84,71),.38)
            tint(np.exp(-(gap/1.1)**2),(29,45,41),.45)
        if key == 'swamp': tint(np.clip(broad+medium*.3,0,1),(66,61,34),.65)
    elif key == 'carpet':
        # Use periods dividing 128 for seamless thread structure.
        weave = ((x%2==0).astype(float)-(y%2==0).astype(float))*1.5
        rgb += weave[:,:,None]
        motif = np.cos(x*2*np.pi/32)*np.cos(y*2*np.pi/32)
        tint(np.clip(motif-.4,0,1),(98,63,53),.25)
    elif key == 'grass':
        tint(np.clip(medium+broad*.5,0,1),(32,44,27),.55)
        for _ in range(230):
            px,py = rng.uniform(0,128,2)
            dx,dy = delta(x,px),delta(y,py)
            blade = np.exp(-((dx+dy*.4)/.55)**2-(dy/2.3)**2)
            tint(blade,(78,84,51),.32)
    elif key == 'void': tint(np.clip(broad*.6,0,1),(39,29,48),.45)
    elif key == 'snow': tint(np.clip(broad*.4+medium*.3,0,1),(107,119,120),.4)
    else:
        if key == 'mud': tint(np.clip(broad-.1,0,1),(36,35,29),.6)
        if key == 'sand': rgb += (np.sin(y*2*np.pi/16 + broad)*1.5)[:,:,None]
        count = 120 if key == 'gravel' else 25
        if key in ('dirt','gravel','bone'):
            for _ in range(count):
                px,py = rng.uniform(0,128,2)
                rx = rng.uniform(.7,2.3); ry = rng.uniform(.7,1.8)
                dx,dy = delta(x,px),delta(y,py)
                d = (dx/rx)**2+(dy/ry)**2
                tint(np.exp(-d/1.7),(28,28,25),.4)
                tint(np.clip(1-d,0,1),(104,101,87),.65)
        if key == 'bone':
            for _ in range(15):
                px,py = rng.uniform(0,128,2); angle=rng.uniform(0,np.pi)
                dx,dy=delta(x,px),delta(y,py)
                u=dx*np.cos(angle)+dy*np.sin(angle); v=-dx*np.sin(angle)+dy*np.cos(angle)
                length=rng.uniform(2,5)
                shape=(np.abs(u)<length)&(np.abs(v)<.85)
                knobs=(np.abs(u)>length-1)&(np.abs(u)<length+.7)&(np.abs(v)<1.5)
                tint(shape|knobs,(139,132,110),.75)
    return Image.fromarray(np.uint8(np.clip(rgb,0,255)))

def preview(images, path):
    # Each labeled panel is a full 3x3 repeat at native resolution.
    w,h=404,416
    sheet=Image.new('RGB',(w*4,h*5),(22,23,26)); draw=ImageDraw.Draw(sheet)
    for i,(key,img) in enumerate(images.items()):
        ox,oy=(i%4)*w+10,(i//4)*h+26
        draw.text((ox,oy-19),MATERIALS[key][0],fill=(208,207,199))
        for j in range(3):
            for k in range(3): sheet.paste(img,(ox+k*SIZE,oy+j*SIZE))
    path=Path(path); path.parent.mkdir(parents=True,exist_ok=True); sheet.save(path)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview',type=Path)
    args=parser.parse_args()
    out=ROOT/'textures'/'floor'; out.mkdir(parents=True,exist_ok=True)
    images={}
    for key,(name,base) in MATERIALS.items():
        img=(key in IMPORTS and imported(key)) or make(key,base); path=out/(key+'.png'); img.save(path,optimize=True)
        images[key]=img
        avg=np.rint(np.asarray(img).mean(axis=(0,1))).astype(int)
        color='#'+''.join(f'{c:02x}' for c in avg)
        assert path.stat().st_size<40000
        # Compare wrap gradients to interior gradients: a boundary is one normal pixel step.
        a=np.asarray(img).astype(float)
        wrap=max(np.abs(a[:,0]-a[:,-1]).mean(),np.abs(a[0]-a[-1]).mean())
        print(f'{key:8} {path.stat().st_size:6} bytes {color} wrap-step={wrap:.2f}')
    if args.preview: preview(images,args.preview)

if __name__=='__main__': main()
