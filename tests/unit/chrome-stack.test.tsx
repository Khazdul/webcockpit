// @vitest-environment happy-dom
// The frame stack's window mode (ADR 0103): one key owner at a time, no
// focus trap, and the close request through a frame's unsaved prompt.
// Stage 42c (ADR 0127): overlay frames, the hold, key layers, the Esc rule.
import { type VNode, render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { isLookFrame, lookFrame } from '../../src/chrome/kit/look';
import {
  FrameStack,
  type StackControl,
  isBrowserShortcut,
  useFlash,
  useKeyLayer,
  useKeys,
  useNav,
  usePlayerKeys,
  useUnsaved,
} from '../../src/chrome/kit/stack';

const key = (k: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Renders (microtasks) and the stack's close steps (timers) run. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

afterEach(() => render(null, document.body));

function Logger(p: { log: string[]; name: string }) {
  useKeys((e) => {
    p.log.push(`${p.name}:${e.key}`);
    return true;
  });
  return <div />;
}

describe('FrameStack windows (ADR 0103)', () => {
  it('hands a key to the most recently activated stack only', async () => {
    const log: string[] = [];
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    await act(async () => {
      render(<FrameStack root={<Logger log={log} name="a" />} active />, a);
    });
    await act(async () => {
      render(<FrameStack root={<Logger log={log} name="b" />} active trap={false} />, b);
    });
    key('x');
    expect(log).toEqual(['b:x']);
    await act(async () => {
      render(<FrameStack root={<Logger log={log} name="b" />} active={false} trap={false} />, b);
    });
    key('y');
    expect(log).toEqual(['b:x', 'a:y']);
    await act(async () => {
      render(null, a);
    });
    key('z');
    expect(log).toEqual(['b:x', 'a:y']);
    render(null, b);
  });

  it('does not trap the focus with trap={false}', async () => {
    const input = document.createElement('input');
    const host = document.createElement('div');
    document.body.append(input, host);
    await act(async () => {
      render(<FrameStack root={<div />} active trap={false} />, host);
    });
    input.focus();
    await act(async () => {});
    expect(document.activeElement).toBe(input);
    render(null, host);
  });

  it('the close request goes through a frame’s prompt: Keep editing drops it, Discard goes on to the root', async () => {
    let ctl: StackControl | null = null;
    let closed = 0;
    let edits = 0;
    function Editor() {
      const nav = useNav();
      const [prompt, setPrompt] = useState(false);
      useUnsaved(() => edits > 0, prompt);
      useKeys((e, nk) => {
        if (prompt) {
          if (e.key === 'n') nav.pop();
          else if (nk === 'back') setPrompt(false);
          return true;
        }
        if (nk === 'back') {
          if (edits > 0) setPrompt(true);
          else nav.pop();
          return true;
        }
        return false;
      });
      return <div class="ed">{prompt ? 'prompt' : 'editing'}</div>;
    }
    function Root() {
      const nav = useNav();
      useKeys((_e, nk) => {
        if (nk === 'activate') nav.push(<Editor />);
        return nk === 'activate';
      });
      return <div class="root" />;
    }
    await act(async () => {
      render(
        <FrameStack root={<Root />} active trap={false} onRootBack={() => closed++} control={(c) => (ctl = c)} />,
        document.body,
      );
    });
    key('Enter');
    await settle();
    edits = 1;
    expect(ctl!.unsaved()).toBe(true);
    ctl!.requestClose();
    await settle();
    expect(document.querySelector('.ed')!.textContent).toBe('prompt');
    expect(ctl!.prompting()).toBe(true);
    expect(closed).toBe(0);
    // Keep editing: the request is dropped; a later pop does not close.
    key('Escape');
    await settle();
    expect(document.querySelector('.ed')!.textContent).toBe('editing');
    edits = 0;
    key('Escape');
    await settle();
    expect(document.querySelector('.ed')).toBeNull();
    expect(closed).toBe(0);
    // Again with changes: Discard goes on to the root, which closes.
    key('Enter');
    await settle();
    edits = 1;
    ctl!.requestClose();
    await settle();
    key('n');
    await settle();
    expect(closed).toBe(1);
  });

  it('a clean stack closes at once, frame by frame', async () => {
    let ctl: StackControl | null = null;
    let closed = 0;
    function Sub() {
      return <div class="sub" />;
    }
    function Root() {
      const nav = useNav();
      useKeys((_e, nk) => {
        if (nk === 'activate') nav.push(<Sub />);
        return nk === 'activate';
      });
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Root />} active={false} onRootBack={() => closed++} control={(c) => (ctl = c)} />, document.body);
    });
    await act(async () => {
      render(<FrameStack root={<Root />} active onRootBack={() => closed++} control={(c) => (ctl = c)} />, document.body);
    });
    key('Enter');
    await settle();
    expect(document.querySelector('.sub')).not.toBeNull();
    ctl!.requestClose();
    await settle();
    expect(closed).toBe(1);
  });
});

