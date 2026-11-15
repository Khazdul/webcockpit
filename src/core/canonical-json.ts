// Canonical JSON (ADR 0151): the encoding the sync hashes and seals, and
// what a Comm record's identity is (ADR 0152). Its own tiny module so the
// Comm archive (on a guest's path) uses it without the sync's code.

/**
 * JSON with object keys sorted (by UTF-16 code units) and no whitespace.
 * Values are what the records hold: strings, finite numbers, booleans,
 * null, arrays and plain objects; an object's `undefined` values are left
 * out. Throws on anything else (a number that is not finite, `undefined`
 * in an array, a function).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalJson: a number that is not finite');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  throw new Error(`canonicalJson: a ${typeof value}`);
}

/**
 * `value` as `canonicalJson` takes it: a number that is not finite and
 * anything that is not JSON (`undefined`, a function) become null in an
 * array and are left out of an object. A new value; the input is not
 * changed. (Stored script data from before the store refused them.)
 */
export function jsonSafe(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object' || depth > 64) return undefined;
  if (Array.isArray(value)) return Array.from(value, (x) => jsonSafe(x, depth + 1) ?? null);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(value as Record<string, unknown>)) {
    const y = jsonSafe(x, depth + 1);
    if (y !== undefined) out[k] = y;
  }
  return out;
}
