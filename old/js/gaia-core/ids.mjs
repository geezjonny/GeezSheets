import {sha256} from './sha256.mjs';
const randomInt=n=>{const a=new Uint32Array(1),limit=0x100000000-0x100000000%n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;};

export function newId(kind) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `${kind}_${Array.from({ length: 12 }, () => alphabet[randomInt(36)]).join('')}`;
}

// Same input, same id: lets the migration be re-run on a fresh export without renaming anything.
export function stableId(kind, key) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = Uint8Array.from(sha256(kind + '\0' + key).match(/../g), x => parseInt(x, 16));
  return `${kind}_${Array.from(bytes.subarray(0, 12), b => alphabet[b % 36]).join('')}`;
}

export function canonicalName(s) {
  return String(s).toLowerCase().trim().replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ').replace(/^(?:the|an|a)\s+/u, '').trim();
}
