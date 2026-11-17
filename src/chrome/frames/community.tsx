// The Community page (stage 65 C1, spec §7.8, ADR 0155; round 13's pick
// 1b with the owner's changes, pick 2 for Random Runes; the owner's
// feedback W2: Random Runes' height, the players' figure, short headings,
// search, the phone's dashboard). C on the start menu (flag `gallery`), in
// the account pages' lazy chunk (account/index.tsx exports
// `openCommunity`; start-main.tsx loads it with `import()`): a chunk of its
// own split the kit and the account's state out of the start page's
// chunks (the entry's preload lists), as the share dialog's did (ADR 0154).
//
// Desktop and tablet (the list on the left, a column on the right):
//
//   [Back]                     ( Community )                          38
//                                                           players online
//    LOG ▾          [⌕ Search logs      ]   STARS   COM.  VIEWS │ LOG OF THE DAY
//    Gibur and the Witch-king's lieutenant (Gibur)  ★★★★★ 4.8 · 23  11  412 │  the title, its line,
//    fenwick · 4 h 04 min · 14 Nov                                         │  the description
//    … ten logs a page (the rows scroll)              ‹ Page 1 of 3 ›     │ HALL OF FAME (8)
//   ┌ RANDOM RUNES (at most 40 % of the height; the notes scroll) ──────┐ │ WARLORDS
//   │ hollin: every note whole, wrapped                           2 min │ │  White lords · Sauron's minions
//   │ [ Write a message… ]                                       [Post] │ │
//   └───────────────────────────────────────────────────────────────────┘ │
//
// The list opens on New (newest listed first); a press on a heading sorts
// (Log, Stars, Com., Views), and so does its marked letter (L S M V); the
// current sort is marked (▾). Ten logs a page; the pager sits at the
// list's bottom right; ← → (and PgUp PgDn) change page. ↑ ↓ Home End move
// the row cursor; Enter opens the run. A press on a sender's name opens
// "Logs by <name>" (the same list; R does it for the cursor's run). The
// search field (/ or F) searches as it is typed (2–60 characters, the
// title, character and sender; `GET /api/gallery?q=`): 'Search: "x" — N
// logs' with ✕ over the list. Back (Esc) leaves a sender's runs, then a
// search, then goes to the menu.
//
// A run opens the watch page `<base>r/<id>?from=community` in this tab;
// the watch page's Back then goes to `<base>?community`, which opens this
// page again on the view it had (kept in sessionStorage, `VIEW_KEY`;
// community-model.ts, ADR 0155 "As built (stage 65 C1)").
//
// The phone (a narrow page): a dashboard, no tabs. The search field and
// the players' figure, the newest five logs with All logs and Hall of Fame
// (the two sub-pages, each with Back), Log of the day, Random Runes (the
// latest notes, the field), the Warlords. The whole list (All logs) shows
// New only, without sorting, with the search field and the pager; it opens
// on the dashboard field's search (or empties the field). A sender's runs
// opened from the Hall of Fame go back to it.
//
// Random Runes (flag `runes`; off, the board is gone): every note whole,
// wrapped, never a link. Logged in: the field grows to several lines while
// it is used, ≤ 250 characters with a count and the notes left today (5 a
// day); at the limit the field is off and says when it opens. Each
// writer's name in a colour of its own (`writerHue`). One's own
// note with Remove; Report on others' (the stage 64 report dialog,
// for a note). A guest reads, and "Log in to write" opens Log in. W puts
// the keyboard in the field; Enter posts; Esc leaves the field.
//
// The page's words call a shared run a "log" (owner's feedback round 2);
// the code, the API and the store keep "run" (ADR 0155).
//
// Opening the page clears the menu's counter: "seen" is set to the newest
// listed time it showed (src/cloud/community/counter.ts).

import { type VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CommunityBoxes, GalleryPage, GalleryRow, Note, ReportReason, RunesBoard } from '../../../shared/cloud/api.ts';
import { DEFAULT_ACCOUNT_LIMITS, GALLERY_PAGE_SIZE, GALLERY_Q_MAX, NOTE_MAX } from '../../../shared/cloud/api.ts';
import { ownFieldAttrs } from '../../core/own-keyboard';
import { accountState, onAccountState } from '../../cloud/account/state';
import { type CommunityApi, communityAllowed, communityApi } from '../../cloud/community/api';
import { markCommunityPageSeen } from '../../cloud/community/counter';
import { config } from '../../cloud/config';
import { watchHref } from '../../watch/href';
import { HIDDEN_TEXT, REASONS, REPORT_MAX, reportText } from '../../watch/model';
import {
  Box,
  BoxBody,
  BoxFoot,
  Dialog,
  GlassButton,
  Icon,
  KeyLabel,
  LoadBar,
  LookFlash,
  Stars,
  TextArea,
  inTextField,
  letterOf,
  lookFrame,
} from '../kit/look';
import { type Nav, useIsTop, useKeyLayer, useKeys, useNav } from '../kit/stack';
import {
  type CommunitySub,
  type CommunityView,
  DEFAULT_SORT,
  type HeadSort,
  NOTE_LIMIT_TEXT,
  SEARCH_TOO_LONG,
  SORT_HEADS,
  VIEW_KEY,
  dateText,
  lengthText,
  meanText,
  newestListed,
  noteAge,
  writerHue,
  noteFailText,
  noteField,
  noteHint,
  noteReportFailText,
  notesToday,
  noteToSend,
  pagerText,
  pagesOf,
  parseView,
  runName,
  searchLine,
  searchOf,
  searchTooLong,
  sortOfKey,
  starsShown,
} from './community-model';

import './community.css';

/** Below this content width (px) the page takes the phone's form (the dashboard). */
export const COMMUNITY_NARROW = 700;
/** The box stops at this width (the sky on both sides). */
const COMMUNITY_MAX_W = 1320;
/** The newest logs the phone's dashboard shows. */
const DASH_RUNS = 5;
/** The warlords shown a side: all ten the Worker keeps (worker/mume.ts MAX_WARLORDS; owner's feedback round 2). */
const WARLORDS_SHOWN = 10;
/** The notes the phone's dashboard shows before "All notes". */
const DASH_NOTES = 5;
/** A search waits this long after the last key (ms). */
const SEARCH_WAIT_MS = 300;

