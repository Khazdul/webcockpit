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
// - Group (ADR 0122): Show players (allies and other races), NPC
//   visibility, Away members (room name or dim only) and a colour per vital
//   bar (ColorPicker; Auto shows the Group pane's own side, dark or light).

import { Fragment, type VNode } from 'preact';
import { TIMER_COLOR_HEX, TIMER_COLOR_LABELS, TIMER_COLOR_ORDER, type TimerColor } from '../../settings';
import { TIMER_GROUPS, TIMER_GROUP_LABELS } from '../../timers/entry';
import { useServices, useSettings } from '../kit/hooks';
import { autoColor } from '../../panes/palette';
import { paneShade } from '../../panes/shade';
import {
  AWAY_MODE_CHOICES,
  NPC_MODE_CHOICES,
  VITAL_COLOR_ROWS,
  colorChoice,
  commChannelRows,
  patchTimerGroup,
  setCommChannel,
  setVitalColor,
  swatchOf,
} from '../pane-options-model';
import { ColorPicker } from './color-picker';
import { type DropdownOption, Dropdown, Row, Segmented, Toggle } from './controls';

/** A channel's swatch while it is off. */
const OFF_SWATCH = 'var(--sf-off)';

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

type ColorValue = TimerColor | 'off' | 'custom';

/**
 * The colour list (interim until stage 39c): Off, then the seven old
 * swatches; a colour that is none of them (Sanctuary on Auto, a custom
 * hex) shows as Custom.
 */
export const TIMER_COLOR_CHOICES: readonly DropdownOption<ColorValue>[] = [
  { value: 'off', label: 'Off', swatch: 'transparent' },
  ...TIMER_COLOR_ORDER.map((c) => ({ value: c, label: TIMER_COLOR_LABELS[c], swatch: TIMER_COLOR_HEX[c] })),
  { value: 'custom', label: 'Custom', swatch: 'transparent' },
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
                  value={off ? 'off' : (swatchOf(g, gs.color) ?? 'custom')}
                  options={TIMER_COLOR_CHOICES}
                  onChange={(v) => {
                    if (v === 'custom') return;
                    patchTimerGroup(settings, g, colorChoice(g, settings.get().timers.groups[g], v === 'off' ? null : v));
                  }}
                />
              </span>
            </Fragment>
          );
        })}
      </div>
      <div class="wc-ck-sep" />
      <Row label="Display headers">
        <Toggle label="Display headers" on={t.headers} onChange={(headers) => settings.update({ timers: { headers } })} />
      </Row>
      <Row label="Time text">
        <Toggle label="Time text" on={t.timeText} onChange={(timeText) => settings.update({ timers: { timeText } })} />
      </Row>
    </div>
  );
}

export function GroupSettings(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const g = s.group;
  // Auto stands for the Group pane's own side (dark or light).
  const light = paneShade(s, 'group').light;
  return (
    <div class="wc-sp-group">
      <Row label="Show players" help="Allies, and players of other races in your group">
        <Toggle label="Show players" on={g.showPlayers} onChange={(showPlayers) => settings.update({ group: { showPlayers } })} />
      </Row>
      <Row label="NPC visibility">
        <Segmented label="NPC visibility" value={g.npcMode} options={NPC_MODE_CHOICES} onChange={(npcMode) => settings.update({ group: { npcMode } })} />
      </Row>
      <Row label="Away members" help="Players not in your room">
        <Segmented label="Away members" value={g.away} options={AWAY_MODE_CHOICES} onChange={(away) => settings.update({ group: { away } })} />
      </Row>
      <div class="wc-ck-sep" />
      <div class="wc-ck-sub">Bar colours</div>
      {VITAL_COLOR_ROWS.map((r) => (
        <Row key={r.key} label={r.label}>
          <ColorPicker
            label={`${r.label} colour`}
            value={g.colors[r.key]}
            auto={autoColor(r.key, light)}
            onChange={(c) => setVitalColor(settings, r.key, c)}
          />
        </Row>
      ))}
    </div>
  );
}
