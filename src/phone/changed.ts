// "Did this part of the settings change?" for the phone layer's settings
// subscribers. Pure.
//
// The settings store hands every listener a fresh copy of the whole
// settings on each update, so two sections are never the same object, also
// when nothing in them changed. Compare by value: the sections are plain
// JSON data (objects, arrays, strings, numbers, booleans, null).

/** True when the plain-data values `a` and `b` are equal, key by key. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const arr = Array.isArray(a);
  if (arr !== Array.isArray(b)) return false;
  if (arr) {
    const x = a as unknown[];
    const y = b as unknown[];
    return x.length === y.length && x.every((v, i) => sameValue(v, y[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => Object.hasOwn(y, k) && sameValue(x[k], y[k]));
}

/** True when a settings section differs by value between two settings. */
export function sectionChanged<T>(next: T, prev: T): boolean {
  return !sameValue(next, prev);
}
