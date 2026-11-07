// @vitest-environment happy-dom
// Stage 42e (ADR 0127): the lantern manual reader (src/editor/look-manual.tsx):
// the sections drawn as blocks whose text is exactly what find searches,
// the groups, the contents (own, folding, with counts) or none, `goto` and
// `onSection`, the keys, the find in the head and as a bar (happy-dom has
// no Highlight API: the `<mark>` fallback is drawn), the link and example
// hooks, and the find memory.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { navKey } from '../../src/chrome/kit/nav';
import { type HelpSection, helpSections } from '../../src/editor/help';
import { LookManual, type LookManualProps, type ManualCtl, ManualContents, codeLine, highlightApi } from '../../src/editor/look-manual';
import { type FindMemory, manualBlocks } from '../../src/editor/look-manual-find';
import { EMPTY_QUERY } from '../../src/editor/manual-search';
import { indexLinkOf, scriptManualSections } from '../../src/editor/script-reference';

afterEach(() => render(null, document.body));

const SECTIONS: HelpSection[] = [
  { group: 'intro', heading: 'Writing a profile', text: ['A profile is text. A timer is a rule.'] },
  { group: 'basics', heading: 'Braces', syntax: ['{a} {b}'], text: ['Braces group words.', '- one', '- two'] },
  {
    group: 'commands',
    heading: '#ticker',
    syntax: ['#ticker {name} {commands} {seconds}'],
    text: ['A ticker is a timer.', 'Parameters:', '- name (text): the timer', 'Returns: nothing'],
    examples: [{ code: '#ticker {t} {timer}\n#nop done', note: 'Every second:' }],
  },
  { group: 'commands', heading: '#unticker', text: ['Stops a timer.'] },
];

async function mount(props: Partial<LookManualProps> = {}): Promise<{ ctl: () => ManualCtl; root: HTMLElement; onSection: ReturnType<typeof vi.fn> }> {
  let c: ManualCtl | null = null;
  const onSection = vi.fn();
  await act(async () => {
    render(
      <div style={{ height: '600px' }}>
        <LookManual sections={SECTIONS} contents="own" find="head" ctl={(x) => (c = x)} onSection={onSection} {...props} />
      </div>,
      document.body,
    );
  });
  return { ctl: () => c!, root: document.querySelector<HTMLElement>('.wc-lk-manual')!, onSection };
}

function keyEvent(key: string, opts: KeyboardEventInit = {}, target?: EventTarget): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, ...opts });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

async function press(ctl: ManualCtl, key: string, opts: KeyboardEventInit = {}, target?: EventTarget): Promise<boolean> {
  let r = false;
  await act(async () => {
    const e = keyEvent(key, opts, target);
    r = ctl.key(e, navKey(e));
  });
  return r;
}

