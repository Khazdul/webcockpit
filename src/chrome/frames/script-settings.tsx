// The Scripts page's setting tiles (stage 44a, ADR 0121 "Settings"; round 7
// C "Instrumentbrädan"): one tile per `@setting`, its name in small caps
// over the control, the label under it, and "default …" with a small lit
// diamond when the value is not the default. The controls:
//
//   boolean  the kit's Toggle (groove, riveted knob, On / Off)
//   number   ◂ [ 25 ] ▸ unit: the arrows step, a click on the value types
//   choice   the kit's Seg (one choice), then the unit
//   string   a text well: a click edits
//
// The page owns the values, the keys and the saving (scripts.tsx): a tile
// only draws and reports presses. Typing uses a real <input> that holds
// the focus while it is open (`.wc-scr-input`); Enter keeps and Esc
// cancels through the page's keys (the stack sees them first). A blur
// keeps the text too, so Esc is the only way to drop it.

import type { VNode } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import { ownFieldAttrs, pageKeyboard } from '../../core/own-keyboard';
import type { SettingDecl, SettingValue } from '../../scripts/header';
import { GlassButton, Seg, Toggle } from '../kit/look';
import { defaultText, valueText } from './scripts-model';

/** The setting being typed into: its text, and whether it starts selected. */
export interface SettingEdit {
  name: string;
  text: string;
  select: boolean;
}

export interface SettingTileProps {
  d: SettingDecl;
  value: SettingValue;
  /** The keyboard's tile (`.is-cur`). */
  cur: boolean;
  /** The text being typed into this tile, or null. */
  edit: SettingEdit | null;
  /** A press anywhere on the tile (the keyboard follows it). */
  onPress(): void;
  /** A flip or a pick: saved at once, no flash. */
  onValue(v: SettingValue): void;
  /** A number's arrows: a step down (-1) or up (1) from the shown value. */
  onStep(dir: -1 | 1): void;
  /** A click on a number's value or a string's well: typing starts. */
  onEdit(): void;
  /** The typed text changed. */
  onEditText(text: string): void;
  /** The input lost the focus while open (a tap elsewhere, the phone's keyboard gone): keep the text. */
  onEditEnd(): void;
}

const keepFocus = (e: MouseEvent): void => e.preventDefault();

/** The value being typed: an input that takes the focus when it appears and gives it back to the stack when it goes. */
function SettingInput(p: { edit: SettingEdit; kind: 'number' | 'string'; onInput(t: string): void; onBlur(): void }): VNode {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (p.edit.select) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    const host = el.closest('.wc-stack') as HTMLElement | null;
    return () => {
      const a = el.ownerDocument.activeElement;
      if (host && (a === el || a === el.ownerDocument.body)) host.focus({ preventScroll: true });
    };
  }, []);
  return (
    <input
      ref={ref}
      class={'wc-scr-input ' + (p.kind === 'number' ? 'wc-scr-val' : 'wc-scr-str')}
      value={p.edit.text}
      aria-label={p.edit.name}
      spellcheck={false}
      autocomplete="off"
      autocapitalize="off"
      {...(pageKeyboard() ? ownFieldAttrs(p.kind === 'number' ? 'digits' : undefined) : { inputMode: p.kind === 'number' ? 'decimal' : undefined })}
      onInput={(e) => p.onInput(e.currentTarget.value)}
      onBlur={p.onBlur}
    />
  );
}

/** The control of one setting. */
function Control(p: SettingTileProps): VNode {
  const { d, value: v } = p;
  const unit = d.unit ? <span class="wc-scr-unit">{d.unit}</span> : null;
  switch (d.type) {
    case 'boolean':
      return (
        <span class="wc-scr-ctl">
          <Toggle on={v === true} only="state" label={d.name} onChange={(on) => p.onValue(on)} />
        </span>
      );
    case 'number': {
      const n = typeof v === 'number' ? v : Number(d.default);
      const range = d.min !== undefined && d.max !== undefined ? ` (${valueText(d, d.min)}–${valueText(d, d.max)})` : '';
      return (
        <span class="wc-scr-ctl">
          <GlassButton icon="prev" title="Less" small disabled={d.min !== undefined && n <= d.min} onClick={() => p.onStep(-1)} />
          {p.edit ? (
            <SettingInput edit={p.edit} kind="number" onInput={p.onEditText} onBlur={p.onEditEnd} />
          ) : (
            <button type="button" class="wc-scr-val" tabIndex={-1} title={`Click to type a value${range}`} onMouseDown={keepFocus} onClick={p.onEdit}>
              {valueText(d, v)}
            </button>
          )}
          <GlassButton icon="next" title="More" small disabled={d.max !== undefined && n >= d.max} onClick={() => p.onStep(1)} />
          {unit}
        </span>
      );
    }
    case 'choice': {
      const opts = d.options ?? [];
      return (
        <span class="wc-scr-ctl">
          <Seg
            label={d.name}
            options={opts.map((o, i) => ({ value: String(i), label: valueText(d, o) }))}
            value={String(opts.indexOf(v))}
            onChange={(i) => p.onValue(opts[Number(i)]!)}
          />
          {unit}
        </span>
      );
    }
    default:
      return (
        <span class="wc-scr-ctl wc-scr-ctl-str">
          {p.edit ? (
            <SettingInput edit={p.edit} kind="string" onInput={p.onEditText} onBlur={p.onEditEnd} />
          ) : (
            <button type="button" class="wc-scr-str" tabIndex={-1} title="Click to edit" onMouseDown={keepFocus} onClick={p.onEdit}>
              {String(v)}
            </button>
          )}
        </span>
      );
  }
}

/** One setting as a tile. */
export function SettingTile(p: SettingTileProps): VNode {
  const changed = p.value !== p.d.default;
  return (
    <div class={'wc-scr-set' + (p.cur ? ' is-cur' : '')} data-set={p.d.name} data-pk={`set:${p.d.name}`} onPointerDown={() => p.onPress()}>
      <span class="wc-scr-k">
        {p.d.name}
        {changed && <i class="wc-scr-chg" title="Not the default" />}
      </span>
      <Control {...p} />
      {(p.d.label || changed) && (
        <span class="wc-scr-lab">
          {p.d.label}
          {changed && <span class="wc-scr-def">{defaultText(p.d)}</span>}
        </span>
      )}
    </div>
  );
}
