// Deliberately limited to the vocabulary in gaia.schema.json.
export function validate(schema, defName, value) {
  const equal = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const keys = Object.keys(a);
    return Array.isArray(a) === Array.isArray(b) && keys.length === Object.keys(b).length &&
      keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  };
  const matches = (type, v) => type === 'null' ? v === null :
    type === 'array' ? Array.isArray(v) : type === 'object' ?
      v !== null && typeof v === 'object' && !Array.isArray(v) :
      type === 'integer' ? Number.isInteger(v) : type === 'number' ?
        typeof v === 'number' && Number.isFinite(v) : typeof v === type;
  function visit(rule, v, path) {
    if (rule === true) return [];
    if (rule === false) return [`${path}: forbidden value`];
    if (!rule || typeof rule !== 'object') return [`${path}: missing schema`];
    const errors = [];
    const add = message => errors.push(`${path}: ${message}`);
    if (rule.$ref) {
      if (!rule.$ref.startsWith('#/$defs/')) add(`unsupported reference ${rule.$ref}`);
      else errors.push(...visit(schema.$defs?.[rule.$ref.slice(8)], v, path));
    }
    if (rule.type && ![].concat(rule.type).some(t => matches(t, v))) {
      add(`expected ${[].concat(rule.type).join(' or ')}`);
    }
    if (Array.isArray(v) && rule.minItems !== undefined && v.length < rule.minItems) add('too few items');
    if (Array.isArray(v) && rule.maxItems !== undefined && v.length > rule.maxItems) add('too many items');
    if (typeof v === 'number' && rule.exclusiveMinimum !== undefined && v <= rule.exclusiveMinimum) add('below exclusive minimum');
    if (typeof v === 'number' && rule.minimum !== undefined && v < rule.minimum) add('below minimum');
    if (rule.enum && !rule.enum.some(x => equal(x, v))) add('not in enum');
    if (Object.hasOwn(rule, 'const') && !equal(rule.const, v)) add('does not match const');
    if (typeof v === 'string' && rule.pattern && !new RegExp(rule.pattern).test(v)) {
      add(`does not match pattern ${rule.pattern}`);
    }
    for (const part of rule.allOf ?? []) errors.push(...visit(part, v, path));
    for (const keyword of ['anyOf', 'oneOf']) {
      if (!rule[keyword]) continue;
      const count = rule[keyword].filter(part => visit(part, v, path).length === 0).length;
      if (keyword === 'anyOf' ? count === 0 : count !== 1) add(`failed ${keyword} (${count} matches)`);
    }
    if (rule.if && visit(rule.if, v, path).length === 0 && rule.then) {
      errors.push(...visit(rule.then, v, path));
    }
    if (Array.isArray(v) && rule.items !== undefined) {
      v.forEach((item, i) => errors.push(...visit(rule.items, item, `${path}[${i}]`)));
    }
    if (matches('object', v)) {
      for (const key of rule.required ?? []) {
        if (!Object.hasOwn(v, key)) add(`missing required property ${key}`);
      }
      for (const [key, item] of Object.entries(v)) {
        if (rule.propertyNames) errors.push(...visit(rule.propertyNames, key, path));
        if (Object.hasOwn(rule.properties ?? {}, key)) {
          errors.push(...visit(rule.properties[key], item, `${path}.${key}`));
        } else if (rule.additionalProperties !== undefined) {
          errors.push(...visit(rule.additionalProperties, item, `${path}.${key}`));
        }
      }
    }
    return errors;
  }
  return visit(defName == null ? schema : schema.$defs?.[defName], value, '$');
}
