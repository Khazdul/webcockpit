// Conversation model of the Comm pane (ADR 0134): Public, Group and one
// chat per person, derived incrementally from the `Comm.Channel.Text`
// history and the group roster. Pure TS, no DOM.
//
// Who a message belongs to:
// - Your own (`talker` "you", or your character's name): a tell or whisper
//   goes to its `destination`'s chat; a `destination` of "group" / "the
//   group" (a `tell group …`, form not seen in captures yet) or a text
//   `You tell the group '…'` is a group tell. An own emote or social that
//   names a person with a chat (whole word, case-insensitive) goes to that
//   chat too (GMCP carries no target for emotes; a heuristic). Own says
//   and the rest are in Public only (and Group).
// - Another player's (any `talker-type` but `npc`): kept in that person's
//   record on every channel. The "near" channels (tells, whispers, says,
//   emotes, socials) open the person's chat, raise it (newest last) and,
//   when it is not open, count as unread. The other channels (narrates,
//   yells, songs, questions, prayers) are "overheard": in the chat, quiet,
//   no raise, no unread. Prayers go to the Valar, never to you.
// - Group tells: MUME sends them on `tells` with no destination and the
//   text `<Name> tells the group '…'` (the owner's Cockpit archives,
//   2026-09/10). They go to Group and to the sender's record as overheard:
//   they never open, raise or count in a private chat.
// - NPCs (`talker-type` `npc`, e.g. Gwaihir's says) are in Public only.
//
// Group: messages from the roster's players at arrival time, group tells,
// and your own lines that are not private to someone outside the group;
// plus "joined" / "left" notes when the roster changes. The roster is the
// caller's (GameState's group model: every member but NPCs). Messages from
// before the roster was known (an archive load) are not placed in Group.
//
// Public: every message; the pane filters by `comm.filters` when drawing.
//
// Cost (the performance contract): `add` is O(1) apart from the cap (one
// shift per array at the cap); `chats` sorts the chats (tens); `search`
// scans at most `max` messages with the lower-case text cached per entry.

import { type CommMessage, cleanName, commPlain, stripAnsi } from './comm';

/** Channels whose talk is directed at the people near you: they open chats. */
export const NEAR_CHANNELS: ReadonlySet<string> = new Set(['tells', 'whispers', 'says', 'emotes', 'socials']);

/** Person colour slots (the pane maps them to its palette). */
export const PERSON_COLORS = 10;

export type PersonColor = number | 'you' | 'enemy';

/** One message in the model. */
export interface ChatEntry {
  /** Arrival order (monotonic). */
  seq: number;
  msg: CommMessage;
  /** Yours. */
  mine: boolean;
  /** The other person's chat key (yours: the destination's), or null. */
  person: string | null;
  /** Talk that opens a chat (a near channel, not a group tell). */
  near: boolean;
  /** A group tell (in or out). */
  groupTell: boolean;
  /** Shown in Group. */
  group: boolean;
  /** Lower-case plain text (search), built on first use. */
  lower?: string;
}

/** A roster change shown in Group. */
export interface GroupNote {
  seq: number;
  ts: number;
  name: string;
  kind: 'joined' | 'left';
}

export type GroupItem = { kind: 'msg'; entry: ChatEntry } | { kind: 'note'; note: GroupNote };

export interface Chat {
  key: string;
  /** Display name (`cleanName`). */
  name: string;
  color: PersonColor;
  /** Everything from and to this person, oldest first. */
  entries: ChatEntry[];
  /** Last near activity (ms), 0 when none: no chat yet. */
  lastNear: number;
  unread: number;
}

export interface AddResult {
  entry: ChatEntry;
  /** The person's chat was opened by this message. */
  created: boolean;
  /** The person's chat moved to the newest place. */
  raised: boolean;
}

export interface CommChatsOptions {
  /** Messages kept (the pane's history size). */
  max?: number;
}

const isYou = (s: string): boolean => s.trim().toLowerCase() === 'you';
const keyOf = (name: string): string => cleanName(name).toLowerCase();
const GROUP_DEST = /^(the )?group$/i;
const GROUP_TELL_IN = / tells the group '/;
const GROUP_TELL_OUT = /^you tell the group '/i;

export class CommChats {
  private readonly max: number;
  private seq = 0;
  private self = '';
  private all: ChatEntry[] = [];
  private groupItems: GroupItem[] = [];
  private readonly people = new Map<string, Chat>();
  private roster = new Set<string>();
  private rosterKnown = false;
  private colorNext = 0;
  private openKey: string | null = 'public';
  private publicShows: (channel: string) => boolean = () => true;
  /** Unread in Public and Group while they are not open. */
  publicUnread = 0;
  groupUnread = 0;

