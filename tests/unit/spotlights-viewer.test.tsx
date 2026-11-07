// @vitest-environment happy-dom
// Stage 46 WP 46-B (ADR 0131): the Spotlights viewer. The bare reel
// (spotlight-mode.ts `openSpotlightReel(…, { bare: true })`): start at a
// card, ← → rules after the page's keys, Esc, the end, a new reel on the
// same host, the brighter red. The viewer (spotlights-viewer.tsx) in a
// frame stack over an embedded host: the head, the controls driving the
// engine, Display only (no Panes) with its keys and its Esc before the
// view's, the end card and Play again, leaving with the current spotlight,
// and the host kept while the page's frame stays, disposed when it goes.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { PlayerHost } from '../../src/app/player-host';
import { ServicesCtx, type ChromeServices } from '../../src/chrome/kit/hooks';
import { FrameStack, type Nav, useNav } from '../../src/chrome/kit/stack';
import { lookFrame } from '../../src/chrome/kit/look';
import {
  SpotlightsViewer,
  cardInset,
  groupMarks,
  keptSpotlightsHost,
  longDate,
} from '../../src/chrome/frames/spotlights-viewer';
import { type BareReel, SPOTLIGHT_RED, openSpotlightReel } from '../../src/player/spotlight-mode';
import type { Reel } from '../../src/player/spotlight-reel';
import type { RunEvent } from '../../src/runs/events';
import { ProfileStore } from '../../src/profiles';
import { SettingsStore } from '../../src/settings';
import { type SpotlightRun, selectSpotlights } from '../../src/share/spotlights';
import { CellMetrics } from '../../src/theme/cells';
import type { ChainRun } from '../../src/player/timeline';
import type { RunLibrary } from '../../src/runs/library';
import { BASE_US, FakeWall, makeLog, meta } from './player-helpers';

