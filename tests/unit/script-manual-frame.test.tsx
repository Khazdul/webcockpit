// @vitest-environment happy-dom
// Stage 44c: the script manual's frame (src/editor/script-manual-frame.tsx)
// over stage 42's lantern reader. Its places: on the start page a large box
// titled "Script Manual" with Back; in a window the window's title
// "Scripts" with the note "Manual" and a small Back in the head (only as a
// sub-page). The reader gets the script manual's sections, its three groups
// with their counts, the F1 section, the Lua index's links, highlighted
// examples and the kept find; the frame's keys go to the reader first
// (Esc: a non-empty find, then back).
import { type VNode, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { lookFrame, useWindowChrome } from '../../src/chrome/kit/look';
import { FrameStack, type Nav, useNav } from '../../src/chrome/kit/stack';
import { WindowFrame, WindowStack } from '../../src/chrome/kit/window';
import { type WindowChromeStore, useWindowChromeOf, windowChromeStore } from '../../src/chrome/kit/window-chrome';
import { windowBody } from '../../src/chrome/kit/window-geom';
import { forgetManualPlaces } from '../../src/editor/look-manual';
import { ScriptManual, openScriptManual, scriptManualSection } from '../../src/editor/script-manual-frame';
import { LUA_INDEX, SCRIPT_MANUAL_GROUPS, scriptManualCounts, scriptManualSections } from '../../src/editor/script-reference';

let nav: Nav | null = null;
let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
  // The manual remembers where it was left (ADR 0143): each test starts fresh.
  forgetManualPlaces();
  nav = null;
  document.body.innerHTML = '';
});

/** A look frame under the manual (the Scripts page or the editor), with the title the window shows for it. */
const Below = lookFrame(function Below(): VNode {
  nav = useNav();
  useWindowChrome({ title: 'Scripts', note: '' });
  return <p class="below">below</p>;
});

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

/** The manual on the start page's place (`start`, the default): a stack with a frame below it. */
function onStart(name?: string): HTMLElement {
  const el = host();
  act(() => render(<FrameStack root={<Below />} active />, el));
  cleanup.push(() => render(null, el));
  act(() => openScriptManual(nav!, name));
  return el;
}

const sman = (el: ParentNode): HTMLElement | null => el.querySelector<HTMLElement>('.wc-frame:not([hidden]) .wc-sman');
const current = (el: ParentNode): string | null => el.querySelector('.wc-frame:not([hidden]) .wc-lk-mtoc li.is-on')?.textContent ?? null;

function key(k: string, opts: KeyboardEventInit = {}, target: EventTarget = window): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
  });
}

describe('scriptManualSection (F1)', () => {
  const heading = (name?: string): string => scriptManualSections()[scriptManualSection(name)]!.heading;

  it('opens at the entry of an API or Lua name', () => {
    expect(heading('tempTimer')).toBe('tempTimer');
    expect(heading('string.format')).toBe('string.format');
    expect(heading('ipairs')).toBe('ipairs');
  });

  it('opens a library table at the Lua index, a keyword at Lua basics, a removed name at the sandbox, a tag at the header', () => {
    expect(heading('string')).toBe(LUA_INDEX);
    expect(heading('for')).toBe('Lua basics');
    expect(heading('os')).toBe('Sandbox and limits');
    expect(heading('@setting')).toBe('The header');
  });

  it('opens at Getting started without a name or for an unknown one', () => {
    expect(scriptManualSection()).toBe(0);
    expect(scriptManualSection('myOwnThing')).toBe(0);
    expect(heading()).toBe('Getting started');
  });
});

