// @vitest-environment happy-dom
// Stage 47 (ADR 0132): About as one long leaf. The text as sections, the
// links and game commands, and the page: the head, the rail (and the phone
// strip), the keys and the letters, the scroll spy. The DOM has no layout,
// so the test gives each section a top (SEC px apart) and the scroller a
// height.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ABOUT_LINE,
  ABOUT_NAV,
  ABOUT_PAGE,
  ABOUT_TEXT,
  AboutFrame,
  aboutSections,
  aboutTokens,
  atPrivacyPath,
} from '../../src/chrome/frames/about';
import { PRIVACY_NAV, PRIVACY_TEXT } from '../../src/chrome/frames/privacy-text';
import { BEAT_MINUTES, BEAT_STATES } from '../../shared/cloud/api';
import { type ChromeServices, ServicesCtx } from '../../src/chrome/kit/hooks';
import { FrameStack } from '../../src/chrome/kit/stack';

describe('aboutSections', () => {
  const secs = aboutSections(ABOUT_TEXT);

  it('finds the ten sections in order, the intro untitled', () => {
    expect(secs.map((s) => s.id)).toEqual(ABOUT_NAV.map((n) => n.id));
    expect(secs[0]!.title).toBe('');
    expect(secs[1]!.title).toBe('MUME — MULTI-USERS IN MIDDLE-EARTH');
    expect(secs.map((s) => s.title).slice(2)).toEqual([
      'GETTING STARTED',
      'BUILT FOR PVP',
      'WHAT IS INSIDE',
      'SETTINGS',
      'WHAT THE SITE KNOWS',
      'LUA SCRIPTS',
      'CREDITS',
      'LICENCE',
    ]);
  });

  it('groups key/value rows and keeps the paragraphs', () => {
    const kv = (id: string) => secs.find((s) => s.id === id)!.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
    expect(kv('inside')).toEqual(['Panes', 'Profile', 'Map', 'Weather', 'Runs', 'Phone']);
    expect(kv('credits')).toEqual(['MMapper', 'Tilesets', 'Cockpit', 'MUME', 'Fonts', 'Libraries', 'TinTin++']);
    expect(kv('mume')).toEqual(['Website', 'Discord']);
    const mume = secs.find((s) => s.id === 'mume')!.blocks;
    expect(mume.map((b) => ('p' in b ? 'p' : 'kv'))).toEqual(['p', 'p', 'p', 'p', 'kv']);
    const start = secs.find((s) => s.id === 'start')!.blocks;
    expect(start.map((b) => ('p' in b ? 'p' : 'kv'))).toEqual(['p', 'p', 'p', 'p', 'kv']);
    expect(secs[0]!.blocks).toHaveLength(1);
    // Every line of the text lands in exactly one block.
    const lines = ABOUT_TEXT.split('\n').filter((l) => l.trim() !== '').length;
    const blocks = secs.reduce((n, s) => n + (s.title ? 1 : 0) + s.blocks.reduce((m, b) => m + ('p' in b ? 1 : b.kv.length), 0), 0);
    expect(blocks).toBe(lines);
  });

  it('parses any text in the format; unknown headings get an id from their words', () => {
    const s = aboutSections('Intro.\n\nNEW PART\nText.\n  Key  Value\n  Other key  Its value');
    expect(s.map((x) => x.id)).toEqual(['intro', 'new-part']);
    expect(s[1]!.blocks).toEqual([{ p: 'Text.' }, { kv: [['Key', 'Value'], ['Other key', 'Its value']] }]);
  });

  it('the rail letters are unique and inside their labels', () => {
    const letters = ABOUT_NAV.map((n) => n.letter);
    expect(new Set(letters).size).toBe(letters.length);
    for (const n of ABOUT_NAV) expect(n.nav.toLowerCase()).toContain(n.letter);
  });

  it('states the facts of the new pages', () => {
    expect(ABOUT_TEXT).toContain('History, Spotlights and Credits on the start page look back at your runs');
    expect(ABOUT_TEXT).toContain('Third-party notices: THIRD_PARTY_NOTICES.md');
    expect(ABOUT_TEXT).not.toContain('card at the top right');
    // Cut for newcomers (ADR 0132 addendum, 2026-11-08).
    expect(ABOUT_TEXT).not.toMatch(/TinTin\+\+ syntax|#weather demo|Behind its menu|underlined letter/);
    expect(ABOUT_TEXT).not.toMatch(/\bMANUAL\b|\bHELP in\b/);
  });
});

describe('aboutTokens', () => {
  it('finds every link: web addresses over https, the site files under the base', () => {
    const links = aboutTokens(ABOUT_TEXT, '/app/').flatMap((t) => ('link' in t ? [[t.link, t.href]] : []));
    expect(links).toEqual([
      ['mume.org', 'https://mume.org'],
      ['discord.gg/XkZN55am9a', 'https://discord.gg/XkZN55am9a'],
      ['docs.mume.org/resources/newcomers', 'https://docs.mume.org/resources/newcomers'],
      ['mume.org/help/newbie', 'https://mume.org/help/newbie'],
      ['mume.org/help/basics', 'https://mume.org/help/basics'],
      ['docs.mume.org/wiki/guides', 'https://docs.mume.org/wiki/guides'],
      ['github.com/MUME/MMapper', 'https://github.com/MUME/MMapper'],
      ['fonts/README.md', '/app/fonts/README.md'],
      ['tintin.mudhalla.net', 'https://tintin.mudhalla.net'],
      ['LICENSE.txt', '/app/LICENSE.txt'],
      ['github.com/Khazdul/webcockpit', 'https://github.com/Khazdul/webcockpit'],
      ['THIRD_PARTY_NOTICES.md', '/app/THIRD_PARTY_NOTICES.md'],
    ]);
  });

  it('marks game commands and keeps the text around them', () => {
    expect(aboutTokens('Try #help, then #weather demo or ?safe.')).toEqual([
      { text: 'Try ' },
      { cmd: '#help' },
      { text: ', then ' },
      { cmd: '#weather demo' },
      { text: ' or ' },
      { cmd: '?safe' },
      { text: '.' },
    ]);
    expect(aboutTokens('No links here.')).toEqual([{ text: 'No links here.' }]);
    expect(aboutTokens('See mume.org.')).toEqual([{ text: 'See ' }, { link: 'mume.org', href: 'https://mume.org' }, { text: '.' }]);
  });
});

// ------------------------------------------------------------ the page

const SEC = 1000; // px between section heads
const VIEW = 600; // the scroller's height
const FULL = 9 * SEC + 500; // the leaf's height: Licence lies within the last view

let saved: (PropertyDescriptor | undefined)[] = [];
let savedScrollTo: unknown;
const props = ['offsetTop', 'clientHeight', 'scrollHeight'] as const;

beforeEach(() => {
  saved = props.map((p) => Object.getOwnPropertyDescriptor(HTMLElement.prototype, p));
  savedScrollTo = (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo;
  // A smooth scroll lands at once in the test DOM (the page waits for `scrollend` or a quiet moment).
  (Element.prototype as unknown as { scrollTo: (o: ScrollToOptions) => void }).scrollTo = function (this: Element, o: ScrollToOptions) {
    this.scrollTop = o.top ?? 0;
    this.dispatchEvent(new Event('scroll'));
  };
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      const all = [...document.querySelectorAll('[data-sec]')];
      const i = all.indexOf(this);
      return i < 0 ? 0 : i * SEC + 30;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('wc-about-body') ? VIEW : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('wc-about-body') ? FULL : 0;
    },
  });
});

