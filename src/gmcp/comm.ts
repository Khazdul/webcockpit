// Communication model (Inv §2.7, ADR 0016): pure TS, no DOM.
//
// - Channel set from `Comm.Channel.List`, header labels and the
//   width-responsive header layout (Cockpit ADR 0098).
// - Message formatting at render time (Cockpit ADR 0013): the archive keeps
//   the `Comm.Channel.Text` fields raw; `formatComm` turns one into coloured
//   segments. Segment text may carry ANSI SGR (kept from the server);
//   `parseAnsi` turns it into style runs.
// - Filters and solo (Inv §2.7.6): sparse filters (missing = enabled), a
//   runtime-only solo snapshot.
//
// Colours are the canonical dark-background ones; the pane recolours them
// for a light pane at display time (Inv §10.5).

import type { StyleRun } from '../core/types';
import { rgb } from '../core/types';
import { capitalise } from './char';

// ------------------------------------------------------------ channels

/** The fixed header order (Inv §2.7.2); unknown advertised channels follow. */
export const COMM_CHANNEL_ORDER: readonly string[] = [
  'tales',
  'tells',
  'says',
  'yells',
  'prayers',
  'emotes',
  'whispers',
  'questions',
  'songs',
  'socials',
];

/** Display overrides that win over the server caption. */
export const CHANNEL_DISPLAY: Readonly<Record<string, string>> = { tales: 'Narrates' };

/** Captions MUME sends for the fixed channels (used before a list arrives). */
export const DEFAULT_CAPTIONS: Readonly<Record<string, string>> = {
  tales: 'Narrates',
  tells: 'Tells',
  says: 'Says',
  yells: 'Yells',
  prayers: 'Prayers',
  emotes: 'Emotes',
  whispers: 'Whispers',
  questions: 'Questions',
  songs: 'Songs',
  socials: 'Socials',
};

/** Verb and header label colour per channel. */
export const CHANNEL_COLORS: Readonly<Record<string, string>> = {
  tales: '#949400',
  tells: '#008000',
  says: '#008f8f',
  yells: '#640064',
  prayers: '#c3c36e',
  emotes: '#008000',
  whispers: '#965a00',
  questions: '#008f8f',
  songs: '#b49696',
  socials: '#9600a0',
};

/** The other comm colours (Inv §2.7.2). */
export const COMM_COLORS = {
  unknown: '#78909c',
  time: '#687685',
  talkerYou: '#afd2d2',
  talkerOther: '#c2a878',
  messageSelf: '#c3e6e9',
  messageOther: '#91bec1',
  off: '#3a3a3a',
  indicator: '#d4a04e',
} as const;

/** The colour of channel `name` (verb, header label). */
export function channelColor(name: string): string {
  return CHANNEL_COLORS[name] ?? COMM_COLORS.unknown;
}

/** One advertised channel (`Comm.Channel.List` entry). */
export interface ChannelInfo {
  name: string;
  caption: string;
  command: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The channels of a `Comm.Channel.List` payload, or null when it is not a list. */
export function parseChannelList(data: unknown): ChannelInfo[] | null {
  if (!Array.isArray(data)) return null;
  const out: ChannelInfo[] = [];
  const seen = new Set<string>();
  for (const e of data) {
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const name = str(o.name);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, caption: str(o.caption), command: str(o.command) });
  }
  return out;
}

/** Header label: override, else caption, else the name title-cased. */
export function channelLabel(ch: { name: string; caption?: string }): string {
  const o = CHANNEL_DISPLAY[ch.name];
  if (o) return o;
  if (ch.caption) return ch.caption;
  return ch.name.charAt(0).toUpperCase() + ch.name.slice(1);
}

/** A channel as the header shows it. */
export interface HeaderChannel {
  name: string;
  label: string;
}

/**
 * The header channels: the fixed order filtered to the advertised ones,
 * then unknown advertised channels in server order. Without a list (none
 * received yet) the ten fixed channels.
 */
export function headerChannels(advertised: readonly ChannelInfo[] | null): HeaderChannel[] {
  if (!advertised) {
    return COMM_CHANNEL_ORDER.map((name) => ({ name, label: channelLabel({ name, caption: DEFAULT_CAPTIONS[name] ?? '' }) }));
  }
  const byName = new Map(advertised.map((c) => [c.name, c]));
  const out: HeaderChannel[] = [];
  for (const name of COMM_CHANNEL_ORDER) {
    const c = byName.get(name);
    if (c) out.push({ name, label: channelLabel(c) });
  }
  for (const c of advertised) {
    if (!COMM_CHANNEL_ORDER.includes(c.name)) out.push({ name: c.name, label: channelLabel(c) });
  }
  return out;
}

