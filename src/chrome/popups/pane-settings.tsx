// The Comm, Timers and Group gear popups' content (stage 30 S6, ADR 0107):
// what Options → Panes → Communication, Timers and Group hold, as modern
// controls in the ghost look. The semantics are shared with those TUI
// pages (../pane-options-model.ts); every change goes to the settings
// store at once and the pane follows live (ADR 0010).
//
//   Comm                         Timers                                  Group
//   CHANNELS                              COLOUR     COLS  CLOCK  BAR    Show players     [toggle]
//   ■ Narrates         [toggle]  Spells   [■ Blue ▾] ‹ 4 › [tg]  [tg]   NPC visibility   Off|Labeled|All
//   …  (ten channels)            …
//   ───────────────              Charmies [■ Cyan ▾] ‹ 1 ›
//   Show channel header [toggle] ───────────────
//                                Display headers  [toggle]
//                                Compact layout   [toggle]
//
// - Comm: a channel row (its swatch in the channel colour, grey when off)
//   toggles on a click anywhere in it. A change cancels the pane's solo
//   (the pane does that when the filters change from outside it).
// - Timers: the colour list has Off first; Off hides the group (its row
//   dims; its controls still work) and keeps its colour, as unchecking a
//   swatch on the TUI grid. Columns step within the group's range
//   (Charmies 1–2); Charmies have no Clock or Bar.

import { Fragment, type VNode } from 'preact';
import { TIMER_COLOR_HEX, TIMER_COLOR_LABELS, TIMER_COLOR_ORDER, TIMER_COLS_MIN, type TimerColor, timerColsMax } from '../../settings';
import { TIMER_GROUPS, TIMER_GROUP_LABELS } from '../../timers/entry';
import { useServices, useSettings } from '../kit/hooks';
import {
  NPC_MODE_CHOICES,
  colorChoice,
  commChannelRows,
  patchTimerGroup,
  setCommChannel,
  timerFlags,
} from '../pane-options-model';
import { type DropdownOption, Dropdown, Row, Segmented, Stepper, Toggle } from './controls';

/** A channel's swatch while it is off. */
const OFF_SWATCH = '#3a3a3a';

export function CommSettings(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const rows = commChannelRows(s.comm.filters);
  const header = (on: boolean): void => settings.update({ comm: { showHeader: on } });
  return (
    <div class="wc-sp-comm">
      <div class="wc-ck-sub">Channels</div>
      {rows.map((r) => (
        <div
          key={r.name}
          class={`wc-ck-row wc-sp-chan${r.on ? '' : ' is-off'}`}
          data-channel={r.name}
          onClick={() => setCommChannel(settings, r.name, !r.on)}
        >
          <span class="wc-ck-l">
            <span class="wc-ck-sw" style={{ background: r.on ? r.color : OFF_SWATCH }} />
            {r.label}
          </span>
          <span class="wc-ck-ctl">
            <Toggle label={r.label} on={r.on} onChange={(on) => setCommChannel(settings, r.name, on)} />
          </span>
        </div>
      ))}
      <div class="wc-ck-sep" />
      <div class="wc-ck-row wc-sp-chan" data-key="show-header" onClick={() => header(!s.comm.showHeader)}>
        <span class="wc-ck-l">Show channel header</span>
        <span class="wc-ck-ctl">
          <Toggle label="Show channel header" on={s.comm.showHeader} onChange={header} />
        </span>
      </div>
    </div>
  );
}

type ColorValue = TimerColor | 'off';

/** The colour list: Off, then the seven colours with their swatches. */
export const TIMER_COLOR_CHOICES: readonly DropdownOption<ColorValue>[] = [
  { value: 'off', label: 'Off', swatch: 'transparent' },
  ...TIMER_COLOR_ORDER.map((c) => ({ value: c, label: TIMER_COLOR_LABELS[c], swatch: TIMER_COLOR_HEX[c] })),
];

export function TimersSettings(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const t = s.timers;
  return (
    <div class="wc-sp-timers">
      <div class="wc-sp-tgrid" role="group" aria-label="Timer groups">
        <span />
        <span class="wc-ck-sub">Colour</span>
        <span class="wc-ck-sub">Cols</span>
        <span class="wc-ck-sub">Clock</span>
        <span class="wc-ck-sub">Bar</span>
        {TIMER_GROUPS.map((g) => {
          const gs = t.groups[g];
          const name = TIMER_GROUP_LABELS[g];
          const off = !gs.enabled;
          const dim = off ? ' is-dim' : '';
          return (
            <Fragment key={g}>
              <span class={`wc-sp-tg-l${dim}`} data-group={g}>
                {name}
              </span>
              <span class={`wc-sp-tg-c${dim}`}>
                <Dropdown
                  label={`${name} colour`}
                  class="wc-sp-tcolor"
                  value={off ? 'off' : gs.color}
                  options={TIMER_COLOR_CHOICES}
                  onChange={(v) => patchTimerGroup(settings, g, colorChoice(settings.get().timers.groups[g], v === 'off' ? null : v))}
                />
              </span>
              <span class={`wc-sp-tg-c${dim}`}>
                <Stepper
                  label={`${name} columns`}
                  value={gs.cols}
                  min={TIMER_COLS_MIN}
                  max={timerColsMax(g)}
                  onChange={(cols) => patchTimerGroup(settings, g, { cols })}
                />
              </span>
              {timerFlags(g) ? (
                <>
                  <span class={`wc-sp-tg-c${dim}`}>
                    <Toggle label={`${name} clock`} on={gs.clock} onChange={(clock) => patchTimerGroup(settings, g, { clock })} />
                  </span>
                  <span class={`wc-sp-tg-c${dim}`}>
                    <Toggle label={`${name} bar`} on={gs.bar} onChange={(bar) => patchTimerGroup(settings, g, { bar })} />
                  </span>
                </>
              ) : (
                <>
                  <span />
                  <span />
                </>
              )}
            </Fragment>
          );
        })}
      </div>
      <div class="wc-ck-sep" />
      <Row label="Display headers">
        <Toggle label="Display headers" on={t.headers} onChange={(headers) => settings.update({ timers: { headers } })} />
      </Row>
      <Row label="Compact layout">
        <Toggle label="Compact layout" on={t.compact} onChange={(compact) => settings.update({ timers: { compact } })} />
      </Row>
    </div>
  );
}

export function GroupSettings(): VNode {
  const { settings } = useServices();
  const g = useSettings().group;
  return (
    <div class="wc-sp-group">
      <Row label="Show players">
        <Toggle label="Show players" on={g.showPlayers} onChange={(showPlayers) => settings.update({ group: { showPlayers } })} />
      </Row>
      <Row label="NPC visibility">
        <Segmented label="NPC visibility" value={g.npcMode} options={NPC_MODE_CHOICES} onChange={(npcMode) => settings.update({ group: { npcMode } })} />
      </Row>
    </div>
  );
}
