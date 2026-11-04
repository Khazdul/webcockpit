// Sanctuary on other group members (ADR 0122 "Sanctuary on others"). The
// Sanctuary group shows your own sanctuary (the affects tracker) and, from
// this tracker, one entry per group member whose GMCP `sanctuary` flag is
// on.
//
//   timed     the member's flag turned on within SANCT_CAST_WINDOW_MS after
//             you sent `cast 'sanctuary' <target>` (any abbreviation of
//             the spell, `sa` up; any abbreviation of `cast`) naming that
//             member: a SANCT_OTHERS_MS countdown from the flag edge, marked
//             `estimated` (the self duration; the real one may differ)
//   untimed   any other member with the flag on (not tracked: no bar)
//
// - The target matches a member when it (without a `2.` prefix) starts one
//   of the member's name words or its label, folded (case, accents).
// - An entry ends when the flag turns off or the member leaves the group.
//   A timed entry that reaches zero while the flag is still on becomes
//   untimed (the estimate was short) rather than vanishing.
// - Runtime only: nothing is saved (the flags come back with Group.Set).
//
// GameState hands the members over after every Group.* change
// (`TimersHub.noteGroup`).

import { foldName } from '../gmcp/group';
import type { Member } from '../gmcp/group';
import { parseCast } from './castq';
import type { TimerCell } from './entry';
import type { Tracker, TrackerHost } from './tracker';

/** The countdown of another's sanctuary you cast, ms (the self duration). */
export const SANCT_OTHERS_MS = 270_000;
/** How long after the cast the flag may turn on, ms. */
export const SANCT_CAST_WINDOW_MS = 10_000;

/** What the tracker reads of a group member. */
export type SanctMember = Pick<Member, 'id' | 'name' | 'label' | 'type' | 'flags'>;

interface Entry {
  name: string;
  /** Flag edge time when timed, else null. */
  startedAt: number | null;
  expiresAt: number | null;
}

/** The target word of a cast's tail (`2.gibur` → `gibur`), folded; null when none. */
export function castTarget(tail: string): string | null {
  const word = tail.trim().split(/\s+/)[0] ?? '';
  const t = foldName(word.replace(/^\d+\./, ''));
  return t === '' ? null : t;
}

/** True when the folded target `t` names `m` (a name word or the label starts with it). */
export function targetNames(t: string, m: SanctMember): boolean {
  const words = foldName(m.name).split(' ');
  if (m.label) words.push(foldName(m.label));
  return words.some((w) => w !== '' && w.startsWith(t));
}

/** True when `spell` (as typed between the quotes) is an abbreviation of sanctuary. */
export function isSanctuarySpell(spell: string): boolean {
  const s = spell.trim().toLowerCase();
  return s.length >= 2 && 'sanctuary'.startsWith(s);
}

export class SanctOthersTracker implements Tracker {
  readonly key = 'sanct';
  private readonly host: TrackerHost;
  private pending: Array<{ target: string; at: number }> = [];
  private entries = new Map<number, Entry>();

  constructor(host: TrackerHost) {
    this.host = host;
  }

  onSent(text: string, now: number): void {
    const c = parseCast(text);
    if (!c || !isSanctuarySpell(c.spell)) return;
    const target = castTarget(c.tail);
    if (target === null) return; // on yourself: the affects tracker
    this.prune(now);
    this.pending.push({ target, at: now });
  }

  /** The group after a change: start, keep and end entries by the flags. */
  onGroup(members: readonly SanctMember[], now: number): void {
    this.prune(now);
    let changed = false;
    const on = new Map<number, SanctMember>();
    for (const m of members) if (m.flags.sanctuary) on.set(m.id, m);
    for (const id of [...this.entries.keys()]) {
      if (!on.has(id)) {
        this.entries.delete(id);
        changed = true;
      }
    }
    for (const m of on.values()) {
      const name = m.name || m.label || '?';
      const e = this.entries.get(m.id);
      if (e) {
        if (e.name !== name) {
          e.name = name;
          changed = true;
        }
        continue;
      }
      const i = this.pending.findIndex((p) => targetNames(p.target, m));
      if (i >= 0) {
        this.pending.splice(i, 1);
        this.entries.set(m.id, { name, startedAt: now, expiresAt: now + SANCT_OTHERS_MS });
      } else {
        this.entries.set(m.id, { name, startedAt: null, expiresAt: null });
      }
      changed = true;
    }
    if (changed) this.host.changed();
  }

  tick(now: number): void {
    this.prune(now);
    let changed = false;
    for (const e of this.entries.values()) {
      if (e.expiresAt !== null && e.expiresAt <= now) {
        e.startedAt = null;
        e.expiresAt = null;
        changed = true;
      }
    }
    if (changed) this.host.changed();
  }

  cells(): TimerCell[] {
    return [...this.entries].map(([id, e]) => {
      const timed = e.expiresAt !== null;
      return {
        id: `sanct:${id}`,
        name: e.name,
        group: 'sanct',
        target: e.name,
        startedAt: e.startedAt,
        expiresAt: e.expiresAt,
        expected: timed ? SANCT_OTHERS_MS : null,
        tracked: timed,
        ...(timed ? { estimated: true } : {}),
      };
    });
  }

  serialize(): undefined {
    return undefined;
  }

  restore(): void {}

  reset(): void {
    this.pending = [];
    this.entries.clear();
  }

  private prune(now: number): void {
    this.pending = this.pending.filter((p) => now - p.at <= SANCT_CAST_WINDOW_MS);
  }
}
