// The phone's settings page (ADR 0136 §10): a small selection of the
// settings, laid out for a thumb. Everything else keeps its stored value
// and is edited on a computer.
//
// The page is data: `SETTINGS_GROUPS` lists the groups, each a list of rows
// of a few kinds (stepper, segmented, switch, pick from a list). A stage
// adds its group to the list when what it sets works (stage 51 rule 3: no
// row before its feature): Text (51b), Map lens (51c), Panes and Comm
// (51d); Compass and Connection (51f) follow.
//
// The Text group changes the same keys the desktop does (`appearance.size`,
// the background with its ink and palette, `appearance.font`). The theme
// and font helpers come through the phone kit (kit.ts), not by import.
//
// Controls: the segmented control and the switch are the look kit's (`Seg`,
// `Toggle`, src/chrome/kit/look-controls.tsx, handed in with the phone
// kit: kit.ts); the kit has no stepper, so
// `Stepper` here is two 44 px keys round the value (the menu sheet uses it
// too). Nothing takes the DOM focus: a tap never raises the keyboard.

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SettingsStore } from '../settings';
import { canVibrate } from './haptics';
import { canWakeLock } from './wake-lock';
import type { FontId, PhoneCompassSize, PhoneLensLevel, PhoneLensSize, PhoneUnread, Settings, SettingsPatch } from '../settings/types';
import { moveEntry, setEntry } from './strip-model';
import { phoneControls, phoneKit } from './kit';
import { PHONE_THEMES, type PhoneTheme, stepSize, themeBg, themeOf } from './text-settings';

/** The font size limits, from the kit. */
const sizeLimits = (): { min: number; max: number } => ({ min: phoneKit().fontSizeMin, max: phoneKit().fontSizeMax });

type S = Readonly<Settings>;

/** A row of the page. `set` returns the settings patch of the new value. */
export type SettingsRow =
  | {
      kind: 'stepper';
      id: string;
      label: string;
      get(s: S): number;
      /** The value one step (−1 or +1) on. */
      step(value: number, d: number): number;
      /** The value is a text size: a step up must leave the game its least columns and rows (`fits`). */
      screen?: boolean;
      set(value: number, s: S): SettingsPatch;
      /** The keys' texts and names. */
      less: { text: string; label: string };
      more: { text: string; label: string };
    }
  | {
      kind: 'seg';
      id: string;
      label: string;
      options: readonly { value: string; label: string }[];
      /** The chosen option, or '' when the stored value is none of them. */
      get(s: S): string;
      set(value: string, s: S): SettingsPatch;
    }
  | {
      kind: 'toggle';
      id: string;
      label: string;
      get(s: S): boolean;
      set(on: boolean, s: S): SettingsPatch;
      /** False where the browser lacks what the row switches: the row is then absent, not dimmed. Absent: always there. */
      available?(): boolean;
    }
  | {
      /** A list whose items are switched on or off and moved up or down (one row each). */
      kind: 'order';
      id: string;
      /** What the list is, for the keys' names (`Move Timers up`). */
      label: string;
      items(s: S): { id: string; label: string; on: boolean }[];
      toggle(id: string, on: boolean, s: S): SettingsPatch;
      move(id: string, dir: -1 | 1, s: S): SettingsPatch;
    }
  | {
      /** A value picked from a list on a page of its own. */
      kind: 'pick';
      id: string;
      label: string;
      options(): { value: string; label: string }[];
      get(s: S): string;
      set(value: string, s: S): SettingsPatch;
    };

export interface SettingsGroup {
  id: string;
  title: string;
  rows: SettingsRow[];
  /** A line under the group's card. */
  caption?: string;
}

