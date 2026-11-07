// About (Inv §3.11; stage 47, ADR 0132): round 7's A "Bladet", one long
// leaf in layout B's large box. Our own text (`ABOUT_TEXT`, one source)
// parsed into sections by `aboutSections`: an ALL-CAPS line is a heading,
// an indented `  key  description` line a key/value row, every other line
// a paragraph; the untitled first section is the intro.
//
// The leaf: the small wordmark (still) and `WebCockpit <version>
// (<commit>)` (ADR 0025) at its head, an ornament rule, the intro as the
// lead-in, then each section (a Cinzel head with a short rule, Cormorant
// paragraphs, key/value rows as a small two-column table), and the colophon
// (an ornament rule and the "M" seal). Web addresses (mume.org, discord.gg,
// github.com, tintin.mudhalla.net) and the site's own files (LICENSE.txt,
// THIRD_PARTY_NOTICES.md, fonts/README.md, served at the site root, see
// vite.config.ts) are links that open in a new tab; game commands
// (#help, #weather demo, ?safe) are set in the terminal font.
//
// The contents rail at the left (a strip of pills above the text when the
// box is narrow) follows the reading: the section whose head has passed a
// third of the view is lit, the last one at the end. The spy is a passive
// scroll listener over cached section offsets (measured by a
// ResizeObserver, never per scroll event). A click or the section's letter
// jumps (smooth; instant with reduced motion); while a jump runs, the
// jumped-to section stays lit.
//
// Keys: ↑ / ↓ about 40 px, PgUp / PgDn / Space / Enter 85 % of the view
// (Shift+Space back), Home / End, the letters W M B G I S U C L, Esc / Back.

import './about.css';
import type { VNode } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useServices } from '../kit/hooks';
import {
  Box,
  BoxBody,
  BoxHead,
  KeyLabel,
  OrnRule,
  Seal,
  Seg,
  letterAction,
  lookFrame,
  useBoxSettled,
  useReducedMotion,
} from '../kit/look';
import { useKeys, useNav } from '../kit/stack';
import { LookWordmark } from '../start-surface';

