// Group state from GMCP `Group.*` and the fight fields of `Char.Vitals`
// (Inv §2.3 "Data", §8.2). Pure TS, no DOM.
//
// - Room-scoped: MUME reports only the members in your room. `Group.Remove`
//   means "not here"; coming back is a `Group.Add` with a new id. The model
//   is "who is here", ordered by id. Stable identity is `label` (NPC) or
//   `name` (ally), used to match the fight fields below.
// - `type: "you"` is never kept as a member (the Character pane covers it);
//   only its id and its `bashed` flag (`selfBashed`, for the weather
//   effects' stun, owner item 116) are.
// - An NPC is a member only with a non-empty string `label` (MUME sends
//   `label: 0` when unlabeled). Unlabeled NPCs are kept on the side
//   (`unlabeled()`, shown in npcMode `all`). A `Group.Update` that sets a
//   label promotes the NPC; clearing it demotes it.
// - `Group.Set` replaces everything; `Group.Add` is a full member;
//   `Group.Update {id, …}` is partial; `Group.Remove` is a bare integer.
// - Vital pairs (Cockpit ADR 0052): each of hp/mana/mp has a number (with a
//   max) and a band word (`hp-string`). An update may carry one half:
//     both        → store both;
//     number only → store it, drop the (stale) word;
//     word only   → keep the cached number only if its percent lies in the
//                   word's band (or the word is unknown); store the word.
//   The bar shows number/max when both are known, else the band midpoint.
// - Mid-fight HP (Inv §8.2): `Char.Vitals` carries `buffer` / `opponent`
//   (who tanks / whom you fight) at fight start, and `buffer-hits` /
//   `opponent-hits` band words on every round. The identities are cached;
//   each `*-hits` is applied as that member's `hp-string` (word only, as
//   above). The identity is matched against labels (first) and names by
//   tokens (whole string, inside and before parentheses), lower case and
//   accent-folded. Only HP: there is no `buffer-mana`.

import { type VitalKind, VITAL_KINDS, bandMidpoint, inBand } from './bands';

export type MemberType = 'ally' | 'npc' | string;

export interface Vital {
  value: number | null;
  max: number | null;
  word: string | null;
}

export interface Member {
  id: number;
  type: MemberType;
  name: string;
  /** Non-empty label, or null (unlabeled). */
  label: string | null;
  hp: Vital;
  mana: Vital;
  mp: Vital;
}

/** Bar fill for one vital: fraction 0–1 or null, and whether it was exact. */
export interface VitalPct {
  pct: number | null;
  /** True: value / max; false: band midpoint (or unknown). */
  known: boolean;
}