// ------------------------------------------------------------ stage 42c (ADR 0127)

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const frames = () => [...document.querySelectorAll<HTMLElement>('.wc-stack > .wc-frame')];
const keyIn = (el: Element, k: string, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));

describe('FrameStack overlays, the hold, key layers and the Esc rule (stage 42c)', () => {
  it('an overlay keeps the frame below drawn and inert, takes the keys, and the page keeps the flash', async () => {
    const log: string[] = [];
    let nav!: ReturnType<typeof useNav>;
    function Page() {
      nav = useNav();
      const f = useFlash();
      useKeys((e) => (log.push(`page:${e.key}`), true));
      return <div class="page">{f?.text ?? ''}</div>;
    }
    function Over() {
      const f = useFlash();
      const n = useNav();
      useKeys((e, nk) => {
        log.push(`over:${e.key}`);
        if (e.key === 'y') {
          n.flash('Done');
          n.pop();
        }
        return nk !== 'back';
      });
      return <div class="over">{f?.text ?? 'no flash'}</div>;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    await act(async () => nav.push(<Over />, { overlay: true }));
    const [below, over] = frames();
    expect(over!.hasAttribute('hidden')).toBe(false);
    expect(over!.hasAttribute('data-overlay')).toBe(true);
    // Drawn (data-under) but still `hidden`, so `.wc-frame:not([hidden])` is the top frame only.
    expect(below!.hasAttribute('data-under')).toBe(true);
    expect(below!.hasAttribute('hidden')).toBe(true);
    expect(below!.inert || below!.hasAttribute('inert')).toBe(true);
    expect(document.querySelectorAll('.wc-frame:not([hidden])')).toHaveLength(1);
    expect(document.querySelector('.wc-stack')!.classList.contains('has-overlay')).toBe(true);
    key('x');
    expect(log).toEqual(['over:x']);
    expect(document.querySelector('.over')!.textContent).toBe('no flash');
    await act(async () => {
      key('y');
    });
    expect(frames()).toHaveLength(1);
    expect(document.querySelector('.page')!.textContent).toBe('Done');
    expect(frames()[0]!.hasAttribute('data-under')).toBe(false);
    expect(frames()[0]!.inert === true || frames()[0]!.hasAttribute('inert')).toBe(false);
    // An unhandled Esc on an overlay pops it, as on any frame.
    await act(async () => nav.push(<Over />, { overlay: true }));
    await act(async () => {
      key('Escape');
    });
    expect(frames()).toHaveLength(1);
  });

  it('a normal push clears the flash, an overlay push keeps it on the page', async () => {
    let nav!: ReturnType<typeof useNav>;
    function Page() {
      nav = useNav();
      return <div class="page">{useFlash()?.text ?? ''}</div>;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    await act(async () => nav.flash('Hello'));
    await act(async () => nav.push(<div />, { overlay: true }));
    expect(document.querySelector('.page')!.textContent).toBe('Hello');
    await act(async () => nav.pop());
    await act(async () => nav.push(<div />));
    await act(async () => nav.pop());
    expect(document.querySelector('.page')!.textContent).toBe('');
  });

  it('the hold keeps the frame below a push drawn, and a popped frame mounted, for the asked ms', async () => {
    const asked: string[] = [];
    let nav!: ReturnType<typeof useNav>;
    let mounts = 0;
    let unmounts = 0;
    const log: string[] = [];
    function A() {
      nav = useNav();
      useKeys((e) => (log.push(`a:${e.key}`), true));
      return <div class="a" />;
    }
    function B() {
      useEffect(() => {
        mounts++;
        return () => void unmounts++;
      }, []);
      useKeys((e) => (log.push(`b:${e.key}`), e.key !== 'Escape'));
      return <div class="b" />;
    }
    const name = (n: VNode) => (n.type as { name: string }).name;
    const hold = (from: VNode, to: VNode, dir: 'push' | 'pop') => {
      asked.push(`${dir} ${name(from)}>${name(to)}`);
      return 40;
    };
    await act(async () => {
      render(<FrameStack root={<A />} active hold={hold} />, document.body);
    });
    await act(async () => nav.push(<B />));
    expect(asked).toEqual(['push A>B']);
    let [a, b] = frames();
    expect(a!.getAttribute('data-held')).toBe('push');
    expect(a!.hasAttribute('inert') || a!.inert === true).toBe(true);
    expect(b!.hasAttribute('hidden')).toBe(false);
    await act(() => wait(60));
    [a] = frames();
    expect(a!.hasAttribute('data-held')).toBe(false);
    expect(a!.hasAttribute('hidden')).toBe(true);
    // The pop: B stays mounted (the same instance), inert and out of the key path, then goes.
    await act(async () => {
      key('Escape');
    });
    expect(asked).toEqual(['push A>B', 'pop B>A']);
    const fs = frames();
    expect(fs).toHaveLength(2);
    expect(fs[1]!.getAttribute('data-held')).toBe('pop');
    expect(fs[1]!.hasAttribute('inert') || fs[1]!.inert === true).toBe(true);
    expect(fs[0]!.hasAttribute('hidden')).toBe(false);
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    key('x');
    expect(log).toEqual(['b:Escape', 'a:x']);
    await act(() => wait(60));
    expect(frames()).toHaveLength(1);
    expect(unmounts).toBe(1);
    // Overlays ask nothing.
    await act(async () => nav.push(<div />, { overlay: true }));
    await act(async () => nav.pop());
    expect(asked).toHaveLength(2);
  });

  it('a Back during the push hold ends it: the frame below is the top again at once', async () => {
    let nav!: ReturnType<typeof useNav>;
    function A() {
      nav = useNav();
      return <div class="a" />;
    }
    await act(async () => {
      render(<FrameStack root={<A />} active hold={() => 200} />, document.body);
    });
    await act(async () => nav.push(<div class="b" />));
    await act(async () => nav.pop());
    const fs = frames();
    expect(fs[0]!.hasAttribute('hidden')).toBe(false);
    expect(fs[0]!.hasAttribute('data-held')).toBe(false);
    expect(fs[1]!.getAttribute('data-held')).toBe('pop');
  });

  it('key layers get the keys before the frame, the most recent first, while active', async () => {
    const log: string[] = [];
    let setB!: (on: boolean) => void;
    function Layer(p: { name: string; eat: string; active?: boolean }) {
      useKeyLayer((e) => {
        log.push(`${p.name}:${e.key}`);
        return e.key === p.eat;
      }, p.active ?? true);
      return null;
    }
    function Page() {
      const [b, set] = useState(true);
      setB = set;
      useKeys((e) => (log.push(`page:${e.key}`), true));
      return (
        <div>
          <Layer name="a" eat="1" />
          <Layer name="b" eat="2" active={b} />
        </div>
      );
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    key('2');
    expect(log).toEqual(['b:2']);
    log.length = 0;
    key('1');
    expect(log).toEqual(['b:1', 'a:1']);
    log.length = 0;
    key('3');
    expect(log).toEqual(['b:3', 'a:3', 'page:3']);
    log.length = 0;
    await act(async () => setB(false));
    key('2');
    expect(log).toEqual(['a:2', 'page:2']);
  });

  it('the Esc rule: in a look frame an Esc in a text field blurs it and does not pop; old-look frames pop', async () => {
    let nav!: ReturnType<typeof useNav>;
    let backs = 0;
    const saves: string[] = [];
    function Root() {
      nav = useNav();
      return <div />;
    }
    const LookPage = lookFrame(function LookPage() {
      useKeys((e) => {
        if (e.ctrlKey && e.key === 's') return saves.push('look') > 0;
        return false;
      });
      return <input class="look-field" />;
    });
    function OldPage() {
      return <input class="old-field" />;
    }
    await act(async () => {
      render(<FrameStack root={<Root />} active onRootBack={() => backs++} />, document.body);
    });
    await act(async () => nav.push(<LookPage />));
    const field = document.querySelector<HTMLInputElement>('.look-field')!;
    field.focus();
    expect(document.activeElement).toBe(field);
    // Ctrl+S from the field reaches the frame's handler.
    keyIn(field, 's', { ctrlKey: true });
    expect(saves).toEqual(['look']);
    await act(async () => {
      keyIn(field, 'Escape');
    });
    expect(document.activeElement).toBe(document.querySelector('.wc-stack'));
    expect(nav.depth()).toBe(2);
    // The second Esc (the field let go) goes back.
    await act(async () => {
      key('Escape');
    });
    expect(nav.depth()).toBe(1);
    // An old-look frame: Esc in its field pops at once.
    await act(async () => nav.push(<OldPage />));
    const old = document.querySelector<HTMLInputElement>('.old-field')!;
    old.focus();
    await act(async () => {
      keyIn(old, 'Escape');
    });
    expect(nav.depth()).toBe(1);
    expect(backs).toBe(0);
  });

  it('a focused select keeps its arrows (not prevented, not the frame’s); Esc gives the focus back', async () => {
    let nav!: ReturnType<typeof useNav>;
    const seen: string[] = [];
    function Root() {
      nav = useNav();
      return <div />;
    }
    const LookPage = lookFrame(function LookPage() {
      useKeys((e) => (seen.push(e.key), e.key !== 'Escape'));
      return (
        <select class="sel">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      );
    });
    await act(async () => {
      render(<FrameStack root={<Root />} active />, document.body);
    });
    await act(async () => nav.push(<LookPage />));
    const sel = document.querySelector<HTMLSelectElement>('.sel')!;
    sel.focus();
    for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End', ' ']) {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
      sel.dispatchEvent(ev);
      expect(ev.defaultPrevented, k).toBe(false);
    }
    expect(seen).toEqual([]);
    await act(async () => {
      keyIn(sel, 'Escape');
    });
    expect(document.activeElement).toBe(document.querySelector('.wc-stack'));
    expect(nav.depth()).toBe(2);
  });

  it('the Esc rule knows look frames by lookFrame’s own mark (the two stay in step)', async () => {
    let nav!: ReturnType<typeof useNav>;
    function Root() {
      nav = useNav();
      return <div />;
    }
    // A component marked by `lookFrame`: the Esc in its field only blurs it.
    const Marked = lookFrame(function Marked() {
      return <input class="m" />;
    });
    expect(isLookFrame(<Marked />)).toBe(true);
    await act(async () => {
      render(<FrameStack root={<Root />} active />, document.body);
    });
    await act(async () => nav.push(<Marked />));
    const m = document.querySelector<HTMLInputElement>('.m')!;
    m.focus();
    await act(async () => {
      keyIn(m, 'Escape');
    });
    expect(nav.depth()).toBe(2);
  });

  it('replace keeps an overlay an overlay', async () => {
    let nav!: ReturnType<typeof useNav>;
    function Root() {
      nav = useNav();
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Root />} active />, document.body);
    });
    await act(async () => nav.push(<div class="one" />, { overlay: true }));
    await act(async () => nav.replace(<div class="two" />));
    const fs = frames();
    expect(fs).toHaveLength(2);
    expect(fs[1]!.hasAttribute('data-overlay')).toBe(true);
    expect(fs[0]!.hasAttribute('data-under')).toBe(true);
  });
});

