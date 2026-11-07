// The Spotlights card (stage 32c, ADR 0114; Inv §7.6): the reel's info and
// its filter in one ghost-look card at the top right of the player,
// always shown (the chrome auto-hides, the card does not). It replaced the
// TUI info box and the gear popup of ADR 0110.
//
// Stage 46 (ADR 0131): the Spotlights page no longer shows the card (its
// wall has the filter row, its viewer the head and the countdown). It
// stays only for the full-page reel of the shell's `openSpotlights` (and
// its dev hook) until wave 3 removes both; `countdownLeft` and
// `REEL_NO_MATCH` are the pure helpers the bare reel still uses.
//
//   ┌──────────────────────────────────┐
//   │ ‹   SPOTLIGHT 2 / 5   ›          │   arrows disabled at the ends
//   │ ☠ Death                          │   kind icon and name in its colour
//   │ Death (level 42)                 │   the label, bold, at most 2 lines
//   │ Rasta · 2026-09-26               │
//   │ ───────────────                  │   countdown: drains from both sides to the moment
//   ├──────────────────────────────────┤
//   │ › Kinds                      All │   folds out: a switch per kind, with its icon
//   │ › Characters                 All │   folds out: All characters, a check per name
//   │ Period              [All time ▾] │
//   └──────────────────────────────────┘
//
// With nothing to play the card stays with its filter and says so. Every
// change goes to the settings store at once (`spotlights`), and the reel
// rebuilds from it (spotlight-mode.ts). The character rules are the
// popup's (ADR 0110, `allCharactersPatch` / `characterPatch`): the names
// are the recorded characters, read when the card opens; a remembered name
// that is no longer recorded is not listed, and checks are disabled while
// All is on.
//
// Keys: the card carries `data-wc-own-keys`, so keys whose target is in it
// (it was tabbed into) are its own and Esc there gives the keys back. A
// press never moves the focus into it, so ← → and Space after a click
// still drive the reel; the Period list gives the focus back once chosen.

import './spotlight.css';
import type { SettingsStore, SpotlightSettings } from '../settings';
import { SPOTLIGHT_PERIODS } from '../settings';
import {
  KIND_LABEL,
  PERIOD_LABELS,
  SPOTLIGHT_KINDS,
  type Spotlight,
  allCharactersPatch,
  characterPatch,
  characterRows,
} from '../share/spotlights';
import { OWN_KEYS_ATTR } from '../ui/input-pane';
import { type KindIcon, kindColor, kindIcon, playerIcon } from './icons';
import { RAIL_W } from './strip';
import { fmtDate } from './spotlight-reel';

/** The empty card's message (the start page's "filtered" page says the same). */
export const REEL_NO_MATCH = 'No spotlights match your settings.';

/** Card width, its distance from the rail, and the least room left of it, px. */
export const CARD_W = 330;
const CARD_RIGHT = 28;
const CARD_MARGIN = 8;
/** Narrower than this, the card hides. */
export const CARD_MIN_W = 240;

export interface SpotlightCardState {
  /** Current spotlight index and the reel's length. */
  index: number;
  total: number;
  spot: Spotlight;
  /** What is left of the countdown to the moment: 1 at the start, 0 at the moment and after. */
  countdown: number;
}

export interface SpotlightCardOptions {
  /** ← (−1) or → (+1). */
  onNav: (dir: -1 | 1) => void;
  /** The filter section: the settings store and the recorded characters. */
  filter?: { settings: SettingsStore; characters: () => Promise<string[]> };
}

/** The card's width on a player `width` px wide, or 0 when it hides. */
export function cardWidth(width: number): number {
  const room = width - RAIL_W - CARD_RIGHT - CARD_MARGIN;
  return room >= CARD_MIN_W ? Math.min(CARD_W, room) : 0;
}

/** What is left of the countdown at `p` in a spotlight starting at `start` whose moment is `moment` (1 → 0). */
export function countdownLeft(start: number, moment: number, p: number): number {
  const span = moment - start;
  if (!(span > 0)) return 0;
  return Math.max(0, Math.min(1, (moment - p) / span));
}

export class SpotlightCard {
  readonly el: HTMLDivElement;
  private readonly doc: Document;
  private readonly o: SpotlightCardOptions;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly count: HTMLSpanElement;
  private readonly info: HTMLDivElement;
  private readonly kind: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly meta: HTMLDivElement;
  private readonly cd: HTMLDivElement;
  private readonly cdBar: HTMLElement;
  private readonly empty: HTMLDivElement;
  private readonly offs: Array<() => void> = [];
  private sig = '';
  private cdSig = '';
  private filterSig = '';
  private names: string[] | null = null;
  private readonly open = { kinds: false, chars: false };
  private filterEl: HTMLDivElement | null = null;

