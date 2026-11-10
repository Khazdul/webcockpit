// The Comm, Timers and Group gear popups' content (stage 30 S6, ADR 0107):
// what Options → Panes → Communication, Timers and Group hold, as modern
// controls in the ghost look. The semantics are shared with those TUI
// pages (../pane-options-model.ts); every change goes to the settings
// store at once and the pane follows live (ADR 0010).
//
//   Comm                         Timers                                   Group
//   PUBLIC SHOWS                 LOOK                                     Show players     [toggle]
//   ■ Narrates         [toggle]  Style         Bars|Circles               NPC visibility   Off|Labeled|All
//   …  (ten channels)            Layout        Flow|Grid  · Grid columns  …
//   ───────────────              Group headers, Time text
//   PRIVATE CHATS                ENDING SOON   Signal, Warn at, Soonest first
//   Active in the last …         GROUPS        Shown  Colour  Layout (Default|Flow|Grid)
//
// - Comm: a channel row (its swatch in the channel colour, grey when off)
//   toggles on a click anywhere in it: the channels Public shows; then
//   "Show chats active in the last" (ADR 0134).
// - Timers (ADR 0122): the look (style, layout, grid columns, headers,
//   time text), ending soon (signal, warn at, soonest first) and a row per
//   group: shown, colour (ColorPicker; Auto shows the Timers pane's own
//   side) and its layout (Default follows the global one). No style switch
//   in the pane itself.
// - Group (ADR 0122): Show players (allies and other races), NPC
//   visibility, Away members (room name or dim only), the Fight card and
//   a colour per vital bar (ColorPicker; Auto shows the Group pane's own
//   side, dark or light).

import { Fragment, type VNode } from 'preact';
import { TIMER_GROUPS, TIMER_GROUP_LABELS } from '../../timers/entry';
import { useServices, useSettings } from '../kit/hooks';
import { autoColor } from '../../panes/palette';
import { paneShade } from '../../panes/shade';
import {
  AWAY_MODE_CHOICES,
  COMM_CHAT_WINDOW_CHOICES,
  NPC_MODE_CHOICES,
  TIMER_COLS_CHOICES,
  TIMER_GROUP_LAYOUT_CHOICES,
  TIMER_LAYOUT_CHOICES,
  TIMER_SIGNAL_CHOICES,
  TIMER_STYLE_CHOICES,
  TIMER_WARN_OPTIONS,
  VITAL_COLOR_ROWS,
  chatWindowOf,
  colsLabel,
  commChannelRows,
  patchTimerGroup,
  setChatWindow,
  setCommChannel,
  setGroup,
  setTimers,
  setVitalColor,
  warnAtOf,
} from '../pane-options-model';
import { ColorPicker } from './color-picker';
import { Dropdown, Row, Segmented, Toggle } from './controls';

/** A channel's swatch while it is off. */
const OFF_SWATCH = 'var(--sf-off)';

export function CommSettings(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const rows = commChannelRows(s.comm.filters);
  return (
    <div class="wc-sp-comm">
      <div class="wc-ck-sub">Public shows</div>
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
      <div class="wc-ck-sub">Private chats</div>
      <div class="wc-sp-cwin">
        <span class="wc-ck-l">Show chats active in the last</span>
        <Segmented
          label="Show chats active in the last"
          value={String(s.comm.chatWindow)}
          options={COMM_CHAT_WINDOW_CHOICES}
          onChange={(v) => setChatWindow(settings, chatWindowOf(v))}
        />
      </div>
    </div>
  );
}

