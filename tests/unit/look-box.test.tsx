// @vitest-environment happy-dom
// Stage 42a (ADR 0127): the box in its places, its slots and variants, the
// scenery per size, layout B's plan (`morphPlan`, `morphHold`), the frame
// host's settled state and the sky's calm rate.
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Box,
  BoxBody,
  BoxFoot,
  BoxHead,
  type LookPlace,
  LookPlaceCtx,
  MOTION,
  type MorphEnd,
  type Scenery,
  SceneryCtx,
  lookFrame,
  morphHold,
  morphPlan,
  PROXY_CORNER,
  PROXY_EDGE,
  PROXY_PIECES,
  planLength,
  proxyAt,
  proxyFlight,
  snapRect,
  useBoxSettled,
} from '../../src/chrome/kit/look';
import { FrameStack, type Nav, useNav } from '../../src/chrome/kit/stack';
import { LookHost, MorphCtx, MorphStage, proxyInPieces } from '../../src/chrome/start-morph';
import { setDeviceForTest } from '../../src/core/device';
import { LookWordmark } from '../../src/chrome/start-surface';
import { calmTier } from '../../src/start/sky';
import { SHEEN_FIRST_MS } from '../../src/start/wordmark-svg';

afterEach(() => {
  render(null, document.body);
  vi.unstubAllGlobals();
});

const R = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const PANEL = R(540, 264, 360, 399);
const LARGE = R(27, 27, 1386, 846);
const CAPPED = R(130, 27, 1180, 846);

async function mount(node: VNode, place: LookPlace = 'start', scenery?: (s: Scenery) => void): Promise<void> {
  render(null, document.body);
  await act(async () => {
    render(
      <LookPlaceCtx.Provider value={place}>
        <SceneryCtx.Provider value={scenery ?? null}>
          <FrameStack root={node} active />
        </SceneryCtx.Provider>
      </LookPlaceCtx.Provider>,
      document.body,
    );
    await Promise.resolve();
  });
}

const q = (sel: string) => document.querySelector<HTMLElement>(sel);

describe('Box in its places', () => {
  const Page = () => (
    <Box title="Scripts" size="large" onBack={() => {}} winClass="my-win">
      <BoxHead class="h">head</BoxHead>
      <BoxBody class="b">body</BoxBody>
      <BoxFoot class="f">foot</BoxFoot>
    </Box>
  );

  it('start: the iron box with brackets, the hood, Back and the slots, on the large page', async () => {
    await mount(<Page />);
    const box = q('.wc-lk-large > .wc-lk-box.wc-lk-box-large')!;
    expect(box).not.toBeNull();
    expect(box.getAttribute('aria-label')).toBe('Scripts');
    expect(box.querySelectorAll(':scope > .wc-lk-br')).toHaveLength(4);
    expect(box.querySelector(':scope > .wc-lk-hood .wc-lk-hood-t')?.textContent).toBe('Scripts');
    expect(box.querySelector(':scope > .wc-lk-back')).not.toBeNull();
    const win = box.querySelector(':scope > .wc-lk-win.my-win')!;
    expect([...win.children].map((c) => c.className)).toEqual(['wc-lk-bhead h', 'wc-lk-bbody wc-lk-scroll b', 'wc-lk-bfoot f']);
  });

  it('window: no iron, no hood, no Back; the same content box and slots', async () => {
    await mount(<Page />, 'window');
    const box = q('.wc-lk-box.wc-lk-inwin')!;
    expect(box).not.toBeNull();
    expect(box.querySelector('.wc-lk-br, .wc-lk-hood, .wc-lk-back')).toBeNull();
    expect(q('.wc-lk-large, .wc-lk-sub')).toBeNull();
    expect(box.querySelector(':scope > .wc-lk-win.my-win > .wc-lk-bbody')).not.toBeNull();
  });

  it('menu: a full-screen box with the hood and Back, whatever its size', async () => {
    await mount(
      <Box title="Profile" onBack={() => {}}>
        x
      </Box>,
      'menu',
    );
    const box = q('.wc-lk-menu > .wc-lk-box.wc-lk-box-full')!;
    expect(box).not.toBeNull();
    expect(box.querySelector('.wc-lk-hood-t')?.textContent).toBe('Profile');
    expect(box.querySelector('.wc-lk-back')).not.toBeNull();
  });

  it('BoxBody without scroll has no scroll class; bodyRef reaches the element', async () => {
    let el: HTMLDivElement | null = null;
    await mount(
      <Box size="large" onBack={() => {}}>
        <BoxBody scroll={false} bodyRef={(e) => {
          el = e;
        }}>
          x
        </BoxBody>
      </Box>,
    );
    expect(el).not.toBeNull();
    expect(el!.className).toBe('wc-lk-bbody');
  });
});

