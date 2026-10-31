// The Exit popup (stage 30 S3, mockup 30a-4, ADR 0099): `Exit to main
// menu?`, then, when there is a run to rate (the recording run, or the
// latest run of this tab), `Rate & save this run (optional)` with five
// stars and `clear`, then `Cancel Esc` and `Exit Y`.
//
// The rating works as the ESC menu's Exit confirm (Inv §4.6, ADR 0018):
// prefilled with the chain's saved rating; 0–5, ←→ or a click rate; Exit
// saves (`saveChain`: > 0 saves the chain, 0 keeps an existing save) and
// exits, and a failed save never stops the exit.
//
// A window with unsaved changes (ADR 0103) adds a warning line under the
// question; Exit discards those changes.
//
// It takes the keys when it opens (a confirmation that `#exit` from a
// macro must be able to answer without the mouse): Y exits, Esc cancels.

import type { LiveRuns } from '../runs/live';
import { ghostButton, plainKey, popupPanel } from './popup';

export interface ExitPopupOptions {
  doc: Document;
  /** The live run; absent: no rating row. */
  runs?: LiveRuns | undefined;
  /** Exit to the start page (the shell's exitSession). */
  exit: () => void;
  /** Close the popup; `refocus` gives the input its focus back. */
  close: (refocus: boolean) => void;
  /** A warning on a line of its own (unsaved changes in a window, ADR 0103); null or absent: none. */
  warning?: string | null;
}

/** The rating after key `e` (0–5, ←→), or null when it is not a rating key. */
export function ratingFromKey(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey'>, cur: number): number | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[0-5]$/.test(e.key)) return Number(e.key);
  if (e.key === 'ArrowLeft') return Math.max(0, cur - 1);
  if (e.key === 'ArrowRight') return Math.min(5, cur + 1);
  return null;
}

export class ExitPopup {
  readonly el: HTMLDivElement;
  /** There is a run to rate (fixed when the popup opens). */
  readonly rateable: boolean;
  private readonly o: ExitPopupOptions;
  private rating = 0;
  private touched = false;
  private busy = false;
  private alive = true;
  private readonly stars: HTMLButtonElement[] = [];
  private clearBtn: HTMLButtonElement | null = null;

  constructor(o: ExitPopupOptions) {
    this.o = o;
    const doc = o.doc;
    this.rateable = !!o.runs && o.runs.anchor() !== null;
    this.el = popupPanel(doc, 'wc-pop-exit', 'Exit to main menu');
    const q = doc.createElement('div');
    q.className = 'wc-pop-ask';
    q.textContent = 'Exit to main menu?';
    this.el.append(q);
    if (o.warning) {
      const w = doc.createElement('div');
      w.className = 'wc-pop-warn';
      w.textContent = o.warning;
      this.el.append(w);
    }
    if (this.rateable) {
      const sub = doc.createElement('div');
      sub.className = 'wc-pop-note';
      sub.textContent = 'Rate & save this run (optional)';
      const row = doc.createElement('div');
      row.className = 'wc-pop-stars';
      for (let n = 1; n <= 5; n++) {
        const s = ghostButton(doc, 'wc-pop-star', '★', () => this.set(n));
        s.setAttribute('aria-label', `${n} star${n > 1 ? 's' : ''}`);
        this.stars.push(s);
      }
      this.clearBtn = ghostButton(doc, 'wc-pop-clear', 'clear', () => this.set(0));
      row.append(...this.stars, this.clearBtn);
      this.el.append(sub, row);
      void o.runs!.chain().then(
        (s) => {
          if (this.alive && !this.touched && s?.saved) this.paint(s.rating);
        },
        () => {},
      );
    }
    const btns = doc.createElement('div');
    btns.className = 'wc-pop-btns';
    const cancel = ghostButton(doc, 'wc-pop-btn', 'Cancel', () => o.close(true), 'Esc');
    cancel.dataset.act = 'cancel';
    const exit = ghostButton(doc, 'wc-pop-btn is-danger', 'Exit', () => void this.exit(), 'Y');
    exit.dataset.act = 'exit';
    btns.append(cancel, exit);
    this.el.append(btns);
    this.el.addEventListener('keydown', this.onKey);
    this.paint(0);
  }

  /** The rating shown (0 = none). */
  get value(): number {
    return this.rating;
  }

  private set(n: number): void {
    this.touched = true;
    this.paint(n);
  }

  private paint(n: number): void {
    this.rating = n;
    this.stars.forEach((s, i) => s.classList.toggle('is-on', i < n));
    if (this.clearBtn) this.clearBtn.hidden = n === 0;
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!plainKey(e)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.o.close(true);
      return;
    }
    if (e.key === 'y' || e.key === 'Y') {
      e.preventDefault();
      void this.exit();
      return;
    }
    const r = this.rateable ? ratingFromKey(e, this.rating) : null;
    if (r !== null) {
      e.preventDefault();
      this.set(r);
    }
  };

  /** Saves the rating (when rateable) and exits; once. */
  async exit(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    if (this.rateable) {
      try {
        await this.o.runs!.saveChain(this.rating);
      } catch {
        /* exiting matters more than the save */
      }
    }
    this.o.exit();
  }

  dispose(): void {
    this.alive = false;
    this.el.remove();
  }
}