export const ABOUT_TEXT = `WebCockpit is a MUD client for MUME, built for fast PvP. It runs in your browser from a link: nothing to install, no server in between, and nothing kept anywhere but this browser. It is modelled on Cockpit, a terminal client for MUME, and aims to look and feel the same.

MUME — MULTI-USERS IN MIDDLE-EARTH
MUME is a free, text-based multiplayer game set in Tolkien's Middle-earth in the late Third Age, the years before the War of the Ring. It has run continuously since 1991, is kept alive by a volunteer community, and is one of the oldest active DikuMUDs.

Pick a side. The Free Peoples — Men, Elves, Hobbits, Dwarves and Beornings — hold the West. The forces of Sauron — Trolls, Black Númenóreans and Orcs — push from the East. Renegade Zaugurz orcs are hated by both. The war between the sides is the spine of the game.

The world is wide and true to the books: the Shire, Bree, Rivendell, Moria, Lothlórien, Fangorn, Isengard, the Misty Mountains and much more, all there to explore. Roleplay is encouraged, and names that do not fit Middle-earth do not last.

BUILT FOR PVP
PvP is what sets MUME apart: towers and terrain to take, deep skill and spell systems, and constant skirmishes between the sides. Big raids draw a hundred players or more. The pace is high, and a fast client with reliable reflexes is what lets you keep up.

WebCockpit is made for that. Keystrokes go to the game at once, macros and actions fire without delay, and the panes show what matters in a fight: your vitals, spell and debuff timers, your group, the channels and the map.

MUME is free to play. No subscription, just connect.
  Website         mume.org
  Discord         discord.gg/XkZN55am9a

GETTING STARTED
Choose Enter MUME on the start page. Behind its menu runs MUME's own sky by the game clock: sun, moon, stars and the weather of the season, with the date and time of Middle-earth at the bottom right. Move with the arrow keys or the mouse; Enter, Space or a click opens an entry, and the underlined letter in each one is its shortcut (E for Enter MUME). Esc, or Back at the top left, goes back one page.

In the game, the menu bar at the right end of the input line holds Profile, Scripts, Panes, Settings, Fullscreen and Exit; Panes and Settings set up the panes and the look, and every change applies at once. On a phone, ☰ opens the menu.

Profile holds the aliases, actions, highlights, macros, timers and variables you play with. Edit one with Profile → Edit on the start page; in the game, Profile in the menu bar opens the editor. A profile is written in TinTin++ syntax. Help in the profile editor, or #help in the game, explains each command with examples. Profile → Import reads profiles from TinTin++, JMC, Powwow and Mudlet: drop the files on its page or choose them, and a receipt sums up what was translated.

WHAT IS INSIDE
  Panes           Character, Timers, Group, Communication, UI messages, Map and Statistics. Dock them on any side, in several columns or rows, or let them float.
  Map             Reads MMapper maps and follows you as you move. Settings → Mapper in the game picks the tileset, among them Shimrod's, which follows MUME's season.
  Weather         Sky, rain, snow, fog and lightning over the whole client, driven by the game. Settings → Weather effects in the game turns them off or picks what to show; #weather demo plays them all.
  Runs            Every login is recorded in this browser. History on the start page lists them: rate a run, open its Statistics or its log in the player, and back them all up or restore them. Spotlights shows the best moments as a wall of cards, and Credits tells your characters' deeds as a book. The filter row on the Spotlights page picks the kinds, characters and period shown there and in Credits.
  Export          Cut a run, add comments and export it as an HTML replay anyone can open, or as plain text.
  Phone           Log in and chat from a phone; History, Export and the scripts' settings work there too. Real play is for a keyboard.

SETTINGS
Settings and profiles are kept in this browser only. Use Profile → Export to keep a copy of a profile. If a setting makes the page unusable, open the link with ?safe added to start with the default look.

LUA SCRIPTS
Beside the profile, WebCockpit runs scripts written in Lua, with its own API for triggers, aliases, keys, timers, GMCP, panes and the map. Open them with Scripts on the start page or in the game's menu bar, where ready-made scripts wait to be turned on: an almanac, a port key manager, map search and more. The editor helps you write your own: it completes commands, shows their syntax and help as you type, and marks errors at once. Manual on the Scripts page, or F1 in the editor, opens the full manual with examples.

CREDITS
  MMapper         The map is built on MMapper, the graphical mapper for MUME by the MMapper Authors. Its look, tiles and fonts come from MMapper, and the default map is an MMapper map. MMapper runs on Windows, macOS and Linux: github.com/MUME/MMapper
  Tilesets        Shimrod's seasonal tiles; Desert by Khazdul, from Shimrod's tiles; Gefe & Rik by Octavia, after Gefe and Rik's maps; Gray's Map by Sunnyl75, after Gray's maps.
  Cockpit         The terminal client for MUME that WebCockpit is modelled on.
  MUME            The game, its world and its texts belong to the MUME team and the volunteers who have built it since 1991.
  Fonts           Agave, Anonymous Pro, Cascadia Mono, DejaVu Sans Mono, Fantasque Sans Mono, Fira Code, Go Mono, Hack, Hermit, IBM 3270, IBM Plex Mono, Inconsolata, JetBrains Mono, mononoki and Noto Sans Mono for the text; Cinzel for the pane titles, the start page's menu, headings and buttons and the MUME wordmark; Cormorant Garamond for the start page's quote, notes and pages, and Cormorant SC for its small capitals. Each is under its own licence (fonts/README.md). Lucida Console is used only when installed and is not part of WebCockpit.
  Libraries       Preact, CodeMirror and wasmoon (Lua 5.4).
  TinTin++        The scripting language profiles are written in: tintin.mudhalla.net

LICENCE
WebCockpit is free software under the GNU General Public License, version 2 or later. Parts of the map are derived from MMapper (Copyright (C) The MMapper Authors). The fonts, libraries and map assets it ships are each under their own licence. Licence text: LICENSE.txt. Source code: github.com/Khazdul/webcockpit

MUME is run by its own team; WebCockpit is an independent client and is not made or endorsed by MUME.

Third-party notices: THIRD_PARTY_NOTICES.md`;

// ------------------------------------------------------------ the text as structure

/** A block of a section: a paragraph, or a run of key/value rows. */
export type AboutBlock = { p: string } | { kv: [key: string, text: string][] };

export interface AboutSection {
  /** Stable id (the rail's table below; else from the heading). */
  id: string;
  /** The heading as written (ALL CAPS); empty for the intro. */
  title: string;
  blocks: AboutBlock[];
}

