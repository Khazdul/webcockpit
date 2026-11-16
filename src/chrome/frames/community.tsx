// The Community page (stage 65 C1, spec §7.8, ADR 0155; round 13's pick
// 1b with the owner's changes, pick 2 for Random Runes). C on the start
// menu (flag `gallery`), in the account pages' lazy chunk (account/
// index.tsx exports `openCommunity`; start-main.tsx loads it with
// `import()`): a chunk of its own split the kit and the account's state
// out of the start page's chunks (the entry's preload lists), as the
// share dialog's did (ADR 0154). The phone's tab strip uses History's
// classes (`wc-htab*`, history-tabs.css, loaded with the start page).
//
// Desktop and tablet (the list on the left, a column on the right):
//
//   [Back]                     ( Community )
//    TITLE (CHARACTER) · SENDER · LENGTH · LISTED ▾   STARS · VOTES  COM.  VIEWS │ RUN OF THE DAY
//    Gibur and the Witch-king's lieutenant (Gibur L41) ★★★★★ 4.8 · 23  11  412 │  the title, its line,
//    fenwick · 4 h 04 min · 14 Nov                                              │  the description
//    … ten runs a page                                    ‹ Page 1 of 3 ›     │ HALL OF FAME (8)
//   ┌ RANDOM RUNES ────────────────────────────────────────────────────────┐ │ WARLORDS
//   │ hollin: every note whole, wrapped                               2 min │ │  White lords · Sauron's minions
//   │ [ Write a note… ]                                              [Post] │ │  N players on MUME
//   └──────────────────────────────────────────────────────────────────────┘ │
//
// The list opens on New (newest listed first); a press on a heading sorts
// (Listed, Length, Stars, Com., Views), and so does its marked letter (L E
// S M V); the current sort is marked (▾). Ten runs a page; the pager sits
// at the list's bottom right; ← → (and PgUp PgDn) change page. ↑ ↓ Home End
// move the row cursor; Enter opens the run. A press on a sender's name
// opens "Runs by <name>" (the same list; R does it for the cursor's run);
// Back (Esc) leaves it for the whole list, and from the whole list goes to
// the menu.
//
// A run opens the watch page `<base>r/<id>?from=community` in this tab;
// the watch page's Back then goes to `<base>?community`, which opens this
// page again on the view it had (kept in sessionStorage, `VIEW_KEY`;
// community-model.ts, ADR 0155 "As built (stage 65 C1)").
//
// The phone (a narrow page): the tabs Runs · Hall of Fame · Runes (1 2 3).
// Runs shows New only, without sorting.
//
// Random Runes (flag `runes`; off, the board is gone): every note whole,
// wrapped, never a link. Logged in: the field grows to several lines while
// it is used, ≤ 250 characters with a count and the notes left today (5 a
// day); at the limit the field is off and says when it opens. One's own
// note in gold with Remove; Report on others' (the stage 64 report dialog,
// for a note). A guest reads, and "Log in to write" opens Log in. W puts
// the keyboard in the field; Enter posts; Esc leaves the field.
//
// Opening the page clears the menu's counter: "seen" is set to the newest
// listed time it showed (src/cloud/community/counter.ts).

import { type VNode } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CommunityBoxes, GalleryPage, GalleryRow, GallerySort, Note, ReportReason, RunesBoard } from '../../../shared/cloud/api.ts';
import { DEFAULT_ACCOUNT_LIMITS, GALLERY_PAGE_SIZE, NOTE_MAX } from '../../../shared/cloud/api.ts';
import { accountState, onAccountState } from '../../cloud/account/state';
import { type CommunityApi, communityAllowed, communityApi } from '../../cloud/community/api';
import { markCommunityPageSeen } from '../../cloud/community/counter';
import { cloudTest, config } from '../../cloud/config';
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
  type CommunityTab,
  type CommunityView,
  DEFAULT_SORT,
  NOTE_LIMIT_TEXT,
  SORT_HEADS,
  VIEW_KEY,
  characterText,
  dateText,
  lengthText,
  meanText,
  newestListed,
  noteAge,
  noteFailText,
  noteField,
  noteHint,
  noteReportFailText,
  notesToday,
  noteToSend,
  pagerText,
  pagesOf,
  parseView,
  runHref,
  sortOfKey,
  starsShown,
} from './community-model';

