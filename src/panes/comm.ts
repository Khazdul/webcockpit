// Comm pane (Inv §2.7, ADR 0016): the GMCP channel history with a
// clickable channel-filter header.
//
//   .wc-msgpane.wc-comm
//     .wc-comm-header        one row; hidden by `comm.showHeader` = false
//       .wc-comm-cell        per visible channel (data-channel), whole cell clickable
//     .wc-alist              messages, bottom-anchored, scrolled by pixels (ADR 0052)
//     .wc-alist-more         `↓ N newer messages` while scrolled back
//
// History: an in-memory ring of 1000 messages, not cleared on disconnect.
// On a live `Char.Name` it is replaced by the character's archive (last 1000
// of 7 days; src/gmcp/comm-archive.ts); messages that arrive meanwhile are
// kept and written after the load. Every live message is appended to the
// archive. A replay starts from an empty history and never touches the
// archive (`conn.state` carries `replay`). The archive is pruned when the
// pane starts and on every live `Char.Name`. Without IndexedDB the pane
// works in memory.
//
// Header: left mouse down toggles a channel, right mouse down solos it
// (src/gmcp/comm.ts). Filters are written to the settings at once; nothing
// goes to the game. A filter change from elsewhere (the options menu)
// cancels solo.
//
// Timestamps show only while scrolled back (Inv §2.7.3): once a scroll
// away from the bottom comes to rest they are added to the rows (the top
// row keeps its place); back at the bottom they are removed. Colours are recoloured for a light pane (Inv §10.5): channel,
// talker and message colours only.

import './panes.css';
import { CommArchive } from '../gmcp/comm-archive';
import {
  COMM_COLORS,
  type ChannelInfo,
  type CommMessage,
  type CommRole,
  type FilterState,
  type HeaderChannel,
  channelColor,
  channelEnabled,
  commTime,
  formatComm,
  headerCellText,
  headerChannels,
  headerLayout,
  parseAnsi,
  parseChannelList,
  parseChannelText,
  sameFilters,
  soloChannel,
  toggleChannel,
} from '../gmcp/comm';
import { paneLight } from '../theme/apply';
import { lightShift } from '../theme/color';
import { colorToCss, effectiveFg } from '../ui/palette';
import { type StyleRun, gmcpKey } from '../core/types';
import { AnchoredList, type ListMetrics, forwardWheel } from './anchored-list';
import { PaneShell } from './pane';
import type { PaneContext } from './context';

/** Messages kept in memory (Inv §2.7.7). */
export const COMM_HISTORY_MAX = 1000;

export interface CommPaneOptions {
  /** List measuring (tests). */
  metrics?: ListMetrics;
  /** Scroll rest time (tests; ms). */
  settleMs?: number;
}

export class CommPane extends PaneShell {
  private readonly root: HTMLDivElement;
  private readonly header: HTMLDivElement;
  private readonly list: AnchoredList<CommMessage>;
  /** The rows carry timestamps (scrolled back). */
  private timeShown = false;
  private history: CommMessage[] = [];
  private channels: ChannelInfo[] | null = null;
  private solo: FilterState['solo'] = null;
  /** The filters this pane wrote last (an external change cancels solo). */
  private ownFilters: Record<string, boolean> | null = null;
  private character = '';
  private replay = false;
  /** Archive (null until opened, or when unavailable). */
  private archive: CommArchive | null = null;
  private readonly archiveP: Promise<CommArchive | null>;
  /** Live messages waiting for the seed load before they are written. */
  private pendingWrites: CommMessage[] | null = null;
  private seedToken = 0;
  private headerKey = '';

  constructor(ctx: PaneContext, opts: CommPaneOptions = {}) {
    super(ctx, 'comm');
    const doc = ctx.doc;
    this.root = doc.createElement('div');
    this.root.className = 'wc-msgpane wc-comm';
    this.header = doc.createElement('div');
    this.header.className = 'wc-comm-header';
    this.list = new AnchoredList<CommMessage>(doc, () => this.markDirty(), {
      ...(opts.metrics ? { metrics: opts.metrics } : {}),
      ...(opts.settleMs !== undefined ? { settleMs: opts.settleMs } : {}),
    });
    this.root.append(this.header, this.list.el, this.list.more);
    this.header.addEventListener('mousedown', this.onHeaderDown);
    this.header.addEventListener('contextmenu', (e) => e.preventDefault());
    this.list.el.addEventListener('contextmenu', (e) => e.preventDefault());

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
    this.own(
      ctx.settings.subscribe((next, prev) => {
        if (next.comm === prev.comm) return;
        if (this.solo && (!this.ownFilters || !sameFilters(next.comm.filters, this.ownFilters))) this.solo = null;
        this.markDirty();
      }),
    );
    this.own(() => this.list.dispose());
    this.own(forwardWheel(this.el, () => this.list.el, () => ctx.cells.get().h));
  }