  constructor(opts: CommChatsOptions = {}) {
    this.max = opts.max ?? 1000;
  }

  /** Your character's name (`Char.Name`): its messages count as yours. */
  setSelf(name: string): void {
    this.self = name.trim().toLowerCase();
  }

  /** Which channels Public shows (`comm.filters`): only they count as Public unread. */
  setPublicFilter(fn: (channel: string) => boolean): void {
    this.publicShows = fn;
  }

  /** Forgets everything (a new character, a replay). */
  reset(): void {
    this.all = [];
    this.groupItems = [];
    this.people.clear();
    this.roster = new Set();
    this.rosterKnown = false;
    this.colorNext = 0;
    this.publicUnread = 0;
    this.groupUnread = 0;
  }

  // ------------------------------------------------------------ messages

  /**
   * Adds one message. `quiet` (an archive load): no unread counts. The
   * message's `ts` is its time for the chat order and the window.
   */
  add(m: CommMessage, quiet = false): AddResult {
    const talker = m.talker ?? '';
    const mine = isYou(talker) || (this.self !== '' && talker.trim().toLowerCase() === this.self);
    const plain = stripAnsi(m.text);
    let groupTell = false;
    let person: string | null = null;
    let near = false;
    if (mine) {
      const dest = m.destination?.trim() ?? '';
      if (m.channel === 'tells' && (GROUP_DEST.test(dest) || GROUP_TELL_OUT.test(plain))) groupTell = true;
      else if (dest && !isYou(dest)) person = keyOf(dest);
      else if (m.channel === 'emotes' || m.channel === 'socials') person = this.namedChat(plain);
      near = person !== null && NEAR_CHANNELS.has(m.channel);
    } else if (m.talkerType !== 'npc' && talker.trim() !== '') {
      person = keyOf(talker);
      groupTell = m.channel === 'tells' && GROUP_TELL_IN.test(plain);
      near = !groupTell && NEAR_CHANNELS.has(m.channel);
    }
    const inGroup =
      groupTell ||
      (this.rosterKnown && (mine ? person === null || this.roster.has(person) : person !== null && this.roster.has(person)));
    const entry: ChatEntry = { seq: ++this.seq, msg: m, mine, person, near, groupTell, group: inGroup };
    this.push(this.all, entry);
    if (inGroup) {
      this.pushGroup({ kind: 'msg', entry });
      if (!quiet && !mine && this.openKey !== 'group') this.groupUnread++;
    }
    if (!quiet && !mine && this.openKey !== 'public' && this.publicShows(m.channel)) this.publicUnread++;
    let created = false;
    let raised = false;
    if (person !== null) {
      const name = mine ? cleanName(m.destination ?? person) : cleanName(talker);
      const c = this.chatFor(person, name);
      this.push(c.entries, entry);
      if (near) {
        created = c.lastNear === 0;
        raised = true;
        c.lastNear = Math.max(c.lastNear, m.ts);
        if (!quiet && !mine && this.openKey !== person) c.unread++;
      }
    }
    return { entry, created, raised };
  }

  /** The person with a chat whose name is a whole word of `text`, or null. */
  private namedChat(text: string): string | null {
    const words = new Set(text.toLowerCase().split(/[^a-zÀ-ɏ*]+/).filter(Boolean));
    for (const c of this.people.values()) if (c.lastNear > 0 && words.has(c.key)) return c.key;
    return null;
  }

  private chatFor(key: string, name: string): Chat {
    let c = this.people.get(key);
    if (!c) {
      c = { key, name, color: this.assignColor(name), entries: [], lastNear: 0, unread: 0 };
      this.people.set(key, c);
    }
    return c;
  }

  /** Appends with the cap: the oldest entry leaves every list it is in. */
  private push(list: ChatEntry[], e: ChatEntry): void {
    list.push(e);
    if (list !== this.all || list.length <= this.max) return;
    const old = list.shift()!;
    if (old.person !== null) {
      const c = this.people.get(old.person);
      if (c && c.entries[0] === old) c.entries.shift();
    }
    const g = this.groupItems;
    while (g.length > 0) {
      const first = g[0]!;
      if (first.kind === 'msg' ? first.entry.seq <= old.seq : first.note.seq <= old.seq) g.shift();
      else break;
    }
  }

  private pushGroup(item: GroupItem): void {
    this.groupItems.push(item);
  }

  // -------------------------------------------------------------- roster

