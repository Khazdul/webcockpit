// @vitest-environment happy-dom
// Stage 53d (ADR 0138 §1, §3, §7): the other fields of the phone's game
// layout as targets of our own keyboard (the adapter over an element), the
// keys' vibration, and the settings that came with them (the layout, the
// vibration switch).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAP_PULSE_MS, canVibrate, pulse } from '../../src/phone/haptics';
import { HotkeysView } from '../../src/phone/hotkeys';
import { HOTKEY_COMMAND_MAX, HOTKEY_LABEL_MAX } from '../../src/phone/hotkey-model';
import { charStartBefore, fieldTarget, isMarked, isOwnableField, isTextField, markField } from '../../src/phone/keyboard-fields';
import { COMPASS_GROUP, KEYBOARD_GROUP, SETTINGS_GROUPS, groupsShown, rowsShown } from '../../src/phone/settings-page';
import { defaultPhoneSettings, defaultSettings } from '../../src/settings/types';
import type { PhoneHotkey, Settings } from '../../src/settings/types';

function input(type = 'text', value = ''): HTMLInputElement {
  const el = document.createElement('input');
  el.type = type;
  el.value = value;
  document.body.append(el);
  if (type === 'text' || type === 'search') el.setSelectionRange(value.length, value.length);
  return el;
}