/** Result of `headerLayout`: cell widths of the first `widths.length` labels. */
export interface HeaderLayout {
  /** Width of each visible cell; cells beyond are not shown. */
  widths: number[];
  /** Spaces between cells (1 or 0). */
  sep: 0 | 1;
}

/**
 * Width-responsive header (Cockpit ADR 0098). Given N labels and W cells:
 * 1. `W − (N−1) ≥ N`: one-space separators, budget `W − (N−1)`;
 * 2. `W ≥ N`: no separators, budget W;
 * 3. else only the first W labels, one cell each.
 * Natural widths when all visible labels fit the budget (Cockpit asks
 * for the even share to fit the longest label, which truncated full names
 * at widths where they fit; ADR 0016 P2 notes), otherwise even truncation (`budget // n`, the first `budget % n` cells
 * one wider). The total never exceeds W.
 */
export function headerLayout(labels: readonly string[], width: number): HeaderLayout {
  const n = labels.length;
  const W = Math.max(0, Math.floor(width));
  if (n === 0 || W === 0) return { widths: [], sep: 0 };
  let sep: 0 | 1;
  let budget: number;
  let visible: number;
  if (W - (n - 1) >= n) {
    sep = 1;
    budget = W - (n - 1);
    visible = n;
  } else if (W >= n) {
    sep = 0;
    budget = W;
    visible = n;
  } else {
    sep = 0;
    visible = W;
    budget = W;
  }
  const target = Math.floor(budget / visible);
  const rem = budget % visible;
  let natural = 0;
  for (let i = 0; i < visible; i++) natural += labels[i]!.length;
  const widths: number[] = [];
  for (let i = 0; i < visible; i++) {
    widths.push(natural <= budget ? labels[i]!.length : target + (i < rem ? 1 : 0));
  }
  return { widths, sep };
}

/** A label cut or padded to `w` cells. */
export function headerCellText(label: string, w: number): string {
  return label.slice(0, w).padEnd(w);
}

// ------------------------------------------------------------- messages

/** A `Comm.Channel.Text` message as the archive keeps it (raw). */
export interface CommText {
  channel: string;
  talker: string;
  /** `talker-type` as sent, or null. Stored, not used for display. */
  talkerType: string | null;
  /** `destination` (sent messages only), or null. */
  destination: string | null;
  /** Text as sent, ANSI kept. */
  text: string;
}

/** A message in the pane's history: `CommText` plus its receive time (ms). */
export interface CommMessage extends CommText {
  ts: number;
}

/** The fields of a `Comm.Channel.Text` payload, or null when it has no channel. */
export function parseChannelText(data: unknown): CommText | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const channel = str(o.channel);
  if (!channel) return null;
  const tt = str(o['talker-type']);
  const dest = str(o.destination);
  return { channel, talker: str(o.talker), talkerType: tt || null, destination: dest || null, text: str(o.text) };
}

/** Channels whose text is `<Talker> <verb> … '<message>'`. Unknown channels render this way too. */
export const QUOTED_CHANNELS: ReadonlySet<string> = new Set([
  'tales', 'tells', 'says', 'yells', 'whispers', 'prayers', 'songs', 'questions',
]);
/** Channels whose text is the whole action (`Gibur grins.`). */
export const ACTION_CHANNELS: ReadonlySet<string> = new Set(['emotes', 'socials']);
/** Channels that take a destination; an incoming one without it is to `you`. */
export const DIRECTED_CHANNELS: ReadonlySet<string> = new Set(['tells', 'whispers']);

/** Verb per channel: [self, other]. Unknown channels use the channel name. */
export const CHANNEL_VERBS: Readonly<Record<string, readonly [string, string]>> = {
  tales: ['narrate', 'narrates'],
  tells: ['tell', 'tells'],
  says: ['say', 'says'],
  yells: ['yell', 'yells'],
  whispers: ['whisper', 'whispers'],
  prayers: ['pray', 'prays'],
  songs: ['sing', 'sings'],
  questions: ['ask', 'asks'],
};

/** Words between the verb and the destination. */
export const DESTINATION_PREPOSITIONS: Readonly<Record<string, string>> = { whispers: 'to' };

