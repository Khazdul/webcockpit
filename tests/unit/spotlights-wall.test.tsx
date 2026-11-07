// @vitest-environment happy-dom
// Stage 46 (B "Galleriet"): the Spotlights page's wall — the cards and
// their stills, the filter row writing `settings.spotlights` (chips, the
// period), the rebuild keeping the chosen card (latest change wins), the
// empty walls, the letters F / P, the 2D keys, and the viewer opened from
// a card and left back onto one.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChromeServices } from '../../src/chrome';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { FrameStack } from '../../src/chrome/kit/stack';
import type { Reel } from '../../src/player/spotlight-reel';
import { ProfileStore } from '../../src/profiles';
import type { RunLibrary } from '../../src/runs/library';
import { SettingsStore, type SpotlightSettings } from '../../src/settings';
import type { Spotlight, SpotlightKind } from '../../src/share/spotlights';
import { CellMetrics } from '../../src/theme/cells';

const viewer = vi.hoisted(() => ({
  props: null as null | { start: number; reel: unknown; cardRect: (i?: number) => DOMRect | null; onLeave: (i: number) => void },
  mounts: 0,
  /** The kept host's Display theme (null: no kept host). */
  theme: null as null | string,
}));
vi.mock('../../src/chrome/frames/spotlights-viewer', () => ({
  SpotlightsViewer: (p: NonNullable<typeof viewer.props>) => {
    viewer.props = p;
    return <div class="test-viewer" data-start={p.start} />;
  },
  keptSpotlightsHost: () => (viewer.theme === null ? null : { viewerControls: () => ({ theme: () => viewer.theme }) }),
}));

const { SpotlightsWall, cardDate, stillPalette, wallSummary } = await import('../../src/chrome/frames/spotlights-wall');
type WallState = Parameters<typeof SpotlightsWall>[0]['reel'];

afterEach(() => {
  render(null, document.body);
  document.body.innerHTML = '';
  viewer.props = null;
  viewer.theme = null;
});

const DAY = 86_400_000_000;
const AT = new Date(2026, 8, 26, 21, 0).getTime() * 1000;

function spot(id: string, kind: SpotlightKind, character: string, label: string): Spotlight {
  return { id, runId: id, character, level: 42, kind, atUs: AT, fromUs: AT, toUs: AT, prefixFromUs: AT, label, runStartUs: AT } as Spotlight;
}

const ALL = [
  spot('a', 'death', 'Rasta', 'Death (level 42)'),
  spot('b', 'achievement', 'Gittan', 'Achievement: Put a barrow-wight to rest.'),
  spot('c', 'pkill', 'Rasta', '*Ibuki the Half-Elf*'),
  spot('d', 'achievement', 'Rasta', 'Achievement: That was a quick trip!'),
  spot('e', 'level', 'Rasta', 'Reached level 42'),
];
const KEY: Record<SpotlightKind, keyof SpotlightSettings> = { death: 'deaths', achievement: 'achievements', pkill: 'pvp', level: 'levelUps' };

/** The wall the filters let through (a stand-in for the shell's ReelSource). */
function wallFor(f: SpotlightSettings): WallState {
  const spots = ALL.filter((s) => f[KEY[s.kind]] && (f.allCharacters || f.characters.includes(s.character)));
  if (spots.length === 0) return { empty: 'filtered' };
  const reel = { spots, chain: [] } as unknown as Reel;
  return { reel, stills: spots.map((s) => [{ text: `${s.label} still`, runs: s.kind === 'death' ? [{ start: 0, end: 5, fg: 1 }] : [] }]), lengthMs: 66_000 };
}