export function TimersSettings(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const t = s.timers;
  // Auto stands for the Timers pane's own side (dark or light).
  const light = paneShade(s, 'timers').light;
  const grid = t.layout === 'grid' || TIMER_GROUPS.some((g) => t.groups[g].layout === 'grid');
  return (
    <div class="wc-sp-timers">
      <div class="wc-ck-sub">Look</div>
      <Row label="Style">
        <Segmented label="Style" value={t.style} options={TIMER_STYLE_CHOICES} onChange={(style) => setTimers(settings, { style })} />
      </Row>
      <Row label="Layout" help="Flow wraps by width; Grid lines up columns">
        <Segmented label="Layout" value={t.layout} options={TIMER_LAYOUT_CHOICES} onChange={(layout) => setTimers(settings, { layout })} />
      </Row>
      <Row label="Grid columns" dim={!grid}>
        <Dropdown
          label="Grid columns"
          class="wc-sp-tcols"
          value={t.cols}
          options={TIMER_COLS_CHOICES.map((c) => ({ value: c, label: colsLabel(c) }))}
          onChange={(cols) => setTimers(settings, { cols })}
        />
      </Row>
      <Row label="Group headers">
        <Toggle label="Group headers" on={t.headers} onChange={(headers) => setTimers(settings, { headers })} />
      </Row>
      <Row label="Time text" help="Off: bars and rings only">
        <Toggle label="Time text" on={t.timeText} onChange={(timeText) => setTimers(settings, { timeText })} />
      </Row>
      <div class="wc-ck-sep" />
      <div class="wc-ck-sub">Ending soon</div>
      <Row label="Signal" help="The timer keeps its colour">
        <Segmented label="Signal" value={t.signal} options={TIMER_SIGNAL_CHOICES} onChange={(signal) => setTimers(settings, { signal })} />
      </Row>
      <Row label="Warn at">
        <Segmented label="Warn at" value={String(t.warnAt)} options={TIMER_WARN_OPTIONS} onChange={(v) => setTimers(settings, { warnAt: warnAtOf(v) })} />
      </Row>
      <Row label="Soonest first">
        <Toggle label="Soonest first" on={t.soonestFirst} onChange={(soonestFirst) => setTimers(settings, { soonestFirst })} />
      </Row>
      <div class="wc-ck-sep" />
      <div class="wc-sp-tgrid" role="group" aria-label="Timer groups">
        <span class="wc-ck-sub">Groups</span>
        <span class="wc-ck-sub">Shown</span>
        <span class="wc-ck-sub">Colour</span>
        <span class="wc-ck-sub">Layout</span>
        {TIMER_GROUPS.map((g) => {
          const gs = t.groups[g];
          const name = TIMER_GROUP_LABELS[g];
          const dim = gs.enabled ? '' : ' is-dim';
          return (
            <Fragment key={g}>
              <span class={`wc-sp-tg-l${dim}`} data-group={g}>
                {name}
              </span>
              <span class="wc-sp-tg-c">
                <Toggle label={`Show ${name}`} on={gs.enabled} onChange={(enabled) => patchTimerGroup(settings, g, { enabled })} />
              </span>
              <span class={`wc-sp-tg-c${dim}`}>
                <ColorPicker
                  label={`${name} colour`}
                  value={gs.color}
                  auto={autoColor(g, light)}
                  onChange={(color) => patchTimerGroup(settings, g, { color })}
                />
              </span>
              <span class={`wc-sp-tg-c${dim}`}>
                <Segmented
                  label={`${name} layout`}
                  value={gs.layout}
                  options={TIMER_GROUP_LAYOUT_CHOICES}
                  onChange={(layout) => patchTimerGroup(settings, g, { layout })}
                />
              </span>
            </Fragment>
          );
        })}
      </div>
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
        <Toggle label="Show players" on={g.showPlayers} onChange={(showPlayers) => setGroup(settings, { showPlayers })} />
      </Row>
      <Row label="NPC visibility">
        <Segmented label="NPC visibility" value={g.npcMode} options={NPC_MODE_CHOICES} onChange={(npcMode) => setGroup(settings, { npcMode })} />
      </Row>
      <Row label="Away members" help="Players not in your room">
        <Segmented label="Away members" value={g.away} options={AWAY_MODE_CHOICES} onChange={(away) => setGroup(settings, { away })} />
      </Row>
      <Row label="Fight card" help="The tank against your opponent, on top while you fight">
        <Toggle label="Fight card" on={g.fight} onChange={(fight) => setGroup(settings, { fight })} />
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
