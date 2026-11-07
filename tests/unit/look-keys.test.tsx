// @vitest-environment happy-dom
// Stage 42c (ADR 0127): the lantern kit's cursors (`useListCursor`,
// `useGridCursor`), the button zone, `letterAction` in and out of text
// fields, and the dialog's keys (an overlay frame and an inline layer).
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  type ButtonZone,
  type ListCursor,
  letterAction,
  lookFrame,
  openKeyHelp,
  useButtonZone,
  useGridCursor,
  useListCursor,
} from '../../src/chrome/kit/look';
import { type NavKey, navKey } from '../../src/chrome/kit/nav';
import { FrameStack, useKeys, useNav } from '../../src/chrome/kit/stack';

afterEach(() => render(null, document.body));

const ev = (key: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
/** Sends `key` to a hook's `key()` (as a frame's handler would), inside act. */
const press = async (h: { key(e: KeyboardEvent, nk: NavKey | null): boolean }, key: string, init: KeyboardEventInit = {}): Promise<boolean> => {
  let r = false;
  await act(async () => {
    const e = ev(key, init);
    r = h.key(e, navKey(e));
  });
  return r;
};
const winKey = (key: string, init: KeyboardEventInit = {}) => window.dispatchEvent(ev(key, init));
const pointer = (type: string, pointerType: string): Event => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'pointerType', { value: pointerType });
  return e;
};

// ------------------------------------------------------------ list cursor

function List(p: { count: number; opts?: object; out: { c?: ListCursor }; log: string[] }) {
  const c = useListCursor({
    count: p.count,
    onChange: (i) => p.log.push(`change ${i}`),
    onActivate: (i) => p.log.push(`activate ${i}`),
    ...p.opts,
  });
  p.out.c = c;
  return (
    <ul ref={c.scrollRef as never}>
      {Array.from({ length: p.count }, (_, i) => (
        <li key={i} {...c.rowProps(i)} class={i === c.i ? 'is-on' : ''}>
          {i}
        </li>
      ))}
    </ul>
  );
}

async function mountList(count: number, opts: object = {}) {
  const out: { c?: ListCursor } = {};
  const log: string[] = [];
  const scrolled: number[] = [];
  await act(async () => {
    render(<List count={count} opts={opts} out={out} log={log} />, document.body);
  });
  for (const li of document.querySelectorAll<HTMLElement>('li')) {
    li.scrollIntoView = () => void scrolled.push(Number(li.dataset.i));
  }
  return { cur: () => out.c!, log, scrolled, row: (i: number) => document.querySelector<HTMLElement>(`li[data-i="${i}"]`)! };
}

