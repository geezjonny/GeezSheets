// NPC status: GM truth vs what players believe, both saved through Gaia.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../geez-index.html',import.meta.url),'utf8');
const pick=name=>{const i=html.indexOf(name);assert(i>0,name);return html.slice(i,html.indexOf('\n',i));};
const src=['normStatus','statusText','playerStatus'].map(n=>pick(`const ${n} =`)).join('\n');
const statusTagSrc=html.slice(html.indexOf('function statusTag(tr)'),html.indexOf('const tokenSize ='));
const make=PLAYER=>new Function('PLAYER',src+'\n'+statusTagSrc+'\nreturn {statusTag,playerStatus};')(PLAYER);
const gm=make(false),pl=make(true);
assert.equal(gm.statusTag({status:'Dead'}),'Dead');
assert.equal(gm.statusTag({status:'Dead',knownStatus:'Unknown'}),'Dead · players: ?');
assert.equal(pl.statusTag({status:'Dead',knownStatus:'Unknown'}),'?');
assert.equal(pl.statusTag({status:'Captive'}),'Captive');
assert.equal(pl.statusTag({status:'Deceased'}),'Dead');
assert.equal(pl.statusTag({}),'Alive');
assert.equal(pl.playerStatus({status:'Dead',knownStatus:'Alive'}),'Alive');
assert(html.includes('<option value="Unknown">? Unknown</option>'));
assert(html.includes("({knownStatus, ...rest}) => ({...rest, status: playerStatus(t.traits)})"),'party copies hide the GM truth');
console.log('PASS NPC status: GM truth, players-believe layer, "?" for unknown, legacy Deceased, party copies hide truth');