/** Colour role of a formatted piece. */
export type CommRole = 'talkerYou' | 'talkerOther' | 'verb' | 'messageSelf' | 'messageOther';

/** A formatted piece: its role colour is the default for text without ANSI colour. */
export interface CommSegment {
  role: CommRole;
  /** May contain ANSI SGR sequences (message pieces only). */
  text: string;
}

const isYou = (s: string): boolean => s.trim().toLowerCase() === 'you';
const ARTICLE_RE = /^(a|an|the|some)\s/i;

/**
 * A talker or destination name for display: `you` → `You`; everything
 * from the first `" the "` dropped, as in Cockpit (owner, stage 4), so
 * `Vit the innkeeper` → `Vit`, plus a dangling `of` (`Thrakghash of the
 * Mordor Flame` → `Thrakghash`, where Cockpit showed `Thrakghash of`);
 * article names kept (`a dwarven sergeant`); an enemy's stars kept around
 * the short name (`*Throzghul the Orc*` → `*Throzghul*`); first character
 * upper case.
 */
export function cleanName(name: string): string {
  const n = name.trim();
  if (isYou(n)) return 'You';
  const star = /^\*(.+)\*$/.exec(n);
  if (star) return '*' + cleanName(star[1]!) + '*';
  if (ARTICLE_RE.test(n)) return capitalise(n);
  const i = n.indexOf(' the ');
  if (i > 0) return capitalise(n.slice(0, i).replace(/\s+of$/i, ''));
  return capitalise(n);
}

// ANSI SGR: ESC [ params m. Other CSI sequences are dropped when parsing.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1b\[[0-9;?]*[@-~]/g;

/** `s` without ANSI escape sequences. */
export function stripAnsi(s: string): string {
  return s.includes('\x1b') ? s.replace(CSI_RE, '') : s;
}

/**
 * Matches `prefix` against the visible characters at the start of `raw`
 * (case-insensitive, escape sequences skipped). Returns the index in `raw`
 * just after the match, or -1.
 */
export function matchVisiblePrefix(raw: string, prefix: string): number {
  let i = 0;
  let k = 0;
  const p = prefix.toLowerCase();
  while (k < p.length) {
    if (i >= raw.length) return -1;
    if (raw.charCodeAt(i) === 0x1b) {
      CSI_RE.lastIndex = i;
      const m = CSI_RE.exec(raw);
      if (m && m.index === i) {
        i += m[0].length;
        continue;
      }
      return -1;
    }
    if (raw[i]!.toLowerCase() !== p[k]) return -1;
    i++;
    k++;
  }
  return i;
}

/** A group tell's destination as your own `tell group` may carry it. */
export const GROUP_DEST_RE = /^(the )?group$/i;
/** An incoming group tell's text: `<Name> tells the group '…'`. */
export const GROUP_TELL_IN_RE = / tells the group '/;
/** Your own group tell's text, if MUME sends it whole: `You tell the group '…'`. */
export const GROUP_TELL_OUT_RE = /^you tell the group '/i;

/**
 * A group tell (ADR 0134): on `tells`, an incoming one by its text (MUME
 * sends no destination), your own by its destination `group` or its text.
 */
export function isGroupTell(m: CommText): boolean {
  if (m.channel !== 'tells') return false;
  const plain = stripAnsi(m.text);
  if (isYou(m.talker)) return GROUP_DEST_RE.test(m.destination?.trim() ?? '') || GROUP_TELL_OUT_RE.test(plain);
  return GROUP_TELL_IN_RE.test(plain);
}

/** The text between the first and the last `'`, or all of it. */
export function quotedBody(text: string): string {
  const a = text.indexOf("'");
  const b = text.lastIndexOf("'");
  return a >= 0 && b > a ? text.slice(a + 1, b) : text;
}

/**
 * Formats one message (Inv §2.7.3, Cockpit ADR 0013).
 *
 * Quoted channels: `<Talker> <verb> [prep] [Destination] '<message>'`.
 * Action channels: the text as sent, split into a talker part and the
 * body. Spaces go at the start of the following segment.
 */
