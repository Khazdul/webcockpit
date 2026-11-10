// Comm pane (ADR 0134; Inv §2.7 for the data): Public, Group and one chat
// per person, from the GMCP channel history.
//
//   .wc-comm[data-mode=list|rail|folded][data-light][data-search]
//     .wc-cm-col                    the chat column (absent folded)
//       .wc-cm-pins                 Public, Group (`.wc-cm-ent`)
//       .wc-cm-gap
//       .wc-cm-chatwrap[data-up][data-down]
//         .wc-cm-chats              the private chats, oldest first, filling from the top
//         .wc-cm-chev.is-up / .is-down   more that way (a dot: a hidden chat has unread)
//     .wc-cm-spine > .wc-cm-handle  between column and thread: shows on hover
//     .wc-cm-main
//       .wc-cm-top                  folded: unfold + the open chat's chip; the search
//       .wc-alist                   the open view, bottom-anchored (ADR 0052)
//       .wc-alist-more              `↓ N new` while scrolled back
//       .wc-cm-results              search results (in place of the thread)
//       .wc-cm-reply > input        the reply line
//
// Data: `CommChats` (src/gmcp/comm-chats.ts) holds the messages (1000) and
// derives the views. History: on a live `Char.Name` the character's archive
// (last 1000 of 7 days; comm-archive.ts) is loaded quietly (no unread);
// messages that arrive meanwhile are kept and written after the load.
// Every live message goes to the archive. A replay starts empty and never
// touches the archive. The archive is pruned when the pane starts and on
// every live `Char.Name`. Without IndexedDB the pane works in memory.
//
// Cost (ADR 0134 "Performance rules"): a message renders once in the next
// frame (coalesced). The thread shows the open view's newest `THREAD_PAGE`
// messages and grows by a page on a scroll to its top; a render appends the
// new ones (AnchoredList), a view change rebuilds. The column keeps one
// element per chat and rewrites only the rows whose text changed; it moves
// rows only when the order changed. Which rows are out of view (the
// chevrons and their dot) comes from an IntersectionObserver, so no layout
// is read per message. The column's mode follows the pane's width in cells
// × the cell width (no measuring). Search runs 120 ms after typing over at
// most 1000 messages.
//
// Keys: the pane never takes the game's keys except in its own fields (the
// reply line, the search; the input pane leaves INPUTs alone) and Ctrl+F
// while the pointer is over the pane (opens the search). A selection in the
// thread or the results is copied on mouse up, as the output pane does; the
// game's keys still reach the game (the input pane routes keystrokes typed
// elsewhere).

import './panes.css';
import './comm.css';
import { CommArchive } from '../gmcp/comm-archive';
import {
  type ChannelInfo,
  type CommMessage,
  DEFAULT_CAPTIONS,
  channelLabel,
  cleanName,
  commPlain,
  formatComm,
  parseAnsi,
  parseChannelList,
  parseChannelText,
  publicShows,
  stripAnsi,
} from '../gmcp/comm';
import { type Chat, type ChatEntry, CommChats, type GroupItem, type GroupNote } from '../gmcp/comm-chats';
import { paneLight } from '../theme/apply';
import { mix, paneContentBg } from '../theme/color';
import { colorToCss } from '../ui/palette';
import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { type StyleRun, gmcpKey } from '../core/types';
import { COMM_LIST_WIDTH_MAX, COMM_LIST_WIDTH_MIN } from '../settings/types';
import { AnchoredList, type ListMetrics } from './anchored-list';
import {
  type ColumnLayout,
  SEP_GAP_MS,
  THREAD_PAGE,
  ago,
  agoText,
  autoListWidth,
  bubbleText,
  channelInk,
  channelWord,
  clock,
  columnLayout,
  personInk,
  snippet,
  spineSnap,
  spineStep,
  splitHits,
} from './comm-view';
import { type IconName, iconSvg } from './icons';
import { type PaneTooltip, installPaneTooltip, setTip } from './pane-tooltip';
import { paneShade } from './shade';
import { PaneShell } from './pane';
import type { PaneContext } from './context';

/** What Public filters by (`comm.filters`, `comm.npcs`). */
type PublicFilter = { readonly filters: Readonly<Record<string, boolean>>; readonly npcs: boolean };

/** How much darker than the pane the light-pane text colours are fitted against (the window's edge shade). */
const COMM_EDGE_SHADE = 0.06;

/** Messages kept in memory (Inv §2.7.7). */
export const COMM_HISTORY_MAX = 1000;

/** Search runs this long after the last keystroke (ms). */
export const SEARCH_DEBOUNCE_MS = 120;
/** Ages in the name list are refreshed this often while shown (ms). */
const AGE_TICK_MS = 30_000;
/** A press that travels less than this (px) on the spine is a click. */
const SPINE_CLICK_PX = 4;
/** Message hits shown at most. */
const SEARCH_LIMIT = 200;
/** Under this many cell rows the chat column is one line per entry. */
const COMPACT_ROWS = 14;
/** The chat column's snippets and ages are rewritten at most this often (ms). */
const COL_TEXT_MS = 1000;

const PUBLIC = 'public';
const GROUP = 'group';

export interface CommPaneOptions {
  /** List measuring (tests). */
  metrics?: ListMetrics;
  /** Scroll rest time (tests; ms). */
  settleMs?: number;
  /** Clipboard writer (tests). */
  writeClipboard?: (text: string) => Promise<void>;
}

/** An item in the thread: a message, or a Group note. */
type ThreadItem = ChatEntry | GroupItem;

const isGroupItem = (i: ThreadItem): i is GroupItem => 'kind' in i;
const entryOf = (i: ThreadItem): ChatEntry | null => (isGroupItem(i) ? (i.kind === 'msg' ? i.entry : null) : i);
const tsOf = (i: ThreadItem): number => (isGroupItem(i) ? (i.kind === 'msg' ? i.entry.msg.ts : i.note.ts) : i.msg.ts);

/** One row of the chat column. */
interface ColRow {
  el: HTMLButtonElement;
  av: HTMLSpanElement;
  name: HTMLElement;
  age: HTMLElement;
  snip: HTMLElement;
  badge: HTMLElement;
  sig: string;
  /** The snippet, age and tooltip as last written (part of `sig`). */
  text: string;
  unread: number;
}

export class CommPane extends PaneShell {
  private readonly root: HTMLDivElement;
  private readonly col: HTMLDivElement;
  private readonly pins: HTMLDivElement;
  private readonly chatWrap: HTMLDivElement;
  private readonly chatsEl: HTMLDivElement;
  private readonly chatList: HTMLDivElement;
  private readonly chevUp: HTMLDivElement;
  private readonly chevDown: HTMLDivElement;
  private readonly spine: HTMLDivElement;
  private readonly handle: HTMLButtonElement;
  private readonly main: HTMLDivElement;
  private readonly top: HTMLDivElement;
  private readonly unfoldBtn: HTMLButtonElement;
  private readonly chip: HTMLButtonElement;
  private readonly searchBox: HTMLDivElement;
  private readonly searchBtn: HTMLButtonElement;
  private readonly searchInput: HTMLInputElement;
  private readonly searchClear: HTMLButtonElement;
  private readonly results: HTMLDivElement;
  private readonly reply: HTMLDivElement;
  private readonly replyInput: HTMLInputElement;
  private readonly list: AnchoredList<ThreadItem>;
  private readonly tip: PaneTooltip;
  private readonly writeClipboard: (text: string) => Promise<void>;

