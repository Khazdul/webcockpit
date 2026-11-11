// Stage 51e (ADR 0136 §8, §13): the phone's hot keys: the model (labels,
// what a key sends, the wimpy value, the box's picks and checks) and the
// settings (defaults and a migration that survives anything stored).
import { describe, expect, it } from 'vitest';
import {
  HOTKEY_COMMAND_MAX,
  HOTKEY_COUNT,
  HOTKEY_LABEL_MAX,
  HOTKEY_PICKS,
  ERROR_MANY,
  HOTKEY_SPECIALS,
  NOTICE_MANY,
  NOTICE_HP_UNKNOWN,
  NOTICE_HP_ZERO,
  autoLabel,
  characters,
  manyCommands,
  typedLabel,
  checkHotkey,
  cleanCommand,
  cleanLabel,
  columnKeys,
  hotkeyName,
  hotkeyPress,
  knownHp,
  pickHotkey,
  sendsNow,
  wimpyValue,
  withHotkey,
} from '../../src/phone/hotkey-model';
import { splitCommands } from '../../src/script/engine/text';
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

  it('a press: a command key sends its one command as it is (a # command included)', () => {
    expect(hotkeyPress(key(), 172, splitCommands)).toEqual({ kind: 'send', command: 'bash' });
    // An escaped separator and one inside braces do not split: still one command.
    expect(hotkeyPress(key({ command: 'say a\\;b' }), null, splitCommands)).toEqual({ kind: 'send', command: 'say a\\;b' });
    expect(hotkeyPress(key({ command: '#if {1} {north;south}' }), null, splitCommands)).toEqual({ kind: 'send', command: '#if {1} {north;south}' });
    expect(hotkeyPress(key({ command: '#3 north' }), null, splitCommands)).toEqual({ kind: 'send', command: '#3 north' });
    expect(hotkeyPress(key({ command: '   ' }), 172, splitCommands)).toEqual({ kind: 'none' });
  });

  it('one command per tap: a line the engine would split is never sent, and the box refuses it', () => {
    expect(manyCommands('stand;bash', splitCommands)).toBe(true);
    expect(manyCommands('bash', splitCommands)).toBe(false);
    expect(manyCommands('bash;', splitCommands)).toBe(false);
    // A stored value (hand-edited, or from before the rule): a notice, nothing sent.
    expect(hotkeyPress(key({ command: 'stand;bash' }), 172, splitCommands)).toEqual({ kind: 'notice', text: NOTICE_MANY });
    expect(hotkeyPress(key({ command: 'n;n;n;n' }), null, splitCommands)).toEqual({ kind: 'notice', text: NOTICE_MANY });
    expect(checkHotkey(key({ command: 'stand;bash' }), splitCommands)).toEqual({ ok: false, error: ERROR_MANY });
    expect(ERROR_MANY).toBe('One command per key. Use an alias for more.');
    expect(checkHotkey(key({ command: 'say a\\;b' }), splitCommands).ok).toBe(true);
    // A special is never judged by a left-over command text.
    expect(checkHotkey(key({ command: 'a;b', special: 'wimpy50' }), splitCommands).ok).toBe(true);
    expect(sendsNow({ command: 'stand;bash', special: null }, 100, splitCommands)).toBe('Would send nothing: more than one command');
  });

  it('a press: a special sends change wimpy of the current hp, or a notice and nothing', () => {
    expect(hotkeyPress(key({ command: '', special: 'wimpy50' }), 172, splitCommands)).toEqual({ kind: 'send', command: 'change wimpy 86' });
    expect(hotkeyPress(key({ command: '', special: 'wimpy25' }), 172, splitCommands)).toEqual({ kind: 'send', command: 'change wimpy 43' });
    // A special wins over a left-over command text.
    expect(hotkeyPress(key({ command: 'bash', special: 'wimpy50' }), 10, splitCommands)).toEqual({ kind: 'send', command: 'change wimpy 5' });
    expect(hotkeyPress(key({ special: 'wimpy50' }), null, splitCommands)).toEqual({ kind: 'notice', text: NOTICE_HP_UNKNOWN });
    expect(hotkeyPress(key({ special: 'wimpy50' }), 0, splitCommands)).toEqual({ kind: 'notice', text: NOTICE_HP_ZERO });
    expect(hotkeyPress(key({ special: 'wimpy25' }), 1, splitCommands)).toEqual({ kind: 'send', command: 'change wimpy 1' });
  });

  it('the box says what a key sends now', () => {
    expect(sendsNow({ command: '', special: 'wimpy50' }, 149, splitCommands)).toBe('Would send now: change wimpy 74');
    expect(sendsNow({ command: 'rescue', special: null }, null, splitCommands)).toBe('Would send now: rescue');
    expect(sendsNow({ command: '', special: 'wimpy50' }, null, splitCommands)).toMatch(/^Would send nothing now/);
    expect(sendsNow({ command: '', special: null }, 100, splitCommands)).toMatch(/^Would send nothing/);
  });

  it('names: K1 lowest; the column lists shown keys from the top (K3) down', () => {
    expect(hotkeyName(0, DEFAULTS[0]!)).toBe('K1: assist');
    expect(hotkeyName(2, DEFAULTS[2]!)).toBe('K3: wimpy at half of current HP');
    expect(columnKeys(DEFAULTS)).toEqual([2, 1, 0]);
    expect(columnKeys([key(), key({ shown: false }), key()])).toEqual([2, 0]);
    expect(columnKeys(DEFAULTS.map((k) => ({ ...k, shown: false })))).toEqual([]);
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
    expect(checkHotkey(key({ label: ' kill ', command: ' kill orc\n' }), splitCommands)).toEqual({ ok: true, key: key({ label: 'kill', command: 'kill orc' }) });
    // An empty label gets the command's short form.
    expect(checkHotkey(key({ label: '', command: 'rescue' }), splitCommands)).toEqual({ ok: true, key: key({ label: 'resc', command: 'rescue' }) });
    // A special drops the command text.
    expect(checkHotkey(key({ label: 'w', command: 'bash', special: 'wimpy25' }), splitCommands)).toEqual({ ok: true, key: key({ label: 'w', command: '', special: 'wimpy25' }) });
    expect(checkHotkey(key({ command: '  ' }), splitCommands).ok).toBe(false);
    // Nothing to make a label of.
    expect(checkHotkey(key({ label: '', command: ';;' }), splitCommands).ok).toBe(false);
    // An unknown special is no special.
    expect(checkHotkey(key({ special: 'wimpy99' as never, command: '' }), splitCommands).ok).toBe(false);
    // Hidden keys are checked too, and keep their state.
    expect(checkHotkey(key({ shown: false }), splitCommands)).toEqual({ ok: true, key: key({ shown: false }) });
  });

  it('withHotkey replaces one slot of a full list', () => {
    const next = withHotkey(DEFAULTS, 1, key({ label: 'resc', command: 'rescue' }));
    expect(next).toHaveLength(3);
    expect(next[0]).toEqual(DEFAULTS[0]);
    expect(next[1]).toEqual(key({ label: 'resc', command: 'rescue' }));
    expect(next[2]).toEqual(DEFAULTS[2]);
    expect(next[0]).not.toBe(DEFAULTS[0]);
  });
});

