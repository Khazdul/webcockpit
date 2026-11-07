// @vitest-environment happy-dom
// Stage 30e (ADR 0110): the Spotlights settings popup (kinds, characters,
// period; the start page's, since the reel's card took the gear's place in
// stage 32c, ADR 0114; Credits' filtered page still opens it) and its
// character rules. Stage 46 (ADR 0131): Spotlights' filtered and no-data
// states are its wall's, not pages of their own.
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type ChromeServices, mountStartPage } from '../../src/chrome';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { Check } from '../../src/chrome/popups/controls';
import {
  PERIOD_LABELS,
  SpotlightsPopup,
  allCharactersPatch,
  characterPatch,
  characterRows,
} from '../../src/chrome/popups/spotlights-settings';
import { ProfileStore } from '../../src/profiles';
import type { RunEvent } from '../../src/runs/events';
import type { RunLibrary } from '../../src/runs/library';
import { SPOTLIGHT_PERIODS, SettingsStore, defaultSettings } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';
import { render } from 'preact';
import { BASE_US, makeLog, meta } from './player-helpers';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  document.body.innerHTML = '';
});

beforeAll(() => {
  // happy-dom does no layout: give every element a 100 × 30 cell box.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

const S = 1e6;
const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
const keydown = (el: Element | null, key: string) =>
  act(() => {
    (el ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
const click = (el: Element | null) =>
  act(() => {
    (el as HTMLElement).click();
  });

/** A run library stand-in: the characters, and runs with events for Credits. */
function fakeLib(names: string[], runs: Array<{ meta: ReturnType<typeof meta>; events: RunEvent[] }> = []): RunLibrary {
  return {
    characters: async () => names,
    store: { listRuns: async () => runs.map((r) => r.meta) },
    events: async (ids: readonly string[]) => runs.find((r) => r.meta.runId === ids[0])?.events ?? [],
  } as unknown as RunLibrary;
}

function services(lib: RunLibrary, extra: Partial<ChromeServices> = {}): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  return { settings, cells, profiles: new ProfileStore({ factory: null }), version: '9.9.9', runs: async () => lib, ...extra };
}

const pop = () => document.querySelector<HTMLElement>('.wc-sp-spot');
const toggleOf = (label: string) => pop()!.querySelector<HTMLElement>(`[role="switch"][aria-label="${label}"]`);
const checks = () => [...pop()!.querySelectorAll<HTMLButtonElement>('.wc-ck-cb')];

describe('character rules', () => {
  const f = (p: Partial<ReturnType<typeof defaultSettings>['spotlights']> = {}) => ({ ...defaultSettings().spotlights, ...p });

  it('lists only recorded characters, with the remembered checks', () => {
    expect(characterRows(['Bob', 'Rasta'], f({ characters: ['Rasta', 'Gone'] }))).toEqual([
      { name: 'Bob', on: false },
      { name: 'Rasta', on: true },
    ]);
  });

  it('All off brings back the remembered subset, or checks every listed character', () => {
    expect(allCharactersPatch(['Bob', 'Rasta'], f({ characters: ['Rasta', 'Gone'] }), false)).toEqual({ allCharacters: false, characters: ['Rasta'] });
    expect(allCharactersPatch(['Bob', 'Rasta'], f({ characters: ['Gone'] }), false)).toEqual({ allCharacters: false, characters: ['Bob', 'Rasta'] });
    expect(allCharactersPatch(['Bob'], f({ allCharacters: false }), true)).toEqual({ allCharacters: true });
  });

  it('a check writes listed names only, in list order', () => {
    expect(characterPatch(['Bob', 'Rasta', 'Zed'], f({ characters: ['Zed', 'Gone'] }), 'Bob', true)).toEqual({ characters: ['Bob', 'Zed'] });
    expect(characterPatch(['Bob', 'Rasta'], f({ characters: ['Bob', 'Rasta'] }), 'Rasta', false)).toEqual({ characters: ['Bob'] });
  });

  it('labels the five periods', () => {
    expect(SPOTLIGHT_PERIODS.map((p) => PERIOD_LABELS[p])).toEqual(['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week']);
  });
});

describe('Check control', () => {
  it('is a checkbox row that toggles, and stays out of reach when disabled', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const on = vi.fn();
    act(() => render(<Check label="Rasta" on={false} onChange={on} />, host));
    const b = host.querySelector<HTMLButtonElement>('.wc-ck-cb')!;
    expect(b.getAttribute('role')).toBe('checkbox');
    expect(b.getAttribute('aria-checked')).toBe('false');
    expect(b.textContent).toBe('Rasta');
    await click(b);
    expect(on).toHaveBeenCalledWith(true);
    act(() => render(<Check label="Rasta" on disabled onChange={on} />, host));
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('aria-checked')).toBe('true');
    expect(b.querySelector('svg')).not.toBeNull();
    render(null, host);
  });
});

describe('Spotlights popup', () => {
  async function open(names: string[]) {
    const host = document.createElement('div');
    document.body.append(host);
    const svc = services(fakeLib(names));
    const place = vi.fn();
    let shown = true;
    const onClose = vi.fn(() => {
      shown = false;
      draw();
    });
    const draw = () =>
      render(
        <ServicesCtx.Provider value={svc}>{shown && <SpotlightsPopup place={place} onClose={onClose} focusOnOpen />}</ServicesCtx.Provider>,
        host,
      );
    act(draw);
    cleanup.push(() => render(null, host));
    await flush();
    return { svc, place, onClose, isOpen: () => pop() !== null };
  }

  it('opens with the focus on its first control; kinds write the store at once', async () => {
    const { svc, place } = await open(['Bob', 'Rasta']);
    expect(place).toHaveBeenCalled();
    expect(pop()!.getAttribute('aria-label')).toBe('Spotlights settings');
    expect(pop()!.querySelector('.wc-pop-title')!.textContent).toBe('Spotlights');
    expect(document.activeElement).toBe(toggleOf('Achievements'));
    expect([...pop()!.querySelectorAll('.wc-ck-sub')].map((e) => e.textContent)).toEqual(['Kinds', 'Characters']);
    await click(toggleOf('Deaths'));
    await click(toggleOf('PvP kills'));
    expect(svc.settings.get().spotlights).toMatchObject({ achievements: true, deaths: false, levelUps: true, pvp: false });
    expect(toggleOf('Deaths')!.getAttribute('aria-checked')).toBe('false');
  });

  it('characters: dimmed and disabled while All is on; All off checks them; a check writes the subset', async () => {
    const { svc } = await open(['Bob', 'Rasta']);
    expect(checks().map((c) => c.textContent)).toEqual(['Bob', 'Rasta']);
    expect(checks().every((c) => c.disabled)).toBe(true);
    expect(pop()!.querySelector('.wc-sp-chars')!.classList.contains('is-dim')).toBe(true);
    await click(toggleOf('All characters'));
    expect(svc.settings.get().spotlights).toMatchObject({ allCharacters: false, characters: ['Bob', 'Rasta'] });
    expect(checks().every((c) => !c.disabled && c.getAttribute('aria-checked') === 'true')).toBe(true);
    await click(checks()[0]!);
    expect(svc.settings.get().spotlights.characters).toEqual(['Rasta']);
    // ↑↓ move between the names.
    act(() => checks()[0]!.focus());
    await keydown(checks()[0]!, 'ArrowDown');
    expect(document.activeElement).toBe(checks()[1]);
    // All on again keeps the subset for later.
    await click(toggleOf('All characters'));
    expect(svc.settings.get().spotlights).toMatchObject({ allCharacters: true, characters: ['Rasta'] });
    expect(checks().map((c) => c.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('says so when no character is recorded', async () => {
    await open([]);
    expect(pop()!.querySelector('.wc-sp-nochars')!.textContent).toBe('No characters recorded yet.');
    expect(checks()).toHaveLength(0);
  });

  it('the period dropdown writes the store', async () => {
    const { svc } = await open(['Bob']);
    const dd = pop()!.querySelector<HTMLElement>('.wc-sp-period .wc-ck-dd')!;
    expect(dd.textContent).toContain('All time');
    await click(dd);
    const opts = [...pop()!.querySelectorAll<HTMLElement>('.wc-ck-opt')];
    expect(opts.map((o) => o.textContent)).toEqual(['All time', 'Last year', 'Last 3 months', 'Last month', 'Last week']);
    await click(opts[3]!);
    expect(svc.settings.get().spotlights.period).toBe('month');
  });

  it('Esc and its X close it', async () => {
    const a = await open(['Bob']);
    await keydown(document.activeElement, 'Escape');
    expect(a.onClose).toHaveBeenCalledTimes(1);
    expect(a.isOpen()).toBe(false);
    render(null, document.body.lastElementChild!);
    const b = await open(['Bob']);
    await click(pop()!.querySelector('.wc-pop-x'));
    expect(b.onClose).toHaveBeenCalledTimes(1);
    expect(b.isOpen()).toBe(false);
  });
});

// ------------------------------------------------------- the start page

const frameEl = (host: HTMLElement) => host.querySelector<HTMLElement>('.wc-frame:not([hidden])')!;
const title = (host: HTMLElement) => frameEl(host).querySelector('.wc-c-section')?.textContent;
const startSel = (host: HTMLElement) => frameEl(host).querySelector('.wc-sm-item.is-sel .wc-sm-label')?.textContent;

describe('filtered empty pages (start page)', () => {
  // Stage 46 (ADR 0131): Spotlights has no pages of its own for these any
  // more; no data and nothing passing are states of its wall. The
  // `FilteredFrame` itself stays for Credits until stage 47.

  /** A run of Rasta's with a level-up and a death, its log, and the library over it. */
  function rastaLib(): RunLibrary {
    const r1 = BASE_US;
    const events: RunEvent[] = [
      { type: 'run_start', us: r1, character: 'Rasta', level: 41, schema: 1 },
      { type: 'level_up', us: r1 + 20 * S, level: 42 },
      { type: 'char_death', us: r1 + 60 * S, logUs: r1 + 60 * S },
    ];
    const m = meta('Rasta/1', r1, { bytes: 100 });
    const text = makeLog(r1, [20, 60].flatMap((t) => [{ at: t - 2, in: `Before ${t}.` }, { at: t, in: `Moment ${t}.` }]));
    return {
      characters: async () => ['Rasta'],
      store: { listRuns: async () => [m] },
      events: async () => events,
      chainLogRange: async () => ({ meta: m, text }),
    } as unknown as RunLibrary;
  }

  const wall = (host: HTMLElement) => frameEl(host).querySelector<HTMLElement>('.wc-spw');
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 40 && !ok(); i++) await act(() => new Promise((r) => setTimeout(r, 10)));
  };

  it('Spotlights: a filter that lets nothing through opens the wall with its filter row; a chip there brings the cards back', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const openSpotlights = vi.fn(async () => 'filtered' as const);
    const svc = services(rastaLib(), { openSpotlights, embedPlayer: async () => null });
    svc.settings.update({ spotlights: { allCharacters: false, characters: [] } });
    const page = mountStartPage(host, svc, { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await click(host.querySelector('.wc-sm-item[data-key="spotlights"]'));
    await until(() => wall(host) !== null);
    // The wall, not a page of its own: no Settings…, no popup, no Options.
    expect(openSpotlights).not.toHaveBeenCalled();
    expect(wall(host)!.querySelector('.wc-spw-empty')!.textContent).toContain('No spotlights match your settings.');
    expect(wall(host)!.textContent).not.toContain('Settings…');
    expect(wall(host)!.textContent).not.toContain('Options');
    expect(title(host)).toBeUndefined();
    expect(pop()).toBeNull();
    // The filter row is there: the kinds, All and Rasta, the period.
    const chips = [...wall(host)!.querySelectorAll<HTMLElement>('.wc-spw-head [role="checkbox"]')];
    expect(chips.map((c) => c.textContent)).toEqual(['Achievements', 'Deaths', 'Level-ups', 'PvP kills', 'All', 'Rasta']);
    // Rasta's chip: the cards are back and the setting is saved.
    await click(wall(host)!.querySelector('.wc-spw-chars [data-opt="Rasta"]'));
    await until(() => (wall(host)?.querySelectorAll('.wc-spw-card').length ?? 0) > 0);
    expect(svc.settings.get().spotlights).toMatchObject({ allCharacters: false, characters: ['Rasta'] });
    expect([...wall(host)!.querySelectorAll('.wc-spw-label')].map((e) => e.textContent)).toEqual(['Death (level 42)', 'Reached level 42']);
    // Esc: the menu.
    await keydown(document.activeElement, 'Escape');
    await until(() => startSel(host) !== undefined);
    expect(startSel(host)).toBe('Spotlights');
  });

  it('Spotlights: no data is a wall without the filter row', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(fakeLib([]), { embedPlayer: async () => null }), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await click(host.querySelector('.wc-sm-item[data-key="spotlights"]'));
    await until(() => wall(host) !== null);
    expect(wall(host)!.querySelector('.wc-spw-empty')!.textContent).toContain('No spotlights yet.');
    expect(wall(host)!.querySelector('.wc-spw-head')).toBeNull();
    expect(frameEl(host).querySelector('.wc-footer')).toBeNull();
  });

  it('Spotlights: without an embedded player the menu flashes and stays', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const page = mountStartPage(host, services(fakeLib([])), { onEnter: () => {} });
    cleanup.push(() => page.dispose());
    await act(() => page.show());
    await click(host.querySelector('.wc-sm-item[data-key="spotlights"]'));
    await flush();
    expect(wall(host)).toBeNull();
    expect(startSel(host)).toBe('Spotlights');
    expect(host.textContent).toContain('Spotlights are not available here.');
  });
});
