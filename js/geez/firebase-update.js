import { encodeTree, decodeTree } from './firebase-codec.js';

const timeout = () => AbortSignal.timeout(15000);

// Read `url` with its version, let `edit(value)` change it, and save only if nobody else saved first.
// `edit` returns { result, write }: `write` is what to save (default: the edited value) and `write: null` skips
// the save (retry receipts). A version conflict re-reads and tries again, up to 3 times.
// `raw: true` skips the Firebase key encoding, for callers that already handle it.
export async function updateConditionally(url, edit, conflictMessage, { raw = false } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' }, signal: timeout() });
    if (!response.ok) throw new Error(`Firebase returned ${response.status}`);
    const etag = response.headers.get('ETag');
    if (!etag) throw new Error('Firebase did not return a version; no changes saved.');
    const json = await response.json(), value = raw ? json : decodeTree(json);
    const { result, write = value } = await edit(value);
    if (write === null) return result;
    const saved = await fetch(url, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag },
      body: JSON.stringify(raw ? write : encodeTree(write)), signal: timeout()
    });
    if (saved.status === 412) continue;
    if (!saved.ok) throw new Error(`Firebase returned ${saved.status}`);
    return result;
  }
  throw new Error(conflictMessage);
}
