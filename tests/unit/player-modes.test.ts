// @vitest-environment happy-dom
// Stage 7 player modes (ADR 0019): PlayerHost shows comments and blanks in
// the output pane; PlayerView's options (header provider, extra keys,
// startHidden, box buttons, Close, onEsc) and the cursor skipping blanks.
import { describe, expect, it } from 'vitest';
import { PlayerHost, type PlayerOpenOptions } from '../../src/app/player-host';
import { SettingsStore } from '../../src/settings';
import { BASE_US, FakeWall, type LogItem, makeLog, meta, twoRunChain } from './player-helpers';

const frame = () => new Promise((r) => setTimeout(r, 40));

function open(opts: PlayerOpenOptions = {}, chain = twoRunChain()) {
  const root = document.createElement('div');
  root.style.cssText = 'width:1200px;height:800px';
  document.body.appendChild(root);
  const wall = new FakeWall();
  const viewer = new SettingsStore({ factory: null, storage: null, win: null });
  void viewer.load();
  let closed = 0;
  const host = new PlayerHost({ root, settings: viewer, wall, onClose: () => closed++ });
  host.openChain(chain, [], { character: 'Rasta', level: 42 }, opts);
  return { root, wall, host, closed: () => closed };
}

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('PlayerHost comments and blanks', () => {
  it('shows a comment as wrapped ## rows before its anchor, stamped with its time', async () => {
    const text = 'Look at this. '.repeat(8);
    const { wall, host } = open({
      edits: { comments: [{ beforeUs: BASE_US + 3e6, text, holdMs: 5000 }] },
    });
    wall.advance(8000);
    await frame();
    const rows = [...host.app!.output.el.querySelectorAll<HTMLElement>('.wc-row')];
    const c = rows.filter((r) => r.classList.contains('wc-comment'));
    expect(c.length).toBe(2);
    expect(c.every((r) => r.textContent!.startsWith('## ') && r.textContent!.length <= 80)).toBe(true);
    expect(c[0]!.dataset.ts).toBe(String(BASE_US + 3e6));
    const i = rows.indexOf(c[1]!);
    expect(rows[i + 1]!.textContent).toBe('A room.');
    host.dispose();
  });

  it('sends blank rows before a spotlight window; the cursor skips them', async () => {
    const chain = [
      { meta: meta('A/1', BASE_US), text: makeLog(BASE_US, [{ at: 1, in: 'One.' }, { at: 2, in: 'Two.' }]) },
      { meta: meta('B/1', BASE_US + 3600e6), text: makeLog(BASE_US + 3600e6, [{ at: 1, in: 'Three.' }]) },
    ];
    const { wall, host } = open(
      {
        edits: {
          windows: [
            { fromUs: BASE_US, toUs: BASE_US + 3e6 },
            { fromUs: BASE_US + 3600e6, toUs: BASE_US + 3602e6 },
          ],
          blankLines: 5,
        },
      },
      chain,
    );
    wall.advance(10_000);
    await frame();
    const out = host.app!.output.el;
    expect(out.querySelectorAll('.wc-blank').length).toBe(10);
    // Paused at the end: the cursor on the last line; ↑ skips the blanks between the windows.
    expect(host.engine!.playing).toBe(false);
    await frame();
    key('ArrowUp');
    expect(host.playerView!.cursorLine!.classList.contains('wc-blank')).toBe(false);
    let guard = 0;
    while (host.playerView!.cursorLine!.textContent !== 'Two.' && guard++ < 20) key('ArrowUp');
    expect(host.playerView!.cursorLine!.textContent).toBe('Two.');
    host.playerView!.moveCursor(-Infinity);
    expect(host.playerView!.cursorLine!.classList.contains('wc-blank')).toBe(false);
    host.dispose();
  });
});