import './community.css';

/** Below this content width (px) the page takes the phone's form (the tabs). */
export const COMMUNITY_NARROW = 700;
/** The box stops at this width (the sky on both sides). */
const COMMUNITY_MAX_W = 1320;

const TABS: readonly { tab: CommunityTab; label: string; key: string }[] = [
  { tab: 'runs', label: 'Runs', key: '1' },
  { tab: 'hof', label: 'Hall of Fame', key: '2' },
  { tab: 'runes', label: 'Runes', key: '3' },
];

type ListState = { k: 'loading' } | { k: 'ok'; page: GalleryPage } | { k: 'failed'; offline: boolean };
type BoardState = { k: 'loading' } | { k: 'ok'; board: RunesBoard } | { k: 'off' } | { k: 'failed' };

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
  location.assign(runHref(id, base(), cloudTest()));
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

export const CommunityFrame = lookFrame(function CommunityFrame(p: { restore?: boolean }): VNode {
  const nav = useNav();
  const isTop = useIsTop();
  const api = useMemo<CommunityApi>(() => communityApi(), []);
  const [view, setView] = useState<CommunityView>(() => (p.restore ? readView() : { sort: DEFAULT_SORT, page: 1 }));
  const [list, setList] = useState<ListState>({ k: 'loading' });
  const [boxes, setBoxes] = useState<CommunityBoxes | null | 'failed'>(null);
  const [board, setBoard] = useState<BoardState>({ k: 'loading' });
  const [cursor, setCursor] = useState(0);
  /** The phone's form; null until the width is measured (the list waits for it: review fix CR7, no second request on a phone). */
  const [measured, setNarrow] = useState<boolean | null>(null);
  const narrow = measured === true;
  const [account, setAccount] = useState(accountState);
  const [notesPerDay, setNotesPerDay] = useState(DEFAULT_ACCOUNT_LIMITS.notesPerDay);
  const [retry, setRetry] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);
  /** Random Runes' Post (Enter in the field). */
  const postRef = useRef<(() => void) | null>(null);
  const seen = useRef<number | null>(null);
  const tab: CommunityTab = view.tab ?? 'runs';
  // The phone shows New only (no sorting).
  const sort: GallerySort = narrow ? 'new' : view.sort;

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

  // The list.
  const asked = useRef(0);
  useEffect(() => {
    if (measured === null) return;
    const n = ++asked.current;
    setList((l) => (l.k === 'ok' ? l : { k: 'loading' }));
    void api.list({ sort, page: view.page, ...(view.by ? { by: view.by } : {}) }).then((r) => {
      if (n !== asked.current) return;
      if (r.ok) {
        setList({ k: 'ok', page: r.value });
        setCursor((c) => Math.min(c, Math.max(0, r.value.rows.length - 1)));
      } else setList({ k: 'failed', offline: r.code === 'offline' || r.code === 'timeout' });
    });
  }, [api, sort, view.page, view.by, retry, measured === null]);

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

  const rows = listRows ?? [];
  const total = list.k === 'ok' ? list.page.total : 0;
  const pages = pagesOf(total, GALLERY_PAGE_SIZE);
  const goPage = (pg: number): void => {
    if (pg < 1 || pg > pages || pg === view.page) return;
    setCursor(0);
    setView((v) => ({ ...v, page: pg }));
  };
  const chooseSort = (s: GallerySort): void => {
    if (narrow) return;
    setCursor(0);
    setView((v) => ({ ...v, sort: s, page: 1 }));
  };
  const showBy = (name: string): void => {
    setCursor(0);
    setView((v) => ({ sort: DEFAULT_SORT, page: 1, by: name, ...(v.tab ? { tab: 'runs' as const } : {}) }));
  };
  const leaveBy = (): void => {
    setCursor(0);
    setView((v) => ({ sort: v.sort, page: 1, ...(v.tab ? { tab: v.tab } : {}) }));
  };
  const setTab = (t: CommunityTab): void => setView((v) => ({ ...v, tab: t }));
  const back = (): void => {
    if (view.by) leaveBy();
    else nav.pop();
  };

  useKeys((e, nk) => {
    if (inTextField(e.target)) {
      if (e.key === 'Enter' && !e.shiftKey && e.target === fieldRef.current) {
        postRef.current?.();
        return true;
      }
      return false;
    }
    if (nk === 'back') {
      if (view.by) {
        leaveBy();
        return true;
      }
      return false;
    }
    if (narrow && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const t = TABS.find((x) => x.key === e.key && (x.tab !== 'runes' || board.k !== 'off'));
      if (t) {
        setTab(t.tab);
        return true;
      }
    }
    const l = letterOf(e);
    if (l === 'w' && fieldRef.current && !fieldRef.current.disabled) {
      if (narrow && tab !== 'runes') setTab('runes');
      fieldRef.current.focus();
      return true;
    }
    if (l === 'r' && rows[cursor] && (!narrow || tab === 'runs')) {
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
    if (narrow && tab !== 'runs') return false;
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
        if (rows[cursor]) openRun(rows[cursor]!.id);
        return true;
    }
    return false;
  });

  const loggedIn = account.name !== null && account.enabled === true;
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
      me={account.name}
      guest={!loggedIn}
      onSort={chooseSort}
      onPage={goPage}
      onBy={showBy}
      onLeaveBy={leaveBy}
      onRetry={() => setRetry((n) => n + 1)}
    />
  );
  const runesPart =
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
        whole={narrow}
      />
    );
  const col = <BoxColumn boxes={boxes} />;

  if (narrow) {
    const shownTabs = TABS.filter((t) => t.tab !== 'runes' || board.k !== 'off');
    const at = shownTabs.some((t) => t.tab === tab) ? tab : 'runs';
    return (
      <Box title="Community" size="large" maxWidth={COMMUNITY_MAX_W} onBack={back} class="wc-cy is-narrow" winClass="wc-cy-win wc-htabs-win">
        <div class="wc-htabs wc-cy-tabs" role="tablist" aria-label="Community">
          {shownTabs.map((t) => (
            <button
              key={t.tab}
              type="button"
              role="tab"
              class={'wc-htab' + (t.tab === at ? ' is-on' : '')}
              aria-selected={t.tab === at ? 'true' : 'false'}
              aria-keyshortcuts={t.key}
              data-tab={t.tab}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setTab(t.tab);
              }}
            >
              <span class="wc-htab-k" aria-hidden="true">
                {t.key}
              </span>
              <span class="wc-htab-l">{t.label}</span>
            </button>
          ))}
        </div>
        <BoxBody class={'wc-cy-body is-narrow is-' + at} bodyRef={bodyRef} scroll={at !== 'runes'}>
          {at === 'runs' ? listPart : at === 'hof' ? col : runesPart}
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
          {runesPart}
        </div>
        {col}
      </BoxBody>
      <BoxFoot class="wc-cy-foot">
        <LookFlash class="wc-cy-flash" />
      </BoxFoot>
    </Box>
  );
});

