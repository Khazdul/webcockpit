// @vitest-environment happy-dom
// Stage 42d (ADR 0127): the one in-game window frame (Lykta) and its look
// hosts. The title and note come from the window's defaults until a frame
// sets them with `useWindowChrome` (the highest caller wins; the chrome
// reverts when it pops); the frame is the same element with the same
// classes whatever is on the stack (no Glass, no `data-look`); Paper by
// `data-light`; the focus dims; look frames run in the place `window`
// (with the kit's tokens and the whole body), old-look frames on a
// whole-cell grid; look frames in the phone's ESC menu run in the place
// `menu`, full screen.
import { IDBFactory } from 'fake-indexeddb';
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type ChromeServices, mountWindows } from '../../src/chrome';
import { MenuStack } from '../../src/chrome';
import { ServicesCtx } from '../../src/chrome/kit/hooks';
import { lookFrame, useLookPlace, useWindowChrome } from '../../src/chrome/kit/look';
import { type Nav, useNav } from '../../src/chrome/kit/stack';
import { WindowFrame, WindowStack } from '../../src/chrome/kit/window';
import { type WindowChromeStore, useWindowChromeOf, windowChromeStore } from '../../src/chrome/kit/window-chrome';
import { windowBody } from '../../src/chrome/kit/window-geom';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1400 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 800 });
});

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  render(null, document.body);
  document.body.innerHTML = '';
});

function services(): ChromeServices {
  const settings = new SettingsStore({ factory: null, storage: null, win: null });
  const cells = new CellMetrics({ measure: () => ({ w: 10, h: 20, px: 15, ls: 0 }), loadFont: async () => {} });
  void cells.update(settings.get().appearance);
  return {
    settings,
    cells,
    profiles: new ProfileStore({ factory: null }),
    version: '9.9.9',
    runs: () => RunLibrary.open(new IDBFactory()),
  };
}

const host = (): HTMLElement => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

// ------------------------------------------------------------ the windows (mountWindows)

describe('the windows: one Lykta frame', () => {
  function open(svc = services()) {
    const el = host();
    const wins = mountWindows(el, svc, {
      status: { get: () => ({}) as never, subscribe: () => () => {} } as never,
      commitProfile: async () => true,
      flushWriteBack: async () => {},
      focusInput: () => {},
    } as never);
    cleanup.push(() => wins.dispose());
    return { el, wins, svc };
  }

  it('draws the frame: brackets, the hood with the title and the note, the X, the body, edges and grip', async () => {
    const { el, wins } = open();
    await act(() => wins.open('scripts'));
    const w = el.querySelector<HTMLElement>('.wc-win[data-win="scripts"]')!;
    expect(w).not.toBeNull();
    expect(w.querySelectorAll('.wc-win-br')).toHaveLength(4);
    expect(w.querySelector('.wc-win-bar .wc-win-hood .wc-win-t')!.textContent).toBe('Scripts');
    expect(w.querySelector('.wc-win-n')).toBeNull();
    expect(w.querySelector('.wc-win-bar .wc-win-x')!.getAttribute('aria-label')).toBe('Close');
    expect(w.querySelector('.wc-win-body > .wc-win-content > .wc-stack')).not.toBeNull();
    expect(w.querySelectorAll('.wc-win-edge')).toHaveLength(8);
    expect(w.querySelector('.wc-win-grip')).not.toBeNull();
    // One frame: no look type.
    expect(w.hasAttribute('data-look')).toBe(false);
    // The old cyan border's parts are gone.
    expect(w.querySelector('.wc-win-title')).toBeNull();
  });

  it('defaults: Profile with the profile name as the note, Scripts', async () => {
    const { el, wins, svc } = open();
    svc.settings.update({ profile: 'gibur' });
    await act(() => wins.open('profile'));
    const w = el.querySelector<HTMLElement>('.wc-win[data-win="profile"]')!;
    expect(w.querySelector('.wc-win-t')!.textContent).toBe('Profile');
    expect(w.querySelector('.wc-win-n')!.textContent).toBe('gibur');
    expect(w.getAttribute('aria-label')).toBe('Profile gibur');
  });

  it('dims without focus and follows the game background (Paper)', async () => {
    const { el, wins, svc } = open();
    await act(() => wins.open('scripts'));
    await act(() => wins.open('profile'));
    const p = el.querySelector<HTMLElement>('.wc-win[data-win="profile"]')!;
    const s = el.querySelector<HTMLElement>('.wc-win[data-win="scripts"]')!;
    expect(p.hasAttribute('data-focused')).toBe(true);
    expect(s.hasAttribute('data-focused')).toBe(false);
    expect(el.querySelector('.wc-windows')!.hasAttribute('data-light')).toBe(false);
    await act(() => svc.settings.update({ appearance: { bg: '#f4ecd8' } }));
    expect(el.querySelector('.wc-windows')!.hasAttribute('data-light')).toBe(true);
  });

  it('puts an old-look root on a whole-cell grid centred in the body', async () => {
    const { el, wins } = open();
    await act(() => wins.open('scripts'));
    const w = el.querySelector<HTMLElement>('.wc-win[data-win="scripts"]')!;
    const f = w.querySelector<HTMLElement>('.wc-frame')!;
    expect(f.classList.contains('wc-win-grid')).toBe(true);
    expect(f.classList.contains('wc-look')).toBe(false);
    // 1400 × 800 px, 10 × 20 px cells: 140 × 40 cells, the default window 112 × 32.
    const b = windowBody({ x: 0, y: 0, w: 112, h: 32 }, 10, 20);
    expect(f.style.width).toBe(`${b.cols * 10}px`);
    expect(f.style.height).toBe(`${b.rows * 20}px`);
    expect(f.style.left).toBe(`${b.left}px`);
  });
});