describe('PlayerView options', () => {
  it('keeps the in-app header and hints', async () => {
    const { root, host, closed } = open();
    await frame();
    expect(root.querySelector('.wc-player-head-left')!.innerHTML).toMatch(
      /^<span class="wc-player-name">Rasta \(L42\)<\/span><span class="wc-player-sep"> · <\/span>Run 1 of 2<span class="wc-player-sep"> · <\/span>\d{4}-\d\d-\d\d \d\d:\d\d$/,
    );
    const back = root.querySelector<HTMLElement>('.wc-player-hints .wc-player-back')!;
    expect(back.textContent).toBe('ESC Back');
    back.click();
    expect(closed()).toBe(1);
    host.dispose();
  });

  it('takes a header provider, extra keys, box buttons, no Close and onEsc; starts hidden', async () => {
    const seen: string[] = [];
    let esc = 0;
    let fs = false;
    const { root, host, closed } = open({
      view: {
        header: (run) => ({
          left: [{ text: `SPOT ${run + 1}`, cls: 'wc-player-name' }, { text: 'X' }],
          hints: [
            { text: 'ESC Back', drop: Infinity },
            { text: '←→ Prev/next', drop: 1, onClick: () => seen.push('click') },
          ],
        }),
        keys: (e) => {
          if (e.key !== 'ArrowRight') return false;
          seen.push('right');
          return true;
        },
        startHidden: true,
        railHoverTime: true,
        closeTitle: null,
        boxButtons: [
          { label: () => (fs ? 'Exit fullscreen' : 'Fullscreen'), icon: () => (fs ? 'fullscreenExit' : 'fullscreen'), onClick: () => (fs = !fs) },
        ],
        onEsc: () => esc++,
      },
    });
    await frame();
    const chrome = root.querySelector('.wc-player-chrome')!;
    expect(chrome.hasAttribute('data-hidden')).toBe(true);
    // No Close button (closeTitle null): the replay's box.
    expect(root.querySelector('[data-act="close"]')).toBeNull();
    expect(root.querySelector('.wc-player-head-left')!.textContent).toBe('SPOT 1 · X');
    // happy-dom has no layout: give the player a size so the hints fit.
    Object.defineProperty(host.el, 'clientWidth', { value: 1200 });
    Object.defineProperty(host.el, 'clientHeight', { value: 800 });
    host.playerView!.refresh();
    await frame();
    const click = root.querySelector<HTMLElement>('.wc-player-hints .wc-player-click')!;
    expect(click.textContent).toBe('←→ Prev/next');
    click.click();
    key('ArrowRight');
    expect(seen).toEqual(['click', 'right']);
    expect(chrome.hasAttribute('data-hidden')).toBe(false); // a key shows the chrome
    key('Escape');
    expect(esc).toBe(1);
    expect(closed()).toBe(0);
    const btn = root.querySelector<HTMLElement>('[data-act="extra"]')!;
    expect(btn.getAttribute('aria-label')).toBe('Fullscreen');
    btn.click();
    expect(fs).toBe(true);
    await frame();
    expect(btn.getAttribute('aria-label')).toBe('Exit fullscreen');
    host.dispose();
    expect(root.querySelector('.wc-player-chrome')).toBeNull();
  });
});

// Stage 42f (ADR 0127): the player core for the run log player (Back,
// h:mm:ss, the open's failure) and the Spotlights viewer (bare, press,
// the Display controls, the palette tweak).

/** One run of `lines` lines, `step` s apart (a gap over 10 s would collapse). */
function longChain(lines: number, step = 5) {
  const items: LogItem[] = [{ at: 0, gmcp: 'Char.Name', json: { name: 'Rasta', fullname: 'Rasta the Ranger' } }];
  for (let i = 1; i <= lines; i++) items.push({ at: i * step, in: `Line ${i}.` });
  return [{ meta: meta('Rasta/long', BASE_US), text: makeLog(BASE_US, items) }];
}

/** happy-dom has no layout: a size for the player, then a redraw. */
async function sized(host: PlayerHost, w = 1200, h = 800): Promise<void> {
  Object.defineProperty(host.el, 'clientWidth', { value: w, configurable: true });
  Object.defineProperty(host.el, 'clientHeight', { value: h, configurable: true });
  host.playerView!.refresh();
  await frame();
}

