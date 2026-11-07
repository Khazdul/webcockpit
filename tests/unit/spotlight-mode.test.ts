// @vitest-environment happy-dom
// Stage 46 (ADR 0131): the bare reel the Spotlights page's viewer plays
// (`openSpotlightReel(…, { bare: true })`): the start card, ← → on the
// first and the last, a paused `goTo`, `autoplay`, the end heard once per
// stop, every pane off with Display kept, and `open` of a rebuilt wall's
// reel on the same host with its subscribers kept. The viewer's own tests
// (the head, the controls, the end card, the kept host):
// spotlights-viewer.test.tsx; the wall's rebuild: spotlights-wall.test.tsx.
//
// Stage 30e (ADR 0110) and 32c (ADR 0114): the full-page reel with its
// card (info, ‹ ›, countdown, the filter that replaced the gear popup), its
// keys, Display without Panes, the live rebuild on a settings change
// (current spotlight kept, paused stays paused, the latest change wins)
// and the empty stage. The Spotlights page no longer uses it; it stays for
// the shell's `openSpotlights` until wave 3 removes both (and these tests).
import { describe, expect, it } from 'vitest';
import { PlayerHost } from '../../src/app/player-host';
import { type BareReel, type ReelHandle, REEL_NO_MATCH, SPOTLIGHT_RED, openSpotlightReel } from '../../src/player/spotlight-mode';
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

async function openReel(withFilter = true) {
  const root = document.createElement('div');
  root.style.cssText = 'width:1200px;height:800px';
  document.body.appendChild(root);
  const wall = new FakeWall();
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  let closed = 0;
  const host = new PlayerHost({ root, settings, wall, onClose: () => closed++, hideMs: 100 });
  // happy-dom has no layout: a player wide enough for the card.
  Object.defineProperty(host.el, 'clientWidth', { configurable: true, value: 1200 });
  const src = loader();
  const now = () => BASE_US + 86_400 * S;
  const first = await src.load(settings.get().spotlights, now());
  if ('empty' in first) throw new Error('no reel');
  const characters = async () => ['Bob', 'Rasta'];
  const reel: ReelHandle = openSpotlightReel(host, first, withFilter ? { source: src, settings, characters, now } : {});
  return { root, wall, settings, host, src, reel, closed: () => closed };
}