/** The rail: each section's id, its label in the contents and its letter (`head`: how its heading starts). */
export const ABOUT_NAV: readonly { id: string; head: string; nav: string; letter: string }[] = [
  { id: 'intro', head: '', nav: 'WebCockpit', letter: 'w' },
  { id: 'mume', head: 'MUME', nav: 'MUME', letter: 'm' },
  { id: 'pvp', head: 'BUILT FOR PVP', nav: 'Built for PvP', letter: 'b' },
  { id: 'start', head: 'GETTING STARTED', nav: 'Getting started', letter: 'g' },
  { id: 'inside', head: 'WHAT IS INSIDE', nav: 'What is inside', letter: 'i' },
  { id: 'settings', head: 'SETTINGS', nav: 'Settings', letter: 's' },
  { id: 'lua', head: 'LUA SCRIPTS', nav: 'Lua scripts', letter: 'u' },
  { id: 'credits', head: 'CREDITS', nav: 'Credits', letter: 'c' },
  { id: 'licence', head: 'LICENCE', nav: 'Licence', letter: 'l' },
];

const HEADING = /^[A-Z][A-Z —-]+$/;
const KV = /^ {2}(\S+(?: \S+)*?) {2,}(.*)$/;

const navOf = (title: string): (typeof ABOUT_NAV)[number] | undefined =>
  ABOUT_NAV.find((n) => (title === '' ? n.head === '' : n.head !== '' && title.startsWith(n.head)));

/** `ABOUT_TEXT` (or any text in its format) as sections. Pure. */
export function aboutSections(text: string): AboutSection[] {
  const out: { title: string; blocks: AboutBlock[] }[] = [{ title: '', blocks: [] }];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    if (HEADING.test(raw)) {
      out.push({ title: raw, blocks: [] });
      continue;
    }
    const s = out[out.length - 1]!;
    const m = raw.startsWith('  ') ? KV.exec(raw) : null;
    if (m) {
      const last = s.blocks[s.blocks.length - 1];
      const row: [string, string] = [m[1]!, m[2]!];
      if (last && 'kv' in last) last.kv.push(row);
      else s.blocks.push({ kv: [row] });
    } else s.blocks.push({ p: raw.trim() });
  }
  return out
    .filter((s, i) => i > 0 || s.blocks.length > 0)
    .map((s) => ({
      id: navOf(s.title)?.id ?? s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title: s.title,
      blocks: s.blocks,
    }));
}

/** A piece of text: plain, a link (`href`; the site's own files under the base), or a game command. */
export type AboutToken = { text: string } | { link: string; href: string } | { cmd: string };