const S = 1e6;
const frame = () => new Promise((r) => setTimeout(r, 40));
const key = (k: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

afterEach(() => render(null, document.body));

/** Two characters, three moments: Rasta's level-up and death, Bob's achievement (as spotlight-mode.test.ts). */
function reelOf(filter: (s: { kind: string }) => boolean = () => true): Reel {
  const r1 = BASE_US;
  const r2 = BASE_US + 3600 * S;
  const lines = (base: number, at: number[]) => makeLog(base, at.flatMap((t) => [{ at: t - 2, in: `Before ${t}.` }, { at: t, in: `\x1b[31mMoment ${t}.\x1b[0m` }]));
  const rasta: RunEvent[] = [
    { type: 'run_start', us: r1, character: 'Rasta', level: 41, schema: 1 },
    { type: 'level_up', us: r1 + 20 * S, level: 42 },
    { type: 'char_death', us: r1 + 60 * S, logUs: r1 + 60 * S },
  ];
  const bob: RunEvent[] = [
    { type: 'run_start', us: r2, character: 'Bob', schema: 1 },
    { type: 'achievement', us: r2 + 30 * S, name: 'Slayer of Rats' },
  ];
  const runs: SpotlightRun[] = [
    { meta: meta('Rasta/1', r1, { bytes: 100 }), events: rasta },
    { meta: meta('Bob/1', r2, { bytes: 100 }), events: bob },
  ];
  const logs = new Map([
    ['Rasta/1', lines(r1, [20, 60])],
    ['Bob/1', lines(r2, [30])],
  ]);
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  const spots = selectSpotlights(runs, settings.get().spotlights, BASE_US + 86_400 * S).filter(filter);
  const chain: ChainRun[] = spots.map((s) => ({ meta: runs.find((r) => r.meta.runId === s.runId)!.meta, text: logs.get(s.runId)! }));
  return { spots, chain };
}

function newHost(root: HTMLElement, wall: FakeWall): PlayerHost {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  const host = new PlayerHost({ root, settings, wall, onClose: () => {} });
  Object.defineProperty(host.el, 'clientWidth', { configurable: true, value: 1000 });
  return host;
}

// ------------------------------------------------------------ the bare reel

describe('the bare reel (spotlight-mode)', () => {
  function openBare(o: { start?: number; keys?: (e: KeyboardEvent) => boolean } = {}) {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const wall = new FakeWall();
    const host = newHost(root, wall);
    const log: string[] = [];
    const reel = reelOf();
    const r: BareReel = openSpotlightReel(host, reel, {
      bare: true,
      ...(o.start !== undefined ? { start: o.start } : {}),
      ...(o.keys ? { keys: o.keys } : {}),
      onEsc: () => log.push('esc'),
      onEnd: () => log.push('end'),
    });
    return { root, wall, host, r, log, reel };
  }

  it('plays bare from spotlight `start`: no card, header, rail or box; times in h:mm:ss', async () => {
    const { root, host, r, wall } = openBare({ start: 1 });
    wall.advance(100);
    await frame();
    expect(root.querySelector('.wc-spot-card')).toBeNull();
    expect(root.querySelector('.wc-player-chrome')!.hasAttribute('data-bare')).toBe(true);
    expect(root.querySelector('.wc-player-header, .wc-player-rail, .wc-player-box')).toBeNull();
    expect(r.reel.spots.length).toBe(3);
    expect(r.starts.length).toBe(3);
    expect(r.marks.length).toBe(3);
    expect(r.moments.length).toBe(3);
    expect(r.index()).toBe(1);
    expect(host.engine!.playing).toBe(true);
    expect(r.speeds[0]).toBe(0.25);
    expect(r.duration).toBe(host.engine!.duration);
    // The countdown: 1 at the spotlight's start, 0 from the moment on.
    expect(r.countdown()).toBeGreaterThan(0.9);
    host.engine!.seek(r.moments[1]! + 10);
    expect(r.countdown()).toBe(0);
    host.dispose();
  });

  it('← → after the page keys: next, restart after 1.5 s, previous; nothing past the last', async () => {
    const seen: string[] = [];
    const { host, r, wall } = openBare({ keys: (e) => (e.key === 'd' ? (seen.push('d'), true) : false) });
    key('ArrowRight');
    expect(r.index()).toBe(1);
    wall.advance(2000);
    key('ArrowLeft');
    expect(r.index()).toBe(1);
    expect(host.engine!.position).toBeLessThan(r.starts[1]! + 1500);
    key('ArrowLeft');
    expect(r.index()).toBe(0);
    key('d');
    expect(seen).toEqual(['d']);
    // Shift+→ is the view's +10 s, not a spotlight.
    const before = host.engine!.position;
    key('ArrowRight', { shiftKey: true });
    expect(host.engine!.position).toBeGreaterThan(before + 9000);
    r.goTo(2);
    key('ArrowRight');
    expect(r.index()).toBe(2);
    host.dispose();
  });

  it('Esc is the page’s; the end calls onEnd once, and ← from the end plays again', async () => {
    const { host, r, log, wall } = openBare();
    key('Escape');
    expect(log).toEqual(['esc']);
    host.engine!.seek(host.engine!.duration - 50);
    wall.advance(2000);
    expect(host.engine!.atEnd).toBe(true);
    expect(log.filter((x) => x === 'end').length).toBe(1);
    r.go(-1);
    expect(host.engine!.playing).toBe(true);
    expect(host.engine!.atEnd).toBe(false);
    host.dispose();
  });

  it('draws ANSI red brighter with Default colours only; opens a new reel on the same host', async () => {
    const { host, r, wall } = openBare();
    wall.advance(100);
    await frame();
    expect(host.el.style.getPropertyValue('--ansi-1')).toBe(SPOTLIGHT_RED);
    host.viewerControls(true).setTheme('dark');
    expect(host.el.style.getPropertyValue('--ansi-1')).not.toBe(SPOTLIGHT_RED);
    host.viewerControls(true).setTheme('default');
    // Display only: no Panes.
    expect(host.viewerControls(true).panes).toBeUndefined();
    const small = reelOf((s) => s.kind !== 'achievement');
    r.open(small, 1);
    expect(r.reel).toBe(small);
    expect(r.starts.length).toBe(2);
    expect(r.index()).toBe(1);
    expect(host.engine!.playing).toBe(true);
    host.dispose();
  });
});

// ------------------------------------------------------------ pure helpers

describe('viewer helpers', () => {
  it('longDate: weekday, day, month, year in English', () => {
    expect(longDate(new Date(2026, 8, 26, 21, 0).getTime() * 1000)).toBe('Saturday 26 September 2026');
  });

  it('cardInset: the card inside the box as an inset, clamped; a fallback without a card', () => {
    const box = new DOMRect(100, 50, 1000, 600);
    expect(cardInset(new DOMRect(150, 100, 200, 120), box)).toBe('inset(50px 750px 430px 50px round 6px)');
    expect(cardInset(new DOMRect(80, 30, 200, 120), box)).toBe('inset(0px 820px 500px 0px round 6px)');
    expect(cardInset(null, box)).toBe('inset(30% 30% 30% 30% round 6px)');
  });

  it('groupMarks: near markers share one (the first offset, every tip)', () => {
    const m = (offset: number, tip: string) => ({ letter: 'D' as const, offset, tip });
    const g = groupMarks([m(0, 'a'), m(5000, 'c'), m(100, 'b')], 10_000, 1000);
    expect(g.map((x) => x.offset)).toEqual([0, 5000]);
    expect(g[0]!.marks.map((x) => x.tip)).toEqual(['a', 'b']);
    expect(groupMarks([m(0, 'a')], 0, 1000)).toEqual([]);
  });
});

// ------------------------------------------------------------ the viewer

describe('SpotlightsViewer', () => {
  function services(wall: FakeWall, made: PlayerHost[]): ChromeServices {
    const settings = new SettingsStore({ factory: null, storage: null, win: null });
    void settings.load();
    const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
    void cells.update(settings.get().appearance);
    return {
      settings,
      cells,
      profiles: new ProfileStore({ factory: null }),
      version: '9.9.9',
      runs: async () => ({}) as unknown as RunLibrary,
      embedPlayer: async (slot: HTMLElement) => {
        if (made.some((h) => !h.isClosed)) return null;
        const h = newHost(slot, wall);
        made.push(h);
        return h;
      },
    };
  }

  async function mount(start = 0) {
    const wall = new FakeWall();
    const made: PlayerHost[] = [];
    const left: number[] = [];
    const ref: { nav: Nav | null; show: (on: boolean) => void } = { nav: null, show: () => {} };
    const reel = reelOf();
    const Root = lookFrame(function Root() {
      ref.nav = useNav();
      return <div class="root" />;
    });
    const Page = lookFrame(function Page() {
      const [on, setOn] = useState(true);
      ref.show = setOn;
      return (
        <div class="page" style={{ position: 'relative' }}>
          {on && (
            <SpotlightsViewer
              reel={reel}
              start={start}
              cardRect={() => null}
              onLeave={(i) => {
                left.push(i);
                setOn(false);
              }}
            />
          )}
        </div>
      );
    });
    await act(async () => {
      render(
        <ServicesCtx.Provider value={services(wall, made)}>
          <FrameStack root={<Root />} active />
        </ServicesCtx.Provider>,
        document.body,
      );
    });
    await act(async () => ref.nav!.push(<Page />));
    // The embed and the reel module load asynchronously.
    for (let n = 0; n < 50 && !document.querySelector('.wc-spv-slot .wc-player'); n++) await act(async () => void (await frame()));
    await act(async () => {
      wall.advance(100);
      await frame();
    });
    const host = () => made[made.length - 1]!;
    const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const tick = (ms = 0) =>
      act(async () => {
        wall.advance(ms);
        await frame();
      });
    return { wall, made, left, reel, host, q, tick, nav: () => ref.nav!, show: (on: boolean) => act(async () => ref.show(on)) };
  }

  it('shows the head, plays in an embedded bare host, and the controls drive it', async () => {
    const v = await mount();
    expect(v.made.length).toBe(1);
    expect(v.q('.wc-spv-slot .wc-player-chrome')!.hasAttribute('data-bare')).toBe(true);
    expect(v.q('.wc-spv-kind')!.textContent).toBe('Achievement');
    expect(v.q('.wc-spv-kind')!.getAttribute('data-kind')).toBe('achievement');
    expect(v.q('.wc-spv-label')!.textContent).toBe('Achievement: Slayer of Rats');
    expect(v.q('.wc-spv-meta')!.textContent).toMatch(/^Bob · \w+day \d+ \w+ \d{4}$/);
    expect(v.q('.wc-spv-count')!.textContent).toBe('1 / 3');
    expect(v.q('.wc-spv-nav [data-btn="prev"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(v.q('.wc-spv-nav [data-btn="next"]')!.getAttribute('aria-disabled')).toBeNull();
    expect(v.q('.wc-spv-nav [data-btn="next"]')!.getAttribute('title')).toBe('Next spotlight (→)');
    expect(v.q('.wc-spv-clock')!.textContent).toMatch(/^00:00 \/ \d\d:\d\d$/);
    // › next spotlight.
    await act(async () => v.q<HTMLElement>('.wc-spv-nav [data-btn="next"]')!.click());
    await v.tick();
    expect(v.q('.wc-spv-count')!.textContent).toBe('2 / 3');
    // Play / pause, speed.
    expect(v.host().engine!.playing).toBe(true);
    await act(async () => v.q<HTMLElement>('.wc-spv-ctl [data-act="play"]')!.click());
    await v.tick();
    expect(v.host().engine!.playing).toBe(false);
    expect(v.q('.wc-spv-ctl [data-act="play"]')!.getAttribute('aria-label')).toBe('Play');
    await act(async () => v.q<HTMLElement>('.wc-spv-ctl [data-act="faster"]')!.click());
    await v.tick();
    expect(v.host().engine!.speed).toBe(2);
    expect(v.q('.wc-spv-spd-v')!.textContent).toBe('2×');
    await act(async () => v.q<HTMLElement>('.wc-spv-ctl [data-act="start"]')!.click());
    await v.tick();
    expect(v.q('.wc-spv-count')!.textContent).toBe('1 / 3');
    // The track: a marker per spotlight, ticks between them.
    expect(document.querySelectorAll('.wc-spv-trk-ticks i').length).toBe(2);
    expect(document.querySelectorAll('.wc-spv-mk').length).toBeGreaterThan(0);
  });

  it('Display: D opens it (font and colours, no Panes), ↓ → change the colours, Esc closes it before leaving', async () => {
    const v = await mount();
    key('d');
    await v.tick();
    expect(v.q('.wc-spv .wc-lk-pop')).not.toBeNull();
    expect(v.q('.wc-spv-dp [role="radiogroup"][aria-label="Font size"]')).not.toBeNull();
    expect(document.querySelectorAll('.wc-spv-sw').length).toBe(6);
    expect(v.q('.wc-spv-dp')!.textContent).not.toContain('Panes');
    key('ArrowDown');
    key('ArrowRight');
    await v.tick();
    expect(v.host().viewerOverrides.theme).toBe('dark');
    expect(v.q('.wc-spv-sw[data-theme="dark"]')!.getAttribute('aria-checked')).toBe('true');
    key('ArrowUp');
    key('ArrowRight');
    await v.tick();
    expect(v.host().viewerOverrides.font).toBe('small');
    // ← → went to Display, not to the spotlights.
    expect(v.q('.wc-spv-count')!.textContent).toBe('1 / 3');
    key('Escape');
    await v.tick();
    expect(v.q('.wc-spv .wc-lk-pop')).toBeNull();
    expect(v.left).toEqual([]);
    key('Escape');
    for (let n = 0; n < 20 && v.left.length === 0; n++) await v.tick(50);
    expect(v.left).toEqual([0]);
  });

  it('the end card: End of the reel, n of n, P plays again; Back to the wall leaves', async () => {
    const v = await mount();
    const eng = v.host().engine!;
    eng.seek(eng.duration - 50);
    await v.tick(2000);
    expect(eng.atEnd).toBe(true);
    expect(v.q('.wc-spv-end')!.textContent).toContain('End of the reel');
    expect(v.q('.wc-spv-end-n')!.textContent).toBe('3 of 3');
    key('p');
    await v.tick();
    expect(eng.playing).toBe(true);
    expect(v.q('.wc-spv-end')).toBeNull();
    expect(v.q('.wc-spv-count')!.textContent).toBe('1 / 3');
    eng.seek(eng.duration - 50);
    await v.tick(2000);
    await act(async () => v.q<HTMLElement>('.wc-spv-end [data-btn="wall"]')!.click());
    for (let n = 0; n < 20 && v.left.length === 0; n++) await v.tick(50);
    expect(v.left).toEqual([2]);
  });

  it('keeps the host parked while the page stays, reuses it, and disposes it when the page goes', async () => {
    const v = await mount(1);
    expect(v.q('.wc-spv-count')!.textContent).toBe('2 / 3');
    const h = v.host();
    key('Escape');
    for (let n = 0; n < 20 && v.left.length === 0; n++) await v.tick(50);
    expect(v.left).toEqual([1]);
    expect(v.q('.wc-spv')).toBeNull();
    expect(keptSpotlightsHost()).toBe(h);
    expect(h.isClosed).toBe(false);
    expect(h.engine!.playing).toBe(false);
    expect(h.el.isConnected).toBe(false);
    // Keys pass while parked.
    const pos = h.engine!.position;
    key(' ');
    expect(h.engine!.playing).toBe(false);
    expect(h.engine!.position).toBe(pos);
    // A second card: the same host, back in the well.
    await v.show(true);
    for (let n = 0; n < 10 && !h.el.isConnected; n++) await v.tick();
    expect(v.made.length).toBe(1);
    expect(h.el.isConnected).toBe(true);
    expect(h.engine!.playing).toBe(true);
    await v.show(false);
    expect(keptSpotlightsHost()).toBe(h);
    // The page leaves the stack: the host goes.
    await act(async () => v.nav().pop());
    await v.tick();
    expect(h.isClosed).toBe(true);
    expect(keptSpotlightsHost()).toBeNull();
  });
});
