// The kit gallery's "Controls" section (stage 42b, ADR 0127): every
// control and widget of look-controls.tsx in every state, and every icon,
// on a chosen surface: over the sky (the start page), in a dark window
// body or in a Paper window body (the tokens switched by `data-light`).
// Dev only (the gallery is not in a normal build).
//
// Keys (outside text fields): ← → walk the keyboard's button, ↑ ↓ the
// keyboard's option of the view switch, Enter presses the button (or
// picks the keyboard's option), S / W / P choose the surface, L / E / H
// the view. `?kit=controls&surface=paper` opens on a
// surface (screenshots).

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import {
  Check,
  Field,
  Fold,
  GlassButton,
  ICONS,
  Icon,
  type IconName,
  LookFlash,
  OrnRule,
  Plate,
  Rule,
  Seal,
  Seg,
  Select,
  Stars,
  Table,
  TableRow,
  Tabs,
  TextArea,
  TextLink,
  TimeBar,
  Toggle,
  Well,
  letterAction,
  useKeyboardInset,
  useLocalFlash,
} from '../look';
import { type KitSection, useKitKeys } from './kit';
import './controls.css';

type Surface = 'sky' | 'window' | 'paper';

const SURFACES = [
  { value: 'sky', label: 'Sky', letter: 's' },
  { value: 'window', label: 'Window', letter: 'w' },
  { value: 'paper', label: 'Paper', letter: 'p' },
];

function firstSurface(): Surface {
  try {
    const s = new URL(location.href).searchParams.get('surface');
    if (s === 'window' || s === 'paper') return s;
  } catch {
    // Not in a browser.
  }
  return 'sky';
}

const BUTTONS: { id: string; label?: string; letter?: string; icon?: IconName; title?: string; primary?: boolean; danger?: boolean; disabled?: boolean; small?: boolean; iconAfter?: boolean; keepIcon?: boolean }[] = [
  { id: 'RUN', label: 'Run log', letter: 'r', icon: 'play', primary: true },
  { id: 'NEW', label: 'New', letter: 'n', icon: 'plus' },
  { id: 'DELETE', label: 'Delete', letter: 'd', icon: 'trash', danger: true },
  { id: 'EXPORT', label: 'Export', letter: 'x', icon: 'export', disabled: true },
  { id: 'NEXT', label: 'Next', icon: 'next', iconAfter: true },
  { id: 'SAVE', label: 'Save', icon: 'save', keepIcon: true },
  { id: 'SMALL', label: 'Small', small: true },
  { id: 'FIND', icon: 'find', title: 'Find' },
  { id: 'CLOSE', icon: 'close', title: 'Close', small: true },
];

const PILLS = ['All', 'Gibur', 'Rasta', 'Taube', 'Morwen', 'Elendil', 'Haldir', 'Celeborn', 'Glorfindel'].map((n) => ({ value: n.toLowerCase(), label: n }));

const RUNS = [
  { id: 'r1', char: 'Gibur', date: '2026-11-06', dur: '1:34:07', exp: '12 400', stars: 4 },
  { id: 'r2', char: 'Rasta', date: '2026-11-05', dur: '0:42:10', exp: '3 100', stars: 2 },
  { id: 'r3', char: 'Taube', date: '2026-10-29', dur: '5:02:44', exp: '61 950', stars: 5 },
  { id: 'r4', char: 'Morwen', date: '2026-10-21', dur: '2:15:00', exp: '20 010', stars: 3 },
  { id: 'r5', char: 'Haldir', date: '2026-10-02', dur: '0:09:31', exp: '410', stars: 1 },
];

