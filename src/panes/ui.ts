// UI messages pane (Inv §2.4, ADR 0016): system and event lines from the
// `ui.message` bus event, newest at the bottom, never blanked.
//
//   .wc-msgpane.wc-ui
//     .wc-alist              lines, bottom-anchored, scrolled by line (wrap-aware)
//       .wc-ui-row           prefix span, then the parts
//     .wc-alist-more         `↓ N newer messages` while scrolled back
//
// - Prefix per kind: `● SYSTEM:` blue, `▶ NAME:` teal, `◆ TAG:` per tag,
//   `⚠ WARN:` amber, `✖ ERROR:` red. Base text bold bright white, `{value}`
//   parts bold yellow.
// - On a light pane the prefix and value colours go through `lightShift`
//   and the white base becomes `darkInk` of the pane's background, at
//   display time (Inv §10.5); stored lines keep the canonical colours.
// - The last 1000 lines live in `sessionStorage` (ADR 0016): a reload of
//   the tab keeps them, a new tab starts empty. Writes are coalesced.

import './panes.css';
import type { UiMessage, UiMessageKind, UiMessagePart } from '../core/types';
import { paneLight } from '../theme/apply';
import { darkInk, fitContrast, lightShift, paneEffectiveBg } from '../theme/color';
import { AnchoredList, type ListMetrics } from './anchored-list';
import { PaneShell } from './pane';
import type { PaneContext } from './context';

/** Lines kept (Inv §2.4). */
export const UI_HISTORY_MAX = 1000;
/** The sessionStorage key of the ring. */
export const UI_STORAGE_KEY = 'wc.ui.messages';
/** Coalescing delay of the sessionStorage write. */
export const UI_STORE_DELAY_MS = 250;

/** Canonical colours (Inv §2.4, dark background). */
export const UI_COLORS = {
  base: '#ffffff',
  value: '#ffee58',
  system: '#42a5f5',
  event: '#26c6da',
  warn: '#ffb300',
  error: '#e53935',
} as const;

/** `◆` tag colours; unknown tags use AFFECT. */
export const UI_TAG_COLORS: Readonly<Record<string, string>> = {
  SPELL: '#7aa9d6',
  BUFF: '#8fbc8f',
  DEBUFF: '#c97070',
  STORE: '#b39ddb',
  BLIND: '#00cccc',
  CHARM: '#b388ff',
  HERB: '#9ccc65',
  // Run lines (ADR 0018): XP green, PvP red, loss red.
  KILL: '#6fe060',
  PKILL: '#ff5f5f',
  DEATH: '#e03c3c',
  AFFECT: '#26c6da',
};

/** The prefix text of a message. */
export function uiPrefix(m: UiMessage): string {
  switch (m.kind) {
    case 'system':
      return '● SYSTEM:';
    case 'event':
      return `▶ ${m.name || 'EVENT'}:`;
    case 'state':
      return `◆ ${m.tag || 'AFFECT'}:`;
    case 'warn':
      return '⚠ WARN:';
    case 'error':
      return '✖ ERROR:';
  }
}

/** The canonical prefix colour of a message. */
export function uiPrefixColor(m: UiMessage): string {
  switch (m.kind) {
    case 'system':
      return UI_COLORS.system;
    case 'event':
      return UI_COLORS.event;
    case 'state':
      return UI_TAG_COLORS[(m.tag || '').toUpperCase()] ?? UI_TAG_COLORS.AFFECT!;
    case 'warn':
      return UI_COLORS.warn;
    case 'error':
      return UI_COLORS.error;
  }
}

/** The whole line as plain text (tests, copy). */
export function uiPlain(m: UiMessage): string {
  return uiPrefix(m) + ' ' + m.parts.map((p) => (typeof p === 'string' ? p : p.value)).join('');
}

const KINDS: ReadonlySet<string> = new Set<UiMessageKind>(['system', 'event', 'state', 'warn', 'error']);

/** A stored message, or null when it is not one. */
export function validUiMessage(v: unknown): UiMessage | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.kind !== 'string' || !KINDS.has(o.kind) || !Array.isArray(o.parts)) return null;
  const parts: UiMessagePart[] = [];
  for (const p of o.parts) {
    if (typeof p === 'string') parts.push(p);
    else if (p && typeof p === 'object' && typeof (p as { value?: unknown }).value === 'string') {
      parts.push({ value: (p as { value: string }).value });
    } else return null;
  }
  const m: UiMessage = { kind: o.kind as UiMessageKind, parts };
  if (typeof o.name === 'string') m.name = o.name;
  if (typeof o.tag === 'string') m.tag = o.tag;
  return m;
}