function setup(opts: { reel?: WallState; names?: string[]; load?: (f: SpotlightSettings) => Promise<WallState> } = {}) {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  const services: ChromeServices = {
    settings,
    cells,
    profiles: new ProfileStore({ factory: null }),
    version: '9.9.9',
    runs: async () => ({}) as RunLibrary,
  };
  const calls: SpotlightSettings[] = [];
  const source = {
    load: vi.fn(async (f: SpotlightSettings) => {
      calls.push(f);
      return opts.load ? opts.load(f) : wallFor(f);
    }),
  };
  const rootBack = vi.fn();
  const reel = opts.reel ?? wallFor(settings.get().spotlights);
  render(
    <ServicesCtx.Provider value={services}>
      <FrameStack
        active
        onRootBack={rootBack}
        root={<SpotlightsWall source={source} reel={reel} characters={opts.names ?? ['Gittan', 'Rasta']} now={() => AT + DAY} />}
      />
    </ServicesCtx.Provider>,
    document.body,
  );
  return { settings, source, calls, rootBack };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });
const click = (el: Element | null) =>
  act(() => {
    (el as HTMLElement).click();
  });
const cards = () => [...document.querySelectorAll<HTMLElement>('.wc-spw-card')];
const chosen = () => cards().findIndex((c) => c.classList.contains('is-on') || c.classList.contains('is-idle'));
const head = () => document.querySelector('.wc-spw-head');
/** happy-dom lays nothing out: give the grid three columns. */
const threeColumns = () => {
  document.querySelector<HTMLElement>('.wc-spw-grid')!.style.gridTemplateColumns = '1fr 1fr 1fr';
};