/** Text: size, theme, font (the desktop's Appearance keys). */
export const TEXT_GROUP: SettingsGroup = {
  id: 'text',
  title: 'Text',
  rows: [
    {
      kind: 'stepper',
      id: 'size',
      label: 'Text size',
      get: (s) => s.appearance.size,
      step: (size, d) => stepSize(size, d, sizeLimits()),
      screen: true,
      set: (size) => ({ appearance: { size } }),
      less: { text: 'A−', label: 'Smaller text' },
      more: { text: 'A+', label: 'Larger text' },
    },
    {
      kind: 'seg',
      id: 'theme',
      label: 'Theme',
      options: PHONE_THEMES,
      get: (s) => themeOf(s.appearance.bg) ?? '',
      set: (theme, s) => ({ appearance: phoneKit().backgroundPatch(s.appearance.bg, themeBg(theme as PhoneTheme)) }),
    },
    {
      kind: 'pick',
      id: 'font',
      label: 'Font',
      options: () =>
        phoneKit()
          .fontChoices()
          .map((id) => ({ value: id, label: phoneKit().fontLabel(id) })),
      // A stored font that is not installed here shows (and renders) as its stand-in (ADR 0049).
      get: (s) => phoneKit().effectiveFont(s.appearance.font),
      set: (font) => ({ appearance: { font: font as FontId } }),
    },
  ],
};

/** Map lens: show, size, the zoom it opens at (`phone.lens`, ADR 0136 §4, §13). */
export const LENS_GROUP: SettingsGroup = {
  id: 'lens',
  title: 'Map lens',
  rows: [
    {
      kind: 'toggle',
      id: 'lens-show',
      label: 'Show map',
      get: (s) => s.phone.lens.show,
      set: (show) => ({ phone: { lens: { show } } }),
    },
    {
      kind: 'seg',
      id: 'lens-size',
      label: 'Size',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
      get: (s) => s.phone.lens.size,
      set: (size) => ({ phone: { lens: { size: size as PhoneLensSize } } }),
    },
    {
      kind: 'seg',
      id: 'lens-opens',
      label: 'Opens at',
      options: [
        { value: 'near', label: 'Near' },
        { value: 'middle', label: 'Middle' },
        { value: 'far', label: 'Far' },
      ],
      get: (s) => s.phone.lens.opensAt,
      set: (opensAt) => ({ phone: { lens: { opensAt: opensAt as PhoneLensLevel } } }),
    },
  ],
};

/** The names of the strip's built-in panes (the panes' own labels). */
const STRIP_LABELS: Readonly<Record<string, string>> = { timers: 'Timers', group: 'Group', character: 'Character', statistics: 'Statistics' };

/** Panes: which built-in panes are pages of the strip, and their order (`phone.strip`, ADR 0136 §5, §13). */
export const PANES_GROUP: SettingsGroup = {
  id: 'panes',
  title: 'Panes',
  rows: [
    {
      kind: 'order',
      id: 'strip-panes',
      label: 'Panes',
      items: (s) => s.phone.strip.panes.map((e) => ({ id: e.id, label: STRIP_LABELS[e.id] ?? e.id, on: e.on })),
      toggle: (id, on, s) => ({ phone: { strip: { panes: setEntry(s.phone.strip.panes, id, on) } } }),
      move: (id, dir, s) => ({ phone: { strip: { panes: moveEntry(s.phone.strip.panes, id, dir) } } }),
    },
  ],
  caption: 'Swipe the strip to change pane',
};

/** Comm: what the Comm key counts, and NPCs in Public (`phone.unread`; `comm.npcs`, the desktop gear's switch). */
export const COMM_GROUP: SettingsGroup = {
  id: 'comm',
  title: 'Comm',
  rows: [
    {
      kind: 'seg',
      id: 'comm-unread',
      label: 'Count unread',
      options: [
        { value: 'private', label: 'Private' },
        { value: 'all', label: 'All' },
      ],
      get: (s) => s.phone.unread,
      set: (unread) => ({ phone: { unread: unread as PhoneUnread } }),
    },
    {
      kind: 'toggle',
      id: 'comm-npcs',
      label: 'Show NPCs in Public',
      get: (s) => s.comm.npcs,
      set: (npcs) => ({ comm: { npcs } }),
    },
  ],
};