// ------------------------------------------------------------ the list

interface RunListProps {
  state: ListState;
  rows: GalleryRow[];
  sort: GallerySort;
  page: number;
  pages: number;
  /** The row cursor (-1: none shown). */
  cursor: number;
  narrow: boolean;
  by: string | null;
  me: string | null;
  guest: boolean;
  onSort(s: GallerySort): void;
  onPage(p: number): void;
  onBy(name: string): void;
  onLeaveBy(): void;
  onRetry(): void;
}

/** A sortable heading (a press or its letter sorts; the current one is marked ▾). */
function Head(p: { sort: GallerySort; current: GallerySort; onSort(s: GallerySort): void; end?: boolean }): VNode {
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

function RunList(p: RunListProps): VNode {
  const s = p.state;
  const bySender = p.by !== null && (
    <div class="wc-cy-by">
      <span class="wc-cy-by-t">
        Runs by <b>{p.by}</b>
      </span>
      <GlassButton id="ALL-RUNS" label="All runs" icon="back" small onClick={p.onLeaveBy} />
    </div>
  );
  let body: VNode | VNode[];
  if (s.k === 'loading') {
    body = (
      <div class="wc-cy-wait">
        <LoadBar class="wc-cy-load" done={2} total={5} line="Loading the Community…" />
      </div>
    );
  } else if (s.k === 'failed') {
    body = (
      <div class="wc-cy-wait" data-state={s.offline ? 'offline' : 'failed'}>
        <p class="wc-lk-q">{s.offline ? 'Offline: the Community could not be loaded.' : 'The Community could not be loaded.'}</p>
        <p class="wc-lk-qn">{s.offline ? 'Try again when you are online.' : 'Try again in a moment.'}</p>
        <GlassButton id="RETRY" label="Try again" letter="t" primary onClick={p.onRetry} />
      </div>
    );
  } else if (p.rows.length === 0) {
    body = (
      <div class="wc-cy-wait" data-state="empty">
        {p.by !== null ? (
          <p class="wc-lk-q">No runs listed by {p.by}.</p>
        ) : (
          <>
            <p class="wc-lk-q">Nothing in the Hall of Fame yet.</p>
            <p class="wc-lk-qn">{p.guest ? 'Runs come here when players publish them.' : 'Be the first: in History, Share a session and choose Hall of Fame.'}</p>
          </>
        )}
      </div>
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
    <section class={'wc-cy-list' + (p.narrow ? ' is-narrow' : '')} aria-label="Runs" data-sort={p.sort} data-state={s.k === 'ok' ? (p.rows.length ? 'list' : 'empty') : s.k}>
      {bySender}
      <div class="wc-lk-tbl wc-cy-tbl" role="table">
        {!p.narrow && (
          <div class="wc-lk-throw wc-cy-throw" role="row">
            <span class="wc-lk-th" role="columnheader" aria-label="Rank" />
            <span class="wc-lk-th wc-cy-th-first" role="columnheader">
              <span class="wc-cy-th-words">Title (character) · Sender · </span>
              <Head sort="length" current={p.sort} onSort={p.onSort} /> · <Head sort="new" current={p.sort} onSort={p.onSort} />
            </span>
            <Head sort="top" current={p.sort} onSort={p.onSort} end />
            <Head sort="comments" current={p.sort} onSort={p.onSort} end />
            <Head sort="watched" current={p.sort} onSort={p.onSort} end />
          </div>
        )}
        <div class="wc-lk-tbody wc-cy-rows" role="rowgroup">
          {body}
        </div>
      </div>
      {pager}
    </section>
  );
}

/** A run: a press opens it, a press on the sender opens the sender's runs. */
function RunRow(p: { r: GalleryRow; rank: number | null; cur: boolean; narrow: boolean; mine: boolean; onBy(name: string): void }): VNode {
  const r = p.r;
  const mean = meanText(r.stars);
  const sender = (
    <button
      type="button"
      class="wc-cy-sender"
      tabIndex={-1}
      title={`Runs by ${r.sender}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        p.onBy(r.sender);
      }}
    >
      {r.sender}
    </button>
  );
  const stars = (
    <>
      <Stars n={starsShown(r.stars)} />
      <span class="wc-cy-mean">
        {mean ?? '–'}
        <small> · {r.stars.count}</small>
      </span>
    </>
  );
  const cls = 'wc-lk-tr wc-cy-row' + (p.cur ? ' is-cur is-on' : '') + (p.mine ? ' is-mine' : '');
  const open = (): void => openRun(r.id);
  if (p.narrow) {
    return (
      <div class={cls} role="row" data-id={r.id} onClick={open}>
        <span class="wc-lk-td wc-cy-p1">{r.title}</span>
        <span class="wc-lk-td wc-cy-p2">
          <span class="wc-cy-char">{characterText(r)}</span> · {sender} · {lengthText(r.lengthS)} · {dateText(r.listedAt)}
        </span>
        <span class="wc-lk-td wc-cy-p3">
          <span class="wc-cy-stars">{stars}</span>
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
          <b class="wc-cy-name">{r.title}</b> <span class="wc-cy-char">({characterText(r)})</span>
        </span>
        <span class="wc-cy-sub">
          {sender} · <span class="wc-cy-len">{lengthText(r.lengthS)}</span> · <span class="wc-cy-date">{dateText(r.listedAt)}</span>
        </span>
      </span>
      <span class="wc-lk-td is-end wc-cy-stars">{stars}</span>
      <span class="wc-lk-td is-end wc-cy-num">
        <Icon name="comment" class="wc-cy-ic" />
        {r.comments}
      </span>
      <span class="wc-lk-td is-end wc-cy-num">{r.views}</span>
    </div>
  );
}

// ------------------------------------------------------------ the column

function BoxColumn(p: { boxes: CommunityBoxes | null | 'failed' }): VNode {
  const b = p.boxes;
  if (b === null) return <aside class="wc-cy-col is-loading" aria-busy="true" />;
  if (b === 'failed') return <aside class="wc-cy-col is-failed" />;
  const day = b.today;
  const mume = b.mume;
  return (
    <aside class="wc-cy-col" aria-label="Hall of Fame">
      {day && (
        <section class="wc-cy-box wc-cy-day" data-box="day">
          <h3 class="wc-cy-bh">Run of the day</h3>
          <button type="button" class="wc-cy-day-r" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => openRun(day.id)}>
            <b class="wc-cy-day-t">{day.title}</b>
            <span class="wc-cy-day-d">
              {characterText(day)} · {day.sender} · {dateText(day.listedAt)}
            </span>
            {day.description && <span class="wc-cy-day-x">{day.description}</span>}
          </button>
        </section>
      )}
      {b.hallOfFame.length > 0 && (
        <section class="wc-cy-box wc-cy-hof" data-box="hof">
          <h3 class="wc-cy-bh">
            <Icon name="star" class="wc-cy-bic" />
            Hall of Fame<span class="wc-cy-bn">all time</span>
          </h3>
          <ol class="wc-cy-hofl">
            {b.hallOfFame.map((r) => (
              <li key={r.id}>
                <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => openRun(r.id)} title={`${r.title} (${characterText(r)}) · ${r.sender}`}>
                  <span class="wc-cy-hof-t">{r.title}</span>
                  <span class="wc-cy-hof-m">{meanText(r.stars) ?? '–'}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {mume && (mume.west.length > 0 || mume.dark.length > 0) && (
        <section class="wc-cy-box wc-cy-war" data-box="war">
          <h3 class="wc-cy-bh">Warlords</h3>
          <div class="wc-cy-war2">
            <WarSide title="White lords" cls="is-west" list={mume.west} />
            <WarSide title="Sauron’s minions" cls="is-dark" list={mume.dark} />
          </div>
          {mume.players !== undefined && <p class="wc-cy-players">{mume.players} players on MUME</p>}
        </section>
      )}
    </aside>
  );
}

function WarSide(p: { title: string; cls: string; list: { name: string; race: string; class: string }[] }): VNode {
  return (
    <div class={'wc-cy-wars ' + p.cls}>
      <h4>{p.title}</h4>
      <ol>
        {p.list.slice(0, 5).map((w, i) => (
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
  /** The phone's tab: the box fills it. */
  whole: boolean;
}

function RunesBox(p: RunesProps): VNode {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
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
          label="A note"
          value={text}
          rows={1}
          maxLength={NOTE_MAX * 2}
          inputRef={(el) => {
            p.fieldRef.current = el;
          }}
          disabled={full || busy}
          placeholder={full ? NOTE_LIMIT_TEXT : 'Write a note: everyone sees it with your name'}
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
    <section class={'wc-cy-box wc-cy-runes' + (p.whole ? ' is-whole' : '')} data-box="runes" aria-label="Random Runes">
      <h3 class="wc-cy-bh">
        Random Runes<span class="wc-cy-bn">the latest 50 · 30 days</span>
      </h3>
      {p.state.k === 'loading' ? (
        <p class="wc-cy-none">Loading…</p>
      ) : p.state.k === 'failed' ? (
        <p class="wc-cy-none">The board could not be loaded.</p>
      ) : notes.length === 0 ? (
        <p class="wc-cy-none">The board is empty. Say hello.</p>
      ) : (
        <ul class="wc-cy-notes">
          {notes.map((note) => {
            const own = p.me !== null && note.writer.toLowerCase() === p.me.toLowerCase();
            return (
              <li
                key={note.id}
                class={'wc-cy-note' + (own ? ' is-own' : '') + (open === note.id ? ' is-open' : '')}
                data-id={note.id}
                onClick={() => setOpen((o) => (o === note.id ? null : note.id))}
              >
                <span class="wc-cy-note-t">
                  <b>{note.writer}:</b> {note.text}
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
