// The look picker (stage 80 §5, ADR 0169): one dialog of the look kit, in
// the chrome chunk, opened by a click on the portrait in the Character pane
// (and the Character gear's "Look…" row; a group member's token in part C).
// The look is the mockup's (notes/research/token-mockups/round2.html): a
// preview column and three tabs.
//
//   ┌ Look for Rasta ─────────────────────────────────────────────┐
//   │ PORTRAIT        [Automatic] [Library] [My images]          │
//   │  (frame)        Automatic: one card, the engraved drawing  │
//   │ TOKEN ON MAP    Library: chips (people, sex, mounts, mobs, │
//   │  (map bit)        with counts), a search, the grid         │
//   │ IN GROUP        My images: the shelf and the crop step, or │
//   │  (a row)          the login card logged out (part D)       │
//   │ [switch] Show my look to other MUME Cockpit players        │
//   │                    Reset to automatic · Cancel · Use this look │
//   └────────────────────────────────────────────────────────────┘
//
// - The selection shows live in the panes (`LooksStore.preview`); Cancel
//   (and Esc, the veil) puts back the look the dialog opened with; "Use
//   this look" stores the selection.
// - Keys: the dialog's own ring over everything focusable in it (Tab and
//   Shift+Tab), ← → across the tabs, the arrows in the grid by its columns,
//   ↓ from the search into the grid, Enter or Space presses what has the
//   focus (Enter on the selected picture uses it), Esc cancels. The game
//   input has the focus again after it closes (`focusInput`).
// - Every text a player reads says MUME Cockpit, never WebCockpit.
// - The CSS prefix is `wc-looks-` (`wc-lk-` is the look kit's own).

import type { VNode } from 'preact';
import { createContext, render } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import type { GameState } from '../gmcp/state';
import type { Sex } from '../gmcp/sex';
import { Dialog, type DialogButton } from '../chrome/kit/look-overlay';
import { lookFrame } from '../chrome/kit/look';
import { FrameStack, useKeyLayer } from '../chrome/kit/stack';
import { type ChromeServices, ServicesCtx, useServices, useSettings } from '../chrome/kit/hooks';
import { portraitArt } from '../panes/portraits';
import { isLight } from '../theme/color';
import { type Library, type LibraryEntry, loadLibrary, tokenUrl } from './library';
import { type Look, autoMember, autoSelf, resolveMember, resolveSelf } from './resolve';
import { SELF_COLOR, ringCss } from './ring';
import type { LooksStore } from './store';
import { AUTO, type LookRef, lookName, sameLook } from './types';
import { type LibFilter, RACE_CHIPS, filterLibrary, libraryCounts } from './filter';
import { MineTab, type MineKeys } from './mine';
import './picker.css';

/** An own image's `data:` URL for the previews (the picker's looks store). */
const OwnSrc = createContext<(id: string) => string | null>(() => null);

export interface LookPickerTarget {
  name: string;
  self: boolean;
}

export interface LookPickerOptions {
  who: LookPickerTarget;
  looks: LooksStore;
  game: GameState;
  /** Gives the game input its focus back. */
  focusInput(): void;
  /** The dialog closed (Cancel, Use, Esc). */
  onClose?(): void;
  /** True when the page may be left for the start page's Log in (no game connected); absent: always. */
  canLeave?(): boolean;
}

export interface LookPickerHandle {
  /** Closes as Cancel would. */
  close(): void;
  dispose(): void;
}

type Tab = 'auto' | 'lib' | 'mine';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'auto', label: 'Automatic' },
  { id: 'lib', label: 'Library' },
  { id: 'mine', label: 'My images' },
];