afterEach(() => {
  render(null, document.body);
  props.forEach((p, i) => {
    const d = saved[i];
    if (d) Object.defineProperty(HTMLElement.prototype, p, d);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[p];
  });
  (Element.prototype as unknown as { scrollTo?: unknown }).scrollTo = savedScrollTo;
});

let popped = 0;

async function mountAbout(version = '9.9.9', commit = 'abc1234'): Promise<void> {
  popped = 0;
  const svc = { version, commit } as unknown as ChromeServices;
  await act(async () => {
    render(
      <ServicesCtx.Provider value={svc}>
        <FrameStack root={<AboutFrame />} active onRootBack={() => popped++} />
      </ServicesCtx.Provider>,
      document.body,
    );
  });
}

const key = async (k: string, o: KeyboardEventInit = {}): Promise<void> => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  });
};
const q = (sel: string) => document.querySelector<HTMLElement>(sel);
const body = () => q('.wc-about-body')!;
const top = () => body().scrollTop;
const lit = () => q('.wc-about-rail .wc-lk-row.is-on')?.textContent;
const pill = () => q('.wc-about-strip .wc-lk-opt[aria-checked="true"]')?.textContent;
/** Scrolls as the reader would (not a jump) and lets the spy run. */
const scrollBy = async (y: number): Promise<void> => {
  await act(async () => {
    body().scrollTop = y;
    body().dispatchEvent(new Event('scroll'));
  });
};
/** Ends a smooth scroll (as the browser's `scrollend`). */
const settle = async (): Promise<void> => {
  await act(async () => {
    body().dispatchEvent(new Event('scrollend'));
  });
};

