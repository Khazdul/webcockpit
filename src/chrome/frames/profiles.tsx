// The Profile list (Inv §3.4; stage 41e, ADR 0125): the first sub-page in
// the new look (src/chrome/kit/look.tsx), a lantern box under the smaller
// wordmark with Back at its top left. New, Rename and Delete open small
// look dialogs over it (profile-dialogs.tsx); Edit opens the profile
// editor. Import pushes the import
// page (stage 43c, import-page.tsx), which picks or takes dropped files
// and shows the receipt; after its OK the list highlights the new profile
// and flashes `Imported "x" from y.`.
//
//   [Back]                  ( Profiles )
//     NAME ▲                                               CHANGED
//     default  SELECTED                                    2 hours ago
//     scout          [Select] [Edit] [Rename] [Delete]     yesterday   ← highlighted
//     ranger                                               3 days ago
//                    [New] [Import] [Export]
//                          flash line
//
// The highlighted row (ADR 0125 addendum "Actions on the row") carries its
// own glass buttons: Select (not on the selected profile), Edit, Rename and
// Delete (both disabled on `default`); other rows show none. New, Import
// and Export belong to the page and sit at the foot (Export takes the
// highlighted profile).
//
// Keys. ↑ ↓ PgUp PgDn (10) Home End move the highlight from anywhere (on
// a row button the same button follows to the new row when it has it).
// Tab / Shift+Tab walk one ring: the row, its buttons, the page buttons,
// skipping disabled ones, and wrap; ← / → walk the same order and stop at
// the ends. Enter or Space presses the keyboard's button; on the row it
// selects the profile, or opens the editor on the profile that is already
// selected (stage 25: the first click selects, the second edits). Letters,
// marked in the labels: S E R D on the highlighted row, N I X anywhere.
// Esc or Back returns to the menu. The mouse highlights a row on a pointer
// move; a click or tap on a row that is not highlighted highlights it, on
// the highlighted row it does what Enter does. The name header sorts
// (A–Z / Z–A). Feedback goes to the flash line at the foot (~3 s).
//
// Names that differ only in case (`gibur`, `Gibur`) look alike in the
// display face's small caps: each of them gets its real spelling on a
// second line, in the plain mono face (ADR 0125 addendum).

import type { VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_PROFILE, type ProfileRecord, caseTwins, downloadProfile } from '../../profiles';
import { useServices, useSettings } from '../kit/hooks';
import { Box, GlassButton, type IconName, LookFlash, letterOf, lookFrame } from '../kit/look';
import { editProfile } from './profile-edit';
import { ImportFrame } from './import-page';
import { type ProfileDone, ProfileDeleteDialog, ProfileNameDialog } from './profile-dialogs';
import { useIsTop, useKeys, useNav } from '../kit/stack';
import './profiles.css';

/** The highlighted row's buttons. */
const ROW_BUTTONS = ['SELECT', 'EDIT', 'RENAME', 'DELETE'] as const;
/** The page's buttons, at the foot. */
const PAGE_BUTTONS = ['NEW', 'IMPORT', 'EXPORT'] as const;
type RowButton = (typeof ROW_BUTTONS)[number];
type PageButton = (typeof PAGE_BUTTONS)[number];
type ButtonId = RowButton | PageButton;
/** Where the keyboard is: the highlighted row itself, or one of the buttons. */
type Stop = 'ROW' | ButtonId;

interface ButtonDef {
  label: string;
  letter: string;
  icon: IconName;
  danger?: boolean;
}

const BUTTON_DEFS: Readonly<Record<ButtonId, ButtonDef>> = {
  SELECT: { label: 'Select', letter: 's', icon: 'check' },
  EDIT: { label: 'Edit', letter: 'e', icon: 'pencil' },
  RENAME: { label: 'Rename', letter: 'r', icon: 'rename' },
  DELETE: { label: 'Delete', letter: 'd', icon: 'trash', danger: true },
  NEW: { label: 'New', letter: 'n', icon: 'plus' },
  IMPORT: { label: 'Import', letter: 'i', icon: 'import' },
  EXPORT: { label: 'Export', letter: 'x', icon: 'export' },
};

const BY_LETTER = new Map<string, ButtonId>(
  (Object.keys(BUTTON_DEFS) as ButtonId[]).map((id) => [BUTTON_DEFS[id].letter, id]),
);

const isRowButton = (s: Stop): s is RowButton => (ROW_BUTTONS as readonly string[]).includes(s);

/** The buttons of a row: Select only when it is not the selected profile. */
const rowButtons = (selected: boolean): readonly RowButton[] => (selected ? ROW_BUTTONS.slice(1) : ROW_BUTTONS);

