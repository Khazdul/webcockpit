// History's small boxes (Inv §7.4; stage 45 WP 45-C, ADR 0130): Rate,
// Delete, the run-log error box and the keys box, in the round 7 look
// (direction A "Tabell och kort", `hpages.js` rate / del and `hist.css`
// "dialogs over the page"). Each is a small Lykta box (the kit's `Dialog`)
// pushed as an overlay frame, so History stays drawn under a veil with its
// state (filter, sort, cursor, scroll) intact:
//
//   nav.push(<RateDialog session={s} done={reload} />, { overlay: true });
//
//            ┌─── ( Rate the session ) ───┐
//            │ Gibur · 2026-11-06 · 21:12 · 3h41m
//            │      ☆  ☆  ☆  ☆  ☆       │
//            │        Four stars        │
//            │     [ Save ] [ Cancel ]  │
//            └──────────────────────────┘
//
// Rate: 0–5, ← → (↑ ↓) adjust, a click sets (a click on the lit last star
// clears), hover peeks; Enter (Space, S) saves, also an unsaved session;
// Esc cancels. Delete: Y deletes every run of the chain, any other key (or
// a click on the veil) cancels; Delete / Cancel buttons for the mouse. The
// run-log error box: OK (Enter, Esc, click). The keys box: the kit's
// `KeyHelp` in two columns (any key closes it, as `openKeyHelp`'s).
//
// Flashes are today's (`Rated ★★★★.`, `Saved, no rating.`, `Session
// deleted.`, `Rating failed: …`, `Delete failed: …`); they land on the
// History page's flash after the box closes. One action at a time: once a
// box has started saving or deleting it holds every key and closes once.

