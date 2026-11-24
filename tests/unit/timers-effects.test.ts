// The trackers' events for the info poll (stage 77 F1, ADR 0166 addendum 18
// points 98, 99): an affect starting, refreshed or ending, a herblore
// started, and any cast pending until it is seen over.
import { describe, expect, it } from 'vitest';
import { Bus } from '../../src/core/bus';
import { CAST_PENDING_MS } from '../../src/timers/castq';
import { TimersHub } from '../../src/timers/hub';
import { FakeScheduler } from '../../src/script/engine/timers';
import type { EffectEvent } from '../../src/timers/tracker';
import { T0, bench } from './timers-helpers';

describe('tracker effects', () => {
  it('an affect up, refreshed and down; silent restores and reconciles are none', () => {
    const b = bench();
    b.line('You start glowing.');
    b.line('Your aura glows more intensely.');
    b.line('The white aura around your body fades.');
    expect(b.effects).toEqual(['affect-up', 'affect-refreshed', 'affect-down']);
    b.line('Affected by:', '- sanctuary', '');
    expect(b.effects).toHaveLength(3);
  });
  it('an affect without a drop line ending by its time', () => {
    const b = bench();
    b.tr.affects.start('anger', b.now());
    const def = b.cell('anger');
    expect(def).toBeDefined();
    b.effects.length = 0;
    b.advance(Math.ceil((def!.expiresAt! - b.now()) / 1000) + 60);
    expect(b.cell('anger')).toBeUndefined();
    expect(b.effects).toEqual(['affect-down']);
  });
  it('a herblore started, not its phases', () => {
    const b = bench();
    b.tr.herbs.addHerb('Clearthought', b.now());
    expect(b.effects).toEqual(['herb-up']);
    b.advance(3600);
    expect(b.effects.filter((e) => e === 'herb-up')).toHaveLength(1);
  });
});

describe('a cast pending', () => {
  it('from any cast sent until a failure line, a bad target or an empty Enter', () => {
    const b = bench();
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
    b.send("cast 'magic missile' goblin");
    expect(b.tr.casts.pendingUntil(b.now())).toBe(T0 + CAST_PENDING_MS);
    b.line('Nothing seems to happen.');
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
    b.send("c 'armour'");
    b.line('Nobody here by that name.');
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
    b.send("c 'armour'");
    b.send('');
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
  });
  it('the concentration line restarts its time; it lapses at the end', () => {
    const b = bench();
    b.send("cast 'teleport'");
    b.advance(3);
    b.line('You start to concentrate...');
    expect(b.tr.casts.pendingUntil(b.now())).toBe(b.now() + CAST_PENDING_MS);
    b.advance(CAST_PENDING_MS / 1000);
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
  });
  it('not a command that is no cast', () => {
    const b = bench();
    b.send('cast');
    b.send('look');
    expect(b.tr.casts.pendingUntil(b.now())).toBeNull();
  });
});

describe('TimersHub: onEffect and castPendingUntil', () => {
  it('reports the effects; a landing ends the pending cast', () => {
    const sched = new FakeScheduler();
    const now = (): number => T0 + sched.now();
    const hub = new TimersHub({ now, scheduler: sched });
    const seen: EffectEvent[] = [];
    const off = hub.onEffect((e) => seen.push(e));
    const bus = new Bus();
    hub.attach(bus);
    bus.emit('cmd.sent', { text: "cast 'armour'", ts: 0 });
    expect(hub.castPendingUntil()).toBe(T0 + CAST_PENDING_MS);
    const rules: Array<{ pattern: string; fn?: (m: { args: string[]; line: { text: string } | null }) => void }> = [];
    hub.installRules({ define: (_k, pattern, _b, o) => rules.push({ pattern, ...(o.fn ? { fn: o.fn } : {}) }) });
    const line = (text: string): void => rules.forEach((r) => r.fn?.({ args: [text], line: { text } }));
    line('A blue transparent wall slowly appears around you.');
    expect(seen).toEqual(['affect-up']);
    expect(hub.castPendingUntil()).toBeNull();
    off();
    line('You feel less protected.');
    expect(seen).toEqual(['affect-up']);
    hub.dispose();
  });
});
