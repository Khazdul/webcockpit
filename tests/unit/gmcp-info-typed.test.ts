// The player's own `stat`, `info` and `info <format>` read into the card
// (stage 77 F1, ADR 0166 addendum 18 point 96). The lines are MUME's, from
// the owner's run logs (Rasta 2026-09-26, Gittan 2026-11-24).
import { describe, expect, it } from 'vitest';
import { InfoModel } from '../../src/gmcp/info-model';
import {
  type InfoRead,
  READ_WINDOW_MS,
  TypedInfoReader,
  compileFormat,
  parseFormatAnswer,
  parsePlainInfo,
  parseStat,
  typedInfoCommand,
} from '../../src/gmcp/info-typed';
import { ANSWER_FIELDS, wrapAnswer } from '../fixtures/info-poll-answer';

/** The poll's sample answer between its sentinels. */
const answerLines = (): string[] => wrapAnswer(ANSWER_FIELDS.join(' | '), 97);
import { parseInfoAnswer } from '../../src/gmcp/info-answer';

const G = (n: number | string): string => `\x1b[32m${n}\x1b[0m`;

const STAT = [
  `OB: ${G(50)}%, DB: ${G(18)}%, PB: ${G(60)}%, Armour: ${G(38)}%. Wimpy: ${G(204)}. Mood: wimpy.`,
  `Needed: ${G('159,510')} xp, ${G(0)} tp. Gold: ${G(82)}. Alert: normal.`,
  'Affected by:',
  '- armour',
];

/** Rasta's plain `info` (2026-09-26 21:00), up to its first empty line. */
const PLAIN = [
  'You are a male Tarkhnarb Orc.',
  'You are 48 years, 1 month, and 27 days old.',
  'You have played 2 months, 6 days, and 19 hours (real time). Session: 3 mins.',
  'This ranks you as Rasta Fari (level 73).',
  'You are four feet eleven and weigh eight stone and five pounds.',
  'Perception: vision 15, hearing 0, smell 10. Alertness: normal.',
  'You are totally corrupted by the Evilness of Morgoth!',
  'You are welcome in Goblin-town.',
  'Your equipment weighs eighty-one pounds. Heavy, but we will manage...',
  'Your base abilities are: Str:18(16) Int:16 Wis:16 Dex:12 Con:12 Wil:16 Per:9.',
  'Offensive Bonus: 133%, Dodging Bonus: 53%, Parrying Bonus: 39%.',
  'Your armour provides an average protection of 61%.',
  'You have 271/271 hit, 99/109 mana, and 116/125 movement points.',
  'Your mood is aggressive. You will flee if your hit points go below 200.',
  'You have scored 81,832,394 experience points and you have 400,796 travel points.',
  'You have gained some renown in battles against the enemies of the Dark Lord (6 wp).',
  'You need 667,606 exp. points and 0 travel points to reach the next level.',
  'You have 1,039 gold coins, 1 silver penny, and 98 copper pennies.',
  'You are speaking Morbeth.',
];

