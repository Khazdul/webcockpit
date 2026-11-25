// What the Character card draws (stage 77 part D, ADR 0166 addendum 6).
import { describe, expect, it } from 'vitest';
import { CharModel } from '../../src/gmcp/char';
import type { CharView } from '../../src/gmcp/char';
import type { InfoAnswer } from '../../src/gmcp/info-answer';
import { parseInfoAnswer } from '../../src/gmcp/info-answer';
import { xpForLevel } from '../../src/gmcp/levels';
import {
  MOOD_CYCLE,
  PENDING_MS,
  Pending,
  TabState,
  clickCommand,
  dataAge,
  hpTip,
  iconsView,
  loadSignal,
  loreView,
  quietText,
  ringView,
  signed,
  shieldsView,
  statsView,
  statusView,
  vitalDigits,
  vitalView,
  wimpyAt,
} from '../../src/panes/character-model';
import { DARK_SIGNALS } from '../../src/panes/palette';
import { ANSWER_FIELDS } from '../fixtures/info-poll-answer';

function viewOf(vitals: Record<string, unknown>, status: Record<string, unknown> = { race: 'Orc', subrace: 'Tarkhnarb Orc' }): CharView {
  const c = new CharModel();
  c.apply('Char.Name', { name: 'rasta' });
  c.apply('Char.StatusVars', status);
  c.apply('Char.Vitals', vitals);
  return c.view();
}

/** The stage file's one live sample, with `change` applied. */
function answerWith(change: Partial<InfoAnswer> = {}): InfoAnswer {
  return { ...parseInfoAnswer([ANSWER_FIELDS.join(' | ')])!, ...change };
}

const NBSP = ' ';
const env = (over: { clicks?: boolean; fighting?: boolean; pending?: string[] } = {}) => ({
  clicks: over.clicks ?? true,
  fighting: over.fighting ?? false,
  pending: { has: (id: string) => over.pending?.includes(id) ?? false },
});