describe('useListCursor', () => {
  it('moves with ↑ ↓ PgUp PgDn Home End, clamps, and activates on Enter / Space', async () => {
    const l = await mountList(25);
    expect(l.cur().i).toBe(0);
    expect(await press(l.cur(), 'ArrowUp')).toBe(true);
    expect(l.cur().i).toBe(0);
    await press(l.cur(), 'ArrowDown');
    await press(l.cur(), 'PageDown');
    expect(l.cur().i).toBe(11);
    await press(l.cur(), 'End');
    expect(l.cur().i).toBe(24);
    await press(l.cur(), 'PageDown');
    expect(l.cur().i).toBe(24);
    await press(l.cur(), 'PageUp');
    expect(l.cur().i).toBe(14);
    await press(l.cur(), 'Home');
    expect(l.cur().i).toBe(0);
    await press(l.cur(), 'Enter');
    await press(l.cur(), ' ');
    expect(l.log).toEqual(['change 1', 'change 11', 'change 24', 'change 14', 'change 0', 'activate 0', 'activate 0']);
    expect(await press(l.cur(), 'ArrowLeft')).toBe(false);
    expect(await press(l.cur(), 'x')).toBe(false);
  });

  it('wraps with `wrap`, uses `page` and `initial`, and stays inside a shrinking list', async () => {
    const l = await mountList(5, { wrap: true, page: 2, initial: 4 });
    expect(l.cur().i).toBe(4);
    await press(l.cur(), 'ArrowDown');
    expect(l.cur().i).toBe(0);
    await press(l.cur(), 'ArrowUp');
    expect(l.cur().i).toBe(4);
    await press(l.cur(), 'PageUp');
    expect(l.cur().i).toBe(2);
    await act(async () => {
      render(<List count={2} out={{}} log={[]} />, document.body);
    });
    expect(document.querySelector('li.is-on')!.textContent).toBe('1');
  });

  it('a key scrolls the cursor into view; a pointer move moves it without scrolling; touch never hovers', async () => {
    const l = await mountList(10);
    await press(l.cur(), 'ArrowDown');
    expect(l.scrolled).toEqual([1]);
    await act(async () => {
      l.row(6).dispatchEvent(pointer('pointermove', 'mouse'));
    });
    expect(l.cur().i).toBe(6);
    await act(async () => {
      l.row(3).dispatchEvent(pointer('pointermove', 'touch'));
    });
    expect(l.cur().i).toBe(6);
    expect(l.scrolled).toEqual([1]);
  });

  it('activateOn click: a mouse click moves and activates; a tap activates (tap-activates)', async () => {
    const l = await mountList(5);
    await act(async () => {
      l.row(2).dispatchEvent(pointer('pointerdown', 'mouse'));
      l.row(2).click();
    });
    expect(l.log).toEqual(['change 2', 'activate 2']);
    l.log.length = 0;
    await act(async () => {
      l.row(4).dispatchEvent(pointer('pointerdown', 'touch'));
      l.row(4).click();
    });
    expect(l.log).toEqual(['change 4', 'activate 4']);
  });

  it('tap-selects: the first tap moves the cursor, a tap on the cursor row activates; a double tap never twice', async () => {
    const l = await mountList(5, { touch: 'tap-selects' });
    const tap = async (i: number) =>
      act(async () => {
        l.row(i).dispatchEvent(pointer('pointerdown', 'touch'));
        l.row(i).click();
      });
    await tap(3);
    expect(l.log).toEqual(['change 3']);
    await tap(3);
    expect(l.log).toEqual(['change 3', 'activate 3']);
    await act(async () => {
      l.row(3).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(l.log).toEqual(['change 3', 'activate 3']);
  });

  it('activateOn dblclick: a click selects, a double click activates; touch defaults to tap-selects', async () => {
    const l = await mountList(5, { activateOn: 'dblclick' });
    await act(async () => {
      l.row(1).dispatchEvent(pointer('pointerdown', 'mouse'));
      l.row(1).click();
    });
    expect(l.log).toEqual(['change 1']);
    await act(async () => {
      l.row(1).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(l.log).toEqual(['change 1', 'activate 1']);
    l.log.length = 0;
    await act(async () => {
      l.row(2).dispatchEvent(pointer('pointerdown', 'touch'));
      l.row(2).click();
    });
    expect(l.log).toEqual(['change 2']);
  });
});

// ------------------------------------------------------------ grid cursor

function Grid(p: { count: number; cols: number; out: { c?: ListCursor }; wrap?: boolean }) {
  p.out.c = useGridCursor({ count: p.count, columns: () => p.cols, page: 8, ...(p.wrap ? { wrap: true } : {}) });
  return null;
}

describe('useGridCursor', () => {
  it('walks a wrapping grid in two dimensions', async () => {
    const out: { c?: ListCursor } = {};
    await act(async () => {
      render(<Grid count={10} cols={4} out={out} />, document.body);
    });
    const at = () => out.c!.i;
    await press(out.c!, 'ArrowRight');
    expect(at()).toBe(1);
    await press(out.c!, 'ArrowDown');
    expect(at()).toBe(5);
    // ↓ onto the shorter last row: its last item.
    await press(out.c!, 'ArrowRight');
    await press(out.c!, 'ArrowRight');
    await press(out.c!, 'ArrowDown');
    expect(at()).toBe(9);
    await press(out.c!, 'ArrowDown');
    expect(at()).toBe(9);
    await press(out.c!, 'ArrowUp');
    expect(at()).toBe(5);
    await press(out.c!, 'ArrowLeft');
    expect(at()).toBe(4);
    // ← → cross the row ends.
    await press(out.c!, 'ArrowLeft');
    expect(at()).toBe(3);
    // PgUp / PgDn: `page` items in whole rows (8 / 4 = two rows).
    await press(out.c!, 'PageDown');
    expect(at()).toBe(9);
    await press(out.c!, 'PageUp');
    expect(at()).toBe(1);
    await press(out.c!, 'End');
    expect(at()).toBe(9);
    await press(out.c!, 'Home');
    expect(at()).toBe(0);
    await press(out.c!, 'ArrowLeft');
    expect(at()).toBe(0);
  });

  it('wraps around the ends with `wrap`', async () => {
    const out: { c?: ListCursor } = {};
    await act(async () => {
      render(<Grid count={6} cols={3} out={out} wrap />, document.body);
    });
    await press(out.c!, 'ArrowLeft');
    expect(out.c!.i).toBe(5);
    await press(out.c!, 'ArrowRight');
    expect(out.c!.i).toBe(0);
  });
});

// ------------------------------------------------------------ button zone

function Zone(p: { out: { z?: ButtonZone }; enabled: (id: string) => boolean; wrap?: boolean; pressed: string[] }) {
  p.out.z = useButtonZone({
    ids: ['A', 'B', 'C', 'D'],
    enabled: p.enabled,
    ...(p.wrap ? { wrap: true } : {}),
    press: (id) => p.pressed.push(id),
  });
  return null;
}

describe('useButtonZone', () => {
  it('Tab rings the list and the enabled buttons; ← → walk them and stop at the ends; Enter presses', async () => {
    const out: { z?: ButtonZone } = {};
    const pressed: string[] = [];
    const enabled = (id: string) => id !== 'B';
    await act(async () => {
      render(<Zone out={out} enabled={enabled} pressed={pressed} />, document.body);
    });
    const z = () => out.z!;
    expect(z().zone).toBe('list');
    expect(await press(z(), 'ArrowRight')).toBe(false);
    expect(await press(z(), 'Enter')).toBe(false);
    await press(z(), 'Tab');
    expect([z().zone, z().sel]).toEqual(['buttons', 'A']);
    await press(z(), 'Tab');
    expect(z().sel).toBe('C');
    await press(z(), 'ArrowRight');
    expect(z().sel).toBe('D');
    await press(z(), 'ArrowRight');
    expect(z().sel).toBe('D');
    await press(z(), 'ArrowUp');
    expect(z().sel).toBe('C');
    await press(z(), 'Enter');
    expect(pressed).toEqual(['C']);
    await press(z(), 'Tab');
    await press(z(), 'Tab');
    expect(z().zone).toBe('list');
    await press(z(), 'Tab', { shiftKey: true });
    expect(z().sel).toBe('D');
    await act(async () => z().reset());
    expect(z().zone).toBe('list');
  });

  it('wraps with `wrap`, and hands the keyboard on when its button becomes disabled', async () => {
    const out: { z?: ButtonZone } = {};
    let off = '';
    const enabled = (id: string) => id !== off;
    await act(async () => {
      render(<Zone out={out} enabled={enabled} pressed={[]} wrap />, document.body);
    });
    await press(out.z!, 'Tab');
    await press(out.z!, 'ArrowLeft');
    expect(out.z!.sel).toBe('D');
    await press(out.z!, 'ArrowLeft');
    expect(out.z!.sel).toBe('C');
    off = 'C';
    await act(async () => {
      render(<Zone out={out} enabled={enabled} pressed={[]} wrap />, document.body);
    });
    expect(out.z!.sel).toBe('D');
  });
});

// ------------------------------------------------------------ letters

describe('letterAction', () => {
  it('fires outside text fields only, without Ctrl / Alt / Meta, in either case', () => {
    const fired: string[] = [];
    const map = { n: () => fired.push('n'), X: () => fired.push('x') };
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    const div = document.createElement('div');
    document.body.append(input, area, div);
    const at = (el: Element, key: string, init: KeyboardEventInit = {}) => {
      let r = false;
      el.addEventListener('keydown', (e) => (r = letterAction(e as KeyboardEvent, map)), { once: true });
      el.dispatchEvent(ev(key, init));
      return r;
    };
    expect(at(div, 'n')).toBe(true);
    expect(at(div, 'N', { shiftKey: true })).toBe(true);
    expect(at(div, 'x')).toBe(true);
    expect(at(div, 'q')).toBe(false);
    expect(at(div, 'n', { ctrlKey: true })).toBe(false);
    expect(at(div, 'n', { altKey: true })).toBe(false);
    expect(at(input, 'n')).toBe(false);
    expect(at(area, 'n')).toBe(false);
    expect(fired).toEqual(['n', 'n', 'x']);
  });
});

// ------------------------------------------------------------ the dialog's keys

describe('Dialog keys', () => {
  it('an overlay dialog: letters, Tab / ← → walk, Enter the walked button, Esc cancels; the page gets nothing', async () => {
    const log: string[] = [];
    let nav!: ReturnType<typeof useNav>;
    const Ask = lookFrame(function Ask() {
      const n = useNav();
      const done = (s: string) => {
        log.push(s);
        n.pop();
      };
      return (
        <Dialog
          title="Delete"
          dlg="ask"
          onCancel={() => done('cancel')}
          buttons={[
            { id: 'YES', label: 'Yes', letter: 'y', primary: true, run: () => done('yes') },
            { id: 'OFF', label: 'Off', letter: 'o', disabled: true, run: () => done('off') },
            { id: 'NO', label: 'No', letter: 'n', run: () => done('no') },
          ]}
        >
          Sure?
        </Dialog>
      );
    });
    function Page() {
      nav = useNav();
      useKeys((e) => (log.push(`page:${e.key}`), true));
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    const open = () => act(async () => nav.push(<Ask />, { overlay: true }));
    const dlg = () => document.querySelector('.wc-lk-dialog[data-dlg="ask"]');
    const sel = () => document.querySelector('.wc-lk-dialog .wc-lk-btn.is-sel')?.getAttribute('data-btn') ?? null;
    await open();
    expect(dlg()).not.toBeNull();
    expect(dlg()!.getAttribute('role')).toBe('dialog');
    expect(sel()).toBeNull();
    winKey('[');
    winKey('o'); // disabled: no run
    expect(log).toEqual([]);
    await act(async () => void winKey('Enter'));
    expect(log).toEqual(['yes']);
    await open();
    await act(async () => void winKey('Tab'));
    expect(sel()).toBe('NO');
    await act(async () => void winKey('ArrowRight'));
    expect(sel()).toBe('NO');
    await act(async () => void winKey('ArrowLeft'));
    expect(sel()).toBe('YES');
    await act(async () => void winKey('Tab', { shiftKey: true }));
    expect(sel()).toBe('NO');
    await act(async () => void winKey('Enter'));
    expect(log).toEqual(['yes', 'no']);
    await open();
    await act(async () => void winKey('n'));
    await open();
    await act(async () => void winKey('Escape'));
    expect(log).toEqual(['yes', 'no', 'no', 'cancel']);
    expect(dlg()).toBeNull();
  });

  it('a field in a dialog keeps its letters; Enter presses the primary, Esc cancels', async () => {
    const log: string[] = [];
    let nav!: ReturnType<typeof useNav>;
    const Ask = lookFrame(function Ask() {
      const n = useNav();
      const [v, setV] = useState('');
      return (
        <Dialog
          title="Name"
          dlg="name"
          onCancel={() => (log.push('cancel'), n.pop())}
          buttons={[
            { id: 'OK', label: 'OK', primary: true, run: () => (log.push(`ok ${v}`), n.pop()) },
            { id: 'CANCEL', label: 'Cancel', letter: 'c', run: () => (log.push('c'), n.pop()) },
          ]}
        >
          <input class="nm" value={v} onInput={(e) => setV(e.currentTarget.value)} />
        </Dialog>
      );
    });
    function Page() {
      nav = useNav();
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    await act(async () => nav.push(<Ask />, { overlay: true }));
    const input = document.querySelector<HTMLInputElement>('.nm')!;
    input.focus();
    const c = ev('c');
    input.dispatchEvent(c);
    expect(c.defaultPrevented).toBe(false);
    expect(log).toEqual([]);
    await act(async () => {
      input.value = 'abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => void input.dispatchEvent(ev('Enter')));
    expect(log).toEqual(['ok abc']);
    await act(async () => nav.push(<Ask />, { overlay: true }));
    const again = document.querySelector<HTMLInputElement>('.nm')!;
    again.focus();
    await act(async () => void again.dispatchEvent(ev('Escape')));
    expect(log).toEqual(['ok abc', 'cancel']);
  });

  it('an inline dialog is a key layer: the page waits; its own field keeps its keys', async () => {
    const log: string[] = [];
    let setOpen!: (on: boolean) => void;
    function Page() {
      const [open, set] = useState(true);
      setOpen = set;
      useKeys((e) => (log.push(`page:${e.key}`), true));
      return (
        <div>
          {open && (
            <Dialog
              inline
              title="Apply?"
              dlg="inline"
              onCancel={() => (log.push('cancel'), set(false))}
              buttons={[{ id: 'A', label: 'Apply', letter: 'a', primary: true, run: () => (log.push('apply'), set(false)) }]}
            >
              <input class="f" />
            </Dialog>
          )}
        </div>
      );
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    winKey('[');
    winKey('x');
    expect(log).toEqual([]);
    const f = document.querySelector<HTMLInputElement>('.f')!;
    f.focus();
    const typed = ev('a');
    f.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect(log).toEqual([]);
    await act(async () => void f.dispatchEvent(ev('Escape')));
    expect(log).toEqual(['cancel']);
    winKey('x');
    expect(log).toEqual(['cancel', 'page:x']);
    await act(async () => setOpen(true));
    await act(async () => void winKey('a'));
    expect(log).toEqual(['cancel', 'page:x', 'apply']);
  });

  it('openKeyHelp: an overlay keys box that any key closes', async () => {
    let nav!: ReturnType<typeof useNav>;
    function Page() {
      nav = useNav();
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    await act(async () => openKeyHelp(nav, 'Keys', [['↑ ↓', 'Move'], ['Esc', 'Back']]));
    const box = document.querySelector('.wc-lk-dialog[data-dlg="keys"]')!;
    expect(box.querySelectorAll('dt')).toHaveLength(2);
    expect(box.querySelector('dd')!.textContent).toBe('Move');
    expect(nav.depth()).toBe(2);
    await act(async () => void winKey('Shift'));
    expect(nav.depth()).toBe(2);
    await act(async () => void winKey('x'));
    expect(nav.depth()).toBe(1);
  });
});
