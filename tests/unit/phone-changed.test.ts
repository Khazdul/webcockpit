import { describe, expect, it } from 'vitest';
import { sameValue, sectionChanged } from '../../src/phone/changed';
import { SettingsStore } from '../../src/settings';

describe('sameValue', () => {
  it('compares plain data by value', () => {
    expect(sameValue({ a: 1, b: { c: [1, 2, { d: null }] } }, { b: { c: [1, 2, { d: null }] }, a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false);
    expect(sameValue([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameValue(null, {})).toBe(false);
    expect(sameValue('a', 'a')).toBe(true);
    expect(sameValue(1, '1')).toBe(false);
    expect(sameValue({ a: undefined }, { b: undefined })).toBe(false);
  });
});

describe('sectionChanged', () => {
  it('a settings update elsewhere hands out a new copy of a section that did not change', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const seen: boolean[] = [];
    const identity: boolean[] = [];
    store.subscribe((next, prev) => {
      identity.push(next.phone.lens !== prev.phone.lens);
      seen.push(sectionChanged(next.phone.lens, prev.phone.lens));
    });
    store.update({ appearance: { size: store.get().appearance.size + 1 } });
    store.update({ phone: { lens: { opensAt: 'far' } } });
    // (The same value again is no update at all: the store tells no one.)
    store.update({ phone: { lens: { opensAt: 'far' } } });
    store.update({ input: { autoClear: !store.get().input.autoClear } });
    // By identity every update looks like a change (the reason for the helper).
    expect(identity).toEqual([true, true, true]);
    expect(seen).toEqual([false, true, false]);
  });
});
