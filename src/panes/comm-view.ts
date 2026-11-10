// Pure layout and text helpers of the Comm pane (ADR 0134): the chat
// column's mode and width, the spine's snaps, times, bubble text, search
// highlights and the person and channel inks. No DOM.

import { ACTION_CHANNELS, type CommText, channelColor, cleanName, formatComm, messageBody, stripAnsi } from '../gmcp/comm';
import type { PersonColor } from '../gmcp/comm-chats';
import { fitContrast, lightShift } from '../theme/color';

/** Below this pane width (CSS px) the chat column is an icon rail, from it a name list. */
export const COMM_LIST_MIN_PANE = 380;
/** A dragged width under this is the rail. */
export const COMM_LIST_MIN_DRAG = 100;
/** The list's automatic width: this share of the pane, within the bounds. */
export const COMM_LIST_SHARE = 0.34;
export const COMM_LIST_AUTO_MIN = 124;
export const COMM_LIST_AUTO_MAX = 184;
/** The list's dragged width: at least this, at most `listMax`. */
export const COMM_LIST_DRAG_MIN = 110;
/** A drag narrower than this folds the column; narrower than `RAIL_SNAP` gives the rail. */
export const FOLD_SNAP = 24;
export const RAIL_SNAP = 92;
/** A gap between two messages longer than this shows the time between them. */
export const SEP_GAP_MS = 5 * 60_000;
/** Messages built in a view at first, and added on each scroll to its top. */
export const THREAD_PAGE = 200;

export type ColumnMode = 'list' | 'rail' | 'folded';

export interface ColumnLayout {
  mode: ColumnMode;
  /** CSS px (0 folded). */
  width: number;
}

/** The rail's width for a cell height: room for an initial in a disc. */
export function railWidth(cellH: number): number {
  return Math.max(36, Math.round(cellH * 2.5));
}

/** The widest dragged list in a pane `paneW` px wide. */
export function listMax(paneW: number): number {
  return Math.max(COMM_LIST_DRAG_MIN, Math.min(240, Math.round((paneW - 26) * 0.55)));
}

/** The list's automatic width in a pane `paneW` px wide. */
export function autoListWidth(paneW: number): number {
  return Math.round(Math.max(COMM_LIST_AUTO_MIN, Math.min(COMM_LIST_AUTO_MAX, paneW * COMM_LIST_SHARE)));
}

/**
 * The chat column for a pane `paneW` CSS px wide: folded, the dragged
 * width (`listWidth`, a rail under `COMM_LIST_MIN_DRAG`), or automatic (a
 * rail under `COMM_LIST_MIN_PANE`, else a share of the pane).
 */
export function columnLayout(paneW: number, listWidth: number | null, folded: boolean, cellH: number): ColumnLayout {
  if (folded) return { mode: 'folded', width: 0 };
  const rail = railWidth(cellH);
  if (listWidth !== null) {
    if (listWidth < COMM_LIST_MIN_DRAG) return { mode: 'rail', width: rail };
    return { mode: 'list', width: Math.max(COMM_LIST_DRAG_MIN, Math.min(listMax(paneW), listWidth)) };
  }
  if (paneW < COMM_LIST_MIN_PANE) return { mode: 'rail', width: rail };
  return { mode: 'list', width: autoListWidth(paneW) };
}

/** Where a spine drag to `raw` px of column lands: folded, the rail, or a list width. */
export function spineSnap(raw: number, paneW: number, cellH: number): ColumnLayout {
  if (raw < FOLD_SNAP) return { mode: 'folded', width: 0 };
  if (raw < RAIL_SNAP) return { mode: 'rail', width: railWidth(cellH) };
  return { mode: 'list', width: Math.max(COMM_LIST_DRAG_MIN, Math.min(listMax(paneW), Math.round(raw))) };
}

/** The spine's arrow keys: one step from the layout now (folded ↔ rail ↔ list). */
export function spineStep(now: ColumnMode, dir: -1 | 1): ColumnMode {
  const order: ColumnMode[] = ['folded', 'rail', 'list'];
  const i = Math.max(0, Math.min(2, order.indexOf(now) + dir));
  return order[i]!;
}

// ---------------------------------------------------------------- time

const p2 = (n: number): string => String(n).padStart(2, '0');

