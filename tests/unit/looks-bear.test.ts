// Bear form (stage 80 §1, ADR 0169): what MUME sent in the owner's run with
// Dubb, a Beorning (2026-11-26), through GameState to the portrait and the
// resolver.

import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import type { Line } from '../../src/core/types';
import { ageFactor, raceKind, raceLine } from '../../src/gmcp/race';
import { SEX_KEY } from '../../src/gmcp/sex';
import { GameState } from '../../src/gmcp/state';
import { resolveSelf } from '../../src/looks/resolve';
import { PORTRAIT_IDS, isBearForm, portraitOf } from '../../src/panes/portrait';
import { PORTRAIT_GROUP, loadDraw } from '../../src/panes/portraits';

class MemStorage {
  readonly m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
}

const line = (text: string): Line => ({ text, runs: [], tags: [], prompt: false, raw: text, ts: 0 });

/** The three messages, as sent. */
const LOGIN = { pkg: 'Char.StatusVars', data: { name: 'Dubb', race: 'Man', subrace: 'Beorning', level: 20 } };
const TO_BEAR = { pkg: 'Char.StatusVars', data: { race: 'Bear', subrace: null } };
const BACK = { pkg: 'Char.StatusVars', data: { race: 'Man', subrace: 'Beorning' } };

function setup() {
  const storage = new MemStorage();
  const bus = new Bus();
  const game = new GameState({ now: () => 0, storage: storage as unknown as Storage }).attach(bus);
  bus.emit('gmcp', { pkg: 'Char.Name', data: { name: 'Dubb' } });
  const self = () => {
    const v = game.char.view();
    return { v, portrait: portraitOf(v.race, v.subrace), look: resolveSelf({ race: v.race, subrace: v.subrace, sex: game.sex }) };
  };
  return { bus, game, storage, self };
}

describe('bear form', () => {
  it('the Beorning at login, the bear after the change, the Beorning again', () => {
    const t = setup();
    t.bus.emit('gmcp', LOGIN);
    expect(t.self().portrait).toBe('beorning');
    t.bus.emit('gmcp', TO_BEAR);
    const bear = t.self();
    expect(bear.v.race).toBe('Bear');
    expect(bear.v.subrace).toBeNull();
    expect(bear.portrait).toBe('bear');
    expect(bear.look).toEqual({ kind: 'drawn', portrait: 'bear', sex: 'male', from: 'auto' });
    // The race kind stays a Beorning's: the age factor, the balloon, the race line.
    expect(raceKind(bear.v.race, bear.v.subrace)).toBe('beorning');
    expect(ageFactor('Bear', null)).toBe(1);
    expect(raceLine('Bear', null)).toBe('Bear');
    t.bus.emit('gmcp', BACK);
    expect(t.self().portrait).toBe('beorning');
  });

  it('the bear is drawn for the character sex, which the info line in bear form keeps', () => {
    const t = setup();
    t.bus.emit('gmcp', LOGIN);
    t.bus.emit('text.line', line('You are a female Beorning.'));
    expect(t.game.sex).toBe('female');
    t.bus.emit('gmcp', TO_BEAR);
    expect(t.self().look).toEqual({ kind: 'drawn', portrait: 'bear', sex: 'female', from: 'auto' });
    // A typed `info` in bear form ("You are a male Bear." in the owner's run) is the same sex, read as such.
    t.bus.emit('text.line', line('You are a female Bear.'));
    expect(t.game.sex).toBe('female');
    // A line that is not a sex line never clears it; another character's sex line is not read.
    t.bus.emit('text.line', line('You are a male Dwarf.'));
    expect(t.game.sex).toBe('female');
    t.bus.emit('gmcp', BACK);
    expect(t.game.sex).toBe('female');
    expect(JSON.parse(t.storage.m.get(SEX_KEY)!)).toEqual({ dubb: 'female' });
  });

  it('reads the sex from the bear-form line however GMCP last reported the form', () => {
    const t = setup();
    t.bus.emit('gmcp', LOGIN);
    t.bus.emit('text.line', line('You are a male Bear.'));
    expect(t.game.sex).toBe('male');
    const u = setup();
    u.bus.emit('gmcp', LOGIN);
    u.bus.emit('gmcp', TO_BEAR);
    u.bus.emit('text.line', line('You are a male Bear.'));
    expect(u.game.sex).toBe('male');
  });

  it('a chosen look does not change with the form', () => {
    const choice = { src: 'lib', id: 'bear-m' } as const;
    expect(resolveSelf({ race: 'Man', subrace: 'Beorning', sex: 'male', choice })).toEqual({ kind: 'lib', id: 'bear-m', from: 'choice' });
    expect(resolveSelf({ race: 'Bear', subrace: null, sex: 'male', choice })).toEqual({ kind: 'lib', id: 'bear-m', from: 'choice' });
  });

  it('is a portrait id with a chunk of its own and both sexes drawn', async () => {
    expect(PORTRAIT_IDS).toContain('bear');
    expect(PORTRAIT_GROUP.bear).toBe('bears');
    const draw = await loadDraw('bear');
    expect(draw).not.toBeNull();
    expect(draw!({ sex: 'male', size: 'large', uid: 'a-' })).not.toBe(draw!({ sex: 'female', size: 'large', uid: 'a-' }));
    expect(isBearForm('Bear')).toBe(true);
    expect(isBearForm('Man')).toBe(false);
    expect(isBearForm('Beorning')).toBe(false);
  });
});
