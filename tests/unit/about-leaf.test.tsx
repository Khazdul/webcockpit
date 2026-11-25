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
import { LOGIN_TURNSTILE_AFTER, REPORTS_TO_HIDE, SESSION_SECONDS } from '../../shared/cloud/api';
import { KEEP_VIEWS_DAYS } from '../../worker/pub';
import { PRIVACY_ACCOUNTS, PRIVACY_ACCOUNTS_NAV, withAccounts } from '../../src/chrome/frames/privacy-accounts';
import { PRIVACY_NAV, PRIVACY_TEXT } from '../../src/chrome/frames/privacy-text';
import { PRIVACY_COMMUNITY, PRIVACY_COMMUNITY_NAV, PRIVACY_SHARE, PRIVACY_SHARE_NAV, withShare } from '../../src/chrome/frames/privacy-share';
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
      'LUA SCRIPTS',
      'ACCOUNT AND SETTINGS',
      'CREDITS',
      'WHAT THE SITE KNOWS',
      'LICENCE',
    ]);
  });

  it('groups key/value rows and keeps the paragraphs', () => {
    const kv = (id: string) => secs.find((s) => s.id === id)!.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
    expect(kv('inside')).toEqual(['Panes', 'Profile', 'Map', 'Weather', 'Runs', 'Community', 'Phone']);
    expect(kv('credits')).toEqual(['MUME', 'Cockpit', 'MMapper', 'Tilesets', 'TinTin++', 'Fonts', 'Libraries']);
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
    expect(ABOUT_TEXT).toContain('History on the start page looks back at your runs (Sessions, Spotlights and the Diary)');
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
      ['youtu.be/6fVwlGGckUg', 'https://youtu.be/6fVwlGGckUg'],
      ['mume.org', 'https://mume.org'],
      ['discord.gg/XkZN55am9a', 'https://discord.gg/XkZN55am9a'],
      ['docs.mume.org/resources/newcomers', 'https://docs.mume.org/resources/newcomers'],
      ['mume.org/help/newbie', 'https://mume.org/help/newbie'],
      ['mume.org/help/basics', 'https://mume.org/help/basics'],
      ['docs.mume.org/wiki/guides', 'https://docs.mume.org/wiki/guides'],
      ['github.com/MUME/MMapper', 'https://github.com/MUME/MMapper'],
      ['tintin.mudhalla.net', 'https://tintin.mudhalla.net'],
      ['fonts/README.md', '/app/fonts/README.md'],
      ['abuse@mumecockpit.com', 'mailto:abuse@mumecockpit.com'],
      ['github.com/Khazdul/webcockpit', 'https://github.com/Khazdul/webcockpit'],
      ['LICENSE.txt', '/app/LICENSE.txt'],
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
    // The abuse address (stage 64) is a mailto link in the same tab.
    const mail = [...document.querySelectorAll<HTMLAnchorElement>('.wc-about-leaf a[href^="mailto:"]')];
    expect(mail.map((a) => [a.textContent, a.target])).toEqual([['abuse@mumecockpit.com', '']]);
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.wc-about-leaf a:not([href="/privacy"]):not([href^="mailto:"])')];
    expect(links).toHaveLength(13);
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
    expect(top()).toBe(7 * SEC + 30 - 18);
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
    expect(top()).toBe(5 * SEC + 30 - 18);
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

// ------------------------------------------------------------ the account section (stage 62)

describe("the privacy page's account section (flag `accounts`)", () => {
  const { text, nav } = withAccounts(PRIVACY_TEXT, PRIVACY_NAV);
  const secs = aboutSections(text, nav);

  it('replaces Coming later in its place, the three sentences an account makes untrue, and ends with Delete account', () => {
    expect(secs.map((x) => x.id)).toEqual(PRIVACY_NAV.map((n) => (n.id === 'later' ? 'accounts' : n.id)));
    expect(text).not.toContain('COMING LATER');
    expect(text).toContain('unless you choose to have an account (see Accounts below).');
    expect(text).not.toContain('is ever sent to the site');
    const guest = PRIVACY_TEXT.replace(/COMING LATER\n[^\n]*\n/, '').split('\n');
    expect(text).toContain('so export what you want to keep first, unless an account keeps it.');
    expect(text.endsWith('\nTo remove an account and everything in it, use Delete account on the Account page.')).toBe(true);
    const shown = text.replace(`${PRIVACY_ACCOUNTS}\n`, '').split('\n').slice(0, -1);
    expect(shown.length).toBe(guest.length);
    expect(shown.filter((l, i) => l !== guest[i]).length).toBe(3);
    expect(nav.find((n) => n.id === 'accounts')).toBe(PRIVACY_ACCOUNTS_NAV);
  });

  it('its rail entry: Accounts, a letter of its own inside the label', () => {
    const letters = nav.map((n) => n.letter);
    expect(new Set(letters).size).toBe(letters.length);
    for (const n of nav) expect(n.nav.toLowerCase()).toContain(n.letter);
    expect(PRIVACY_ACCOUNTS_NAV.nav).toBe('Accounts');
  });

  it('a paragraph and the six rows, each row one line', () => {
    const sec = secs.find((x) => x.id === 'accounts')!;
    expect(sec.title).toBe('ACCOUNTS');
    expect(sec.blocks.filter((b) => 'p' in b)).toHaveLength(1);
    const rows = sec.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
    expect(rows).toEqual(['What is stored', 'Runs', 'Comm history', 'Sessions', 'Limits', 'Deleting']);
  });

  it('says the figures the Worker keeps to', () => {
    expect(SESSION_SECONDS).toBe(180 * 86_400);
    expect(LOGIN_TURNSTILE_AFTER).toBe(3);
    expect(PRIVACY_ACCOUNTS).toContain('180 days');
    expect(PRIVACY_ACCOUNTS).toContain('after three failed tries');
    expect(PRIVACY_ACCOUNTS).toContain('never more than ten days');
  });
});

// ------------------------------------------------------------ the share links section (stage 64)

describe("the privacy page's share links section (flags `accounts` and `share`)", () => {
  const acc = withAccounts(PRIVACY_TEXT, PRIVACY_NAV);
  const { text, nav } = withShare(acc.text, acc.nav);
  const secs = aboutSections(text, nav);

  it('comes after Accounts and before Who runs it; nothing else changes', () => {
    const ids = secs.map((x) => x.id);
    expect(ids.indexOf('share')).toBe(ids.indexOf('who') - 1);
    expect(ids.indexOf('share')).toBeGreaterThan(ids.indexOf('accounts'));
    expect(text.replace(`${PRIVACY_SHARE}\n`, '')).toBe(acc.text);
    expect(nav.find((n) => n.id === 'share')).toBe(PRIVACY_SHARE_NAV);
    const letters = nav.map((n) => n.letter);
    expect(new Set(letters).size).toBe(letters.length);
    for (const n of nav) expect(n.nav.toLowerCase()).toContain(n.letter);
  });

  it('a paragraph and the four rows, each row one line', () => {
    const sec = secs.find((x) => x.id === 'share')!;
    expect(sec.title).toBe('SHARE LINKS');
    expect(sec.blocks.filter((b) => 'p' in b)).toHaveLength(1);
    const rows = sec.blocks.flatMap((b) => ('kv' in b ? b.kv.map(([k]) => k) : []));
    expect(rows).toEqual(['Who can watch', 'What is kept', 'Removing it', 'Reports']);
  });

  it('says what the Worker and the watch page do, and the abuse address', () => {
    expect(REPORTS_TO_HIDE).toBe(5);
    expect(KEEP_VIEWS_DAYS).toBe(2);
    expect(PRIVACY_SHARE).toContain('Map, Spells and Group');
    expect(PRIVACY_SHARE).not.toContain('download');
    // Review 2 R2-3: the status data that goes, the map whenever there are rooms, a copy anyone can save, the level kept.
    expect(PRIVACY_SHARE).toContain("the game's own status data that the Map, Spells and Group panes use (the character's name, level, race and class, and its vitals as the game sent them), and the four bonuses the Character pane fetched from the game (offensive, defensive and parry bonus and absorption)");
    expect(PRIVACY_SHARE).toContain('no channel records and no other pane');
    expect(PRIVACY_SHARE).not.toContain('when the map is on');
    expect(PRIVACY_SHARE).toContain('the map of the rooms the log passes, if it passes any');
    expect(PRIVACY_SHARE).toContain('Whoever can watch a log can also save a copy of it');
    expect(PRIVACY_SHARE).toContain("level (not shown on the pages, but part of the log's public data)");
    expect(PRIVACY_SHARE).toContain('five accounts');
    expect(PRIVACY_SHARE).toContain('deleted after two days');
    expect(PRIVACY_SHARE).toContain('Anyone with the link');
    expect(aboutTokens(PRIVACY_SHARE)).toContainEqual({ link: 'abuse@mumecockpit.com', href: 'mailto:abuse@mumecockpit.com' });
  });

  it('About gives the abuse address too', () => {
    const knows = aboutSections(ABOUT_TEXT).find((x) => x.id === 'knows')!;
    const p = knows.blocks.map((b) => ('p' in b ? b.p : '')).join(' ');
    expect(aboutTokens(p)).toContainEqual({ link: 'abuse@mumecockpit.com', href: 'mailto:abuse@mumecockpit.com' });
  });
});


describe('privacy: the community section (stage 65)', () => {
  it('comes after the share links section, with its rail entry, only when asked for', () => {
    const base = 'INTRO\nWHO RUNS IT\nus\n';
    const nav = [{ id: 'who', head: 'WHO RUNS IT', nav: 'Who runs it', letter: 'w' }] as Parameters<typeof withShare>[1];
    const off = withShare(base, nav);
    expect(off.text).not.toContain(PRIVACY_COMMUNITY);
    const on = withShare(base, nav, { community: true });
    expect(on.text.indexOf(PRIVACY_SHARE)).toBeLessThan(on.text.indexOf(PRIVACY_COMMUNITY));
    expect(on.text.indexOf(PRIVACY_COMMUNITY)).toBeLessThan(on.text.indexOf('WHO RUNS IT'));
    expect(on.nav.map((n) => n.id)).toEqual(['share', 'community', 'who']);
    expect(on.nav[1]).toBe(PRIVACY_COMMUNITY_NAV);
    // A note has no age limit (ADR 0155 addendum 2026-11-17).
    expect(PRIVACY_COMMUNITY).toContain('It stays until you remove it or delete your account.');
    expect(PRIVACY_COMMUNITY).not.toMatch(/\d+ days/);
    expect(PRIVACY_COMMUNITY).toContain('account name');
    // Comments and notes are public with the account name, guests included.
    expect(PRIVACY_COMMUNITY).toMatch(/Comments +A comment on a log's watch page is public: it is shown under the log with your account name.*with or without an account/);
    expect(PRIVACY_COMMUNITY).toMatch(/Random Runes +A note on the board is public: it is shown with your account name.*with or without an account/);
  });
});
