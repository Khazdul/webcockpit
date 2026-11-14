// "Working…" (stage 60, spec §7.3): the calm state while the password's
// slow step runs. A slow even bar (the kit's `TimeBar`) and one sentence
// that says how long. WebCrypto reports no progress from PBKDF2, so the
// bar runs on the flow's own estimate (`onStep('deriving', { estimateMs })`,
// the last measured time on this device or a first guess); when the guess
// is short the bar waits near its end and the sentence carries the honesty.
//
// HOW TO USE IT (a page or a dialog with a flow):
//
//   const work = useWorking();
//   …
//   const signal = work.start();                       // shows it; an AbortSignal for the flow
//   const r = await handle.submit({ onStep: work.onStep, signal });
//   work.stop();
//   …
//   {work.on ? <Working work={work} what="new key" /> : <the buttons />}
//
// Cancel shows while the flow can still be cancelled (through `deriving`;
// from `sending` on nothing is cancelled, src/cloud/account/index.ts) and
// aborts the signal: the flow then answers `cancelled`, for which a page
// says nothing. `work.cancel()` is the same (Esc while working).
// The hook aborts and forgets on unmount, so a page that leaves stops its
// flow where it still can.
//
// While working, a page's own ways out (Back, Esc, a dialog's Cancel) are
// Cancel and nothing else: `work.orCancel(back)` is the handler to give
// them. From `sending` on Cancel does nothing, so the page stays until
// the flow has answered (stage 60 review: a page that left then lost the
// new account's recovery code). `work.sent()` is true once the request
// that changes something has left: with `lostAnswer(code)` it is the rule
// for "the change may have been made" (`doubtful`).

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { type FlowErrorCode, type FlowStep, type StepInfo, lostAnswer } from '../../../cloud/account';
import { device } from '../../../core/device';
import { TextLink, TimeBar } from '../../kit/look';
import { workingWords } from './words';

export interface WorkState {
  /** The Working… state is up. */
  on: boolean;
  step: FlowStep | null;
  estimateMs: number | null;
  inline: boolean;
  /** Counts the `deriving` steps (a second one: the inline derivation), so the bar starts again. */
  run: number;
}

export interface WorkHandle extends WorkState {
  /** Shows Working… and returns the signal to hand the flow. */
  start(): AbortSignal;
  /** The flow's `onStep`. */
  onStep(step: FlowStep, info: StepInfo): void;
  /** Hides it (the flow answered). */
  stop(): void;
  /** Cancels where the flow still can be (`canCancel`); nothing otherwise. */
  cancel(): void;
  canCancel: boolean;
  /** Working right now (read when called, not when drawn: a press in the same instant as the submit counts). */
  busy(): boolean;
  /** The flow reached `sending` in this run: its request may have changed something. */
  sent(): boolean;
  /** A way out of the page for Back and Esc: `back` when idle, Cancel while working. */
  orCancel(back: () => void): () => void;
  /** The flow ended with `code`: true when its change may have been made all the same (the request left, the answer did not come). */
  doubtful(code: FlowErrorCode): boolean;
}

const IDLE: WorkState = { on: false, step: null, estimateMs: null, inline: false, run: 0 };

export function useWorking(): WorkHandle {
  const [s, setS] = useState<WorkState>(IDLE);
  const abort = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const sent = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
      busy.current = false;
      abort.current?.abort();
      abort.current = null;
    },
    [],
  );
  const api = useRef({
    start(): AbortSignal {
      abort.current?.abort();
      const c = new AbortController();
      abort.current = c;
      busy.current = true;
      sent.current = false;
      setS({ ...IDLE, on: true });
      return c.signal;
    },
    onStep(step: FlowStep, info: StepInfo): void {
      if (step === 'sending') sent.current = true;
      if (!alive.current) return;
      setS((was) =>
        was.on
          ? {
              on: true,
              step,
              estimateMs: step === 'deriving' ? (info.estimateMs ?? was.estimateMs) : was.estimateMs,
              inline: step === 'deriving' ? info.inline === true : was.inline,
              run: step === 'deriving' ? was.run + 1 : was.run,
            }
          : was,
      );
    },
    stop(): void {
      abort.current = null;
      busy.current = false;
      if (alive.current) setS(IDLE);
    },
    cancel(): void {
      // From `sending` on nothing is cancelled (the flow would not hear it anyway).
      if (!sent.current) abort.current?.abort();
    },
    busy: (): boolean => busy.current,
    sent: (): boolean => sent.current,
    orCancel(back: () => void): () => void {
      return () => (busy.current ? api.cancel() : back());
    },
    doubtful: (code: FlowErrorCode): boolean => sent.current && lostAnswer(code),
  }).current;
  const canCancel = s.on && (s.step === null || s.step === 'checking' || s.step === 'deriving');
  return { ...s, ...api, canCancel };
}

/** A phone (not a tablet): the sentence says "this phone". */
function onPhone(): boolean {
  try {
    const d = device();
    return d.phone && !d.tablet;
  } catch {
    return false; // the device is not decided (tests)
  }
}

/** The Working… block: the word, the bar, the sentence, and Cancel while it can be cancelled. */
export function Working(p: { work: WorkHandle; what?: 'key' | 'new key'; class?: string }): VNode {
  const w = p.work;
  const late = w.step === 'sending' || w.step === 'saving';
  return (
    <div class={'wc-ac-work' + (p.class ? ' ' + p.class : '')} data-step={w.step ?? 'start'}>
      <div class="wc-ac-work-t">Working…</div>
      {w.estimateMs === null ? <div class="wc-lk-timebar is-idle" aria-hidden="true" /> : <TimeBar ms={w.estimateMs * 1.15} run={w.run} />}
      <div class="wc-ac-work-s" role="status">
        {late ? 'Almost done.' : workingWords({ what: p.what ?? 'key', phone: onPhone(), estimateMs: w.estimateMs, inline: w.inline })}
      </div>
      <div class="wc-ac-work-c">{w.canCancel && <TextLink id="cancel" label="Cancel" onClick={w.cancel} />}</div>
    </div>
  );
}