describe('hot key settings', () => {
  it('defaults: asst → assist, bash → bash, wimp → wimpy at half; the column shown', () => {
    expect(DEFAULTS).toEqual([
      { label: 'asst', command: 'assist', special: null, shown: true },
      { label: 'bash', command: 'bash', special: null, shown: true },
      { label: 'wimp', command: '', special: 'wimpy50', shown: true },
    ]);
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
    const p = migratePhone({ hotkeys, hotkeysOpen: false });
    expect(p.hotkeys).toEqual(hotkeys);
    expect(p.hotkeysOpen).toBe(false);
  });

  it('malformed stored values: always three usable keys', () => {
    // Not a list, a short list, a long list.
    expect(migratePhone({ hotkeys: 'x' }).hotkeys).toEqual(DEFAULTS);
    expect(migratePhone({ hotkeys: [] }).hotkeys).toEqual(DEFAULTS);
    const one = migratePhone({ hotkeys: [{ label: 'resc', command: 'rescue', special: null, shown: true }] }).hotkeys;
    expect(one).toEqual([{ label: 'resc', command: 'rescue', special: null, shown: true }, DEFAULTS[1], DEFAULTS[2]]);
    const five = migratePhone({ hotkeys: [...DEFAULTS, key(), key()] }).hotkeys;
    expect(five).toEqual(DEFAULTS);
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
      expect(checkHotkey(k, splitCommands)).toEqual({ ok: true, key: k });
    }
  });

  it('an update of one key stores three and touches nothing else', () => {
    const store = new SettingsStore({ factory: null, storage: null, win: null });
    const before = store.get();
    store.update({ phone: { hotkeys: withHotkey(before.phone.hotkeys, 0, key({ label: 'resc', command: 'rescue' })), hotkeysOpen: false } });
    const after = store.get();
    expect(after.phone.hotkeys).toHaveLength(3);
    expect(after.phone.hotkeys[0]).toEqual(key({ label: 'resc', command: 'rescue' }));
    expect(after.phone.hotkeysOpen).toBe(false);
    expect({ ...after, phone: null }).toEqual({ ...before, phone: null });
    expect({ ...after.phone, hotkeys: null, hotkeysOpen: null }).toEqual({ ...before.phone, hotkeys: null, hotkeysOpen: null });
  });
});
