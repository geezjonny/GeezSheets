# Builds data/monsters.js: the SRD 5.1 stat blocks encounters use, trimmed, from GeezSheets' monsters.json.
# Run from the repo root: python tools/make-monsters.py   (SRD 5.1, CC BY 4.0, Wizards of the Coast)
import json, re
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / 'data' / 'monsters.json'
OUT = Path(__file__).resolve().parents[1] / 'data' / 'monsters.js'
WANT = '''wolf dire-wolf giant-spider giant-wolf-spider owlbear bandit bandit-captain boar giant-boar deer elk brown-bear black-bear
goblin hobgoblin bugbear orc gnoll worg ogre hill-giant troll griffon harpy goat giant-goat manticore wyvern young-red-dragon
winter-wolf polar-bear ice-mephit young-white-dragon giant-frog giant-toad lizardfolk crocodile will-o-wisp ghoul zombie green-hag
swarm-of-insects shambling-mound jackal hyena giant-hyena giant-scorpion mummy giant-crab sahuagin merrow thug guard veteran scout
skeleton ghost wight shadow specter commoner acolyte priest knight noble giant-eagle cultist cult-fanatic swarm-of-ravens
werewolf-human werewolf-hybrid werewolf-wolf wererat-human dryad centaur'''.split()

def short(s, n=320):
    s = re.sub(r'\s+', ' ', s or '').strip()
    return s if len(s) <= n else s[:n - 1].rsplit(' ', 1)[0] + '…'

def ac(m):
    a = m.get('armor_class') or [{}]
    a = a[0] if isinstance(a, list) else {'value': a}
    return a.get('value', 10)

def speed(m):
    return ', '.join(f"{k} {v}" if k != 'walk' else v for k, v in (m.get('speed') or {}).items() if isinstance(v, str))

def senses(m):
    return ', '.join(f"{k.replace('_', ' ')} {v}" for k, v in (m.get('senses') or {}).items())

mons = {x['index']: x for x in json.load(open(SRC, encoding='utf-8'))}
out = {}
for k in WANT:
    m = mons[k]
    out[k] = {
        'name': m['name'], 'size': m['size'], 'type': m['type'], 'ac': ac(m), 'hp': m['hit_points'], 'hd': m.get('hit_points_roll') or m.get('hit_dice'),
        'speed': speed(m), 'ab': [m[a] for a in ('strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma')],
        'cr': m['challenge_rating'], 'xp': m['xp'], 'senses': senses(m), 'lang': m.get('languages') or '',
        'traits': [[a['name'], short(a.get('desc'))] for a in m.get('special_abilities', [])][:4],
        'actions': [[a['name'], short(a.get('desc'))] for a in m.get('actions', [])][:5],
    }
OUT.parent.mkdir(exist_ok=True)
OUT.write_text('// SRD 5.1 stat blocks (CC BY 4.0, Wizards of the Coast), trimmed by tools/make-monsters.py. Do not edit by hand.\n'
               'export const MONSTERS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
print(len(out), 'monsters,', OUT.stat().st_size // 1024, 'KB')