describe('player core: hours, Back, press', () => {
  it('shows h:mm:ss from one hour with `hours`, MM:SS without (the HTML replay)', async () => {
    const chain = longChain(745); // lines 5 s … 3725 s; the lead-in takes no time: 1:02:00
    const a = open({ view: { hours: true }, autoplay: false }, chain);
    await sized(a.host);
    expect(a.root.querySelector('.wc-player-clock')!.textContent).toBe('00:00 / 1:02:00');
    a.host.engine!.seek(3_700_000);
    a.wall.advance(100);
    await frame();
    expect(a.root.querySelector('.wc-player-clock b')!.textContent).toBe('1:01:40');
    a.host.dispose();
    const b = open({ autoplay: false }, chain);
    await sized(b.host);
    expect(b.root.querySelector('.wc-player-clock')!.textContent).toBe('00:00 / 62:00');
    b.host.dispose();
  });

  it('Back: in the chrome at the top left, calls onEsc (closing a popup first); none by default', async () => {
    const a = open({ view: { back: { title: 'Back to History (Esc)' } } });
    await frame();
    const back = a.root.querySelector<HTMLButtonElement>('.wc-player-chrome > .wc-pv-back')!;
    expect(back).not.toBeNull();
    expect(back.classList.contains('wc-lk-back')).toBe(true);
    expect(back.classList.contains('wc-look')).toBe(true);
    expect(back.title).toBe('Back to History (Esc)');
    expect(back.getAttribute('aria-label')).toBe('Back to History (Esc)');
    expect(back.tabIndex).toBe(-1);
    expect(back.textContent).toBe('Back');
    // The log player's onEsc: the host closes (the shell then shows History).
    back.click();
    expect(a.closed()).toBe(1);
    // A popup open: it closes before onEsc runs.
    let popAtEsc: string | null = 'unset';
    const c = open({ view: { back: { title: 'Back' }, onEsc: () => (popAtEsc = c.host.playerView!.popup) } });
    c.host.playerView!.setPopup('display');
    expect(c.host.playerView!.popup).toBe('display');
    c.root.querySelector<HTMLButtonElement>('.wc-pv-back')!.click();
    expect(popAtEsc).toBeNull();
    c.host.dispose();
    const b = open();
    await frame();
    expect(b.root.querySelector('.wc-pv-back')).toBeNull();
    b.host.dispose();
  });

  it('the header moves right of Back when centred it would meet it', async () => {
    const { root, host } = open({ view: { back: { title: 'Back' } } });
    const back = root.querySelector<HTMLElement>('.wc-pv-back')!;
    Object.defineProperty(back, 'offsetLeft', { value: 10 });
    Object.defineProperty(back, 'offsetWidth', { value: 70 });
    const head = root.querySelector<HTMLElement>('.wc-player-header')!;
    // Wide: centred, clear of Back.
    await sized(host, 1600, 800);
    expect(parseFloat(head.style.left)).toBeGreaterThan(88);
    // Narrow: from Back's right edge (+ its gap), as wide as the rest allows.
    await sized(host, 400, 700);
    expect(parseFloat(head.style.left)).toBe(88);
    expect(parseFloat(head.style.left) + parseFloat(head.style.width)).toBeLessThanOrEqual(400 - 12);
    host.dispose();
  });

  it('press drives the box: play resumes from the cursor line as Space does', async () => {
    const { wall, host } = open({}, longChain(40));
    const v = host.playerView!;
    const eng = host.engine!;
    wall.advance(60_000);
    await frame();
    v.press('play');
    expect(eng.playing).toBe(false);
    v.press('back');
    wall.advance(10);
    expect(Math.round(eng.position / 1000)).toBe(50);
    v.press('fwd');
    wall.advance(10);
    expect(Math.round(eng.position / 1000)).toBe(60);
    v.press('start');
    wall.advance(10);
    expect(eng.position).toBe(0);
    const speed = eng.speed;
    v.press('faster');
    expect(eng.speed).toBeGreaterThan(speed);
    v.press('slower');
    expect(eng.speed).toBe(speed);
    // Paused with the cursor moved up: play seeks to its line first (line n plays at 5·(n − 1) s: the lead-in takes no time).
    v.press('fwd');
    v.press('fwd');
    v.press('fwd');
    wall.advance(10);
    await frame();
    await frame();
    v.moveCursor(-3);
    const line = v.cursorLine!.textContent!;
    expect(line).toMatch(/^Line \d+\.$/);
    v.press('play');
    expect(eng.playing).toBe(true);
    expect(Math.round(eng.position / 1000)).toBe(5 * (Number(/\d+/.exec(line)![0]) - 1));
    host.dispose();
  });
});

