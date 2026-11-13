// Stage 51e (ADR 0136 §8, §13): the phone's hot keys: the model (labels,
// what a key sends, the wimpy value, the box's picks and checks) and the
// settings (defaults and a migration that survives anything stored).
import { describe, expect, it } from 'vitest';
import {
  HOTKEY_COMMAND_MAX,
  HOTKEY_COUNT,
  HOTKEY_LABEL_MAX,
  HOTKEY_PICKS,
  HOTKEY_SPECIALS,
  NOTICE_HP_UNKNOWN,
  NOTICE_HP_ZERO,
  autoLabel,
  characters,
  typedLabel,
  checkHotkey,
  cleanCommand,
  enterGoesToCommand,
  scrollMore,
  cleanLabel,
  hotkeyColumns,
  hotkeyCount,
  stepHotkeyCount,
  HOTKEY_COLUMN,
  hotkeyName,
  hotkeyPress,
  knownHp,
  pickHotkey,
  sendsNow,
  wimpyValue,
  withHotkey,
} from '../../src/phone/hotkey-model';
import { SettingsStore } from '../../src/settings';
import { migratePhone, migrateSettings } from '../../src/settings/migrate';
import {
  PHONE_HOTKEY_COMMAND_MAX,
  PHONE_HOTKEY_COUNT,
  PHONE_HOTKEY_LABEL_MAX,
  PHONE_HOTKEY_SPECIALS,
  type PhoneHotkey,
  SETTINGS_VERSION,
  defaultPhoneSettings,
  defaultSettings,
} from '../../src/settings/types';

const key = (over: Partial<PhoneHotkey> = {}): PhoneHotkey => ({ label: 'bash', command: 'bash', special: null, shown: true, ...over });
const DEFAULTS = defaultPhoneSettings().hotkeys;

