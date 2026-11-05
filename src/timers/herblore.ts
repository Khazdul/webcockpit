// Herblore tracker (Inv §2.6.10): manual only. The player adds a herblore
// from the Herblore group's `+` menu (ADR 0122 addendum); its current phase
// shows as a cell of the Herblore group (`phase` says buff or debuff) whose
// bar drains across that phase. The phase is derived from the
// start time and the catalogue (data/herblores.ts), so only `{ key,
// startedAt }` is saved and a restore lands in the right phase silently.
//
//   add       `◆ HERB: Clearthought up.` (no-op when running: no refresh)
//   phase     `◆ HERB: Clearthought (low) up.` on each live change
//   end       `◆ HERB: Clearthought (neg) down.` (last phase over, or removed)

import { HERBLORES, herbDef, herbPhaseAt } from './data/herblores';
import type { HerbEntry, TimerCell } from './entry';
import type { Tracker, TrackerHost } from './tracker';

interface Running {
  key: string;
  startedAt: number;
  /** The phase index last announced. */
  phase: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export class HerbloreTracker implements Tracker {
  readonly key = 'herbs';
  private readonly host: TrackerHost;
  private readonly running = new Map<string, Running>();

  constructor(host: TrackerHost) {
    this.host = host;
  }

  herbs(): HerbEntry[] {
    return HERBLORES.map((h) => ({ key: h.key, name: h.name, active: this.running.has(h.key) }));
  }

  addHerb(key: string, now: number): void {
    const def = herbDef(key);
    if (!def || this.running.has(key)) return;
    this.running.set(key, { key, startedAt: now, phase: 0 });
    this.host.changed();
    this.host.announce('HERB', def.phases[0]!.name, 'up');
  }

  removeHerb(key: string, now: number): void {
    const r = this.running.get(key);
    const def = herbDef(key);
    if (!r || !def) return;
    this.running.delete(key);
    this.host.changed();
    const at = herbPhaseAt(def, r.startedAt, now);
    this.host.announce('HERB', (at?.phase ?? def.phases[def.phases.length - 1]!).name, 'down');
  }

  tick(now: number): void {
    let changed = false;
    for (const r of [...this.running.values()]) {
      const def = herbDef(r.key)!;
      const at = herbPhaseAt(def, r.startedAt, now);
      if (!at) {
        this.running.delete(r.key);
        changed = true;
        this.host.announce('HERB', def.phases[def.phases.length - 1]!.name, 'down');
      } else if (at.index !== r.phase) {
        r.phase = at.index;
        changed = true;
        this.host.announce('HERB', at.phase.name, 'up');
      }
    }
    if (changed) this.host.changed();
  }

  cells(now: number): TimerCell[] {
    const out: TimerCell[] = [];
    for (const r of this.running.values()) {
      const at = herbPhaseAt(herbDef(r.key)!, r.startedAt, now);
      if (!at) continue;
      out.push({
        id: `herb:${r.key}`,
        name: at.phase.name,
        group: 'herb',
        phase: at.phase.type,
        herbKey: r.key,
        startedAt: at.startedAt,
        expiresAt: at.expiresAt,
        expected: at.phase.duration * 1000,
        tracked: true,
      });
    }
    return out;
  }

  serialize(): unknown {
    return [...this.running.values()].map((r) => ({ key: r.key, startedAt: r.startedAt }));
  }

  restore(saved: unknown, now: number): void {
    if (!Array.isArray(saved)) return;
    for (const raw of saved as Array<Record<string, unknown>>) {
      if (!raw || typeof raw.key !== 'string' || !isNum(raw.startedAt)) continue;
      const def = herbDef(raw.key);
      if (!def || this.running.has(raw.key)) continue;
      const at = herbPhaseAt(def, raw.startedAt, now);
      if (!at) continue;
      this.running.set(raw.key, { key: raw.key, startedAt: raw.startedAt, phase: at.index });
    }
  }

  reset(): void {
    this.running.clear();
  }
}