describe('clicks (decision 19, point 37)', () => {
  it('mood: wimpy → prudent → normal → brave → aggressive → wimpy', () => {
    const sent = ['wimpy', 'prudent', 'normal', 'brave', 'aggressive'].map((mood) => clickCommand('mood', viewOf({ mood })));
    expect(sent).toEqual(['change mood prudent', 'change mood normal', 'change mood brave', 'change mood aggressive', 'change mood wimpy']);
  });

  it('never berserk: not a step, and no click from it', () => {
    expect(MOOD_CYCLE).not.toContain('berserk');
    for (const mood of [...MOOD_CYCLE, 'berserk', 'Berserk', 'calm', null]) {
      expect(clickCommand('mood', viewOf({ mood })) ?? '').not.toContain('berserk');
    }
    expect(clickCommand('mood', viewOf({ mood: 'berserk' }))).toBeNull();
  });

  it('casts: quick → fast → normal → careful → thorough → quick', () => {
    const sent = ['quick', 'fast', 'normal', 'careful', 'thorough'].map((w) => clickCommand('casts', viewOf({ 'spell-effort': w })));
    expect(sent).toEqual([
      'change spellcasting fast',
      'change spellcasting normal',
      'change spellcasting careful',
      'change spellcasting thorough',
      'change spellcasting quick',
    ]);
  });

  it('alertness: every step, round', () => {
    const sent = ['normal', 'careful', 'attentive', 'vigilant', 'paranoid'].map((alertness) => clickCommand('alertness', viewOf({ alertness })));
    expect(sent).toEqual([
      'change alertness careful',
      'change alertness attentive',
      'change alertness vigilant',
      'change alertness paranoid',
      'change alertness normal',
    ]);
  });

  it('sneak, climb and swim toggle; riding → lead, otherwise ride', () => {
    const off = viewOf({});
    const on = viewOf({ sneak: 's', climb: 'C', swim: true, ride: 'a horse' });
    for (const id of ['sneak', 'climb', 'swim'] as const) {
      expect(clickCommand(id, off)).toBe(id);
      expect(clickCommand(id, on)).toBe(id);
    }
    expect(clickCommand('ride', off)).toBe('ride');
    expect(clickCommand('ride', on)).toBe('lead');
    expect(clickCommand('ride', viewOf({ ride: true }))).toBe('lead');
  });

  it('position: standing → rest, resting or sitting → stand, sleeping → wake', () => {
    const of = (position: unknown) => clickCommand('position', viewOf({ position }));
    expect([of('standing'), of('resting'), of('sitting'), of('sleeping'), of('Standing')]).toEqual(['rest', 'stand', 'stand', 'wake', 'rest']);
    expect(clickCommand('position', viewOf({ position: 'standing' }), true)).toBeNull();
  });

  it('none where the next value is not known', () => {
    expect(clickCommand('mood', viewOf({ mood: 'calm' }))).toBeNull();
    expect(clickCommand('mood', viewOf({}))).toBeNull();
    expect(clickCommand('casts', viewOf({ 'spell-effort': 'slow' }))).toBeNull();
    expect(clickCommand('casts', viewOf({}))).toBeNull();
    expect(clickCommand('alertness', viewOf({ alertness: 'asleep' }))).toBeNull();
    expect(clickCommand('alertness', viewOf({}))).toBeNull();
    for (const position of ['fighting', 'stunned', 'dying', 'incapacitated', 'flying', null, undefined, 'constructor']) {
      expect(clickCommand('position', viewOf({ position }))).toBeNull();
    }
  });

  it('a tooltip names the next step under the whole word; the word alone without a click (T2–T11)', () => {
    const v = viewOf({ mood: 'brave', 'spell-effort': 'slow', alertness: 'normal', carrying: 'heavy', position: 'standing' });
    const [mood, casts, alert, weight] = statusView(v, env(), 20);
    expect(mood).toMatchObject({ tipTitle: 'Mood: brave', tip: 'Click: aggressive' });
    expect(casts).toMatchObject({ tipTitle: null, tip: 'Casts: slow' });
    expect(casts!.click!.command).toBeNull();
    expect(alert).toMatchObject({ tipTitle: 'Alertness: normal', tip: 'Click: careful' });
    expect(weight!.click).toBeNull();
    // A replay, the log player: no click, the whole word still on hover.
    statusView(v, env({ clicks: false }), 20)
      .slice(0, 3)
      .forEach((f, i) => {
        expect(f.click!.command).toBeNull();
        expect(f).toMatchObject({ tipTitle: null, tip: ['Mood: brave', 'Casts: slow', 'Alertness: normal'][i] });
      });
    expect(statusView(viewOf({ mood: 'berserk' }), env(), 20)[0]).toMatchObject({ tipTitle: null, tip: 'Mood: berserk' });
    expect(statusView(viewOf({}), env(), 20)[0]).toMatchObject({ tipTitle: null, tip: 'Mood: unknown' });
    const icons = iconsView(v, env());
    expect(icons.map((i) => i.command)).toEqual(['sneak', 'ride', 'climb', 'swim', 'rest']);
    // The toggles: the name alone, always; the position its word, and its click.
    expect(icons.map((i) => [i.tipTitle, i.tip])).toEqual([
      [null, 'Sneak'],
      [null, 'Ride'],
      [null, 'Climb'],
      [null, 'Swim'],
      ['Standing', 'Click: rest'],
    ]);
    expect(iconsView(v, env({ clicks: false })).map((i) => [i.tipTitle, i.tip])).toEqual([
      [null, 'Sneak'],
      [null, 'Ride'],
      [null, 'Climb'],
      [null, 'Swim'],
      [null, 'Standing'],
    ]);
    expect(iconsView(v, env({ fighting: true }))[4]).toMatchObject({ tipTitle: null, tip: 'Fighting' });
    expect(iconsView(viewOf({ position: 'stunned' }), env())[4]).toMatchObject({ tipTitle: null, tip: 'Stunned' });
    // Pending (T5): the bold title alone (a body equal to the title is left out).
    expect(iconsView(v, env({ pending: ['sneak', 'position'] }))[0]).toMatchObject({ pending: true, tipTitle: null, tip: 'Sneak' });
    expect(iconsView(v, env({ pending: ['position'] }))[4]).toMatchObject({ pending: true, tipTitle: 'Standing', tip: 'Standing' });
    expect(statusView(v, env({ pending: ['mood'] }), 20)[0]).toMatchObject({ tipTitle: 'Mood: brave', tip: 'Mood: brave' });
  });
});