  private readonly chats = new CommChats({ max: COMM_HISTORY_MAX });
  private history: CommMessage[] = [];
  private channels: ChannelInfo[] | null = null;
  private character = '';
  private replay = false;
  /** Archive (null until opened, or when unavailable). */
  private archive: CommArchive | null = null;
  private readonly archiveP: Promise<CommArchive | null>;
  /** Live messages waiting for the seed load before they are written. */
  private pendingWrites: CommMessage[] | null = null;
  private seedToken = 0;
  /** The roster's names as last given to the model (a key). */
  private rosterKey = '';
  private rosterNames: string[] = [];
  /** A `Group.*` message came this connection, and the model has had a roster since. */
  private rosterSeen = false;
  private rosterSet = false;

  // view state
  private colRows = new Map<string, ColRow>();
  private pinRows = new Map<string, ColRow>();
  private order = '';
  private layout: ColumnLayout = { mode: 'list', width: 0 };
  /** A spine drag's layout until it ends (then it goes to the settings). */
  private dragLayout: ColumnLayout | null = null;
  private limit = THREAD_PAGE;
  private threadView = '';
  /** The key and the first item of the last thread render (`fixSeps`). */
  private listKey = '';
  private firstItem: ThreadItem | undefined;
  /** Item → the one before it in the thread (separators, bubble runs), set per render. */
  private prevOf = new Map<ThreadItem, ThreadItem | undefined>();
  private inks = { light: false, bg: '#000000' };
  private orderKeys: string[] = [];
  private hiddenUp = new Set<Element>();
  private hiddenDown = new Set<Element>();
  private io: IntersectionObserver | null = null;
  private searchOpen = false;
  private query = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchDirty = false;
  /** Public's filtered messages, kept between renders (`publicItems`). */
  private publicCache: {
    src: readonly ChatEntry[];
    filters: Readonly<Record<string, boolean>>;
    npcs: boolean;
    lastSeq: number;
    list: ChatEntry[];
  } | null = null;
  private searchByUser = false;
  /** Removes the deferred-refresh selection listener, while one waits. */
  private selWatch: (() => void) | null = null;
  private hovered = false;
  private ageTimer: ReturnType<typeof setInterval> | null = null;
  /** When the column's texts were last written, and the catch-up timer. */
  private colTextAt = -Infinity;
  private colTextTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: PaneContext, opts: CommPaneOptions = {}) {
    super(ctx, 'comm');
    const doc = ctx.doc;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    const button = (cls: string, icon: IconName | null, label: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.setAttribute('aria-label', label);
      if (icon) b.append(iconSvg(doc, icon, 'wc-cm-i'));
      return b;
    };
    this.writeClipboard = opts.writeClipboard ?? ((text) => navigator.clipboard.writeText(text));
    this.root = div('wc-comm');
    this.col = div('wc-cm-col');
    this.pins = div('wc-cm-pins');
    this.chatWrap = div('wc-cm-chatwrap');
    this.chatsEl = div('wc-cm-chats');
    this.chatList = div('wc-cm-chatlist');
    this.chatsEl.append(this.chatList);
    // A hint only (the wheel scrolls the chats): no button, hidden from readers.
    const chev = (cls: string, icon: IconName): HTMLDivElement => {
      const d = div(cls);
      d.setAttribute('aria-hidden', 'true');
      d.append(iconSvg(doc, icon, 'wc-cm-i'));
      return d;
    };
    this.chevUp = chev('wc-cm-chev is-up', 'chevUp');
    this.chevDown = chev('wc-cm-chev is-down', 'chevDown');
    this.chatWrap.append(this.chatsEl, this.chevUp, this.chevDown);
    this.col.append(this.pins, div('wc-cm-gap'), this.chatWrap);
    this.spine = div('wc-cm-spine');
    // A small fold button on the spine: a chevron toward where the column
    // folds, shown on hover and focus (owner's first test: not a bar that
    // reads as a scrollbar).
    this.handle = button('wc-cm-handle', 'chevLeft', 'Hide the chat list (drag to resize)');
    this.handle.setAttribute('role', 'separator');
    this.handle.setAttribute('aria-orientation', 'vertical');
    this.spine.append(this.handle);
    this.main = div('wc-cm-main');
    this.top = div('wc-cm-top');
    this.unfoldBtn = button('wc-cm-unfold', 'unfold', 'Show the chat list');
    this.chip = button('wc-cm-chip', null, 'Open chat');
    this.searchBox = div('wc-cm-search');
    this.searchBtn = button('wc-cm-sbtn', 'search', 'Search (Ctrl+F)');
    this.searchInput = doc.createElement('input');
    this.searchInput.className = 'wc-cm-sinput';
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search names and messages';
    this.searchInput.setAttribute('aria-label', 'Search names and messages');
    this.searchInput.setAttribute(OWN_KEYS_ATTR, '');
    this.searchInput.tabIndex = -1;
    this.searchClear = button('wc-cm-sclear', 'close', 'Close the search (Esc)');
    this.searchClear.tabIndex = -1;
    this.searchBox.append(this.searchBtn, this.searchInput, this.searchClear);
    this.top.append(this.unfoldBtn, this.chip, this.searchBox);
    this.list = new AnchoredList<ThreadItem>(doc, () => this.markDirty(), {
      ...(opts.metrics ? { metrics: opts.metrics } : {}),
      ...(opts.settleMs !== undefined ? { settleMs: opts.settleMs } : {}),
    });
    this.list.el.classList.add('wc-cm-thread');
    this.list.more.classList.add('wc-cm-more');
    this.results = div('wc-cm-results');
    this.results.hidden = true;
    this.reply = div('wc-cm-reply');
    this.replyInput = doc.createElement('input');
    this.replyInput.className = 'wc-cm-rinput';
    this.replyInput.type = 'text';
    this.replyInput.autocomplete = 'off';
    this.replyInput.spellcheck = false;
    // Its own keys: a click focuses it and the cockpit does not hand the
    // keys back to the game on the mouse up (owner's first test).
    this.replyInput.setAttribute(OWN_KEYS_ATTR, '');
    this.reply.append(this.replyInput);
    this.main.append(this.top, this.list.el, this.list.more, this.results, this.reply);
    this.root.append(this.col, this.spine, this.main);

    this.tip = installPaneTooltip(doc);
    this.own(this.tip.attach(this.root));
    this.wire();

    this.archiveP = CommArchive.open(ctx.openDb, { now: ctx.now }).then(
      async (a) => {
        this.archive = a;
        await a.prune().catch(() => 0);
        return a;
      },
      () => null,
    );

    this.own(ctx.bus.on('gmcp', (m) => this.onGmcp(gmcpKey(m), m.data)));
    this.own(
      ctx.bus.on('conn.state', (s) => {
        if (s.state === 'connecting') this.replay = s.replay === true;
      }),
    );
    this.chats.setPublicFilter((m) => publicShows(ctx.settings.get().comm, m));
    this.own(
      ctx.settings.subscribe((next, prev) => {
        if (next.comm === prev.comm) return;
        if (this.dragLayout === null) this.markDirty();
      }),
    );
    this.own(ctx.game.subscribe((part) => part === 'group' && this.syncRoster()));
    this.own(() => this.list.dispose());
    this.own(() => {
      this.io?.disconnect();
      if (this.searchTimer !== null) clearTimeout(this.searchTimer);
      if (this.ageTimer !== null) clearInterval(this.ageTimer);
      if (this.colTextTimer !== null) clearTimeout(this.colTextTimer);
      this.selWatch?.();
    });
    // Hidden (0 × 0): no age ticks; the next render on show starts them again.
    this.own(this.onResize((c, r) => c === 0 && r === 0 && this.stopAges()));
    this.syncRoster();
  }

  // ------------------------------------------------------------------ data

  /** One GMCP message; `p` is the package in lower case. */
  private onGmcp(p: string, data: unknown): void {
    if (p === 'comm.channel.text') {
      const t = parseChannelText(data);
      if (t) this.addMessage({ ...t, ts: this.ctx.now() });
    } else if (p === 'comm.channel.list') {
      const l = parseChannelList(data);
      if (l) this.channels = l;
    } else if (p === 'char.name') {
      const n = (data as { name?: unknown } | undefined)?.name;
      if (typeof n === 'string' && n) this.onCharacter(n);
    } else if (p === 'group.set' || p === 'group.add' || p === 'group.remove' || p === 'group.update') {
      // A roster is known from here on; the game state may apply the
      // message before or after this handler, so read it now and again on
      // its 'group' change.
      this.rosterSeen = true;
      this.syncRoster();
    }
  }

  private addMessage(msg: CommMessage): void {
    this.history.push(msg);
    if (this.history.length > COMM_HISTORY_MAX) this.history.splice(0, this.history.length - COMM_HISTORY_MAX);
    this.chats.add(msg);
    // The results follow only talk they would show.
    if (this.searchOpen && this.matchesSearch(msg)) this.searchDirty = true;
    if (!this.replay && this.character) {
      if (this.pendingWrites) this.pendingWrites.push(msg);
      else this.write(msg);
    }
    this.markDirty();
  }

  private write(msg: CommMessage): void {
    const a = this.archive;
    if (!a) return;
    a.append({ character: this.character, ...msg }).catch(() => undefined);
  }

  /**
   * The model again from `history` (a seed load, a new character). The
   * first `quiet` messages (the archive) come back quietly and outside
   * Group (it starts empty until new talk, ADR 0134 49a addendum); then the
   * roster, if one has been seen this connection; then the rest (live
   * messages that came in during the load) as they arrived. Unread counts
   * carry over; the colours stay (the model keeps them).
   */
  private rebuild(quiet: number): void {
    const open = this.chats.open;
    const unread = this.chats.unreadSnapshot();
    this.chats.reset();
    this.chats.setSelf(this.character);
    for (let i = 0; i < quiet && i < this.history.length; i++) this.chats.add(this.history[i]!, true, true);
    if (this.rosterSeen) this.chats.setRoster(this.rosterNames, this.ctx.now());
    for (let i = Math.max(0, quiet); i < this.history.length; i++) this.chats.add(this.history[i]!);
    this.chats.setOpen(open === PUBLIC || open === GROUP || (open && this.chats.chat(open)) ? open : PUBLIC);
    this.chats.restoreUnread(unread);
    this.threadView = '';
    this.publicCache = null;
    this.searchDirty = this.searchOpen;
  }

  /** `Char.Name`: seed the history from the archive (live) or start empty (replay). */
  private onCharacter(name: string): void {
    const token = ++this.seedToken;
    const changed = name !== this.character;
    this.character = name;
    if (this.replay) {
      this.history = [];
      this.pendingWrites = null;
      this.rebuild(0);
      this.list.toLive();
      this.markDirty();
      return;
    }
    if (changed) {
      this.history = [];
      this.rebuild(0);
    } else this.chats.setSelf(name);
    this.pendingWrites = [];
    void this.archiveP.then(async (a) => {
      let loaded: CommMessage[] | null = null;
      if (a) {
        try {
          const recs = await a.loadRecent(name, COMM_HISTORY_MAX);
          loaded = recs.map((r) => ({
            ts: r.ts,
            channel: r.channel,
            talker: r.talker,
            talkerType: r.talkerType,
            destination: r.destination,
            text: r.text,
          }));
        } catch {
          loaded = null;
        }
        // Each live login prunes, so a tab kept open for days stays bounded
        // (the prune at open covers only the start).
        void a.prune().catch(() => 0);
      }
      if (token !== this.seedToken) return;
      const pending = this.pendingWrites ?? [];
      this.pendingWrites = null;
      if (loaded) {
        this.history = [...loaded, ...pending].slice(-COMM_HISTORY_MAX);
        this.rebuild(this.history.length - pending.length);
        this.list.toLive();
      }
      for (const m of pending) this.write(m);
      this.markDirty();
    });
  }

  /**
   * The group's players to the model when they change (NPCs left out),
   * once a roster has really been seen this connection (a `Group.*`
   * message): the first one is the baseline (no "joined" for those already
   * there), later changes give "joined" / "left". Before it the model has
   * no roster, so nothing goes to Group but group tells.
   */
  private syncRoster(): void {
    if (!this.rosterSeen) return;
    const names = this.ctx.game.group
      .list()
      .filter((m) => m.type !== 'npc')
      .map((m) => m.name)
      .filter((n) => n.trim() !== '');
    const key = names.map((n) => n.toLowerCase()).sort().join('\n');
    if (key === this.rosterKey && this.rosterSet) return;
    this.rosterKey = key;
    this.rosterNames = names;
    this.rosterSet = true;
    this.chats.setRoster(names, this.ctx.now());
    this.markDirty();
  }

  protected override onActiveChange(active: boolean): void {
    if (active) return;
    // A disconnect: the next roster is a first one (no "joined" for all).
    this.chats.forgetRoster();
    this.rosterSeen = false;
    this.rosterSet = false;
    this.rosterKey = '';
    this.rosterNames = [];
  }

  /** The history (tests, oldest first). */
  get messages(): readonly CommMessage[] {
    return this.history;
  }

  /** The conversation model (tests). */
  get model(): CommChats {
    return this.chats;
  }

  /** Resolves when the archive is open (or known to be unavailable). */
  whenReady(): Promise<unknown> {
    return this.archiveP;
  }

  // --------------------------------------------------------------- actions

  /** Opens a view: 'public', 'group' or a chat key. */
  openView(key: string): void {
    if (this.chats.open === key) {
      if (this.searchOpen) this.closeSearch();
      return;
    }
    this.chats.setOpen(key);
    this.limit = THREAD_PAGE;
    this.list.toLive();
    if (this.searchOpen) this.closeSearch();
    this.markDirty();
  }

  /** Folds the chat column away (or back). */
  setFolded(on: boolean): void {
    if (this.ctx.settings.get().comm.folded === on) return;
    this.ctx.settings.update({ comm: { folded: on } });
  }

  private setColumn(l: ColumnLayout): void {
    if (l.mode === 'folded') return this.setFolded(true);
    const w = Math.max(COMM_LIST_WIDTH_MIN, Math.min(COMM_LIST_WIDTH_MAX, Math.round(l.width)));
    this.ctx.settings.update({ comm: { folded: false, listWidth: w } });
  }

  openSearch(): void {
    if (this.searchOpen) {
      this.searchInput.focus({ preventScroll: true });
      this.searchInput.select();
      return;
    }
    this.searchOpen = true;
    this.searchInput.tabIndex = 0;
    this.searchClear.tabIndex = 0;
    this.root.toggleAttribute('data-search', true);
    this.searchInput.focus({ preventScroll: true });
    this.runSearch(true);
  }

  closeSearch(): void {
    if (!this.searchOpen) return;
    this.searchOpen = false;
    this.query = '';
    this.searchInput.value = '';
    this.searchInput.tabIndex = -1;
    this.searchClear.tabIndex = -1;
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.root.removeAttribute('data-search');
    this.results.hidden = true;
    this.results.replaceChildren();
    this.list.el.hidden = false;
    this.markDirty();
  }

  /** Sends the reply line's text (Enter). */
  private sendReply(): void {
    const text = this.replyInput.value.trim();
    if (!text) return;
    const open = this.chats.open ?? PUBLIC;
    let cmd: string;
    // Public has no reply line (owner's first test).
    if (open === PUBLIC) return;
    if (open === GROUP) cmd = `tell group ${text}`;
    else {
      const c = this.chats.chat(open);
      if (!c || !tellable(c.name)) return;
      cmd = `tell ${c.name} ${text}`;
    }
    this.ctx.sender.sendCommand(cmd);
    // The field keeps the keys for the next line.
    this.replyInput.value = '';
  }

  // ---------------------------------------------------------------- events

  private wire(): void {
    const doc = this.ctx.doc;
    const win = doc.defaultView;
    const onCol = (e: MouseEvent): void => {
      const b = (e.target as Element).closest<HTMLElement>('.wc-cm-ent');
      if (b?.dataset.key) this.openView(b.dataset.key);
    };
    this.col.addEventListener('click', onCol);
    this.unfoldBtn.addEventListener('click', () => this.setFolded(false));
    this.chip.addEventListener('click', () => this.setFolded(false));
    this.searchBtn.addEventListener('click', () => this.openSearch());
    this.searchClear.addEventListener('click', () => this.closeSearch());
    this.searchInput.addEventListener('input', () => {
      this.query = this.searchInput.value;
      this.scheduleSearch(true);
    });
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.closeSearch();
      }
    });
    this.searchBox.addEventListener('focusout', (e) => {
      if (this.searchBox.contains(e.relatedTarget as Node | null)) return;
      // A blur on an empty field folds it; with text it stays (the results are being read).
      if (this.searchOpen && this.searchInput.value.trim() === '') this.closeSearch();
    });
    this.results.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.wc-cm-rp');
      if (b?.dataset.key) this.openView(b.dataset.key);
    });
    this.replyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        this.sendReply();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.replyInput.blur();
        this.ctx.focusGame?.();
      }
    });
    // A scroll near the top of the thread shows a page more.
    this.list.el.addEventListener(
      'scroll',
      () => {
        const el = this.list.el;
        if (el.scrollTop < el.clientHeight && this.limit < this.viewSize()) {
          this.limit += THREAD_PAGE;
          this.markDirty();
        }
      },
      { passive: true },
    );
    // The spine: click folds, drag resizes and snaps, double-click is automatic.
    this.handle.addEventListener('pointerdown', this.onSpineDown);
    this.spine.addEventListener('pointerdown', (e) => {
      if (e.target === this.spine) this.onSpineDown(e);
    });
    // A click from the keyboard (Enter, Space) folds too; the pointer's is handled on its press.
    this.handle.addEventListener('click', (e) => {
      if (e.detail === 0) this.setFolded(true);
    });
    this.handle.addEventListener('keydown', (e) => {
      const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (dir === 0) return;
      e.preventDefault();
      const next = spineStep(this.layout.mode, dir);
      if (next === this.layout.mode) return;
      const w = this.paneWidth();
      const h = this.cellH();
      this.setColumn(next === 'rail' ? spineSnap(40, w, h) : next === 'list' ? { mode: 'list', width: autoListWidth(w) } : { mode: 'folded', width: 0 });
    });
    // Copy on select (as the output pane); the game keeps its keys.
    const onUp = (): void => {
      const sel = doc.getSelection();
      const text = sel && !sel.isCollapsed ? sel.toString() : '';
      if (text && sel && (this.list.el.contains(sel.anchorNode) || this.results.contains(sel.anchorNode))) {
        this.writeClipboard(text).catch(() => undefined);
      }
    };
    this.list.el.addEventListener('mouseup', onUp);
    this.results.addEventListener('mouseup', onUp);
    // Ctrl+F over the pane opens the search.
    this.el.addEventListener('pointerenter', () => (this.hovered = true));
    this.el.addEventListener('pointerleave', () => (this.hovered = false));
    const onKey = (e: KeyboardEvent): void => {
      if (!this.hovered || !this.visible || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key !== 'f' && e.key !== 'F') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.openSearch();
    };
    doc.addEventListener('keydown', onKey, true);
    this.own(() => doc.removeEventListener('keydown', onKey, true));
    // The wheel over the pane outside a scroller scrolls the thread.
    const onWheel = (e: WheelEvent): void => {
      if (e.defaultPrevented) return;
      const t = e.target as Node;
      if (this.col.contains(t) || this.list.el.contains(t) || this.results.contains(t)) return;
      const s = this.searchOpen ? this.results : this.list.el;
      const h = this.cellH() || 16;
      const px = e.deltaMode === 1 ? e.deltaY * h : e.deltaMode === 2 ? e.deltaY * s.clientHeight : e.deltaY;
      if (px) s.scrollTop += px;
    };
    this.el.addEventListener('wheel', onWheel, { passive: true });
    this.own(() => this.el.removeEventListener('wheel', onWheel));
    if (win && typeof win.IntersectionObserver === 'function') {
      this.io = new win.IntersectionObserver(this.onIntersect, { root: this.chatsEl, threshold: 0.6 });
    }
  }

  private readonly onIntersect = (entries: IntersectionObserverEntry[]): void => {
    for (const e of entries) {
      const t = e.target;
      this.hiddenUp.delete(t);
      this.hiddenDown.delete(t);
      if (e.isIntersecting) continue;
      const root = e.rootBounds;
      if (!root) continue;
      if (e.boundingClientRect.top < root.top) this.hiddenUp.add(t);
      else this.hiddenDown.add(t);
    }
    this.updateChevrons();
  };

  private updateChevrons(): void {
    const unread = (set: Set<Element>): boolean => {
      for (const el of set) if (el.hasAttribute('data-unread')) return true;
      return false;
    };
    const up = this.hiddenUp.size > 0;
    const down = this.hiddenDown.size > 0;
    toggle(this.chatWrap, 'data-up', up);
    toggle(this.chatWrap, 'data-down', down);
    toggle(this.chevUp, 'data-unread', up && unread(this.hiddenUp));
    toggle(this.chevDown, 'data-unread', down && unread(this.hiddenDown));
  }

  private readonly onSpineDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    const x0 = e.clientX;
    const w0 = this.layout.mode === 'folded' ? 0 : this.layout.width;
    const paneW = this.paneWidth();
    const cellH = this.cellH();
    let moved = false;
    const move = (ev: PointerEvent): void => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < SPINE_CLICK_PX) return;
      if (!moved) {
        moved = true;
        this.root.toggleAttribute('data-dragging', true);
        if (this.searchOpen) this.closeSearch();
      }
      const l = spineSnap(w0 + dx, paneW, cellH);
      if (this.dragLayout && l.mode === this.dragLayout.mode && l.width === this.dragLayout.width) return;
      this.dragLayout = l;
      this.markDirty();
    };
    const up = (): void => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      this.root.removeAttribute('data-dragging');
      const l = this.dragLayout;
      this.dragLayout = null;
      // A click folds at once. The spine shows only while unfolded, so a
      // click only ever folds: a double-click's second press (perhaps let
      // go after the fold rendered) does nothing more.
      if (!moved) this.setFolded(true);
      else if (l) this.setColumn(l);
      this.markDirty();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  /**
   * Runs the search after the debounce: `user` (typing) starts the results
   * at their top; a refresh for new talk or a new ink keeps where they were.
   */
  private scheduleSearch(user = false): void {
    const win = this.ctx.doc.defaultView;
    this.searchByUser ||= user;
    if (this.searchTimer !== null) (win ? win.clearTimeout.bind(win) : clearTimeout)(this.searchTimer);
    this.searchTimer = (win ? win.setTimeout.bind(win) : setTimeout)(() => {
      this.searchTimer = null;
      const byUser = this.searchByUser;
      this.searchByUser = false;
      this.runSearch(byUser);
    }, SEARCH_DEBOUNCE_MS);
  }

  /** New talk that the open search would show (its text or a person matches). */
  private matchesSearch(m: CommMessage): boolean {
    const q = this.query.trim().toLowerCase();
    if (!q) return false;
    if (commPlain(m).toLowerCase().includes(q)) return true;
    return [m.talker, m.destination ?? ''].some((n) => n !== '' && cleanName(n).toLowerCase().includes(q));
  }

  /** Renders again once the selection has left the results (a deferred refresh). */
  private awaitSelectionEnd(): void {
    if (this.selWatch) return;
    const doc = this.ctx.doc;
    const on = (): void => {
      if (this.selectingResults()) return;
      doc.removeEventListener('selectionchange', on);
      this.selWatch = null;
      this.markDirty();
    };
    this.selWatch = () => doc.removeEventListener('selectionchange', on);
    doc.addEventListener('selectionchange', on);
  }

  /** A selection lies in the results (it must not be rebuilt away under the reader). */
  private selectingResults(): boolean {
    const sel = this.ctx.doc.getSelection();
    return sel !== null && !sel.isCollapsed && this.results.contains(sel.anchorNode);
  }

  // ---------------------------------------------------------------- render

  private paneWidth(): number {
    return this.cols * (this.ctx.cells.get().w || 9);
  }

  private cellH(): number {
    return this.ctx.cells.get().h || 17;
  }

  protected override blank(): void {
    this.content.replaceChildren();
    this.stopAges();
  }

  protected override render(): void {
    if (this.root.parentNode !== this.content) this.content.replaceChildren(this.root);
    const s = this.ctx.settings.get();
    const shade = paneShade(s, 'comm');
    const light = paneLight(s, 'comm');
    const { color, glass } = s.panes.comm;
    const bg = mix(paneContentBg(color, s.appearance.bg, glass), '#000000', COMM_EDGE_SHADE);
    const inksChanged = light !== this.inks.light || bg !== this.inks.bg;
    this.inks = { light, bg };
    // The results take the new inks too.
    if (inksChanged && this.searchOpen && this.query.trim()) this.searchDirty = true;
    toggle(this.root, 'data-light', light);
    toggle(this.root, 'data-compact', this.rows < COMPACT_ROWS);
    setProp(this.root, '--cm-fg', shade.ramp.vtext);
    setProp(this.root, '--cm-dim', shade.ramp.label);

    // Column layout.
    const l = this.dragLayout ?? columnLayout(this.paneWidth(), s.comm.listWidth, s.comm.folded, this.cellH());
    if (l.mode !== this.layout.mode || l.width !== this.layout.width) {
      this.layout = l;
      if (this.root.dataset.mode !== l.mode) {
        this.root.dataset.mode = l.mode;
        this.order = '';
        this.orderKeys = [];
      }
      setProp(this.root, '--cm-colw', `${l.width}px`);
    }
    const now = this.ctx.now();
    if (l.mode !== 'folded') this.renderColumn(s.comm.chatWindow, now, inksChanged);
    if (l.mode === 'list') this.startAges();
    else this.stopAges();
    this.renderTop(inksChanged);

    // Thread.
    const open = this.currentView();
    const items = this.viewItems(open, s.comm);
    const shown = items.length > this.limit ? items.slice(-this.limit) : items;
    this.prevOf.clear();
    for (let i = 0; i < shown.length; i++) this.prevOf.set(shown[i]!, shown[i - 1]);
    const key = `${open}|${light}|${bg}|${open === PUBLIC ? `${JSON.stringify(s.comm.filters)}${s.comm.npcs ? '+npc' : ''}` : ''}`;
    if (key !== this.threadView) {
      this.threadView = key;
      this.root.dataset.view = open === PUBLIC || open === GROUP ? open : 'chat';
    }
    if (this.list.size === 0 || key !== this.listKey) this.firstItem = undefined;
    this.listKey = key;
    this.list.render(shown, (it) => this.buildItem(it, open, now), key, (n) => `↓ ${n} new`);
    this.fixSeps(shown, now);
    this.renderReply(open);

    if (this.searchOpen && this.searchDirty && this.searchTimer === null) this.scheduleSearch();
  }

  /** The open view, or Public when the open chat is gone. */
  private currentView(): string {
    const o = this.chats.open;
    if (o === PUBLIC || o === GROUP) return o;
    if (o && this.chats.chat(o)) return o;
    this.chats.setOpen(PUBLIC);
    return PUBLIC;
  }

  private viewItems(open: string, comm: PublicFilter): readonly ThreadItem[] {
    if (open === PUBLIC) return this.publicItems(comm);
    if (open === GROUP) return this.chats.groupView;
    return this.chats.chat(open)?.entries ?? [];
  }

  /**
   * Public's messages through the filters and the NPC switch, kept between
   * renders: built whole when they or the model's list change (a rebuild), else
   * trimmed at the front and appended to with what came since.
   */
  private publicItems(comm: PublicFilter): readonly ChatEntry[] {
    const { filters, npcs } = comm;
    const src = this.chats.publicEntries;
    let c = this.publicCache;
    if (!c || c.src !== src || c.filters !== filters || c.npcs !== npcs) {
      c = { src, filters, npcs, lastSeq: 0, list: [] };
      this.publicCache = c;
    }
    const first = src[0]?.seq ?? Infinity;
    let drop = 0;
    while (drop < c.list.length && c.list[drop]!.seq < first) drop++;
    if (drop > 0) c.list.splice(0, drop);
    let i = src.length;
    while (i > 0 && src[i - 1]!.seq > c.lastSeq) i--;
    for (; i < src.length; i++) {
      const e = src[i]!;
      if (publicShows(comm, e.msg)) c.list.push(e);
    }
    if (src.length > 0) c.lastSeq = src[src.length - 1]!.seq;
    return c.list;
  }

  private viewSize(): number {
    const open = this.currentView();
    return this.viewItems(open, this.ctx.settings.get().comm).length;
  }

  private startAges(): void {
    if (this.ageTimer !== null) return;
    const win = this.ctx.doc.defaultView;
    this.ageTimer = (win ? win.setInterval.bind(win) : setInterval)(() => this.markDirty(), AGE_TICK_MS);
  }

  private stopAges(): void {
    if (this.ageTimer === null) return;
    const win = this.ctx.doc.defaultView;
    (win ? win.clearInterval.bind(win) : clearInterval)(this.ageTimer);
    this.ageTimer = null;
  }

  // --------------------------------------------------------------- column

  private renderColumn(windowMin: 10 | 30 | 60 | 'all', now: number, force: boolean): void {
    const list = this.layout.mode === 'list';
    // The snippets and ages follow at most once a second (a burst of talk
    // rewrites them once); order, unread and selection follow at once.
    // Measured: a snippet rewritten on every message cost headless Firefox
    // a dropped frame or more per burst (stage 49c).
    const texts = force || now - this.colTextAt >= COL_TEXT_MS;
    if (texts) this.colTextAt = now;
    else this.scheduleColText(COL_TEXT_MS - (now - this.colTextAt));
    const open = this.chats.open;
    const comm = this.ctx.settings.get().comm;
    // Public and Group.
    const lastPub = lastWhere(this.chats.publicEntries, (e) => publicShows(comm, e.msg));
    const lastGrp = lastGroupMsg(this.chats.groupView);
    const hasGroup = this.chats.hasGroup;
    const pub = this.pinRow(PUBLIC, 'town', 'Public');
    const grp = this.pinRow(GROUP, 'people', 'Group');
    this.updateRow(pub, {
      name: 'Public',
      ink: 'var(--cm-self)',
      initial: null,
      age: lastPub ? ago(lastPub.msg.ts, now) : '',
      snip: lastPub ? personSnippet(lastPub) : '',
      unread: this.chats.publicUnread,
      dot: false,
      selected: open === PUBLIC,
      dim: false,
      tip: 'Public channels',
      list,
      texts,
      force,
    });
    const roster = [...this.chats.rosterKeys].map((k) => this.chats.chat(k)?.name ?? cleanName(k));
    this.updateRow(grp, {
      name: 'Group',
      ink: 'var(--cm-self)',
      initial: null,
      age: hasGroup && lastGrp ? ago(lastGrp.msg.ts, now) : '',
      snip: !hasGroup ? 'Not in a group' : lastGrp ? personSnippet(lastGrp) : roster.join(', '),
      unread: this.chats.groupUnread > 0 && open !== GROUP ? 1 : 0,
      dot: true,
      selected: open === GROUP,
      dim: !hasGroup,
      tip: hasGroup ? `Group: ${roster.join(', ')}` : 'Not in a group',
      list,
      texts,
      force,
    });
    if (pub.el.parentNode !== this.pins) this.pins.append(pub.el, grp.el);

    // The private chats.
    const chats = this.chats.chats(windowMin, now);
    const keep = new Set<string>();
    for (const c of chats) {
      keep.add(c.key);
      const row = this.chatRow(c);
      const last = c.entries[c.entries.length - 1];
      this.updateRow(row, {
        name: c.name,
        ink: personInk(c.color, this.inks.light, this.inks.bg, 'var(--cm-self)'),
        initial: c.name.replace(/^\*/, '').charAt(0).toUpperCase(),
        age: ago(c.lastNear, now),
        snip: last ? snippet(last.msg, last.mine) : '',
        unread: c.unread,
        dot: false,
        selected: open === c.key,
        dim: false,
        tip: `${c.name} · ${agoText(c.lastNear, now)}`,
        list,
        texts,
        force,
      });
    }
    for (const [k, row] of this.colRows) {
      if (keep.has(k)) continue;
      this.io?.unobserve(row.el);
      this.hiddenUp.delete(row.el);
      this.hiddenDown.delete(row.el);
      row.el.remove();
      this.colRows.delete(k);
    }
    const order = chats.map((c) => c.key).join('\n');
    if (order !== this.order) {
      this.order = order;
      // Move only what is out of place (a raised chat: one move). The
      // scroller keeps to the newest by itself (comm.css).
      const keys = chats.map((c) => c.key);
      const els = keys.map((k) => this.colRows.get(k)!.el);
      const list = this.chatList;
      const last = keys[keys.length - 1];
      const prev = this.orderKeys;
      const raised =
        last !== undefined &&
        keys.length >= prev.length &&
        prev.filter((k) => k !== last).join('\n') === keys.slice(0, -1).join('\n') &&
        list.childElementCount === prev.length;
      if (raised) list.append(els[els.length - 1]!);
      else list.replaceChildren(...els);
      this.orderKeys = keys;
    }
    this.updateChevrons();
  }

  private pinRow(key: string, icon: IconName, name: string): ColRow {
    let r = this.pinRows.get(key);
    if (!r) {
      r = this.newRow(key, icon);
      r.el.classList.add('is-pin');
      r.name.textContent = name;
      this.pinRows.set(key, r);
    }
    return r;
  }

  private chatRow(c: Chat): ColRow {
    let r = this.colRows.get(c.key);
    if (!r) {
      r = this.newRow(c.key, null);
      this.colRows.set(c.key, r);
      this.io?.observe(r.el);
    }
    return r;
  }

  private newRow(key: string, icon: IconName | null): ColRow {
    const doc = this.ctx.doc;
    const el = doc.createElement('button');
    el.type = 'button';
    el.className = 'wc-cm-ent';
    el.dataset.key = key;
    const av = doc.createElement('span');
    av.className = 'wc-cm-av';
    if (icon) av.append(iconSvg(doc, icon, 'wc-cm-i'));
    const et = doc.createElement('span');
    et.className = 'wc-cm-et';
    const r1 = doc.createElement('span');
    r1.className = 'wc-cm-r1';
    const name = doc.createElement('b');
    const age = doc.createElement('span');
    age.className = 'wc-cm-ago';
    r1.append(name, age);
    const r2 = doc.createElement('span');
    r2.className = 'wc-cm-r2';
    const snip = doc.createElement('span');
    snip.className = 'wc-cm-sn';
    r2.append(snip);
    et.append(r1, r2);
    const badge = doc.createElement('span');
    badge.className = 'wc-cm-badge';
    badge.hidden = true;
    el.append(av, et, badge);
    return { el, av, name, age, snip, badge, sig: '', text: '', unread: 0 };
  }

  private updateRow(
    r: ColRow,
    v: {
      name: string;
      ink: string;
      initial: string | null;
      age: string;
      snip: string;
      unread: number;
      dot: boolean;
      selected: boolean;
      dim: boolean;
      tip: string;
      list: boolean;
      /** The snippet, age and tooltip may be written now. */
      texts: boolean;
      force: boolean;
    },
  ): void {
    const texts = v.texts || r.sig === '';
    const text = texts ? `${v.list ? `${v.age}|${v.snip}` : ''}|${v.tip}` : r.text;
    const sig = `${v.name}|${v.ink}|${v.initial}|${text}|${v.unread}|${v.selected}|${v.dim}|${v.list}`;
    if (sig === r.sig && !v.force) return;
    r.sig = sig;
    r.text = text;
    // Only what changed is written (an unchanged write still restyles in Firefox).
    setProp(r.el, '--pc', v.ink);
    if (v.initial !== null) setText(r.av, v.initial);
    setText(r.name, v.name);
    if (texts) {
      if (v.list) {
        setText(r.age, v.age);
        setText(r.snip, v.snip);
      }
      setTip(r.el, v.list ? null : v.tip, null, `cm:${r.el.dataset.key}`);
    }
    const badge = v.unread > 0 ? (v.dot ? '' : v.unread > 99 ? '99+' : String(v.unread)) : null;
    if (r.badge.hidden !== (badge === null)) r.badge.hidden = badge === null;
    if (badge !== null) setText(r.badge, badge);
    toggle(r.badge, 'data-dot', v.dot);
    setAttr(r.el, 'aria-pressed', String(v.selected));
    toggle(r.el, 'data-dim', v.dim);
    toggle(r.el, 'data-unread', v.unread > 0);
    setAttr(r.el, 'aria-label', `${v.name}${v.unread > 0 ? (v.dot ? ', unread' : `, ${v.unread} unread`) : ''}`);
  }

  /** A column text pass after `ms` (the snippets catch up after a burst). */
  private scheduleColText(ms: number): void {
    if (this.colTextTimer !== null) return;
    const win = this.ctx.doc.defaultView;
    this.colTextTimer = (win ? win.setTimeout.bind(win) : setTimeout)(() => {
      this.colTextTimer = null;
      this.markDirty();
    }, Math.max(0, ms));
  }

  // ------------------------------------------------------------------ top

  private renderTop(force: boolean): void {
    const folded = this.layout.mode === 'folded';
    this.unfoldBtn.hidden = !folded;
    this.chip.hidden = !folded;
    if (!folded) return;
    const open = this.currentView();
    let others = (open !== PUBLIC && this.chats.publicUnread > 0) || (open !== GROUP && this.chats.groupUnread > 0);
    if (!others) others = this.chats.unreadTotal > 0;
    toggle(this.unfoldBtn, 'data-unread', others);
    this.unfoldBtn.setAttribute('aria-label', others ? 'Show the chat list · unread in other chats' : 'Show the chat list');
    const sig = `${open}|${this.inks.light}|${this.inks.bg}`;
    if (this.chip.dataset.sig === sig && !force) return;
    this.chip.dataset.sig = sig;
    const doc = this.ctx.doc;
    const av = doc.createElement('span');
    av.className = 'wc-cm-av';
    const name = doc.createElement('b');
    if (open === PUBLIC || open === GROUP) {
      av.append(iconSvg(doc, open === PUBLIC ? 'town' : 'people', 'wc-cm-i'));
      name.textContent = open === PUBLIC ? 'Public' : 'Group';
      this.chip.style.setProperty('--pc', 'var(--cm-self)');
    } else {
      const c = this.chats.chat(open)!;
      av.textContent = c.name.replace(/^\*/, '').charAt(0).toUpperCase();
      name.textContent = c.name;
      this.chip.style.setProperty('--pc', personInk(c.color, this.inks.light, this.inks.bg, 'var(--cm-self)'));
    }
    this.chip.replaceChildren(av, name);
    this.chip.setAttribute('aria-label', `Open chat: ${name.textContent}. Click to show the chat list`);
  }

  // ---------------------------------------------------------------- reply

  private renderReply(open: string): void {
    // A chat with an enemy (`*Name*`) or a name of several words has no
    // reply line: neither can be told reliably (owner's reviewer, 2026-11-10).
    // Public has none (owner's first test): only chats and Group.
    const chat = open === PUBLIC || open === GROUP ? null : this.chats.chat(open);
    const hide =
      open === PUBLIC || this.replay || this.ctx.player === true || (chat !== null && chat !== undefined && !tellable(chat.name));
    this.reply.hidden = hide;
    if (hide) return;
    let ph: string;
    if (open === GROUP) ph = 'Tell the group…';
    else ph = `Reply to ${this.chats.chat(open)?.name ?? ''}…`;
    if (this.replyInput.placeholder !== ph) {
      this.replyInput.placeholder = ph;
      this.replyInput.setAttribute('aria-label', open === GROUP ? 'Tell the group' : `${ph} Sent as a tell`);
    }
    if (open !== PUBLIC && open !== GROUP) {
      const c = this.chats.chat(open);
      if (c) this.reply.style.setProperty('--pc', personInk(c.color, this.inks.light, this.inks.bg, 'var(--cm-self)'));
    } else this.reply.style.setProperty('--pc', 'var(--cm-self)');
  }

  // --------------------------------------------------------------- thread

  /** The time before an item that follows a gap (or starts the view). */
  private buildSep(it: ThreadItem, now: number): HTMLElement {
    const sep = this.ctx.doc.createElement('div');
    sep.className = 'wc-cm-sep';
    const ts = tsOf(it);
    sep.textContent = now - ts > 24 * 3600_000 ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + clock(ts) : clock(ts);
    return sep;
  }

  /**
   * After a render whose first item changed (older items trimmed off the
   * top, or a page put in front), the new first item and the old one get
   * the separator their place now asks for; the rest kept their neighbours.
   */
  private fixSeps(shown: readonly ThreadItem[], now: number): void {
    const first = shown[0];
    if (first === this.firstItem) return;
    const old = this.firstItem;
    this.firstItem = first;
    const els = this.list.elements;
    const fix = (i: number): void => {
      const el = els[i];
      const it = shown[i];
      if (!el || !it) return;
      const has = el.firstElementChild?.classList.contains('wc-cm-sep') === true;
      const want = wantsSep(it, shown[i - 1]);
      if (want && !has) el.prepend(this.buildSep(it, now));
      else if (!want && has) el.firstElementChild!.remove();
    };
    fix(0);
    if (old !== undefined) {
      const i = shown.indexOf(old);
      if (i > 0) fix(i);
    }
  }

  private buildItem(it: ThreadItem, open: string, now: number): HTMLElement {
    const doc = this.ctx.doc;
    const wrap = doc.createElement('div');
    wrap.className = 'wc-cm-item';
    const prev = this.prevOf.get(it);
    if (wantsSep(it, prev)) wrap.append(this.buildSep(it, now));
    if (isGroupItem(it) && it.kind === 'note') {
      wrap.append(this.buildNote(it.note));
      return wrap;
    }
    const e = entryOf(it)!;
    if (open === PUBLIC || open === GROUP) wrap.append(this.buildLine(e));
    // A chat: a bubble only for talk between you and that person (`direct`,
    // ADR 0134 addendum "Bubbles only for talk to you"). A group tell in
    // the sender's chat is a bubble too (it still opens, raises and counts
    // nothing: the model's rule). Everything else is a line as in Public.
    else if (e.direct || e.groupTell) {
      wrap.append(this.buildBubble(e, prev ? entryOf(prev) : null));
      // Told to the whole group, maybe not meant for you: always marked
      // under the bubble (owner's feedback, round 2).
      if (e.groupTell) {
        const gt = this.ctx.doc.createElement('div');
        gt.className = `wc-cm-gt${e.mine ? ' is-me' : ''}`;
        gt.textContent = 'grouptell';
        wrap.append(gt);
      }
    }
    else wrap.append(this.buildOverheard(e));
    return wrap;
  }

  private buildNote(n: GroupNote): HTMLElement {
    const doc = this.ctx.doc;
    const d = doc.createElement('div');
    d.className = 'wc-cm-note';
    const b = doc.createElement('b');
    b.textContent = n.name;
    b.style.color = personInk(this.chats.colorOf(n.name), this.inks.light, this.inks.bg, 'var(--cm-self)');
    d.append(b, doc.createTextNode(` ${n.kind} the group`));
    return d;
  }

  /** A Public or Group line: the name in its colour, the verb in the channel's. */
  private buildLine(e: ChatEntry): HTMLElement {
    const doc = this.ctx.doc;
    const m = e.msg;
    const row = doc.createElement('div');
    row.className = 'wc-cm-ln wc-comm-msg';
    row.dataset.channel = m.channel;
    if (e.mine) row.dataset.mine = '';
    setTip(row, `${channelLabel({ name: m.channel, caption: DEFAULT_CAPTIONS[m.channel] ?? '' })} · ${clock(m.ts)}`, null, null);
    const verb = channelInk(m.channel, this.inks.light, this.inks.bg);
    for (const seg of formatComm(m)) {
      if (seg.role === 'verb') appendStyled(doc, row, seg.text, verb, 'wc-cm-vb');
      else if (seg.role === 'talkerYou' || seg.role === 'talkerOther') {
        const lead = seg.text.match(/^\s*/)![0];
        const rest = seg.text.slice(lead.length);
        const nameText = rest.trimEnd();
        const tail = rest.slice(nameText.length);
        if (lead) row.append(doc.createTextNode(lead));
        const span = doc.createElement('span');
        span.className = 'wc-cm-nm';
        span.textContent = nameText;
        span.style.color = seg.role === 'talkerYou' ? 'var(--cm-self)' : personInk(this.chats.colorOf(nameText), this.inks.light, this.inks.bg, 'var(--cm-self)');
        row.append(span);
        if (tail) row.append(doc.createTextNode(tail));
      } else appendStyled(doc, row, seg.text, '', 'wc-cm-tx');
    }
    return row;
  }

  /** Talk to you (or yours to them) and group tells in a chat: theirs left in their colour, yours right in the flat lamp tone. */
  private buildBubble(e: ChatEntry, prev: ChatEntry | null): HTMLElement {
    const doc = this.ctx.doc;
    const m = e.msg;
    const bb = doc.createElement('div');
    bb.className = `wc-cm-bb ${e.mine ? 'is-me' : 'is-them'}`;
    bb.dataset.channel = m.channel;
    const ink = e.mine ? 'var(--cm-self)' : personInk(this.chats.colorOf(m.talker), this.inks.light, this.inks.bg, 'var(--cm-self)');
    bb.style.setProperty('--pc', ink);
    if (prev && (prev.direct || prev.groupTell) && prev.mine === e.mine && m.ts - prev.msg.ts <= SEP_GAP_MS) bb.classList.add('is-cont');
    if (m.channel === 'whispers') bb.classList.add('is-wh');
    // Never an action (emotes and socials are lines): the message only.
    const b = bubbleText(m);
    const bt = doc.createElement('div');
    bt.className = 'wc-cm-bt';
    appendStyled(doc, bt, b.text, '', '');
    // The channel and time: beside the bubble on hover only, taking no
    // height (owner's first test); in the DOM for readers and copy.
    const bm = doc.createElement('span');
    bm.className = 'wc-cm-bm';
    const w = doc.createElement('span');
    w.textContent = e.groupTell ? 'group' : channelWord(m.channel);
    const sep = doc.createElement('span');
    sep.className = 'wc-cm-bmsep';
    sep.textContent = ' · ';
    const t = doc.createElement('span');
    t.textContent = clock(m.ts);
    bm.append(w, sep, t);
    bb.append(bt, bm);
    return bb;
  }

  /**
   * Everything in a person's chat that is not talk between the two of you:
   * says, emotes and socials (the whole action), undirected whispers and
   * questions, narrates, yells, songs, prayers, and your own emotes and
   * socials placed there. Left-aligned and whole, formatted as in Public
   * (the verb in the channel colour), with no bubble: maybe not to you.
   */
  private buildOverheard(e: ChatEntry): HTMLElement {
    const d = this.buildLine(e);
    d.className = 'wc-cm-oh';
    return d;
  }


  // --------------------------------------------------------------- search

  private runSearch(byUser: boolean): void {
    // A refresh waits while the reader has a selection in the results; it
    // runs once the selection is gone.
    if (!byUser && this.selectingResults()) {
      this.searchDirty = true;
      this.awaitSelectionEnd();
      return;
    }
    this.searchDirty = false;
    const q = this.query.trim().toLowerCase();
    const doc = this.ctx.doc;
    const keepTop = byUser ? 0 : this.results.scrollTop;
    if (!q) {
      this.results.hidden = true;
      this.list.el.hidden = false;
      this.list.more.hidden = this.list.below === 0;
      this.results.replaceChildren();
      return;
    }
    const { people, messages } = this.chats.search(q, SEARCH_LIMIT);
    const nodes: Node[] = [];
    const head = (text: string): HTMLElement => {
      const h = doc.createElement('div');
      h.className = 'wc-cm-rh';
      h.textContent = text;
      return h;
    };
    const now = this.ctx.now();
    if (people.length) {
      nodes.push(head('People'));
      for (const c of people) {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'wc-cm-rp';
        b.dataset.key = c.key;
        b.style.setProperty('--pc', personInk(c.color, this.inks.light, this.inks.bg, 'var(--cm-self)'));
        const av = doc.createElement('span');
        av.className = 'wc-cm-av';
        av.textContent = c.name.replace(/^\*/, '').charAt(0).toUpperCase();
        const t = doc.createElement('span');
        t.className = 'wc-cm-rpt';
        const name = doc.createElement('b');
        appendHits(doc, name, c.name, q);
        const sub = doc.createElement('small');
        sub.textContent = agoText(c.lastNear, now);
        t.append(name, sub);
        const go = doc.createElement('span');
        go.className = 'wc-cm-go';
        go.textContent = 'Open chat →';
        b.append(av, t, go);
        nodes.push(b);
      }
    }
    nodes.push(head(messages.length ? `Messages · ${messages.length}${messages.length >= SEARCH_LIMIT ? '+' : ''}` : 'Messages'));
    if (!messages.length) {
      const none = doc.createElement('div');
      none.className = 'wc-cm-none';
      none.textContent = 'No messages match.';
      nodes.push(none);
    }
    for (const e of [...messages].reverse()) {
      const m = e.msg;
      const r = doc.createElement('div');
      r.className = 'wc-cm-rm';
      r.style.setProperty('--cc', channelInk(m.channel, this.inks.light, this.inks.bg));
      const h = doc.createElement('div');
      h.className = 'wc-cm-rmh';
      h.textContent = `${channelLabel({ name: m.channel, caption: DEFAULT_CAPTIONS[m.channel] ?? '' })} · ${clock(m.ts)}`;
      const tx = doc.createElement('div');
      tx.className = 'wc-cm-rmt';
      appendHits(doc, tx, formatComm(m).map((s) => stripAnsi(s.text)).join(''), q);
      r.append(h, tx);
      nodes.push(r);
    }
    this.results.replaceChildren(...nodes);
    this.results.hidden = false;
    this.list.el.hidden = true;
    this.list.more.hidden = true;
    this.results.scrollTop = keepTop;
  }
}