describe('the script manual on the start page', () => {
  it('is a large box titled Script Manual with Back, over the lantern reader with the contents and the find in the head', () => {
    const el = onStart();
    const box = sman(el)!;
    expect(box).not.toBeNull();
    expect(box.classList.contains('wc-lk-box-large')).toBe(true);
    expect(box.querySelector(':scope > .wc-lk-hood')!.textContent).toContain('Script Manual');
    expect(box.querySelector(':scope > .wc-lk-back')).not.toBeNull();
    // No window Back on the start page.
    expect(box.querySelector('.wc-sman-iback')).toBeNull();
    const reader = box.querySelector('.wc-lk-manual')!;
    expect(reader.classList.contains('has-toc')).toBe(true);
    expect(reader.querySelector('.wc-lk-mhead .wc-lk-mfind input')).not.toBeNull();
    expect(current(el)).toBe('Getting started');
  });

  it('shows the three groups with their counts: the Guide open, the references folded', () => {
    const el = onStart();
    const groups = [...sman(el)!.querySelectorAll('.wc-lk-mgrp')];
    expect(groups.map((g) => g.querySelector('.wc-lk-mgrp-t')!.textContent)).toEqual(['Guide', 'API reference', 'Lua reference']);
    expect(Object.values(SCRIPT_MANUAL_GROUPS)).toEqual(['Guide', 'API reference', 'Lua reference']);
    const counts = scriptManualCounts();
    expect(groups.map((g) => Number(g.querySelector('.wc-lk-mcount')!.textContent))).toEqual([counts.guide, counts.reference, counts.lua]);
    expect(counts.guide).toBe(19);
    expect(counts.guide! + counts.reference! + counts.lua!).toBe(scriptManualSections().length);
    expect(groups.map((g) => g.getAttribute('aria-expanded'))).toEqual(['true', 'false', 'false']);
    // The text has a rule per group.
    expect([...sman(el)!.querySelectorAll('.wc-lk-mtext .wc-lk-mgroup')].map((g) => g.textContent)).toEqual([
      'Guide',
      'API reference',
      'Lua reference',
    ]);
  });

  it("opens at F1's section, its group unfolded", () => {
    const el = onStart('string.format');
    expect(current(el)).toBe('string.format');
    const lua = [...sman(el)!.querySelectorAll('.wc-lk-mgrp')][2]!;
    expect(lua.getAttribute('aria-expanded')).toBe('true');
  });

  it("links the Lua index's names to their entries and highlights the examples", () => {
    const el = onStart(LUA_INDEX);
    const all = scriptManualSections();
    const at = all.findIndex((s) => s.heading === LUA_INDEX);
    const index = sman(el)!.querySelector(`.wc-lk-mtext section[data-i="${at}"]`)!;
    const links = [...index.querySelectorAll<HTMLAnchorElement>('a.wc-lk-mlink')];
    expect(links.length).toBeGreaterThan(50);
    const fmt = links.find((a) => a.textContent === 'string.format')!;
    act(() => fmt.click());
    expect(current(el)).toBe('string.format');
    // string.format's example: Lua tokens, the API name `echo` coloured.
    const i = all.findIndex((s) => s.group === 'lua' && s.heading === 'string.format');
    const code = sman(el)!.querySelector(`.wc-lk-mtext section[data-i="${i}"] pre.wc-lk-mcode`)!;
    expect(code.classList.contains('wc-code')).toBe(true);
    expect(code.querySelector('.wc-lua-str')).not.toBeNull();
    expect([...code.querySelectorAll('.wc-lua-std')].map((s) => s.textContent)).toContain('echo');
    // The text is unchanged by the colours.
    expect(code.textContent).toBe(all[i]!.examples![0]!.code);
  });

  it('takes the keys first (n: the next section), and Esc goes back', () => {
    const el = onStart();
    key('n');
    expect(current(el)).toBe('Lua basics');
    key('Escape');
    expect(sman(el)).toBeNull();
    expect(el.querySelector('.wc-frame:not([hidden]) .below')).not.toBeNull();
  });

  it('clears a typed find on the first Esc, leaves on the next, and keeps the query for the next open', () => {
    const el = onStart();
    const input = (): HTMLInputElement => sman(el)!.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    key('f', { ctrlKey: true });
    act(() => {
      input().value = 'sandbox';
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(sman(el)!.querySelector('.wc-search-count')!.textContent).toMatch(/of \d+/);
    // Leave with Back while the query is typed: it is kept.
    act(() => sman(el)!.querySelector<HTMLElement>(':scope > .wc-lk-back')!.click());
    expect(sman(el)).toBeNull();
    act(() => openScriptManual(nav!));
    expect(input().value).toBe('sandbox');
    expect(sman(el)!.querySelector('.wc-search-count')!.textContent).toMatch(/\d/);
    // Esc in the field clears it; the manual stays. The next Esc leaves.
    key('Escape', {}, input());
    expect(input().value).toBe('');
    expect(sman(el)).not.toBeNull();
    key('Escape');
    expect(sman(el)).toBeNull();
  });
});

// ------------------------------------------------------------ in a window

function Win(p: { store: WindowChromeStore; root: VNode }): VNode {
  const set = useWindowChromeOf(p.store);
  const rect = { x: 2, y: 1, w: 80, h: 30 };
  const note = set?.note ?? '';
  return (
    <WindowFrame
      id="scripts"
      title={set?.title ?? 'Scripts'}
      {...(note ? { titleNote: note } : {})}
      rect={rect}
      grid={{ cols: 140, rows: 40 }}
      cellW={10}
      cellH={20}
      z={1}
      focused
      onRect={() => {}}
      onClose={() => {}}
    >
      <WindowStack body={windowBody(rect, 10, 20)} cellW={10} cellH={20} root={p.root} active onRootBack={() => {}} chrome={p.store.sink} />
    </WindowFrame>
  );
}

function inWindow(root: VNode): { el: HTMLElement; title: () => string | null; note: () => string | null } {
  const store = windowChromeStore();
  const el = host();
  act(() =>
    render(
      <div class="wc-windows">
        <Win store={store} root={root} />
      </div>,
      el,
    ),
  );
  cleanup.push(() => render(null, el));
  return {
    el,
    title: () => el.querySelector('.wc-win-t')?.textContent ?? null,
    note: () => el.querySelector('.wc-win-n')?.textContent ?? null,
  };
}

describe('the script manual in the Scripts window', () => {
  it('sets the title Scripts and the note Manual, has a small Back in its head, and reverts when it pops', () => {
    const w = inWindow(<Below />);
    expect(w.note()).toBeNull();
    const frame = w.el.querySelector('.wc-win');
    act(() => openScriptManual(nav!, 'tempTimer'));
    expect(w.title()).toBe('Scripts');
    expect(w.note()).toBe('Manual');
    const box = sman(w.el)!;
    // The window frame is the box: no hood or Back of the box's own.
    expect(box.classList.contains('wc-lk-inwin')).toBe(true);
    expect(box.querySelector(':scope > .wc-lk-hood')).toBeNull();
    expect(box.querySelector('.wc-lk-mhead.has-before > .wc-sman-iback')).not.toBeNull();
    const back = box.querySelector<HTMLElement>('.wc-sman-iback .wc-lk-iback')!;
    expect(back.textContent).toContain('Back');
    expect(current(w.el)).toBe('tempTimer');
    // The window keeps its frame.
    expect(w.el.querySelector('.wc-win')).toBe(frame);
    act(() => back.click());
    expect(sman(w.el)).toBeNull();
    expect(w.note()).toBeNull();
  });

  it("has no Back of its own as the window's root", () => {
    const w = inWindow(<ScriptManual />);
    const box = sman(w.el)!;
    expect(box).not.toBeNull();
    expect(box.classList.contains('has-iback')).toBe(false);
    expect(box.querySelector('.wc-lk-iback')).toBeNull();
    expect(w.note()).toBe('Manual');
  });
});
