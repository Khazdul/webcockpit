// The lantern kit's overlays (stage 42, ADR 0127): dialogs, the keys box
// and popovers. Package 42c owns this file (and look-overlay.css).
//
// A dialog is a small Lykta box centred over the box or the window content
// below (not over the whole game), on a dim veil. It is an overlay frame
// (`nav.push(<MyDialog />, { overlay: true })`, the frame below stays drawn
// and inert) or `inline` inside a frame (a key layer). Keys: its letters,
// Enter = the primary button, Tab / ← → walk the buttons, Esc = onCancel
// (any other key too with `anyKeyCancels`).
//
// 42-0 stub: the API's names and props, rendered as plain elements; an
// overlay-frame dialog takes Enter (the primary) and Esc (onCancel)
// through the frame's keys. 42c builds the look, the layers and the walk.

import type { ComponentChildren, FunctionComponent, VNode } from 'preact';
import { GlassButton } from './look-controls';
import { lookFrame } from './look';
import { letterOf } from './look-keys';
import { type Nav, useKeyLayer, useKeys } from './stack';

export interface DialogButton {
  id: string;
  label: string;
  letter?: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  run(): void;
}

export interface DialogProps {
  title: string;
  /** `data-dlg` (tests). */
  dlg: string;
  buttons: DialogButton[];
  onCancel(): void;
  error?: string | null;
  anyKeyCancels?: boolean;
  /** Inside a frame (a key layer), not an overlay frame. */
  inline?: boolean;
  /** CSS px. */
  width?: number;
  children?: ComponentChildren;
}

function dialogKey(p: DialogProps, e: KeyboardEvent, nk: string | null): boolean {
  if (nk === 'back') {
    p.onCancel();
    return true;
  }
  const l = letterOf(e);
  const byLetter = l ? p.buttons.find((b) => b.letter === l && !b.disabled) : undefined;
  if (byLetter) {
    byLetter.run();
    return true;
  }
  if (nk === 'activate') {
    const prime = p.buttons.find((b) => b.primary && !b.disabled);
    prime?.run();
    return true;
  }
  if (p.anyKeyCancels && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    p.onCancel();
    return true;
  }
  return nk !== null;
}

/** A dialog: a small Lykta box with a title, its content and a row of buttons. 42-0 stub. */
export function Dialog(p: DialogProps): VNode {
  const key = (e: KeyboardEvent, nk: string | null): boolean => dialogKey(p, e, nk);
  useKeyLayer(key, !!p.inline);
  if (!p.inline) useKeys(key);
  return (
    <div class={'wc-lk-veil' + (p.inline ? ' is-inline' : '')}>
      <section
        class="wc-lk-dialog"
        data-dlg={p.dlg}
        role="dialog"
        aria-modal="true"
        aria-label={p.title}
        style={p.width ? { width: `${p.width}px` } : undefined}
      >
        <div class="wc-lk-dialog-t">{p.title}</div>
        <div class="wc-lk-dialog-b">{p.children}</div>
        {p.error && (
          <div class="wc-lk-dialog-err wc-lk-bad" role="alert">
            {p.error}
          </div>
        )}
        <div class="wc-lk-btns">
          {p.buttons.map((b) => (
            <GlassButton
              key={b.id}
              id={b.id}
              label={b.label}
              {...(b.letter ? { letter: b.letter } : {})}
              {...(b.primary ? { primary: true } : {})}
              {...(b.danger ? { danger: true } : {})}
              {...(b.disabled ? { disabled: true } : {})}
              onClick={() => b.run()}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export type KeyHelpRows = [keys: string, what: string][];

/** A two-column keys list (the content of a Dialog). 42-0 stub. */
export function KeyHelp(p: { rows: KeyHelpRows }): VNode {
  return (
    <dl class="wc-lk-keyhelp">
      {p.rows.map(([k, w]) => (
        <div key={k + w} class="wc-lk-kh-row">
          <dt class="wc-lk-mono">{k}</dt>
          <dd>{w}</dd>
        </div>
      ))}
    </dl>
  );
}

type KeyHelpFrameProps = { title: string; rows: KeyHelpRows; nav: Nav };

// Made on first use: look.tsx re-exports this module, so `lookFrame` is not
// ready while it is being evaluated.
let keyHelpFrame: FunctionComponent<KeyHelpFrameProps> | null = null;

function KeyHelpFrame(): FunctionComponent<KeyHelpFrameProps> {
  keyHelpFrame ??= lookFrame(function KeyHelpFrame(p: KeyHelpFrameProps): VNode {
    const close = (): void => p.nav.pop();
    return (
      <Dialog
        title={p.title}
        dlg="keys"
        buttons={[{ id: 'OK', label: 'OK', primary: true, run: close }]}
        onCancel={close}
        anyKeyCancels
      >
        <KeyHelp rows={p.rows} />
      </Dialog>
    );
  });
  return keyHelpFrame;
}

/** Opens the keys box as an overlay frame over the current one. */
export function openKeyHelp(nav: Nav, title: string, rows: KeyHelpRows): void {
  const Frame = KeyHelpFrame();
  nav.push(<Frame title={title} rows={rows} nav={nav} />, { overlay: true });
}

/**
 * A popover anchored to a button: Esc and a click outside close it. It
 * holds controls of its own (`data-wc-own-keys`). 42-0 stub: drawn in
 * place, closed by the page.
 */
export function Popover(p: {
  anchor: () => HTMLElement | null;
  onClose(): void;
  label: string;
  children?: ComponentChildren;
}): VNode {
  return (
    <div class="wc-lk-pop" role="dialog" aria-label={p.label} data-wc-own-keys="">
      {p.children}
    </div>
  );
}