describe('hot key model', () => {
  it('its limits are the settings\' (the phone chunk cannot import them as values)', () => {
    expect(HOTKEY_COUNT).toBe(PHONE_HOTKEY_COUNT);
    expect(HOTKEY_LABEL_MAX).toBe(PHONE_HOTKEY_LABEL_MAX);
    expect(HOTKEY_COMMAND_MAX).toBe(PHONE_HOTKEY_COMMAND_MAX);
    expect(HOTKEY_SPECIALS.map((s) => s.id)).toEqual([...PHONE_HOTKEY_SPECIALS]);
  });

  it('the quick picks: assist, bash, rescue, shoot, recover; never look', () => {
    expect([...HOTKEY_PICKS]).toEqual(['assist', 'bash', 'rescue', 'shoot', 'recover']);
    expect(HOTKEY_PICKS as readonly string[]).not.toContain('look');
  });

  it('a label is at most four characters, trimmed', () => {
    expect(cleanLabel('  wimp  ')).toBe('wimp');
    expect(cleanLabel('assist')).toBe('assi');
    expect(cleanLabel('a  b c')).toBe('a b');
    expect(cleanLabel('ab\ncd')).toBe('ab c');
    expect(cleanLabel('   ')).toBe('');
    // Whole characters, not halves of one.
    expect(cleanLabel('🗡🗡🗡🗡🗡')).toBe('🗡🗡🗡🗡');
  });

  it('a label counts characters as a reader does: an emoji with joiners and a letter with a combining mark are one', () => {
    const family = '👨\u200d👩\u200d👧';
    const eAcute = 'e\u0301';
    expect(characters(family + 'a' + eAcute)).toEqual([family, 'a', eAcute]);
    expect(cleanLabel(family + family + family + family + family)).toBe(family + family + family + family);
    expect(cleanLabel(eAcute + eAcute + eAcute + eAcute + eAcute)).toBe(eAcute + eAcute + eAcute + eAcute);
    // Four flags are four characters (eight code points, sixteen UTF-16 units).
    expect(cleanLabel('🇸🇪🇸🇪🇸🇪🇸🇪🇸🇪')).toBe('🇸🇪🇸🇪🇸🇪🇸🇪');
    // The migration counts the same way.
    for (const label of [family.repeat(6), eAcute.repeat(6), '🇸🇪'.repeat(6), 'toolong', ' a  b c ']) {
      expect(migratePhone({ hotkeys: [{ label, command: 'x', special: null, shown: true }] }).hotkeys[0]!.label).toBe(cleanLabel(label));
    }
  });

  it('without Intl.Segmenter a label counts code points', () => {
    const intl = Intl as { Segmenter?: unknown };
    const seg = intl.Segmenter;
    try {
      intl.Segmenter = undefined;
      expect(cleanLabel('🗡🗡🗡🗡🗡')).toBe('🗡🗡🗡🗡');
      expect(characters('e\u0301')).toEqual(['e', '\u0301']);
      expect(migratePhone({ hotkeys: [{ label: '🗡🗡🗡🗡🗡', command: 'x', special: null, shown: true }] }).hotkeys[0]!.label).toBe('🗡🗡🗡🗡');
    } finally {
      intl.Segmenter = seg;
    }
  });

  it('a label being typed is cut the same way, and keeps a space just typed', () => {
    expect(typedLabel('killer')).toBe('kill');
    expect(typedLabel('a ')).toBe('a ');
    expect(typedLabel('  a')).toBe('a');
    expect(typedLabel('a  b')).toBe('a b');
    expect(cleanLabel(typedLabel('ab  cdef'))).toBe(cleanLabel('ab  cdef'));
  });

  it('a command is one trimmed line within the limit', () => {
    expect(cleanCommand('  bash orc \n')).toBe('bash orc');
    expect(cleanCommand('kill orc\nflee')).toBe('kill orc flee');
    expect(cleanCommand('x'.repeat(500))).toHaveLength(HOTKEY_COMMAND_MAX);
  });

  it('the wimpy value is floor(hp × share) of the CURRENT hit points', () => {
    expect(wimpyValue(172, 0.5)).toBe(86);
    expect(wimpyValue(149, 0.5)).toBe(74);
    expect(wimpyValue(149, 0.25)).toBe(37);
    expect(wimpyValue(158, 0.5)).toBe(79);
  });

  it('the wimpy value is never 0 (that would turn wimpy off) and nothing for no hit points', () => {
    expect(wimpyValue(1, 0.5)).toBe(1);
    expect(wimpyValue(3, 0.25)).toBe(1);
    expect(wimpyValue(2, 0.5)).toBe(1);
    expect(wimpyValue(0, 0.5)).toBeNull();
    expect(wimpyValue(-4, 0.5)).toBeNull();
    expect(wimpyValue(null, 0.5)).toBeNull();
    expect(wimpyValue(Number.NaN, 0.5)).toBeNull();
  });

  it('hp is known only as a finite number', () => {
    expect(knownHp(172)).toBe(172);
    expect(knownHp(0)).toBe(0);
    expect(knownHp('172')).toBeNull();
    expect(knownHp(undefined)).toBeNull();
    expect(knownHp(null)).toBeNull();
    expect(knownHp(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('a press: a command key sends its line as it is (a # command included)', () => {
    expect(hotkeyPress(key(), 172)).toEqual({ kind: 'send', command: 'bash' });
    // An escaped separator and one inside braces do not split: still one command.
    expect(hotkeyPress(key({ command: 'say a\\;b' }), null)).toEqual({ kind: 'send', command: 'say a\\;b' });
    expect(hotkeyPress(key({ command: '#if {1} {north;south}' }), null)).toEqual({ kind: 'send', command: '#if {1} {north;south}' });
    expect(hotkeyPress(key({ command: '#3 north' }), null)).toEqual({ kind: 'send', command: '#3 north' });
    expect(hotkeyPress(key({ command: '   ' }), 172)).toEqual({ kind: 'none' });
  });

  it('several commands on one key (stage 52): the line is sent as typed, the engine splits it; Save accepts it', () => {
    expect(hotkeyPress(key({ command: 'stand;bash' }), 172)).toEqual({ kind: 'send', command: 'stand;bash' });
    expect(hotkeyPress(key({ command: 'n;n;n;n' }), null)).toEqual({ kind: 'send', command: 'n;n;n;n' });
    expect(checkHotkey(key({ label: '', command: ' stand;bash ' }))).toEqual({ ok: true, key: key({ label: 'stan', command: 'stand;bash' }) });
    expect(checkHotkey(key({ command: 'say a\\;b' })).ok).toBe(true);
    // A special still wins over the command text.
    expect(checkHotkey(key({ command: 'a;b', special: 'wimpy50' }))).toEqual({ ok: true, key: key({ command: '', special: 'wimpy50' }) });
    expect(sendsNow({ command: 'stand;bash', special: null }, 100)).toBe('Would send now: stand;bash');
  });

  it('a press: a special sends change wimpy of the current hp, or a notice and nothing', () => {
    expect(hotkeyPress(key({ command: '', special: 'wimpy50' }), 172)).toEqual({ kind: 'send', command: 'change wimpy 86' });
    expect(hotkeyPress(key({ command: '', special: 'wimpy25' }), 172)).toEqual({ kind: 'send', command: 'change wimpy 43' });
    // A special wins over a left-over command text.
    expect(hotkeyPress(key({ command: 'bash', special: 'wimpy50' }), 10)).toEqual({ kind: 'send', command: 'change wimpy 5' });
    expect(hotkeyPress(key({ special: 'wimpy50' }), null)).toEqual({ kind: 'notice', text: NOTICE_HP_UNKNOWN });
    expect(hotkeyPress(key({ special: 'wimpy50' }), 0)).toEqual({ kind: 'notice', text: NOTICE_HP_ZERO });
    expect(hotkeyPress(key({ special: 'wimpy25' }), 1)).toEqual({ kind: 'send', command: 'change wimpy 1' });
  });

  it('the box says what a key sends now', () => {
    expect(sendsNow({ command: '', special: 'wimpy50' }, 149)).toBe('Would send now: change wimpy 74');
    expect(sendsNow({ command: 'rescue', special: null }, null)).toBe('Would send now: rescue');
    expect(sendsNow({ command: '', special: 'wimpy50' }, null)).toMatch(/^Would send nothing now/);
    expect(sendsNow({ command: '', special: null }, 100)).toMatch(/^Would send nothing/);
  });

  it('names: K1 lowest; a column lists its shown keys from the top down', () => {
    expect(hotkeyName(0, DEFAULTS[0]!)).toBe('K1: assist');
    expect(hotkeyName(2, DEFAULTS[2]!)).toBe('K3: wimpy at half of current HP');
    expect(hotkeyName(5, DEFAULTS[5]!)).toBe('K6: recover');
    expect(hotkeyColumns(DEFAULTS, 3)).toEqual([[2, 1, 0], []]);
    expect(hotkeyColumns([key(), key({ shown: false }), key()], 3)).toEqual([[2, 0], []]);
    expect(hotkeyColumns(DEFAULTS.map((k) => ({ ...k, shown: false })), 6)).toEqual([[], []]);
  });

  it('the count (stage 52): 1 to 6 slots in use; above three a second column, K4 lowest; slots above the count are out', () => {
    expect(HOTKEY_COLUMN).toBe(3);
    expect(hotkeyColumns(DEFAULTS, 1)).toEqual([[0], []]);
    expect(hotkeyColumns(DEFAULTS, 2)).toEqual([[1, 0], []]);
    expect(hotkeyColumns(DEFAULTS, 4)).toEqual([[2, 1, 0], [3]]);
    expect(hotkeyColumns(DEFAULTS, 5)).toEqual([[2, 1, 0], [4, 3]]);
    expect(hotkeyColumns(DEFAULTS, 6)).toEqual([[2, 1, 0], [5, 4, 3]]);
    // A hidden key leaves no hole in its own column, and moves no key of the other.
    const some = DEFAULTS.map((k, i) => ({ ...k, shown: i !== 1 && i !== 3 }));
    expect(hotkeyColumns(some, 6)).toEqual([[2, 0], [5, 4]]);
    // The first column empty: the second keeps its keys (and its place, hotkeys.ts).
    expect(hotkeyColumns(DEFAULTS.map((k, i) => ({ ...k, shown: i >= 3 })), 6)).toEqual([[], [5, 4, 3]]);
    // A list shorter than the count shows what there is.
    expect(hotkeyColumns(DEFAULTS.slice(0, 3), 6)).toEqual([[2, 1, 0], []]);
    // Out of range or not a number: within 1 to 6, else one column.
    expect([0, 1, 3.9, 6, 7, -2].map(hotkeyCount)).toEqual([1, 1, 3, 6, 6, 1]);
    expect([Number.NaN, '4', null, undefined].map(hotkeyCount)).toEqual([3, 3, 3, 3]);
    expect([stepHotkeyCount(3, 1), stepHotkeyCount(3, -1), stepHotkeyCount(6, 1), stepHotkeyCount(1, -1)]).toEqual([4, 2, 6, 1]);
  });

  it('short labels for the picks, the first word otherwise', () => {
    expect(autoLabel('assist', null)).toBe('asst');
    expect(autoLabel('rescue', null)).toBe('resc');
    expect(autoLabel('', 'wimpy25')).toBe('wimp');
    expect(autoLabel('kill orc', null)).toBe('kill');
    expect(autoLabel('#3 north', null)).toBe('3');
    expect(autoLabel('stand;flee', null)).toBe('stan');
  });

  it('a pick changes the command; the label follows only while it was the short form', () => {
    expect(pickHotkey(key(), { command: 'rescue' })).toEqual(key({ label: 'resc', command: 'rescue' }));
    expect(pickHotkey(key({ label: 'B!' }), { command: 'rescue' })).toEqual(key({ label: 'B!', command: 'rescue' }));
    expect(pickHotkey(key(), { special: 'wimpy25' })).toEqual(key({ label: 'wimp', command: '', special: 'wimpy25' }));
    expect(pickHotkey(key({ label: 'wimp', command: '', special: 'wimpy50' }), { command: 'shoot' })).toEqual(key({ label: 'shot', command: 'shoot' }));
    expect(pickHotkey(key({ label: '' }), { command: 'recover' }).label).toBe('rcvr');
  });

  it('a draft is checked before it is stored', () => {
    expect(checkHotkey(key({ label: ' kill ', command: ' kill orc\n' }))).toEqual({ ok: true, key: key({ label: 'kill', command: 'kill orc' }) });
    // An empty label gets the command's short form.
    expect(checkHotkey(key({ label: '', command: 'rescue' }))).toEqual({ ok: true, key: key({ label: 'resc', command: 'rescue' }) });
    // A special drops the command text.
    expect(checkHotkey(key({ label: 'w', command: 'bash', special: 'wimpy25' }))).toEqual({ ok: true, key: key({ label: 'w', command: '', special: 'wimpy25' }) });
    expect(checkHotkey(key({ command: '  ' })).ok).toBe(false);
    // Nothing to make a label of.
    expect(checkHotkey(key({ label: '', command: ';;' })).ok).toBe(false);
    // An unknown special is no special.
    expect(checkHotkey(key({ special: 'wimpy99' as never, command: '' })).ok).toBe(false);
    // Hidden keys are checked too, and keep their state.
    expect(checkHotkey(key({ shown: false }))).toEqual({ ok: true, key: key({ shown: false }) });
  });

  it('withHotkey replaces one slot of a full list', () => {
    const next = withHotkey(DEFAULTS, 1, key({ label: 'resc', command: 'rescue' }));
    expect(next).toHaveLength(6);
    expect(next[0]).toEqual(DEFAULTS[0]);
    expect(next[1]).toEqual(key({ label: 'resc', command: 'rescue' }));
    expect(next[2]).toEqual(DEFAULTS[2]);
    expect(next[0]).not.toBe(DEFAULTS[0]);
  });
});

describe('hot key settings', () => {
  it('defaults: asst → assist, bash → bash, wimp → wimpy at half, then resc, shot, rcvr; three in use; the column shown', () => {
    expect(DEFAULTS).toEqual([
      { label: 'asst', command: 'assist', special: null, shown: true },
      { label: 'bash', command: 'bash', special: null, shown: true },
      { label: 'wimp', command: '', special: 'wimpy50', shown: true },
      { label: 'resc', command: 'rescue', special: null, shown: true },
      { label: 'shot', command: 'shoot', special: null, shown: true },
      { label: 'rcvr', command: 'recover', special: null, shown: true },
    ]);
    expect(defaultPhoneSettings().hotkeyCount).toBe(3);
    expect(defaultPhoneSettings().hotkeysOpen).toBe(true);
  });

  it('settings stored before stage 51e get the defaults; no version bump; nothing else changes', () => {
    const old = JSON.parse(JSON.stringify(defaultSettings())) as Record<string, unknown>;
    const phone = old.phone as Record<string, unknown>;
    delete phone.hotkeys;
    delete phone.hotkeysOpen;
    const s = migrateSettings(old);
    expect(s.version).toBe(SETTINGS_VERSION);
    expect(s).toEqual(defaultSettings());
  });

  it('stored keys are kept', () => {
    const hotkeys = [
      { label: 'resc', command: 'rescue', special: null, shown: false },
      { label: 'k', command: 'kill orc;bash', special: null, shown: true },
      { label: 'w25', command: '', special: 'wimpy25', shown: true },
    ];
    // Three stored keys (0.5.0): kept, and extended with the defaults of K4 to K6; three stay in use.
    const p = migratePhone({ hotkeys, hotkeysOpen: false });
    expect(p.hotkeys).toEqual([...hotkeys, ...DEFAULTS.slice(3)]);
    expect(p.hotkeyCount).toBe(3);
    expect(p.hotkeysOpen).toBe(false);
    // Six stored keys and their count are kept.
    const six = [...hotkeys, { label: 'f', command: 'flee', special: null, shown: true }, { label: 'x', command: 'n;n', special: null, shown: false }, { label: 'y', command: 'cast', special: null, shown: true }];
    const q = migratePhone({ hotkeys: six, hotkeyCount: 5 });
    expect(q.hotkeys).toEqual(six);
    expect(q.hotkeyCount).toBe(5);
    // The count: a whole number from 1 to 6, else the default.
    expect([0, 9, 2.6, '4', null].map((hotkeyCount) => migratePhone({ hotkeyCount }).hotkeyCount)).toEqual([1, 6, 3, 3, 3]);
  });

  it('malformed stored values: always six usable keys', () => {
    // Not a list, a short list, a long list.
    expect(migratePhone({ hotkeys: 'x' }).hotkeys).toEqual(DEFAULTS);
    expect(migratePhone({ hotkeys: [] }).hotkeys).toEqual(DEFAULTS);
    const one = migratePhone({ hotkeys: [{ label: 'resc', command: 'rescue', special: null, shown: true }] }).hotkeys;
    expect(one).toEqual([{ label: 'resc', command: 'rescue', special: null, shown: true }, ...DEFAULTS.slice(1)]);
    const eight = migratePhone({ hotkeys: [...DEFAULTS, key(), key()] }).hotkeys;
    expect(eight).toEqual(DEFAULTS);
    // Junk entries are the slot's default.
    expect(migratePhone({ hotkeys: [7, null, 'x'] }).hotkeys).toEqual(DEFAULTS);
    // A long label is cut, a command is one line, an unknown special is none.
    const cut = migratePhone({
      hotkeys: [
        { label: 'toolong', command: 'kill\norc', special: 'wimpy99', shown: true },
        { label: 4, command: 'bash', special: null, shown: true },
        { label: 'x', command: 'y'.repeat(999), special: null, shown: 'yes' },
      ],
    }).hotkeys;
    expect(cut[0]).toEqual({ label: 'tool', command: 'kill orc', special: null, shown: true });
    // No label: the slot's default.
    expect(cut[1]).toEqual(DEFAULTS[1]);
    expect(cut[2]!.command).toHaveLength(PHONE_HOTKEY_COMMAND_MAX);
    expect(cut[2]!.shown).toBe(true);
    // Nothing to send: the slot's default, the stored "hidden" kept.
    expect(migratePhone({ hotkeys: [{ label: 'x', command: '', special: null, shown: false }] }).hotkeys[0]).toEqual({ ...DEFAULTS[0]!, shown: false });
    // A special keeps no command text.
    expect(migratePhone({ hotkeys: [{ label: 'w', command: 'bash', special: 'wimpy50', shown: true }] }).hotkeys[0]).toEqual({ label: 'w', command: '', special: 'wimpy50', shown: true });
    expect(migratePhone({ hotkeysOpen: 'no' }).hotkeysOpen).toBe(true);
  });

  it('a stored key passes the model\'s check unchanged', () => {
    for (const k of migratePhone({ hotkeys: [{ label: 'toolong', command: ' a ', special: null, shown: true }] }).hotkeys) {
      expect(checkHotkey(k)).toEqual({ ok: true, key: k });
    }
  });

  it('an update of one key stores six and touches nothing else', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const before = store.get();
    store.update({ phone: { hotkeys: withHotkey(before.phone.hotkeys, 0, key({ label: 'resc', command: 'rescue' })), hotkeysOpen: false } });
    const after = store.get();
    expect(after.phone.hotkeys).toHaveLength(6);
    expect(after.phone.hotkeys[0]).toEqual(key({ label: 'resc', command: 'rescue' }));
    expect(after.phone.hotkeysOpen).toBe(false);
    expect({ ...after, phone: null }).toEqual({ ...before, phone: null });
    expect({ ...after.phone, hotkeys: null, hotkeysOpen: null }).toEqual({ ...before.phone, hotkeys: null, hotkeysOpen: null });
  });
});

describe('the box: Enter in its fields, and the marks of more (stage 55)', () => {
  it('Enter in the Label goes on to the Command only while that is still to be written; everywhere else it saves', () => {
    expect(enterGoesToCommand('label', { command: '', special: null })).toBe(true);
    expect(enterGoesToCommand('label', { command: '   ', special: null })).toBe(true);
    expect(enterGoesToCommand('label', { command: 'bash', special: null })).toBe(false);
    // A special has no Command field.
    expect(enterGoesToCommand('label', { command: '', special: 'wimpy50' })).toBe(false);
    expect(enterGoesToCommand('command', { command: '', special: null })).toBe(false);
    expect(enterGoesToCommand('command', { command: 'bash', special: null })).toBe(false);
  });

  it('the specials have a short text for the chip and the full one for the name', () => {
    for (const s of HOTKEY_SPECIALS) {
      expect(s.short.length).toBeLessThan(s.text.length);
      expect(s.short).toMatch(/^wimpy \d+\u00a0% HP$/);
    }
  });

  it('more above and below: only where something is out of sight, a pixel of rounding aside', () => {
    expect(scrollMore(0, 200, 200)).toEqual({ up: false, down: false });
    expect(scrollMore(0, 200, 201)).toEqual({ up: false, down: false });
    expect(scrollMore(0, 150, 200)).toEqual({ up: false, down: true });
    expect(scrollMore(20, 150, 200)).toEqual({ up: true, down: true });
    expect(scrollMore(50, 150, 200)).toEqual({ up: true, down: false });
    expect(scrollMore(49.5, 150, 200)).toEqual({ up: true, down: false });
    // Nothing laid out (a hidden box).
    expect(scrollMore(0, 0, 0)).toEqual({ up: false, down: false });
  });
});