describe('Box variants and scenery', () => {
  it('sets the scenery per size: menu main, normal sub, large large', async () => {
    const seen: Scenery[] = [];
    await mount(<Box>menu</Box>, 'start', (s) => seen.push(s));
    await mount(<Box onBack={() => {}}>n</Box>, 'start', (s) => seen.push(s));
    await mount(
      <Box size="large" onBack={() => {}}>
        l
      </Box>,
      'start',
      (s) => seen.push(s),
    );
    expect(seen).toEqual(['main', 'sub', 'large']);
  });

  it('a nested box sets no scenery', async () => {
    const seen: Scenery[] = [];
    await mount(
      <Box size="large" onBack={() => {}}>
        <Box onBack={() => {}}>inner</Box>
      </Box>,
      'start',
      (s) => seen.push(s),
    );
    expect(seen).toEqual(['large']);
  });

  it('maxWidth caps a large box (a custom property), and only a large one', async () => {
    await mount(
      <Box size="large" maxWidth={1180} onBack={() => {}}>
        x
      </Box>,
    );
    const box = q('.wc-lk-box')!;
    expect(box.classList.contains('is-capped')).toBe(true);
    expect(box.style.getPropertyValue('--lk-box-maxw')).toBe('1180px');
    await mount(
      <Box maxWidth={1180} onBack={() => {}}>
        x
      </Box>,
    );
    expect(q('.wc-lk-box')!.classList.contains('is-capped')).toBe(false);
  });

  it('tall: a normal box only, on a tall sub page', async () => {
    await mount(
      <Box tall onBack={() => {}}>
        x
      </Box>,
    );
    expect(q('.wc-lk-sub.is-tall > .wc-lk-box.is-tall')).not.toBeNull();
    await mount(
      <Box tall size="large" onBack={() => {}}>
        x
      </Box>,
    );
    expect(q('.is-tall')).toBeNull();
  });

  it('a new title cross-fades with the old one', async () => {
    let set: (t: string) => void = () => {};
    const { useState } = await import('preact/hooks');
    function T() {
      const [t, s] = useState('History');
      set = s;
      return (
        <Box title={t} size="large" onBack={() => {}}>
          x
        </Box>
      );
    }
    await mount(<T />);
    await act(() => set('Statistics'));
    const ts = [...document.querySelectorAll('.wc-lk-hood-t')].map((e) => [e.textContent, e.className]);
    expect(ts).toEqual([
      ['History', 'wc-lk-hood-t is-out'],
      ['Statistics', 'wc-lk-hood-t is-in'],
    ]);
    await act(async () => new Promise((r) => setTimeout(r, MOTION.swap.title + 30)));
    expect([...document.querySelectorAll('.wc-lk-hood-t')].map((e) => e.textContent)).toEqual(['Statistics']);
  });
});

