// Gittan's run as the Character film's take plays it (feeds/character.ts):
// the backup's lines → timed events on the take's clock.
//
//   out    the server's bytes of one log moment (text and GMCP in log
//          order, prompts as MUME's XML prompts), with what they change of
//          the poll's state (vitals, prompt, shields, affects);
//   cmd    a command the player sent: `typed` when its leg is slow enough
//          to type it on camera, else it is sent as a typed one is;
//
// What the clicks replace and the DROPS (feeds/character.ts CLICKS: their commands, their
// answers, the GMCP of those answers) and the client's own records (VIEW,
// SIZE, the poll's `WebCockpit.Shields`) and the owner's edit (DELETED_LINES) are
// left out; the shields become
// the poll's values. A `cut` leg's text is left out, its GMCP sent at once.
import { lineBytes, gmcpBytes, isPrompt } from '../../../scripts/lib/mume-feed.ts';
import { escapeXml } from './character-state.ts';
import { CLICKS, DELETED_LINES, DROPS, DROP_GMCP, LEGS, type Leg, TYPE_MAX_SPEED, takeOf } from '../../feeds/character.ts';
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
  const dropped = (log: number): boolean => [...CLICKS.map((c) => c.drop), ...DROPS].some(([a, b]) => log >= a && log < b);
  // commands at one moment (an alias's): none typed
  const cmdsAt = new Map<number, number>();
  for (const l of run.lines) if (l.body.startsWith('> ')) cmdsAt.set(l.us, (cmdsAt.get(l.us) ?? 0) + 1);

  /** Line n of the run log (1-based) is in a stretch the owner's edit left out. */
  const deleted = (n: number): boolean => DELETED_LINES.some(([a, b]) => n >= a && n <= b);
  // the XP the left-out stretches gave (the tarantulas'): taken off every later value, so the ring grows only with what is played
  let xpOff = 0;
  let runXp: number | null = null;

  for (const [i, l] of run.lines.entries()) {
    const log = (l.us - t0) / 1e6;
    if (log < from || log >= to) continue;
    const gone = deleted(i + 1);
    const leg = legOf(log);
    const cut = leg?.cut === true;
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
      if (pkg === 'Char.Vitals') {
        const v = JSON.parse(json) as { xp?: number };
        if (typeof v.xp === 'number') {
          if (gone && runXp !== null) xpOff += v.xp - runXp;
          runXp = v.xp;
        }
      }
      // the GMCP of a left-out stretch goes with its text (its rooms are not played; the bars stay true by the next values)
      if (gone) continue;
      if (DROP_GMCP.some((d) => Math.abs(d.log - log) < 0.05 && d.pkg === pkg && json.includes(d.has))) continue;
      const e = out(l.us, log);
      if (pkg === 'Char.Vitals') {
        const v = JSON.parse(json) as Record<string, unknown>;
        if (typeof v.xp === 'number' && xpOff) v.xp = (v.xp as number) - xpOff;
        add(e, gmcpBytes(`Char.Vitals ${JSON.stringify(v)}`));
        e.change.vitals = { ...e.change.vitals, ...v };
      } else add(e, gmcpBytes(g));
      continue;
    }
    if (/^\x1b[A-Z]/.test(body)) continue;
    if (gone || dropped(log)) continue;
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
    // MUME's XML mode escapes its text (`&lt;wielded&gt;`): the client reads the rest as tags
    add(e, lineBytes(escapeXml(body)));
    e.text.push(body.replace(/\x1b\[[0-9;]*m/g, ''));
  }
  flush();
  return events;
}