/** Display filter (Options → Panes → Group, ADR 0016 settings). */
export interface GroupDisplay {
  showPlayers: boolean;
  npcMode: 'off' | 'labeled' | 'all';
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const has = (o: Obj, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** A label as MUME sends it: a non-empty string, else null (`0`, `""`, null). */
export function normLabel(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** Lower case, accents removed (`Éowyn` → `eowyn`), spaces collapsed. */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokens of a fight identity: the whole string, and when it has
 * parentheses the part inside and the part before them
 * (`a citizen mercenary (MERC)` → whole, `merc`, `a citizen mercenary`).
 */
export function identityTokens(s: string): string[] {
  const out = [foldName(s)];
  const m = /^(.*?)\(([^()]*)\)\s*$/.exec(s);
  if (m) {
    const inside = foldName(m[2]!);
    const before = foldName(m[1]!);
    if (inside) out.push(inside);
    if (before) out.push(before);
  }
  return out.filter((t, i) => t !== '' && out.indexOf(t) === i);
}

const emptyVital = (): Vital => ({ value: null, max: null, word: null });

/** Fill of one vital (Inv §2.3): value / max, else band midpoint, else null. */
export function vitalPct(kind: VitalKind, v: Vital): VitalPct {
  if (v.value !== null && v.max !== null && v.max > 0) {
    return { pct: Math.max(0, Math.min(1, v.value / v.max)), known: true };
  }
  return { pct: bandMidpoint(kind, v.word), known: false };
}

/**
 * Merges one vital pair from a payload (ADR 0052 cases). `full` (Set/Add):
 * fields present are stored as they are, absent ones become null.
 */
function mergeVital(kind: VitalKind, cur: Vital, o: Obj, full: boolean): boolean {
  const kv = kind;
  const kw = `${kind}-string`;
  const km = `max${kind}`;
  const hasV = has(o, kv);
  const hasW = has(o, kw);
  const before = `${cur.value}|${cur.max}|${cur.word}`;
  if (full) {
    cur.value = num(o[kv]);
    cur.word = typeof o[kw] === 'string' ? (o[kw] as string) : null;
    cur.max = num(o[km]);
  } else {
    if (has(o, km)) cur.max = num(o[km]);
    if (hasV && hasW) {
      cur.value = num(o[kv]);
      cur.word = typeof o[kw] === 'string' ? (o[kw] as string) : null;
    } else if (hasV) {
      cur.value = num(o[kv]);
      cur.word = null;
    } else if (hasW) {
      applyWord(kind, cur, typeof o[kw] === 'string' ? (o[kw] as string) : null);
    }
  }
  return before !== `${cur.value}|${cur.max}|${cur.word}`;
}

/** Case C: a new band word; drop the cached number when it disagrees. */
function applyWord(kind: VitalKind, cur: Vital, word: string | null): void {
  if (word !== null && cur.value !== null && cur.max !== null && cur.max > 0) {
    if (inBand(kind, (cur.value / cur.max) * 100, word) === false) cur.value = null;
  }
  cur.word = word;
}

export class GroupModel {
  /** Allies and labeled NPCs by id. */
  private readonly members = new Map<number, Member>();
  /** Unlabeled NPCs by id (not members; shown in npcMode `all`). */
  private readonly side = new Map<number, Member>();
  /** Cached fight identities from `Char.Vitals`. */
  private buffer: string | null = null;
  private opponent: string | null = null;
  /** Your own entry's id (`type: "you"`), and whether you are bashed. */
  private selfId: number | null = null;
  private bashed = false;

  /** You are bashed (a bash or a trip: no prompt until "Your head stops stinging."). */
  get selfBashed(): boolean {
    return this.bashed;
  }
  /** Bumped on every change. */
  version = 0;

  /** Members (allies, labeled NPCs), ascending id. */
  list(): Member[] {
    return [...this.members.values()].sort((a, b) => a.id - b.id);
  }

  /** Unlabeled NPCs, ascending id. */
  unlabeled(): Member[] {
    return [...this.side.values()].sort((a, b) => a.id - b.id);
  }

  /** The rows to draw under the display options (display-only filter). */
  displayed(d: GroupDisplay): Member[] {
    const out = this.list().filter((m) => {
      if (m.type === 'ally') return d.showPlayers;
      if (m.type === 'npc') return d.npcMode !== 'off';
      return true;
    });
    if (d.npcMode === 'all') {
      out.push(...this.side.values());
      out.sort((a, b) => a.id - b.id);
    }
    return out;
  }

  /** The member (or unlabeled NPC) with `id`. */
  get(id: number): Member | undefined {
    return this.members.get(id) ?? this.side.get(id);
  }

  /** Forgets everything (new connection, live disconnect). */
  reset(): void {
    this.members.clear();
    this.side.clear();
    this.buffer = null;
    this.opponent = null;
    this.selfId = null;
    this.bashed = false;
    this.version++;
  }

  /**
   * Applies `Group.*` and `Char.Vitals` (fight fields). Returns true when
   * the group changed.
   */
  apply(pkg: string, data: unknown): boolean {
    let changed: boolean;
    switch (pkg.toLowerCase()) {
      case 'group.set':
        changed = this.set(data);
        break;
      case 'group.add':
        changed = this.add(data);
        break;
      case 'group.update':
        changed = this.update(data);
        break;
      case 'group.remove':
        changed = this.remove(data);
        break;
      case 'char.vitals':
        changed = this.fight(data);
        break;
      default:
        return false;
    }
    if (changed) this.version++;
    return changed;
  }

  private set(data: unknown): boolean {
    const had = this.members.size + this.side.size;
    const wasBashed = this.bashed;
    this.members.clear();
    this.side.clear();
    this.selfId = null;
    this.bashed = false;
    if (Array.isArray(data)) for (const m of data) this.add(m);
    return had > 0 || this.members.size + this.side.size > 0 || this.bashed !== wasBashed;
  }

  private add(data: unknown): boolean {
    if (!isObj(data)) return false;
    const id = num(data.id);
    if (id === null) return false;
    const type = typeof data.type === 'string' ? data.type : '';
    this.members.delete(id);
    this.side.delete(id);
    if (type === 'you') {
      this.selfId = id;
      this.bashed = data.bashed === true;
      return true;
    }
    if (id === this.selfId) this.selfId = null;
    const m: Member = {
      id,
      type,
      name: typeof data.name === 'string' ? data.name : '',
      label: normLabel(data.label),
      hp: emptyVital(),
      mana: emptyVital(),
      mp: emptyVital(),
    };
    for (const k of VITAL_KINDS) mergeVital(k, m[k], data, true);
    this.place(m);
    return true;
  }

  /** Puts `m` in the member map or the side set by type and label. */
  private place(m: Member): void {
    if (m.type === 'npc' && m.label === null) this.side.set(m.id, m);
    else this.members.set(m.id, m);
  }

  private update(data: unknown): boolean {
    if (!isObj(data)) return false;
    const id = num(data.id);
    if (id === null) return false;
    if (id === this.selfId) {
      if (typeof data.bashed !== 'boolean' || data.bashed === this.bashed) return false;
      this.bashed = data.bashed;
      return true;
    }
    const m = this.get(id);
    if (!m) {
      // An update for an id we never saw: take it as an add when it says
      // what it is, else ignore it.
      return typeof data.type === 'string' ? this.add(data) : false;
    }
    let changed = false;
    if (typeof data.type === 'string' && data.type !== m.type) {
      if (data.type === 'you') {
        this.members.delete(id);
        this.side.delete(id);
        this.selfId = id;
        this.bashed = data.bashed === true;
        return true;
      }
      m.type = data.type;
      changed = true;
    }
    if (typeof data.name === 'string' && data.name !== m.name) {
      m.name = data.name;
      changed = true;
    }
    if (has(data, 'label')) {
      const label = normLabel(data.label);
      if (label !== m.label) {
        m.label = label;
        changed = true;
      }
    }
    for (const k of VITAL_KINDS) if (mergeVital(k, m[k], data, false)) changed = true;
    if (changed) {
      // Promote / demote on a label change (or a type change).
      this.members.delete(id);
      this.side.delete(id);
      this.place(m);
    }
    return changed;
  }

  private remove(data: unknown): boolean {
    let id: number | null = num(data);
    if (id === null && typeof data === 'string' && /^\s*\d+\s*$/.test(data)) id = Number(data);
    if (id === null && isObj(data)) id = num(data.id);
    if (id === null) return false;
    if (id === this.selfId) {
      const was = this.bashed;
      this.selfId = null;
      this.bashed = false;
      return was;
    }
    const a = this.members.delete(id);
    const b = this.side.delete(id);
    return a || b;
  }

  /** `Char.Vitals` fight fields → the matched member's HP word. */
  private fight(data: unknown): boolean {
    if (!isObj(data)) return false;
    if (has(data, 'buffer')) this.buffer = typeof data.buffer === 'string' && data.buffer ? data.buffer : null;
    if (has(data, 'opponent')) this.opponent = typeof data.opponent === 'string' && data.opponent ? data.opponent : null;
    let changed = false;
    for (const [who, key] of [
      [this.buffer, 'buffer-hits'],
      [this.opponent, 'opponent-hits'],
    ] as const) {
      const word = data[key];
      if (who === null || typeof word !== 'string' || !word) continue;
      const m = this.match(who);
      if (!m) continue;
      const before = `${m.hp.value}|${m.hp.word}`;
      applyWord('hp', m.hp, word);
      if (before !== `${m.hp.value}|${m.hp.word}`) changed = true;
    }
    return changed;
  }

  /**
   * The member a fight identity names: a token equal to a label wins over
   * one equal to a name; members before unlabeled NPCs; lowest id first.
   */
  match(identity: string): Member | null {
    const tokens = identityTokens(identity);
    if (tokens.length === 0) return null;
    const pool = [...this.list(), ...this.unlabeled()];
    for (const m of pool) {
      if (m.label !== null && tokens.includes(foldName(m.label))) return m;
    }
    for (const m of pool) {
      if (m.name && tokens.includes(foldName(m.name))) return m;
    }
    return null;
  }
}

/** The text over a member's row: `Name (Label)` for a labeled NPC, else the name. */
export function memberTitle(m: Member): string {
  return m.type === 'npc' && m.label !== null ? `${m.name} (${m.label})` : m.name;
}