export interface UiPaneOptions {
  /** List measuring (tests). */
  metrics?: ListMetrics;
}

export class UiPane extends PaneShell {
  private readonly root: HTMLDivElement;
  private readonly list: AnchoredList;
  private lines: UiMessage[] = [];
  private storeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: PaneContext, opts: UiPaneOptions = {}) {
    super(ctx, 'ui', { blankWhenInactive: false });
    const doc = ctx.doc;
    this.root = doc.createElement('div');
    this.root.className = 'wc-msgpane wc-ui';
    this.list = new AnchoredList(doc, () => this.markDirty(), {
      ...(opts.metrics ? { metrics: opts.metrics } : {}),
      cellHeight: () => ctx.cells.get().h,
    });
    this.root.append(this.list.el, this.list.more);
    this.lines = this.load();
    this.own(ctx.bus.on('ui.message', (m) => this.add(m)));
    this.own(() => this.list.dispose());
    const win = doc.defaultView;
    if (win) {
      win.addEventListener('pagehide', this.flushStorage);
      this.own(() => win.removeEventListener('pagehide', this.flushStorage));
    }
    this.own(() => this.flushStorage());
  }

  /** The lines (tests, oldest first). */
  get messages(): readonly UiMessage[] {
    return this.lines;
  }

  private add(m: UiMessage): void {
    const v = validUiMessage(m);
    if (!v) return;
    this.lines.push(v);
    if (this.lines.length > UI_HISTORY_MAX) this.lines.splice(0, this.lines.length - UI_HISTORY_MAX);
    this.list.added(1);
    this.scheduleStore();
    this.markDirty();
  }

  // --------------------------------------------------------------- storage

  private load(): UiMessage[] {
    const st = this.ctx.sessionStorage;
    if (!st) return [];
    try {
      const raw = st.getItem(UI_STORAGE_KEY);
      if (!raw) return [];
      const arr: unknown = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const out: UiMessage[] = [];
      for (const v of arr.slice(-UI_HISTORY_MAX)) {
        const m = validUiMessage(v);
        if (m) out.push(m);
      }
      return out;
    } catch {
      return [];
    }
  }

  private scheduleStore(): void {
    if (this.storeTimer !== null || !this.ctx.sessionStorage) return;
    this.storeTimer = setTimeout(this.flushStorage, UI_STORE_DELAY_MS);
  }

  /** Writes the ring to sessionStorage now. */
  readonly flushStorage = (): void => {
    if (this.storeTimer !== null) clearTimeout(this.storeTimer);
    this.storeTimer = null;
    const st = this.ctx.sessionStorage;
    if (!st) return;
    try {
      st.setItem(UI_STORAGE_KEY, JSON.stringify(this.lines));
    } catch {
      /* quota or blocked storage: the pane keeps working in memory */
    }
  };

  // ---------------------------------------------------------------- render

  protected override render(): void {
    if (this.root.parentNode !== this.content) this.content.replaceChildren(this.root);
    const s = this.ctx.settings.get();
    const light = paneLight(s, 'ui');
    // On a light pane every colour is held to 4.5:1 against it (ADR 0041).
    const bg = paneEffectiveBg(s.panes.ui.color, s.appearance.bg);
    const ink = (c: string): string => fitContrast(c, bg, 4.5, '#000000');
    const col = (c: string): string => (light ? ink(lightShift(c)) : c);
    const base = light ? ink(darkInk(bg)) : UI_COLORS.base;
    const value = col(UI_COLORS.value);
    const lines = this.lines;
    this.list.render(
      lines.length,
      Math.max(1, this.rows),
      (i) => this.buildRow(lines[i]!, base, value, col),
      (n) => `↓ ${n} newer message${n === 1 ? '' : 's'}`,
    );
  }

  private buildRow(m: UiMessage, base: string, value: string, col: (c: string) => string): HTMLElement {
    const doc = this.ctx.doc;
    const row = doc.createElement('div');
    row.className = 'wc-ui-row';
    row.dataset.kind = m.kind;
    row.style.color = base;
    const pre = doc.createElement('span');
    pre.className = 'wc-ui-prefix';
    pre.style.color = col(uiPrefixColor(m));
    pre.textContent = uiPrefix(m);
    row.append(pre, doc.createTextNode(' '));
    for (const p of m.parts) {
      if (typeof p === 'string') {
        row.append(doc.createTextNode(p));
      } else {
        const v = doc.createElement('span');
        v.className = 'wc-ui-value';
        v.style.color = value;
        v.textContent = p.value;
        row.append(v);
      }
    }
    return row;
  }
}