describe('morphPlan', () => {
  const end = (kind: MorphEnd['kind'], rect = PANEL, more: Partial<MorphEnd> = {}): MorphEnd => ({ kind, rect, ...more });

  it('menu → large opens: items fade, the proxy grows from the panel after 200 ms, the content fades in', () => {
    const p = morphPlan(end('menu', PANEL, { shown: true, hood: 74 }), end('large', LARGE, { hood: 120 }));
    expect(p.type).toBe('open');
    expect(p.out).toBe(200);
    expect(p.sceneryOut).toBe(350);
    expect(p.flight).toMatchObject({ from: PANEL, to: LARGE, show: 200, at: 200, ms: 780 });
    expect(p.flight!.hood).toEqual({ from: 74, to: 120, until: 0.25, mode: 'open' });
    expect(p.land).toBe(980);
    expect(p.in).toBe(320);
    expect(planLength(p)).toBe(1300);
  });

  it('without the hold the proxy stands in the panel for 200 ms, from the start', () => {
    const p = morphPlan(end('menu', PANEL, { shown: false }), end('large', LARGE));
    expect(p.out).toBe(0);
    expect(p.sceneryOut).toBe(0);
    expect(p.flight).toMatchObject({ show: 0, at: 200 });
  });

  it('large → menu closes: the content fades 240 ms, the proxy shrinks 680 ms, items and quote come back', () => {
    const p = morphPlan(end('large', LARGE, { shown: true, hood: 120 }), end('menu', PANEL, { hood: 74 }));
    expect(p.type).toBe('close');
    expect(p.out).toBe(240);
    expect(p.flight).toMatchObject({ from: LARGE, to: PANEL, at: 240, ms: 680 });
    expect(p.flight!.hood).toEqual({ from: 120, to: 74, until: 0.75, mode: 'close' });
    expect(p.land).toBe(920);
    expect(p.in).toBe(260);
    expect(p.sceneryIn).toBe(350);
  });

  it('a reversal mid-flight starts from the proxy at once', () => {
    const mid = R(300, 150, 800, 600);
    const p = morphPlan(end('large', mid, { shown: true, flying: true }), end('menu'));
    expect(p.type).toBe('close');
    expect(p.out).toBe(0);
    expect(p.flight).toMatchObject({ from: mid, show: 0, at: 0 });
  });

  it('normal → large opens from the normal box; large → normal closes to it', () => {
    const normal = R(340, 300, 760, 300);
    expect(morphPlan(end('normal', normal, { shown: true }), end('large', LARGE)).flight?.from).toEqual(normal);
    expect(morphPlan(end('large', LARGE, { shown: true }), end('tall', normal)).type).toBe('close');
  });

  it('large → large swaps: the content cross-fades; a new width morphs in 380 ms', () => {
    const same = morphPlan(end('large', LARGE, { shown: true }), end('large', LARGE));
    expect(same).toMatchObject({ type: 'swap', out: 140, land: 140, in: 220, flight: null });
    const wider = morphPlan(end('large', CAPPED, { shown: true }), end('large', LARGE));
    expect(wider.flight).toMatchObject({ from: CAPPED, to: LARGE, at: 140, ms: 380 });
    expect(wider.land).toBe(520);
  });

  it('normal → normal of another height morphs; the same rect only cross-fades', () => {
    const a = R(340, 300, 760, 229);
    const b = R(340, 300, 760, 365);
    expect(morphPlan(end('normal', a, { shown: true }), end('normal', b)).flight).toMatchObject({ ms: 380 });
    expect(morphPlan(end('normal', a, { shown: true }), end('normal', a)).flight).toBeNull();
  });

  it('menu → normal swaps (stage 74): items and quote fade 140 ms, the proxy flies 380 ms from the panel, the content fades in', () => {
    const normal = R(340, 240, 760, 420);
    for (const kind of ['normal', 'tall'] as const) {
      const p = morphPlan(end('menu', PANEL, { shown: true, hood: 74 }), end(kind, normal, { hood: 150 }));
      expect(p).toMatchObject({ type: 'swap', out: 140, sceneryOut: 140, land: 520, in: 220, sceneryIn: 0, whole: false });
      expect(p.flight).toMatchObject({ from: PANEL, to: normal, show: 140, at: 140, ms: 380 });
      // the hood keeps the menu's plain plate at first, as in `open`
      expect(p.flight!.hood).toEqual({ from: 74, to: 150, until: 0.25, mode: 'open' });
      expect(planLength(p)).toBe(740);
    }
    // without the hold the old frame is gone: the proxy flies at once
    const bare = morphPlan(end('menu', PANEL, { shown: false }), end('normal', normal));
    expect(bare).toMatchObject({ out: 0, sceneryOut: 0, land: 380 });
    expect(bare.flight).toMatchObject({ show: 0, at: 0 });
  });

  it('normal → menu swaps back: the content fades, the proxy flies to the panel, items and quote fade in', () => {
    const normal = R(340, 240, 760, 420);
    for (const kind of ['normal', 'tall'] as const) {
      const p = morphPlan(end(kind, normal, { shown: true, hood: 150 }), end('menu', PANEL, { hood: 74 }));
      expect(p).toMatchObject({ type: 'swap', out: 140, sceneryOut: 0, land: 520, in: 220, sceneryIn: 220, whole: false });
      expect(p.flight).toMatchObject({ from: normal, to: PANEL, show: 140, at: 140, ms: 380 });
      // the hood is the plain plate again before the landing, as in `close`
      expect(p.flight!.hood).toEqual({ from: 150, to: 74, until: 0.75, mode: 'close' });
    }
  });

  it('menu ↔ normal reverses mid-flight from the proxy at once', () => {
    const mid = R(300, 280, 500, 380);
    const back = morphPlan(end('normal', mid, { shown: true, flying: true }), end('menu', PANEL));
    expect(back).toMatchObject({ type: 'swap', out: 0, land: 380, in: 220, sceneryIn: 220 });
    expect(back.flight).toMatchObject({ from: mid, to: PANEL, show: 0, at: 0, ms: 380 });
    const again = morphPlan(end('menu', mid, { shown: true, flying: true }), end('normal', R(340, 240, 760, 420)));
    expect(again).toMatchObject({ type: 'swap', out: 0, sceneryOut: 0, land: 380 });
    expect(again.flight).toMatchObject({ from: mid, show: 0, at: 0 });
  });

  it('menu ↔ normal with reduced motion: the two boxes fade as a whole, nothing flies', () => {
    const normal = R(340, 240, 760, 420);
    const enter = morphPlan(end('menu', PANEL, { shown: true }), end('normal', normal), true);
    expect(enter).toMatchObject({ type: 'fade', whole: true, out: 260, sceneryOut: 260, in: 260, land: 0, flight: null });
    const leave = morphPlan(end('tall', normal, { shown: true }), end('menu', PANEL), true);
    expect(leave).toMatchObject({ type: 'fade', whole: true, out: 240, in: 0, land: 0, flight: null });
  });

  it('anything with an old-look frame, a frame without a box or no old frame does not morph', () => {
    expect(morphPlan(end('grid'), end('large')).type).toBe('none');
    expect(morphPlan(end('large'), end('grid')).type).toBe('none');
    expect(morphPlan(end('none'), end('large')).type).toBe('none');
    expect(morphPlan(null, end('menu')).type).toBe('none');
  });

  it('reduced motion: nothing grows; fades of at most 260 ms', () => {
    const open = morphPlan(end('menu', PANEL, { shown: true }), end('large', LARGE), true);
    expect(open).toMatchObject({ type: 'fade', whole: true, out: 260, in: 260, land: 0, flight: null });
    const close = morphPlan(end('large', LARGE, { shown: true }), end('menu'), true);
    expect(close).toMatchObject({ type: 'fade', whole: true, out: 240, in: 0, flight: null });
    const swap = morphPlan(end('large', CAPPED, { shown: true }), end('large', LARGE), true);
    expect(swap.flight).toBeNull();
    for (const p of [open, close, swap]) expect(Math.max(p.out, p.in)).toBeLessThanOrEqual(260);
  });

  it('morphHold: as long as the longest plan away from the box needs', () => {
    // a push from the menu: the quote fades for 350 ms before a large box (140 before a normal one)
    expect(morphHold('menu', 'push')).toBe(350);
    expect(morphHold('normal', 'push')).toBe(200);
    expect(morphHold('large', 'push')).toBe(240);
    expect(morphHold('large', 'pop')).toBe(240);
    // a pop from a normal or tall box onto a large one is an `open`: its content fades for 200 ms
    expect(morphHold('normal', 'pop')).toBe(200);
    expect(morphHold('tall', 'pop')).toBe(200);
    expect(morphHold('grid', 'push')).toBe(0);
    expect(morphHold('none', 'pop')).toBe(0);
    expect(morphHold('menu', 'push', true)).toBe(260);
  });

  it('morphHold covers the old box until its plan no longer needs it (every pair, both motions)', () => {
    const kinds = ['menu', 'normal', 'tall', 'large'] as const;
    const rect = (k: string) => (k === 'large' ? LARGE : PANEL);
    for (const reduced of [false, true])
      for (const fk of kinds)
        for (const tk of kinds)
          for (const dir of ['push', 'pop'] as const) {
            if (dir === 'pop' && fk === 'menu') continue; // the menu is the root; it is never popped
            const p = morphPlan(end(fk, rect(fk), { shown: true }), end(tk, rect(tk)), reduced);
            // the old box is drawn until its fade ends and, without a fade, until the proxy shows
            const needs = Math.max(p.out, p.flight ? Math.min(p.flight.show, p.flight.at) : 0);
            expect(morphHold(fk, dir, reduced), `${fk} → ${tk} ${dir}${reduced ? ' reduced' : ''}`).toBeGreaterThanOrEqual(needs);
          }
  });
});

