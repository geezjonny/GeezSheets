// Match Gaia's Firebase transport: numeric and reserved keys are escaped.
export const encodeKey = key => String(key).replace(/[%\u0000-\u001f\u007f.#$\[\]\/]|^\d+$/g,
  value => [...value].map(char => '%' + char.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(''));
const decodeKey = key => key.replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
export function encodeTree(value) {
  if (value && typeof value === 'object' && !Object.keys(value).length) return { '%EMPTY': Array.isArray(value) ? 'array' : 'object' };
  if (Array.isArray(value)) return value.map(encodeTree);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [encodeKey(key), encodeTree(child)]));
  return value;
}
export function decodeTree(value) {
  if (value && typeof value === 'object' && Object.keys(value).length === 1 && value['%EMPTY']) return value['%EMPTY'] === 'array' ? [] : {};
  if (Array.isArray(value)) return value.map(decodeTree);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([key]) => key !== '%EMPTY').map(([key, child]) => [decodeKey(key), decodeTree(child)]);
    return value['%EMPTY'] === 'array' ? Object.assign([], Object.fromEntries(entries)) : Object.fromEntries(entries);
  }
  return value;
}
export function decodeEvent(type, message) {
  const path = value => value.split('/').map(decodeKey).join('/');
  return { path: path(message.path), data: type === 'patch'
    ? Object.fromEntries(Object.entries(message.data).map(([key, value]) => [path(key), decodeTree(value)])) : decodeTree(message.data) };
}