export function formatComm(m: CommText): CommSegment[] {
  if (ACTION_CHANNELS.has(m.channel)) return formatAction(m);
  const self = isYou(m.talker);
  const verbs = CHANNEL_VERBS[m.channel] ?? [m.channel, m.channel];
  const out: CommSegment[] = [];
  out.push({ role: self ? 'talkerYou' : 'talkerOther', text: self ? 'You' : cleanName(m.talker || 'Someone') });
  if (isGroupTell(m)) {
    // `<Name> tells the group '…'` (ADR 0134), not `tells you`.
    out.push({ role: 'verb', text: self ? ' tell the group' : ' tells the group' });
    const plain = stripAnsi(m.text);
    const body = self && !GROUP_TELL_OUT_RE.test(plain) ? m.text : quotedBody(m.text);
    out.push({ role: self ? 'messageSelf' : 'messageOther', text: ` '${body}'` });
    return out;
  }
  const prep = DESTINATION_PREPOSITIONS[m.channel];
  let dest = m.destination;
  if (!dest && !self && DIRECTED_CHANNELS.has(m.channel)) dest = 'you';
  let verb = ' ' + (self ? verbs[0] : verbs[1]);
  if (dest && prep) verb += ' ' + prep;
  out.push({ role: 'verb', text: verb });
  if (dest) {
    const toYou = isYou(dest);
    out.push({ role: toYou ? 'talkerYou' : 'talkerOther', text: ' ' + (toYou ? 'you' : cleanName(dest)) });
  }
  const body = self ? m.text : quotedBody(m.text);
  out.push({ role: self ? 'messageSelf' : 'messageOther', text: ` '${body}'` });
  return out;
}

function formatAction(m: CommText): CommSegment[] {
  const text = m.text;
  // a) own action: `You …` (MUME may set `talker` to the character's name).
  const you = matchVisiblePrefix(text, 'You ');
  if (you >= 0) {
    return [
      { role: 'talkerYou', text: 'You ' },
      { role: 'messageSelf', text: text.slice(you) },
    ];
  }
  // b) the talker at the start (any case, ANSI skipped).
  const talker = m.talker.trim();
  if (talker && !isYou(talker)) {
    const at = matchVisiblePrefix(text, talker + ' ');
    if (at >= 0) {
      const shown = stripAnsi(text.slice(0, at)).trimEnd();
      return [
        { role: 'talkerOther', text: cleanName(shown) + ' ' },
        { role: 'messageOther', text: text.slice(at) },
      ];
    }
  }
  // b') an enemy's `*Name…*` at the start (its talker field is often longer).
  const visible = stripAnsi(text);
  const star = /^\*[^*]+\* /.exec(visible);
  if (star) {
    const at = matchVisiblePrefix(text, star[0]);
    if (at >= 0) {
      return [
        { role: 'talkerOther', text: cleanName(star[0].trimEnd()) + ' ' },
        { role: 'messageOther', text: text.slice(at) },
      ];
    }
  }
  // c) the talker is not in the text: prepend it.
  const self = isYou(talker);
  return [
    { role: self ? 'talkerYou' : 'talkerOther', text: (self ? 'You' : cleanName(talker || 'Someone')) + ' ' },
    { role: self ? 'messageSelf' : 'messageOther', text },
  ];
}

/** The visible text of a formatted message (tests, copy). */
export function commPlain(m: CommText): string {
  return formatComm(m)
    .map((s) => stripAnsi(s.text))
    .join('');
}

// ------------------------------------------------------------------ ANSI

/**
 * Parses ANSI SGR in `s` into plain text and style runs (the `Line` model:
 * runs cover styled text only). Supports reset, bold, italic, underline,
 * blink, inverse, 30–37/90–97/39, 40–47/100–107/49, 38/48;5;n and
 * 38/48;2;r;g;b. Other escape sequences are dropped.
 */
export function parseAnsi(s: string): { text: string; runs: StyleRun[] } {
  if (!s.includes('\x1b')) return { text: s, runs: [] };
  let text = '';
  const runs: StyleRun[] = [];
  let st: Omit<StyleRun, 'start' | 'end'> = {};
  let last = 0;
  const push = (chunk: string): void => {
    if (!chunk) return;
    const start = text.length;
    text += chunk;
    if (Object.keys(st).length === 0) return;
    const prev = runs[runs.length - 1];
    if (prev && prev.end === start && sameStyle(prev, st)) prev.end = text.length;
    else runs.push({ start, end: text.length, ...st });
  };
  CSI_RE.lastIndex = 0;
  for (let m = CSI_RE.exec(s); m; m = CSI_RE.exec(s)) {
    push(s.slice(last, m.index).replace(/\x1b/g, ''));
    last = m.index + m[0].length;
    if (m[0].endsWith('m')) st = applySgr(st, m[0].slice(2, -1));
  }
  push(s.slice(last).replace(/\x1b/g, ''));
  return { text, runs };
}