  /**
   * The group's players now (names as GMCP sends them; NPCs left out by
   * the caller; yourself left out). Returns who joined and who left; the
   * first roster only sets it (no notes).
   */
  setRoster(names: readonly string[], ts: number): { joined: string[]; left: string[] } {
    const next = new Map<string, string>();
    for (const n of names) if (n.trim() && !isYou(n) && n.trim().toLowerCase() !== this.self) next.set(keyOf(n), cleanName(n));
    const joined: string[] = [];
    const left: string[] = [];
    if (this.rosterKnown) {
      for (const [k, n] of next) if (!this.roster.has(k)) joined.push(n);
      for (const k of this.roster) if (!next.has(k)) left.push(this.people.get(k)?.name ?? cleanName(k));
      for (const name of joined) this.pushGroup({ kind: 'note', note: { seq: ++this.seq, ts, name, kind: 'joined' } });
      for (const name of left) this.pushGroup({ kind: 'note', note: { seq: ++this.seq, ts, name, kind: 'left' } });
    }
    this.roster = new Set(next.keys());
    this.rosterKnown = true;
    return { joined, left };
  }

  /** A group of at least one other player exists. */
  get hasGroup(): boolean {
    return this.roster.size > 0;
  }

  // --------------------------------------------------------------- views

  /** Every message, oldest first (Public draws it with its filters). */
  get publicEntries(): readonly ChatEntry[] {
    return this.all;
  }

  get groupView(): readonly GroupItem[] {
    return this.groupItems;
  }

  chat(key: string): Chat | undefined {
    return this.people.get(key);
  }

  /** The open view: 'public', 'group', a chat key, or null (none). */
  get open(): string | null {
    return this.openKey;
  }

  /** Opens a view and clears its unread. */
  setOpen(key: string | null): void {
    this.openKey = key;
    if (key === 'public') this.publicUnread = 0;
    else if (key === 'group') this.groupUnread = 0;
    else if (key !== null) {
      const c = this.people.get(key);
      if (c) c.unread = 0;
    }
  }

  /**
   * The chats to list, oldest near activity first (newest last): those
   * active within `windowMin` minutes of `now` (`'all'`: every chat), and
   * always the open chat and chats with unread.
   */
  chats(windowMin: number | 'all', now: number): Chat[] {
    const from = windowMin === 'all' ? -Infinity : now - windowMin * 60_000;
    const out: Chat[] = [];
    for (const c of this.people.values()) {
      if (c.lastNear === 0) continue;
      if (c.lastNear >= from || c.unread > 0 || c.key === this.openKey) out.push(c);
    }
    return out.sort((a, b) => a.lastNear - b.lastNear);
  }

  /** Chats hidden by the window that have unread (the list's edge dot). */
  get unreadTotal(): number {
    let n = 0;
    for (const c of this.people.values()) n += c.unread;
    return n;
  }

  // -------------------------------------------------------------- search

  /**
   * People with a chat whose name contains `q`, and every message whose
   * plain text contains it (oldest first; at most `limit`, the newest).
   * Case-insensitive; an empty query finds nothing.
   */
  search(q: string, limit = 200): { people: Chat[]; messages: ChatEntry[] } {
    const needle = q.trim().toLowerCase();
    if (!needle) return { people: [], messages: [] };
    const people = [...this.people.values()].filter((c) => c.lastNear > 0 && c.name.toLowerCase().includes(needle));
    people.sort((a, b) => b.lastNear - a.lastNear);
    const messages: ChatEntry[] = [];
    for (let i = this.all.length - 1; i >= 0 && messages.length < limit; i--) {
      const e = this.all[i]!;
      e.lower ??= commPlain(e.msg).toLowerCase();
      if (e.lower.includes(needle)) messages.push(e);
    }
    return { people, messages: messages.reverse() };
  }

  // -------------------------------------------------------------- colour

  /**
   * A person's colour slot, stable for the session: slots in order of
   * first sight (a person's first message), no repeat until all
   * `PERSON_COLORS` are used, then by a hash of the name. `You` and enemies
   * (`*Name*`) have fixed roles. Names never seen (an NPC) get the hash.
   */
  colorOf(name: string): PersonColor {
    const n = cleanName(name);
    const fixed = this.fixedColor(n);
    if (fixed !== null) return fixed;
    return this.people.get(n.toLowerCase())?.color ?? hashColor(n);
  }

  private fixedColor(n: string): PersonColor | null {
    if (n === 'You' || n.toLowerCase() === this.self) return 'you';
    if (/^\*.+\*$/.test(n)) return 'enemy';
    return null;
  }

  private assignColor(name: string): PersonColor {
    const n = cleanName(name);
    const fixed = this.fixedColor(n);
    if (fixed !== null) return fixed;
    if (this.colorNext < PERSON_COLORS) return this.colorNext++;
    return hashColor(n);
  }
}

function hashColor(n: string): number {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return h % PERSON_COLORS;
}