/** Compass: the keys' size and the vibration on a tap (`phone.compassSize`, `phone.vibrate`; ADR 0136 §7). */
export const COMPASS_GROUP: SettingsGroup = {
  id: 'compass',
  title: 'Compass',
  rows: [
    {
      kind: 'seg',
      id: 'compass-size',
      label: 'Key size',
      options: [
        { value: 's', label: 'S' },
        { value: 'm', label: 'M' },
        { value: 'l', label: 'L' },
      ],
      get: (s) => s.phone.compassSize,
      set: (compassSize) => ({ phone: { compassSize: compassSize as PhoneCompassSize } }),
    },
    {
      kind: 'toggle',
      id: 'compass-vibrate',
      label: 'Vibrate on tap',
      get: (s) => s.phone.vibrate,
      set: (vibrate) => ({ phone: { vibrate } }),
      available: () => canVibrate(globalThis.navigator),
    },
  ],
};

/**
 * Connection: the screen kept on, the automatic reconnect, and the weather
 * effects (`phone.wakeLock`, `phone.autoReconnect`; `weather.enabled`, the
 * desktop's Options → Weather effects switch). ADR 0136 §10, §11.
 */
export const CONNECTION_GROUP: SettingsGroup = {
  id: 'connection',
  title: 'Connection',
  rows: [
    {
      kind: 'toggle',
      id: 'wake-lock',
      label: 'Keep screen on while connected',
      get: (s) => s.phone.wakeLock,
      set: (wakeLock) => ({ phone: { wakeLock } }),
      available: () => canWakeLock(globalThis.navigator),
    },
    {
      kind: 'toggle',
      id: 'auto-reconnect',
      label: 'Reconnect automatically',
      get: (s) => s.phone.autoReconnect,
      set: (autoReconnect) => ({ phone: { autoReconnect } }),
    },
    {
      kind: 'toggle',
      id: 'weather',
      label: 'Weather effects',
      get: (s) => s.weather.enabled,
      set: (enabled) => ({ weather: { enabled } }),
    },
  ],
  caption: 'Reconnects once when you come back to a lost link. MUME asks for your name and password as usual.',
};

/** The page's groups, top to bottom (ADR 0136 §10). */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [TEXT_GROUP, COMPASS_GROUP, LENS_GROUP, PANES_GROUP, COMM_GROUP, CONNECTION_GROUP];

/** The rows of a group that are there on this device. */
export function rowsShown(g: SettingsGroup): SettingsRow[] {
  return g.rows.filter((r) => r.kind !== 'toggle' || (r.available?.() ?? true));
}

// ------------------------------------------------------------------ pieces

/** Presses never move the DOM focus (no keyboard on a tap). */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