  constructor(doc: Document, o: SpotlightCardOptions) {
    this.doc = doc;
    this.o = o;
    const div = (cls: string): HTMLDivElement => {
      const d = doc.createElement('div');
      d.className = cls;
      return d;
    };
    this.el = div('wc-spot-card');
    this.el.setAttribute(OWN_KEYS_ATTR, '');
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', 'Spotlight');
    const head = div('wc-sc-head');
    this.prev = this.iconButton('Previous spotlight (←)', 'prev');
    this.prev.dataset.nav = 'prev';
    this.prev.addEventListener('click', () => o.onNav(-1));
    this.next = this.iconButton('Next spotlight (→)', 'next');
    this.next.dataset.nav = 'next';
    this.next.addEventListener('click', () => o.onNav(1));
    this.count = doc.createElement('span');
    this.count.className = 'wc-sc-count';
    head.append(this.prev, this.count, this.next);
    this.info = div('wc-sc-info');
    this.kind = div('wc-sc-kind');
    this.label = div('wc-sc-label');
    this.meta = div('wc-sc-meta');
    this.info.append(this.kind, this.label, this.meta);
    this.cd = div('wc-sc-cd');
    this.cdBar = doc.createElement('i');
    this.cd.append(this.cdBar);
    this.empty = div('wc-sc-empty');
    const small = doc.createElement('small');
    small.textContent = o.filter ? 'Change the kinds, characters or period below.' : '';
    this.empty.append(REEL_NO_MATCH, small);
    this.empty.hidden = true;
    this.el.append(head, this.info, this.cd, this.empty);
    if (o.filter) this.buildFilter(o.filter);

    // A press never takes the focus (the reel keeps its keys) and never reaches the stage.
    this.el.addEventListener('mousedown', (e) => {
      if (!(e.target as Element | null)?.closest?.('select')) e.preventDefault();
    });
    this.el.addEventListener('click', (e) => e.stopPropagation());
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      (doc.activeElement as HTMLElement | null)?.blur?.();
    });
  }

  private iconButton(label: string, icon: 'prev' | 'next'): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = 'wc-sc-ib';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.append(playerIcon(this.doc, icon));
    return b;
  }

  /** Shows spotlight `s`, or the empty card (null). */
  update(s: SpotlightCardState | null): void {
    const sig = s ? `${s.index}|${s.total}|${s.spot.id}` : 'empty';
    if (sig !== this.sig) {
      this.sig = sig;
      this.el.toggleAttribute('data-empty', !s);
      this.info.hidden = !s;
      this.cd.hidden = !s;
      this.empty.hidden = !!s;
      this.count.textContent = s ? `Spotlight ${s.index + 1} / ${s.total}` : 'Spotlight 0 / 0';
      this.prev.disabled = !s || s.index <= 0;
      this.next.disabled = !s || s.index + 1 >= s.total;
      if (s) {
        const kind = s.spot.kind as KindIcon;
        this.kind.replaceChildren(kindIcon(this.doc, kind), KIND_LABEL[s.spot.kind]);
        this.kind.style.color = kindColor(kind);
        this.kind.dataset.kind = kind;
        this.label.textContent = s.spot.label;
        this.label.title = s.spot.label;
        this.meta.textContent = `${s.spot.character} · ${fmtDate(s.spot.atUs)}`;
      }
    }
    const left = s ? s.countdown : 0;
    const cdSig = left > 0 ? (((1 - left) / 2) * 100).toFixed(1) : '';
    if (cdSig !== this.cdSig) {
      this.cdSig = cdSig;
      this.cdBar.hidden = cdSig === '';
      this.cdBar.style.left = this.cdBar.style.right = `${cdSig}%`;
    }
  }

  /** Sizes the card for a player `width` px wide; it hides when too narrow. */
  place(width: number): void {
    const w = cardWidth(width);
    this.el.toggleAttribute('data-narrow', w === 0);
    if (w > 0) this.el.style.width = `${w}px`;
    this.el.style.right = `${RAIL_W + CARD_RIGHT}px`;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.el.remove();
  }

  // ------------------------------------------------------------- filter

  private buildFilter(f: NonNullable<SpotlightCardOptions['filter']>): void {
    const el = this.doc.createElement('div');
    el.className = 'wc-sc-filter';
    this.filterEl = el;
    this.el.append(el);
    this.renderFilter();
    this.offs.push(
      f.settings.subscribe((next, prev) => {
        if (JSON.stringify(next.spotlights) !== JSON.stringify(prev.spotlights)) this.renderFilter();
      }),
    );
    void f
      .characters()
      .catch(() => [])
      .then((list) => {
        this.names = list.filter((n) => n !== '');
        this.renderFilter();
      });
  }

  private patch(p: Partial<SpotlightSettings>): void {
    this.o.filter?.settings.update({ spotlights: p });
  }

  /** Draws the filter for the current settings (only when something it shows changed). */
  private renderFilter(): void {
    const el = this.filterEl;
    const fo = this.o.filter;
    if (!el || !fo) return;
    const f = fo.settings.get().spotlights;
    const sig = JSON.stringify([f, this.names, this.open]);
    if (sig === this.filterSig) return;
    this.filterSig = sig;
    const doc = this.doc;
    // The focused control is found again by its key after the redraw (keyboard use).
    const focusKey = (doc.activeElement as HTMLElement | null)?.closest?.('.wc-spot-card [data-fk]')?.getAttribute('data-fk') ?? null;
    const btn = (cls: string, fk: string, onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.dataset.fk = fk;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
      });
      return b;
    };
    const span = (cls: string, text = ''): HTMLSpanElement => {
      const s = doc.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    };
    const toggle = (on: boolean): HTMLSpanElement => {
      const t = span(`wc-pc-tg${on ? ' is-on' : ''}`);
      t.append(doc.createElement('i'));
      return t;
    };
    const fold = (key: 'kinds' | 'chars', label: string, sum: string): HTMLButtonElement => {
      const b = btn('wc-sc-fold', `fold-${key}`, () => {
        this.open[key] = !this.open[key];
        this.renderFilter();
      });
      b.dataset.fold = key;
      b.setAttribute('aria-expanded', String(this.open[key]));
      const chev = playerIcon(doc, 'chev', `wc-pc-ic wc-sc-chev${this.open[key] ? ' is-open' : ''}`);
      b.append(chev, span('wc-sc-fl', label), span('wc-sc-grow'), span('wc-sc-sum', sum));
      return b;
    };

    const parts: HTMLElement[] = [];
    // Kinds.
    const kOn = SPOTLIGHT_KINDS.filter((k) => f[k.key]).length;
    parts.push(fold('kinds', 'Kinds', kOn === SPOTLIGHT_KINDS.length ? 'All' : kOn === 0 ? 'None' : `${kOn} of ${SPOTLIGHT_KINDS.length}`));
    if (this.open.kinds) {
      const body = doc.createElement('div');
      body.className = 'wc-sc-fb';
      for (const k of SPOTLIGHT_KINDS) {
        const on = f[k.key];
        const b = btn(`wc-sc-row${on ? ' is-on' : ''}`, `kind-${k.key}`, () => this.patch({ [k.key]: !on }));
        b.setAttribute('role', 'switch');
        b.setAttribute('aria-checked', String(on));
        b.setAttribute('aria-label', k.label);
        b.dataset.kind = k.key;
        const l = span('wc-sc-rl');
        l.append(kindIcon(doc, k.kind as KindIcon), k.label);
        b.append(l, toggle(on));
        body.append(b);
      }
      parts.push(body);
    }
    // Characters.
    const names = this.names;
    const rows = names ? characterRows(names, f) : [];
    const checked = rows.filter((r) => r.on).map((r) => r.name);
    parts.push(fold('chars', 'Characters', f.allCharacters ? 'All' : checked.length ? checked.join(', ') : 'None'));
    if (this.open.chars) {
      const body = doc.createElement('div');
      body.className = 'wc-sc-fb';
      const all = btn(`wc-sc-row${f.allCharacters ? ' is-on' : ''}`, 'all', () => names && this.patch(allCharactersPatch(names, f, !f.allCharacters)));
      all.setAttribute('role', 'switch');
      all.setAttribute('aria-checked', String(f.allCharacters));
      all.setAttribute('aria-label', 'All characters');
      all.append(span('wc-sc-rl', 'All characters'), toggle(f.allCharacters));
      body.append(all);
      if (names && names.length === 0) body.append(span('wc-sc-note', 'No characters recorded yet.'));
      if (rows.length > 0) {
        const list = doc.createElement('div');
        list.className = `wc-sc-chars${f.allCharacters ? ' is-dim' : ''}`;
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', 'Characters');
        for (const r of rows) {
          const on = f.allCharacters || r.on;
          const c = btn(`wc-sc-cb${on ? ' is-on' : ''}`, `char-${r.name}`, () => names && !f.allCharacters && this.patch(characterPatch(names, f, r.name, !r.on)));
          c.setAttribute('role', 'checkbox');
          c.setAttribute('aria-checked', String(r.on));
          c.dataset.name = r.name;
          c.disabled = f.allCharacters;
          c.append(doc.createElement('i'), r.name);
          list.append(c);
        }
        body.append(list);
      }
      parts.push(body);
    }
    // Period.
    const per = doc.createElement('div');
    per.className = 'wc-sc-period';
    const sel = doc.createElement('select');
    sel.className = 'wc-sc-sel';
    sel.dataset.fk = 'period';
    sel.setAttribute('aria-label', 'Period');
    for (const p of SPOTLIGHT_PERIODS) {
      const opt = doc.createElement('option');
      opt.value = p;
      opt.textContent = PERIOD_LABELS[p];
      sel.append(opt);
    }
    sel.value = f.period;
    sel.addEventListener('change', () => {
      this.patch({ period: sel.value as SpotlightSettings['period'] });
      sel.blur();
    });
    const selw = span('wc-sc-selw');
    selw.append(sel, playerIcon(doc, 'chev', 'wc-pc-ic wc-sc-selic'));
    per.append(span('wc-sc-fl', 'Period'), selw);
    parts.push(per);
    el.replaceChildren(...parts);
    if (focusKey) el.querySelector<HTMLElement>(`[data-fk="${focusKey.replace(/["\\]/g, '\\$&')}"]`)?.focus({ preventScroll: true });
  }
}