describe('the proxy in pieces (stage 74, ADR 0164)', () => {
  /** A piece's `translate(x, y) scale(kx, ky)` as numbers. */
  const parse = (t: string): { x: number; y: number; kx: number; ky: number } => {
    const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\((-?[\d.]+), (-?[\d.]+)\)$/.exec(t);
    if (!m) throw new Error(`not a piece transform: ${t}`);
    return { x: Number(m[1]), y: Number(m[2]), kx: Number(m[3]), ky: Number(m[4]) };
  };

  it('every piece is a translate and a scale; the pane is drawn at the larger size, each end has its own shadows', () => {
    const f = proxyFlight(PANEL, LARGE);
    for (const p of PROXY_PIECES) {
      expect(() => parse(f.from[p])).not.toThrow();
      expect(() => parse(f.to[p])).not.toThrow();
    }
    expect(f.fromSize).toEqual({ width: 360, height: 399 });
    expect(f.toSize).toEqual({ width: 1386, height: 846 });
    expect(f.maxSize).toEqual({ width: 1386, height: 846 });
    // The pane: the large box itself at the landing, shrunk to the panel at the start.
    expect(parse(f.to.pane)).toEqual({ x: 27, y: 27, kx: 1, ky: 1 });
    expect(parse(f.from.pane).x).toBe(540);
    expect(parse(f.from.pane).kx).toBeCloseTo(360 / 1386, 3);
    expect(parse(f.from.pane).ky).toBeCloseTo(399 / 846, 3);
    // The shadows: at the start the start's are the box's own, at the landing the landing's are.
    expect(parse(f.from.shadowFrom)).toEqual({ x: 540, y: 264, kx: 1, ky: 1 });
    expect(parse(f.to.shadowTo)).toEqual({ x: 27, y: 27, kx: 1, ky: 1 });
    expect(parse(f.to.shadowFrom).ky).toBeCloseTo(846 / 399, 3);
    // The landing's shadows fade in as the start's fade out; nothing else fades.
    expect(f.fade).toEqual({ shadowFrom: [1, 0], shadowTo: [0, 1] });
    // The other way round the pane is still drawn at the larger size and never scaled up.
    const back = proxyFlight(LARGE, PANEL);
    expect(back.maxSize).toEqual(f.maxSize);
    expect(parse(back.from.pane)).toEqual({ x: 27, y: 27, kx: 1, ky: 1 });
    expect(parse(back.to.pane).kx).toBeLessThan(1);
  });

  it('the pieces stand on the rectangle: edges along it, corners in it, the hood at its top centre', () => {
    const r = R(100, 50, 600, 400);
    const size = { width: 1200, height: 800 };
    const t = proxyAt(r, size, size);
    expect(parse(t.top)).toEqual({ x: 100, y: 50, kx: 0.5, ky: 1 });
    expect(parse(t.bottom)).toEqual({ x: 100, y: 50 + 400 - PROXY_EDGE, kx: 0.5, ky: 1 });
    // The side edges run between the top and the bottom one: 380 of the drawn 780 px.
    expect(parse(t.left)).toEqual({ x: 100, y: 50 + PROXY_EDGE, kx: 1, ky: Math.round((380 / 780) * 10000) / 10000 });
    expect(parse(t.right).x).toBe(100 + 600 - PROXY_EDGE);
    expect(parse(t.tl)).toEqual({ x: 100, y: 50, kx: 1, ky: 1 });
    expect(parse(t.tr)).toEqual({ x: 100 + 600 - PROXY_CORNER, y: 50, kx: 1, ky: 1 });
    expect(parse(t.bl)).toEqual({ x: 100, y: 50 + 400 - PROXY_CORNER, kx: 1, ky: 1 });
    expect(parse(t.br)).toEqual({ x: 100 + 600 - PROXY_CORNER, y: 50 + 400 - PROXY_CORNER, kx: 1, ky: 1 });
    expect(parse(t.hood)).toEqual({ x: 400, y: 50, kx: 1, ky: 1 });
  });

  it('the edges keep their thickness and only shrink along their length (drawn at the larger size)', () => {
    for (const [a, b] of [
      [PANEL, LARGE],
      [LARGE, PANEL],
      [R(200, 100, 760, 300), R(200, 100, 500, 620)], // one wider, the other taller
    ] as const) {
      const f = proxyFlight(a, b);
      for (const end of [f.from, f.to]) {
        expect(parse(end.top).ky).toBe(1);
        expect(parse(end.bottom).ky).toBe(1);
        expect(parse(end.left).kx).toBe(1);
        expect(parse(end.right).kx).toBe(1);
        for (const p of ['top', 'bottom', 'left', 'right'] as const) {
          expect(parse(end[p]).kx).toBeLessThanOrEqual(1);
          expect(parse(end[p]).ky).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('in pieces on a phone or a tablet, one laid-out box on a desktop; ?morph= forces either', () => {
    setDeviceForTest({ touch: false, phone: false });
    expect(proxyInPieces()).toBe(false);
    setDeviceForTest({ touch: true, phone: false }); // a touch laptop: the desktop's layout
    expect(proxyInPieces()).toBe(false);
    setDeviceForTest({ touch: true, phone: true });
    expect(proxyInPieces()).toBe(true);
    setDeviceForTest({ touch: true, phone: true, tablet: true });
    expect(proxyInPieces()).toBe(true);
    vi.stubGlobal('location', { search: '?morph=layout' });
    expect(proxyInPieces()).toBe(false);
    setDeviceForTest({ touch: false, phone: false });
    vi.stubGlobal('location', { search: '?morph=pieces' });
    expect(proxyInPieces()).toBe(true);
  });

  it('a degenerate rectangle gives finite transforms', () => {
    const f = proxyFlight(R(10, 10, 0, 0), R(10, 10, 0, 0));
    for (const p of PROXY_PIECES) expect(f.from[p]).not.toMatch(/NaN|Infinity/);
  });

  it('snapRect puts the edges on whole device pixels', () => {
    expect(snapRect(R(463.5, 27.25, 992.6, 845.5))).toEqual(R(464, 27, 992, 846));
    const s = snapRect(R(6.1, 6.2, 347.9, 787.7), 3);
    expect(s.left * 3).toBeCloseTo(18, 6);
    expect((s.left + s.width) * 3).toBeCloseTo(1062, 6);
    expect(s.top * 3).toBeCloseTo(19, 6);
    expect(snapRect(LARGE, 2)).toEqual(LARGE);
  });
});

describe('the frame host: settled', () => {
  function stageHost() {
    const root = document.createElement('div');
    const proxy = document.createElement('div');
    proxy.hidden = true;
    document.body.append(root, proxy);
    const calm: boolean[] = [];
    const stage = new MorphStage({ root: () => root, proxy: () => proxy, onCalm: (c) => calm.push(c) });
    return { stage, root, proxy, calm };
  }

  const states: { title: string; settled: boolean }[] = [];
  let nav: Nav | null = null;
  const Menu = lookFrame(function Menu() {
    nav = useNav();
    states.push({ title: 'menu', settled: useBoxSettled() });
    return <Box>menu</Box>;
  });
  const Large = lookFrame(function Large() {
    states.push({ title: 'large', settled: useBoxSettled() });
    return (
      <Box title="Large" size="large" onBack={() => {}}>
        large
      </Box>
    );
  });

  async function run(reduce: boolean) {
    vi.stubGlobal('matchMedia', (media: string) => ({
      matches: reduce && media.includes('reduce'),
      media,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    states.length = 0;
    const { stage, root } = stageHost();
    const host = document.createElement('div');
    document.body.append(host);
    await act(async () => {
      render(
        <MorphCtx.Provider value={stage}>
          <FrameStack root={<Menu />} active wrap={(n) => <LookHost>{n}</LookHost>} />
        </MorphCtx.Provider>,
        host,
      );
      await Promise.resolve();
    });
    await act(async () => nav!.push(<Large />));
    return { stage, root, host };
  }

  it('is false from the mount until the content has faded in, then true', async () => {
    const { stage, root, host } = await run(false);
    expect(stage.last?.type).toBe('open');
    expect(root.dataset['lkBox']).toBe('large');
    expect(root.dataset['lkMorph']).toBe('open');
    expect(states.filter((s) => s.title === 'large').at(-1)?.settled).toBe(false);
    // The new box is hidden until the proxy lands.
    const box = host.querySelector<HTMLElement>('.wc-lk-box-large')!;
    expect(box.getAnimations().length).toBeGreaterThan(0);
    await act(async () => new Promise((r) => setTimeout(r, stage.last!.land + stage.last!.in + 60)));
    expect(states.filter((s) => s.title === 'large').at(-1)?.settled).toBe(true);
    render(null, host);
  });

  it('is true at once with reduced motion (a fade)', async () => {
    const { stage, host } = await run(true);
    expect(stage.last?.type).toBe('fade');
    expect(states.filter((s) => s.title === 'large').every((s) => s.settled)).toBe(true);
    render(null, host);
  });

  it('is true outside the start surface (windows, the ESC menu)', async () => {
    let settled: boolean | null = null;
    function P() {
      settled = useBoxSettled();
      return <Box onBack={() => {}}>x</Box>;
    }
    await mount(<P />, 'window');
    expect(settled).toBe(true);
  });
});

describe('the sky at the calm rate', () => {
  it('caps every layer at ~30 Hz, rain and snow included, and never speeds one up', () => {
    expect(calmTier({ starMs: 32, cloudMs: 32, precipMs: 0 })).toEqual({ starMs: 32, cloudMs: 32, precipMs: 32 });
    expect(calmTier({ starMs: 64, cloudMs: 64, precipMs: 32 })).toEqual({ starMs: 64, cloudMs: 64, precipMs: 32 });
  });
});

describe('LookWordmark', () => {
  it('passes no sheen in page content unless asked (stage 42 wave 3)', () => {
    vi.useFakeTimers();
    const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel() {}, playState: 'running' }));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const proto = Element.prototype as unknown as { animate?: unknown };
    const had = proto.animate;
    proto.animate = animate;
    try {
      const plain = document.createElement('div');
      const lit = document.createElement('div');
      document.body.append(plain, lit);
      act(() => render(<LookWordmark size="small" />, plain));
      act(() => render(<LookWordmark size="small" sheen />, lit));
      act(() => void vi.advanceTimersByTime(SHEEN_FIRST_MS + 100));
      const bands = animate.mock.contexts as Element[];
      expect(bands.some((b) => plain.contains(b))).toBe(false);
      expect(bands.some((b) => lit.contains(b))).toBe(true);
      render(null, plain);
      render(null, lit);
    } finally {
      proto.animate = had;
      vi.useRealTimers();
    }
  });
});