describe('pending (point 8)', () => {
  it('ends when GMCP changes that value, and not for another', () => {
    const p = new Pending();
    p.start('mood', viewOf({ mood: 'brave' }), 1000);
    p.settle(viewOf({ mood: 'brave', alertness: 'careful' }));
    expect(p.has('mood')).toBe(true);
    p.settle(viewOf({ mood: 'aggressive' }));
    expect(p.has('mood')).toBe(false);
  });

  it('or after 3 s', () => {
    const p = new Pending();
    p.start('position', viewOf({ position: 'standing' }), 1000);
    expect(PENDING_MS).toBe(3000);
    expect(p.nextAt()).toBe(4000);
    p.expire(3999);
    expect(p.has('position')).toBe(true);
    p.expire(4000);
    expect(p.has('position')).toBe(false);
    expect(p.nextAt()).toBeNull();
  });

  it('each element waits by itself, the toggles too', () => {
    const p = new Pending();
    const v = viewOf({});
    p.start('sneak', v, 0);
    p.start('ride', v, 500);
    expect(p.nextAt()).toBe(3000);
    const before = p.version;
    p.settle(viewOf({ ride: 'a horse' }));
    expect([p.has('sneak'), p.has('ride')]).toEqual([true, false]);
    expect(p.version).toBeGreaterThan(before);
  });
});

describe('the tabs and the fight (round 12 decision 8: only the swords)', () => {
  it('a fight changes no tab', () => {
    const t = new TabState();
    expect(t.shown).toBe('status');
    t.select('lore');
    expect(t.setFight(true)).toBe(true);
    expect(t.fighting).toBe(true);
    expect(t.shown).toBe('lore');
    expect(t.setFight(true)).toBe(false);
    t.select('stats');
    expect(t.shown).toBe('stats');
    expect(t.setFight(false)).toBe(true);
    expect(t.fighting).toBe(false);
    expect(t.shown).toBe('stats');
  });

  it('a pane too low for the tabs shows Status, and the chosen tab when tall again (point 125)', () => {
    const t = new TabState();
    t.select('lore');
    expect(t.setLow(true)).toBe(true);
    expect(t.shown).toBe('status');
    expect(t.choice).toBe('lore');
    expect(t.setLow(true)).toBe(false);
    expect(t.setLow(false)).toBe(true);
    expect(t.shown).toBe('lore');
    t.select('status');
    expect(t.setLow(true)).toBe(false);
  });

  it('the position is the crossed swords, with no click', () => {
    const pos = iconsView(viewOf({ position: 'standing' }), env({ fighting: true }))[4]!;
    expect(pos).toMatchObject({ icon: 'fighting', name: 'Fighting', command: null });
  });
});

describe('words', () => {
  it('a Status value is never longer than the room, for every word there is', () => {
    const words = [...MOOD_CYCLE, 'berserk', 'quick', 'fast', 'careful', 'thorough', 'attentive', 'vigilant', 'paranoid', 'peanuts', 'uncomfortable', 'really heavy', 'painful', 'torture', 'a word as sent'];
    for (const w of words) {
      for (let n = 1; n < 15; n++) expect([...statusView(viewOf({ mood: w }), env(), n)[0]!.value].length, `${w} in ${n}`).toBeLessThanOrEqual(n);
    }
  });

  it('signs: a true minus, and ±0', () => {
    expect([signed(2), signed(-1), signed(0), signed(-0.04, 1), signed(2.24, 1)]).toEqual(['+2', '−1', '±0', '±0.0', '+2.2']);
  });
});