// ------------------------------------------------------------ a window's stack (the kit)

let nav: Nav | null = null;

const Plain = lookFrame(function Plain(): VNode {
  nav = useNav();
  return <p class="where">{useLookPlace()}</p>;
});

function chromeFrame(title?: string, note?: string, cls = 'chromed') {
  return lookFrame(function Chromed(): VNode {
    nav = useNav();
    useWindowChrome({ ...(title !== undefined ? { title } : {}), ...(note !== undefined ? { note } : {}) });
    return <p class={cls}>{useLookPlace()}</p>;
  });
}

function OldLook(): VNode {
  nav = useNav();
  return <div class="old">old</div>;
}

function Win(p: { store: WindowChromeStore; root: VNode; focused?: boolean }): VNode {
  const set = useWindowChromeOf(p.store);
  const rect = { x: 2, y: 1, w: 80, h: 30 };
  const note = set?.note ?? 'gibur';
  return (
    <WindowFrame
      id="profile"
      title={set?.title ?? 'Profile'}
      {...(note ? { titleNote: note } : {})}
      rect={rect}
      grid={{ cols: 140, rows: 40 }}
      cellW={10}
      cellH={20}
      z={1}
      focused={p.focused ?? true}
      onRect={() => {}}
      onClose={() => {}}
    >
      <WindowStack
        body={windowBody(rect, 10, 20)}
        cellW={10}
        cellH={20}
        root={p.root}
        active={false}
        onRootBack={() => {}}
        chrome={p.store.sink}
      />
    </WindowFrame>
  );
}

function mount(root: VNode, focused = true) {
  const store = windowChromeStore();
  const el = host();
  const svc = services();
  act(() =>
    render(
      <ServicesCtx.Provider value={svc}>
        <div class="wc-windows">
          <Win store={store} root={root} focused={focused} />
        </div>
      </ServicesCtx.Provider>,
      el,
    ),
  );
  cleanup.push(() => render(null, el));
  const w = el.querySelector<HTMLElement>('.wc-win')!;
  return {
    el,
    w,
    title: () => w.querySelector('.wc-win-t')!.textContent,
    note: () => w.querySelector('.wc-win-n')?.textContent ?? null,
  };
}

