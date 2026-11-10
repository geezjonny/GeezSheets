// A stand-in for the Firebase Realtime Database (compat API) that talks to GeezTabletop's local
// database server (godot-vtt/tools/localdb/server.mjs) over Firebase's REST + streaming API.
// Pages use it with ?db=local (the server's own address) or ?db=http://host:port.
// Only what GeezSheets uses: ref(path).on/off('value'), set, update, push, remove, transaction,
// plus .info/connected and .info/serverTimeOffset.
(function () {
    const PUSH = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let lastPush = 0, lastRand = [];
    function pushId(now = Date.now()) {
        let t = now, head = '';
        for (let i = 0; i < 8; i++) { head = PUSH[t % 64] + head; t = Math.floor(t / 64); }
        if (now === lastPush) { let i = 11; while (i >= 0 && lastRand[i] === 63) lastRand[i--] = 0; if (i >= 0) lastRand[i]++; }
        else lastRand = Array.from({ length: 12 }, () => Math.floor(Math.random() * 64));
        lastPush = now;
        return head + lastRand.map(n => PUSH[n]).join('');
    }
    const split = p => String(p || '').split('/').filter(Boolean);
    const copy = v => v == null ? null : JSON.parse(JSON.stringify(v));
    function setIn(tree, parts, value) {
        if (!parts.length) return value ?? null;
        const root = tree && typeof tree === 'object' ? tree : {};
        let o = root;
        for (const k of parts.slice(0, -1)) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
        if (value == null) delete o[parts.at(-1)]; else o[parts.at(-1)] = value;
        return Object.keys(root).length ? root : null;
    }
    function snapshot(key, value) { return { key, val: () => copy(value), exists: () => value != null }; }

    window.GeezLocalDb = function (base) {
        base = String(base).replace(/\/$/, '');
        const url = parts => `${base}/${parts.map(encodeURIComponent).join('/')}.json`;
        const send = (method, parts, body) => fetch(url(parts), { method, body: body === undefined ? undefined : JSON.stringify(body) })
            .then(r => { if (!r.ok) throw new Error(`Local database said ${r.status}`); return r.json(); });
        let connected = false;
        const connWatchers = new Set();
        const setConnected = on => { if (on !== connected) { connected = on; connWatchers.forEach(f => f(snapshot('connected', on))); } };
        // One stream of the whole database, shared by every listener: browsers allow only six
        // connections to a server, and GeezSheets listens to many paths (Firebase multiplexes too).
        let mirror = null, loaded = false, stream = null;
        const watchers = new Set();   // {parts, cb, last}
        const getIn = parts => parts.reduce((o, k) => (o == null || typeof o !== 'object' ? null : o[k] ?? null), mirror);
        const tell = (w, force) => {
            const v = getIn(w.parts), s = JSON.stringify(v);
            if (!force && s === w.last) return;
            w.last = s;
            w.cb(snapshot(w.parts.at(-1) || null, v));
        };
        function startStream() {
            if (stream) return;
            stream = new EventSource(url([]));
            const apply = (kind, e) => {
                const { path: at, data } = JSON.parse(e.data);
                const p = split(at);
                if (kind === 'patch') for (const [k, v] of Object.entries(data || {})) mirror = setIn(mirror, [...p, ...split(k)], v);
                else mirror = setIn(mirror, p, data);
                const first = !loaded;
                loaded = true;
                watchers.forEach(w => tell(w, first && w.last === undefined));
            };
            stream.addEventListener('put', e => apply('put', e));
            stream.addEventListener('patch', e => apply('patch', e));
            stream.onopen = () => setConnected(true);
            stream.onerror = () => setConnected(false);
        }

        function ref(path) {
            const parts = split(path);
            const key = parts.at(-1) || null;
            const listeners = new Map();
            const self = {
                key,
                child: p => ref([...parts, ...split(p)].join('/')),
                on(event, cb, onError) {
                    if (event !== 'value') throw new Error('Only value events are supported locally');
                    if (parts[0] === '.info') {
                        if (parts[1] === 'connected') { connWatchers.add(cb); cb(snapshot('connected', connected)); return cb; }
                        cb(snapshot(parts[1], 0)); return cb;   // serverTimeOffset: same clock
                    }
                    const w = { parts, cb, last: undefined };
                    watchers.add(w);
                    listeners.set(cb, w);
                    startStream();
                    if (loaded) tell(w, true);
                    return cb;
                },
                off(event, cb) {
                    if (cb) { const w = listeners.get(cb); if (w) watchers.delete(w); listeners.delete(cb); connWatchers.delete(cb); }
                    else { listeners.forEach(w => watchers.delete(w)); listeners.clear(); }
                },
                once(event) { return send('GET', parts).then(v => snapshot(key, v)); },
                set: v => send('PUT', parts, v ?? null).then(() => undefined),
                update: obj => send('PATCH', parts, obj).then(() => undefined),
                remove: () => send('DELETE', parts).then(() => undefined),
                push(v) {
                    const r = ref([...parts, pushId()].join('/'));
                    if (v !== undefined) { const p = r.set(v); r.then = p.then.bind(p); r.catch = p.catch.bind(p); }
                    return r;
                },
                // Not atomic (one GM at the table); good enough for local testing.
                async transaction(fn) {
                    const now = await send('GET', parts);
                    const next = fn(copy(now));
                    if (next === undefined) return { committed: false, snapshot: snapshot(key, now) };
                    await send('PUT', parts, next);
                    return { committed: true, snapshot: snapshot(key, next) };
                },
            };
            return self;
        }
        return { ref, local: true, base };
    };
    // ?db=local → this page's own server; ?db=http://host:port → that server.
    window.GeezLocalDbUrl = function () {
        const v = new URLSearchParams(location.search).get('db');
        if (!v) return null;
        return v === 'local' ? location.origin : v;
    };
})();