describe('weight (decision 9)', () => {
  it('the two highest red, the third highest orange', () => {
    expect([0, 1, 2, 3, 4, 5, null].map(loadSignal)).toEqual([null, null, null, 'low', 'critical', 'critical', null]);
  });

  it('the word as sent, the whole word in the tooltip (T6), never pounds', () => {
    const w = statusView(viewOf({ carrying: 'really heavy' }), env(), 20)[3]!;
    expect(w).toMatchObject({ value: 'really heavy', tipTitle: null, tip: 'Weight: really heavy', signal: 'low' });
    const light = statusView(viewOf({ carrying: 'peanuts' }), env(), 20)[3]!;
    expect(light).toMatchObject({ value: 'peanuts', tip: 'Weight: peanuts', signal: null });
    expect(statusView(viewOf({ carrying: 'Odd' }), env(), 20)[3]).toMatchObject({ value: 'Odd', tip: 'Weight: Odd', signal: null });
    expect(statusView(viewOf({}), env(), 20)[3]!.tip).toBeNull();
  });

  it('every Status form: the whole word where it fits, else the hand-made short form (points 126, 171)', () => {
    const v = viewOf({ mood: 'aggressive', 'spell-effort': 'normal', alertness: 'attentive', carrying: 'really heavy' });
    expect(statusView(v, env(), 4).map((f) => f.value)).toEqual(['aggr', 'norm', 'attn', 'rhvy']);
    expect(statusView(v, env(), 6).map((f) => f.value)).toEqual(['aggr', 'normal', 'attn', 'r.hvy']);
    expect(statusView(v, env(), 20).map((f) => f.value)).toEqual(['aggressive', 'normal', 'attentive', 'really heavy']);
    // No `…` and no dot cut (`nor…`, `agg.`), at any room.
    const docked = viewOf({ mood: 'brave', 'spell-effort': 'normal', alertness: 'vigilant', carrying: 'really heavy' });
    expect(statusView(docked, env(), 4).map((f) => f.value)).toEqual(['brav', 'norm', 'vigl', 'rhvy']);
    for (let n = 1; n < 8; n++) for (const f of statusView(docked, env(), n)) expect(f.value, `${f.key} in ${n}`).not.toMatch(/…|[a-z]\.$/);
    // The tooltip and the name keep the whole word; no room: no value (the letter stays, CSS).
    expect(statusView(v, env(), 4)[0]).toMatchObject({ name: 'Mood: aggressive' });
    expect(statusView(v, env(), 0).map((f) => f.value)).toEqual(['', '', '', '']);
    expect(statusView(viewOf({}), env(), 4)[0]!.value).toBe('—');
  });

  it('the step meter: every step of each field, the current one (round 12 decision 3)', () => {
    const v = viewOf({ mood: 'aggressive', 'spell-effort': 'quick', alertness: 'paranoid', carrying: 'heavy' });
    expect(statusView(v, env(), 20).map((f) => [f.steps, f.step])).toEqual([
      [6, 4],
      [5, 0],
      [5, 4],
      [6, 2],
    ]);
    expect(statusView(viewOf({ mood: 'calm', carrying: 'Odd' }), env(), 20).map((f) => f.step)).toEqual([null, null, null, null]);
  });
});

describe('vitals (decision 11)', () => {
  const COLOR = '#2fa84f';
  const hp = (vitals: Record<string, unknown>) => viewOf(vitals).vitals.hp;
  const draw = (vitals: Record<string, unknown>, form: 'full' | 'tight' | 'value' | 'number' = 'full') => vitalView('hp', hp(vitals), COLOR, false, form);

  it('exact: the number, in the form there is room for', () => {
    const v = { hp: 187, maxhp: 270 };
    expect(draw(v)).toMatchObject({ value: '187', max: ' / 270', fill: 69.3, span: null, color: COLOR });
    expect(draw(v, 'tight').max).toBe('/270');
    expect(draw(v, 'value').max).toBe('');
    expect(draw(v, 'number').max).toBe('');
  });

  it('band: the span and no number, never the word', () => {
    const d = draw({ 'hp-string': 'Hurt', maxhp: 270 });
    expect(d).toMatchObject({ value: '', max: '', fill: 46, span: { lo: 46, hi: 70 } });
    expect(JSON.stringify(d).toLowerCase()).not.toContain('hurt');
    expect(JSON.stringify(hpTip(hp({ 'hp-string': 'Hurt' }), 0)).toLowerCase()).not.toContain('hurt');
    expect(draw({ 'hp-string': 'Healthy' })).toMatchObject({ fill: 100, span: null });
  });

  it('a band after a number drops the number', () => {
    const c = new CharModel();
    c.apply('Char.Vitals', { hp: 200, maxhp: 270 });
    c.apply('Char.Vitals', { 'hp-string': 'Wounded' });
    expect(vitalView('hp', c.view().vitals.hp, COLOR, false, 'full')).toMatchObject({ value: '', fill: 26, span: { lo: 26, hi: 45 } });
  });

  it('an unknown word or none: an empty bar', () => {
    expect(draw({ 'hp-string': 'Peachy' })).toMatchObject({ value: '', fill: 0, span: null });
    expect(draw({})).toMatchObject({ value: '', fill: 0, span: null });
    expect(draw({ hp: 12 })).toMatchObject({ value: '12', max: '', fill: 0 });
  });

  it('low and critical as Group', () => {
    expect(draw({ hp: 45, maxhp: 100 }).color).toBe(DARK_SIGNALS.vitalLow);
    expect(draw({ hp: 25, maxhp: 100 }).color).toBe(DARK_SIGNALS.vitalCritical);
    expect(draw({ 'hp-string': 'Bad' }).color).toBe(DARK_SIGNALS.vitalCritical);
  });

  it('the wimpy arrow at wimpy / maxhp', () => {
    expect(wimpyAt(50, 200)).toBe(25);
    expect(wimpyAt(500, 200)).toBe(100);
    expect([wimpyAt(0, 200), wimpyAt(null, 200), wimpyAt(50, null), wimpyAt(50, 0)]).toEqual([null, null, null, null]);
  });

  it('the HP tooltip: the wimpy alone (the owner, 2026-11-25)', () => {
    expect(hpTip(hp({ hp: 187, maxhp: 270 }), 150)).toEqual({ title: null, tip: 'Wimpy 150' });
    expect(hpTip(hp({ 'hp-string': 'Hurt' }), 30)).toEqual({ title: null, tip: 'Wimpy 30' });
    expect(hpTip(hp({}), 30)).toEqual({ title: null, tip: 'Wimpy 30' });
    // No wimpy: no tooltip.
    expect(hpTip(hp({ hp: 187, maxhp: 270 }), 0)).toEqual({ title: null, tip: null });
    expect(hpTip(hp({ 'hp-string': 'Hurt' }), null)).toEqual({ title: null, tip: null });
  });

  it('the digits follow the maxima, so a falling value moves nothing', () => {
    expect(vitalDigits(viewOf({ hp: 9, maxhp: 270 }).vitals)).toBe(3);
    expect(vitalDigits(viewOf({ hp: 9, maxhp: 1270 }).vitals)).toBe(4);
  });
});

