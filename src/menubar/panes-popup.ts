// The Panes popup (stage 30 S4, mockup 30a-2, ADR 0099): one row per pane
// with a toggle switch, the built-in panes first (PANE_IDS order), then
// the running script panes under a "Script panes" subhead (label and a
// dim script name). Reset layout asks inline: `Reset layout?` Reset /
// Cancel. Every change goes straight to the settings store, and the rows
// follow the store and the script panes while open. The Statistics row
// comes with its pane (30d).
//
// It takes the focus when it opens, on its first row (ADR 0108): Esc
// closes and gives the game its keys back; ↑↓ move between the rows and
// buttons; Enter or Space press the focused one; Tab and Shift+Tab wrap
// inside it (popup.ts). A click on a row keeps the focus on that row.

import { forgetTempPlaces } from '../layout/temp-places';
import { PANE_IDS, PANE_LABELS, type PaneId, defaultLayout } from '../layout/types';
import type { ScriptPaneInfo } from '../layout/cockpit';
import type { SettingsStore } from '../settings';
import { paneSettingsOf } from '../settings/types';
import { arrowFocus, closeButton, ghostButton, plainKey, popupPanel } from './popup';

/** The running script panes, following changes (the cockpit's). */
export interface ScriptPaneSource {
  list(): ScriptPaneInfo[];
  subscribe(fn: () => void): () => void;
}

export interface PanesPopupOptions {
  doc: Document;
  settings: SettingsStore;
  scriptPanes: ScriptPaneSource;
  /** Close the popup; `refocus` gives the input its focus back. */
  close: (refocus: boolean) => void;
}

export interface PaneRow {
  id: PaneId;
  label: string;
  /** The owning script, for a script pane. */
  script?: string;
}

/** The popup's rows: the built-in panes, then the script panes. */
export function paneRows(scripts: readonly ScriptPaneInfo[]): PaneRow[] {
  return [
    ...PANE_IDS.map((id) => ({ id, label: PANE_LABELS[id] })),
    ...scripts.map((p) => ({ id: p.id, label: p.title, script: p.script })),
  ];
}

/** Shows or hides pane `id` (its `on`; colour, border and glass stay). */
export function togglePane(settings: SettingsStore, id: PaneId): void {
  settings.update((d) => {
    const p = paneSettingsOf(d.panes, id);
    d.panes[id] = { ...p, on: !p.on };
  });
}

/** Options → Reset layout's work: the default layout, temporary script panes at their default place. */
export function resetLayout(settings: SettingsStore): void {
  settings.update({ layout: defaultLayout() });
  forgetTempPlaces();
}

interface RowEls {
  btn: HTMLButtonElement;
  label: HTMLSpanElement;
  toggle: HTMLSpanElement;
}

export class PanesPopup {
  readonly el: HTMLDivElement;
  private readonly o: PanesPopupOptions;
  private readonly list: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  private rows = new Map<string, RowEls>();
  private rowKey = '';
  private confirming = false;
  private readonly offs: Array<() => void> = [];

  constructor(o: PanesPopupOptions) {
    this.o = o;
    const doc = o.doc;
    this.el = popupPanel(doc, 'wc-pop-panes', 'Panes');
    const head = doc.createElement('div');
    head.className = 'wc-pop-head';
    const title = doc.createElement('span');
    title.className = 'wc-pop-title';
    title.textContent = 'Panes';
    head.append(title, closeButton(doc, () => o.close(true)));
    this.list = doc.createElement('div');
    this.list.className = 'wc-pop-list';
    this.foot = doc.createElement('div');
    this.foot.className = 'wc-pop-foot';
    this.el.append(head, this.list, this.foot);
    this.el.addEventListener('keydown', this.onKey);
    this.offs.push(
      o.settings.subscribe(() => this.draw()),
      o.scriptPanes.subscribe(() => this.draw()),
    );
    this.draw();
    this.drawFoot();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && plainKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      if (this.confirming) {
        this.setConfirming(false);
        return;
      }
      this.o.close(true);
      return;
    }
    const items = [...this.list.querySelectorAll<HTMLElement>('button'), ...this.foot.querySelectorAll<HTMLElement>('button')];
    if (plainKey(e) && arrowFocus(e, items)) e.preventDefault();
  };

  /** Rows and switches from the store; rebuilt only when the set of rows changed. */
  private draw(): void {
    const doc = this.o.doc;
    const rows = paneRows(this.o.scriptPanes.list());
    const key = rows.map((r) => `${r.id}\u0000${r.label}`).join('\u0001');
    if (key !== this.rowKey) {
      const focused = [...this.rows].find(([, r]) => r.btn === doc.activeElement)?.[0];
      this.rowKey = key;
      this.rows = new Map();
      const nodes: HTMLElement[] = [];
      rows.forEach((r, i) => {
        if (r.script !== undefined && (i === 0 || rows[i - 1]!.script === undefined)) {
          const sub = doc.createElement('div');
          sub.className = 'wc-pop-sub';
          sub.textContent = 'Script panes';
          nodes.push(sub);
        }
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'wc-pop-row';
        btn.dataset.pane = r.id;
        const label = doc.createElement('span');
        label.className = 'wc-pop-lb';
        label.textContent = r.label;
        if (r.script !== undefined) {
          const sc = doc.createElement('span');
          sc.className = 'wc-pop-sc';
          sc.textContent = ` ${r.script}`;
          label.append(sc);
        }
        const toggle = doc.createElement('span');
        toggle.className = 'wc-pop-tg';
        toggle.append(doc.createElement('i'));
        btn.append(label, toggle);
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          togglePane(this.o.settings, r.id);
        });
        this.rows.set(r.id, { btn, label, toggle });
        nodes.push(btn);
      });
      this.list.replaceChildren(...nodes);
      if (focused) this.rows.get(focused)?.btn.focus({ preventScroll: true });
    }
    const panes = this.o.settings.get().panes;
    for (const [id, r] of this.rows) {
      const on = paneSettingsOf(panes, id as PaneId).on;
      r.btn.setAttribute('aria-pressed', String(on));
      r.label.classList.toggle('is-off', !on);
      r.toggle.classList.toggle('is-on', on);
    }
  }

  private setConfirming(on: boolean): void {
    this.confirming = on;
    this.drawFoot();
  }

  private drawFoot(): void {
    const doc = this.o.doc;
    const hadFocus = this.foot.contains(doc.activeElement);
    if (this.confirming) {
      const q = doc.createElement('span');
      q.className = 'wc-pop-q';
      q.textContent = 'Reset layout?';
      const yes = ghostButton(doc, 'wc-pop-btn is-danger', 'Reset', () => {
        resetLayout(this.o.settings);
        this.setConfirming(false);
      });
      yes.dataset.act = 'reset-yes';
      const no = ghostButton(doc, 'wc-pop-btn', 'Cancel', () => this.setConfirming(false));
      no.dataset.act = 'reset-no';
      this.foot.replaceChildren(q, yes, no);
      if (hadFocus) no.focus({ preventScroll: true });
    } else {
      const b = ghostButton(doc, 'wc-pop-btn', 'Reset layout', () => this.setConfirming(true));
      b.dataset.act = 'reset';
      this.foot.replaceChildren(b);
      if (hadFocus) b.focus({ preventScroll: true });
    }
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.el.remove();
  }
}