describe('browser keys (stage 45 owner feedback round 2, ADR 0130)', () => {
  const press = (k: string, init: KeyboardEventInit = {}): boolean => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('never prevents a function key: no frame handler sees it, only a layer that asks', async () => {
    const log: string[] = [];
    let ask!: (on: boolean) => void;
    function Page() {
      const [on, set] = useState(false);
      ask = set;
      useKeys((e) => (log.push(`page:${e.key}`), true));
      useKeyLayer((e) => (log.push(`layer:${e.key}`), true));
      useKeyLayer((e) => (log.push(`f:${e.key}`), e.key === 'F11'), on, { browserKeys: true });
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    expect(press('F11')).toBe(false);
    expect(press('F5')).toBe(false);
    expect(press('F12', { ctrlKey: true, shiftKey: true })).toBe(false);
    expect(log).toEqual([]);
    expect(press('a')).toBe(true);
    expect(log).toEqual(['layer:a']);
    log.length = 0;
    await act(async () => ask(true));
    expect(press('F11')).toBe(true);
    expect(press('F5')).toBe(false);
    expect(log).toEqual(['f:F11', 'f:F5']);
  });

  it('a page that gives every key to its player lets the browser shortcuts through', async () => {
    const log: string[] = [];
    function Page() {
      usePlayerKeys(true);
      useKeys((e) => (log.push(e.key), false));
      return <div />;
    }
    await act(async () => {
      render(<FrameStack root={<Page />} active />, document.body);
    });
    expect(press(' ')).toBe(true);
    expect(press('Escape')).toBe(true);
    expect(press('r', { ctrlKey: true })).toBe(false);
    expect(press('l', { ctrlKey: true })).toBe(false);
    expect(press('ArrowLeft', { altKey: true })).toBe(false);
    expect(press('F5')).toBe(false);
    // The shortcuts go on to the frame's own handler, which leaves them too.
    expect(log).toEqual(['r', 'l', 'ArrowLeft']);
    expect(isBrowserShortcut({ key: 'r', ctrlKey: true, altKey: false, metaKey: false })).toBe(true);
    expect(isBrowserShortcut({ key: 'F11', ctrlKey: false, altKey: false, metaKey: false })).toBe(true);
    expect(isBrowserShortcut({ key: 'f', ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
  });
});
