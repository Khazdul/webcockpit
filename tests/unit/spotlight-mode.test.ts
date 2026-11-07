// @vitest-environment happy-dom
// Stage 46 (ADR 0131): the bare reel the Spotlights page's viewer plays
// (`openSpotlightReel(…, { bare: true })`): the start card, ← → on the
// first and the last, a paused `goTo`, `autoplay`, the end heard once per
// stop, every pane off with Display kept, and `open` of a rebuilt wall's
// reel on the same host with its subscribers kept. The viewer's own tests
// (the head, the controls, the end card, the kept host):
// spotlights-viewer.test.tsx; the wall's rebuild: spotlights-wall.test.tsx.
//
// The full-page reel with its card (stages 30e and 32c, ADR 0110 / 0114)
// is gone with the shell's `openSpotlights` (stage 46 wave 3), and so are
// its tests.
import { describe, expect, it } from 'vitest';
import { PlayerHost } from '../../src/app/player-host';
import { type BareReel, SPOTLIGHT_RED, openSpotlightReel } from '../../src/player/spotlight-mode';
import type { Reel, ReelLoader } from '../../src/player/spotlight-reel';
import type { RunEvent } from '../../src/runs/events';
import { SettingsStore, type SpotlightSettings } from '../../src/settings';
import { type SpotlightRun, selectSpotlights } from '../../src/share/spotlights';
import type { ChainRun } from '../../src/player/timeline';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

const S = 1e6;
const frame = () => new Promise((r) => setTimeout(r, 40));

/** Two characters, three moments: Rasta's level-up and death, Bob's achievement. */
function runs(): { runs: SpotlightRun[]; logs: Map<string, string> } {
  const r1 = BASE_US;
  const r2 = BASE_US + 3600 * S;
  const lines = (base: number, at: number[]) => makeLog(base, at.flatMap((t) => [{ at: t - 2, in: `Before ${t}.` }, { at: t, in: `Moment ${t}.` }]));
  const rasta: RunEvent[] = [
    { type: 'run_start', us: r1, character: 'Rasta', level: 41, schema: 1 },
    { type: 'level_up', us: r1 + 20 * S, level: 42 },
    { type: 'char_death', us: r1 + 60 * S, logUs: r1 + 60 * S },
  ];
  const bob: RunEvent[] = [
    { type: 'run_start', us: r2, character: 'Bob', schema: 1 },
    { type: 'achievement', us: r2 + 30 * S, name: 'Slayer of Rats' },
  ];
  return {
    runs: [
      { meta: meta('Rasta/1', r1, { bytes: 100 }), events: rasta },
      { meta: meta('Bob/1', r2, { bytes: 100 }), events: bob },
    ],
    logs: new Map([
      ['Rasta/1', lines(r1, [20, 60])],
      ['Bob/1', lines(r2, [30])],
    ]),
  };
}

/** A loader over the runs above: every spotlight's window is its run's whole log. */
function loader(): ReelLoader & { calls: number; gate: Promise<void> | null } {
  const { runs: rs, logs } = runs();
  const l = {
    calls: 0,
    gate: null as Promise<void> | null,
    async load(f: SpotlightSettings, nowUs: number): Promise<Reel | { empty: 'no_data' | 'filtered' }> {
      l.calls++;
      if (l.gate) await l.gate;
      const spots = selectSpotlights(rs, f, nowUs);
      if (spots.length === 0) return { empty: 'filtered' };
      const chain: ChainRun[] = spots.map((s) => ({ meta: rs.find((r) => r.meta.runId === s.runId)!.meta, text: logs.get(s.runId)! }));
      return { spots, chain };
    },
  };
  return l;
}

const key = (k: string, target: EventTarget = window, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));

// ------------------------------------------------------------ the bare reel (stage 46)