const key = (k: string, target: EventTarget = window, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
const header = (root: HTMLElement) => root.querySelector('.wc-player-head-left')?.textContent ?? '';
const card = (root: HTMLElement) => root.querySelector<HTMLElement>('.wc-spot-card')!;
const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => card(root).querySelector<T>(sel);

describe('Spotlights reel: the card (ADR 0114; the shell\'s full-page reel until wave 3)', () => {
  it('shows the spotlight: count, arrows disabled at the ends, kind icon and name, label, character and date', async () => {
    const { root, host, reel } = await openReel();
    await frame();
    expect(reel.card).toBe(card(root));
    expect(card(root).parentElement).toBe(host.el);
    expect(card(root).hasAttribute('data-wc-own-keys')).toBe(true);
    expect(q(root, '.wc-sc-count')!.textContent).toBe('Spotlight 1 / 3');
    expect(q<HTMLButtonElement>(root, '[data-nav="prev"]')!.disabled).toBe(true);
    expect(q<HTMLButtonElement>(root, '[data-nav="next"]')!.disabled).toBe(false);
    expect(q(root, '.wc-sc-kind')!.textContent).toBe('Achievement');
    expect(q(root, '.wc-sc-kind svg')!.dataset.kind).toBe('achievement');
    expect(q(root, '.wc-sc-label')!.textContent).toBe('Achievement: Slayer of Rats');
    expect(q(root, '.wc-sc-meta')!.textContent).toMatch(/^Bob · \d{4}-\d\d-\d\d$/);
    // The countdown runs toward the moment.
    expect(q(root, '.wc-sc-cd i')!.hidden).toBe(false);
    // › goes to the next one; the last one has no next.
    q(root, '[data-nav="next"]')!.click();
    q(root, '[data-nav="next"]')!.click();
    await frame();
    expect(header(root)).toContain('SPOTLIGHT 3 / 3');
    expect(q(root, '.wc-sc-count')!.textContent).toBe('Spotlight 3 / 3');
    expect(q<HTMLButtonElement>(root, '[data-nav="next"]')!.disabled).toBe(true);
    expect(q(root, '.wc-sc-kind svg')!.dataset.kind).toBe('level');
    // The rail's markers carry the kind icons.
    const kinds = [...root.querySelectorAll<HTMLElement>('.wc-player-mark svg')].map((x) => x.dataset.kind);
    expect(new Set(kinds)).toEqual(new Set(['achievement', 'death', 'level']));
    host.dispose();
    expect(card(root)).toBeNull();
  });

  it('has no filter without the settings; the filter folds otherwise', async () => {
    const a = await openReel(false);
    expect(q(a.root, '.wc-sc-filter')).toBeNull();
    a.host.dispose();
    const { root, host, settings } = await openReel();
    await frame();
    expect([...card(root).querySelectorAll('.wc-sc-fold')].map((f) => f.textContent)).toEqual(['KindsAll', 'CharactersAll']);
    expect(q(root, '[data-kind="deaths"]')).toBeNull();
    // Kinds fold out: a switch per kind with its icon.
    q(root, '[data-fold="kinds"]')!.click();
    expect(q(root, '[data-fold="kinds"]')!.getAttribute('aria-expanded')).toBe('true');
    const rows = [...card(root).querySelectorAll<HTMLElement>('.wc-sc-row[data-kind]')];
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Achievements', 'Deaths', 'Level-ups', 'PvP kills']);
    expect(rows.map((r) => r.querySelector('svg')!.dataset.kind)).toEqual(['achievement', 'death', 'level', 'pkill']);
    q(root, '[data-kind="deaths"]')!.click();
    expect(settings.get().spotlights.deaths).toBe(false);
    expect(q(root, '[data-kind="deaths"]')!.getAttribute('aria-checked')).toBe('false');
    expect(q(root, '[data-fold="kinds"] .wc-sc-sum')!.textContent).toBe('3 of 4');
    // Characters fold out: All on disables the checks; All off checks every name; a check writes the subset.
    q(root, '[data-fold="chars"]')!.click();
    const checks = () => [...card(root).querySelectorAll<HTMLButtonElement>('.wc-sc-cb')];
    expect(checks().map((c) => c.textContent)).toEqual(['Bob', 'Rasta']);
    expect(checks().every((c) => c.disabled)).toBe(true);
    q(root, '[aria-label="All characters"]')!.click();
    expect(settings.get().spotlights).toMatchObject({ allCharacters: false, characters: ['Bob', 'Rasta'] });
    expect(checks().every((c) => !c.disabled && c.getAttribute('aria-checked') === 'true')).toBe(true);
    checks()[0]!.click();
    expect(settings.get().spotlights.characters).toEqual(['Rasta']);
    expect(q(root, '[data-fold="chars"] .wc-sc-sum')!.textContent).toBe('Rasta');
    // Period: a list.
    const sel = q<HTMLSelectElement>(root, '.wc-sc-sel')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week']);
    sel.value = 'month';
    sel.dispatchEvent(new Event('change'));
    expect(settings.get().spotlights.period).toBe('month');
    // Folding in keeps the settings.
    q(root, '[data-fold="kinds"]')!.click();
    expect(q(root, '[data-kind="deaths"]')).toBeNull();
    host.dispose();
  });

  it('keys in the card are its own; ← → step spotlights, Shift+← → 10 s, Esc closes', async () => {
    const { root, host, closed } = await openReel();
    await frame();
    const speed = host.engine!.speed;
    key('3', q(root, '[data-nav="next"]')!);
    expect(host.engine!.speed).toBe(speed);
    key('ArrowRight', q(root, '[data-nav="next"]')!);
    expect(header(root)).toContain('SPOTLIGHT 1 / 3');
    key('ArrowRight');
    host.playerView!.refresh();
    await frame();
    expect(header(root)).toContain('SPOTLIGHT 2 / 3');
    host.engine!.pause();
    const p = host.engine!.position;
    key('ArrowRight', window, true);
    expect(host.engine!.position).toBeCloseTo(Math.min(host.engine!.duration, p + 10_000), -1);
    key('ArrowLeft', window, true);
    expect(host.engine!.position).toBeCloseTo(p, -1);
    // Home: to the start.
    key('Home');
    expect(host.engine!.position).toBe(0);
    expect(root.querySelector('[data-act="back"]')!.getAttribute('title')).toBe('Back 10 s (Shift+←)');
    key('Escape');
    expect(closed()).toBe(1);
  });

  it('has Display but no Panes; Display survives a rebuild', async () => {
    const { root, host, settings } = await openReel();
    await frame();
    expect(root.querySelector('[data-act="panes"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-act="display"]')!.click();
    root.querySelector<HTMLElement>('[data-font="large"]')!.click();
    root.querySelector<HTMLElement>('[data-theme="paper"]')!.click();
    expect(host.viewerOverrides).toMatchObject({ font: 'large', theme: 'paper' });
    // The chrome does not auto-hide while the popup is open (hideMs 100).
    await new Promise((r) => setTimeout(r, 250));
    expect(host.playerView!.chromeShown).toBe(true);
    settings.update({ spotlights: { pvp: false } });
    await frame();
    expect(host.viewerOverrides).toMatchObject({ font: 'large', theme: 'paper' });
    expect(Object.values(host.viewerOverrides.panes ?? {}).every((on) => on === false)).toBe(true);
    host.dispose();
  });
});

describe('Spotlights reel: rebuild (ADR 0110; the full-page reel until wave 3)', () => {
  it('a settings change rebuilds at once, keeping the current spotlight when it still passes', async () => {
    const { root, host, settings, src, reel } = await openReel();
    await frame();
    expect(reel.reel!.spots.map((s) => `${s.character}:${s.kind}`)).toEqual(['Bob:achievement', 'Rasta:death', 'Rasta:level']);
    // Move to Rasta's death and pause.
    key('ArrowRight');
    host.engine!.pause();
    await frame();
    expect(header(root)).toContain('SPOTLIGHT 2 / 3');
    settings.update({ spotlights: { achievements: false } });
    await frame();
    expect(src.calls).toBe(2);
    expect(reel.reel!.spots.map((s) => s.kind)).toEqual(['death', 'level']);
    // The death is still shown, now as 1 of 2; paused stays paused.
    expect(header(root)).toContain('Rasta (L42) · SPOTLIGHT 1 / 2');
    expect(host.engine!.playing).toBe(false);
    // Only Bob: the death no longer passes, the reel starts from the first and plays.
    host.engine!.play();
    settings.update({ spotlights: { achievements: true, allCharacters: false, characters: ['Bob'] } });
    await frame();
    expect(reel.reel!.spots.map((s) => s.character)).toEqual(['Bob']);
    expect(header(root)).toContain('Bob · SPOTLIGHT 1 / 1');
    expect(host.engine!.playing).toBe(true);
    // The card is the same element, still there.
    expect(card(root).isConnected).toBe(true);
    host.dispose();
  });

  it('the latest change wins', async () => {
    const { host, settings, src, reel } = await openReel();
    let release!: () => void;
    src.gate = new Promise((r) => (release = r));
    settings.update({ spotlights: { pvp: false } });
    settings.update({ spotlights: { allCharacters: false, characters: ['Rasta'] } });
    src.gate = null;
    release();
    await frame();
    expect(reel.reel!.spots.every((s) => s.character === 'Rasta')).toBe(true);
    host.dispose();
  });

  it('a change that leaves nothing shows the empty stage with the card; a change back plays again', async () => {
    const { root, host, settings, reel, closed } = await openReel();
    const el = card(root);
    settings.update({ spotlights: { period: 'week' } });
    await frame();
    // The moments are 1 day old at the reel's clock: a week keeps them.
    expect(reel.reel).not.toBeNull();
    settings.update({ spotlights: { allCharacters: false, characters: [] } });
    await frame();
    expect(reel.reel).toBeNull();
    expect(host.engine).toBeNull();
    const empty = root.querySelector('.wc-spot-empty')!;
    expect(empty.textContent).toContain('ESC Back');
    // The card stays, with its filter, and says so.
    expect(card(root)).toBe(el);
    expect(el.hasAttribute('data-empty')).toBe(true);
    expect(q(root, '.wc-sc-empty')!.textContent).toContain(REEL_NO_MATCH);
    expect(q(root, '.wc-sc-count')!.textContent).toBe('Spotlight 0 / 0');
    expect(q(root, '.wc-sc-filter')).not.toBeNull();
    // Through the card's filter: All characters again plays.
    q(root, '[data-fold="chars"]')!.click();
    q(root, '[aria-label="All characters"]')!.click();
    await frame();
    expect(root.querySelector('.wc-spot-empty')).toBeNull();
    expect(reel.reel!.spots).toHaveLength(3);
    expect(el.hasAttribute('data-empty')).toBe(false);
    // Empty again: Esc in the card only gives the keys back; Esc on the stage closes.
    settings.update({ spotlights: { allCharacters: false } });
    await frame();
    key('Escape', q(root, '.wc-sc-sel')!);
    expect(closed()).toBe(0);
    key('Escape');
    expect(closed()).toBe(1);
    expect(root.querySelector('.wc-spot-empty')).toBeNull();
  });
});

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