describe("a window's stack", () => {
  it('runs look frames in the place window, with the tokens, filling the body', () => {
    const { w } = mount(<Plain />);
    expect(w.querySelector('.where')!.textContent).toBe('window');
    const f = w.querySelector<HTMLElement>('.wc-frame')!;
    expect(f.classList.contains('wc-look')).toBe(true);
    expect(f.classList.contains('wc-win-look')).toBe(true);
    expect(f.style.width).toBe('');
  });

  it('shows the defaults until a frame sets the title and note', () => {
    const t = mount(<Plain />);
    expect(t.title()).toBe('Profile');
    expect(t.note()).toBe('gibur');
  });

  it('takes the title and note from the top frame and reverts when it pops', () => {
    const Root = chromeFrame('Profile editor', 'gibur', 'root');
    const t = mount(<Root />);
    expect(t.title()).toBe('Profile editor');
    const before = t.w;
    const classes = t.w.className;
    const Sub = chromeFrame('Import', 'backup.json', 'sub');
    act(() => nav!.push(<Sub />));
    expect(t.title()).toBe('Import');
    expect(t.note()).toBe('backup.json');
    // The window never switches frame when a sub-page opens.
    expect(t.el.querySelector('.wc-win')).toBe(before);
    expect(t.w.className).toBe(classes);
    expect(t.w.hasAttribute('data-look')).toBe(false);
    act(() => nav!.pop());
    expect(t.title()).toBe('Profile editor');
    expect(t.note()).toBe('gibur');
  });

  it('falls back field by field; a frame without the call leaves the chrome as it is', () => {
    const Root = chromeFrame('Scripts page');
    const t = mount(<Root />);
    // Only the title set: the default note stays.
    expect(t.title()).toBe('Scripts page');
    expect(t.note()).toBe('gibur');
    act(() => nav!.push(<Plain />));
    expect(t.title()).toBe('Scripts page');
    const NoNote = chromeFrame('Manual', '');
    act(() => nav!.push(<NoNote />));
    expect(t.title()).toBe('Manual');
    expect(t.note()).toBeNull();
    act(() => nav!.pop(2));
    expect(t.title()).toBe('Scripts page');
  });

  it('reverts to the defaults when the only caller pops', () => {
    const t = mount(<Plain />);
    const Sub = chromeFrame('Export');
    act(() => nav!.push(<Sub />));
    expect(t.title()).toBe('Export');
    act(() => nav!.pop());
    expect(t.title()).toBe('Profile');
  });

  it('puts old-look frames on the whole-cell grid, look frames over the body', () => {
    const t = mount(<OldLook />);
    const f = t.w.querySelector<HTMLElement>('.wc-frame')!;
    expect(f.classList.contains('wc-win-grid')).toBe(true);
    const b = windowBody({ x: 2, y: 1, w: 80, h: 30 }, 10, 20);
    expect(f.style.width).toBe(`${b.cols * 10}px`);
    expect(f.style.top).toBe(`${b.top}px`);
    act(() => nav!.push(<Plain />));
    const top = t.w.querySelector<HTMLElement>('.wc-frame:not([hidden])')!;
    expect(top.classList.contains('wc-win-look')).toBe(true);
    expect(top.querySelector('.where')!.textContent).toBe('window');
  });

  it('dims without focus: no data-focused on the frame', () => {
    const t = mount(<Plain />, false);
    expect(t.w.hasAttribute('data-focused')).toBe(false);
  });

  it('is a no-op outside a window', () => {
    const Lone = chromeFrame('Nowhere');
    const el = host();
    const svc = services();
    expect(() =>
      act(() =>
        render(
          <ServicesCtx.Provider value={svc}>
            <MenuStack root={<Lone />} active={false} onRootBack={() => {}} />
          </ServicesCtx.Provider>,
          el,
        ),
      ),
    ).not.toThrow();
    expect(el.querySelector('.chromed')!.textContent).toBe('menu');
    render(null, el);
  });
});

// ------------------------------------------------------------ the ESC menu host

describe("the phone's ESC menu host", () => {
  function menu(root: VNode, bg?: string) {
    const svc = services();
    if (bg) svc.settings.update({ appearance: { bg } });
    const el = host();
    act(() =>
      render(
        <ServicesCtx.Provider value={svc}>
          <MenuStack root={root} active={false} onRootBack={() => {}} />
        </ServicesCtx.Provider>,
        el,
      ),
    );
    cleanup.push(() => render(null, el));
    return el;
  }

  it('runs look frames in the place menu, full screen, in a .wc-look page', () => {
    const el = menu(<Plain />);
    const f = el.querySelector<HTMLElement>('.wc-frame')!;
    expect(f.classList.contains('wc-menu-look')).toBe(true);
    const page = f.querySelector<HTMLElement>(':scope > .wc-menu-page.wc-look')!;
    expect(page).not.toBeNull();
    expect(page.hasAttribute('data-light')).toBe(false);
    expect(page.querySelector('.where')!.textContent).toBe('menu');
  });

  it('turns Paper on a light game background', () => {
    const el = menu(<Plain />, '#f4ecd8');
    expect(el.querySelector('.wc-menu-page')!.hasAttribute('data-light')).toBe(true);
  });

  it('leaves old-look frames as they were', () => {
    const el = menu(<OldLook />);
    const f = el.querySelector<HTMLElement>('.wc-frame')!;
    expect(f.className).toBe('wc-frame');
    expect(f.querySelector(':scope > .old')).not.toBeNull();
  });
});
