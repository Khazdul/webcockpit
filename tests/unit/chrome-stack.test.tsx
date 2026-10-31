// @vitest-environment happy-dom
// The frame stack's window mode (ADR 0103): one key owner at a time, no
// focus trap, and the close request through a frame's unsaved prompt.
import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { FrameStack, type StackControl, useKeys, useNav, useUnsaved } from '../../src/chrome/kit/stack';

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