/** A 24 × 24 line icon in the mockups' style. */
export function PhIcon(p: { d: string; small?: boolean; class?: string; children?: ComponentChildren }): VNode {
  return (
    <svg class={`wc-ph-ico${p.small ? ' is-small' : ''}${p.class ? ` ${p.class}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={p.d} />
      {p.children}
    </svg>
  );
}

export const ICON_CHEVRON = 'M9 6l6 6-6 6';
export const ICON_BACK = 'M15 6l-6 6 6 6';
const ICON_CHECK = 'M5 12.5l4.5 4.5L19 7.5';
const ICON_UP = 'M6 15l6-6 6 6';
const ICON_DOWN = 'M6 9l6 6 6-6';

/** Two 44 px keys round a value. A key at its end is dimmed and does nothing. */
export function Stepper(p: {
  label: string;
  value: number;
  less: { text: string; label: string; on: boolean };
  more: { text: string; label: string; on: boolean };
  onStep(d: -1 | 1): void;
}): VNode {
  const key = (k: { text: string; label: string; on: boolean }, d: -1 | 1): VNode => (
    <button
      type="button"
      class={`wc-ph-step-key${d < 0 ? ' is-less' : ' is-more'}`}
      tabIndex={-1}
      aria-label={k.label}
      aria-disabled={k.on ? undefined : 'true'}
      onMouseDown={keepFocus}
      onClick={(e) => {
        e.stopPropagation();
        if (k.on) p.onStep(d);
      }}
    >
      {k.text}
    </button>
  );
  return (
    <div class="wc-ph-step" role="group" aria-label={p.label}>
      {key(p.less, -1)}
      <span class="wc-ph-step-val" aria-live="polite">
        {p.value}
      </span>
      {key(p.more, 1)}
    </div>
  );
}

function Row(p: {
  row: SettingsRow;
  s: S;
  update(patch: SettingsPatch): void;
  pick(row: SettingsRow): void;
  fits(size: number): boolean;
}): VNode {
  const { row, s } = p;
  const { Seg, Toggle } = phoneControls();
  switch (row.kind) {
    case 'stepper': {
      const v = row.get(s);
      return (
        <div class="wc-ph-srow" data-row={row.id}>
          <span class="wc-ph-srow-t">{row.label}</span>
          <Stepper
            label={row.label}
            value={v}
            less={{ ...row.less, on: row.step(v, -1) !== v }}
            more={{ ...row.more, on: row.step(v, 1) !== v && (!row.screen || p.fits(row.step(v, 1))) }}
            onStep={(d) => p.update(row.set(row.step(v, d), s))}
          />
        </div>
      );
    }
    case 'seg':
      return (
        <div class="wc-ph-srow" data-row={row.id}>
          <span class="wc-ph-srow-t">{row.label}</span>
          <Seg label={row.label} options={row.options.map((o) => ({ ...o }))} value={row.get(s)} onChange={(v) => p.update(row.set(v, s))} />
        </div>
      );
    case 'toggle':
      return (
        <div class="wc-ph-srow" data-row={row.id}>
          <span class="wc-ph-srow-t">{row.label}</span>
          <Toggle label={row.label} on={row.get(s)} only="switch" onChange={(on) => p.update(row.set(on, s))} />
        </div>
      );
    case 'order': {
      const items = row.items(s);
      const key = (id: string, name: string, dir: -1 | 1, on: boolean): VNode => (
        <button
          type="button"
          class="wc-ph-move"
          data-move={dir < 0 ? 'up' : 'down'}
          tabIndex={-1}
          aria-label={`Move ${name} ${dir < 0 ? 'up' : 'down'}`}
          aria-disabled={on ? undefined : 'true'}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            if (on) p.update(row.move(id, dir, s));
          }}
        >
          <PhIcon d={dir < 0 ? ICON_UP : ICON_DOWN} small />
        </button>
      );
      return (
        <>
          {items.map((it, i) => (
            <div key={it.id} class="wc-ph-srow is-order" data-row={row.id} data-item={it.id}>
              {key(it.id, it.label, -1, i > 0)}
              {key(it.id, it.label, 1, i < items.length - 1)}
              <span class="wc-ph-srow-t">{it.label}</span>
              <Toggle label={it.label} on={it.on} only="switch" onChange={(on) => p.update(row.toggle(it.id, on, s))} />
            </div>
          ))}
        </>
      );
    }
    case 'pick': {
      const cur = row.get(s);
      return (
        <button
          type="button"
          class="wc-ph-srow is-pick"
          data-row={row.id}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            p.pick(row);
          }}
        >
          <span class="wc-ph-srow-t">{row.label}</span>
          <span class="wc-ph-srow-v">{row.options().find((o) => o.value === cur)?.label ?? cur}</span>
          <PhIcon d={ICON_CHEVRON} small class="wc-ph-chev" />
        </button>
      );
    }
  }
}