const LINK_RE =
  /\b((?:mume\.org|discord\.gg|github\.com|tintin\.mudhalla\.net)(?:\/[\w./-]*[\w/])?|LICENSE\.txt|THIRD_PARTY_NOTICES\.md|fonts\/README\.md)|(#help|#weather demo|\?safe)(?!\w)/g;
/** The site's own files (served from `public/` or by vite.config.ts). */
const LOCAL_FILES = new Set(['LICENSE.txt', 'THIRD_PARTY_NOTICES.md', 'fonts/README.md']);

/** The links and game commands in a text. Pure; `base` is the site's base path. */
export function aboutTokens(text: string, base = '/'): AboutToken[] {
  const out: AboutToken[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ text: text.slice(at, i) });
    if (m[1]) out.push({ link: m[1], href: LOCAL_FILES.has(m[1]) ? `${base}${m[1]}` : `https://${m[1]}` });
    else out.push({ cmd: m[2]! });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** Text with its links (a new tab) and game commands (the terminal font). */
function Linked(p: { text: string }): VNode {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  return (
    <>
      {aboutTokens(p.text, base).map((t) =>
        'link' in t ? (
          <a class="wc-about-a" href={t.href} target="_blank" rel="noopener noreferrer">
            {t.link}
          </a>
        ) : 'cmd' in t ? (
          <code class="wc-about-cmd">{t.cmd}</code>
        ) : (
          t.text
        ),
      )}
    </>
  );
}

// ------------------------------------------------------------ the page

/** ↑ / ↓ scroll this far (px). */
export const ABOUT_LINE = 40;
/** A page is this share of the view. */
export const ABOUT_PAGE = 0.85;
/** The section whose head has passed this share of the view is the current one. */
export const ABOUT_SPY_AT = 1 / 3;
/** A jump puts the section's head this far under the top of the view (px). */
const JUMP_GAP = 18;
/** A smooth scroll has ended when no scroll event came for this long (ms; `scrollend` where it exists). */
const SCROLL_IDLE = 160;

/** The sections, parsed once (the text is a constant). */
let parsed: AboutSection[] | null = null;
const sections = (): AboutSection[] => (parsed ??= aboutSections(ABOUT_TEXT));

/** A section's label in the rail and its letter. */
function railOf(s: AboutSection): { nav: string; letter: string | undefined } {
  const n = ABOUT_NAV.find((x) => x.id === s.id);
  return n ? { nav: n.nav, letter: n.letter } : { nav: s.title, letter: undefined };
}

function Blocks(p: { blocks: AboutBlock[] }): VNode {
  return (
    <>
      {p.blocks.map((b, i) =>
        'p' in b ? (
          <p key={i} class="wc-about-p">
            <Linked text={b.p} />
          </p>
        ) : (
          <dl key={i} class="wc-lk-kv wc-about-kv">
            {b.kv.map(([k, v]) => (
              <div key={k} class="wc-about-kvr">
                <dt>{k}</dt>
                <dd>
                  <Linked text={v} />
                </dd>
              </div>
            ))}
          </dl>
        ),
      )}
    </>
  );
}

export const AboutFrame = lookFrame(function AboutFrame(): VNode {
  const { version, commit } = useServices();
  const nav = useNav();
  const settled = useBoxSettled();
  const reduced = useReducedMotion();
  const secs = sections();
  const rail = useMemo(() => secs.map(railOf), [secs]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLElement>(null);
  const [cur, setCur] = useState(0);

  // The cached geometry of the scroller: each section's top, the view's height, the end.
  const geo = useRef<{ tops: number[]; view: number; max: number }>({ tops: [], view: 0, max: 0 });
  // A jump or a smooth page in flight: where it goes.
  const flight = useRef<{ y: number } | null>(null);
  // The section a jump lit: it stays lit until the view scrolls after the jump has landed (a
  // jump near the end lands at the end, where the spy would light the last section).
  const pinned = useRef<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const spy = (): void => {
    const b = bodyRef.current;
    if (!b || pinned.current !== null) return;
    const g = geo.current;
    const top = b.scrollTop;
    const y = top + g.view * ABOUT_SPY_AT;
    let i = 0;
    g.tops.forEach((t, k) => {
      if (t <= y) i = k;
    });
    if (g.max > 0 && top >= g.max - 4) i = g.tops.length - 1;
    setCur(i);
  };
  const measure = (): void => {
    const b = bodyRef.current;
    if (!b) return;
    geo.current = {
      tops: [...b.querySelectorAll<HTMLElement>('[data-sec]')].map((s) => s.offsetTop),
      view: b.clientHeight,
      max: b.scrollHeight - b.clientHeight,
    };
    spy();
  };
  /** The flight has landed (or was interrupted): the spy takes over at the next scroll. */
  const land = (): void => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = null;
    flight.current = null;
  };
  const armIdle = (): void => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(land, SCROLL_IDLE);
  };

  useEffect(() => {
    const b = bodyRef.current;
    if (!b) return;
    const onScroll = (): void => {
      if (flight.current) armIdle();
      else pinned.current = null;
      spy();
    };
    // The reader's own wheel or finger ends a jump at once.
    const onUser = (): void => {
      land();
      pinned.current = null;
    };
    const opts = { passive: true } as const;
    b.addEventListener('scroll', onScroll, opts);
    b.addEventListener('scrollend', land, opts);
    b.addEventListener('wheel', onUser, opts);
    b.addEventListener('touchstart', onUser, opts);
    const RO = globalThis.ResizeObserver;
    const ro = RO ? new RO(() => measure()) : null;
    ro?.observe(b);
    if (leafRef.current) ro?.observe(leafRef.current);
    measure();
    return () => {
      b.removeEventListener('scroll', onScroll);
      b.removeEventListener('scrollend', land);
      b.removeEventListener('wheel', onUser);
      b.removeEventListener('touchstart', onUser);
      ro?.disconnect();
      if (idle.current) clearTimeout(idle.current);
    };
  }, []);
  // The box is laid out at its final size from its first frame; measure again once it has settled.
  useEffect(() => {
    if (settled) measure();
  }, [settled]);

  /** Scrolls to `y` (clamped): smooth unless `instant` or reduced motion; `lit` stays lit until it lands. */
  const scrollTo = (y: number, instant: boolean, lit: number | null = null): void => {
    const b = bodyRef.current;
    if (!b) return;
    const max = Math.max(0, b.scrollHeight - b.clientHeight);
    const to = Math.max(0, Math.min(max, Math.round(y)));
    pinned.current = lit;
    if (lit !== null) setCur(lit);
    if (instant || reduced || typeof b.scrollTo !== 'function') {
      // The scroll event of an instant jump still belongs to the jump.
      flight.current = { y: to };
      b.scrollTop = to;
      armIdle();
      return;
    }
    flight.current = { y: to };
    armIdle();
    b.scrollTo({ top: to, behavior: 'smooth' });
  };
  /** Where the view is going (a smooth scroll in flight counts as there). */
  const from = (): number => flight.current?.y ?? bodyRef.current?.scrollTop ?? 0;
  const jump = (i: number): void => {
    if (!geo.current.tops.length) measure();
    const t = geo.current.tops[i];
    if (t === undefined) return;
    scrollTo(i === 0 ? 0 : t - JUMP_GAP, false, i);
  };
  const page = (dir: 1 | -1): void => scrollTo(from() + dir * (bodyRef.current?.clientHeight ?? 0) * ABOUT_PAGE, false);
  const line = (dir: 1 | -1): void => scrollTo((bodyRef.current?.scrollTop ?? 0) + dir * ABOUT_LINE, true);

  useKeys((e, nk) => {
    if (e.key === ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      page(e.shiftKey ? -1 : 1);
      return true;
    }
    switch (nk) {
      case 'up':
        line(-1);
        return true;
      case 'down':
        line(1);
        return true;
      case 'pgup':
        page(-1);
        return true;
      case 'pgdn':
      case 'activate':
        page(1);
        return true;
      case 'home':
        scrollTo(0, false);
        return true;
      case 'end':
        scrollTo(Number.MAX_SAFE_INTEGER, false);
        return true;
      case 'back':
        return false;
      default:
        break;
    }
    const letters: Record<string, () => void> = {};
    rail.forEach((r, i) => {
      if (r.letter) letters[r.letter] = () => jump(i);
    });
    return letterAction(e, letters) || nk !== null;
  });

  const intro = secs[0]?.title === '' ? secs[0] : undefined;
  const rest = intro ? secs.slice(1) : secs;
  return (
    <Box title="About" size="large" onBack={() => nav.pop()} class="wc-about" winClass="wc-about-win">
      <BoxHead class="wc-about-strip">
        <div
          class="wc-about-pills"
          onClickCapture={(e) => {
            // A tap on the lit pill goes back to its section's head (Seg only reports changes).
            const opt = (e.target as Element).closest?.('.wc-lk-opt');
            if (opt?.getAttribute('aria-checked') === 'true') {
              const i = secs.findIndex((s) => s.id === opt.getAttribute('data-opt'));
              if (i >= 0) jump(i);
            }
          }}
        >
          <Seg
            kind="pills"
            label="Contents"
            options={secs.map((s, i) => ({ value: s.id, label: rail[i]!.nav, letter: rail[i]!.letter, id: s.id }))}
            value={secs[cur]?.id ?? ''}
            onChange={(v) => jump(secs.findIndex((s) => s.id === v))}
          />
        </div>
      </BoxHead>
      <div class="wc-about-grid">
        <nav class="wc-about-rail" aria-label="Contents">
          <ul class="wc-lk-rows">
            {secs.map((s, i) => (
              <li
                key={s.id}
                class={'wc-lk-row wc-about-row' + (i === cur ? ' is-on' : '')}
                data-sec-link={s.id}
                aria-current={i === cur ? 'true' : undefined}
                onClick={() => jump(i)}
              >
                <KeyLabel text={rail[i]!.nav} letter={rail[i]!.letter} />
              </li>
            ))}
          </ul>
        </nav>
        <BoxBody class="wc-about-body" bodyRef={bodyRef}>
          <article ref={leafRef} class="wc-about-leaf">
            <header class="wc-about-head" data-sec={intro?.id ?? 'intro'}>
              <LookWordmark size="small" class="wc-about-mark" />
              <div class="wc-about-ver">{commit ? `WebCockpit ${version} (${commit})` : `WebCockpit ${version}`}</div>
            </header>
            <OrnRule />
            {intro?.blocks.map((b, i) =>
              'p' in b ? (
                <p key={i} class="wc-about-lead">
                  <Linked text={b.p} />
                </p>
              ) : (
                <Blocks key={i} blocks={[b]} />
              ),
            )}
            {rest.map((s) => (
              <section key={s.id} class="wc-about-sec" data-sec={s.id} aria-labelledby={`wc-about-h-${s.id}`}>
                <h2 id={`wc-about-h-${s.id}`} class="wc-about-h">
                  {s.title}
                </h2>
                <Blocks blocks={s.blocks} />
              </section>
            ))}
            <footer class="wc-about-colophon">
              <OrnRule />
              <Seal size={54} />
            </footer>
          </article>
        </BoxBody>
      </div>
    </Box>
  );
});
