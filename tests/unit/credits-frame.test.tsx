// @vitest-environment happy-dom
// Stage 47 (ADR 0132): Credits as a book. The pills, the keys that turn
// spreads and move between chapters, the folios and the buttons, and the
// states as pages of the book. The DOM has no layout, so the test gives
// the book a width, each chapter's tail mark a column (one page per deed)
// and, where it says so, the CSS's pages per spread.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunMeta } from '../../src/capture/store';
import { CREDITS_TEXT, CreditsFrame } from '../../src/chrome/frames/credits';
import { type ChromeServices, ServicesCtx } from '../../src/chrome/kit/hooks';
import { FrameStack } from '../../src/chrome/kit/stack';
import type { RunEvent } from '../../src/runs/events';
import { OPEN_FILTERS } from '../../src/share/spotlights';
import type { Settings, SpotlightSettings } from '../../src/settings';

const PAGE = 500; // px per page: a book 1000 px wide holds two
/** The book's (unrounded) width as layout reports it, and the page pitch the layout uses. */
let bookW = 2 * PAGE;
let pitch = PAGE;

const T0 = new Date(2026, 8, 20, 21, 0).getTime() * 1000;
const lvl = (us: number, level: number): RunEvent => ({ type: 'level_up', us, level });

/** Characters with 1, 3, 2 and 4 deeds (one page each): pages 0 | 1-3 | 4-5 | 6-9. */
const RUNS: { meta: RunMeta; events: RunEvent[] }[] = (
  [
    ['Alda', 1],
    ['Bram', 3],
    ['Cira', 2],
    ['Dunn', 4],
  ] as const
).map(([name, n], c) => ({
  meta: { runId: name, character: name, startedUs: T0, endedUs: null, sealed: true, bytes: 0, lines: 0 },
  events: Array.from({ length: n }, (_, i) => lvl(T0 + c * 1e9 + i * 1e6, 2 + i)),
}));

let saved: { rect: typeof Element.prototype.getBoundingClientRect; animate: unknown; gcs: typeof window.getComputedStyle };
/** The pages per spread the CSS's container query gives (`--wc-cred-per`); '' when it has none. */
let cssPer = '';

