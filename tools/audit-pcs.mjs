// Audit and level the PCs. Dry run by default (reads the snapshot, writes nothing).
//   node tools/audit-pcs.mjs [--snapshot file] [--to-level daddies=5,disney=4] [--only Name] [--report docs/pc-audit.md]
//   node tools/audit-pcs.mjs --apply [--only Name]     plans from the LIVE data and writes to Firebase
//   node tools/audit-pcs.mjs --restore Name            puts that PC's data back from the snapshot
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planCharacter } from '../js/levelup.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? true : process.argv[i + 1]); };
const BASE = 'https://geezsheets-default-rtdb.firebaseio.com/v2/worlds/gaia/entities';
const json = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const srd = { classLevels: json('data/class_levels.json'), classes: json('data/classes.json'), spells: json('data/spells.json'), skills: json('data/skills.json') };
const custom = json('data/subclass_features.json');
const targets = Object.fromEntries(String(arg('to-level', 'daddies=5,disney=4')).split(',').map((p) => p.split('=')).map(([k, v]) => [k, +v]));
const only = arg('only', null), apply = process.argv.includes('--apply');
const snapFile = arg('snapshot', 'docs/backup-pcs-2026-11-21.json');
const snapshot = json(snapFile);
const isPc = (e) => e && e.kind === 'pc' && !e.data?._sheetsDeleted;
const put = async (url, body, method = 'PUT') => {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${url} -> ${r.status} ${await r.text()}`);
};

if (arg('restore', null)) {
  const e = Object.values(snapshot).find((x) => isPc(x) && x.name.toLowerCase() === String(arg('restore')).toLowerCase());
  if (!e) throw new Error('No such PC in the snapshot');
  await put(`${BASE}/${e.id}/data.json`, e.data);
  console.log(`Restored ${e.name} from ${snapFile}`); process.exit(0);
}

const lines = [], summary = [];
const out = (s = '') => { console.log(s); lines.push(s); };
const pcs = Object.values(snapshot).filter(isPc).filter((e) => !only || e.name.toLowerCase() === String(only).toLowerCase())
  .sort((a, b) => (a.campaign || '').localeCompare(b.campaign || '') || a.name.localeCompare(b.name));
out(`# PC audit ${apply ? '(APPLY)' : '(dry run)'}\n\nSnapshot: ${snapFile}. Rules: 2014. Targets: ${JSON.stringify(targets)}\n`);

for (const snap of pcs) {
  let entity = snap;
  if (apply) { const r = await fetch(`${BASE}/${snap.id}.json`); entity = await r.json(); }
  const target = targets[entity.campaign] ?? entity.data.level;
  const plan = planCharacter(entity.data, target, srd, custom);
  out(`## ${entity.name} (${entity.campaign}) ${entity.data.class} / ${entity.data.subclass}, level ${entity.data.level} -> ${plan.data.level}`);
  out(`Attacks: ${plan.attacks.normal} per Attack action${plan.attacks.round1 !== plan.attacks.normal ? `, ${plan.attacks.round1} on round 1` : ''}`);
  for (const l of plan.log) out(`- FIX ${l}`);
  for (const l of plan.choices) out(`- CHOOSE ${l}`);
  for (const l of [...new Set(plan.review)]) out(`- REVIEW ${l}`);
  out(`Sections changed: ${plan.changed.join(', ') || 'none'}\n`);
  summary.push([entity.name, plan.log.length, plan.review.length]);
  if (apply && plan.changed.length) {
    for (const k of plan.changed) {
      const a = plan.data[k], b = entity.data[k];
      if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const patch = Object.fromEntries(Object.entries(a).filter(([kk, v]) => JSON.stringify(v) !== JSON.stringify(b[kk])));
        await put(`${BASE}/${entity.id}/data/${k}.json`, patch, 'PATCH');
      } else await put(`${BASE}/${entity.id}/data/${k}.json`, a);
    }
    await put(`${BASE}/${entity.id}/meta.json`, { updated_at: new Date().toISOString(), updated_by: 'levelup-tool' }, 'PATCH');
    const after = await (await fetch(`${BASE}/${entity.id}/data.json`)).json();
    const again = planCharacter(after, target, srd, custom);
    out(`Verified: ${again.changed.length ? 'STILL CHANGES ' + again.changed.join(',') : 'second pass finds nothing left to fix'}\n`);
  }
}
out('## Summary\n');
for (const [n, f, r] of summary) out(`- ${n}: ${f} fixes, ${r} to review`);
const rep = arg('report', null);
if (rep) fs.writeFileSync(path.join(root, rep), lines.join('\n') + '\n');
