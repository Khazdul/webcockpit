// Exit session on the phone's game layout (stage 52): the confirmation, in
// the menu sheet's look. Before, the sheet's Exit session opened the ESC
// menu's old-look frame (`ExitConfirm`, src/chrome/frames/esc-main.tsx),
// which the old phone layout and the fallback still use.
//
// Same behaviour and choices as that frame (Inv §4.6, ADR 0018):
// - `Rate & save this run (optional)` with five stars when there is a run
//   to rate (the recording run, or the latest run of this tab), prefilled
//   with the chain's saved rating unless the player already touched it;
// - Exit (or Y) saves (`saveChain`: above 0 saves the chain with that
//   rating, 0 keeps an existing save) and exits; a failed save never stops
//   the exit; a second tap while the save runs does nothing;
// - Cancel (or Esc, a tap outside) goes back without exiting;
// - 0 to 5 and ←/→ rate from a physical keyboard (exit-model.ts).
//
// Rendered by `PhoneMenu` (menu-sheet.tsx) in its host: the scrim, the
// sheet's iron band, the hood, the frosted card and the sheet's buttons.
// Nothing takes the DOM focus (no keyboard).

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LiveRuns } from '../runs/live';
import { RATING_MAX, isExitKey, ratingFromKey, starLabel } from './exit-model';

/** Presses never move the DOM focus. */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

/** A five-pointed star, 24 × 24. */
const STAR = 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z';

export interface ExitSheetProps {
  /** The live run; absent: no rating row. */
  runs?: Pick<LiveRuns, 'anchor' | 'chain' | 'saveChain'> | undefined;
  /** Exit to the start page (the shell's `exitSession`). */
  exit(): void;
  /** Back without exiting. */
  cancel(): void;
  /** Where the menu hands the plain keys it swallows (Y, the rating keys). */
  keysRef: { current: ((e: KeyboardEvent) => void) | null };
}

export function ExitSheet(p: ExitSheetProps): VNode {
  // Fixed when the confirmation opens, as in the other two dialogs.
  const [rateable] = useState(() => !!p.runs && p.runs.anchor() !== null);
  const [rating, setRating] = useState(0);
  const touched = useRef(false);
  const busy = useRef(false);
  useEffect(() => {
    if (!rateable) return;
    let alive = true;
    void p.runs!.chain().then(
      (s) => {
        if (alive && !touched.current && s?.saved) setRating(s.rating);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  const set = (n: number): void => {
    touched.current = true;
    setRating(n);
  };
  const exit = async (): Promise<void> => {
    if (busy.current) return;
    busy.current = true;
    if (rateable) {
      try {
        await p.runs!.saveChain(rating);
      } catch {
        // Exiting matters more than the save.
      }
    }
    p.exit();
  };
  p.keysRef.current = (e) => {
    if (isExitKey(e)) {
      void exit();
      return;
    }
    const r = rateable ? ratingFromKey(e, rating) : null;
    if (r !== null) set(r);
  };
  const tap = (act: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    act();
  };
  return (
    <>
      <button type="button" class="wc-ph-scrim" tabIndex={-1} aria-label="Back" onMouseDown={keepFocus} onClick={p.cancel} />
      <div class="wc-ph-sheet wc-ph-exitsheet" role="alertdialog" aria-label="Exit session" aria-describedby="wc-ph-exit-warn">
        <div class="wc-ph-sheet-top" />
        <div class="wc-ph-sheet-body">
          <span class="wc-ph-hood">Exit session</span>
          <div class="wc-ph-card wc-ph-exit-card">
            <p class="wc-ph-exit-warn" id="wc-ph-exit-warn">
              Attention! This terminates the current session.
            </p>
            {rateable && (
              <div class="wc-ph-rate">
                <span class="wc-ph-rate-t">Rate &amp; save this run (optional)</span>
                <div class="wc-ph-stars" role="group" aria-label="Rating" data-rating={rating}>
                  {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      class={`wc-ph-star${n <= rating ? ' is-on' : ''}`}
                      data-star={n}
                      tabIndex={-1}
                      aria-label={starLabel(n)}
                      aria-pressed={n <= rating ? 'true' : 'false'}
                      onMouseDown={keepFocus}
                      onClick={tap(() => set(n))}
                    >
                      <svg class="wc-ph-ico" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={STAR} />
                      </svg>
                    </button>
                  ))}
                </div>
                {/* Always in the flow, so the stars do not jump when it comes and goes. */}
                <button
                  type="button"
                  class="wc-ph-rate-clear"
                  data-act="clear"
                  tabIndex={-1}
                  aria-label="Clear the rating"
                  aria-disabled={rating === 0 ? 'true' : undefined}
                  onMouseDown={keepFocus}
                  onClick={tap(() => rating > 0 && set(0))}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          <div class="wc-ph-foot">
            <button type="button" class="wc-ph-cancel" data-act="cancel" tabIndex={-1} onMouseDown={keepFocus} onClick={tap(p.cancel)}>
              Cancel
            </button>
            <button type="button" class="wc-ph-exit" data-act="exit" tabIndex={-1} onMouseDown={keepFocus} onClick={tap(() => void exit())}>
              Exit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