beforeEach(() => {
  bookW = 2 * PAGE;
  cssPer = '';
  saved = {
    rect: Element.prototype.getBoundingClientRect,
    animate: (Element.prototype as unknown as { animate?: unknown }).animate,
    gcs: window.getComputedStyle,
  };
  // The test DOM has no container queries: the pages' `--wc-cred-per` is what the test says.
  window.getComputedStyle = function (this: Window, el: Element, pseudo?: string | null): CSSStyleDeclaration {
    const cs = saved.gcs.call(window, el, pseudo);
    if (!(el as HTMLElement).classList?.contains('wc-cred-pages')) return cs;
    return new Proxy(cs, {
      get: (t, k) =>
        k === 'getPropertyValue' ? (n: string) => (n === '--wc-cred-per' ? cssPer : t.getPropertyValue(n)) : Reflect.get(t, k),
    });
  } as typeof window.getComputedStyle;
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    let left = 0;
    let width = 0;
    if (this.classList.contains('wc-cred-tail')) {
      const deeds = this.closest('.wc-cred-ch')!.querySelectorAll('.wc-cred-p').length;
      left = (deeds - 1) * pitch + 120;
    }
    if (this.classList.contains('wc-cred-book')) width = bookW;
    return { left, top: 0, right: left + width, bottom: 0, width, height: 0, x: left, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  // No turn animation in the test DOM: turns are instant.
  (Element.prototype as unknown as { animate?: unknown }).animate = undefined;
});

afterEach(() => {
  render(null, document.body);
  window.getComputedStyle = saved.gcs;
  Element.prototype.getBoundingClientRect = saved.rect;
  (Element.prototype as unknown as { animate?: unknown }).animate = saved.animate;
});

function services(runs: () => Promise<unknown>, spotlights: SpotlightSettings = OPEN_FILTERS): ChromeServices {
  const s = { spotlights } as unknown as Settings;
  return { runs, settings: { get: () => s, subscribe: () => () => {} } } as unknown as ChromeServices;
}

const library = (runs = RUNS) => ({
  store: { listRuns: async () => runs.map((r) => r.meta) },
  events: async ([id]: string[]) => runs.find((r) => r.meta.runId === id)!.events,
});

let popped = 0;

/** Mounts Credits as the stack's root frame, its back counted. */
async function mountCredits(svc: ChromeServices): Promise<void> {
  popped = 0;
  await act(async () => {
    render(
      <ServicesCtx.Provider value={svc}>
        <FrameStack root={<CreditsFrame />} active onRootBack={() => popped++} />
      </ServicesCtx.Provider>,
      document.body,
    );
  });
  // Let the runs load and the book measure.
  for (let i = 0; i < 5; i++) await act(async () => await Promise.resolve());
}

const key = async (k: string): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const spread = () => Number(q('.wc-cred-book')!.dataset.spread);
const lit = () => q('.wc-cred-pills .wc-lk-opt[aria-checked="true"]')?.textContent;
const folios = () => [...document.querySelectorAll('.wc-cred-folio')].map((f) => f.textContent);

describe('Credits: the book', () => {
  it('shows the pills (characters only), the epigraph, title pages and drop-cap paragraphs', async () => {
    await mountCredits(services(async () => library()));
    expect(q('.wc-lk-box.wc-lk-box-large')?.getAttribute('aria-label')).toBe('Credits');
    expect([...document.querySelectorAll('.wc-cred-pills .wc-lk-opt')].map((o) => o.textContent)).toEqual(['Alda', 'Bram', 'Cira', 'Dunn']);
    expect(document.querySelectorAll('.wc-cred-ch')).toHaveLength(4);
    expect(q('.wc-cred-ch:first-child .wc-cred-open')?.textContent).toMatch(/^Here the scribes/);
    expect(document.querySelectorAll('.wc-cred-open')).toHaveLength(1);
    expect(document.querySelectorAll('.wc-cred-p.is-first')).toHaveLength(4);
    expect(q('.wc-cred-p .wc-cred-date')?.textContent).toMatch(/^On the /);
    expect(q('.wc-cred-ch:last-child .wc-cred-end')?.textContent).toBe('The End.');
    expect(document.body.textContent).not.toContain('Opening');
    expect(document.body.textContent).not.toContain('Settings');
    // Measured: 10 pages, 5 spreads; chapters at pages 0, 1, 4, 6.
    expect(q('.wc-cred-book')!.dataset.spreads).toBe('5');
    expect([...document.querySelectorAll<HTMLElement>('.wc-cred-ch')].map((c) => c.style.getPropertyValue('--wc-cred-p'))).toEqual(['0', '1', '4', '6']);
    expect(folios()).toEqual(['— 1 —', '— 2 —']);
    expect(lit()).toBe('Bram'); // Bram starts on page 2, on the first spread
  });

  it('turns spreads with → ← PgDn PgUp Space, N and P, Home and End; the buttons follow', async () => {
    await mountCredits(services(async () => library()));
    const prevBtn = () => q('.wc-lk-btn[data-btn="prev"]')!;
    const nextBtn = () => q('.wc-lk-btn[data-btn="next"]')!;
    expect(prevBtn().getAttribute('aria-disabled')).toBe('true');
    expect(nextBtn().getAttribute('aria-disabled')).toBeNull();
    await key('ArrowRight');
    expect(spread()).toBe(1);
    expect(folios()).toEqual(['— 3 —', '— 4 —']);
    await key('PageDown');
    await key(' ');
    expect(spread()).toBe(3);
    await key('ArrowLeft');
    await key('PageUp');
    expect(spread()).toBe(1);
    await key('n');
    expect(spread()).toBe(2);
    await key('p');
    expect(spread()).toBe(1);
    await key('End');
    expect(spread()).toBe(4);
    expect(nextBtn().getAttribute('aria-disabled')).toBe('true');
    await key('ArrowRight');
    expect(spread()).toBe(4);
    await key('Home');
    expect(spread()).toBe(0);
    await act(async () => nextBtn().click());
    expect(spread()).toBe(1);
    await act(async () => prevBtn().click());
    expect(spread()).toBe(0);
    expect(popped).toBe(0);
  });

  it('↓ ↑ and the pills move between chapters; the lit pill follows', async () => {
    await mountCredits(services(async () => library()));
    await key('ArrowDown'); // Bram → Cira
    expect(lit()).toBe('Cira');
    expect(spread()).toBe(2);
    await key('ArrowDown');
    expect(lit()).toBe('Dunn');
    expect(spread()).toBe(3);
    await key('ArrowDown');
    expect(lit()).toBe('Dunn');
    expect(spread()).toBe(3);
    await key('ArrowUp');
    await key('ArrowUp');
    await key('ArrowUp');
    expect(lit()).toBe('Alda');
    expect(spread()).toBe(0);
    const pill = (name: string) => q(`.wc-cred-pills .wc-lk-opt[data-opt="${name}"]`)!;
    await act(async () => pill('Cira').click());
    expect(lit()).toBe('Cira');
    expect(spread()).toBe(2);
    await key('ArrowRight'); // Cira's second page and Dunn's first: Dunn lights
    expect(lit()).toBe('Dunn');
    await key('ArrowRight');
    expect(spread()).toBe(4);
    // A click on the lit pill goes back to its chapter's first page.
    await act(async () => pill('Dunn').click());
    expect(spread()).toBe(3);
  });

  it('↓ in the last chapter never turns back; ↑ in the first goes to page 1', async () => {
    await mountCredits(services(async () => library()));
    await key('End'); // Dunn's last spread (pages 9-10)
    expect(spread()).toBe(4);
    expect(lit()).toBe('Dunn');
    await key('ArrowDown');
    expect(spread()).toBe(4);
    expect(lit()).toBe('Dunn');
    await key('Home');
    await key('ArrowRight'); // Bram's 2nd-3rd pages: Bram is lit
    expect(lit()).toBe('Bram');
    await key('ArrowUp'); // Alda, page 1
    expect(spread()).toBe(0);
    expect(lit()).toBe('Alda');
    await key('ArrowUp');
    expect(spread()).toBe(0);
  });

  it('pages per spread follow the CSS, not a rounded width', async () => {
    // The container query has gone to one page (a book 639.5 px wide) while the width reads 640.
    bookW = 639.98;
    pitch = bookW;
    cssPer = '1';
    await mountCredits(services(async () => library()));
    // One page per spread: 10 spreads; chapters at pages 0, 1, 4, 6 (pitch 639.98, one deed a page).
    expect(q('.wc-cred-book')!.dataset.spreads).toBe('10');
    expect(folios()).toEqual(['— 1 —']);
    await key('ArrowRight');
    expect(folios()).toEqual(['— 2 —']);
  });

  it('without the CSS value, a book under 640 px wide (unrounded) shows one page', async () => {
    bookW = 639.5;
    pitch = bookW;
    await mountCredits(services(async () => library()));
    expect(q('.wc-cred-book')!.dataset.spreads).toBe('10');
    expect(q('.wc-cred-book')!.classList.contains('is-one')).toBe(true);
  });

  it('Esc leaves', async () => {
    await mountCredits(services(async () => library()));
    await key('Escape');
    expect(popped).toBe(1);
  });
});

describe('Credits: the states are pages of the book', () => {
  it('loading: a faint line; nav keys do nothing, Esc leaves', async () => {
    await mountCredits(services(() => new Promise(() => {})));
    expect(q('.wc-cred-book.is-note')?.dataset.state).toBe('loading');
    expect(q('.wc-cred-none.is-faint')?.textContent).toBe(CREDITS_TEXT.loading);
    await key('ArrowRight');
    await key('Enter');
    expect(popped).toBe(0);
    await key('Escape');
    expect(popped).toBe(1);
  });

  it('the storage error', async () => {
    const err = console.error;
    console.error = () => {};
    try {
      await mountCredits(services(async () => Promise.reject(new Error('no db'))));
    } finally {
      console.error = err;
    }
    expect(q('.wc-cred-book.is-note')?.dataset.state).toBe('error');
    expect(q('.wc-cred-none')?.textContent).toBe("The chronicle could not be read from this browser's storage.");
  });

  it('no data, and filtered (with the Spotlights line, no Settings…)', async () => {
    await mountCredits(services(async () => library([])));
    expect(q('.wc-cred-book.is-note')?.dataset.state).toBe('no_data');
    expect(q('.wc-cred-none')?.textContent).toMatch(/^No chronicle yet\. Your tale is written as you play/);
    render(null, document.body);

    const none: SpotlightSettings = { ...OPEN_FILTERS, achievements: false, deaths: false, levelUps: false, pvp: false };
    await mountCredits(services(async () => library(), none));
    expect(q('.wc-cred-book.is-note')?.dataset.state).toBe('filtered');
    expect([...document.querySelectorAll('.wc-cred-none')].map((p) => p.textContent)).toEqual([
      'No chronicle entries match your settings.',
      'The filter on the Spotlights page chooses what the chronicle tells.',
    ]);
    expect(document.body.textContent).not.toContain('Settings…');
    expect(q('.wc-lk-btn[data-btn="next"]')?.getAttribute('aria-disabled')).toBe('true');
    await key('Escape');
    expect(popped).toBe(1);
  });
});