describe('Spotlights reel: bare, for the page\'s viewer (ADR 0131)', () => {
  async function openBare(o: { start?: number; autoplay?: boolean; onEnd?: () => void } = {}) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const wall = new FakeWall();
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    void settings.load();
    const host = new PlayerHost({ root, settings, wall, onClose: () => {} });
    Object.defineProperty(host.el, 'clientWidth', { configurable: true, value: 1200 });
    const src = loader();
    const now = BASE_US + 86_400 * S;
    const first = await src.load(settings.get().spotlights, now);
    if ('empty' in first) throw new Error('no reel');
    let esc = 0;
    const r: BareReel = openSpotlightReel(host, first, {
      bare: true,
      ...(o.start !== undefined ? { start: o.start } : {}),
      ...(o.autoplay !== undefined ? { autoplay: o.autoplay } : {}),
      onEsc: () => esc++,
      ...(o.onEnd ? { onEnd: o.onEnd } : {}),
    });
    return { root, wall, settings, host, src, r, now, esc: () => esc };
  }

  it('starts at the chosen card without a card, a header or a filter; ← on the first restarts it, → on the last does nothing', async () => {
    const { root, host, r, wall } = await openBare({ start: 2 });
    expect(root.querySelector('.wc-spot-card')).toBeNull();
    expect(root.querySelector('.wc-player-header')).toBeNull();
    expect(root.querySelector('.wc-spot-empty')).toBeNull();
    expect(r.reel.spots.map((x) => `${x.character}:${x.kind}`)).toEqual(['Bob:achievement', 'Rasta:death', 'Rasta:level']);
    expect(r.index()).toBe(2);
    expect(host.engine!.position).toBe(r.starts[2]);
    expect(host.engine!.playing).toBe(true);
    // → on the last: nothing.
    key('ArrowRight');
    expect(r.index()).toBe(2);
    expect(host.engine!.position).toBe(r.starts[2]);
    // To the first; ← there (at once, or later) restarts it.
    r.goTo(0);
    key('ArrowLeft');
    expect(r.index()).toBe(0);
    expect(host.engine!.position).toBe(r.starts[0]);
    wall.advance(2000);
    expect(host.engine!.position).toBeGreaterThan(r.starts[0]!);
    key('ArrowLeft');
    expect(host.engine!.position).toBe(r.starts[0]);
    host.dispose();
  });

  it('goTo can stay paused; autoplay false waits for Play', async () => {
    const a = await openBare({ autoplay: false, start: 1 });
    expect(a.host.engine!.playing).toBe(false);
    expect(a.r.index()).toBe(1);
    a.r.goTo(2, false);
    expect(a.r.index()).toBe(2);
    expect(a.host.engine!.playing).toBe(false);
    a.r.goTo(0);
    expect(a.host.engine!.playing).toBe(true);
    a.host.dispose();
  });

  it('hears the end once per stop: Play again and a second end tell it again', async () => {
    let ends = 0;
    const { host, r, wall } = await openBare({ onEnd: () => ends++ });
    host.engine!.seek(host.engine!.duration - 50);
    wall.advance(2000);
    expect(host.engine!.atEnd).toBe(true);
    wall.advance(2000);
    expect(ends).toBe(1);
    // Play again from the first (the end card's P), and on to the end once more.
    host.engine!.seek(0);
    host.engine!.play();
    expect(host.engine!.atEnd).toBe(false);
    expect(r.index()).toBe(0);
    host.engine!.seek(host.engine!.duration - 50);
    wall.advance(2000);
    expect(ends).toBe(2);
    host.dispose();
  });

  it('every pane off, Display only; the colours and the font stay across a rebuilt wall\'s reel, and so do the subscribers', async () => {
    const { host, r, src, settings, now, root } = await openBare({ start: 1 });
    expect(Object.values(host.viewerOverrides.panes ?? {}).length).toBeGreaterThan(0);
    expect(Object.values(host.viewerOverrides.panes ?? {}).every((on) => on === false)).toBe(true);
    expect(root.querySelector('[data-act="panes"]')).toBeNull();
    const vc = host.viewerControls(true);
    expect(vc.panes).toBeUndefined();
    vc.setFont('large');
    vc.setTheme('paper');
    // The brighter red only with Default colours.
    expect(host.el.style.getPropertyValue('--ansi-1')).not.toBe(SPOTLIGHT_RED);
    let heard = 0;
    const off = r.subscribe(() => heard++);
    // The wall rebuilt without achievements: the same host opens the new reel from its card.
    settings.update({ spotlights: { achievements: false } });
    const next = await src.load(settings.get().spotlights, now);
    if ('empty' in next) throw new Error('no reel');
    r.open(next, 0);
    expect(r.reel).toBe(next);
    expect(r.reel.spots.map((x) => x.kind)).toEqual(['death', 'level']);
    expect(r.starts).toHaveLength(2);
    expect(r.marks).toHaveLength(2);
    expect(r.index()).toBe(0);
    expect(host.viewerOverrides).toMatchObject({ font: 'large', theme: 'paper' });
    expect(Object.values(host.viewerOverrides.panes ?? {}).every((on) => on === false)).toBe(true);
    const before = heard;
    host.engine!.pause();
    expect(heard).toBeGreaterThan(before);
    off();
    const after = heard;
    host.engine!.play();
    expect(heard).toBe(after);
    // Default colours again: the brighter red.
    host.viewerControls(true).setTheme('default');
    expect(host.el.style.getPropertyValue('--ansi-1')).toBe(SPOTLIGHT_RED);
    host.dispose();
  });

  it('Esc is the page\'s (the view calls onEsc; nothing closes by itself)', async () => {
    const { host, esc } = await openBare();
    key('Escape');
    expect(esc()).toBe(1);
    expect(host.isClosed).toBe(false);
    host.dispose();
  });
});