const STYLE_KEYS = ['fg', 'bg', 'bold', 'italic', 'underline', 'inverse', 'blink'] as const;

function sameStyle(a: Omit<StyleRun, 'start' | 'end'>, b: Omit<StyleRun, 'start' | 'end'>): boolean {
  return STYLE_KEYS.every((k) => a[k] === b[k]);
}

function applySgr(cur: Omit<StyleRun, 'start' | 'end'>, params: string): Omit<StyleRun, 'start' | 'end'> {
  const st = { ...cur };
  const p = params === '' ? [0] : params.split(';').map((x) => (x === '' ? 0 : Number(x)));
  for (let i = 0; i < p.length; i++) {
    const n = p[i]!;
    if (n === 0) {
      for (const k of STYLE_KEYS) delete st[k];
    } else if (n === 1) st.bold = true;
    else if (n === 3) st.italic = true;
    else if (n === 4) st.underline = true;
    else if (n === 5 || n === 6) st.blink = true;
    else if (n === 7) st.inverse = true;
    else if (n === 22) delete st.bold;
    else if (n === 23) delete st.italic;
    else if (n === 24) delete st.underline;
    else if (n === 25) delete st.blink;
    else if (n === 27) delete st.inverse;
    else if (n >= 30 && n <= 37) st.fg = n - 30;
    else if (n >= 90 && n <= 97) st.fg = n - 90 + 8;
    else if (n === 39) delete st.fg;
    else if (n >= 40 && n <= 47) st.bg = n - 40;
    else if (n >= 100 && n <= 107) st.bg = n - 100 + 8;
    else if (n === 49) delete st.bg;
    else if (n === 38 || n === 48) {
      const key = n === 38 ? 'fg' : 'bg';
      if (p[i + 1] === 5 && p[i + 2] !== undefined) {
        st[key] = p[i + 2]! & 0xff;
        i += 2;
      } else if (p[i + 1] === 2 && p[i + 4] !== undefined) {
        st[key] = rgb(p[i + 2]!, p[i + 3]!, p[i + 4]!);
        i += 4;
      } else break;
    }
  }
  return st;
}

// --------------------------------------------------------------- filters

/** Sparse filters: a channel is on unless its entry is `false`. */
export function channelEnabled(filters: Readonly<Record<string, boolean>>, name: string): boolean {
  return filters[name] !== false;
}

/** Sparse copy: only `false` entries. */
function sparse(f: Readonly<Record<string, boolean>>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(f)) if (v === false) out[k] = false;
  return out;
}

/** The runtime-only solo state: the soloed channel and the filters before solo. */
export interface SoloState {
  channel: string;
  snapshot: Record<string, boolean>;
}

export interface FilterState {
  filters: Record<string, boolean>;
  solo: SoloState | null;
}

/** Left click: toggles `name`; a left click while soloed drops the snapshot. */
export function toggleChannel(s: Readonly<FilterState>, name: string): FilterState {
  const filters = sparse(s.filters);
  if (channelEnabled(filters, name)) filters[name] = false;
  else delete filters[name];
  return { filters, solo: null };
}

/**
 * Right click: solo `name` (all other `channels` off). Again on the soloed
 * channel restores the snapshot; on another channel switches the solo and
 * keeps the original snapshot.
 */
export function soloChannel(s: Readonly<FilterState>, name: string, channels: readonly string[]): FilterState {
  if (s.solo && s.solo.channel === name) return { filters: sparse(s.solo.snapshot), solo: null };
  const snapshot = s.solo ? s.solo.snapshot : sparse(s.filters);
  const filters = sparse(s.filters);
  for (const c of channels) {
    if (c === name) delete filters[c];
    else filters[c] = false;
  }
  delete filters[name];
  return { filters, solo: { channel: name, snapshot } };
}

/** Two sparse filter maps are the same. */
export function sameFilters(a: Readonly<Record<string, boolean>>, b: Readonly<Record<string, boolean>>): boolean {
  const x = sparse(a);
  const y = sparse(b);
  const kx = Object.keys(x);
  return kx.length === Object.keys(y).length && kx.every((k) => y[k] === false);
}

// ------------------------------------------------------------- timestamps

/** `HH:MM`, or `DD/MM` when older than 24 h (local time). */
export function commTime(ts: number, now: number): string {
  const d = new Date(ts);
  const p = (n: number): string => String(n).padStart(2, '0');
  if (now - ts > 24 * 60 * 60 * 1000) return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