/** A look's picture for the preview: its URL (a library file, or a baked drawing) and how it sits. */
function usePicture(look: Look, big: boolean): { src: string | null; lib: boolean } {
  const doc = typeof document !== 'undefined' ? document : null;
  const ownSrc = useContext(OwnSrc);
  const [baked, setBaked] = useState<{ key: string; src: string | null } | null>(null);
  const key = look.kind === 'drawn' ? `${look.portrait}|${look.sex}|${big}` : '';
  useEffect(() => {
    if (look.kind !== 'drawn' || !doc) return;
    let live = true;
    const px = Math.ceil((big ? 150 : 64) * (doc.defaultView?.devicePixelRatio || 1));
    void portraitArt(doc, look.portrait, look.sex, big ? 'large' : 'medium', px).then(
      (src) => live && setBaked({ key, src }),
      () => live && setBaked({ key, src: null }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  if (look.kind === 'lib') return { src: tokenUrl(look.id, big ? 'p' : 't'), lib: true };
  if (look.kind === 'own') return { src: ownSrc(look.id), lib: false };
  if (look.kind === 'drawn') return { src: baked?.key === key ? baked.src : null, lib: false };
  return { src: null, lib: false };
}

/** A round token (the R3 ring) of `d` px. */
function Token(p: { look: Look; d: number; ring: string }): VNode {
  const pic = usePicture(p.look, p.d > 60);
  return (
    <span class={'wc-looks-tk' + (pic.lib ? ' is-lib' : ' is-por')} style={{ '--d': `${p.d}px`, '--c': p.ring }}>
      {pic.src && <img src={pic.src} alt="" draggable={false} />}
    </span>
  );
}

/** The Automatic card's picture: the mockup's framed square. */
function AutoImg(p: { look: Look }): VNode {
  const pic = usePicture(p.look, true);
  return <span class={'wc-looks-autoimg' + (pic.lib ? ' is-lib' : '')}>{pic.src && <img src={pic.src} alt="" draggable={false} />}</span>;
}

function Preview(p: { look: Look; name: string; ring: string; hp: number; mana: number | null; mv: number }): VNode {
  const big = usePicture(p.look, true);
  const settings = useSettings();
  const tileset = settings.mapper.tileset.startsWith('shimrod') ? 'shimrod-summer' : settings.mapper.tileset;
  const ground = `${(import.meta.env?.BASE_URL as string | undefined) ?? '/'}map/tilesets/previews/${tileset}.png`;
  const bar = (cls: string, pct: number): VNode => (
    <span class={'wc-looks-bar ' + cls}>
      <i style={{ width: `${Math.round(pct * 100)}%` }} />
    </span>
  );
  return (
    <div class="wc-looks-prev" aria-hidden="true">
      <span class="wc-looks-sub">Portrait</span>
      <div class={'wc-looks-frame' + (big.lib ? ' is-lib' : '')}>
        <div class="wc-looks-pimg">{big.src && <img src={big.src} alt="" draggable={false} />}</div>
        <span class="wc-looks-plate">{p.name}</span>
      </div>
      <span class="wc-looks-sub">Token on the map</span>
      <div class="wc-looks-mapbit" style={{ backgroundImage: `url("${ground}")` }}>
        <Token look={p.look} d={35} ring={p.ring} />
      </div>
      <span class="wc-looks-sub">In the Group pane</span>
      <div class="wc-looks-row">
        <Token look={p.look} d={26} ring={p.ring} />
        <span class="wc-looks-row-b">
          <b>{p.name}</b>
          <span class="wc-looks-bars">
            {bar('is-hp', p.hp)}
            {p.mana !== null && bar('is-ma', p.mana)}
            {bar('is-mv', p.mv)}
          </span>
        </span>
      </div>
    </div>
  );
}

/** Everything in the dialog a key may focus, in document order. */
function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('button, input, .wc-looks-croparea')].filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0,
  );
}

/** The grid's step for an arrow: ±1, or ± its columns (from the items' rows). */
function gridMove(items: HTMLElement[], at: number, key: 'left' | 'right' | 'up' | 'down'): number {
  if (key === 'left') return Math.max(0, at - 1);
  if (key === 'right') return Math.min(items.length - 1, at + 1);
  const top = items[0]?.offsetTop ?? 0;
  let cols = items.findIndex((el) => el.offsetTop !== top);
  if (cols <= 0) cols = items.length;
  const to = at + (key === 'down' ? cols : -cols);
  return to < 0 || to >= items.length ? at : to;
}

interface FrameProps extends LookPickerOptions {
  done(): void;
}

const PickerFrame = lookFrame(function PickerFrame(p: FrameProps): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const { who, looks, game } = p;
  const v = game.char.view();
  const sex: Sex = game.sex ?? 'male';
  const member = useMemo(
    () => (who.self ? null : ([...game.group.list(), ...game.group.unlabeled()].find((m) => lookName(m.name) === lookName(who.name)) ?? null)),
    [who.name],
  );
  const base = useMemo<LookRef>(() => looks.stored(who.name) ?? AUTO, []);
  const [sel, setSel] = useState<LookRef>(base);
  const [tab, setTab] = useState<Tab>(base.src === 'lib' ? 'lib' : base.src === 'own' ? 'mine' : 'auto');
  const [filter, setFilter] = useState<LibFilter>({ race: 'all', sex: null, kind: null, q: '' });
  const [lib, setLib] = useState<Library | null | 'failed'>(null);
  const [at, setAt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const closed = useRef(false);
  const mineKeys = useRef<MineKeys | null>(null);
  // The shelf's changes (an image added, removed or pulled) show at once.
  const [, bump] = useReducer((n: number, _: number) => n + 1, 0);
  useEffect(() => looks.subscribe(() => bump(0)), []);

  useEffect(() => {
    let live = true;
    void loadLibrary().then((l) => live && setLib(l ?? 'failed'));
    return () => {
      live = false;
    };
  }, []);
  const library = lib === 'failed' ? null : lib;

  // The selection shows live in the panes.
  useEffect(() => {
    if (closed.current) return;
    looks.preview(who.name, sameLook(sel, base) ? null : sel);
  }, [sel]);
  useEffect(() => () => {
    if (!closed.current) looks.preview(who.name, null);
  }, []);

  const finishRef = useRef<(keep: boolean) => void>(() => {});
  const finish = (keep: boolean): void => {
    if (closed.current) return;
    closed.current = true;
    if (keep && !sameLook(sel, base)) looks.choose(who.name, sel, who.self);
    else looks.preview(who.name, null);
    p.done();
  };
  finishRef.current = finish;

  const ownImages = looks.ownIds();
  const input = who.self
    ? { race: v.race, subrace: v.subrace, sex, library, ownImages }
    : { name: member?.name ?? who.name, npc: member?.type === 'npc', library, ownImages };
  const shown: Look = who.self ? resolveSelf({ ...(input as Parameters<typeof resolveSelf>[0]), choice: sel }) : resolveMember({ ...(input as Parameters<typeof resolveMember>[0]), choice: sel });
  const auto: Look = who.self ? autoSelf(input as Parameters<typeof autoSelf>[0]) : autoMember(input as Parameters<typeof autoMember>[0]);
  const ring = who.self ? ringCss(SELF_COLOR) : ringCss(0x8fb7ff);
  const vit = (k: 'hp' | 'mana' | 'mp'): number => {
    const x = v.vitals[k];
    return x.value !== null && x.max ? Math.max(0, Math.min(1, x.value / x.max)) : 1;
  };
  const name = who.self ? (v.name ?? who.name) : who.name;

  // Keys: the dialog's ring (see the file header).
  useKeyLayer((e, nk) => {
    const root = ref.current?.closest<HTMLElement>('.wc-lk-dialog');
    if (!root) return false;
    const doc = root.ownerDocument;
    const cur = doc.activeElement instanceof HTMLElement && root.contains(doc.activeElement) ? doc.activeElement : null;
    // The search field (the crop's zoom slider keeps its own arrows).
    const field = cur?.tagName === 'INPUT' && (cur as HTMLInputElement).type === 'search';
    // My images: the crop's picture and zoom (MineTab).
    if (cur && mineKeys.current?.(cur, e, nk)) return true;
    const go = (el: HTMLElement | undefined): void => {
      if (!el) return;
      el.focus({ preventScroll: false });
      el.scrollIntoView?.({ block: 'nearest' });
      setAt(el.dataset.btn ?? null);
    };
    if (nk === 'tab' || nk === 'backtab') {
      const all = focusables(root);
      const i = cur ? all.indexOf(cur) : -1;
      go(all[(i + (nk === 'tab' ? 1 : -1) + all.length) % all.length]);
      return true;
    }
    if (!cur) return false;
    if (cur.getAttribute('role') === 'tab' && (nk === 'left' || nk === 'right')) {
      const i = TABS.findIndex((t) => t.id === cur.dataset.tab);
      const next = TABS[(i + (nk === 'right' ? 1 : -1) + TABS.length) % TABS.length]!;
      setTab(next.id);
      requestAnimationFrame(() => go(root.querySelector<HTMLElement>(`[data-tab="${next.id}"]`) ?? undefined));
      return true;
    }
    if (cur.classList.contains('wc-looks-it') && (nk === 'left' || nk === 'right' || nk === 'up' || nk === 'down')) {
      const items = [...root.querySelectorAll<HTMLElement>('.wc-looks-it')];
      go(items[gridMove(items, items.indexOf(cur), nk)]);
      return true;
    }
    if (field && nk === 'down') {
      go(root.querySelector<HTMLElement>('.wc-looks-it') ?? undefined);
      return true;
    }
    if (field && e.key === 'Enter') {
      go(root.querySelector<HTMLElement>('.wc-looks-it') ?? undefined);
      return true;
    }
    if (!field && nk === 'activate') {
      // Enter on the picture that is already chosen uses it.
      if (e.key === 'Enter' && cur.classList.contains('wc-looks-it') && cur.getAttribute('aria-pressed') === 'true') finishRef.current(true);
      else if (!e.repeat) cur.click();
      return true;
    }
    return false;
  });

  // The focus starts on the selected picture, or the tab.
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      const root = ref.current?.closest<HTMLElement>('.wc-lk-dialog');
      const el = root?.querySelector<HTMLElement>('.wc-looks-it[aria-pressed="true"], .wc-looks-auto') ?? root?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      el?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(t);
  }, [lib !== null]);

  const choose = (look: LookRef): void => setSel(look);

  const buttons: DialogButton[] = [
    ...(who.self ? [] : [{ id: 'RESET', label: 'Reset to automatic', run: () => (setSel(AUTO), setTab('auto')) }]),
    { id: 'CANCEL', label: 'Cancel', run: () => finish(false) },
    { id: 'USE', label: 'Use this look', primary: true, run: () => finish(true) },
  ];

  const autoTitle = auto.kind === 'drawn' ? (auto.portrait === 'neutral' ? 'Neutral figure' : 'Engraved drawing') : auto.kind === 'lib' ? (library?.byId.get(auto.id)?.label ?? auto.id) : 'The marker icon';
  const autoText = who.self
    ? auto.kind === 'drawn' && auto.portrait === 'neutral'
      ? 'Your race is not known yet. It follows your race and sex once the game has said them.'
      : `Follows your race and sex (${v.raceLine ?? 'unknown'}, ${sex})`
    : sourceLine(auto, library);

  return (
    <OwnSrc.Provider value={(id) => looks.ownSrc(id)}>
    <Dialog title={`Look for ${name}`} dlg="look" width={780} at={at} buttons={buttons} onCancel={() => finish(false)}>
      <div class="wc-looks" ref={ref}>
        <div class="wc-looks-body">
          <Preview look={shown} name={name} ring={ring} hp={vit('hp')} mana={v.mana ? vit('mana') : null} mv={vit('mp')} />
          <div class="wc-looks-main">
            <div class="wc-looks-tabs" role="tablist" aria-label="Where the look comes from">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  data-tab={t.id}
                  aria-selected={tab === t.id ? 'true' : 'false'}
                  tabIndex={-1}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div class="wc-looks-pane" role="tabpanel" data-pane={tab}>
              {tab === 'auto' && (
                <>
                  <button type="button" class="wc-looks-auto" tabIndex={-1} aria-pressed={sel.src === 'auto' ? 'true' : 'false'} onClick={() => setSel(AUTO)}>
                    <AutoImg look={auto} />
                    <span>
                      <b>{autoTitle}</b>
                      <span class="wc-looks-d">{autoText}</span>
                    </span>
                  </button>
                  {!who.self && <p class="wc-looks-hint">What you get without choosing anything. Pick from Library or My images to set your own look for this name. It is only shown to you.</p>}
                </>
              )}
              {tab === 'lib' && <LibraryTab lib={lib} filter={filter} setFilter={setFilter} sel={sel} ring={ring} choose={choose} />}
              {tab === 'mine' && (
                <MineTab
                  looks={looks}
                  sel={sel}
                  choose={choose}
                  keys={mineKeys}
                  {...(p.canLeave ? { canLeave: p.canLeave } : {})}
                  onRemoved={(id) => {
                    if (sel.src === 'own' && sel.id === id) setSel(AUTO);
                  }}
                />
              )}
            </div>
          </div>
        </div>
        {who.self && (
          <div class="wc-looks-share">
            <button
              type="button"
              class="wc-looks-sw"
              role="switch"
              tabIndex={-1}
              aria-checked={s.character.shareLook ? 'true' : 'false'}
              aria-label="Show my look to other MUME Cockpit players"
              onClick={() => settings.update({ character: { shareLook: !s.character.shareLook } })}
            />
            <div>
              <b>Show my look to other MUME Cockpit players</b>
              <span class="wc-looks-d">{shareNote(s.character.shareLook, sel, library)}</span>
            </div>
          </div>
        )}
      </div>
    </Dialog>
    </OwnSrc.Provider>
  );
});

