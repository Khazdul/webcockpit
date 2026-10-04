// @vitest-environment happy-dom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { escHints, isEscToken } from '../../src/chrome/kit/esc';
import { FrameStack, useNav } from '../../src/chrome/kit/stack';
import { Page } from '../../src/chrome/kit/widgets';

describe('ESC footer tokens', () => {
  afterEach(() => render(null, document.body));

  it('recognises tokens that name Esc', () => {
    expect(isEscToken('ESC Back')).toBe(true);
    expect(isEscToken('ESC Save & back')).toBe(true);
    expect(isEscToken('Enter Select')).toBe(false);
    expect(isEscToken('ESCAPE')).toBe(false);
    expect(escHints('↑↓ Scroll · Tab Cycle')).toBe('↑↓ Scroll · Tab Cycle');
  });

  it('a click on ESC Back pops the frame through the stack’s own Esc path', async () => {
    let pushed = false;
    function Root() {
      const nav = useNav();
      if (!pushed) {
        pushed = true;
        queueMicrotask(() => nav.push(<Page title="Sub" footer={['↑↓ Navigate', 'ESC Back']} />));
      }
      return <Page title="Root" footer={['ESC Close']} />;
    }
    let rootBack = 0;
    await act(async () => {
      render(<FrameStack root={<Root />} active onRootBack={() => rootBack++} />, document.body);
      await Promise.resolve();
    });
    const visible = () => [...document.querySelectorAll('.wc-frame:not([hidden]) .wc-title-row')].map((e) => e.textContent);
    expect(visible()[0]).toContain('Sub');
    const esc = () => document.querySelector<HTMLElement>('.wc-frame:not([hidden]) .wc-esc-btn')!;
    expect(esc().textContent).toBe('ESC Back');
    await act(async () => esc().click());
    expect(visible()[0]).toContain('Root');
    await act(async () => esc().click());
    expect(rootBack).toBe(1);
  });
});
