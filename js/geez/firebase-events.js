// Firebase stream paths are relative to the location being watched.
export function applyFirebaseEvent(value, type, message) {
  if (!['put', 'patch'].includes(type) || typeof message?.path !== 'string' || !message.path.startsWith('/')) throw new Error('Invalid Firebase event.');
  if (type === 'patch' && (!message.data || typeof message.data !== 'object' || Array.isArray(message.data))) throw new Error('Invalid Firebase patch.');
  const changes = type === 'patch'
    ? Object.entries(message.data).map(([key, data]) => [`${message.path}/${key}`, data]) : [[message.path, message.data]];
  const paths = changes.map(([path]) => path.split('/').filter(Boolean));
  if (paths.some(keys => keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key)))) throw new Error('Unsafe Firebase path.');
  for (let i = 0; i < changes.length; i++) {
    const keys = paths[i], data = changes[i][1];
    if (!keys.length) { value = data; continue; }
    if (!value || typeof value !== 'object') value = {};
    let target = value;
    for (const key of keys.slice(0, -1)) {
      if (!Object.hasOwn(target, key) || !target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    }
    if (data === null) delete target[keys.at(-1)];
    else target[keys.at(-1)] = data;
  }
  return value;
}
