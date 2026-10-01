// About (Inv §3.11): our own text, word-wrapped, scrollable. The version
// and the build commit (ADR 0025) follow the title on its row. Colour rule
// per line: an ALL-CAPS line is a heading (C_TITLE); an indented line is `  key  description`
// (key in C_ACCENT, description in C_BODY); other text is C_BODY. Web
// addresses (mume.org, discord.gg, github.com, tintin.mudhalla.net) and LICENSE.txt (the site's
// copy of the GPL text, vite.config.ts) are links.

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { useGrid, useServices } from '../kit/hooks';
import { centreLeft, scrollbar, wrapText } from '../kit/nav';
import { useKeys } from '../kit/stack';
import { Line, Page, useBodyRows } from '../kit/widgets';
import { wheelSteps } from '../kit/wheel';

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
Choose Enter MUME on the start page. Press ESC at any time to open the menu. Options sets up the panes and the look; every change applies at once.

Profile holds the aliases, actions, highlights, macros, timers and variables you play with. Edit one with Profile → EDIT. A profile is written in TinTin++ syntax. HELP in the profile editor, or #help in the game, explains each command with examples.

SETTINGS
Settings and profiles are kept in this browser only. Use Profile → EXPORT to keep a copy of a profile. If a setting makes the page unusable, open the link with ?safe added to start with the default look.

CREDITS
  MMapper         The map is built on MMapper, the graphical mapper for MUME by the MMapper Authors. Its look, tiles and fonts come from MMapper, and the default map is an MMapper map. MMapper runs on Windows, macOS and Linux: github.com/MUME/MMapper
  Cockpit         The terminal client for MUME that WebCockpit is modelled on.
  MUME            The game, its world and its texts belong to the MUME team and the volunteers who have built it since 1991.
  Fonts           DejaVu Sans Mono and JetBrains Mono.
  Libraries       Preact and CodeMirror.
  TinTin++        The scripting language profiles are written in: tintin.mudhalla.net

LICENCE
WebCockpit is free software under the GNU General Public License, version 2 or later. Parts of the map are derived from MMapper (Copyright (C) The MMapper Authors). Licence text: LICENSE.txt. Source code: github.com/Khazdul/webcockpit

MUME is run by its own team; WebCockpit is an independent client and is not made or endorsed by MUME.`;

interface Styled {
  key?: string;
  text: string;
  cls: string;
}

/** The About text as styled, wrapped lines for a width. */
export function aboutLines(width: number): Styled[] {
  const out: Styled[] = [];
  for (const raw of ABOUT_TEXT.split('\n')) {
    if (raw === '') out.push({ text: '', cls: '' });
    else if (/^[A-Z][A-Z —-]+$/.test(raw)) out.push({ text: raw, cls: 'wc-c-title' });
    else if (raw.startsWith('  ')) {
      const m = /^ {2}(\S+(?: \S+)*?) {2,}(.*)$/.exec(raw);
      if (!m) out.push({ text: raw, cls: 'wc-c-body' });
      else {
        const keyW = raw.length - m[2]!.length;
        const desc = wrapText(m[2]!, Math.max(10, width - keyW));
        desc.forEach((d, i) =>
          out.push({ key: i === 0 ? raw.slice(0, keyW) : ' '.repeat(keyW), text: d, cls: 'wc-c-body' }),
        );
      }
    } else for (const l of wrapText(raw, width)) out.push({ text: l, cls: 'wc-c-body' });
  }
  return out;
}

const LINK = /\b((?:mume\.org|discord\.gg|github\.com|tintin\.mudhalla\.net)(?:\/[\w./-]*[\w/])?|LICENSE\.txt)/;

/** Text with the web addresses in it as links that open in a new tab. */
function linked(text: string): (string | VNode)[] {
  return text.split(LINK).map((part, i) =>
    i % 2 === 0 ? part : (
      <a
        class="wc-about-link"
        href={part === 'LICENSE.txt' ? `${import.meta.env.BASE_URL}${part}` : `https://${part}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {part}
      </a>
    ),
  );
}

export function AboutFrame(): VNode {
  const { version, commit } = useServices();
  const { cols } = useGrid();
  const visible = useBodyRows();
  const width = Math.max(20, Math.min(cols - 4, 76));
  const lines = aboutLines(width);
  const [top, setTop] = useState(0);
  const max = Math.max(0, lines.length - visible);
  const t = Math.min(top, max);
  const scroll = (d: number): void => setTop(Math.max(0, Math.min(max, t + d)));
  useKeys((_e, nk) => {
    switch (nk) {
      case 'up':
        scroll(-1);
        return true;
      case 'down':
        scroll(1);
        return true;
      case 'pgup':
        scroll(-(visible - 1));
        return true;
      case 'pgdn':
      case 'activate':
        scroll(visible - 1);
        return true;
      case 'home':
        setTop(0);
        return true;
      case 'end':
        setTop(max);
        return true;
    }
    return false;
  });
  const bar = scrollbar(lines.length, visible, t);
  const at = centreLeft(cols, width + 2);
  return (
    <Page title="About" titleRight={commit ? `${version} (${commit})` : version} footer={['↑↓ Scroll', 'PgUp/PgDn Page', 'ESC Back']}>
      <div
        class="wc-about"
        onWheel={(e) => {
          e.preventDefault();
          const n = wheelSteps(e);
          if (n !== 0) scroll(n);
        }}
      >
        {lines.slice(t, t + visible).map((l, i) => (
          <Line at={at}>
            {l.key !== undefined && <span class="wc-c-accent">{l.key}</span>}
            <span class={l.cls}>{linked(l.text.padEnd(width - (l.key?.length ?? 0)))}</span>
            {bar.length > 0 && <span class={bar[i] ? 'wc-scroll-thumb' : 'wc-scroll-track'}>{' ' + (bar[i] ? '█' : '░')}</span>}
          </Line>
        ))}
      </div>
    </Page>
  );
}