import type { VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import type { Session } from '../../runs/stitch';
import { useServices } from '../kit/hooks';
import { Dialog, GlassButton, KeyHelp, type KeyHelpRows, lookFrame } from '../kit/look';
import { type Nav, useKeyLayer, useNav } from '../kit/stack';
import { fmtDate, fmtDur, fmtDurLong, fmtLongDate, fmtTime, stars } from './history-model';
import './history-dialogs.css';

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS'];
const plain = (e: KeyboardEvent): boolean => !e.ctrlKey && !e.altKey && !e.metaKey;

/** The session in one line: `Gibur · 2026-11-06 · 21:12 · 3h41m` (today's text). */
export const sessionLine = (s: Session): string =>
  `${s.character} · ${fmtDate(s.startUs)} · ${fmtTime(s.startUs)} · ${fmtDur(s.endUs - s.startUs)}`;

const WORDS = ['No rating — the session is still saved', 'One star', 'Two stars', 'Three stars', 'Four stars', 'Five stars'];
/** The rating in words (the line under the stars). */
export const ratingWords = (n: number): string => WORDS[Math.max(0, Math.min(5, n))]!;

/**
 * Closes a box once: a box that has started its work (save, delete) or is
 * closing ignores every later key and click, so a quick second key never
 * pops the page under it.
 */
function useOnce(): { busy: () => boolean; claim: () => boolean } {
  const done = useRef(false);
  return {
    busy: () => done.current,
    claim: () => {
      if (done.current) return false;
      done.current = true;
      return true;
    },
  };
}

// ------------------------------------------------------------------ rate

/** The star's drawing (the mockup's, 24 × 24): an outline, filled when lit. */
const STAR_PATH = 'M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95z';

/** Rate the session (Inv §7.4): 0–5, ← →, a click; Enter saves (also an unsaved chain); Esc cancels. */
export const RateDialog = lookFrame(function RateDialog(p: { session: Session; done: () => Promise<void> }): VNode {
  const { runs } = useServices();
  const nav = useNav();
  const s = p.session;
  const [rating, setRating] = useState(s.saved ? s.rating : 0);
  const [peek, setPeek] = useState(0);
  const once = useOnce();

  const set = (n: number): void => setRating(Math.max(0, Math.min(5, n)));
  const cancel = (): void => {
    if (once.claim()) nav.pop();
  };
  const commit = async (): Promise<void> => {
    if (!once.claim()) return;
    const r = rating;
    try {
      await (await runs()).save(s, r);
      await p.done();
      nav.pop();
      nav.flash(r > 0 ? `Rated ${stars(r)}.` : 'Saved, no rating.');
    } catch (e) {
      nav.pop();
      nav.flash(`Rating failed: ${errText(e)}`, 'fail');
    }
  };

  // Over the dialog's own keys: the rating keys (the dialog would walk its
  // buttons with ← →), and every key held once the save has started.
  useKeyLayer((e, nk) => {
    if (once.busy()) return true;
    if (!plain(e)) return false;
    if (/^[0-5]$/.test(e.key)) {
      set(Number(e.key));
      return true;
    }
    if (nk === 'left' || nk === 'down') {
      set(rating - 1);
      return true;
    }
    if (nk === 'right' || nk === 'up') {
      set(rating + 1);
      return true;
    }
    return false;
  });

  const shown = peek || rating;
  return (
    <Dialog
      title="Rate the session"
      dlg="rate"
      width={470}
      onCancel={cancel}
      buttons={[
        { id: 'SAVE', label: 'Save', letter: 's', primary: true, run: () => void commit() },
        { id: 'CANCEL', label: 'Cancel', run: cancel },
      ]}
    >
      <p class="wc-hd-line">{sessionLine(s)}</p>
      <div class="wc-hd-stars" role="radiogroup" aria-label="Rating" onPointerLeave={() => setPeek(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            tabIndex={-1}
            data-v={i}
            aria-checked={rating === i ? 'true' : 'false'}
            aria-label={`${i} star${i > 1 ? 's' : ''}`}
            class={(i <= rating ? 'is-lit' : '') + (peek > 0 && i <= peek ? ' is-peek' : '')}
            onMouseDown={(e) => e.preventDefault()}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setPeek(i);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!once.busy()) set(i === rating ? 0 : i);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
      <p class="wc-hd-val" aria-live="polite">
        {ratingWords(shown)}
      </p>
    </Dialog>
  );
});

// ---------------------------------------------------------------- delete

/** Delete session (Inv §7.4): Y deletes every run of the chain; any other key cancels. */
export const DeleteDialog = lookFrame(function DeleteDialog(p: { session: Session; done: () => Promise<void> }): VNode {
  const { runs } = useServices();
  const nav = useNav();
  const s = p.session;
  const once = useOnce();

  const cancel = (): void => {
    if (once.claim()) nav.pop();
  };
  const confirm = async (): Promise<void> => {
    if (!once.claim()) return;
    try {
      await (await runs()).remove(s);
      await p.done();
      nav.pop();
      nav.flash('Session deleted.');
    } catch (e) {
      nav.pop();
      nav.flash(`Delete failed: ${errText(e)}`, 'fail');
    }
  };

  // Today's rule, over the dialog's own keys (Enter would press a button):
  // Y deletes, any other key cancels; modifiers alone do nothing.
  useKeyLayer((e) => {
    if (once.busy() || MODIFIERS.includes(e.key)) return true;
    if ((e.key === 'y' || e.key === 'Y') && plain(e)) void confirm();
    else cancel();
    return true;
  });

  const n = s.runs.length;
  return (
    <Dialog
      title="Delete session"
      dlg="delete"
      width={470}
      anyKeyCancels
      onCancel={cancel}
      buttons={[
        { id: 'DELETE', label: 'Yes, delete', letter: 'y', danger: true, run: () => void confirm() },
        { id: 'CANCEL', label: 'Cancel', run: cancel },
      ]}
    >
      <dl class="wc-lk-kv wc-hd-kv">
        <dt>Character</dt>
        <dd>{s.character}</dd>
        <dt>Date</dt>
        <dd>{fmtLongDate(s.startUs)}</dd>
        <dt>Time</dt>
        <dd>{fmtTime(s.startUs)}</dd>
        <dt>Duration</dt>
        <dd>{fmtDurLong(s.endUs - s.startUs)}</dd>
        <dt>Runs</dt>
        <dd>{n}</dd>
        {s.saved && (
          <>
            <dt>Saved</dt>
            <dd class="wc-lk-gold">
              yes{s.rating > 0 ? ' — ' : ''}
              {s.rating > 0 && <span class="wc-hd-kstars">{stars(s.rating)}</span>}
            </dd>
          </>
        )}
      </dl>
      <p class="wc-hd-warn">This will permanently delete the session's logs and run data. This cannot be undone.</p>
    </Dialog>
  );
});

// ------------------------------------------------------------- run-log error

/** A run log that could not be opened: the reason, and what may still work. OK (Enter, Esc, click) closes. */
export const RunLogErrorDialog = lookFrame(function RunLogErrorDialog(p: { session: Session; error: string }): VNode {
  const nav = useNav();
  const once = useOnce();
  const close = (): void => {
    if (once.claim()) nav.pop();
  };
  return (
    <Dialog title="Run log" dlg="runlog-error" width={470} onCancel={close} buttons={[{ id: 'OK', label: 'OK', primary: true, run: close }]}>
      <p class="wc-lk-q">This run log could not be opened.</p>
      <p class="wc-hd-line wc-hd-who">{sessionLine(p.session)}</p>
      <p class="wc-hd-reason">{p.error}</p>
      <p class="wc-lk-qn">The run data may be damaged. Stats and Backup may still work.</p>
    </Dialog>
  );
});

// ------------------------------------------------------------------ keys

/** History's keys (the "?" box), in two columns: moving about, then the letters. No key-hint row on the page (owner decision 4). */
export const HISTORY_KEYS_MOVE: KeyHelpRows = [
  ['↑ ↓', 'Move'],
  ['PgUp PgDn', 'Ten rows'],
  ['Home End', 'First, last'],
  ['← →', 'Character'],
  ['Enter', 'Run log'],
  ['Tab', 'Buttons'],
  ['?', 'This list'],
  ['Esc', 'Back'],
];
export const HISTORY_KEYS_LETTERS: KeyHelpRows = [
  ['R', 'Run log'],
  ['T', 'Stats'],
  ['A', 'Rate'],
  ['S', 'Save'],
  ['X', 'Export'],
  ['D', 'Delete'],
  ['B', 'Backup'],
  ['O', 'Restore'],
];
export const HISTORY_KEYS: KeyHelpRows = [...HISTORY_KEYS_MOVE, ...HISTORY_KEYS_LETTERS];

/**
 * The keys box: the kit's `Dialog` and `KeyHelp` as `openKeyHelp` builds
 * them (`data-dlg="keys"`, any key closes it), with the list in two
 * columns side by side (one under the other on a narrow screen), so the
 * box stays low over the page.
 */
const HistoryKeysFrame = lookFrame(function HistoryKeysFrame(): VNode {
  const nav = useNav();
  const once = useOnce();
  const close = (): void => {
    if (once.claim()) nav.pop();
  };
  return (
    <Dialog title="Keys" dlg="keys" width={560} anyKeyCancels onCancel={close} buttons={[{ id: 'OK', label: 'OK', primary: true, run: close }]}>
      <div class="wc-hd-keys">
        <KeyHelp rows={HISTORY_KEYS_MOVE} />
        <KeyHelp rows={HISTORY_KEYS_LETTERS} />
      </div>
    </Dialog>
  );
});

/** Opens History's keys box (`data-dlg="keys"`): Esc, `?`, any other key or a click on the veil closes it. */
export function openHistoryKeys(nav: Nav): void {
  nav.push(<HistoryKeysFrame />, { overlay: true });
}

/** The "?" glass icon button at the right of History's head: opens the keys box. */
export function HistoryKeysButton(): VNode {
  const nav = useNav();
  return <GlassButton id="KEYS" icon="help" title="Keys (?)" small onClick={() => openHistoryKeys(nav)} />;
}
