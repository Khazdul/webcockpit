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