describe('the wall', () => {
  it('shows one card per spotlight with its kind, still, label and meta; the summary in the foot', async () => {
    setup();
    await flush();
    expect(cards()).toHaveLength(5);
    expect(chosen()).toBe(0);
    const c = cards()[0]!;
    expect(c.dataset.kind).toBe('death');
    expect(c.querySelector('.wc-spw-kind')!.textContent).toBe('Death');
    expect(c.querySelector('.wc-spw-n')!.textContent).toBe('1');
    expect(c.querySelector('.wc-spw-label')!.textContent).toBe('Death (level 42)');
    expect(c.querySelector('.wc-spw-meta')!.textContent).toBe('Rasta · level 42 · 26 Sep 2026');
    // The still's ANSI red reads the page's palette (the brighter red).
    const red = c.querySelector<HTMLElement>('.wc-spw-ln span')!;
    expect(red.textContent).toBe('Death');
    expect(red.style.color).toBe('var(--spw-a1)');
    expect(document.querySelector<HTMLElement>('.wc-spw-wall')!.style.getPropertyValue('--spw-a1')).toBe('#c43c3c');
    expect(document.querySelector('.wc-spw-sum')!.textContent).toBe('5 spotlights · 01:06');
    expect(document.querySelector('[data-btn="PLAY"]')!.getAttribute('aria-disabled')).toBeNull();
    // The chips: every kind and All on.
    const on = [...document.querySelectorAll('.wc-spw-head [aria-checked="true"]')].map((b) => b.getAttribute('data-opt'));
    expect(on).toEqual(['achievement', 'death', 'level', 'pkill', 'all']);
  });

  it('formats the card date and the summary', () => {
    expect(cardDate(new Date(2026, 8, 26, 23, 59).getTime() * 1000)).toBe('26 Sep 2026');
    expect(wallSummary(1, 5000)).toBe('1 spotlight · 00:05');
    expect(wallSummary(12, 3_725_000)).toBe('12 spotlights · 1:02:05');
    expect(wallSummary(0, 0)).toBe('');
  });

  it('moves in 2D, PgUp / PgDn and Home / End; ↑ from the top row goes to the filter row', async () => {
    setup();
    await flush();
    threeColumns();
    await key('ArrowRight');
    expect(chosen()).toBe(1);
    await key('ArrowDown');
    expect(chosen()).toBe(4);
    await key('ArrowLeft');
    expect(chosen()).toBe(3);
    await key('Home');
    expect(chosen()).toBe(0);
    await key('End');
    expect(chosen()).toBe(4);
    await key('ArrowUp');
    expect(chosen()).toBe(1);
    expect(head()!.classList.contains('is-cur')).toBe(false);
    await key('ArrowUp');
    expect(head()!.classList.contains('is-cur')).toBe(true);
    // The chosen card stays chosen, dimmer.
    expect(cards()[1]!.classList.contains('is-idle')).toBe(true);
    await key('ArrowDown');
    expect(head()!.classList.contains('is-cur')).toBe(false);
    expect(cards()[1]!.classList.contains('is-on')).toBe(true);
  });

  it('a click chooses a card, a double click plays it', async () => {
    setup();
    await flush();
    await click(cards()[2]!);
    expect(chosen()).toBe(2);
    expect(viewer.props).toBeNull();
    await act(() => {
      cards()[2]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(viewer.props?.start).toBe(2);
  });
});

describe('the filter row', () => {
  it('F moves the keyboard there: ← → walk the chips, Space toggles, Tab the groups, Esc back', async () => {
    const t = setup();
    await flush();
    await key('ArrowRight');
    await key('f');
    expect(head()!.classList.contains('is-cur')).toBe(true);
    expect(document.querySelector('.wc-spw-kinds .is-sel')!.getAttribute('data-opt')).toBe('achievement');
    await key('ArrowRight');
    await key(' ');
    await flush();
    expect(t.settings.get().spotlights.deaths).toBe(false);
    expect(t.calls.at(-1)!.deaths).toBe(false);
    // The chosen card (Gittan's achievement) still passes: it stays chosen.
    expect(cards()).toHaveLength(4);
    expect(cards()[chosen()]!.textContent).toContain('barrow-wight');
    await key(' ');
    await flush();
    expect(t.settings.get().spotlights.deaths).toBe(true);
    expect(cards()).toHaveLength(5);
    expect(chosen()).toBe(1);
    // Tab: the characters' group, then the period; Space steps the period.
    await key('Tab');
    expect(document.querySelector('.wc-spw-chars .is-sel')!.getAttribute('data-opt')).toBe('all');
    await key('Tab');
    expect(document.querySelector('.wc-spw-period')!.classList.contains('is-sel')).toBe(true);
    await key('Enter');
    await flush();
    expect(t.settings.get().spotlights.period).toBe('year');
    await key('Tab', { shiftKey: true });
    expect(document.querySelector('.wc-spw-chars .is-sel')).not.toBeNull();
    await key('Escape');
    expect(head()!.classList.contains('is-cur')).toBe(false);
    expect(t.rootBack).not.toHaveBeenCalled();
  });

  it('chips: a name while All shows only that name; the last name off turns All back on', async () => {
    const t = setup();
    await flush();
    await click(document.querySelector('.wc-spw-chars [data-opt="Gittan"]'));
    await flush();
    expect(t.settings.get().spotlights).toMatchObject({ allCharacters: false, characters: ['Gittan'] });
    expect(cards()).toHaveLength(1);
    expect(document.querySelector('.wc-spw-chars [data-opt="all"]')!.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('.wc-spw-chars [data-opt="Gittan"]')!.getAttribute('aria-checked')).toBe('true');
    await click(document.querySelector('.wc-spw-chars [data-opt="Rasta"]'));
    await flush();
    expect(t.settings.get().spotlights.characters).toEqual(['Gittan', 'Rasta']);
    await click(document.querySelector('.wc-spw-chars [data-opt="Rasta"]'));
    await click(document.querySelector('.wc-spw-chars [data-opt="Gittan"]'));
    await flush();
    expect(t.settings.get().spotlights.allCharacters).toBe(true);
    expect(cards()).toHaveLength(5);
  });

  it('the period select writes the setting', async () => {
    const t = setup();
    await flush();
    const sel = document.querySelector<HTMLSelectElement>('.wc-spw-period select')!;
    expect([...sel.options].map((o) => o.textContent)).toEqual(['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week']);
    await act(() => {
      sel.value = 'week';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(t.settings.get().spotlights.period).toBe('week');
    expect(t.calls.at(-1)!.period).toBe('week');
  });

  it('nothing passes: the filter row stays and the wall says so; a change brings the cards back', async () => {
    setup();
    await flush();
    for (const k of ['achievement', 'death', 'level', 'pkill']) await click(document.querySelector(`.wc-spw-kinds [data-opt="${k}"]`));
    await flush();
    expect(cards()).toHaveLength(0);
    expect(document.querySelector('.wc-spw-empty')!.textContent).toBe(
      'No spotlights match your settings.Turn on a kind or a character above, or choose a longer period.',
    );
    expect(head()).not.toBeNull();
    expect(document.querySelector('[data-btn="PLAY"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(document.querySelector('.wc-spw-sum')!.textContent).toBe('');
    // ↑ (or Tab) on the empty wall goes to the filter row.
    await key('ArrowUp');
    expect(head()!.classList.contains('is-cur')).toBe(true);
    // The keyboard is on the last chip clicked (PvP kills): back to Achievements, on.
    for (let i = 0; i < 3; i++) await key('ArrowLeft');
    await key(' ');
    await flush();
    expect(cards().map((c) => c.dataset.kind)).toEqual(['achievement', 'achievement']);
    expect(chosen()).toBe(0);
  });

  it('the latest change wins', async () => {
    const pending: Array<{ f: SpotlightSettings; done: (w: WallState) => void }> = [];
    const t = setup({ load: (f) => new Promise((done) => pending.push({ f, done })) });
    await flush();
    await click(document.querySelector('.wc-spw-kinds [data-opt="death"]'));
    await click(document.querySelector('.wc-spw-kinds [data-opt="pkill"]'));
    await flush();
    expect(pending).toHaveLength(2);
    // The newer one lands first, then the older one: the older is dropped.
    await act(() => pending[1]!.done(wallFor(pending[1]!.f)));
    await act(() => pending[0]!.done(wallFor(pending[0]!.f)));
    await flush();
    expect(cards().map((c) => c.dataset.kind)).toEqual(['achievement', 'achievement', 'level']);
    expect(t.source.load).toHaveBeenCalledTimes(2);
  });
});

describe('states and the viewer', () => {
  it('no data: no filter row, how spotlights are made, no Play all; Esc to the menu', async () => {
    const t = setup({ reel: { empty: 'no_data' } });
    await flush();
    expect(head()).toBeNull();
    expect(document.querySelector('.wc-spw-empty')!.textContent).toMatch(/^No spotlights yet\. Play a session/);
    expect(document.querySelector('[data-btn="PLAY"]')).toBeNull();
    await key('f');
    await key('p');
    expect(head()).toBeNull();
    expect(viewer.props).toBeNull();
    await key('Escape');
    expect(t.rootBack).toHaveBeenCalledTimes(1);
  });

  it('Enter plays the chosen card, P plays all; keys are the viewer’s while it is open; onLeave chooses its card', async () => {
    const t = setup();
    await flush();
    threeColumns();
    await key('ArrowRight');
    await key('Enter');
    expect(viewer.props?.start).toBe(1);
    expect((viewer.props?.reel as Reel).spots.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(document.querySelector('.wc-spw-wall')!.hasAttribute('inert')).toBe(true);
    // The wall's keys do nothing while the viewer is open, Esc included.
    await key('ArrowRight');
    await key('Escape');
    await key('f');
    expect(chosen()).toBe(1);
    expect(t.rootBack).not.toHaveBeenCalled();
    expect(head()!.classList.contains('is-cur')).toBe(false);
    // The card rect for the grow / shrink: the chosen card, or a given one.
    expect(viewer.props!.cardRect()).not.toBeNull();
    expect(viewer.props!.cardRect(4)).not.toBeNull();
    await act(() => viewer.props!.onLeave(3));
    expect(document.querySelector('.test-viewer')).toBeNull();
    expect(document.querySelector('.wc-spw-wall')!.hasAttribute('inert')).toBe(false);
    expect(chosen()).toBe(3);
    await key('p');
    expect(viewer.props?.start).toBe(0);
    await act(() => viewer.props!.onLeave(4));
    expect(chosen()).toBe(4);
    await key('Escape');
    expect(t.rootBack).toHaveBeenCalledTimes(1);
  });

  it('Back leaves the viewer as Esc does (an Esc for the player view), else goes to the menu', async () => {
    // (Registered first: the stack's own window listener stops the event.)
    const escapes: string[] = [];
    const spy = (e: KeyboardEvent) => escapes.push(e.key);
    window.addEventListener('keydown', spy, true);
    const t = setup();
    await flush();
    await key('Enter');
    await click(document.querySelector('.wc-lk-back'));
    expect(escapes).toContain('Escape');
    expect(t.rootBack).not.toHaveBeenCalled();
    await act(() => viewer.props!.onLeave(0));
    await click(document.querySelector('.wc-lk-back'));
    expect(t.rootBack).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', spy, true);
  });

  it('Enter or P while a rebuild is in flight plays on the new wall once it lands', async () => {
    const pending: Array<{ f: SpotlightSettings; done: (w: WallState) => void }> = [];
    setup({ load: (f) => new Promise((done) => pending.push({ f, done })) });
    await flush();
    threeColumns();
    // The PvP kill (card 3) chosen, then Deaths off: the wall is rebuilding.
    await key('ArrowRight');
    await key('ArrowRight');
    await click(document.querySelector('.wc-spw-kinds [data-opt="death"]'));
    await key('Enter');
    expect(viewer.props).toBeNull();
    await act(() => pending[0]!.done(wallFor(pending[0]!.f)));
    await flush();
    // The new reel (no death): the PvP kill is its second card, and it plays from there.
    expect(cards().map((c) => c.dataset.kind)).toEqual(['achievement', 'pkill', 'achievement', 'level']);
    expect((viewer.props!.reel as Reel).spots.map((s) => s.id)).toEqual(['b', 'c', 'd', 'e']);
    expect(viewer.props!.start).toBe(1);
    expect(chosen()).toBe(1);
    await act(() => viewer.props!.onLeave(2));
    expect(chosen()).toBe(2);
    viewer.props = null;
    // P during a rebuild: Play all on the new wall, from its first card.
    await click(document.querySelector('.wc-spw-kinds [data-opt="death"]'));
    await key('p');
    expect(viewer.props).toBeNull();
    await act(() => pending[1]!.done(wallFor(pending[1]!.f)));
    await flush();
    expect((viewer.props!.reel as Reel).spots.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(viewer.props!.start).toBe(0);
  });

  it('a card asked to play during a rebuild that drops it does not play', async () => {
    const pending: Array<{ f: SpotlightSettings; done: (w: WallState) => void }> = [];
    setup({ load: (f) => new Promise((done) => pending.push({ f, done })) });
    await flush();
    // The death (card 1) chosen; Deaths off, Enter at once.
    await click(document.querySelector('.wc-spw-kinds [data-opt="death"]'));
    await key('Enter');
    await act(() => pending[0]!.done(wallFor(pending[0]!.f)));
    await flush();
    expect(viewer.props).toBeNull();
    expect(chosen()).toBe(0);
  });

  it('the stills follow the viewer\'s Display colours: Default with the brighter red, a chosen theme its own', async () => {
    expect(stillPalette('default')['--spw-a1']).toBe('#c43c3c');
    expect(stillPalette('default')['--spw-bg']).toBeUndefined();
    expect(stillPalette('dark')).toMatchObject({ '--spw-a1': '#800000', '--spw-bg': '#000000', '--spw-fg': '#c0c0c0' });
    expect(stillPalette('paper')).toMatchObject({ '--spw-a1': '#800000', '--spw-bg': '#f4ecd8', '--spw-bold': '#000000' });
    setup();
    await flush();
    const wall = () => document.querySelector<HTMLElement>('.wc-spw-wall')!;
    expect(wall().dataset.stillTheme).toBe('default');
    expect(wall().style.getPropertyValue('--spw-a1')).toBe('#c43c3c');
    await key('Enter');
    viewer.theme = 'teal';
    await act(() => viewer.props!.onLeave(0));
    expect(wall().dataset.stillTheme).toBe('teal');
    expect(wall().style.getPropertyValue('--spw-a1')).toBe('#800000');
    expect(wall().style.getPropertyValue('--spw-bg')).toBe('#002b36');
    await key('Enter');
    viewer.theme = 'default';
    await act(() => viewer.props!.onLeave(0));
    expect(wall().style.getPropertyValue('--spw-a1')).toBe('#c43c3c');
    expect(wall().style.getPropertyValue('--spw-bg')).toBe('');
  });
});
