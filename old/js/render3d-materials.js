// 3D Materials & Textures -- shared texture/material/model loading for
// Three.js-based map renderers. Extracted unchanged (behaviorally) from
// viewer.html so any other 3D tool -- a future GM 3D editor, most likely --
// can reuse this exact, working logic instead of re-deriving it.
//
// REQUIRES THREE (and, for token models, THREE.GLTFLoader) to already be
// loaded as globals before this module runs -- same convention viewer.html
// itself uses:
//   <script src=".../three.min.js"></script>
//   <script src=".../loaders/GLTFLoader.js"></script>
// This file does not import THREE itself, and does not assume any
// particular caller's global variable names -- every external need (a
// terrain-color table, a Firebase db instance, a GLTFLoader, a callback for
// "a model just finished loading, please re-render") is an explicit
// parameter. That's the whole point of pulling this out: a new HTML file
// can use these functions correctly without knowing anything about how
// viewer.html itself is structured.

export function makeTexture(img) {
  const tex = new THREE.Texture(img);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Terrain material cache + getter. Tries ./textures/<id>.png, mutating the
 * material in place once the image loads (so every mesh already using it
 * updates together); falls back to a flat color from the caller's own
 * terrainColor table if the texture 404s.
 * @param {Object<string, (string|number|THREE.Color)>} terrainColor - terrain id -> color, used as the fallback before/absent a texture.
 * @returns {{getTerrainMaterial: (terrainId: string) => THREE.MeshStandardMaterial, cache: Object}}
 */
export function createTerrainMaterialCache(terrainColor) {
  const cache = {}; // terrain id -> MeshStandardMaterial (mutated in place once an image loads)
  function getTerrainMaterial(terrainId) {
    if (cache[terrainId]) return cache[terrainId];
    const color = terrainColor[terrainId] || new THREE.Color(0x444444);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
    cache[terrainId] = material;

    const img = new Image();
    img.onload = () => {
      const tex = makeTexture(img);
      material.map = tex;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    };
    img.onerror = () => { /* keep the flat terrain color -- same fallback the 2D editors use */ };
    img.src = `./textures/${terrainId}.png`;

    return material;
  }
  return { getTerrainMaterial, cache };
}

/**
 * Token billboard-material cache + getter. Tries ./tokens/<name>.png,
 * falling back to an RTDB-uploaded base64 portrait (js/assets.js's own
 * fallback path), falling back further to a plain gold disc if neither
 * exists.
 * @param {Object} [opts]
 * @param {import("firebase/database").Database} [opts.db] - enables the RTDB-uploaded-portrait fallback. Omit to skip straight to the plain disc on a 404.
 * @returns {{getTokenMaterial: (tok: {lookupName?, name?, characterId?}) => THREE.MeshBasicMaterial, cache: Object}}
 */
export function createTokenMaterialCache({ db } = {}) {
  const cache = {}; // cacheKey -> MeshBasicMaterial (billboard face)
  function getTokenMaterial(tok) {
    const lookupName = tok.lookupName || tok.name || tok.characterId || 'token';
    const cacheKey = tok.characterId === '__npc__' && tok.name ? `__npc__:${tok.name.toLowerCase()}` : (tok.characterId || lookupName);
    if (cache[cacheKey]) return cache[cacheKey];

    const material = new THREE.MeshBasicMaterial({ color: 0xc8a84b, transparent: true });
    cache[cacheKey] = material;

    const fname = lookupName.toLowerCase().replace(/\s+/g, '_');
    const img = new Image();
    img.onload = () => {
      const tex = makeTexture(img);
      material.map = tex;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    };
    img.onerror = () => {
      if (!db) return; // no RTDB fallback wired up -- keep the plain colored disc
      // js/assets.js falls back to an RTDB-hosted base64 upload next -- same fallback here.
      import("https://www.gstatic.com/firebasejs/11.1.0/firebase-database.js").then(({ get, ref: dbRef }) => {
        get(dbRef(db, `assets/uploads/tokens/${cacheKey}`)).then(snap => {
          const b64 = snap.val();
          if (!b64) return; // no art anywhere -- keep the plain colored disc
          const i = new Image();
          i.onload = () => {
            const tex = makeTexture(i);
            material.map = tex;
            material.color.set(0xffffff);
            material.needsUpdate = true;
          };
          i.src = b64;
        });
      });
    };
    img.src = `./tokens/${fname}.png`;

    return material;
  }
  return { getTokenMaterial, cache };
}

/**
 * Token 3D-model (.glb) cache + loader. Tries ./tokens/<name>.glb; on
 * failure the caller's own flat-billboard fallback (createTokenMaterialCache
 * above) is expected to already be showing, so no fallback logic lives here.
 * @param {Object} opts
 * @param {THREE.GLTFLoader} opts.gltfLoader
 * @param {(cacheKey: string) => void} [opts.onLoaded] - called once a model finishes loading, so the caller can re-render whatever was showing the flat-disc fallback in its place.
 * @returns {{ensureTokenModelLoaded: (cacheKey: string, fname: string) => void, cache: Object}}
 */
export function createTokenModelCache({ gltfLoader, onLoaded } = {}) {
  const cache = {}; // cacheKey -> 'loading' | THREE.Object3D (template scene, cloned per instance) | 'error'
  function ensureTokenModelLoaded(cacheKey, fname) {
    if (cache[cacheKey]) return; // already loading, loaded, or errored
    cache[cacheKey] = 'loading';
    gltfLoader.load(
      `./tokens/${fname}.glb`,
      (gltf) => { cache[cacheKey] = gltf.scene; if (onLoaded) onLoaded(cacheKey); },
      undefined,
      () => { cache[cacheKey] = 'error'; } // no callback -- the disc fallback is already showing
    );
  }
  return { ensureTokenModelLoaded, cache };
}

/**
 * Prop voxel-model cache + loader. Tries ./props/<id>.json (the voxel
 * format prop-maker's own save format produces: {voxels:[{x,y,z,c}]}),
 * normalizing to the voxels actually used (not the full declared grid) so
 * sizing to a prop's w/h/height is exact. X/Z are centered around the
 * template's local origin to match how a prop gets positioned at the
 * center of its footprint; Y is NOT centered -- it rests on the floor
 * (spans 0..height), matching the flat-box fallback's own convention.
 * @param {Object} [opts]
 * @param {(propId: string) => void} [opts.onLoaded] - called once a voxel model finishes loading.
 * @returns {{ensurePropVoxelLoaded: (propId: string) => void, cache: Object}}
 */
export function createPropVoxelCache({ onLoaded } = {}) {
  const cache = {}; // propId -> 'loading' | THREE.Group (template, cloned per instance) | 'error'
  function ensurePropVoxelLoaded(propId) {
    if (cache[propId]) return; // already loading, loaded, or errored
    cache[propId] = 'loading';
    fetch(`props/${propId}.json`)
      .then(res => { if (!res.ok) throw new Error('not found'); return res.json(); })
      .then(data => {
        const voxelList = data.voxels || [];
        if (!voxelList.length) { cache[propId] = 'error'; return; }
        let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const v of voxelList) {
          minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
          minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
          minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
        }
        const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
        const template = new THREE.Group();
        const usedX = maxX - minX + 1, usedZ = maxZ - minZ + 1;
        for (const v of voxelList) {
          const mesh = new THREE.Mesh(cubeGeo, new THREE.MeshLambertMaterial({ color: v.c || '#c8a84b' }));
          mesh.position.set(v.x - minX - usedX / 2 + 0.5, v.y - minY + 0.5, v.z - minZ - usedZ / 2 + 0.5);
          template.add(mesh);
        }
        template.userData.usedSize = { x: usedX, y: maxY - minY + 1, z: usedZ };
        cache[propId] = template;
        if (onLoaded) onLoaded(propId);
      })
      .catch(() => { cache[propId] = 'error'; }); // no voxel model -- caller should fall back to the PNG box below
  }
  return { ensurePropVoxelLoaded, cache };
}

/**
 * Prop flat-box material cache + getter -- the fallback used when a prop
 * has no voxel model (createPropVoxelCache above). Tries ./props/<id>.png,
 * mutating the material in place once loaded; falls back to a flat gold
 * placeholder color if the PNG 404s too.
 * @returns {{getPropBoxMaterial: (propId: string) => THREE.MeshBasicMaterial, cache: Object}}
 */
export function createPropBoxMaterialCache() {
  const cache = {}; // propId -> MeshBasicMaterial (mutated in place once the PNG loads, same live-swap pattern as terrain textures)
  function getPropBoxMaterial(propId) {
    if (cache[propId]) return cache[propId];
    const material = new THREE.MeshBasicMaterial({ color: 0xc8a84b, transparent: true });
    cache[propId] = material;
    const img = new Image();
    img.onload = () => { material.map = makeTexture(img); material.color.set(0xffffff); material.needsUpdate = true; };
    img.onerror = () => { /* keep the flat color -- no png, just a placeholder */ };
    img.src = `props/${propId}.png`;
    return material;
  }
  return { getPropBoxMaterial, cache };
}