describe('the level ring (decision 3)', () => {
  it('level from XP, base and session, TP inside, and the tooltip', () => {
    const c = new CharModel();
    const lo = xpForLevel(73);
    const span = xpForLevel(74) - lo;
    c.apply('Char.Vitals', { xp: lo + span * 0.2, tp: 300_000 });
    c.apply('Char.Vitals', { xp: lo + span * 0.5 });
    const r = ringView(c.view());
    expect(r.level).toBe('73');
    expect(r.base).toBeCloseTo(0.2);
    expect(r.gain).toBeCloseTo(0.3);
    expect(r.tp).toBe(1);
    expect(r.title).toBe('Level 73');
    const left = String(span * 0.5).replace(/\B(?=(\d{3})+$)/g, NBSP);
    expect(r.tip).toBe(`XP 50 % · ${left} to 74\nTP done`);
  });

  it('unknown: a dash and empty rings', () => {
    expect(ringView(new CharModel().view())).toMatchObject({ level: '—', base: 0, gain: 0, tp: 0, title: null, tip: 'Level unknown' });
  });

  it('the top level has nothing to reach', () => {
    expect(ringView(viewOf({ xp: xpForLevel(100) + 5 })).tip).toBe('XP 100 %');
  });
});

describe('Stats (decisions 14–17)', () => {
  it("Rasta's sample", () => {
    const s = statsView(answerWith(), 'Orc', 'Tarkhnarb Orc');
    expect(s).not.toHaveProperty('shields');
    expect(s.abilities.map((a) => [a.value, a.delta])).toEqual([['16', ''], ['16', ''], ['16', ''], ['11', ''], ['12', ''], ['16', ''], ['8', '']]);
    expect(s.age).toMatchObject({ years: '57', name: '2nd age', next: '3rd at 64' });
    expect(s.age.track!.index).toBe(1);
    expect(s.age.modifiers!.map((r) => r.map((m) => m.text))).toEqual([
      ['+14', '−1', '+7'],
      ['+1.4', '+2.2', '+2.4'],
    ]);
    expect(s.age.modifiers![0]!.map((m) => m.dir)).toEqual(['up', 'down', 'up']);
    expect(s.senses).toEqual(['25', '10', '20', `97${NBSP}lb`]);
  });

  it('a delta under the value, green up and red down, current and unaffected in the tooltip', () => {
    const a = answerWith();
    a.abilities = { ...a.abilities, str: { current: 18, unaffected: 16, delta: 2 }, dex: { current: 10, unaffected: 11, delta: -1 } };
    const s = statsView(a, 'Orc', null);
    expect(s.abilities[0]).toMatchObject({ value: '18', delta: '+2', dir: 'up', tip: 'Unaffected 16' });
    expect(s.abilities[0]).not.toHaveProperty('title');
    expect(s.abilities[3]).toMatchObject({ value: '10', delta: '−1', dir: 'down', tip: 'Unaffected 11' });
    // No delta, or unknown: no tooltip (T46, T47).
    expect(s.abilities[1]!.tip).toBeNull();
    a.abilities = { ...a.abilities, int: { current: null, unaffected: null, delta: null } };
    expect(statsView(a, 'Orc', null).abilities[1]!.tip).toBeNull();
  });

  it('the shields (on Status since F2b): a true minus, a dash, and `⋯` until the poll answers', () => {
    expect(shieldsView(answerWith()).map((s) => s.value)).toEqual(['81', '13', '85', '70']);
    expect(shieldsView(answerWith({ db: -31 }))[1]).toEqual({ key: 'db', value: '−31', tip: 'Defensive bonus' });
    expect(shieldsView(answerWith({ ob: null }))[0]!.value).toBe('—');
    const wait = shieldsView(null);
    expect(wait.map((s) => s.value)).toEqual(['⋯', '⋯', '⋯', '⋯']);
    expect(wait[3]).toEqual({ key: 'abs', value: '⋯', tip: 'Armour absorption' });
  });

  it('an unknown race: no age track and no modifiers', () => {
    const s = statsView(answerWith(), 'Ent', null);
    expect(s.age).toEqual({ years: '57', name: '', next: '', track: null, modifiers: null });
  });

  it('the 7th age has no next', () => {
    expect(statsView(answerWith({ years: 200 }), 'Orc', null).age).toMatchObject({ name: '7th age', next: '' });
  });

  it('what could not be read is a dash', () => {
    const s = statsView(answerWith({ ob: null, years: null, carrying: null }), 'Orc', null);
    expect(s.age.years).toBe('—');
    expect(s.senses[3]).toBe('—');
  });
});