function shareNote(on: boolean, sel: LookRef, library: Library | null): string {
  if (!on) return 'Off: nothing about your character is sent. Others see the neutral figure.';
  if (sel.src === 'own') return 'Your own image is never sent. Others see your automatic drawing.';
  if (sel.src === 'lib') return `Others see the library token ${library?.byId.get(sel.id)?.label ?? sel.id}.`;
  return 'Others see the automatic drawing for your race and sex. Your own images are never sent.';
}

/** Where a member's automatic look comes from (the picker's line). */
function sourceLine(l: Look, library: Library | null): string {
  const label = (id: string): string => library?.byId.get(id)?.label ?? id;
  switch (l.from) {
    case 'shared':
      return l.kind === 'lib' ? `Shared by the player: the library token ${label(l.id)}` : 'Shared by the player';
    case 'auto':
      return "Automatic from the player's race and sex";
    case 'matched':
      return l.kind === 'lib' ? `Matched by name: the library token ${label(l.id)}` : 'Matched by name';
    case 'icon':
      return 'No picture matches the name: the marker icon';
    default:
      return 'The player does not share a look: the neutral figure';
  }
}

function LibraryTab(p: {
  lib: Library | null | 'failed';
  filter: LibFilter;
  setFilter(f: LibFilter): void;
  sel: LookRef;
  ring: string;
  choose(look: LookRef): void;
}): VNode {
  const { lib, filter: f, setFilter } = p;
  const tokens = lib && lib !== 'failed' ? lib.tokens : [];
  const counts = useMemo(() => libraryCounts(tokens), [tokens]);
  const list = useMemo(() => filterLibrary(tokens, f), [tokens, f]);
  if (lib === null) return <p class="wc-looks-hint">Loading the library…</p>;
  if (lib === 'failed') return <p class="wc-looks-hint">The library could not be loaded. Try again later.</p>;
  const chip = (label: string, n: number, on: boolean, run: () => void, key: string): VNode => (
    <button key={key} type="button" class="wc-looks-chip" data-chip={key} tabIndex={-1} aria-pressed={on ? 'true' : 'false'} onClick={run}>
      {label}
      <i>{n}</i>
    </button>
  );
  return (
    <>
      <div class="wc-looks-chips">
        {RACE_CHIPS.map((r) => chip(r.label, counts[r.id], !f.kind && f.race === r.id, () => setFilter({ ...f, race: r.id, kind: null }), r.id))}
      </div>
      <div class="wc-looks-chips">
        {chip('Male', counts.male, f.sex === 'male', () => setFilter({ ...f, sex: f.sex === 'male' ? null : 'male', kind: null }), 'male')}
        {chip('Female', counts.female, f.sex === 'female', () => setFilter({ ...f, sex: f.sex === 'female' ? null : 'female', kind: null }), 'female')}
        <span class="wc-looks-sep" />
        {chip('Mounts', counts.mount, f.kind === 'mount', () => setFilter({ ...f, kind: f.kind === 'mount' ? null : 'mount', sex: null }), 'mount')}
        {chip('Mobs', counts.mob, f.kind === 'mob', () => setFilter({ ...f, kind: f.kind === 'mob' ? null : 'mob', sex: null }), 'mob')}
      </div>
      <input
        class="wc-looks-search"
        type="search"
        placeholder="Search the library"
        aria-label="Search the library"
        value={f.q}
        onInput={(e) => setFilter({ ...f, q: (e.currentTarget as HTMLInputElement).value })}
      />
      <div class="wc-looks-grid" role="listbox" aria-label="The library">
        {list.length === 0 && <div class="wc-looks-empty">Nothing in the library matches.</div>}
        {list.map((t) => {
          const on = p.sel.src === 'lib' && p.sel.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              class="wc-looks-it"
              data-id={t.id}
              tabIndex={-1}
              aria-pressed={on ? 'true' : 'false'}
              title={t.label}
              onClick={() => p.choose({ src: 'lib', id: t.id })}
            >
              <span class="wc-looks-tk is-lib" style={{ '--d': '64px', '--c': p.ring }}>
                <img src={tokenUrl(t.id, 't')} alt="" loading="lazy" draggable={false} />
              </span>
              <span class="wc-looks-n">{t.label}</span>
            </button>
          );
        })}
      </div>
      <p class="wc-looks-hint">
        {tokens.length} pictures in the community library, by Sunnyl75.
      </p>
    </>
  );
}

/** Mounts the picker for `opts.who` into `host` (a full-window layer). */
export function mountLookPicker(host: HTMLElement, services: ChromeServices, opts: LookPickerOptions): LookPickerHandle {
  let open = true;
  const done = (): void => {
    if (!open) return;
    open = false;
    render(null, host);
    host.remove();
    opts.onClose?.();
    opts.focusInput();
  };
  host.classList.add('wc-look', 'wc-looks-host');
  if (isLight(services.settings.get().appearance.bg)) host.dataset.light = '';
  render(
    <ServicesCtx.Provider value={services}>
      <FrameStack root={<PickerFrame {...opts} done={done} />} active={true} onRootBack={done} />
    </ServicesCtx.Provider>,
    host,
  );
  return {
    close() {
      if (!open) return;
      opts.looks.preview(opts.who.name, null);
      done();
    },
    dispose() {
      if (!open) return;
      open = false;
      opts.looks.preview(opts.who.name, null);
      render(null, host);
      host.remove();
    },
  };
}
