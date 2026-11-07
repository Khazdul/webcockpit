// Key capture for a macro (Inv §5.6; stage 43a, ADR 0128): the kit's
// inline Dialog "Bind key" with a pulsing keycap of the page's own, and a
// key layer of its own over the dialog's, so every key reaches the capture
// first (the dialog would hold the plain ones). Esc cancels (a new macro
// is removed again), Enter is refused ("Enter sends the input line."),
// the browser's own keys are refused, anything else binds.

import type { VNode } from 'preact';
import { Dialog } from '../../chrome/kit/look';
import { useKeyLayer } from '../../chrome/kit/stack';
import { bindability, learnKeyLabel } from '../../script/keys';

/** A capture in progress. */
export interface Capture {
  id: number;
  /** Opened by a new macro: Esc removes the entry, a bind moves on to Commands. */
  auto: boolean;
  /** The key the macro had (`For the macro on F5.`). */
  on: string;
  error: string;
}

/** What a key does to a capture: nothing yet, an error to show, a key to bind, or a cancel. */
export type CaptureStep = { kind: 'wait' } | { kind: 'error'; error: string } | { kind: 'bind'; name: string } | { kind: 'cancel' };

const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'OS'];

/** The capture's answer to a key press (`bindability` gives the reasons: Enter, Esc, the browser's keys, unknown keys). */
export function captureStep(e: KeyboardEvent): CaptureStep {
  const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
  if (e.key === 'Escape' && plain && !e.shiftKey) return { kind: 'cancel' };
  if (MODIFIER_KEYS.includes(e.key)) return { kind: 'wait' };
  learnKeyLabel(e);
  if (e.getModifierState?.('AltGraph')) return { kind: 'error', error: 'AltGr keys type text.' };
  const b = bindability(e);
  if (!b.ok) return { kind: 'error', error: b.reason };
  return { kind: 'bind', name: b.name };
}

/** The "Bind key" dialog, drawn inside the editor; `onKey` gets every key first. */
export function BindDialog(p: { capture: Capture; onKey(e: KeyboardEvent): void; onCancel(): void }): VNode {
  return (
    <>
      <Dialog
        inline
        title="Bind key"
        dlg="bind"
        width={420}
        error={p.capture.error || null}
        buttons={[{ id: 'CANCEL', label: 'Cancel', run: p.onCancel }]}
        onCancel={p.onCancel}
      >
        <div class="wc-pe-keywait">
          <i aria-hidden="true" />
          Press the key to bind…
        </div>
        <p class="wc-lk-qn">{p.capture.auto || !p.capture.on ? 'For the new macro.' : `For the macro on ${p.capture.on}.`}</p>
      </Dialog>
      <CaptureLayer onKey={p.onKey} />
    </>
  );
}

/**
 * The capture's key layer. Mounted after the dialog, so it is activated
 * after the dialog's layer and runs before it (the most recent layer
 * first): the dialog never sees a key while a capture waits.
 */
function CaptureLayer(p: { onKey(e: KeyboardEvent): void }): null {
  useKeyLayer((e) => {
    p.onKey(e);
    return true;
  });
  return null;
}