describe('About: the leaf', () => {
  it('shows the head, the lead-in, the sections, the kv tables, the links and the seal', async () => {
    await mountAbout();
    expect(q('.wc-lk-box.wc-lk-box-large')?.getAttribute('aria-label')).toBe('About');
    expect(q('.wc-about-head .wc-wordmark')).not.toBeNull();
    expect(q('.wc-about-ver')?.textContent).toBe('WebCockpit 9.9.9 (abc1234)');
    expect(q('.wc-about-lead')?.textContent).toMatch(/^WebCockpit is a MUD client for MUME/);
    expect([...document.querySelectorAll('.wc-about-h')].map((h) => h.textContent)).toHaveLength(9);
    expect(document.querySelectorAll('.wc-about-kv')).toHaveLength(4);
    expect(q('.wc-about-kv dt')?.textContent).toBe('Website');
    // The privacy page opens in the stack (its own test below); every other link in a new tab.
    const privacy = [...document.querySelectorAll<HTMLAnchorElement>('.wc-about-leaf a[href="/privacy"]')];
    expect(privacy.map((a) => a.textContent)).toEqual(['privacy page']);
    expect(privacy[0]!.target).toBe('');
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.wc-about-leaf a:not([href="/privacy"])')];
    expect(links).toHaveLength(12);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
    }
    expect(links.at(-1)!.getAttribute('href')).toBe('/THIRD_PARTY_NOTICES.md');
    expect([...document.querySelectorAll('.wc-about-cmd')].map((c) => c.textContent)).toEqual([
      'pray to the tower hills',
      'help newbie',
      'consider',
      'flee',
      'who ranger',
      '#help',
      '?safe',
    ]);
    expect(q('.wc-about-colophon .wc-lk-seal')).not.toBeNull();
    // No commit: the version alone.
    render(null, document.body);
    await mountAbout('1.0.0', '');
    expect(q('.wc-about-ver')?.textContent).toBe('WebCockpit 1.0.0');
  });

  it('the rail and the strip list the sections with their letters; the first is lit', async () => {
    await mountAbout();
    const rows = [...document.querySelectorAll('.wc-about-rail .wc-lk-row')];
    expect(rows.map((r) => r.textContent)).toEqual(ABOUT_NAV.map((n) => n.nav));
    expect(rows.map((r) => r.querySelector('u.wc-sk')?.textContent?.toLowerCase())).toEqual(ABOUT_NAV.map((n) => n.letter));
    expect([...document.querySelectorAll('.wc-about-strip .wc-lk-opt')].map((o) => o.textContent)).toEqual(ABOUT_NAV.map((n) => n.nav));
    expect(lit()).toBe('WebCockpit');
    expect(pill()).toBe('WebCockpit');
    expect(q('.wc-about-rail .is-on')?.getAttribute('aria-current')).toBe('true');
  });

  it('scrolls with ↑ ↓, PgUp / PgDn, Space, Enter, Home and End', async () => {
    await mountAbout();
    await key('ArrowDown');
    expect(top()).toBe(ABOUT_LINE);
    await key('ArrowDown');
    await key('ArrowUp');
    expect(top()).toBe(ABOUT_LINE);
    await key('Home');
    await settle();
    expect(top()).toBe(0);
    const page = Math.round(VIEW * ABOUT_PAGE);
    await key('PageDown');
    await settle();
    expect(top()).toBe(page);
    await key(' ');
    await settle();
    expect(top()).toBe(2 * page);
    await key(' ', { shiftKey: true });
    await settle();
    expect(top()).toBe(page);
    await key('Enter');
    await settle();
    expect(top()).toBe(2 * page);
    await key('PageUp');
    await settle();
    expect(top()).toBe(page);
    await key('End');
    await settle();
    expect(top()).toBe(FULL - VIEW);
    expect(lit()).toBe('Licence');
    expect(popped).toBe(0);
  });

  it('two pages in a row add up while the first is still scrolling', async () => {
    await mountAbout();
    await key('PageDown');
    await key('PageDown');
    await settle();
    expect(top()).toBe(2 * Math.round(VIEW * ABOUT_PAGE));
  });

  it('the spy lights the section whose head has passed a third of the view', async () => {
    await mountAbout();
    await scrollBy(3 * SEC + 30 - VIEW / 3 + 1);
    expect(lit()).toBe('Built for PvP');
    expect(pill()).toBe('Built for PvP');
    await scrollBy(3 * SEC + 30 - VIEW / 3 - 10);
    expect(lit()).toBe('Getting started');
    await scrollBy(0);
    expect(lit()).toBe('WebCockpit');
  });

  it('a letter, a rail row or a pill jumps; the jumped-to section stays lit until the reader scrolls', async () => {
    await mountAbout();
    await key('c');
    expect(lit()).toBe('Credits');
    expect(top()).toBe(8 * SEC + 30 - 18);
    await settle();
    expect(lit()).toBe('Credits');
    await key('l');
    await settle();
    // Licence lies near the end: the jump lands at the end and keeps Licence lit.
    expect(top()).toBe(FULL - VIEW);
    expect(lit()).toBe('Licence');
    await key('w');
    await settle();
    expect(top()).toBe(0);
    expect(lit()).toBe('WebCockpit');
    await act(async () => q('.wc-about-rail .wc-lk-row[data-sec-link="lua"]')!.click());
    await settle();
    expect(lit()).toBe('Lua scripts');
    expect(top()).toBe(7 * SEC + 30 - 18);
    await act(async () => q('.wc-about-strip .wc-lk-opt[data-opt="mume"]')!.click());
    await settle();
    expect(pill()).toBe('MUME');
    expect(top()).toBe(SEC + 30 - 18);
    // A tap on the lit pill goes back to its head.
    await scrollBy(SEC + 200);
    await act(async () => q('.wc-about-strip .wc-lk-opt[data-opt="mume"]')!.click());
    await settle();
    expect(top()).toBe(SEC + 30 - 18);
    // Letters with Ctrl are not shortcuts.
    await key('c', { ctrlKey: true });
    expect(lit()).toBe('MUME');
  });

  it('Esc leaves; other keys stay on the page', async () => {
    await mountAbout();
    await key('ArrowRight');
    await key('x');
    expect(popped).toBe(0);
    await key('Escape');
    expect(popped).toBe(1);
  });
});