type ListState = { k: 'loading' } | { k: 'ok'; page: GalleryPage } | { k: 'failed'; offline: boolean };
type BoardState = { k: 'loading' } | { k: 'ok'; board: RunesBoard } | { k: 'off' } | { k: 'failed' };
type BoxesState = CommunityBoxes | null | 'failed';

function session(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function readView(): CommunityView {
  try {
    return parseView(session()?.getItem(VIEW_KEY) ?? null);
  } catch {
    return parseView(null);
  }
}

function keepView(v: CommunityView): void {
  try {
    session()?.setItem(VIEW_KEY, JSON.stringify(v));
  } catch {
    /* not kept: Back from a run opens the page on New */
  }
}

const base = (): string => (import.meta.env?.BASE_URL as string | undefined) ?? '/';

/** Opens a run's watch page in this tab (Back there comes here again). */
function openRun(id: string): void {
  location.assign(watchHref(id, 'community', base()));
}

/** Log in: the account chunk's page over this one. */
function openLogin(nav: Nav): void {
  const depth = nav.depth();
  void import('./account')
    .then((m) => {
      if (nav.depth() === depth) nav.push(m.accountEntry(false));
    })
    .catch(() => nav.flash('The account pages could not be loaded. Check the connection and try again.', 'fail'));
}

/** Opens the Community page over the menu; `restore`: on the view kept from before a run was opened. */
export function openCommunity(nav: Nav, o: { restore?: boolean } = {}): void {
  nav.push(<CommunityFrame restore={o.restore} />);
}

const SUB_TITLES: Record<CommunitySub, string> = { runs: 'All logs', hof: 'Hall of Fame' };

export const CommunityFrame = lookFrame(function CommunityFrame(p: { restore?: boolean }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const api = useMemo<CommunityApi>(() => communityApi(), []);
  const [view, setView] = useState<CommunityView>(() => (p.restore ? readView() : { sort: DEFAULT_SORT, page: 1 }));
  const [list, setList] = useState<ListState>({ k: 'loading' });
  const [boxes, setBoxes] = useState<BoxesState>(null);
  const [board, setBoard] = useState<BoardState>({ k: 'loading' });
  const [cursor, setCursor] = useState(0);
  /** The phone's form; null until the width is measured (the list waits for it: review fix CR7, no second request on a phone). */
  const [measured, setNarrow] = useState<boolean | null>(null);
  const narrow = measured === true;
  const [account, setAccount] = useState(accountState);
  const [notesPerDay, setNotesPerDay] = useState(DEFAULT_ACCOUNT_LIMITS.notesPerDay);
  const [retry, setRetry] = useState(0);
  /** The search field's text (the search itself is `view.q`, set a moment after the last key). */
  const [field, setField] = useState(() => view.q ?? '');
  const bodyRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  /** Random Runes' Post (Enter in the field). */
  const postRef = useRef<(() => void) | null>(null);
  /** A field to focus once it is drawn (a key that also changed the phone's page). */
  const focusNext = useRef<'note' | 'search' | null>(null);
  const seen = useRef<number | null>(null);
  const sub: CommunitySub | null = narrow ? (view.sub ?? null) : null;
  /** The phone's dashboard: the newest runs only (page 1 of New, no search). */
  const home = narrow && sub === null;
  // The phone shows New only (no sorting).
  const sort: HeadSort = narrow ? 'new' : view.sort;

  useEffect(() => onAccountState(setAccount), []);
  useEffect(() => {
    void config().then((c) => {
      if (c.limits?.notesPerDay !== undefined) setNotesPerDay(c.limits.notesPerDay);
    });
  }, []);

  // The phone's form by the content's width (as History's).
  useLayoutEffect(() => {
    const el = bodyRef.current?.closest<HTMLElement>('.wc-lk-win') ?? bodyRef.current;
    if (!el) {
      setNarrow(false);
      return;
    }
    const check = (w: number): void => {
      if (w > 0) setNarrow(w < COMMUNITY_NARROW);
    };
    // The first measure always settles it (a width of 0, not laid out: the wide form until the observer says).
    const w = el.clientWidth;
    setNarrow(w > 0 ? w < COMMUNITY_NARROW : false);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((es) => {
      const e = es[es.length - 1];
      if (e) check(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => keepView(view), [view]);

  // The search follows the field a moment after the last key (a text under two characters: the whole list).
  const applySearch = (text: string): void => {
    const q = searchOf(text) ?? undefined;
    setView((v) => {
      if (v.q === q) return v;
      const { by: _by, q: _q, ...rest } = v;
      return { ...rest, page: 1, ...(q !== undefined ? { q } : {}) };
    });
    setCursor(0);
  };
  useEffect(() => {
    if ((searchOf(field) ?? undefined) === view.q) return;
    const t = setTimeout(() => applySearch(field), SEARCH_WAIT_MS);
    return () => clearTimeout(t);
  }, [field]);

  // The list.
  const asked = useRef(0);
  const q = home ? undefined : view.q;
  const by = home ? undefined : view.by;
  const page = home ? 1 : view.page;
  useEffect(() => {
    if (measured === null) return;
    const n = ++asked.current;
    setList((l) => (l.k === 'ok' ? l : { k: 'loading' }));
    void api.list({ sort, page, ...(by ? { by } : {}), ...(q ? { q } : {}) }).then((r) => {
      if (n !== asked.current) return;
      if (r.ok) {
        setList({ k: 'ok', page: r.value });
        setCursor((c) => Math.min(c, Math.max(0, r.value.rows.length - 1)));
      } else setList({ k: 'failed', offline: r.code === 'offline' || r.code === 'timeout' });
    });
  }, [api, sort, page, by, q, retry, measured === null]);

  // The boxes and the board.
  useEffect(() => {
    setBoxes(null);
    void api.boxes().then((r) => setBoxes(r.ok ? r.value : 'failed'));
    void communityAllowed('runes').then((on) => {
      if (!on) {
        setBoard({ k: 'off' });
        return;
      }
      setBoard({ k: 'loading' });
      void api.board().then((r) => setBoard(r.ok ? { k: 'ok', board: r.value } : r.code === 'disabled' || r.code === 'not_found' ? { k: 'off' } : { k: 'failed' }));
    });
  }, [api, retry]);

  // Seen: the newest listed time the page has shown (the menu's counter clears).
  const listRows = list.k === 'ok' ? list.page.rows : null;
  const boxRows = boxes && boxes !== 'failed' ? boxes : null;
  useEffect(() => {
    if (listRows === null && boxRows === null) return;
    const newest = newestListed(listRows, boxRows?.hallOfFame, boxRows?.today ? [boxRows.today] : null);
    if (newest === null || (seen.current !== null && newest <= seen.current)) return;
    seen.current = newest;
    void markCommunityPageSeen(newest);
  }, [listRows, boxRows]);

  // A field asked for by a key that changed the phone's page.
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    const el = f === 'note' ? fieldRef.current : searchRef.current;
    if (el && !el.disabled) {
      focusNext.current = null;
      el.focus();
    }
  });

  const rows = listRows ?? [];
  const total = list.k === 'ok' ? list.page.total : 0;
  const pages = pagesOf(total, GALLERY_PAGE_SIZE);
  const goPage = (pg: number): void => {
    if (pg < 1 || pg > pages || pg === view.page) return;
    setCursor(0);
    setView((v) => ({ ...v, page: pg }));
  };
  const chooseSort = (s: HeadSort): void => {
    if (narrow) return;
    setCursor(0);
    setView((v) => ({ ...v, sort: s, page: 1 }));
  };
  const showBy = (name: string): void => {
    setCursor(0);
    setField('');
    setView((v) => ({ sort: DEFAULT_SORT, page: 1, by: name, ...(v.sub ? { sub: v.sub } : {}) }));
  };
  const leaveBy = (): void => {
    setCursor(0);
    setView((v) => ({ sort: v.sort, page: 1, ...(v.sub ? { sub: v.sub } : {}) }));
  };
  const clearSearch = (): void => {
    setField('');
    setCursor(0);
    setView((v) => {
      const { q: _q, ...rest } = v;
      return v.q === undefined ? v : { ...rest, page: 1 };
    });
  };
  /**
   * The phone: a sub-page over the dashboard. All runs takes the dashboard
   * field's text (`search`): the search when it is one, else the field is
   * emptied (one too long stays, with its line), so the field and the list
   * never disagree (review fix 2 CR1).
   */
  const openSub = (s: CommunitySub, o: { search?: string } = {}): void => {
    setCursor(0);
    const text = o.search !== undefined ? (searchOf(o.search) ?? undefined) : undefined;
    if (o.search !== undefined && text === undefined && !searchTooLong(o.search)) setField('');
    setView((v) => ({ sort: v.sort, page: 1, sub: s, ...(text !== undefined ? { q: text } : {}) }));
  };
  /** The phone: from a sender's runs opened in the Hall of Fame back to it (review fix 2 CR3). */
  const backToHall = (): void => {
    setCursor(0);
    setView((v) => ({ sort: v.sort, page: 1, sub: 'hof' }));
  };
  const goHome = (): void => {
    setCursor(0);
    setField('');
    setView((v) => ({ sort: v.sort, page: 1 }));
  };
  /** Back: what it does here, or null when it leaves the page. */
  const backStep = (): (() => void) | null => {
    if (narrow) {
      if (sub === 'runs' && view.by) return view.from === 'hof' ? backToHall : leaveBy;
      if (sub) return goHome;
      return null;
    }
    if (view.by) return leaveBy;
    if (view.q) return clearSearch;
    return null;
  };
  const back = (): void => {
    const step = backStep();
    if (step) step();
    else nav.pop();
  };
  const submitSearch = (): void => {
    if (home) {
      openSub('runs', { search: field });
      return;
    }
    applySearch(field);
    searchRef.current?.blur();
  };

  useKeys((e, nk) => {
    if (inTextField(e.target)) {
      if (e.key === 'Enter' && !e.shiftKey && e.target === fieldRef.current) {
        postRef.current?.();
        return true;
      }
      if (e.key === 'Enter' && e.target === searchRef.current) {
        submitSearch();
        return true;
      }
      return false;
    }
    if (nk === 'back') {
      const step = backStep();
      if (step) {
        step();
        return true;
      }
      return false;
    }
    const l = letterOf(e);
    if ((l === 'f' || (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey)) && sub !== 'hof') {
      if (searchRef.current) searchRef.current.focus();
      return true;
    }
    if (l === 'w' && board.k === 'ok') {
      if (sub) {
        focusNext.current = 'note';
        goHome();
      } else if (fieldRef.current && !fieldRef.current.disabled) fieldRef.current.focus();
      return true;
    }
    if (home) return false;
    if (l === 'r' && rows[cursor] && !narrow) {
      showBy(rows[cursor]!.sender);
      return true;
    }
    if (!narrow) {
      const s = sortOfKey(e);
      if (s) {
        chooseSort(s);
        return true;
      }
    }
    if (narrow && sub !== 'runs') return false;
    switch (nk) {
      case 'up':
        setCursor((c) => Math.max(0, c - 1));
        return true;
      case 'down':
        setCursor((c) => Math.min(Math.max(0, rows.length - 1), c + 1));
        return true;
      case 'home':
        setCursor(0);
        return true;
      case 'end':
        setCursor(Math.max(0, rows.length - 1));
        return true;
      case 'left':
      case 'pgup':
        goPage(view.page - 1);
        return true;
      case 'right':
      case 'pgdn':
        goPage(view.page + 1);
        return true;
      case 'activate':
        if (rows[cursor] && !narrow) openRun(rows[cursor]!.id);
        return true;
    }
    return false;
  });

  const loggedIn = account.name !== null && account.enabled === true;
  const search = (
    <SearchField
      value={field}
      inputRef={searchRef}
      onInput={setField}
      onClear={clearSearch}
      onSubmit={home ? submitSearch : undefined}
    />
  );
  const listPart = (
    <RunList
      state={list}
      rows={rows}
      sort={sort}
      page={view.page}
      pages={pages}
      cursor={isTop && !narrow ? cursor : -1}
      narrow={narrow}
      by={view.by ?? null}
      q={view.q ?? null}
      tooLong={!home && searchTooLong(field)}
      me={account.name}
      guest={!loggedIn}
      search={narrow ? null : search}
      onSort={chooseSort}
      onPage={goPage}
      onBy={showBy}
      onLeaveBy={leaveBy}
      onClearSearch={clearSearch}
      onRetry={() => setRetry((n) => n + 1)}
    />
  );
  const runesPart = (latest: boolean): VNode | null =>
    board.k === 'off' ? null : (
      <RunesBox
        state={board}
        api={api}
        me={loggedIn ? account.name : null}
        accounts={account.enabled === true}
        perDay={notesPerDay}
        fieldRef={fieldRef}
        postRef={postRef}
        nav={nav}
        onBoard={(b) => setBoard({ k: 'ok', board: b })}
        latest={latest ? DASH_NOTES : null}
      />
    );

  if (narrow) {
    const title = sub ? SUB_TITLES[sub] : 'Community';
    let content: VNode;
    if (sub === 'runs') {
      content = (
        <>
          <div class="wc-cy-dtop is-runs">{search}</div>
          {listPart}
        </>
      );
    } else if (sub === 'hof') {
      const hallBy = (name: string): void => {
        setField('');
        setView((v) => ({ sort: v.sort, page: 1, by: name, sub: 'runs', from: 'hof' }));
      };
      content = <HallPage boxes={boxes} me={account.name} onBy={hallBy} />;
    } else {
      content = (
        <Dashboard
          state={list}
          rows={rows}
          boxes={boxes}
          search={search}
          runes={runesPart(true)}
          me={account.name}
          guest={!loggedIn}
          onAll={() => openSub('runs', { search: field })}
          onHall={() => openSub('hof')}
          onRetry={() => setRetry((n) => n + 1)}
        />
      );
    }
    return (
      <Box title={title} size="large" maxWidth={COMMUNITY_MAX_W} onBack={back} class="wc-cy is-narrow" winClass="wc-cy-win">
        <BoxBody class={'wc-cy-body is-narrow is-' + (sub ?? 'home')} bodyRef={bodyRef}>
          {content}
        </BoxBody>
        <BoxFoot class="wc-cy-foot">
          <LookFlash class="wc-cy-flash" />
        </BoxFoot>
      </Box>
    );
  }
  return (
    <Box title="Community" size="large" maxWidth={COMMUNITY_MAX_W} onBack={back} class="wc-cy" winClass="wc-cy-win">
      <BoxBody class="wc-cy-body" bodyRef={bodyRef} scroll={false}>
        <div class="wc-cy-main">
          {listPart}
          {runesPart(false)}
        </div>
        <BoxColumn boxes={boxes} />
      </BoxBody>
      <BoxFoot class="wc-cy-foot">
        <LookFlash class="wc-cy-flash" />
      </BoxFoot>
    </Box>
  );
});

// ------------------------------------------------------------ search

/**
 * The search field (owner's feedback 9): a one-line field in a glass well
 * with the find mark; ✕ empties it. On the phone's dashboard Enter (or the
 * find mark) opens All runs on the search; elsewhere it searches as typed.
 */
function SearchField(p: { value: string; inputRef: { current: HTMLInputElement | null }; onInput(v: string): void; onClear(): void; onSubmit?: () => void }): VNode {
  return (
    <div class="wc-cy-search" role="search">
      <Icon name="find" class="wc-cy-search-ic" />
      <input
        ref={(el) => {
          p.inputRef.current = el;
        }}
        class="wc-lk-input wc-cy-search-in"
        type="search"
        enterkeyhint="search"
        aria-label="Search logs"
        aria-keyshortcuts="/ F"
        placeholder="Search logs"
        value={p.value}
        maxLength={GALLERY_Q_MAX}
        spellcheck={false}
        autocomplete="off"
        autocapitalize="off"
        {...ownFieldAttrs()}
        onInput={(e) => p.onInput(e.currentTarget.value)}
      />
      {p.value !== '' && (
        <button
          type="button"
          class="wc-cy-search-x"
          tabIndex={-1}
          title="Clear the search"
          aria-label="Clear the search"
          data-btn="CLEAR-SEARCH"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            p.onClear();
          }}
        >
          <Icon name="close" />
        </button>
      )}
      {p.onSubmit && (
        <button
          type="button"
          class="wc-cy-search-go"
          tabIndex={-1}
          title="Search"
          aria-label="Search"
          data-btn="SEARCH"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            p.onSubmit?.();
          }}
        >
          <Icon name="next" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the list

interface RunListProps {
  state: ListState;
  rows: GalleryRow[];
  sort: HeadSort;
  page: number;
  pages: number;
  /** The row cursor (-1: none shown). */
  cursor: number;
  narrow: boolean;
  by: string | null;
  q: string | null;
  /** The field's text is longer than a search takes: a line says so (review fix 2 CR2). */
  tooLong: boolean;
  me: string | null;
  guest: boolean;
  /** The search field in the list's head (desktop); null on the phone (above the list). */
  search: VNode | null;
  onSort(s: HeadSort): void;
  onPage(p: number): void;
  onBy(name: string): void;
  onLeaveBy(): void;
  onClearSearch(): void;
  onRetry(): void;
}

/** A sortable heading (a press or its letter sorts; the current one is marked ▾). */
function Head(p: { sort: HeadSort; current: HeadSort; onSort(s: HeadSort): void; end?: boolean }): VNode {
  const h = SORT_HEADS[p.sort];
  const on = p.sort === p.current;
  return (
    <span
      class={'wc-lk-th is-sort wc-cy-th' + (p.end ? ' is-end' : '') + (on ? ' is-cur' : '')}
      role="columnheader"
      data-sort={p.sort}
      data-dir={on ? '-1' : undefined}
      aria-sort={on ? 'descending' : 'none'}
      aria-keyshortcuts={h.letter.toUpperCase()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        p.onSort(p.sort);
      }}
    >
      <KeyLabel text={h.label} letter={h.letter} />
    </span>
  );
}

/** The loading, failed and empty states of a list of runs. */
function ListWait(p: { state: ListState; empty: VNode; onRetry(): void }): VNode {
  const s = p.state;
  if (s.k === 'loading') {
    return (
      <div class="wc-cy-wait">
        <LoadBar class="wc-cy-load" done={2} total={5} line="Loading the Community…" />
      </div>
    );
  }
  if (s.k === 'failed') {
    return (
      <div class="wc-cy-wait" data-state={s.offline ? 'offline' : 'failed'}>
        <p class="wc-lk-q">{s.offline ? 'Offline: the Community could not be loaded.' : 'The Community could not be loaded.'}</p>
        <p class="wc-lk-qn">{s.offline ? 'Try again when you are online.' : 'Try again in a moment.'}</p>
        <GlassButton id="RETRY" label="Try again" letter="t" primary onClick={p.onRetry} />
      </div>
    );
  }
  return (
    <div class="wc-cy-wait" data-state="empty">
      {p.empty}
    </div>
  );
}

function RunList(p: RunListProps): VNode {
  const s = p.state;
  const rowsRef = useRef<HTMLDivElement>(null);
  // The cursor's row stays in view (the rows scroll inside the list).
  useEffect(() => {
    if (p.cursor < 0) return;
    rowsRef.current?.querySelectorAll<HTMLElement>('.wc-cy-row')[p.cursor]?.scrollIntoView?.({ block: 'nearest' });
  }, [p.cursor, p.rows]);
  useEffect(() => {
    rowsRef.current?.scrollTo?.({ top: 0 });
  }, [p.page, p.sort, p.by, p.q]);
  const total = s.k === 'ok' ? s.page.total : 0;
  const bar =
    p.by !== null ? (
      <div class="wc-cy-by">
        <span class="wc-cy-by-t">
          Logs by <b>{p.by}</b>
        </span>
        <GlassButton id="ALL-RUNS" label="All logs" icon="back" small onClick={p.onLeaveBy} />
      </div>
    ) : p.tooLong ? (
      <div class="wc-cy-by is-search" data-state="too-long">
        <span class="wc-cy-q">{SEARCH_TOO_LONG}</span>
        <GlassButton id="CLEAR" icon="close" title="Clear the search" small onClick={p.onClearSearch} />
      </div>
    ) : p.q !== null ? (
      <div class="wc-cy-by is-search">
        <span class="wc-cy-q">{s.k === 'ok' ? searchLine(p.q, total) : `Search: “${p.q}”`}</span>
        <GlassButton id="CLEAR" icon="close" title="Clear the search" small onClick={p.onClearSearch} />
      </div>
    ) : null;
  let body: VNode | VNode[];
  if (s.k !== 'ok' || p.rows.length === 0) {
    body = (
      <ListWait
        state={s}
        onRetry={p.onRetry}
        empty={
          p.by !== null ? (
            <p class="wc-lk-q">No logs listed by {p.by}.</p>
          ) : p.q !== null ? (
            <>
              <p class="wc-lk-q">No logs found.</p>
              <p class="wc-lk-qn">The search looks in the titles, the characters and the senders.</p>
            </>
          ) : (
            <>
              <p class="wc-lk-q">Nothing in the Hall of Fame yet. A log needs five votes to enter.</p>
              <p class="wc-lk-qn">{p.guest ? 'Logs come here when players publish them.' : 'Be the first: in History, Share a session and choose Hall of Fame.'}</p>
            </>
          )
        }
      />
    );
  } else {
    body = p.rows.map((r, i) => <RunRow key={r.id} r={r} rank={p.sort === 'top' ? (p.page - 1) * GALLERY_PAGE_SIZE + i + 1 : null} cur={i === p.cursor} narrow={p.narrow} mine={!!p.me && r.sender.toLowerCase() === p.me.toLowerCase()} onBy={p.onBy} />);
  }
  const pager =
    s.k === 'ok' && p.rows.length > 0 ? (
      <div class="wc-cy-pager">
        <GlassButton id="PREV" icon="prev" title="Previous page" small disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} />
        <span class="wc-cy-paget">{pagerText(p.page, p.pages)}</span>
        <GlassButton id="NEXT" icon="next" title="Next page" small disabled={p.page >= p.pages} onClick={() => p.onPage(p.page + 1)} />
      </div>
    ) : null;
  return (
    <section class={'wc-cy-list' + (p.narrow ? ' is-narrow' : '')} aria-label="Logs" data-sort={p.sort} data-state={s.k === 'ok' ? (p.rows.length ? 'list' : 'empty') : s.k}>
      {bar}
      <div class={'wc-lk-tbl wc-cy-tbl' + (p.narrow ? '' : ' is-scroll')} role="table">
        {!p.narrow && (
          <div class="wc-lk-throw wc-cy-throw" role="row">
            <span class="wc-lk-th" role="columnheader" aria-label="Rank" />
            <span class="wc-lk-th wc-cy-th-first" role="columnheader">
              <Head sort="new" current={p.sort} onSort={p.onSort} />
              {p.search}
            </span>
            <Head sort="top" current={p.sort} onSort={p.onSort} end />
            <Head sort="comments" current={p.sort} onSort={p.onSort} end />
            <Head sort="watched" current={p.sort} onSort={p.onSort} end />
          </div>
        )}
        <div class="wc-lk-tbody wc-cy-rows" role="rowgroup" ref={rowsRef}>
          {body}
        </div>
      </div>
      {pager}
    </section>
  );
}

/** The stars' cell: the five, the mean and the votes. */
function StarsCell(p: { r: GalleryRow }): VNode {
  const mean = meanText(p.r.stars);
  return (
    <>
      <Stars n={starsShown(p.r.stars)} />
      <span class="wc-cy-mean">
        {mean ?? '–'}
        <small> · {p.r.stars.count}</small>
      </span>
    </>
  );
}

/** A run: a press opens it, a press on the sender opens the sender's runs. */
function RunRow(p: { r: GalleryRow; rank: number | null; cur: boolean; narrow: boolean; mine: boolean; onBy(name: string): void }): VNode {
  const r = p.r;
  const sender = (
    <button
      type="button"
      class="wc-cy-sender"
      tabIndex={-1}
      title={`Logs by ${r.sender}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        p.onBy(r.sender);
      }}
    >
      {r.sender}
    </button>
  );
  const cls = 'wc-lk-tr wc-cy-row' + (p.cur ? ' is-cur is-on' : '') + (p.mine ? ' is-mine' : '');
  const open = (): void => openRun(r.id);
  const character = r.character ? <span class="wc-cy-char">({r.character})</span> : null;
  if (p.narrow) {
    return (
      <div class={cls} role="row" data-id={r.id} onClick={open}>
        <span class="wc-lk-td wc-cy-p1">
          {p.rank !== null && <span class="wc-cy-rank">{p.rank}</span>}
          <b class="wc-cy-name">{r.title}</b> {character}
        </span>
        <span class="wc-lk-td wc-cy-p2">
          {sender} · {lengthText(r.lengthS)} · {dateText(r.listedAt)}
        </span>
        <span class="wc-lk-td wc-cy-p3">
          <span class="wc-cy-stars">
            <StarsCell r={r} />
          </span>
          <span class="wc-cy-n" title="Comments">
            <Icon name="comment" class="wc-cy-ic" />
            {r.comments}
          </span>
          <span class="wc-cy-n" title="Views">
            {r.views} views
          </span>
        </span>
      </div>
    );
  }
  return (
    <div class={cls} role="row" data-id={r.id} onClick={open}>
      <span class="wc-lk-td wc-cy-rank">{p.rank ?? ''}</span>
      <span class="wc-lk-td wc-cy-title">
        <span class="wc-cy-l1">
          <b class="wc-cy-name">{r.title}</b> {character}
        </span>
        <span class="wc-cy-sub">
          {sender} · <span class="wc-cy-len">{lengthText(r.lengthS)}</span> · <span class="wc-cy-date">{dateText(r.listedAt)}</span>
        </span>
      </span>
      <span class="wc-lk-td is-end wc-cy-stars">
        <StarsCell r={r} />
      </span>
      <span class="wc-lk-td is-end wc-cy-num">
        <Icon name="comment" class="wc-cy-ic" />
        {r.comments}
      </span>
      <span class="wc-lk-td is-end wc-cy-num">{r.views}</span>
    </div>
  );
}

// ------------------------------------------------------------ the column and the boxes

/** "38 players online": a large free-standing figure (owner's feedback 7); nothing without a count. */
function Players(p: { n: number | undefined }): VNode | null {
  if (p.n === undefined) return null;
  return (
    <div class="wc-cy-players" data-box="players" aria-label={`${p.n} players online`}>
      <b class="wc-cy-players-n">{p.n}</b>
      <span class="wc-cy-players-l">players online</span>
    </div>
  );
}

function DayBox(p: { day: CommunityBoxes['today'] }): VNode | null {
  const day = p.day;
  if (!day) return null;
  return (
    <section class="wc-cy-box wc-cy-day" data-box="day">
      <h3 class="wc-cy-bh">Log of the day</h3>
      <button type="button" class="wc-cy-day-r" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => openRun(day.id)}>
        <b class="wc-cy-day-t">{day.title}</b>
        <span class="wc-cy-day-d">
          {day.character ? `${day.character} · ` : ''}
          {day.sender} · {dateText(day.listedAt)}
        </span>
        {day.description && <span class="wc-cy-day-x">{day.description}</span>}
      </button>
    </section>
  );
}

function WarBox(p: { mume: CommunityBoxes['mume'] }): VNode | null {
  const mume = p.mume;
  if (!mume || (mume.west.length === 0 && mume.dark.length === 0)) return null;
  return (
    <section class="wc-cy-box wc-cy-war" data-box="war">
      <h3 class="wc-cy-bh">Warlords</h3>
      <div class="wc-cy-war2">
        <WarSide title="White lords" cls="is-west" list={mume.west} />
        <WarSide title="Sauron’s minions" cls="is-dark" list={mume.dark} />
      </div>
    </section>
  );
}

function BoxColumn(p: { boxes: BoxesState }): VNode {
  const b = p.boxes;
  if (b === null) return <aside class="wc-cy-col is-loading" aria-busy="true" />;
  if (b === 'failed') return <aside class="wc-cy-col is-failed" />;
  return (
    <aside class="wc-cy-col" aria-label="Hall of Fame">
      <Players n={b.mume?.players} />
      <DayBox day={b.today} />
      {b.hallOfFame.length > 0 && (
        <section class="wc-cy-box wc-cy-hof" data-box="hof">
          <h3 class="wc-cy-bh">
            <Icon name="star" class="wc-cy-bic" />
            Hall of Fame<span class="wc-cy-bn">all time</span>
          </h3>
          <ol class="wc-cy-hofl">
            {b.hallOfFame.map((r) => (
              <li key={r.id}>
                <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => openRun(r.id)} title={`${runName(r)} · ${r.sender}`}>
                  <span class="wc-cy-hof-t">{r.title}</span>
                  <span class="wc-cy-hof-m">{meanText(r.stars) ?? '–'}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <WarBox mume={b.mume} />
    </aside>
  );
}

function WarSide(p: { title: string; cls: string; list: { name: string; race: string; class: string }[] }): VNode {
  return (
    <div class={'wc-cy-wars ' + p.cls}>
      <h4>{p.title}</h4>
      <ol>
        {p.list.slice(0, WARLORDS_SHOWN).map((w, i) => (
          <li key={i}>
            <b>{w.name}</b>
            <span>
              {w.race} {w.class}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------ the phone: the dashboard and the Hall of Fame

/** A newest run on the dashboard: "Title (Char)", sender · date, the mean; a tap opens it. */
function DashRow(p: { r: GalleryRow; mine: boolean }): VNode {
  const r = p.r;
  const mean = meanText(r.stars);
  return (
    <li class={'wc-cy-drow' + (p.mine ? ' is-mine' : '')} data-id={r.id}>
      <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => openRun(r.id)}>
        <span class="wc-cy-drow-t">
          <b class="wc-cy-name">{r.title}</b>
          {r.character && <span class="wc-cy-char"> ({r.character})</span>}
        </span>
        <span class="wc-cy-drow-d">
          <span class="wc-cy-drow-s">{r.sender}</span> · {dateText(r.listedAt)}
          {mean && <span class="wc-cy-drow-m">{mean}</span>}
        </span>
      </button>
    </li>
  );
}

interface DashProps {
  state: ListState;
  rows: GalleryRow[];
  boxes: BoxesState;
  search: VNode;
  runes: VNode | null;
  me: string | null;
  guest: boolean;
  onAll(): void;
  onHall(): void;
  onRetry(): void;
}

/** The phone's first view (owner's feedback 8): everything at a glance, the list and the Hall of Fame a tap away. */
function Dashboard(p: DashProps): VNode {
  const b = p.boxes && p.boxes !== 'failed' ? p.boxes : null;
  const newest = p.rows.slice(0, DASH_RUNS);
  const hall = b !== null && b.hallOfFame.length > 0;
  return (
    <div class="wc-cy-dash">
      <div class="wc-cy-dtop">
        {p.search}
        <Players n={b?.mume?.players} />
      </div>
      <section class="wc-cy-box wc-cy-newest" data-box="newest" aria-label="Newest logs" data-state={p.state.k === 'ok' ? (newest.length ? 'list' : 'empty') : p.state.k}>
        <h3 class="wc-cy-bh">Newest logs</h3>
        {p.state.k === 'ok' && newest.length > 0 ? (
          <ul class="wc-cy-dlist">
            {newest.map((r) => (
              <DashRow key={r.id} r={r} mine={!!p.me && r.sender.toLowerCase() === p.me.toLowerCase()} />
            ))}
          </ul>
        ) : (
          <ListWait
            state={p.state}
            onRetry={p.onRetry}
            empty={
              <>
                <p class="wc-lk-q">Nothing in the Hall of Fame yet. A log needs five votes to enter.</p>
                <p class="wc-lk-qn">{p.guest ? 'Logs come here when players publish them.' : 'Be the first: in History, Share a session and choose Hall of Fame.'}</p>
              </>
            }
          />
        )}
        {(p.state.k === 'ok' && newest.length > 0) || hall ? (
          <div class="wc-cy-dbtns">
            {p.state.k === 'ok' && newest.length > 0 && <GlassButton id="ALL" label="All logs" icon="next" iconAfter keepIcon small onClick={p.onAll} />}
            {hall && <GlassButton id="HOF" label="Hall of Fame" icon="star" keepIcon small onClick={p.onHall} />}
          </div>
        ) : null}
      </section>
      {b && <DayBox day={b.today} />}
      {p.runes}
      {b && <WarBox mume={b.mume} />}
    </div>
  );
}

/** The phone's Hall of Fame sub-page: the best runs of all time, as the list's rows with their rank. */
function HallPage(p: { boxes: BoxesState; me: string | null; onBy(name: string): void }): VNode {
  const b = p.boxes;
  if (b === null) {
    return (
      <div class="wc-cy-wait">
        <LoadBar class="wc-cy-load" done={2} total={5} line="Loading the Hall of Fame…" />
      </div>
    );
  }
  if (b === 'failed' || b.hallOfFame.length === 0) {
    return (
      <div class="wc-cy-wait" data-state="empty">
        <p class="wc-lk-q">{b === 'failed' ? 'The Hall of Fame could not be loaded.' : 'Nothing in the Hall of Fame yet. A log needs five votes to enter.'}</p>
      </div>
    );
  }
  return (
    <section class="wc-cy-list is-narrow wc-cy-hofpage" data-box="hof" aria-label="Hall of Fame">
      <p class="wc-cy-hofnote">The best logs of all time, by their stars. A log needs five votes to enter.</p>
      <div class="wc-lk-tbl wc-cy-tbl" role="table">
        <div class="wc-lk-tbody wc-cy-rows" role="rowgroup">
          {b.hallOfFame.map((r, i) => (
            <RunRow key={r.id} r={r} rank={i + 1} cur={false} narrow mine={!!p.me && r.sender.toLowerCase() === p.me.toLowerCase()} onBy={p.onBy} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------ Random Runes

interface RunesProps {
  state: BoardState;
  api: CommunityApi;
  /** The account logged in (null: a guest). */
  me: string | null;
  /** Accounts are on (a guest can log in). */
  accounts: boolean;
  perDay: number;
  fieldRef: { current: HTMLTextAreaElement | null };
  postRef: { current: (() => void) | null };
  nav: Nav;
  onBoard(b: RunesBoard): void;
  /** The phone's dashboard: the latest this many notes until "All notes"; null: every note (the box's notes scroll). */
  latest: number | null;
}

function RunesBox(p: RunesProps): VNode {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [all, setAll] = useState(false);
  const board = p.state.k === 'ok' ? p.state.board : null;
  const notes = board?.notes ?? [];
  const left = Math.max(0, p.perDay - notesToday(notes, p.me));
  const full = limit || (p.me !== null && left <= 0);
  const n = [...text].length;

  const post = async (): Promise<void> => {
    const t = noteToSend(text);
    if (!t || busy || full || !board) return;
    setBusy(true);
    setError(null);
    const r = await p.api.writeNote(t);
    setBusy(false);
    if (r.ok) {
      setText('');
      // The board's cache has it a minute later: it goes in now.
      p.onBoard({ ...board, notes: [r.value, ...board.notes.filter((x) => x.id !== r.value.id)] });
      p.nav.flash('Your note is on the board.');
    } else {
      if (r.code === 'too_many') setLimit(true);
      setError(noteFailText(r.code));
    }
  };
  p.postRef.current = () => void post();

  // The field grows to show what is written while it is used (one line otherwise).
  useLayoutEffect(() => {
    const el = p.fieldRef.current;
    if (!el) return;
    el.style.height = '';
    if (focused || text) el.style.height = `${el.scrollHeight + 2}px`;
  }, [text, focused]);

  const remove = async (id: string): Promise<void> => {
    if (!board) return;
    const r = await p.api.removeNote(id);
    if (r.ok || r.code === 'not_found') {
      p.onBoard({ ...board, notes: board.notes.filter((x) => x.id !== id) });
      p.nav.flash('Your note is removed.');
    } else if (r.code === 'hidden') p.nav.flash(HIDDEN_TEXT, 'fail');
    else p.nav.flash(r.code === 'offline' || r.code === 'timeout' ? 'Offline: the note was not removed.' : 'The note could not be removed. Try again later.', 'fail');
  };
  const report = (note: Note): void => {
    p.nav.push(<ReportNoteFrame note={note} api={p.api} />, { overlay: true });
  };

  let foot: VNode | null = null;
  if (p.me === null) {
    foot = p.accounts ? (
      <div class="wc-cy-write is-guest">
        <span>Notes come from accounts.</span>
        <GlassButton id="LOGIN" label="Log in to write" icon="person" small onClick={() => openLogin(p.nav)} />
      </div>
    ) : null;
  } else if (board) {
    foot = (
      <div class={'wc-cy-write' + (focused || text ? ' is-open' : '')}>
        <TextArea
          id="note"
          label="Message"
          value={text}
          rows={1}
          maxLength={NOTE_MAX * 2}
          inputRef={(el) => {
            p.fieldRef.current = el;
          }}
          disabled={full || busy}
          placeholder={full ? NOTE_LIMIT_TEXT : 'Write a message…'}
          error={error}
          hint={focused || text ? <span class="wc-cy-count">{noteHint(n, NOTE_MAX, left)}</span> : undefined}
          enterSubmits
          onInput={(v) => {
            const clean = noteField(v, NOTE_MAX);
            setText(clean);
            if (clean !== v && p.fieldRef.current) p.fieldRef.current.value = clean;
            setError(null);
          }}
        />
        <GlassButton id="POST" label="Post" small primary={!!noteToSend(text) && !full} disabled={!noteToSend(text) || full || busy} onClick={() => void post()} />
      </div>
    );
  }

  return (
    <section class={'wc-cy-box wc-cy-runes' + (p.latest !== null ? ' is-dash' : '')} data-box="runes" aria-label="Random Runes">
      <h3 class="wc-cy-bh">
        Random Runes<span class="wc-cy-bn">the latest 50</span>
      </h3>
      {p.state.k === 'loading' ? (
        <p class="wc-cy-none">Loading…</p>
      ) : p.state.k === 'failed' ? (
        <p class="wc-cy-none">The board could not be loaded.</p>
      ) : notes.length === 0 ? (
        <p class="wc-cy-none">The board is empty. Say hello.</p>
      ) : (
        <ul class="wc-cy-notes">
          {(p.latest !== null && !all ? notes.slice(0, p.latest) : notes).map((note) => {
            const own = p.me !== null && note.writer.toLowerCase() === p.me.toLowerCase();
            return (
              <li
                key={note.id}
                class={'wc-cy-note' + (own ? ' is-own' : '') + (open === note.id ? ' is-open' : '')}
                data-id={note.id}
                onClick={() => setOpen((o) => (o === note.id ? null : note.id))}
              >
                <span class="wc-cy-note-t">
                  <b class="wc-cy-writer" data-hue={writerHue(note.writer)}>{note.writer}:</b> {note.text}
                </span>
                <time class="wc-cy-note-a">{noteAge(note.created)}</time>
                {p.me !== null && (
                  <span class="wc-cy-note-acts" onClick={(e) => e.stopPropagation()}>
                    {own ? (
                      <GlassButton id="REMOVE" label="Remove" icon="trash" small danger onClick={() => void remove(note.id)} />
                    ) : (
                      <GlassButton id="REPORT" label="Report" icon="flag" small onClick={() => report(note)} />
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {p.latest !== null && notes.length > p.latest && (
        <button type="button" class="wc-cy-more" data-btn="ALL-NOTES" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => setAll((a) => !a)}>
          {all ? 'Fewer notes' : `All ${notes.length} notes`}
        </button>
      )}
      <div
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
      >
        {foot}
      </div>
    </section>
  );
}

// ------------------------------------------------------------ Report (a note)

type ReportStep = 'form' | 'sending' | 'thanks' | 'already';

/** The stage 64 report dialog, for a note (src/watch/page.tsx `ReportFrame`'s steps and words). */
export const ReportNoteFrame = lookFrame(function ReportNoteFrame(p: { note: Note; api: CommunityApi }): VNode {
  const nav = useNav();
  const [step, setStep] = useState<ReportStep>('form');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const close = (): void => nav.pop();
  const send = async (): Promise<void> => {
    if (!reason || step === 'sending') return;
    setStep('sending');
    setError(null);
    const t = reportText(text);
    const r = await p.api.reportNote(p.note.id, reason, t || undefined);
    if (r.ok) setStep('thanks');
    else if (r.code === 'already_reported') setStep('already');
    else {
      setError(noteReportFailText(r.code, r.status ?? 0));
      setStep('form');
    }
  };
  useKeyLayer(
    (e, nk) => {
      if (inTextField(e.target) || (nk !== 'up' && nk !== 'down')) return false;
      const i = reason ? REASONS.findIndex((x) => x.id === reason) : -1;
      const to = nk === 'down' ? Math.min(REASONS.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      setReason(REASONS[to]!.id);
      return true;
    },
    step === 'form',
  );
  if (step === 'thanks') {
    return (
      <Dialog title="Report sent" dlg="report-thanks" width={460} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">Thank you.</p>
        <p class="wc-lk-qn">We look at every report. A note that breaks the rules is removed; one that many report is hidden until then.</p>
      </Dialog>
    );
  }
  if (step === 'already') {
    return (
      <Dialog title="Report this note" dlg="report-already" width={440} onCancel={close} buttons={[{ id: 'CLOSE', label: 'Close', letter: 'c', primary: true, run: close }]}>
        <p class="wc-lk-q">You have already reported this note.</p>
        <p class="wc-lk-qn">One report per note is enough; it is in the queue.</p>
      </Dialog>
    );
  }
  const n = [...text].length;
  return (
    <Dialog
      title="Report this note"
      dlg="report"
      width={500}
      onCancel={close}
      error={error}
      buttons={[
        { id: 'CANCEL', label: 'Cancel', letter: 'c', run: close },
        { id: 'SEND', label: 'Send report', letter: 's', primary: true, disabled: !reason || step === 'sending', run: () => void send() },
      ]}
    >
      <div class="wc-cy-report">
        <p class="wc-lk-qn wc-cy-left">
          What is wrong with this note by <b>{p.note.writer}</b>?
        </p>
        <p class="wc-cy-quote">{p.note.text}</p>
        <div class="wc-cy-reasons" role="radiogroup" aria-label="Reason">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              class={'wc-lk-check wc-cy-radio' + (reason === r.id ? ' is-on is-cur' : '')}
              aria-checked={reason === r.id ? 'true' : 'false'}
              data-reason={r.id}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setReason(r.id);
              }}
            >
              <span class="wc-lk-cbox" aria-hidden="true" />
              <span class="wc-lk-clabel">{r.label}</span>
            </button>
          ))}
        </div>
        <TextArea id="report-text" label="More (optional)" value={text} rows={3} maxLength={REPORT_MAX} onInput={setText} hint={<span class="wc-cy-count">{`${n} / ${REPORT_MAX}`}</span>} />
        <p class="wc-lk-qn wc-cy-left wc-cy-small">The writer is not told who reported.</p>
      </div>
    </Dialog>
  );
});
