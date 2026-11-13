# Builds data/items.js: SRD 5.1 equipment (with prices) and magic items (with rarity) for shop stock,
# from GeezSheets' equipment.json / magic_items.json. Run from the repo root: python tools/make-items.py
# (SRD 5.1, CC BY 4.0, Wizards of the Coast)
import json
from pathlib import Path

GS = Path(__file__).resolve().parents[2] / 'data'  # GeezSheets/data (this folder lives inside GeezSheets)
OUT = Path(__file__).resolve().parents[1] / 'data' / 'items.js'
UNIT = {'cp': .01, 'sp': .1, 'ep': .5, 'gp': 1, 'pp': 10}

def group(x):
    if x.get('weapon_category'): return f"weapon/{x['weapon_category'].lower()}/{(x.get('weapon_range') or '').lower()}"
    if x.get('armor_category'): return f"armor/{x['armor_category'].lower()}"
    g = x.get('gear_category') or {}
    if isinstance(g, dict) and g.get('index'): return 'gear/' + g['index']
    if x.get('tool_category'): return 'tool/' + x['tool_category'].lower().replace("'", '').replace(' ', '-')
    if x.get('vehicle_category'): return 'ride/' + x['vehicle_category'].lower().split(',')[0].replace(' ', '-')
    return 'other'

items = []
for x in json.load(open(GS / 'equipment.json', encoding='utf-8')):
    c = x.get('cost') or {}
    gp = round(c.get('quantity', 0) * UNIT.get(c.get('unit'), 1), 3)
    if gp <= 0: continue
    n, g = x['name'], group(x)
    if g in ('gear/arcane-foci', 'gear/druidic-foci'): n = f"{n} (arcane focus)" if 'arcane' in g else f"{n} (druidic focus)"
    if g == 'gear/holy-symbols': n = f'Holy symbol ({n.lower()})'
    items.append({'n': n, 'g': g, 'gp': gp, 'wt': x.get('weight') or 0})
magic = []
for x in json.load(open(GS / 'magic_items.json', encoding='utf-8')):
    r = (x.get('rarity') or {}).get('name', '')
    if r in ('Artifact', 'Varies', ''): continue  # variants (Potion of Healing, Weapon +1...) carry their own rarity
    magic.append({'n': x['name'].replace('�', 'x'), 'r': r.lower(), 'c': (x.get('equipment_category') or {}).get('index', '')})
OUT.write_text('// SRD 5.1 equipment and magic items (CC BY 4.0, Wizards of the Coast), from tools/make-items.py. Do not edit by hand.\n'
               '// ITEMS: { n: name, g: group (weapon/martial/melee, armor/heavy, gear/standard-gear, tool/artisans-tools, ride/...), gp: price, wt: lb }\n'
               '// MAGIC: { n: name, r: rarity, c: category }\n'
               'export const ITEMS = ' + json.dumps(items, ensure_ascii=False, separators=(',', ':')) + ';\n'
               'export const MAGIC = ' + json.dumps(magic, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(len(items), 'items,', len(magic), 'magic items,', OUT.stat().st_size // 1024, 'KB')
