// Gittan's run as the Character film's take plays it (feeds/character.ts):
// the backup's lines → timed events on the take's clock.
//
//   out    the server's bytes of one log moment (text and GMCP in log
//          order, prompts as MUME's XML prompts), with what they change of
//          the poll's state (vitals, prompt, shields, affects);
//   cmd    a command the player sent: `typed` when its leg is slow enough
//          to type it on camera, else it is sent as a typed one is;
//
// What the clicks replace (feeds/character.ts CLICKS: their commands, their
// answers, the GMCP of those answers) and the client's own records (VIEW,
// SIZE, the poll's `WebCockpit.Shields`) are left out; the shields become
// the poll's values. A `cut` leg's text is left out, its GMCP sent at once.
import { lineBytes, gmcpBytes, isPrompt } from '../../../scripts/lib/mume-feed.ts';
import { CLICKS, DROP_GMCP, LEGS, type Leg, STAGED_GMCP, TYPE_MAX_SPEED, takeOf } from '../../feeds/character.ts';
import { promptBytes } from './character-state.ts';
import type { Run } from './run-feed.ts';

export interface StateChange {
  vitals?: Record<string, unknown>;
  prompt?: string;
  shields?: { ob: number; db: number; pb: number; abs: number };
}

export type FeedEvent =
  | { kind: 'out'; take: number; log: number; out: Buffer; change: StateChange; text: string[] }
  | { kind: 'cmd'; take: number; log: number; cmd: string; typed: boolean };

const legOf = (log: number): Leg | undefined => LEGS.find((l) => log >= l.log[0] && log < l.log[1]);

/** The run's lines from `from` to `to` (log s) as events. */
export function feedEvents(run: Run, from: number, to: number): FeedEvent[] {
  const t0 = run.meta.startedUs;
  const events: FeedEvent[] = [];
  let cur: Extract<FeedEvent, { kind: 'out' }> | null = null;
  let curUs = -1;
  const flush = (): void => {
    if (cur && cur.out.length) events.push(cur);
    cur = null;
  };
  const staged = [...STAGED_GMCP];
  const out = (us: number, log: number): Extract<FeedEvent, { kind: 'out' }> => {
    if (!cur || us !== curUs) {
      flush();
      cur = { kind: 'out', take: takeOf(log), log, out: Buffer.alloc(0), change: {}, text: [] };
      curUs = us;
    }
    return cur;
  };
  const add = (e: Extract<FeedEvent, { kind: 'out' }>, b: Buffer): void => {
    e.out = Buffer.concat([e.out, b]);
  };
  const dropped = (log: number): boolean => CLICKS.some((c) => log >= c.drop[0] && log < c.drop[1]);
  // commands at one moment (an alias's): none typed
  const cmdsAt = new Map<number, number>();
  for (const l of run.lines) if (l.body.startsWith('> ')) cmdsAt.set(l.us, (cmdsAt.get(l.us) ?? 0) + 1);

  for (const l of run.lines) {
    const log = (l.us - t0) / 1e6;
    if (log < from || log >= to) continue;
    const leg = legOf(log);
    const cut = leg?.cut === true;
    for (; staged.length && staged[0]!.log <= log; staged.shift()) {
      const s = staged[0]!;
      if (s.log < from) continue;
      const e = out(Math.round(t0 + s.log * 1e6), s.log);
      add(e, gmcpBytes(s.gmcp));
      e.change.vitals = { ...e.change.vitals, ...(JSON.parse(s.gmcp.slice(s.gmcp.indexOf(' ') + 1)) as object) };
    }
    const body = l.body;
    if (body.startsWith('\x1bGMCP ')) {
      const g = body.slice(6);
      const sp = g.indexOf(' ');
      const pkg = sp < 0 ? g : g.slice(0, sp);
      const json = sp < 0 ? '' : g.slice(sp + 1);
      if (pkg === 'WebCockpit.Shields') {
        out(l.us, log).change.shields = JSON.parse(json) as StateChange['shields'];
        continue;
      }
      if (DROP_GMCP.some((d) => Math.abs(d.log - log) < 0.05 && d.pkg === pkg && json.includes(d.has))) continue;
      const e = out(l.us, log);
      add(e, gmcpBytes(g));
      if (pkg === 'Char.Vitals') e.change.vitals = { ...e.change.vitals, ...(JSON.parse(json) as object) };
      continue;
    }
    if (/^\x1b[A-Z]/.test(body)) continue;
    if (dropped(log)) continue;
    if (body.startsWith('> ')) {
      if (cut) continue;
      flush();
      const typed = (leg?.speed ?? 99) <= TYPE_MAX_SPEED && (cmdsAt.get(l.us) ?? 0) === 1;
      events.push({ kind: 'cmd', take: takeOf(log), log, cmd: body.slice(2), typed });
      continue;
    }
    if (isPrompt(body)) {
      const e = out(l.us, log);
      e.change.prompt = body;
      if (!cut) add(e, promptBytes(body));
      continue;
    }
    if (cut) continue;
    const e = out(l.us, log);
    add(e, lineBytes(body));
    e.text.push(body.replace(/\x1b\[[0-9;]*m/g, ''));
  }
  flush();
  return events;
}
