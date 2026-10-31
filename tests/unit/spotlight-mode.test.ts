// @vitest-environment happy-dom
// Stage 30e (ADR 0110): the reel's gear and its popup (through a stand-in
// for the chrome chunk's settings popups), the Esc order, the keys left to
// the popup, the live rebuild on a settings change (current spotlight
// kept, paused stays paused, the latest change wins) and the empty stage.
import { describe, expect, it, vi } from 'vitest';
import { PlayerHost } from '../../src/app/player-host';
import type { SettingsPopupsHandle, SettingsPopupsOptions } from '../../src/chrome/popups/surface';
import { type ReelHandle, REEL_NO_MATCH, openSpotlightReel } from '../../src/player/spotlight-mode';
import type { Reel, ReelLoader } from '../../src/player/spotlight-reel';
import type { RunEvent } from '../../src/runs/events';
import { SettingsStore, type SpotlightSettings } from '../../src/settings';
import { type SpotlightRun, selectSpotlights } from '../../src/share/spotlights';
import type { ChainRun } from '../../src/player/timeline';
import { OWN_KEYS_ATTR } from '../../src/ui/input-pane';
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

/** A stand-in for the chrome chunk's settings popups. */
function fakePopups() {
  const st = {
    opts: null as SettingsPopupsOptions | null,
    host: null as HTMLElement | null,
    open: false,
    placed: 0,
    disposed: false,
    handle: null as SettingsPopupsHandle | null,
  };
  const handle = {
    toggle: vi.fn((_t: unknown, place: (el: HTMLElement) => void) => {
      st.open = !st.open;
      if (st.open) {
        const el = document.createElement('div');
        el.className = 'wc-pop';
        el.setAttribute(OWN_KEYS_ATTR, '');
        st.host!.append(el);
        place(el);
        st.placed++;
      } else st.host!.replaceChildren();
      st.opts!.onChange?.(st.open ? 'spotlights' : null);
    }),
    close: vi.fn(() => {
      if (!st.open) return false;
      st.open = false;
      st.host!.replaceChildren();
      st.opts!.onChange?.(null);
      return true;
    }),
    place: vi.fn(),
    dispose: vi.fn(() => void (st.disposed = true)),
    get isOpen() {
      return st.open;
    },
  } as unknown as SettingsPopupsHandle;
  st.handle = handle;
  const mount = vi.fn(async (host: HTMLElement, opts: SettingsPopupsOptions) => {
    st.host = host;
    st.opts = opts;
    return handle;
  });
  return { st, mount, handle };
}

async function openReel(withGear = true) {
  const root = document.createElement('div');
  root.style.cssText = 'width:1200px;height:800px';
  document.body.appendChild(root);
  const wall = new FakeWall();
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  void settings.load();
  let closed = 0;
  const host = new PlayerHost({ root, settings, wall, onClose: () => closed++, hideMs: 100 });
  const src = loader();
  const now = () => BASE_US + 86_400 * S;
  const first = await src.load(settings.get().spotlights, now());
  if ('empty' in first) throw new Error('no reel');
  const pops = fakePopups();
  const reel: ReelHandle = openSpotlightReel(host, first, withGear ? { source: src, settings, popups: pops.mount, now } : {});
  return { root, wall, settings, host, src, pops, reel, closed: () => closed };
}

const key = (k: string, target: EventTarget = window) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const gear = (root: HTMLElement) => root.querySelector<HTMLElement>('.wc-player-gear');
const header = (root: HTMLElement) => root.querySelector('.wc-player-head-left')?.textContent ?? '';

describe('Spotlights reel: gear and popup (ADR 0110)', () => {
  it('has no gear without the settings services; the gear otherwise', async () => {
    const a = await openReel(false);
    expect(gear(a.root)).toBeNull();
    a.host.dispose();
    const b = await openReel();
    expect(gear(b.root)!.title).toBe('Spotlights settings');
    expect(gear(b.root)!.textContent).toBe('⚙');
    b.host.dispose();
  });

  it('the gear opens the popup beside the player, marks the gear and keeps the chrome', async () => {
    const { root, host, pops } = await openReel();
    gear(root)!.click();
    await frame();
    expect(pops.mount).toHaveBeenCalledTimes(1);
    // Beside the player element, not inside it.
    expect(pops.st.host!.parentElement).toBe(root);
    expect(host.el.contains(pops.st.host)).toBe(false);
    expect(pops.handle.toggle).toHaveBeenCalledWith('spotlights', expect.any(Function));
    expect(pops.st.open).toBe(true);
    expect(gear(root)!.classList.contains('is-on')).toBe(true);
    // The chrome does not auto-hide while it is open (hideMs 100).
    await new Promise((r) => setTimeout(r, 250));
    expect(host.playerView!.chromeShown).toBe(true);
    // The gear again closes it.
    gear(root)!.click();
    await frame();
    expect(pops.st.open).toBe(false);
    expect(gear(root)!.classList.contains('is-on')).toBe(false);
    host.dispose();
    expect(pops.st.disposed).toBe(true);
    expect(pops.st.host!.isConnected).toBe(false);
  });

  it('keys in the popup are its own; Esc closes the popup before the reel', async () => {
    const { root, host, pops, closed } = await openReel();
    gear(root)!.click();
    await frame();
    const speed = host.engine!.speed;
    key('3', pops.st.host!.firstElementChild!);
    expect(host.engine!.speed).toBe(speed);
    // Esc with the keys outside the popup: the popup closes, the reel stays.
    key('Escape');
    expect(pops.st.open).toBe(false);
    expect(closed()).toBe(0);
    key('Escape');
    expect(closed()).toBe(1);
  });
});

describe('Spotlights reel: rebuild (ADR 0110)', () => {
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
    // The gear is still there.
    expect(gear(root)).not.toBeNull();
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

  it('a change that leaves nothing shows the empty stage; a change back plays again', async () => {
    const { root, host, settings, pops, reel, closed } = await openReel();
    gear(root)!.click();
    await frame();
    settings.update({ spotlights: { period: 'week' } });
    await frame();
    // The moments are 1 day old at the reel's clock: a week keeps them.
    expect(reel.reel).not.toBeNull();
    settings.update({ spotlights: { allCharacters: false, characters: [] } });
    await frame();
    expect(reel.reel).toBeNull();
    expect(host.engine).toBeNull();
    const empty = root.querySelector('.wc-spot-empty')!;
    expect(empty.textContent).toContain(REEL_NO_MATCH);
    expect(empty.textContent).toContain('Settings…');
    expect(empty.textContent).toContain('ESC Back');
    // The popup stayed open and is placed again by the empty stage.
    expect(pops.st.open).toBe(true);
    expect(pops.handle.place).toHaveBeenCalled();
    settings.update({ spotlights: { allCharacters: true } });
    await frame();
    expect(root.querySelector('.wc-spot-empty')).toBeNull();
    expect(reel.reel!.spots).toHaveLength(3);
    expect(gear(root)!.classList.contains('is-on')).toBe(true);
    // Empty again: Enter toggles the popup, Esc closes it, then the reel.
    settings.update({ spotlights: { allCharacters: false } });
    await frame();
    key('Escape');
    expect(pops.st.open).toBe(false);
    key('Enter');
    await frame();
    expect(pops.st.open).toBe(true);
    key('Escape');
    key('Escape');
    expect(closed()).toBe(1);
    expect(root.querySelector('.wc-spot-empty')).toBeNull();
  });
});
