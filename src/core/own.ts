// An own property of a lookup table, never an inherited one: a key from
// a log or a payload such as `constructor`, `__proto__` or `toString` must
// read as "not in the table", not as a function of Object.prototype
// (ADR 0154, the review of stage 64 B2).

/** `table[key]` when `key` is the table's own, else undefined. */
export function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}