describe('player core: the bare view', () => {
  it('draws no chrome, never hides, keeps the keys and the cursor; the stage takes the rail too', async () => {
    const { root, wall, host } = open({ view: { bare: true, hours: true, startHidden: true } }, longChain(40));
    await sized(host);
    const chrome = root.querySelector<HTMLElement>('.wc-player-chrome')!;
    expect(chrome.hasAttribute('data-bare')).toBe(true);
    expect(chrome.children.length).toBe(0);
    for (const sel of ['.wc-player-header', '.wc-player-rail', '.wc-player-marks', '.wc-player-box', '.wc-pc-pop', '.wc-pv-back'])
      expect(root.querySelector(sel)).toBeNull();
    expect(root.querySelector<HTMLElement>('.wc-player-stage')!.style.width).toBe('100%');
    wall.advance(20_000);
    await new Promise((r) => setTimeout(r, 80));
    expect(host.playerView!.chromeShown).toBe(true);
    // The keys stay the view's: Space pauses, ↑ moves the cursor.
    key(' ');
    expect(host.engine!.playing).toBe(false);
    await frame();
    await frame();
    key('ArrowUp');
    expect(host.playerView!.cursorLine).not.toBeNull();
    host.playerView!.press('play');
    expect(host.engine!.playing).toBe(true);
    host.dispose();
  });

  it('lets the keys pass while its root is parked out of sight', async () => {
    const { root, host } = open({ view: { bare: true } });
    await frame();
    root.hidden = true;
    key(' ');
    expect(host.engine!.playing).toBe(true);
    root.hidden = false;
    key(' ');
    expect(host.engine!.playing).toBe(false);
    host.dispose();
  });
});

describe('player core: the viewer controls and the palette tweak', () => {
  it('viewerControls: Display only or with Panes, over the host overrides', () => {
    const { host } = open();
    expect(host.viewerControls(true).panes).toBeUndefined();
    const vc = host.viewerControls(false);
    expect(vc.panes!.list().length).toBeGreaterThan(0);
    vc.setFont('large');
    expect(host.viewerOverrides.font).toBe('large');
    expect(host.viewerControls(true).font()).toBe('large');
    host.dispose();
  });

  it('setPaletteTweak colours ANSI only while the theme is Default', () => {
    const { host } = open();
    const red = () => host.el.style.getPropertyValue('--ansi-1');
    expect(red()).toBe('#800000');
    host.setPaletteTweak({ 1: '#c43c3c' });
    expect(red()).toBe('#c43c3c');
    const vc = host.viewerControls(true);
    vc.setTheme('dark');
    expect(red()).toBe('#800000');
    vc.setTheme('default');
    expect(red()).toBe('#c43c3c');
    host.setPaletteTweak(null);
    expect(red()).toBe('#800000');
    host.dispose();
  });
});

describe('player core: open', () => {
  type Lib = Parameters<PlayerHost['open']>[1];
  type Ses = Parameters<PlayerHost['open']>[0];
  const lib = (chain: Array<{ meta: ReturnType<typeof meta>; text: string }>): Lib =>
    ({ chainLog: async () => chain, events: async () => [] }) as unknown as Lib;
  const session = { character: 'Rasta', runs: [{ runId: 'Rasta/x' }] } as unknown as Ses;

  it('rejects a session whose logs are not stored or empty, and passes the mode on', async () => {
    const { host } = open();
    await expect(host.open(session, lib([]))).rejects.toThrow('The run log is not stored.');
    await expect(host.open(session, lib([{ meta: meta('Rasta/x', BASE_US), text: '' }]))).rejects.toThrow('The run log is empty.');
    await host.open(session, lib(twoRunChain()), { view: { back: { title: 'B' } }, autoplay: false });
    expect(host.engine!.playing).toBe(false);
    expect(host.el.querySelector('.wc-pv-back')).not.toBeNull();
    host.dispose();
  });
});