/** PgUp / PgDn in the list. */
const PAGE = 10;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", "3 weeks ago", "4 months ago", "2 years ago"; "" when unknown. */
export function timeAgo(ms: number, now: number = Date.now()): string {
  if (!(ms > 0)) return '';
  const d = Math.max(0, now - ms);
  const n = (v: number, unit: string): string => `${v} ${unit}${v === 1 ? '' : 's'} ago`;
  if (d < MIN) return 'just now';
  if (d < HOUR) return n(Math.floor(d / MIN), 'minute');
  if (d < DAY) return n(Math.floor(d / HOUR), 'hour');
  if (d < 2 * DAY) return 'yesterday';
  if (d < 14 * DAY) return n(Math.floor(d / DAY), 'day');
  if (d < 60 * DAY) return n(Math.floor(d / (7 * DAY)), 'week');
  if (d < 365 * DAY) return n(Math.floor(d / (30 * DAY)), 'month');
  return n(Math.floor(d / (365 * DAY)), 'year');
}

const fullDate = (ms: number): string => (ms > 0 ? `Changed ${new Date(ms).toLocaleString()}` : '');

export const ProfileFrame = lookFrame(function ProfileFrame(): VNode {
  const { profiles, settings, onProfileSaved } = useServices();
  const s = useSettings();
  const nav = useNav();
  const isTop = useIsTop();
  const [list, setList] = useState<ProfileRecord[] | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [cursorName, setCursorName] = useState<string>(s.profile);
  const [stop, setStop] = useState<Stop>('ROW');
  const listRef = useRef<HTMLUListElement>(null);
  /** Scroll the highlight into view after this move (keys, not the pointer: the list must not move under it). */
  const reveal = useRef(true);

  const reload = async (): Promise<void> => {
    try {
      setList(await profiles.list());
    } catch (e) {
      setList((l) => l ?? []);
      nav.flash(`Could not read profiles: ${errText(e)}`, 'fail');
    }
  };
  useEffect(() => {
    if (isTop) void reload();
  }, [isTop]);

  const all = list ?? [];
  const rows = dir > 0 ? all : [...all].reverse();
  /** Names alike but for case: their real spelling shows under them (Cinzel draws them alike). */
  const twins = caseTwins(all.map((r) => r.name));
  let cursor = rows.findIndex((r) => r.name === cursorName);
  if (cursor < 0) cursor = Math.max(0, rows.findIndex((r) => r.name === s.profile));
  const cur = rows[cursor];
  const curName = cur?.name ?? '';
  const curSelected = !!cur && cur.name === s.profile;

  const disabled = (b: ButtonId): boolean => {
    switch (b) {
      case 'NEW':
      case 'IMPORT':
        return false;
      case 'SELECT':
        return !cur || curSelected;
      case 'RENAME':
      case 'DELETE':
        return !cur || cur.name === DEFAULT_PROFILE;
      default:
        return !cur;
    }
  };

  // The keyboard's ring: the row, its enabled buttons, the enabled page buttons.
  const ring: Stop[] = [
    'ROW',
    ...(cur ? rowButtons(curSelected) : []).filter((b) => !disabled(b)),
    ...PAGE_BUTTONS.filter((b) => !disabled(b)),
  ];
  /** `stop` resolved against this row: a row button it lacks gives the row's first button, else the row. */
  const resolve = (st: Stop): Stop => {
    if (ring.includes(st)) return st;
    if (isRowButton(st)) return ring.find(isRowButton) ?? 'ROW';
    return 'ROW';
  };
  const at = resolve(stop);
  const atRow = at === 'ROW' || isRowButton(at);

  // The highlighted row stays in view in a long list (after a key, not under the pointer).
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.wc-pl-row.is-on');
    if (reveal.current && isTop && el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
    reveal.current = true;
  }, [cursor, rows.length, isTop]);

  const done: ProfileDone = (name, message) => {
    setCursorName(name);
    setStop('ROW');
    nav.flash(message);
  };
  /** Highlights row `i` (clamped); a row button stays on its button when the new row has it. */
  const moveTo = (i: number, byPointer = false): void => {
    const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
    if (!r) return;
    reveal.current = !byPointer;
    setCursorName(r.name);
    if (!isRowButton(at)) setStop('ROW');
  };

  const edit = (name: string): void => {
    void editProfile(nav, profiles, name, { isLive: () => false, onSaved: onProfileSaved });
  };

  /** Enter on the row, or a click on the highlighted row: select it, or edit it when it is the selected profile. */
  const pick = (r: ProfileRecord | undefined): void => {
    if (!r) return;
    if (r.name === s.profile) edit(r.name);
    else settings.update({ profile: r.name });
  };

  const exportCur = async (): Promise<void> => {
    if (!cur) return;
    try {
      const rec = await profiles.get(cur.name);
      if (!rec) throw new Error('not found');
      nav.flash(`Exported ${downloadProfile(rec.name, rec.text)}.`);
    } catch (e) {
      nav.flash(`Export failed: ${errText(e)}`, 'fail');
    }
  };

  const press = (b: ButtonId): void => {
    if (disabled(b)) return;
    switch (b) {
      case 'SELECT':
        // The row's Select goes; a keyboard on it moves on to Edit (`resolve`).
        if (cur) settings.update({ profile: cur.name });
        return;
      case 'NEW':
        return nav.push(<ProfileNameDialog mode="create" done={done} />, { overlay: true });
      case 'EDIT':
        if (cur) edit(cur.name);
        return;
      case 'RENAME':
        return nav.push(<ProfileNameDialog mode="rename" from={curName} done={done} />, { overlay: true });
      case 'DELETE': {
        // Afterwards the highlight goes to the row below (above at the end), in the order shown.
        const next = rows[cursor + 1]?.name ?? rows[cursor - 1]?.name;
        return nav.push(<ProfileDeleteDialog name={curName} next={next} done={done} />, { overlay: true });
      }
      case 'IMPORT':
        // The import page (stage 43c): one or more files (a foreign entry
        // file and the files it `#read`s, or Mudlet archives) through the
        // lazy import chunk (ADR 0073, ADR 0076), then the receipt.
        return nav.push(<ImportFrame done={done} />);
      case 'EXPORT':
        void exportCur();
        return;
    }
  };

  useKeys((e, nk) => {
    const l = letterOf(e);
    const id = l ? BY_LETTER.get(l) : undefined;
    if (id) {
      press(id);
      return true;
    }
    const i = ring.indexOf(at);
    switch (nk) {
      case 'tab':
      case 'backtab':
        setStop(ring[(i + (nk === 'tab' ? 1 : ring.length - 1)) % ring.length]!);
        return true;
      case 'left':
      case 'right':
        setStop(ring[Math.max(0, Math.min(ring.length - 1, i + (nk === 'left' ? -1 : 1)))]!);
        return true;
      case 'up':
        moveTo(cursor - 1);
        return true;
      case 'down':
        moveTo(cursor + 1);
        return true;
      case 'pgup':
        moveTo(cursor - PAGE);
        return true;
      case 'pgdn':
        moveTo(cursor + PAGE);
        return true;
      case 'home':
        moveTo(0);
        return true;
      case 'end':
        moveTo(rows.length - 1);
        return true;
      case 'activate':
        if (at === 'ROW') pick(cur);
        else press(at);
        return true;
    }
    return false;
  });

  const button = (b: ButtonId): VNode => {
    const d = BUTTON_DEFS[b];
    const off = disabled(b);
    let title: string | undefined;
    if (off && (b === 'RENAME' || b === 'DELETE') && cur?.name === DEFAULT_PROFILE)
      title = `The default profile cannot be ${b === 'RENAME' ? 'renamed' : 'deleted'}`;
    else if (b === 'EXPORT' && cur) title = `Export "${cur.name}" as a .tin file`;
    return (
      <GlassButton
        key={b}
        id={b}
        label={d.label}
        letter={d.letter}
        icon={d.icon}
        danger={d.danger}
        disabled={off}
        title={title}
        selected={at === b}
        onClick={() => {
          setStop(b);
          press(b);
        }}
      />
    );
  };

  const now = Date.now();
  const enterHint = curSelected ? 'Enter or click: edit' : 'Enter or click: select';
  return (
    <Box title="Profiles" onBack={() => nav.pop()} class="wc-pl" winClass="wc-pl-win">
      <div class="wc-pl-head">
        <button
          type="button"
          tabIndex={-1}
          class="wc-pl-sort"
          title="Sort by name"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setDir(dir > 0 ? -1 : 1)}
        >
          Name {dir > 0 ? '▲' : '▼'}
        </button>
        <span class="wc-pl-head-time">Changed</span>
      </div>
      <ul class={'wc-pl-list' + (atRow ? ' is-focus' : '')} ref={listRef} aria-label="Profiles">
        {rows.map((r, i) => {
          const on = i === cursor;
          const sel = r.name === s.profile;
          return (
            <li
              key={r.name}
              class={'wc-pl-row' + (on ? ' is-on' : '') + (sel ? ' is-selected' : '')}
              aria-current={on ? 'true' : undefined}
              data-name={r.name}
              title={on ? enterHint : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onPointerMove={(e) => {
                // On a move (not pointerenter, which fires when the page reappears under a resting pointer).
                if (e.pointerType !== 'touch' && !on) moveTo(i, true);
              }}
              onClick={(e) => {
                e.stopPropagation();
                setStop('ROW');
                if (on) pick(r);
                else moveTo(i, true);
              }}
            >
              <span class="wc-pl-name">
                <span class="wc-pl-n">{r.name}</span>
                {(sel || twins.has(r.name)) && (
                  <span class="wc-pl-sub">
                    {twins.has(r.name) && <span class="wc-pl-case">{r.name}</span>}
                    {sel && <small class="wc-pl-tag">Selected</small>}
                  </span>
                )}
              </span>
              {on && <span class="wc-pl-acts">{rowButtons(sel).map(button)}</span>}
              <span class="wc-pl-time" title={fullDate(r.modified)}>
                {timeAgo(r.modified, now)}
              </span>
            </li>
          );
        })}
        {list !== null && rows.length === 0 && <li class="wc-pl-empty">No profiles yet. New makes one.</li>}
      </ul>
      <div class="wc-lk-btns wc-pl-btns">{PAGE_BUTTONS.map(button)}</div>
      <LookFlash />
    </Box>
  );
});