  // ------------------------------------------------------------------ data

  /** One GMCP message; `p` is the package in lower case. */
  private onGmcp(p: string, data: unknown): void {
    if (p === 'comm.channel.text') {
      const t = parseChannelText(data);
      if (t) this.addMessage({ ...t, ts: this.ctx.now() });
    } else if (p === 'comm.channel.list') {
      const l = parseChannelList(data);
      if (l) {
        this.channels = l;
        this.markDirty();
      }
    } else if (p === 'char.name') {
      const n = (data as { name?: unknown } | undefined)?.name;
      if (typeof n === 'string' && n) this.onCharacter(n);
    }
  }

  private addMessage(msg: CommMessage): void {
    this.history.push(msg);
    if (this.history.length > COMM_HISTORY_MAX) this.history.splice(0, this.history.length - COMM_HISTORY_MAX);
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

  /** `Char.Name`: seed the history from the archive (live) or start empty (replay). */
  private onCharacter(name: string): void {
    const token = ++this.seedToken;
    const changed = name !== this.character;
    this.character = name;
    if (this.replay) {
      this.history = [];
      this.pendingWrites = null;
      this.list.toLive();
      this.markDirty();
      return;
    }
    if (changed) this.history = [];
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
        this.list.toLive();
      }
      for (const m of pending) this.write(m);
      this.markDirty();
    });
  }

  /** The history (tests, oldest first). */
  get messages(): readonly CommMessage[] {
    return this.history;
  }

  /** Resolves when the archive is open (or known to be unavailable). */
  whenReady(): Promise<unknown> {
    return this.archiveP;
  }

  // ---------------------------------------------------------------- header

  private headerChannels(): HeaderChannel[] {
    return headerChannels(this.channels);
  }

  private readonly onHeaderDown = (e: MouseEvent): void => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>('.wc-comm-cell');
    if (!cell) return;
    // A log player shows the recorded filters; the header does not change them (ADR 0021).
    if (this.ctx.player) return void e.preventDefault();
    const name = cell.dataset.channel!;
    e.preventDefault();
    if (e.button === 0) this.toggle(name);
    else if (e.button === 2) this.soloToggle(name);
  };

  /** Left click on a header cell. */
  toggle(name: string): void {
    this.applyFilters(toggleChannel({ filters: this.ctx.settings.get().comm.filters, solo: this.solo }, name));
  }

  /** Right click on a header cell. */
  soloToggle(name: string): void {
    const names = this.headerChannels().map((c) => c.name);
    this.applyFilters(soloChannel({ filters: this.ctx.settings.get().comm.filters, solo: this.solo }, name, names));
  }

  private applyFilters(s: FilterState): void {
    this.ownFilters = s.filters;
    this.solo = s.solo;
    this.ctx.settings.update((d) => {
      d.comm.filters = { ...s.filters };
    });
    this.markDirty();
  }

  /** The soloed channel, or null (tests). */
  get soloed(): string | null {
    return this.solo?.channel ?? null;
  }

  // ---------------------------------------------------------------- render

  protected override blank(): void {
    this.content.replaceChildren();
    this.headerKey = '';
  }

  protected override render(): void {
    if (this.root.parentNode !== this.content) this.content.replaceChildren(this.root);
    const s = this.ctx.settings.get();
    const light = paneLight(s, 'comm');
    const col = (c: string): string => (light ? lightShift(c) : c);
    const filters = s.comm.filters;

    // Header.
    const chans = this.headerChannels();
    this.header.hidden = !s.comm.showHeader;
    const key = `${this.cols}|${light}|${JSON.stringify(filters)}|${chans.map((c) => c.name + ':' + c.label).join(',')}`;
    if (s.comm.showHeader && key !== this.headerKey) {
      this.headerKey = key;
      this.renderHeader(chans, filters, col);
    }

    // List.
    const shown = this.history.filter((m) => channelEnabled(filters, m.channel));
    const now = this.ctx.now();
    // Timestamps follow the scroll once it is at rest (they change heights).
    const withTime = !this.list.resting;
    this.list.render(
      shown,
      (m) => this.buildRow(m, withTime, now, col),
      `${light}|${JSON.stringify(filters)}`,
      (n) => `↓ ${n} newer message${n === 1 ? '' : 's'}`,
    );
    if (withTime !== this.timeShown) {
      this.timeShown = withTime;
      this.list.keepView(() => this.setTimes(withTime, now));
    }
  }

  /** Adds or removes the timestamps of the rendered rows. */
  private setTimes(on: boolean, now: number): void {
    const els = this.list.elements;
    for (let i = 0; i < els.length; i++) {
      const row = els[i]!;
      const t = row.firstElementChild;
      const has = t !== null && t.classList.contains('wc-comm-time');
      if (on && !has) row.prepend(this.timeSpan(this.list.itemAt(i)!, now));
      else if (!on && has) t.remove();
    }
  }

  private timeSpan(m: CommMessage, now: number): HTMLElement {
    const t = this.ctx.doc.createElement('span');
    t.className = 'wc-comm-time';
    t.style.color = COMM_COLORS.time;
    t.textContent = commTime(m.ts, now) + ' ';
    return t;
  }

  private renderHeader(chans: HeaderChannel[], filters: Record<string, boolean>, col: (c: string) => string): void {
    const doc = this.ctx.doc;
    const lay = headerLayout(
      chans.map((c) => c.label),
      this.cols,
    );
    const nodes: Node[] = [];
    lay.widths.forEach((w, i) => {
      const c = chans[i]!;
      if (i > 0 && lay.sep) nodes.push(doc.createTextNode(' '));
      const span = doc.createElement('span');
      span.className = 'wc-comm-cell';
      span.dataset.channel = c.name;
      const on = channelEnabled(filters, c.name);
      span.toggleAttribute('data-off', !on);
      span.style.color = on ? col(channelColor(c.name)) : COMM_COLORS.off;
      span.textContent = headerCellText(c.label, w);
      span.title = `${c.label}: left click toggles, right click solos`;
      nodes.push(span);
    });
    this.header.replaceChildren(...nodes);
  }

  private buildRow(m: CommMessage, withTime: boolean, now: number, col: (c: string) => string): HTMLElement {
    const doc = this.ctx.doc;
    const row = doc.createElement('div');
    row.className = 'wc-comm-msg';
    row.dataset.channel = m.channel;
    if (withTime) row.append(this.timeSpan(m, now));
    const verb = col(channelColor(m.channel));
    for (const seg of formatComm(m)) {
      const c = seg.role === 'verb' ? verb : col(ROLE_COLORS[seg.role]);
      appendStyled(doc, row, seg.text, c);
    }
    return row;
  }
}

const ROLE_COLORS: Readonly<Record<Exclude<CommRole, 'verb'>, string>> = {
  talkerYou: COMM_COLORS.talkerYou,
  talkerOther: COMM_COLORS.talkerOther,
  messageSelf: COMM_COLORS.messageSelf,
  messageOther: COMM_COLORS.messageOther,
};

/** Appends `text` (ANSI kept) to `row` with `color` as the default colour. */
function appendStyled(doc: Document, row: HTMLElement, text: string, color: string): void {
  const { text: plain, runs } = parseAnsi(text);
  if (!plain) return;
  const base = doc.createElement('span');
  base.style.color = color;
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
  const fg = effectiveFg(r.fg, r.bold);
  let cls = '';
  if (fg !== undefined) {
    if (fg < 16) cls += ' wc-f' + fg;
    else span.style.color = colorToCss(fg);
  }
  if (r.bg !== undefined) {
    if (r.bg < 16) cls += ' wc-b' + r.bg;
    else span.style.backgroundColor = colorToCss(r.bg);
  }
  if (r.bold) cls += ' wc-bold';
  if (r.italic) cls += ' wc-ital';
  if (r.underline) cls += ' wc-ul';
  if (cls) span.className = cls.slice(1);
}