/** `HH:MM` local. */
export function clock(ts: number): string {
  const d = new Date(ts);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** How long ago: `now`, `12s`, `5m`, `2h5m`, `3d`. */
export function ago(ts: number, now: number): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 10) return 'now';
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? `${m % 60}m` : ''}`;
  return `${Math.floor(h / 24)}d`;
}

/** `just now` or `5m ago` (tooltips, search). */
export function agoText(ts: number, now: number): string {
  const a = ago(ts, now);
  return a === 'now' ? 'just now' : `${a} ago`;
}

// ---------------------------------------------------------------- text

/** A bubble's text: the message only (quoted channels) or the whole action. ANSI kept. */
export interface BubbleText {
  action: boolean;
  text: string;
}

export function bubbleText(m: CommText): BubbleText {
  if (ACTION_CHANNELS.has(m.channel)) {
    return { action: true, text: formatComm(m).map((s) => s.text).join('') };
  }
  const self = m.talker.trim().toLowerCase() === 'you';
  return { action: false, text: self ? m.text : messageBody(m) };
}

/**
 * A one-line snippet for the name list (plain): an action whole, a message
 * with `You: ` before your own and, with `named`, `Name: ` before others'.
 */
export function snippet(m: CommText, mine: boolean, named = false): string {
  const b = bubbleText(m);
  const t = stripAnsi(b.text).replace(/\s+/g, ' ').trim();
  if (b.action) return t;
  if (mine) return `You: ${t}`;
  return named ? `${cleanName(m.talker || 'Someone')}: ${t}` : t;
}

/** `text` cut where `needle` (lower case) matches, case-insensitive: odd parts are hits. */
export function splitHits(text: string, needle: string): string[] {
  if (!needle) return [text];
  const low = text.toLowerCase();
  const out: string[] = [];
  let at = 0;
  for (;;) {
    const i = low.indexOf(needle, at);
    if (i < 0) break;
    out.push(text.slice(at, i), text.slice(i, i + needle.length));
    at = i + needle.length;
  }
  out.push(text.slice(at));
  return out;
}

// ---------------------------------------------------------------- inks

/**
 * Person colours on a dark pane, one per slot (`PERSON_COLORS`): soft,
 * distinct hues that read on the lamp-lit window. A light pane shifts and
 * fits them (`personInk`).
 */
export const PERSON_PALETTE: readonly string[] = [
  '#e9a07a', '#6fd0a0', '#9fb2f5', '#ef8cb0', '#cdc05e',
  '#5cc6e0', '#c09cf2', '#a3d36a', '#c9d2dc', '#e88a4a',
];
/** An enemy's name (`*Name*`). */
export const ENEMY_INK = '#e2685c';

/**
 * Channel colours in the thread on a dark pane: `CHANNEL_COLORS` lifted to
 * read on the lamp-lit window (the old ones were for a black terminal).
 */
export const CHANNEL_INKS: Readonly<Record<string, string>> = {
  tales: '#d2ca5c',
  tells: '#5dc97c',
  says: '#4cc4c4',
  yells: '#d276d2',
  prayers: '#ddd592',
  emotes: '#86b886',
  whispers: '#dc9c4a',
  questions: '#62b5d6',
  songs: '#dab4b4',
  socials: '#c475d4',
};

/** On a light pane a colour is shifted darker and held to 4.5:1 against `bg` (as Comm before, ADR 0123). */
export function fitInk(c: string, light: boolean, bg: string): string {
  return light ? fitContrast(lightShift(c), bg, 4.5, '#000000') : c;
}

/** A person's name colour; `self` is the pane's own (CSS) colour for you. */
export function personInk(color: PersonColor, light: boolean, bg: string, self: string): string {
  if (color === 'you') return self;
  if (color === 'enemy') return fitInk(ENEMY_INK, light, bg);
  return fitInk(PERSON_PALETTE[color % PERSON_PALETTE.length]!, light, bg);
}

/** A channel's colour in the thread. */
export function channelInk(name: string, light: boolean, bg: string): string {
  return fitInk(CHANNEL_INKS[name] ?? channelColor(name), light, bg);
}

/** A channel's short word in a bubble's footer (`tell`, `say`, …). */
export function channelWord(name: string): string {
  const words: Record<string, string> = {
    tells: 'tell', says: 'say', whispers: 'whisper', emotes: 'emote', socials: 'social',
    tales: 'narrate', yells: 'yell', prayers: 'pray', songs: 'song', questions: 'ask',
  };
  return words[name] ?? name;
}