// ------------------------------------------------------------------ helpers

function toggle(el: Element, attr: string, on: boolean): void {
  if (el.hasAttribute(attr) !== on) el.toggleAttribute(attr, on);
}

function setProp(el: HTMLElement, name: string, value: string): void {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

function lastWhere(list: readonly ChatEntry[], pred: (e: ChatEntry) => boolean): ChatEntry | null {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i]!)) return list[i]!;
  return null;
}

function lastGroupMsg(list: readonly GroupItem[]): ChatEntry | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i]!;
    if (it.kind === 'msg') return it.entry;
  }
  return null;
}

/** `Name: text` for the Public and Group rows. */
function personSnippet(e: ChatEntry): string {
  return snippet(e.msg, e.mine, true);
}

/** Appends `text` with the case-insensitive hits of `needle` marked. */
function appendHits(doc: Document, el: HTMLElement, text: string, needle: string): void {
  splitHits(text, needle).forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const mk = doc.createElement('mark');
      mk.textContent = part;
      el.append(mk);
    } else el.append(doc.createTextNode(part));
  });
}

/** Appends `text` (ANSI kept) to `row`; `color` (if any) is the default colour. */
function appendStyled(doc: Document, row: HTMLElement, text: string, color: string, cls: string): void {
  const { text: plain, runs } = parseAnsi(text);
  if (!plain) return;
  const base = doc.createElement('span');
  if (cls) base.className = cls;
  if (color) base.style.color = color;
  if (runs.length === 0) {
    base.textContent = plain;
    row.append(base);
    return;
  }
  let pos = 0;
  for (const r of runs) {
    if (r.start > pos) base.append(doc.createTextNode(plain.slice(pos, r.start)));
    const span = doc.createElement('span');
    styleRun(span, r);
    span.textContent = plain.slice(r.start, r.end);
    base.append(span);
    pos = r.end;
  }
  if (pos < plain.length) base.append(doc.createTextNode(plain.slice(pos)));
  row.append(base);
}

function styleRun(span: HTMLElement, r: StyleRun): void {
  const fg = r.fg;
  let cls = '';
  if (fg !== undefined) {
    if (fg < 16) cls += ' wc-f' + fg;
    else span.style.color = colorToCss(fg);
  } else if (r.bold) cls += ' wc-fbd';
  if (r.bg !== undefined) {
    if (r.bg < 16) cls += ' wc-b' + r.bg;
    else span.style.backgroundColor = colorToCss(r.bg, 'b');
  }
  if (r.bold) cls += ' wc-bold';
  if (r.italic) cls += ' wc-ital';
  if (r.underline) cls += ' wc-ul';
  if (cls) span.className = cls.slice(1);
}

/** A chat's name a tell can reach: one word, not an enemy's `*Name*`. */
function tellable(name: string): boolean {
  return /^[^\s*]+$/.test(name);
}

/** An item shows the time before it when it starts the view or follows a gap. */
function wantsSep(it: ThreadItem, prev: ThreadItem | undefined): boolean {
  return !prev || tsOf(it) - tsOf(prev) > SEP_GAP_MS;
}

