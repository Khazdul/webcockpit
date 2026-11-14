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
// (an ornament rule and the "M" seal). Web addresses (mume.org,
// docs.mume.org, discord.gg, github.com, tintin.mudhalla.net) and the
// site's own files (LICENSE.txt, THIRD_PARTY_NOTICES.md, fonts/README.md,
// served at the site root, see vite.config.ts) are links that open in a new
// tab; game commands (#help, ?safe, help newbie, who ranger, ...) are set in
// the terminal font. The text was cut down for newcomers on 2026-11-08 (ADR
// 0132 addendum): Getting started is about starting MUME.
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
// (Shift+Space back), Home / End, the letters W M G B I S K U C L, Esc / Back.
//
// The privacy page (stage 59, ADR 0147) is the same leaf with its own text
// (privacy-text.ts, letters P E Y K A C W R): `PrivacyFrame`, opened from
// About's "privacy page" and at the address `<base>privacy`. About's
// "What the site knows" is its short form.

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
import { PRIVACY_NAV, PRIVACY_TEXT, PRIVACY_UPDATED } from './privacy-text';

export const ABOUT_TEXT = `WebCockpit is a MUD client for MUME, built for fast PvP. It runs in your browser from a link: nothing to install, no server between you and the game, and your settings, profiles and runs kept only in this browser. It is modelled on Cockpit, a terminal client for MUME, and aims to look and feel the same.

MUME — MULTI-USERS IN MIDDLE-EARTH
MUME is a free, text-based multiplayer game set in Tolkien's Middle-earth in the late Third Age, the years before the War of the Ring. It has run continuously since 1991, is kept alive by a volunteer community, and is one of the oldest active DikuMUDs.

Pick a side. The Free Peoples — Men, Elves, Hobbits, Dwarves and Beornings — hold the West. The forces of Sauron — Trolls, Black Númenóreans and Orcs — push from the East. Renegade Zaugurz orcs are hated by both. The war between the sides is the spine of the game.

The world is wide and true to the books: the Shire, Bree, Rivendell, Moria, Lothlórien, Fangorn, Isengard, the Misty Mountains and much more, all there to explore. Roleplay is encouraged, and names that do not fit Middle-earth do not last.

MUME is free to play. No subscription, just connect.
  Website         mume.org
  Discord         discord.gg/XkZN55am9a

GETTING STARTED
Choose Enter MUME on the start page and follow the prompts to create an account and your first character. Once you are in, the menu bar at the right end of the input line holds Profile, Scripts, Panes and Settings. On a phone, ☰ opens it.

A new character is a newcomer until level 13, and the game goes easy on you until then. You start in the Halls of Mandos: pray to the tower hills takes you to the Tower Hills, the recommended first area. Type help newbie for the first steps. Take it slowly: consider a monster before you attack it, and flee when a fight turns against you.

You do not have to learn alone. Rangers are volunteers who help new players; who ranger shows the ones online. Questions are welcome on Discord too.

Good places to start reading:
  Newcomers       The community's beginner guide, with a step-by-step tutorial: docs.mume.org/resources/newcomers
  First steps     Leaving Mandos, finding help and other players: mume.org/help/newbie
  Basics          The commands you need in the first hour: mume.org/help/basics
  Guides          The MUME wiki's guides, from the first hour to level 12 and beyond: docs.mume.org/wiki/guides

BUILT FOR PVP
PvP is what sets MUME apart: towers and terrain to take, deep skill and spell systems, and constant skirmishes between the sides. Big raids draw a hundred players or more. The pace is high, and a fast client with reliable reflexes is what lets you keep up.

WebCockpit is made for that. Keystrokes go to the game at once, macros and actions fire without delay, and the panes show what matters in a fight: your vitals, spell and debuff timers, your group, the channels and the map.

WHAT IS INSIDE
  Panes           Small windows around the game text: your character's vitals, spell timers, your group, your chats and channels, the map, and the live statistics of your run. Panes in the menu bar turns them on and off. Drag one to dock it on any side, or let it float.
  Profile         Your aliases, actions, highlights, macros and timers. Edit them as a form or as text; #help explains every command. Import brings in profiles from TinTin++, JMC, Powwow and Mudlet.
  Map             Reads MMapper maps and follows you as you move.
  Weather         The sky and weather of Middle-earth over the whole client, driven by the game.
  Runs            Every login is recorded in this browser. History, Spotlights and Credits on the start page look back at your runs, and Export turns one into an HTML replay anyone can open.
  Phone           Log in, chat and play lightly from a phone, with a layout for the thumb and its own on-screen keyboard. Real play is for a computer.

SETTINGS
Settings and profiles are kept in this browser only. Use Profile → Export to keep a copy of a profile. If a setting makes the page unusable, open the link with ?safe added to start with the default look.

WHAT THE SITE KNOWS
Your game goes straight from this browser to MUME. Nothing you type, no character or account name and no password passes through this site. To count how many use WebCockpit, the page sends the site a small heartbeat while it is open: a random number made for this browser, the version, the kind of device, the browser family, and whether you are on the start page, playing or watching a replay. That is all. No IP address is kept, and who is online is never shown. The privacy page has the details: what is kept, for how long, and how to remove it.

LUA SCRIPTS
Beside the profile, WebCockpit runs scripts written in Lua, with its own API for triggers, aliases, keys, timers, GMCP, panes and the map. Open them with Scripts on the start page or in the game's menu bar, where ready-made scripts wait to be turned on: an almanac, a port key manager, map search and more. A script's settings are tiles on its panel, and take effect at once. A bundled script opens read-only; Duplicate makes an editable copy. The editor helps you write your own: it completes commands, shows their syntax and help as you type, and marks errors at once. Manual on the Scripts page, or F1 in the editor, opens the full manual with examples.

CREDITS
  MMapper         The map is built on MMapper, the graphical mapper for MUME by the MMapper Authors. Its look, tiles and fonts come from MMapper, and the default map is an MMapper map. MMapper runs on Windows, macOS and Linux: github.com/MUME/MMapper
  Tilesets        Shimrod's seasonal tiles; Desert by Khazdul, from Shimrod's tiles; Gefe & Rik by Octavia, after Gefe and Rik's maps; Gray's Map by Sunnyl75, after Gray's maps.
  Cockpit         The terminal client for MUME that WebCockpit is modelled on.
  MUME            The game, its world and its texts belong to the MUME team and the volunteers who have built it since 1991.
  Fonts           The fonts for the game text, Cinzel and Cormorant Garamond are each under their own licence, listed in fonts/README.md. Lucida Console is used only when installed and is not part of WebCockpit.
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
export const ABOUT_NAV: LeafNav = [
  { id: 'intro', head: '', nav: 'WebCockpit', letter: 'w' },
  { id: 'mume', head: 'MUME', nav: 'MUME', letter: 'm' },
  { id: 'start', head: 'GETTING STARTED', nav: 'Getting started', letter: 'g' },
  { id: 'pvp', head: 'BUILT FOR PVP', nav: 'Built for PvP', letter: 'b' },
  { id: 'inside', head: 'WHAT IS INSIDE', nav: 'What is inside', letter: 'i' },
  { id: 'settings', head: 'SETTINGS', nav: 'Settings', letter: 's' },
  { id: 'knows', head: 'WHAT THE SITE KNOWS', nav: 'What the site knows', letter: 'k' },
  { id: 'lua', head: 'LUA SCRIPTS', nav: 'Lua scripts', letter: 'u' },
  { id: 'credits', head: 'CREDITS', nav: 'Credits', letter: 'c' },
  { id: 'licence', head: 'LICENCE', nav: 'Licence', letter: 'l' },
];

const HEADING = /^[A-Z][A-Z —-]+$/;
const KV = /^ {2}(\S+(?: \S+)*?) {2,}(.*)$/;

/** A leaf's contents rail: each section's id, label and letter, found by how its heading starts. */
export type LeafNav = readonly { id: string; head: string; nav: string; letter: string }[];

const navOf = (title: string, nav: LeafNav): LeafNav[number] | undefined =>
  nav.find((n) => (title === '' ? n.head === '' : n.head !== '' && title.startsWith(n.head)));

/** `ABOUT_TEXT` (or any text in its format, with its rail `nav`) as sections. Pure. */
export function aboutSections(text: string, nav: LeafNav = ABOUT_NAV): AboutSection[] {
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
      id: navOf(s.title, nav)?.id ?? s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title: s.title,
      blocks: s.blocks,
    }));
}

/**
 * A piece of text: plain, a link (`href`; the site's own files under the
 * base; an e-mail address), a game command (or a name set in the terminal
 * font), or a leaf of the site's own (`page`: the privacy page, opened in
 * the stack).
 */
export type AboutToken = { text: string } | { link: string; href: string } | { cmd: string } | { page: 'privacy'; text: string };

const LINK_RE =
  /\b((?:docs\.mume\.org|mume\.org|discord\.gg|github\.com|tintin\.mudhalla\.net)(?:\/[\w./-]*[\w/])?|LICENSE\.txt|THIRD_PARTY_NOTICES\.md|fonts\/README\.md)|(#help|#weather demo|\?safe|\bpray to the tower hills|\bhelp newbie|\bwho ranger|\bconsider|\bflee|\bwc\.device)(?!\w)|\b([\w.+-]+@mumecockpit\.com)\b|\b(privacy page)\b/g;
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
    else if (m[3]) out.push({ link: m[3], href: `mailto:${m[3]}` });
    else if (m[4]) out.push({ page: 'privacy', text: m[4] });
    else out.push({ cmd: m[2]! });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

/** The site's base path (Vite's `base`). */
const siteBase = (): string => (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** Text with its links (a new tab; the privacy page in the stack) and game commands (the terminal font). */
function Linked(p: { text: string }): VNode {
  const nav = useNav();
  const base = siteBase();
  return (
    <>
      {aboutTokens(p.text, base).map((t) =>
        'page' in t ? (
          <a
            class="wc-about-a"
            href={`${base}privacy`}
            onClick={(e) => {
              // A plain click opens the leaf here; with a modifier the browser opens /privacy as it would.
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              nav.push(<PrivacyFrame />);
            }}
          >
            {t.text}
          </a>
        ) : 'link' in t ? (
          <a class="wc-about-a" href={t.href} target={t.href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer">
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

/** Each leaf's sections, parsed once (the texts are constants). */
const parsed = new Map<string, AboutSection[]>();
const sectionsOf = (text: string, nav: LeafNav): AboutSection[] => {
  let s = parsed.get(text);
  if (!s) parsed.set(text, (s = aboutSections(text, nav)));
  return s;
};

/** A section's label in the rail and its letter. */
function railOf(s: AboutSection, nav: LeafNav): { nav: string; letter: string | undefined } {
  const n = nav.find((x) => x.id === s.id);
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
  return (
    <Leaf
      title="About"
      text={ABOUT_TEXT}
      nav={ABOUT_NAV}
      sub={commit ? `WebCockpit ${version} (${commit})` : `WebCockpit ${version}`}
    />
  );
});

/**
 * The privacy page (stage 59, spec §7.6, ADR 0147): a leaf in About's look
 * with the text of privacy-text.ts. Opened from About's "privacy page", and
 * at `<base>privacy` (the build emits `privacy.html`, a copy of the app's
 * page: vite.config.ts), where the start menu pushes it at once
 * (start-main.tsx). Leaving it there puts the address back to the base, so
 * a reload is the start page.
 */
export const PrivacyFrame = lookFrame(function PrivacyFrame(): VNode {
  useEffect(
    () => () => {
      if (!atPrivacyPath()) return;
      try {
        history.replaceState(history.state, '', `${siteBase()}${location.search}${location.hash}`);
        document.title = 'WebCockpit';
      } catch {
        // The address stays: harmless.
      }
    },
    [],
  );
  return <Leaf title="Privacy" text={PRIVACY_TEXT} nav={PRIVACY_NAV} sub={PRIVACY_UPDATED} />;
});

/** True when the page was opened at the privacy page's address (`<base>privacy`). */
export function atPrivacyPath(path: string = globalThis.location?.pathname ?? '', base: string = siteBase()): boolean {
  const rest = path.startsWith(base) ? path.slice(base.length) : null;
  return rest === 'privacy' || rest === 'privacy/' || rest === 'privacy.html';
}

/** One long leaf (About, Privacy): the head, the rail and the sections of `text`. */
function Leaf(p: { title: string; text: string; nav: LeafNav; sub: string }): VNode {
  const nav = useNav();
  const settled = useBoxSettled();
  const reduced = useReducedMotion();
  const secs = sectionsOf(p.text, p.nav);
  const rail = useMemo(() => secs.map((s) => railOf(s, p.nav)), [secs, p.nav]);
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
    <Box title={p.title} size="large" onBack={() => nav.pop()} class="wc-about" winClass="wc-about-win">
      <BoxHead class="wc-about-strip">
        <div class="wc-about-pills">
          <Seg
            kind="pills"
            label="Contents"
            options={secs.map((s, i) => ({ value: s.id, label: rail[i]!.nav, letter: rail[i]!.letter, id: s.id }))}
            value={secs[cur]?.id ?? ''}
            onChange={(v) => jump(secs.findIndex((s) => s.id === v))}
            // A tap on the lit pill goes back to its section's head.
            onReclick={(v) => jump(secs.findIndex((s) => s.id === v))}
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
              <div class="wc-about-ver">{p.sub}</div>
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
}