/** Every `input` event the field gets, as its type and data. */
function watch(el: HTMLElement): string[] {
  const seen: string[] = [];
  el.addEventListener('input', (e) => seen.push(`${(e as InputEvent).inputType ?? ''}:${(e as InputEvent).data ?? ''}`));
  // A made-up key would be a bug (ADR 0138 §3).
  for (const t of ['keydown', 'keyup', 'keypress']) el.addEventListener(t, () => seen.push(t));
  return seen;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('fieldTarget: an element as the keys\' target', () => {
  it('inserts at the caret and over a selection, and tells the field with an input event, never a key event', () => {
    const el = input('text', 'held');
    const seen = watch(el);
    const t = fieldTarget(el);
    t.insert('!');
    expect(el.value).toBe('held!');
    el.setSelectionRange(1, 3);
    t.insert('OL');
    expect(el.value).toBe('hOLd!');
    expect([el.selectionStart, el.selectionEnd]).toEqual([3, 3]);
    el.setSelectionRange(0, 0);
    t.insert('>');
    expect(el.value).toBe('>hOLd!');
    expect(seen).toEqual(['insertText:!', 'insertText:OL', 'insertText:>']);
  });

  it('the input event bubbles, as a typed key\'s does (a delegated listener hears it)', () => {
    const el = input();
    let heard = 0;
    document.body.addEventListener('input', () => heard++);
    fieldTarget(el).insert('a');
    expect(heard).toBe(1);
  });

  it('deletes backward: the selection, else one whole character, and nothing at the start', () => {
    const el = input('text', 'ab👍🏽');
    const seen = watch(el);
    const t = fieldTarget(el);
    t.deleteBack();
    expect(el.value).toBe('ab');
    t.deleteBack();
    expect(el.value).toBe('a');
    el.value = 'hello';
    el.setSelectionRange(1, 4);
    t.deleteBack();
    expect(el.value).toBe('ho');
    expect([el.selectionStart, el.selectionEnd]).toEqual([1, 1]);
    el.setSelectionRange(0, 0);
    t.deleteBack();
    expect(el.value).toBe('ho');
    // (Nothing changed at the start: no event for it.)
    expect(seen).toEqual(['deleteContentBackward:', 'deleteContentBackward:', 'deleteContentBackward:']);
  });

  it('charStartBefore: a grapheme cluster, and a code point without Intl.Segmenter', () => {
    expect(charStartBefore('', 0)).toBe(0);
    expect(charStartBefore('ab', 2)).toBe(1);
    expect(charStartBefore('aé', 3)).toBe(1);
    expect(charStartBefore('a🇸🇪', 5)).toBe(1);
    const had = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    try {
      (Intl as unknown as { Segmenter?: unknown }).Segmenter = undefined;
      expect(charStartBefore('a😀', 3)).toBe(1);
      expect(charStartBefore('ab', 2)).toBe(1);
    } finally {
      (Intl as unknown as { Segmenter?: unknown }).Segmenter = had;
    }
  });

  it('maxLength is kept as for a typed key: what does not fit is not typed', () => {
    const el = input('text', 'abc');
    el.maxLength = 5;
    const seen = watch(el);
    const t = fieldTarget(el);
    t.insert('de');
    expect(el.value).toBe('abcde');
    t.insert('f');
    expect(el.value).toBe('abcde');
    // Over a selection there is room again.
    el.setSelectionRange(0, 2);
    t.insert('XYZ');
    expect(el.value).toBe('XYcde');
    // Half an emoji is never typed.
    el.value = 'abcd';
    el.setSelectionRange(4, 4);
    t.insert('😀');
    expect(el.value).toBe('abcd');
    expect(seen).toEqual(['insertText:de', 'insertText:XY']);
  });

  it('a line break is never typed: these fields are one line', () => {
    const ta = document.createElement('textarea');
    document.body.append(ta);
    fieldTarget(ta).insert('a\r\nb');
    expect(ta.value).toBe('a b');
  });

  it('submit is the field\'s own Enter action, and nothing when it has none', () => {
    const el = input('search', 'gib');
    const seen = watch(el);
    let n = 0;
    fieldTarget(el, { submit: () => n++ }).submit();
    expect(n).toBe(1);
    expect(() => fieldTarget(el).submit()).not.toThrow();
    expect(seen).toEqual([]);
    expect(el.value).toBe('gib');
  });

  it('has no history: the arrows are dimmed for it', () => {
    const t = fieldTarget(input());
    expect(t.historyUp).toBeUndefined();
    expect(t.historyDown).toBeUndefined();
  });

  it('focus and blur are the element\'s', () => {
    const el = input();
    const t = fieldTarget(el);
    t.focus();
    expect(document.activeElement).toBe(el);
    t.blur();
    expect(document.activeElement).not.toBe(el);
  });

  it('which fields: plain text inputs and textareas; marked, they ask the device for no keyboard', () => {
    expect(isOwnableField(input('text'))).toBe(true);
    expect(isOwnableField(input('search'))).toBe(true);
    expect(isOwnableField(document.createElement('textarea'))).toBe(true);
    expect(isOwnableField(input('checkbox'))).toBe(false);
    expect(isOwnableField(input('number'))).toBe(false);
    expect(isOwnableField(document.createElement('button'))).toBe(false);
    expect(isOwnableField(null)).toBe(false);
    const ro = input('text');
    ro.readOnly = true;
    expect(isOwnableField(ro)).toBe(false);
    // A field of any text kind that is not ours closes our keyboard (`isTextField`).
    expect(isTextField(input('number'))).toBe(true);
    expect(isTextField(input('checkbox'))).toBe(false);
    const el = input();
    expect(isMarked(el)).toBe(false);
    markField(el);
    expect(el.getAttribute('inputmode')).toBe('none');
    expect(el.getAttribute('virtualkeyboardpolicy')).toBe('manual');
    expect(isMarked(el)).toBe(true);
  });
});

describe('the hot key box typed in from our keyboard', () => {
  const keys = (): PhoneHotkey[] => defaultPhoneSettings().hotkeys.map((k) => ({ ...k }));

  function box() {
    const saved: Array<{ index: number; key: PhoneHotkey }> = [];
    const boxes: Array<{ open: boolean; by: Event | null | undefined }> = [];
    let presses = 0;
    let keeps: Node | null = null;
    const view = new HotkeysView(document, {
      press: () => {},
      save: (index, key) => saved.push({ index, key }),
      toggle: () => {},
      hp: () => 100,
      onBox: (open, by) => boxes.push({ open, by }),
      onPress: () => presses++,
      keepsBox: (t) => t === keeps,
    });
    document.body.append(view.el, view.boxEl);
    view.set(keys(), 3, true);
    view.openBox(0);
    const label = view.boxEl.querySelector<HTMLInputElement>('#wc-ph-rb-label')!;
    const command = view.boxEl.querySelector<HTMLInputElement>('#wc-ph-rb-command')!;
    return { view, saved, boxes, label, command, presses: () => presses, keep: (n: Node) => (keeps = n) };
  }

  it('the label is cleaned as it is typed, by the field\'s own rule', () => {
    const b = box();
    const t = fieldTarget(b.label, { submit: () => b.view.saveBox() });
    b.label.value = '';
    for (const ch of 'Bash it') t.insert(ch);
    // The model's rule (`typedLabel`): at most HOTKEY_LABEL_MAX characters.
    expect([...b.label.value].length).toBeLessThanOrEqual(HOTKEY_LABEL_MAX);
    expect(b.label.value).toBe([...'Bash it'].slice(0, HOTKEY_LABEL_MAX).join(''));
    t.deleteBack();
    expect(b.label.value).toBe([...'Bash it'].slice(0, HOTKEY_LABEL_MAX - 1).join(''));
  });

  it('the command field: its "Sends now" line follows, its maxLength holds, Enter saves and closes', () => {
    const b = box();
    const t = fieldTarget(b.command, { submit: () => b.view.saveBox() });
    b.command.value = '';
    b.command.setSelectionRange(0, 0);
    for (const ch of 'kick orc') t.insert(ch);
    expect(b.command.value).toBe('kick orc');
    expect(b.view.boxEl.querySelector('.wc-ph-rb-say')!.textContent).toContain('kick orc');
    expect(b.command.maxLength).toBe(HOTKEY_COMMAND_MAX);
    t.insert('x'.repeat(HOTKEY_COMMAND_MAX));
    expect(b.command.value.length).toBe(HOTKEY_COMMAND_MAX);
    b.command.value = 'kick orc';
    t.submit();
    expect(b.saved).toHaveLength(1);
    expect(b.saved[0]!.index).toBe(0);
    expect(b.saved[0]!.key.command).toBe('kick orc');
    expect(b.view.boxOpen).toBe(false);
    expect(b.boxes.map((x) => x.open)).toEqual([true, false]);
  });

  it('ownsField: the box\'s two fields and no other', () => {
    const b = box();
    expect(b.view.ownsField(b.label)).toBe(true);
    expect(b.view.ownsField(b.command)).toBe(true);
    expect(b.view.ownsField(input())).toBe(false);
  });

  it('a press on what belongs to the box (our keyboard) leaves it open; any other press outside closes it, and says which', () => {
    const b = box();
    const key = document.createElement('button');
    const other = document.createElement('div');
    document.body.append(key, other);
    b.keep(key);
    key.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(b.view.boxOpen).toBe(true);
    other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(b.view.boxOpen).toBe(false);
    expect(b.boxes.at(-1)!.open).toBe(false);
    expect(b.boxes.at(-1)!.by?.target).toBe(other);
  });

  it('a pointer on a hot key is told (the vibration)', () => {
    const b = box();
    b.view.closeBox();
    const hk = b.view.el.querySelector<HTMLElement>('.wc-ph-hk')!;
    hk.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(b.presses()).toBe(1);
    // Not for a press beside the keys.
    b.view.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(b.presses()).toBe(1);
  });
});

describe('haptics: the keys\' vibration', () => {
  it('feature detection: only where navigator.vibrate is a function', () => {
    expect(canVibrate(undefined)).toBe(false);
    expect(canVibrate(null)).toBe(false);
    expect(canVibrate({})).toBe(false);
    expect(canVibrate({ vibrate: 1 as unknown as () => boolean })).toBe(false);
    expect(canVibrate({ vibrate: () => true })).toBe(true);
  });

  it('one short pulse; nothing without the API; a refusal never throws', () => {
    const calls: number[] = [];
    pulse({ vibrate: (ms) => (calls.push(ms), true) });
    expect(calls).toEqual([TAP_PULSE_MS]);
    // Long enough for a phone's motor to start (0.5.0's 10 ms was not felt on a Galaxy S21), short enough for typing.
    expect(TAP_PULSE_MS).toBeGreaterThanOrEqual(20);
    expect(TAP_PULSE_MS).toBeLessThanOrEqual(40);
    expect(() => pulse(undefined)).not.toThrow();
    expect(() => pulse({})).not.toThrow();
    expect(() =>
      pulse({
        vibrate: () => {
          throw new Error('NotAllowedError');
        },
      }),
    ).not.toThrow();
    expect(() => pulse({ vibrate: () => false })).not.toThrow();
  });

  it('off by default', () => {
    expect(defaultPhoneSettings().vibrate).toBe(false);
    expect(defaultSettings().phone.vibrate).toBe(false);
  });
});

describe('the settings page: Keyboard and the vibration row', () => {
  const s = (patch: (x: Settings) => void = () => {}): Settings => {
    const x = defaultSettings();
    patch(x);
    return x;
  };
  const seg = () => {
    const row = KEYBOARD_GROUP.rows[0]!;
    if (row.kind !== 'seg') throw new Error('not a seg');
    return row;
  };

  it('the Keyboard group is there with our own keyboard: by default, and not with ?kbd=0', () => {
    for (const [search, on] of [['', true], ['?phone=1', true], ['?kbd=de', true], ['?kbd=1', true], ['?kbd=debug', true], ['?phone=1&kbd=sv', true], ['?kbd=en', true], ['?kbd=0', false], ['?phone=1&kbd=0', false]] as const) {
      vi.stubGlobal('location', { search });
      expect(groupsShown(SETTINGS_GROUPS).some((g) => g.id === 'keyboard'), search).toBe(on);
    }
    expect(SETTINGS_GROUPS.indexOf(KEYBOARD_GROUP)).toBe(SETTINGS_GROUPS.indexOf(COMPASS_GROUP) + 1);
  });

  it('Layout: Swedish or English; until one is chosen it shows the layout of the browser\'s language', () => {
    const row = seg();
    expect(row.label).toBe('Layout');
    expect(row.options).toEqual([
      { value: 'sv', label: 'Swedish' },
      { value: 'en', label: 'English' },
    ]);
    vi.stubGlobal('navigator', { languages: ['sv-SE', 'en'], language: 'sv-SE' });
    expect(row.get(s())).toBe('sv');
    vi.stubGlobal('navigator', { languages: ['de-DE'], language: 'de-DE' });
    expect(row.get(s())).toBe('en');
    // A chosen layout wins over the language.
    expect(row.get(s((x) => (x.phone.keyboard.layout = 'sv')))).toBe('sv');
    vi.stubGlobal('navigator', { languages: ['sv'], language: 'sv' });
    expect(row.get(s((x) => (x.phone.keyboard.layout = 'en')))).toBe('en');
    expect(row.set('sv', s())).toEqual({ phone: { keyboard: { layout: 'sv' } } });
    expect(row.set('en', s())).toEqual({ phone: { keyboard: { layout: 'en' } } });
  });

  it('"Vibrate on key press" is a row of Quick buttons only where the browser can vibrate', () => {
    vi.stubGlobal('navigator', {});
    expect(rowsShown(COMPASS_GROUP).map((r) => r.id)).toEqual(['hotkey-count']);
    vi.stubGlobal('navigator', { vibrate: () => true });
    expect(rowsShown(COMPASS_GROUP).map((r) => r.id)).toEqual(['hotkey-count', 'vibrate']);
    const row = COMPASS_GROUP.rows.find((r) => r.id === 'vibrate')!;
    if (row.kind !== 'toggle') throw new Error('not a toggle');
    expect(row.label).toBe('Vibrate on key press');
    expect(row.get(s())).toBe(false);
    expect(row.get(s((x) => (x.phone.vibrate = true)))).toBe(true);
    expect(row.set(true, s())).toEqual({ phone: { vibrate: true } });
  });
});