// ------------------------------------------------------------ the privacy page (stage 59)

describe('the privacy page', () => {
  const secs = aboutSections(PRIVACY_TEXT, PRIVACY_NAV);

  it('parses into the sections of its rail; letters unique and inside their labels', () => {
    expect(secs.map((x) => x.id)).toEqual(PRIVACY_NAV.map((n) => n.id));
    const letters = PRIVACY_NAV.map((n) => n.letter);
    expect(new Set(letters).size).toBe(letters.length);
    for (const n of PRIVACY_NAV) expect(n.nav.toLowerCase()).toContain(n.letter);
  });

  it('names the five fields of a beat, its period, the retention, the processor and the contact', () => {
    const sent = secs.find((x) => x.id === 'sent')!.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
    expect(sent).toEqual(['Device', 'Version', 'Device type', 'Browser', 'State']);
    expect(BEAT_STATES).toHaveLength(3);
    expect(BEAT_MINUTES).toBe(5);
    expect(PRIVACY_TEXT).toContain('every five minutes');
    expect(PRIVACY_TEXT).toContain('wc.device');
    expect(PRIVACY_TEXT).toContain('35 days');
    expect(PRIVACY_TEXT).toContain('90 days');
    expect(PRIVACY_TEXT).toContain('No IP address is stored');
    expect(PRIVACY_TEXT).toContain('Cloudflare');
    expect(PRIVACY_TEXT).toContain('abuse@mumecockpit.com');
  });

  it('the address and the device key are tokens: a mailto link and the terminal font', () => {
    expect(aboutTokens('Write to abuse@mumecockpit.com.')).toEqual([
      { text: 'Write to ' },
      { link: 'abuse@mumecockpit.com', href: 'mailto:abuse@mumecockpit.com' },
      { text: '.' },
    ]);
    expect(aboutTokens('remove wc.device from')).toEqual([{ text: 'remove ' }, { cmd: 'wc.device' }, { text: ' from' }]);
    expect(aboutTokens('The privacy page has it.')).toEqual([{ text: 'The ' }, { page: 'privacy', text: 'privacy page' }, { text: ' has it.' }]);
  });

  it('knows its address under the base', () => {
    expect(atPrivacyPath('/privacy', '/')).toBe(true);
    expect(atPrivacyPath('/privacy/', '/')).toBe(true);
    expect(atPrivacyPath('/privacy.html', '/')).toBe(true);
    expect(atPrivacyPath('/', '/')).toBe(false);
    expect(atPrivacyPath('/privacyx', '/')).toBe(false);
    expect(atPrivacyPath('/wc/privacy', '/wc/')).toBe(true);
    expect(atPrivacyPath('/privacy', '/wc/')).toBe(false);
  });

  it("About's link opens the leaf in the stack: its head, sections and mail link; Esc goes back to About", async () => {
    await mountAbout();
    await act(async () => q('.wc-about-leaf a[href="/privacy"]')!.click());
    expect(q('.wc-frame:not([hidden]) .wc-lk-box')?.getAttribute('aria-label')).toBe('Privacy');
    const top = (sel: string) => [...document.querySelectorAll<HTMLElement>(`.wc-frame:not([hidden]) ${sel}`)];
    expect(top('.wc-about-ver')[0]?.textContent).toMatch(/^Last changed /);
    expect(top('.wc-about-h').map((h) => h.textContent)).toEqual(secs.slice(1).map((x) => x.title));
    expect(top('a[href^="mailto:"]').length).toBeGreaterThan(0);
    await key('Escape');
    expect(q('.wc-frame:not([hidden]) .wc-lk-box')?.getAttribute('aria-label')).toBe('About');
    expect(popped).toBe(0);
  });
});
