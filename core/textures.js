// core/textures.js — the one texture registry both floor tiles and walls
// (and eventually anything else with a surface) look up by name. Validated
// as a working prototype in light-test.html before being ported here.
//
// Path convention: flat, ./assets/<name>.png -- no subfolder.
//
// Renderer-agnostic on purpose: this loads a plain browser Image, nothing
// three.js-specific. render2d/ can drawImage() the Image directly. render3d/
// wraps the SAME Image into a THREE.Texture (new THREE.Texture(img);
// texture.needsUpdate = true) instead of loading the PNG a second time via
// THREE.TextureLoader -- light-test.html's prototype double-fetched every
// asset (once per view); this version fetches once and both views derive
// from it.

const ASSET_PATH = 'assets';

/** @typedef {Object} TextureDef
 *  @property {string} name
 *  @property {'loading'|'loaded'|'error'} status
 *  @property {HTMLImageElement|null} img
 */

/** name -> TextureDef */
export const textureDefs = {};

/**
 * Registers a texture by name if not already registered, kicking off the
 * (single) image load. Returns the (possibly still-loading) TextureDef
 * immediately; call again later or use onChange to react once it resolves.
 * Safe to call repeatedly with the same name -- a no-op after the first call
 * other than re-firing selection in the caller.
 *
 * @param {string} rawName
 * @param {(def: TextureDef) => void} [onChange] - called on load or error
 * @returns {TextureDef|null} null if rawName is empty
 */
export function ensureTexture(rawName, onChange) {
  const name = (rawName || '').trim().toLowerCase();
  if (!name) return null;
  if (textureDefs[name]) return textureDefs[name];

  const def = { name, status: 'loading', img: null };
  textureDefs[name] = def;

  const img = new Image();
  img.onload = () => {
    def.status = 'loaded';
    def.img = img;
    if (onChange) onChange(def);
  };
  img.onerror = () => {
    def.status = 'error';
    if (onChange) onChange(def);
  };
  img.src = `${ASSET_PATH}/${name}.png`;

  return def;
}

/** Convenience lookup that doesn't register anything. */
export function getTexture(name) {
  return textureDefs[(name || '').trim().toLowerCase()] || null;
}