/** The list a `pick` row opens: one option per row, the chosen one checked. */
function PickList(p: { row: Extract<SettingsRow, { kind: 'pick' }>; s: S; choose(value: string): void }): VNode {
  const cur = p.row.get(p.s);
  return (
    <section class="wc-ph-grp" data-pick={p.row.id}>
      <span class="wc-ph-grp-t">{p.row.label}</span>
      <div class="wc-ph-card" role="radiogroup" aria-label={p.row.label}>
        {p.row.options().map((o) => (
          <button
            key={o.value}
            type="button"
            class={`wc-ph-srow is-pick${o.value === cur ? ' is-on' : ''}`}
            role="radio"
            aria-checked={o.value === cur ? 'true' : 'false'}
            data-opt={o.value}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={(e) => {
              e.stopPropagation();
              p.choose(o.value);
            }}
          >
            <span class="wc-ph-srow-t">{o.label}</span>
            {o.value === cur && <PhIcon d={ICON_CHECK} small class="wc-ph-check" />}
          </button>
        ))}
      </div>
    </section>
  );
}

export interface SettingsPageProps {
  /** The live settings (the caller re-renders on a change). */
  s: S;
  settings: SettingsStore;
  groups?: readonly SettingsGroup[];
  /** Whether the game still fits the screen at a text size (a larger one is not offered otherwise). */
  fits?(size: number): boolean;
  /** The group to bring into view when the page opens (`#panes` opens at Panes). */
  focus?: string;
  /** Back: to the menu sheet, or to the game when the page was opened by a command. */
  onBack(): void;
  /** Tells the caller how Back is handled now: a pick list open takes it first. */
  backRef: { current: (() => boolean) | null };
}

/**
 * The settings page: an iron band with Back, the hood, and the groups in a
 * column that scrolls. A `pick` row swaps the column for its list; Back
 * (the key, Esc) returns from the list first.
 */
export function SettingsPage(p: SettingsPageProps): VNode {
  const [pick, setPick] = useState<Extract<SettingsRow, { kind: 'pick' }> | null>(null);
  const groups = p.groups ?? SETTINGS_GROUPS;
  const col = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!p.focus) return;
    col.current?.querySelector(`[data-group="${p.focus}"]`)?.scrollIntoView({ block: 'start' });
  }, [p.focus]);
  const update = (patch: SettingsPatch): void => p.settings.update(patch);
  // Esc and the back gesture ask here first.
  p.backRef.current = () => {
    if (!pick) return false;
    setPick(null);
    return true;
  };
  const back = (): void => {
    if (pick) setPick(null);
    else p.onBack();
  };
  return (
    <div class="wc-ph-page" role="dialog" aria-label="Settings" data-page={pick ? `pick:${pick.id}` : 'settings'}>
      <div class="wc-ph-band">
        <button
          type="button"
          class="wc-ph-back"
          tabIndex={-1}
          aria-label={pick ? 'Back to settings' : 'Back'}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            back();
          }}
        >
          <PhIcon d={ICON_BACK} />
        </button>
      </div>
      <div class="wc-ph-page-body">
        <span class="wc-ph-hood">Settings</span>
        <div class="wc-ph-col" ref={col}>
          {pick ? (
            <PickList
              row={pick}
              s={p.s}
              choose={(v) => {
                update(pick.set(v, p.s));
                setPick(null);
              }}
            />
          ) : (
            groups.map((g) => (
              <section key={g.id} class="wc-ph-grp" data-group={g.id}>
                <span class="wc-ph-grp-t">{g.title}</span>
                <div class="wc-ph-card">
                  {rowsShown(g).map((row) => (
                    <Row
                      key={row.id}
                      row={row}
                      s={p.s}
                      update={update}
                      pick={(r) => r.kind === 'pick' && setPick(r)}
                      fits={(size) => p.fits?.(size) ?? true}
                    />
                  ))}
                </div>
                {g.caption && <span class="wc-ph-cap">{g.caption}</span>}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
