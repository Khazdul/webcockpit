// Timers across a cut (ADR 0033): the Timers pane is derived from game text
// and sent commands, and an excluded range removes both from the HTML
// replay. So at export, each run's full capture text is replayed through
// the real pipeline (LineAssembler → ScriptEngine with the trackers'
// system rules → TimersHub) on the log's clock, and the hub's saved form at
// each cut's end is written into the edited text as a private GMCP record,
// `ESC GMCP WebCockpit.Timers <state>`. A replay hub replaces its state with
// it (src/timers/hub.ts). The record holds timer names and expiries only,
// never the removed lines.
//
// A replay's hub starts empty at every run (its `connecting`), so the state
// at a point depends only on the run it lies in, from that run's start.

import { Bus } from '../core/bus';
import { ReplayClock } from '../player/clock';
import { ScriptEngine } from '../script/engine';
import { LineAssembler } from '../text/assembler';
import { TimersHub, type TimersState } from '../timers/hub';
import { captureEntries } from './capture';

/** The private GMCP package carrying a timers state into a replay (the hub: `TIMERS_GMCP_PKG`). */
export const TIMERS_GMCP = 'WebCockpit.Timers';

/**
 * The timers state just before each of `points` (log µs, ascending) in one
 * run's capture text: every entry before the point replayed, the clock at
 * the point. One pass for all points.
 */
export function timersStatesAt(text: string, points: readonly number[]): TimersState[] {
  const out: TimersState[] = [];
  if (points.length === 0) return out;
  let clock: ReplayClock | null = null;
  const bus = new Bus();
  let hub: TimersHub | null = null;
  let engine: ScriptEngine | null = null;
  const asm = new LineAssembler(bus);
  bus.on('text.line', (l) => engine?.processLine(l));
  const start = (us: number): void => {
    const c = new ReplayClock(us);
    clock = c;
    hub = new TimersHub({ now: () => c.now(), scheduler: c }).attach(bus);
    engine = new ScriptEngine({ send: () => {}, message: () => {}, scheduler: c });
    hub.installRules(engine.system);
    bus.emit('conn.state', { state: 'connecting', prev: 'disconnected', replay: true });
  };
  let pi = 0;
  const take = (us: number): void => {
    while (pi < points.length && points[pi]! <= us) {
      const p = points[pi++]!;
      if (!clock) start(p);
      clock!.advanceTo(p);
      out.push(hub!.snapshot());
    }
  };
  for (const e of captureEntries(text)) {
    take(e.ts);
    if (pi >= points.length) break;
    if (!clock) start(e.ts);
    clock!.advanceTo(e.ts);
    if (e.kind === 'in') asm.text(e.body + '\r\n', e.ts);
    else if (e.kind === 'out') bus.emit('cmd.sent', { text: e.body, ts: e.ts, replay: true });
    else if (e.kind === 'gmcp' && e.pkg?.toLowerCase() === 'char.name') {
      const sp = e.body.indexOf(' ');
      try {
        bus.emit('gmcp', { pkg: e.pkg, data: sp < 0 ? undefined : (JSON.parse(e.body.slice(sp + 1)) as unknown) });
      } catch {
        // A malformed record: skip it.
      }
    }
  }
  take(Infinity);
  (hub as TimersHub | null)?.dispose();
  (engine as ScriptEngine | null)?.dispose();
  bus.clear();
  return out;
}
