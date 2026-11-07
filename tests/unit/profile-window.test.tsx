// @vitest-environment happy-dom
// Stage 43b (ADR 0128): the profile editor's in-game hosts.
// `profileEditOptions` applies live while connected and tells the editor
// only when the connection flips (not on every status tick); the hosts'
// root page (`ProfileHome`) is empty while the editor's chunk loads, says
// "Opening …" after 300 ms, keeps a failure with Edit (E, Enter) until
// the next try, and closes once the editor is left cleanly.
import { IDBFactory } from 'fake-indexeddb';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStatusListener, AppStatusState } from '../../src/app/status';
import { MenuStack } from '../../src/chrome';
import { type ChromeServices, ServicesCtx } from '../../src/chrome/kit/hooks';
import { type Nav, useNav } from '../../src/chrome/kit/stack';
import { ProfileStore } from '../../src/profiles';
import { RunLibrary } from '../../src/runs/library';
import { SettingsStore } from '../../src/settings';
import { CellMetrics } from '../../src/theme/cells';

const edit = vi.hoisted(() => ({
  calls: 0,
  /** What the next `editProfile` does with the stack. */
  next: null as null | ((nav: Nav) => Promise<void>),
}));

vi.mock('../../src/chrome/frames/profile-edit', () => ({
  editProfile: (nav: Nav) => {
    edit.calls++;
    return edit.next ? edit.next(nav) : Promise.resolve();
  },
}));

const { OPENING_MS, ProfileHome, profileEditOptions } = await import('../../src/chrome/frames/profile-window');

function status(conn: AppStatusState['conn']) {
  let s = { conn, replay: false, character: '', linkMs: null, linkSuspect: false, capture: '', xml: false } as AppStatusState;
  const fns = new Set<AppStatusListener>();
  return {
    get: () => s,
    subscribe: (fn: AppStatusListener) => (fns.add(fn), () => fns.delete(fn)),
    set(p: Partial<AppStatusState>) {
      s = { ...s, ...p };
      for (const f of fns) f(s);
    },
  };
}

describe('profileEditOptions', () => {
  it('is live while connected and calls back only when that flips', () => {
    const st = status('playing');
    const saved: string[] = [];
    const o = profileEditOptions({ status: st }, (n) => saved.push(n));
    expect(o.isLive()).toBe(true);
    let n = 0;
    const off = o.onLiveChange!(() => n++);
    st.set({ linkMs: 40 });
    st.set({ capture: 'recording' });
    expect(n).toBe(0);
    st.set({ conn: 'disconnected' });
    expect(o.isLive()).toBe(false);
    expect(n).toBe(1);
    st.set({ linkMs: 41 });
    expect(n).toBe(1);
    st.set({ conn: 'connecting' });
    expect(n).toBe(2);
    off();
    st.set({ conn: 'disconnected' });
    expect(n).toBe(2);
    o.onSaved?.('x');
    expect(saved).toEqual(['x']);
  });
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

/** A stand-in for the editor: the test leaves it with `leave`. */
function FakeEditor(p: { onNav: (n: Nav) => void }) {
  p.onNav(useNav());
  return <div class="fake-editor">editor</div>;
}

describe('ProfileHome', () => {
  let el: HTMLElement;
  let closed = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    edit.calls = 0;
    edit.next = null;
    closed = 0;
    el = document.createElement('div');
    document.body.append(el);
  });
  afterEach(() => {
    render(null, el);
    el.remove();
    vi.useRealTimers();
  });

  const mount = () =>
    act(() =>
      render(
        <ServicesCtx.Provider value={services()}>
          <MenuStack root={<ProfileHome host={{ status: status('playing') }} close={() => closed++} />} active onRootBack={() => {}} />
        </ServicesCtx.Provider>,
        el,
      ),
    );
  const text = (sel: string) => el.querySelector(sel)?.textContent ?? null;
  const key = (k: string) => act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));

  it('is quiet while the editor loads, then says it is opening', async () => {
    let done!: () => void;
    edit.next = () => new Promise<void>((r) => (done = r));
    mount();
    expect(edit.calls).toBe(1);
    expect(text('.wc-pw-name')).toBe('default');
    expect(text('.wc-pw-opening')).toBe('');
    expect(el.querySelector('[data-btn="EDIT"]')).toBeNull();
    await act(() => void vi.advanceTimersByTime(OPENING_MS));
    expect(text('.wc-pw-opening')).toBe('Opening default…');
    await act(async () => done());
    expect(el.querySelector('.wc-pw-opening')).toBeNull();
  });

  it('keeps a failure with Edit until the next try; E and Enter try again', async () => {
    edit.next = async (nav) => nav.flash('No profile "default".', 'fail');
    mount();
    await act(async () => {});
    expect(text('.wc-pw-flash')).toBe('No profile "default".');
    expect(el.querySelector('[data-btn="EDIT"]')).not.toBeNull();
    // The stack's flash fades after 3 s; the page keeps the failure.
    await act(() => void vi.advanceTimersByTime(5000));
    expect(text('.wc-pw-flash')).toBe('No profile "default".');
    edit.next = async () => {};
    key('e');
    await act(async () => {});
    expect(edit.calls).toBe(2);
    expect(text('.wc-pw-flash')).toBe('');
    key('Enter');
    await act(async () => {});
    expect(edit.calls).toBe(3);
    expect(closed).toBe(0);
  });

  it('closes once the editor is left cleanly, and stays after a failure', async () => {
    let editorNav: Nav | null = null;
    edit.next = async (nav) => nav.push(<FakeEditor onNav={(n) => (editorNav = n)} />);
    mount();
    await act(async () => {});
    expect(text('.fake-editor')).toBe('editor');
    // A failure to show (a save that failed): the page stays, with Edit.
    act(() => {
      editorNav!.flash('Changes to default were not saved.', 'fail');
      editorNav!.pop();
    });
    expect(closed).toBe(0);
    expect(text('.wc-pw-flash')).toBe('Changes to default were not saved.');
    // Edit again, then a clean leave: the host closes.
    key('e');
    await act(async () => {});
    expect(text('.fake-editor')).toBe('editor');
    act(() => editorNav!.pop());
    expect(closed).toBe(1);
  });
});
