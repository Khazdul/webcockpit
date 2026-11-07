// Kit gallery section "Player" (stage 42f, ADR 0127): the player core as
// the Spotlights viewer (stage 46) will use it. An embedded host
// (`services.embedPlayer`) in a slot of this page plays a bare view (no
// chrome of its own); the buttons below drive it through `press`, the
// readout shows `h:mm:ss` (`fmtClock(ms, true)`), and the toggles try the
// Display controls (`viewerControls(true)`) and the palette tweak (the
// brighter red). It plays a stored session (one of several runs first, as
// the dev hook picks; restore the demo backup through History → Restore
// to get Rasta's) or, without one, a built-in sample of 1 h 34 min with
// red lines.
//
// While the player is shown it owns the keys (Space, ← →, ↑ ↓, 1–6; Esc
// leaves the gallery). Park hides the slot: the keys are the page's again
// (`[` / `]` switch sections), as the Spotlights wall parks its viewer.

import type { VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PlayerHost } from '../../../app/player-host';
import { formatGmcpRecord, formatInbound } from '../../../capture/format';
import { nowUs } from '../../../core/types';
import type { ChainRun } from '../../../player/timeline';
import type { PlayerAct } from '../../../player/view';
import type { ViewerTheme } from '../../../player/viewer';
import { fmtClock, fmtSpeed } from '../../../player/strip';
import { useServices } from '../hooks';
import { GlassButton, Rule, Seg, Toggle } from '../look';
import { useNav } from '../stack';
import type { KitSection } from './kit';

/** The sample: one run, a line every 5 s for 1 h 34 min 7 s, every seventh in ANSI red. */
function sampleChain(): ChainRun[] {
  const base = Date.UTC(2026, 10, 7, 20, 0, 0) * 1000;
  let text = formatGmcpRecord(base, 'Char.Name', JSON.stringify({ name: 'Sample', fullname: 'Sample the Tester' }));
  const end = (60 + 34) * 60 + 7;
  for (let s = 0, i = 1; s < end; s += 5, i++) {
    const line = i % 7 === 0 ? `\x1b[31mA red line (ANSI 1), number ${i}.\x1b[0m` : `Line ${i}: the road runs on through the trees.`;
    text += formatInbound(base + s * 1e6, line);
  }
  text += formatInbound(base + end * 1e6, 'The end of the sample.');
  return [
    {
      meta: { runId: 'Sample/1', character: 'Sample', startedUs: base, endedUs: null, sealed: true, bytes: text.length, lines: 0 },
      text,
    },
  ];
}

const ACTS: ReadonlyArray<{ act: PlayerAct; label: string; title: string }> = [
  { act: 'start', label: 'Start', title: 'To the start' },
  { act: 'back', label: '−10 s', title: 'Back 10 s' },
  { act: 'play', label: 'Play / pause', title: 'Play or pause (resumes from the cursor line)' },
  { act: 'fwd', label: '+10 s', title: 'Forward 10 s' },
  { act: 'slower', label: 'Slower', title: 'Slower' },
  { act: 'faster', label: 'Faster', title: 'Faster' },
];

interface Readout {
  pos: string;
  dur: string;
  speed: string;
  playing: boolean;
}

function PlayerSection(): VNode {
  const services = useServices();
  const nav = useNav();
  const slot = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<PlayerHost | null>(null);
  const [state, setState] = useState<string>('Loading the player…');
  const [read, setRead] = useState<Readout | null>(null);
  const [parked, setParked] = useState(false);
  const [red, setRed] = useState(false);
  const [theme, setTheme] = useState('default');

  useEffect(() => {
    let dead = false;
    let h: PlayerHost | null = null;
    let unsub = (): void => {};
    void (async () => {
      const el = slot.current;
      if (!el || !services.embedPlayer) return setState('No embedPlayer service here.');
      h = await services.embedPlayer(el);
      if (dead) return h?.dispose();
      if (!h) return setState('The player could not be embedded (another player is open).');
      const opts = { view: { bare: true, hours: true, onEsc: () => nav.pop() }, autoplay: false } as const;
      let from = 'the built-in sample';
      try {
        const lib = await services.runs();
        // As the dev hook picks (src/main.ts): a session of several runs (the demo's Rasta), else the newest.
        const list = (await lib.listSessions(nowUs())).filter((x) => x.runs.length > 0);
        const s = list.find((x) => x.runs.length > 1) ?? list[0];
        if (s) {
          await h.open(s, lib, opts);
          from = `${s.character}'s session`;
        }
      } catch {
        // No library, or the session cannot open: the sample instead.
      }
      if (dead) return;
      if (!h.engine) h.openChain(sampleChain(), [], { character: 'Sample' }, opts);
      const eng = h.engine!;
      const tick = (): void =>
        setRead((cur) => {
          const next = { pos: fmtClock(eng.position, true), dur: fmtClock(eng.duration, true), speed: fmtSpeed(eng.speed), playing: eng.playing };
          return cur && cur.pos === next.pos && cur.dur === next.dur && cur.speed === next.speed && cur.playing === next.playing ? cur : next;
        });
      unsub = eng.subscribe(tick);
      tick();
      setState(`Playing ${from}: a bare view in an embedded host.`);
      setHost(h);
    })();
    return () => {
      dead = true;
      unsub();
      h?.dispose();
    };
  }, []);

  const vc = host?.viewerControls(true);
  return (
    <div class="wc-kit-player">
      <Rule title="Embedded bare player" />
      <p class="wc-lk-txt wc-kit-player-state">{state}</p>
      {/* No inline `display` here: `hidden` must hide it (the view's parked check reads `hidden`). */}
      <div
        class="wc-kit-player-slot"
        ref={slot}
        hidden={parked}
        data-kit="player-slot"
        style={{ position: 'relative', height: '340px', overflow: 'hidden', borderRadius: '4px', border: '1px solid rgba(255, 214, 160, 0.16)' }}
      />
      {parked && <p class="wc-lk-empty">Parked: the slot is hidden and the keys are the page's.</p>}
      <div class="wc-kit-player-read wc-lk-mono" data-kit="player-read" style={{ textAlign: 'center', margin: '10px 0 0' }}>
        {read ? `${read.pos} / ${read.dur} · ${read.speed} · ${read.playing ? 'playing' : 'paused'}` : '–'}
      </div>
      <div class="wc-lk-btns">
        {ACTS.map((a) => (
          <GlassButton
            key={a.act}
            id={`press-${a.act}`}
            label={a.label}
            title={a.title}
            small
            disabled={!host}
            onClick={() => host?.playerView?.press(a.act)}
          />
        ))}
      </div>
      <Rule title="Display and palette" />
      <div class="wc-kit-player-opts" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', justifyContent: 'center' }}>
        <Seg
          label="Colours"
          options={['default', 'dark', 'paper', 'sepia'].map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }))}
          value={theme}
          onChange={(v) => {
            vc?.setTheme(v as ViewerTheme);
            setTheme(v);
          }}
        />
        <Toggle
          id="kit-player-red"
          label="Brighter red (palette tweak, Default colours only)"
          on={red}
          onChange={(on) => {
            host?.setPaletteTweak(on ? { 1: '#c43c3c' } : null);
            setRed(on);
          }}
        />
        <Toggle id="kit-player-park" label="Park (hide the slot; keys to the page)" on={parked} onChange={setParked} />
      </div>
    </div>
  );
}

export default {
  title: 'Player',
  View: PlayerSection,
} satisfies KitSection;