/** Wraps a text at `cols` in a space's place, as MUME does. */
function wrap(lines: readonly string[], cols: number): string[] {
  const out: string[] = [];
  for (const l of lines) {
    let line = '';
    for (const w of l.split(' ')) {
      if (line && line.length + 1 + w.length > cols) {
        out.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    out.push(line);
  }
  return out;
}

describe('typedInfoCommand', () => {
  it('stat, info and inf in any case; not sta (stand) or stat with words', () => {
    expect(typedInfoCommand('stat')).toEqual({ kind: 'stat' });
    expect(typedInfoCommand('  STAT ')).toEqual({ kind: 'stat' });
    expect(typedInfoCommand('sta')).toBeNull();
    expect(typedInfoCommand('stand')).toBeNull();
    expect(typedInfoCommand('stat x')).toBeNull();
    expect(typedInfoCommand('info')).toEqual({ kind: 'info' });
    expect(typedInfoCommand('Inf')).toEqual({ kind: 'info' });
    expect(typedInfoCommand('in')).toBeNull();
    expect(typedInfoCommand('i')).toBeNull();
    expect(typedInfoCommand('information')).toBeNull();
    expect(typedInfoCommand('info OB=%O')?.kind).toBe('format');
    expect(typedInfoCommand('inf %O')?.kind).toBe('format');
  });
  it('a format with no code the card uses, or two codes touching, reads nothing', () => {
    expect(typedInfoCommand('info hello')).toBeNull();
    expect(typedInfoCommand('info %b')).toBeNull();
    expect(typedInfoCommand('info %O%D')).toBeNull();
    expect(typedInfoCommand('info %O%(%D%)')).toBeNull();
    expect(compileFormat('%O %D')).not.toBeNull();
  });
});

describe('parseStat', () => {
  it('OB, DB, PB, armour, wimpy and the gold coins', () => {
    expect(parseStat(STAT)).toEqual({ ob: 50, db: 18, pb: 60, abs: 38, wimpy: 204, gold: 82 });
  });
  it('negative bonuses, thousands in the gold, a line before it, a wrap', () => {
    const lines = ['Bob tells you, hi.', 'OB: 120%, DB: -5%, PB: 3%, Armour: 70%. Wimpy: 0. Mood: aggressive.', 'Needed: 1,016,028 xp, 0 tp. Gold: 1,039. Alert: normal.'];
    expect(parseStat(lines)).toEqual({ ob: 120, db: -5, pb: 3, abs: 70, wimpy: 0, gold: 1039 });
    expect(parseStat(wrap(lines.slice(1), 30))).toEqual({ ob: 120, db: -5, pb: 3, abs: 70, wimpy: 0, gold: 1039 });
  });
  it('the first line alone: no gold', () => {
    expect(parseStat(STAT.slice(0, 1))).toEqual({ ob: 50, db: 18, pb: 60, abs: 38, wimpy: 204 });
  });
  it('anything else is no answer', () => {
    expect(parseStat(['Rasta says, OB: 50%, DB: 18%, PB: 60%, Armour: 38%. Wimpy: 204. Mood: wimpy.'])).toBeNull();
    expect(parseStat(['OB: high.'])).toBeNull();
  });
});

describe('parsePlainInfo', () => {
  const want: InfoRead = {
    ob: 133,
    db: 53,
    pb: 39,
    abs: 61,
    level: 73,
    years: 48,
    months: 1,
    days: 27,
    height: { feet: 4, inches: 11 },
    weight: { stone: 8, pounds: 5 },
    vision: 15,
    hearing: 0,
    smell: 10,
    alignment: 'totally corrupted by the Evilness of Morgoth',
    carrying: 81,
    load: 'Heavy, but we will manage...',
    abilities: {
      str: { current: 18, unaffected: 16 },
      int: { current: 16, unaffected: 16 },
      wis: { current: 16, unaffected: 16 },
      dex: { current: 12, unaffected: 12 },
      con: { current: 12, unaffected: 12 },
      wil: { current: 16, unaffected: 16 },
      per: { current: 9, unaffected: 9 },
    },
    wimpy: 200,
    purse: { gold: 1039, silver: 1, copper: 98 },
  };
  it("everything the card shows in the poll's own form", () => {
    expect(parsePlainInfo(PLAIN)).toEqual(want);
  });
  it('the same wrapped at a phone width, with colour, and a line before it', () => {
    const coloured = PLAIN.map((l) => l.replace(/\d+/g, (n) => G(n)));
    expect(parsePlainInfo(['A goblin arrives from the north.', ...wrap(coloured, 40)])).toEqual(want);
  });
  it('the alignment is the sentence after the alertness, never the citizen', () => {
    const lines = PLAIN.filter((l) => !l.startsWith('You are totally'));
    expect(parsePlainInfo(lines)?.alignment).toBeUndefined();
  });
  it('a block without the bonuses is no info', () => {
    expect(parsePlainInfo(PLAIN.slice(0, 8))).toBeNull();
    expect(parsePlainInfo(PLAIN.slice(1))).toBeNull();
  });
});

describe('parseFormatAnswer', () => {
  const read = (format: string, lines: string[]): InfoRead | null => parseFormatAnswer(compileFormat(format)!, lines);
  it('the owner’s format, as MUME printed it', () => {
    expect(read('OB=%O DB=%D PB=%k ABS=%A', ['OB=50 DB=18 PB=60 ABS=38'])).toEqual({ ob: 50, db: 18, pb: 60, abs: 38 });
  });
  it('only the codes the card uses; colour, %% and %. as MUME prints them', () => {
    expect(read('%(OB%) %O%% x%.mood %m', ['OB 50% x', 'mood brave'])).toEqual({ ob: 50 });
    expect(read('%O | %G', ['74 | Str:16 Int:16 Wis:16 Dex:11 Con:12 Wil:16 Per:8'])).toEqual({
      ob: 74,
      abilities: {
        str: { unaffected: 16 },
        int: { unaffected: 16 },
        wis: { unaffected: 16 },
        dex: { unaffected: 11 },
        con: { unaffected: 12 },
        wil: { unaffected: 16 },
        per: { unaffected: 8 },
      },
    });
  });
  it('the poll’s own field list reads as the poll does', () => {
    const lines = answerLines();
    const fields = '%l|%O|%D|%k|%A|%S|%i|%w|%d|%o|%I|%p|%G|%a|%N|%n|%h|%W|%C|%F|%q|%c|%r|%K|%v|%H|%s|%y'.split('|').join(' | ');
    const r = read(fields, lines)!;
    const a = parseInfoAnswer(lines)!;
    expect(r.ob).toBe(a.ob);
    expect(r.purse).toEqual(a.purse);
    expect(r.height).toEqual(a.height);
    expect(r.abilities?.str).toEqual({ current: a.abilities.str.current, unaffected: a.abilities.str.unaffected });
  });
  it('no match, or an unreadable value, reads nothing', () => {
    expect(read('OB=%O DB=%D', ['OB=50 PB=18'])).toBeNull();
    expect(read('OB=%O', ['OB=high'])).toBeNull();
    expect(read('OB=%O', ['Bob says OB=50'])).toBeNull();
  });
});

describe('TypedInfoReader', () => {
  function setup() {
    let t = 0;
    const reads: InfoRead[] = [];
    const r = new TypedInfoReader({ now: () => t, read: (x) => reads.push(x) });
    const lines = (...ls: string[]): void => ls.forEach((text) => r.line({ text, prompt: false }));
    const prompt = (): void => r.line({ text: '>', prompt: true });
    return { r, reads, lines, prompt, wait: (ms: number) => (t += ms) };
  }
  it('reads the answer to a command the player sent, up to the empty line', () => {
    const t = setup();
    t.r.sent('stat');
    t.lines(...STAT, '');
    t.prompt();
    expect(t.reads).toEqual([{ ob: 50, db: 18, pb: 60, abs: 38, wimpy: 204, gold: 82 }]);
    expect(t.r.pending).toBe(0);
  });
  it('nothing without the command', () => {
    const t = setup();
    t.lines(...STAT, '');
    t.prompt();
    expect(t.reads).toEqual([]);
  });
  it('queued: other answers and prompts first, then its own', () => {
    const t = setup();
    t.r.sent('look');
    t.r.sent('info OB=%O');
    t.lines('A dark room', 'It is dark.');
    t.prompt();
    t.lines('', 'OB=73', '');
    t.prompt();
    expect(t.reads).toEqual([{ ob: 73 }]);
  });
  it('a stat and an info in one pulse: both read', () => {
    const t = setup();
    t.r.sent('stat');
    t.r.sent('info');
    t.lines(...STAT, '', '', ...PLAIN, '', 'You are subjected to the following temporary effects:', '- strength', '');
    t.prompt();
    expect(t.reads.map((x) => x.ob)).toEqual([50, 133]);
  });
  it(`a reader waits ${READ_WINDOW_MS / 1000} s`, () => {
    const t = setup();
    t.r.sent('stat');
    t.wait(READ_WINDOW_MS + 1);
    t.lines(...STAT, '');
    expect(t.reads).toEqual([]);
    expect(t.r.pending).toBe(0);
  });
});

describe('InfoModel.merge', () => {
  it('changes only what was read, moves the time, keeps silver and copper', () => {
    const m = new InfoModel();
    m.apply(parseInfoAnswer(answerLines())!, 1000);
    const before = m.answer!;
    m.merge({ ob: 50, gold: 82 }, 2000);
    expect(m.answer).not.toBe(before);
    expect(m.answer!.ob).toBe(50);
    expect(m.answer!.db).toBe(before.db);
    expect(m.answer!.purse).toEqual({ ...before.purse!, gold: 82 });
    expect(m.at).toBe(2000);
    expect(m.complete).toBe(true);
  });
  it('abilities: current and unaffected, the delta again', () => {
    const m = new InfoModel();
    m.apply(parseInfoAnswer(answerLines())!, 1000);
    m.merge({ abilities: { str: { current: 18, unaffected: 16 } } }, 2000);
    expect(m.answer!.abilities.str).toEqual({ current: 18, unaffected: 16, delta: 2 });
    m.merge({ abilities: { str: { current: 17 } } }, 3000);
    expect(m.answer!.abilities.str).toEqual({ current: 17, unaffected: 16, delta: 1 });
  });
  it('before any poll: the rest unknown, no purse from the gold alone, not complete', () => {
    const m = new InfoModel();
    m.merge({ ob: 50, gold: 82 }, 2000);
    expect(m.answer!.ob).toBe(50);
    expect(m.answer!.db).toBeNull();
    expect(m.answer!.purse).toBeNull();
    expect(m.complete).toBe(false);
  });
});