function Controls(): VNode {
  const [surface, setSurface] = useState<Surface>(firstSurface);
  const [flash, show] = useLocalFlash();
  const [sel, setSel] = useState(1);
  const [view, setView] = useState('lite');
  const [viewSel, setViewSel] = useState<number | undefined>(undefined);
  const [pill, setPill] = useState('all');
  const [chips, setChips] = useState<string[]>(['death', 'level']);
  const [tab, setTab] = useState('general');
  const [name, setName] = useState('Gibur');
  const [server, setServer] = useState('mume.org:4242');
  const [bad, setBad] = useState('gibur/');
  const [note, setNote] = useState('A short note about this run.');
  const [font, setFont] = useState('dejavu');
  const [secret, setSecret] = useState('a long password');
  const [barRun, setBarRun] = useState(0);
  const [autoLogin, setAutoLogin] = useState(true);
  const [record, setRecord] = useState(false);
  const [weather, setWeather] = useState(true);
  const [bold, setBold] = useState(false);
  const [row, setRow] = useState(0);
  const [run, setRun] = useState('r1');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'date', dir: -1 });
  const [folded, setFolded] = useState(false);
  const inset = useKeyboardInset();

  const views = [
    { value: 'lite', label: 'Lite', letter: 'l' },
    { value: 'editor', label: 'Editor', letter: 'e' },
    { value: 'help', label: 'Help', letter: 'h' },
    { value: 'off', label: 'Off', disabled: true },
  ];
  const press = (i: number): void => {
    const b = BUTTONS[i];
    if (b && !b.disabled) show(`${b.label ?? b.title} pressed.`);
  };
  const runs = [...RUNS].sort((a, b) => {
    const k = sort.key as keyof (typeof RUNS)[number];
    return String(a[k]).localeCompare(String(b[k])) * sort.dir;
  });

  useKitKeys((e, nk) => {
    if (nk === 'left' || nk === 'right') {
      setSel((s) => (s + (nk === 'right' ? 1 : -1) + BUTTONS.length) % BUTTONS.length);
      return true;
    }
    if (nk === 'up' || nk === 'down') {
      setViewSel((s) => ((s ?? 0) + (nk === 'down' ? 1 : -1) + views.length) % views.length);
      return true;
    }
    if (nk === 'activate' && !(e.target as HTMLElement | null)?.closest?.('input, textarea, select')) {
      if (viewSel !== undefined) {
        const v = views[viewSel];
        if (v && !v.disabled) setView(v.value);
        setViewSel(undefined);
      } else press(sel);
      return true;
    }
    return letterAction(e, {
      s: () => setSurface('sky'),
      w: () => setSurface('window'),
      p: () => setSurface('paper'),
      l: () => setView('lite'),
      e: () => setView('editor'),
      h: () => setView('help'),
    });
  });

  return (
    <div class="wc-kitc">
      <div class="wc-kitc-bar">
        <Seg label="Surface" options={SURFACES} value={surface} onChange={(v) => setSurface(v as Surface)} />
        <span class="wc-lk-faint wc-kitc-inset" data-inset={inset}>
          Soft keyboard: {inset} px
        </span>
      </div>
      <div
        class={'wc-kitc-surface' + (surface === 'sky' ? '' : ' wc-look is-win')}
        data-surface={surface}
        data-light={surface === 'paper' ? '' : undefined}
      >
        <div class="wc-kitc-grid">
          <section>
            <Rule title="Glass buttons" />
            <div class="wc-kitc-btns">
              {BUTTONS.map((b, i) => (
                <GlassButton key={b.id} {...b} selected={sel === i} onClick={() => press(i)} />
              ))}
            </div>
            <LookFlash flash={flash} class="wc-kitc-flash" />

            <Rule title="Segmented, pills, chips" />
            <div class="wc-kitc-stack">
              <Seg label="View" options={views} value={view} onChange={setView} {...(viewSel === undefined ? {} : { selected: viewSel })} />
              <div class="wc-kitc-narrow">
                <Seg label="Character" kind="pills" options={PILLS} value={pill} onChange={setPill} />
              </div>
              <Seg
                label="Kinds"
                multi
                kind="pills"
                options={[
                  { value: 'death', label: 'Deaths', icon: 'exclude' },
                  { value: 'pkill', label: 'Kills', icon: 'action' },
                  { value: 'achievement', label: 'Feats', icon: 'star' },
                  { value: 'level', label: 'Levels', icon: 'up' },
                ]}
                values={chips}
                onChange={(v, on) => setChips((c) => (on ? [...c, v] : c.filter((x) => x !== v)))}
              />
            </div>

            <Rule title="Tabs" />
            <Tabs
              label="Settings"
              tabs={[
                { value: 'general', label: 'General' },
                { value: 'connection', label: 'Connection' },
                { value: 'appearance', label: 'Appearance' },
                { value: 'panes', label: 'Panes', disabled: true },
              ]}
              value={tab}
              onChange={setTab}
            />

            <Rule title="List rows">
              <GlassButton small label="Next row" onClick={() => setRow((r) => (r + 1) % 3)} />
            </Rule>
            <ul class="wc-lk-rows">
              {['Gibur', 'Taube', 'Morwen'].map((n, i) => (
                <li key={n} class={'wc-lk-row' + (row === i ? ' is-on' : '')} data-i={i} onClick={() => setRow(i)}>
                  <b class="wc-kitc-name">{n}</b>
                  <span class="wc-lk-dim">{['Man · warrior', 'Elf · mage', 'Dwarf · cleric'][i]}</span>
                  <span class="wc-lk-dim wc-lk-mono wc-kitc-end">{['2 hours ago', 'yesterday', '3 weeks ago'][i]}</span>
                </li>
              ))}
            </ul>
            <ul class="wc-lk-rows is-flat wc-kitc-flat">
              <li class="wc-lk-row is-on is-cur">Chosen, the keyboard's zone (.is-on .is-cur)</li>
              <li class="wc-lk-row is-idle">Chosen, the keyboard elsewhere (.is-idle)</li>
              <li class="wc-lk-row">At rest</li>
              <li class="wc-lk-row is-disabled">Disabled</li>
            </ul>

            <Rule title="Table" />
            <div class="wc-kitc-tblbox">
              <Table
                scroll
                cols="minmax(90px, 1fr) 110px 84px 80px 92px"
                stackBelow={560}
                heads={[
                  { key: 'char', label: 'Character', sort: true },
                  { key: 'date', label: 'Date', sort: true },
                  { key: 'dur', label: 'Time', sort: true, align: 'end' },
                  { key: 'exp', label: 'Exp', align: 'end' },
                  { key: 'stars', label: 'Rating', align: 'end' },
                ]}
                sort={sort}
                onSort={(k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 }))}
              >
                {runs.map((r) => (
                  <TableRow key={r.id} id={r.id} on={run === r.id} onClick={() => setRun(r.id)}>
                    <span class="wc-lk-td wc-kitc-name">{r.char}</span>
                    <span class="wc-lk-td">{r.date}</span>
                    <span class="wc-lk-td is-end">{r.dur}</span>
                    <span class="wc-lk-td is-end wc-lk-gold">{r.exp}</span>
                    <span class="wc-lk-td is-end">
                      <Stars n={r.stars} />
                    </span>
                  </TableRow>
                ))}
              </Table>
            </div>
          </section>

          <section>
            <Rule title="Fields" />
            <div class="wc-kitc-form">
              <Field id="name" label="Profile name" value={name} onInput={setName} maxLength={24} hint="Up to 24 letters." />
              <Field id="char" label="Character" value="" onInput={() => {}} placeholder="name to log in as" />
              <Field id="server" label="Server" mono value={server} onInput={setServer} />
              <Field id="bad" label="File name" value={bad} onInput={setBad} error={/[/\\]/.test(bad) ? 'A name cannot hold / or \\.' : null} />
              <Select
                id="font"
                label="Font"
                value={font}
                onChange={setFont}
                options={[
                  { value: 'dejavu', label: 'DejaVu Sans Mono' },
                  { value: 'lucida', label: 'Lucida Console' },
                  { value: 'jetbrains', label: 'JetBrains Mono' },
                ]}
              />
            </div>
            <TextArea id="note" label="Comment" value={note} onInput={setNote} rows={3} maxLength={600} hint={`${note.length} of 600`} />
            <div class="wc-kitc-form">
              <Field id="secret" label="Password" type="password" value={secret} onInput={setSecret} hint="Masked; our own keyboard types in it on a phone." />
              <Field id="off" label="Disabled" value="working" onInput={() => {}} disabled />
            </div>

            <Rule title="Plate, links, time bar" />
            <Plate id="plate">
              <b>A plate.</b> A few lines that must not pass unread. One on a page at most.
            </Plate>
            <div class="wc-lk-links">
              <TextLink id="one" label="Create account" onClick={() => show('Create account.')} />
              <i aria-hidden="true">·</i>
              <TextLink id="two" label="Forgot password" selected onClick={() => show('Forgot password.')} />
            </div>
            <p class="wc-lk-lead">A bar that runs on time, for work that reports no progress:</p>
            <TimeBar ms={2200} run={barRun} />
            <div class="wc-lk-btns">
              <GlassButton small id="BAR" label="Run the bar again" onClick={() => setBarRun((n) => n + 1)} />
            </div>

            <Rule title="Checks and toggles" />
            <div class="wc-kitc-checks">
              <Check id="auto" label="Log in automatically" checked={autoLogin} onChange={setAutoLogin} />
              <Check id="record" label="Record runs" checked={record} onChange={setRecord} />
              <Toggle id="weather" label="Weather in the sky" on={weather} onChange={setWeather} />
              <Toggle id="bold" label="Bold brightens colours" on={bold} onChange={setBold} />
            </div>

            <Rule title="Text">
              <GlassButton small label="Reset all" icon="reset" onClick={() => show('Reset.')} />
            </Rule>
            <p class="wc-lk-lead">A lead line, italic and dim, under a page's heading.</p>
            <p class="wc-lk-txt">
              Body text in Cormorant, with a <a href="#kit">link</a> and the helpers <span class="wc-lk-dim">dim</span>,{' '}
              <span class="wc-lk-faint">faint</span>, <span class="wc-lk-gold">gold</span>, <span class="wc-lk-ok">ok</span>,{' '}
              <span class="wc-lk-bad">bad</span> and <span class="wc-lk-mono">mono</span>.
            </p>
            <dl class="wc-lk-kv">
              <dt>Character</dt>
              <dd>Rasta</dd>
              <dt>Duration</dt>
              <dd>5:02:44</dd>
              <dt>Rating</dt>
              <dd>
                <Stars n={4} />
              </dd>
              <dt>Expires</dt>
              <dd class="wc-kitc-soon">in 3 days</dd>
            </dl>
            <OrnRule />
            <Fold label="Commands" open={!folded} onToggle={() => setFolded((f) => !f)}>
              <Well mono>{'#alias {heal} {cast \'heal\' %1}\n#action {^You are hungry.$} {eat bread}'}</Well>
            </Fold>
            <Well>A plain well: a quote, a log line, a receipt.</Well>
            <p class="wc-lk-empty">No runs recorded yet.</p>
            <div class="wc-kitc-seals">
              <Seal size={20} />
              <Seal />
              <Seal size={48} />
              <span class="wc-kitc-inlay" aria-hidden="true">
                M
              </span>
            </div>

            <Rule title="Icons" />
            <ul class="wc-kitc-icons">
              {(Object.keys(ICONS) as IconName[]).map((n) => (
                <li key={n} data-icon={n} title={n}>
                  <Icon name={n} />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default {
  title: 'Controls',
  View: Controls,
} satisfies KitSection;