describe('Lore (decision 18)', () => {
  it("Rasta's sample", () => {
    expect(loreView(answerWith(), 'Tarkhnarb orc')).toEqual({
      race: 'Tarkhnarb orc',
      alignment: 'totally corrupted by the Evilness of Morgoth',
      citizen: 'GoblinTown',
      warFame: 'warlord',
      warPoints: '19',
      purse: ['380', '5', '49'],
      height: '4′11″',
      weight: `8${NBSP}st 5${NBSP}lb`,
      birthday: 'in 5 months',
    });
  });

  it('several towns are a list, a sentence without "You are" stays whole', () => {
    const alignment = 'You must have been sent to Arda to free it from the sorrows that weigh upon it';
    const l = loreView(answerWith({ citizen: 'Bree Shire Fornost GreyHavens Rivendell', alignment }), null);
    expect(l.citizen).toBe('Bree · Shire · Fornost · GreyHavens · Rivendell');
    expect(l.alignment).toBe(alignment);
    expect(l.race).toBe('—');
  });

  it('what is missing is a dash', () => {
    const l = loreView(answerWith({ citizen: null, warFame: null, purse: null, height: null, weight: null, months: null }), null);
    expect([l.citizen, l.warFame, l.warPoints, l.purse, l.height, l.weight, l.birthday]).toEqual(['—', '—', '', null, '—', '—', '—']);
  });
});

describe("the data's age and the quiet state", () => {
  it('seconds, minutes, hours, and when it changes', () => {
    expect(dataAge(1000, 13_500, true, 40)).toEqual({ text: 'info 12 s ago', changesAt: 14_000 });
    expect(dataAge(0, 125_000, true, 40)).toEqual({ text: 'info 2 min ago', changesAt: 180_000 });
    expect(dataAge(0, 7_300_000, true, 40).text).toBe('info 2 h ago');
    expect(dataAge(5000, 0, true, 40).text).toBe('info 0 s ago');
  });

  it('the longest wording that fits', () => {
    expect([13, 12, 8, 4, 3].map((n) => dataAge(0, 12_000, true, n).text)).toEqual(['info 12 s ago', '12 s ago', '12 s ago', '12 s', '']);
    expect(dataAge(0, 12_000, false, 40).text).toBe('info 12 s ago · fetch off');
    expect(dataAge(0, 12_000, false, 12).text).toBe('fetch off');
  });

  it('no data: waiting, off, a replay', () => {
    expect(quietText({ replay: false, fetch: true })).toContain('No data yet');
    expect(quietText({ replay: false, fetch: false })).toContain('off');
    expect(quietText({ replay: true, fetch: true })).toContain('replay');
  });
});