async function type(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Lets the reader draw its remaining chunks (idle callbacks). */
async function drawAll(): Promise<void> {
  for (let k = 0; k < 200 && document.querySelector('.wc-lk-msec.is-pending'); k++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  expect(document.querySelector('.wc-lk-msec.is-pending')).toBeNull();
}

const onTOC = (): string | null | undefined => document.querySelector('.wc-lk-mtoc li.is-on')?.getAttribute('data-i');
const count = (): string => document.querySelector('.wc-search-count')?.textContent ?? '';

describe('the text', () => {
  it('draws each block with exactly the text find searches (both manuals, with the hooks)', async () => {
    const known = (n: string): boolean => n === 'send' || n === 'tempTimer';
    for (const sections of [helpSections(), scriptManualSections()]) {
      await mount({
        sections,
        example: (l, lang) => codeLine(l, lang, known),
        link: (name) => indexLinkOf(`- ${name}:`)?.section ?? null,
      });
      await drawAll();
      const secs = document.querySelectorAll<HTMLElement>('.wc-lk-mtext section[data-i]');
      expect(secs).toHaveLength(sections.length);
      sections.forEach((s, i) => {
        const blocks = manualBlocks(s);
        const els = secs[i]!.querySelectorAll<HTMLElement>('[data-b]');
        expect(els).toHaveLength(blocks.length);
        els.forEach((el, k) => expect(el.textContent, `${s.heading} block ${k}`).toBe(blocks[k]!.text));
      });
      render(null, document.body);
    }
  });

  it('draws the groups, headings, lists, parameters and examples', async () => {
    await mount({ example: (l, lang) => codeLine(l, lang) });
    expect([...document.querySelectorAll('.wc-lk-mgroup')].map((g) => g.textContent)).toEqual(['Basics', 'Commands']);
    expect(document.querySelector('section[data-i="2"] .wc-lk-mh')!.classList.contains('is-code')).toBe(true);
    expect(document.querySelector('section[data-i="0"] .wc-lk-mh')!.classList.contains('is-code')).toBe(false);
    expect(document.querySelectorAll('section[data-i="1"] .wc-lk-mlist li')).toHaveLength(2);
    expect(document.querySelector('section[data-i="2"] .wc-lk-mpn')!.textContent).toBe('name');
    expect([...document.querySelectorAll('section[data-i="2"] .wc-lk-mlabel')].map((l) => l.textContent)).toEqual(['Parameters', 'Returns']);
    const code = document.querySelector('section[data-i="2"] pre.wc-lk-mcode')!;
    expect(code.classList.contains('wc-code')).toBe(true);
    expect(code.querySelectorAll('.wc-lk-mline')).toHaveLength(2);
    expect(code.querySelector('.wc-syn-cmd')!.textContent).toBe('#ticker');
  });

  it('links the Lua index names to their entries', async () => {
    const sections = scriptManualSections();
    const at = sections.findIndex((s) => s.heading === 'Lua library');
    const { ctl, onSection } = await mount({ sections, initial: at, link: (name) => indexLinkOf(`- ${name}:`)?.section ?? null });
    expect(ctl().section()).toBe(at);
    const a = document.querySelector<HTMLAnchorElement>(`section[data-i="${at}"] a.wc-lk-mlink`)!;
    const to = sections.findIndex((s) => s.group === 'lua' && s.heading === a.textContent);
    expect(to).toBeGreaterThan(at);
    await act(async () => a.click());
    expect(ctl().section()).toBe(to);
    expect(onSection).toHaveBeenLastCalledWith(to);
  });
});

describe('drawing in chunks', () => {
  it('draws the first screen at once and the rest when idle; a jump draws through its section', async () => {
    const sections = scriptManualSections();
    const { ctl } = await mount({ sections });
    const pending = (): number => document.querySelectorAll('.wc-lk-msec.is-pending').length;
    expect(pending()).toBeGreaterThan(0);
    expect(document.querySelectorAll('.wc-lk-msec')).toHaveLength(sections.length);
    const far = sections.length - 2;
    expect(document.querySelector(`section[data-i="${far}"]`)!.classList.contains('is-pending')).toBe(true);
    await act(async () => ctl().goto(far));
    expect(document.querySelector(`section[data-i="${far}"]`)!.classList.contains('is-pending')).toBe(false);
    expect(document.querySelector(`section[data-i="${far}"] h3`)!.textContent).toBe(sections[far]!.heading);
    expect(ctl().section()).toBe(far);
    await drawAll();
  });

  it('draws through a match beyond the drawn sections', async () => {
    const sections = scriptManualSections();
    const last = sections.length - 1;
    const { ctl } = await mount({ sections });
    expect(document.querySelector(`section[data-i="${last}"]`)!.classList.contains('is-pending')).toBe(true);
    const input = document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    await type(input, sections[last]!.heading);
    // From the first match, Shift+Enter wraps to the last one: in the last section.
    await press(ctl(), 'Enter', { shiftKey: true }, input);
    expect(document.querySelector(`section[data-i="${last}"]`)!.classList.contains('is-pending')).toBe(false);
    expect(document.querySelectorAll(`section[data-i="${last}"] mark.wc-lk-mark.is-now`)).toHaveLength(1);
    expect(ctl().section()).toBe(last);
  });
});

describe('codeLine', () => {
  it('colours tt++ and Lua without changing the text', () => {
    const tt = '#alias {k %1} {kill $target}';
    render(<pre>{codeLine(tt, 'tt')}</pre>, document.body);
    expect(document.body.textContent).toBe(tt);
    expect([...document.querySelectorAll('span')].map((s) => s.className)).toContain('wc-syn-var');
    const lua = 'local n = send("x") -- go';
    render(<pre>{codeLine(lua, 'lua', (n) => n === 'send')}</pre>, document.body);
    expect(document.body.textContent).toBe(lua);
    expect([...document.querySelectorAll('span')].map((s) => s.className)).toEqual(['wc-lua-kw', 'wc-lua-std', 'wc-lua-str', 'wc-lua-comment']);
  });
});

describe('the contents', () => {
  it('lists the sections by group, with counts, the current one lit', async () => {
    await mount();
    const toc = document.querySelector('.wc-lk-mtoc')!;
    expect([...toc.querySelectorAll('.wc-lk-mgrp-t')].map((g) => g.textContent)).toEqual(['Basics', 'Commands']);
    expect([...toc.querySelectorAll('.wc-lk-mcount')].map((g) => g.textContent)).toEqual(['1', '2']);
    expect(onTOC()).toBe('0');
    expect(toc.querySelector('li[data-i="2"]')!.classList.contains('is-code')).toBe(true);
  });

  it('is left to the host with contents none', async () => {
    await mount({ contents: 'none' });
    expect(document.querySelector('.wc-lk-mtoc')).toBeNull();
    expect(document.querySelector('.wc-lk-manual')!.classList.contains('no-toc')).toBe(true);
  });

  it('folds big groups, opens the current one, and folds on a click', async () => {
    const sections = scriptManualSections();
    const onGo = vi.fn();
    const draw = (current: number): void => render(<ManualContents sections={sections} current={current} onGo={onGo} counts />, document.body);
    await act(async () => draw(0));
    const grp = (t: string): HTMLButtonElement =>
      [...document.querySelectorAll<HTMLButtonElement>('.wc-lk-mgrp')].find((b) => b.textContent!.startsWith(t))!;
    expect(grp('Guide').getAttribute('aria-expanded')).toBe('true');
    expect(grp('API reference').getAttribute('aria-expanded')).toBe('false');
    const api = sections.findIndex((s) => s.group === 'reference');
    expect(document.querySelector(`li[data-i="${api}"]`)).toBeNull();
    await act(async () => draw(api));
    expect(grp('API reference').getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector(`li[data-i="${api}"]`)!.classList.contains('is-on')).toBe(true);
    await act(async () => grp('Guide').click());
    expect(grp('Guide').getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('li[data-i="0"]')).toBeNull();
    await act(async () => document.querySelector<HTMLElement>(`li[data-i="${api + 1}"]`)!.click());
    expect(onGo).toHaveBeenCalledWith(api + 1);
  });
});

describe('goto, onSection and the keys', () => {
  it('goes to a section and tells the host', async () => {
    const { ctl, onSection } = await mount();
    await act(async () => ctl().goto(2));
    expect(ctl().section()).toBe(2);
    expect(onTOC()).toBe('2');
    expect(onSection).toHaveBeenLastCalledWith(2);
    await act(async () => ctl().goto(99));
    expect(ctl().section()).toBe(3);
  });

  it('starts at `initial`', async () => {
    const { ctl } = await mount({ initial: 2 });
    expect(ctl().section()).toBe(2);
    expect(onTOC()).toBe('2');
  });

  it('n / p step through the headings', async () => {
    const { ctl, onSection } = await mount();
    expect(await press(ctl(), 'n')).toBe(true);
    expect(await press(ctl(), 'n')).toBe(true);
    expect(ctl().section()).toBe(2);
    expect(await press(ctl(), 'p')).toBe(true);
    expect(ctl().section()).toBe(1);
    expect(onSection).toHaveBeenLastCalledWith(1);
  });

  it('Tab gives the contents the keys: ↑↓ move, Enter goes back to the text', async () => {
    const { ctl, root } = await mount();
    expect(root.dataset.zone).toBe('text');
    expect(await press(ctl(), 'Tab')).toBe(true);
    expect(root.dataset.zone).toBe('toc');
    expect(document.querySelector('.wc-lk-mtoc')!.classList.contains('is-zone')).toBe(true);
    await press(ctl(), 'ArrowDown');
    await press(ctl(), 'ArrowDown');
    expect(ctl().section()).toBe(2);
    await press(ctl(), 'ArrowUp');
    expect(ctl().section()).toBe(1);
    await press(ctl(), 'End');
    expect(ctl().section()).toBe(3);
    await press(ctl(), 'Enter');
    expect(root.dataset.zone).toBe('text');
    await press(ctl(), 'ArrowLeft');
    expect(root.dataset.zone).toBe('toc');
    await press(ctl(), 'ArrowRight');
    expect(root.dataset.zone).toBe('text');
  });

  it('leaves Tab and ← to the host with contents none, and Esc when nothing is open', async () => {
    const { ctl } = await mount({ contents: 'none' });
    expect(await press(ctl(), 'Tab')).toBe(false);
    expect(await press(ctl(), 'ArrowLeft')).toBe(false);
    expect(await press(ctl(), 'Escape')).toBe(false);
    expect(await press(ctl(), 'ArrowDown')).toBe(true);
    expect(await press(ctl(), 'PageDown')).toBe(true);
    expect(await press(ctl(), ' ')).toBe(true);
    expect(await press(ctl(), 'x')).toBe(false);
  });

  it('opens the contents over the text when narrow, and Esc closes it first', async () => {
    const { ctl, root } = await mount();
    Object.defineProperty(root, 'clientWidth', { value: 500, configurable: true });
    await press(ctl(), 'Tab');
    expect(root.classList.contains('is-toc-open')).toBe(true);
    expect(await press(ctl(), 'Escape')).toBe(true);
    expect(root.classList.contains('is-toc-open')).toBe(false);
    expect(root.dataset.zone).toBe('text');
    await act(async () => document.querySelector<HTMLElement>('[data-btn="contents"]')!.click());
    expect(root.classList.contains('is-toc-open')).toBe(true);
    await act(async () => document.querySelector<HTMLElement>('.wc-lk-mtoc li[data-i="3"]')!.click());
    expect(root.classList.contains('is-toc-open')).toBe(false);
    expect(ctl().section()).toBe(3);
  });
});

describe('find', () => {
  it('is always in the head with find head: typing marks the matches and counts them', async () => {
    expect(highlightApi()).toBe(false);
    const { ctl } = await mount({ initial: 1 });
    const input = document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    expect(input).not.toBeNull();
    await type(input, 'timer');
    // From the current section on: the first match from section 1 on is the 2nd of 5.
    expect(count()).toBe('2 of 5');
    expect(document.querySelectorAll('mark.wc-lk-mark')).toHaveLength(5);
    expect(document.querySelectorAll('mark.wc-lk-mark.is-now')).toHaveLength(1);
    expect(ctl().section()).toBe(2);
    expect(await press(ctl(), 'Enter', {}, input)).toBe(true);
    expect(count()).toBe('3 of 5');
    await press(ctl(), 'Enter', { shiftKey: true }, input);
    await press(ctl(), 'Enter', { shiftKey: true }, input);
    expect(count()).toBe('1 of 5');
    await press(ctl(), 'F3');
    expect(count()).toBe('2 of 5');
    // Letters in the field are the field's.
    expect(await press(ctl(), 'n', {}, input)).toBe(false);
    expect(ctl().findOpen()).toBe(true);
    // Esc clears the query; the next Esc is the host's.
    expect(await press(ctl(), 'Escape', {}, input)).toBe(true);
    expect(count()).toBe('');
    expect(document.querySelectorAll('mark.wc-lk-mark')).toHaveLength(0);
    expect(await press(ctl(), 'Escape')).toBe(false);
  });

  it('has the toggles (Alt+C/W/R) and says a bad regex', async () => {
    const { ctl } = await mount();
    const input = document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    await type(input, 'Timer');
    expect(count()).toMatch(/of 5$/);
    await press(ctl(), 'c', { altKey: true }, input);
    expect(document.querySelector('[data-opt="case"]')!.getAttribute('aria-checked')).toBe('true');
    expect(count()).toBe('No matches');
    await press(ctl(), 'c', { altKey: true }, input);
    await press(ctl(), 'w', { altKey: true }, input);
    expect(count()).toMatch(/of 5$/);
    await type(input, '(timer');
    await press(ctl(), 'r', { altKey: true }, input);
    expect(count()).toBe('Bad regex');
    expect(document.querySelector('.wc-search-count')!.classList.contains('is-bad')).toBe(true);
  });

  it('opens as a bar with Ctrl+F (find bar), closes with Esc, and keeps the query', async () => {
    const memory: FindMemory = { query: EMPTY_QUERY };
    const { ctl } = await mount({ find: 'bar', contents: 'none', memory });
    expect(document.querySelector('.wc-lk-mfind')).toBeNull();
    expect(ctl().findOpen()).toBe(false);
    expect(await press(ctl(), 'f', { ctrlKey: true })).toBe(true);
    const input = document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    expect(document.activeElement).toBe(input);
    expect(ctl().findOpen()).toBe(true);
    await type(input, 'rule');
    expect(count()).toBe('1 of 1');
    expect(memory.query.search).toBe('rule');
    expect(await press(ctl(), 'Escape', {}, input)).toBe(true);
    expect(document.querySelector('.wc-lk-mfind')).toBeNull();
    expect(document.querySelectorAll('mark.wc-lk-mark')).toHaveLength(0);
    // Open again: the query is back, marked.
    await act(async () => ctl().openFind());
    expect(document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!.value).toBe('rule');
    expect(count()).toBe('1 of 1');
    expect(ctl().closeFind()).toBe(true);
    render(null, document.body);
    // A new reader with the same memory starts from it.
    const again = await mount({ find: 'bar', memory });
    await act(async () => again.ctl().openFind());
    expect(document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!.value).toBe('rule');
  });

  it('clicks the previous / next buttons', async () => {
    await mount();
    const input = document.querySelector<HTMLInputElement>('.wc-lk-mfind input')!;
    await type(input, 'timer');
    expect(count()).toBe('1 of 5');
    await act(async () => document.querySelector<HTMLElement>('[data-btn="next"]')!.click());
    expect(count()).toBe('2 of 5');
    await act(async () => document.querySelector<HTMLElement>('[data-btn="prev"]')!.click());
    await act(async () => document.querySelector<HTMLElement>('[data-btn="prev"]')!.click());
    expect(count()).toBe('5 of 5');
  });
});
