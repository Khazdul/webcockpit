// Group state from GMCP `Group.*` and the fight fields of `Char.Vitals`
// (Inv §2.3 "Data", §8.2). Pure TS, no DOM.
//
// - Scope (ADR 0120, notes/research/gmcp-group.md): MUME reports NPC
//   members only while they are in your room (`Group.Remove` = "not here",
//   meeting again = `Group.Add`), but player members wherever they are.
//   The model keeps what MUME sends, ordered by id. Stable identity is
//   `label` (NPC) or `name` (player), used to match the fight fields below.
//   Players are `ally`, `enemy` or `neutral`; "Show players" covers all
//   three (ADR 0122).
// - Every member keeps the GMCP fields the Group pane draws (ADR 0122):
//   `position`, `ride`, `room`, `mapid` and the status flags
//   (`STATUS_FLAGS`). Set/Add take them whole (absent: null / false),
//   Update only what it carries.
// - Your room: `Room.Info` `id` (`selfRoom`). A player member is `away`
//   when its `mapid` and your room are both known and differ (NPCs are
//   only reported in your room, ADR 0120).
// - The fight (`fight()`): the opponent identity and its last band word,
//   and the tank (the buffer identity, and the member it names, if any),
//   from `Char.Vitals`. An `opponent` of null or "" ends the fight.
// - `type: "you"` is never kept as a member (the Character pane covers it);
//   only its id and its status flags are (`selfFlags`, ADR 0166 addendum
//   18 point 95: MUME sends them all in `Group.Set` at login and the
//   changes in `Group.Update`). `selfBashed` is its `bashed`, for the
//   weather effects' stun (owner item 116).
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
// - No mana (`noMana`, stage 77 H9, ADR 0166 addendum 31): a member whose
//   Set/Add carries `mana-string` that is not a word (MUME sends `0`) and
//   no `mana` or `maxmana` number. The run exports (2026-09-28 to 11-17):
//   every troll ally (Grugg, Burpy, Dig, Soug; 8 adds) came so, and not one
//   of their 4 624 updates had a mana key; every other ally carried a word
//   or a `maxmana`. NPCs come the same way (`"mana-string": 0`) and show no
//   mana bar either (the owner, 2026-11-25). A later
//   mana number or word clears it.
// - The list leads over a stale flag (`noteSelfList`, ADR 0166 addendum
//   36): MUME does not send `wound: false` when a death heals the wound,
//   so a whole affects list of yours (`stat`, `info`) that has no
//   `… wound at …` line turns your `wound` off, and one without a
//   `poison …` line your `poison`. It only clears, never sets (GMCP says
//   when one comes). While `wound` is on, the wound lines of the latest
//   list that had them are kept (`selfWounds`, the stone's tooltip).

import { type VitalKind, VITAL_KINDS, bandMidpoint, inBand } from './bands';

export type MemberType = 'ally' | 'npc' | string;

export interface Vital {
  value: number | null;
  max: number | null;
  word: string | null;
}

/** The GMCP status flags of a member (ADR 0122), in the pane's icon order. */
export const STATUS_FLAGS = [
  'sanctuary',
  'poison',
  'slept',
  'blind',
  'bashed',
  'snared',
  'wound',
  'hungry',
  'thirsty',
  'waiting',
] as const;
export type StatusFlag = (typeof STATUS_FLAGS)[number];
export type MemberFlags = Record<StatusFlag, boolean>;

export interface Member {
  id: number;
  type: MemberType;
  name: string;
  /** Non-empty label, or null (unlabeled). */
  label: string | null;
  hp: Vital;
  mana: Vital;
  mp: Vital;
  /** MUME sends no mana for it (a troll; see the file header). Absent: false. */
  noMana?: boolean;
  /** GMCP `position` (`standing`, `fighting`, `resting`, `sleeping` …), or null. */
  position: string | null;
  /** Mounted (`ride`). */
  ride: boolean;
  /** The room's name, or null. */
  room: string | null;
  /** MUME's room id, or null. */
  mapid: number | null;
  flags: MemberFlags;
}

/** The fight from `Char.Vitals` (ADR 0122): null fields when unknown. */
export interface GroupFight {
  /** Whom you fight (the identity string), or null: no fight. */
  opponent: string | null;
  /** The opponent's last HP band word (`opponent-hits`), or null. */
  opponentWord: string | null;
  /** The member the opponent identity names (a group NPC you fight), or null. */
  opponentMember: Member | null;
  /** Who tanks (the buffer identity, possibly you), or null (MUME's `Nobody`: you tank). */
  tank: string | null;
  /** The member the buffer identity names, or null (you, or not in the group). */
  tankId: number | null;
}

const noFlags = (): MemberFlags => Object.fromEntries(STATUS_FLAGS.map((f) => [f, false])) as MemberFlags;

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

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * Merges the non-vital fields (ADR 0122). `full` (Set/Add): absent fields
 * reset (null / false). Returns true on a change.
 */
function mergeFields(m: Member, o: Obj, full: boolean): boolean {
  let changed = false;
  const take = <K extends 'position' | 'room' | 'mapid'>(k: K, v: Member[K]): void => {
    if (m[k] !== v) {
      m[k] = v;
      changed = true;
    }
  };
  if (full || has(o, 'position')) take('position', str(o.position));
  if (full || has(o, 'room')) take('room', str(o.room));
  if (full || has(o, 'mapid')) take('mapid', num(o.mapid));
  if (full || has(o, 'ride')) {
    const r = o.ride === true;
    if (m.ride !== r) {
      m.ride = r;
      changed = true;
    }
  }
  if (mergeFlags(m.flags, o, full)) changed = true;
  return changed;
}

/** The status flags of `o` into `flags`: all (`full`, absent is false) or those it carries. True when one changed. */
function mergeFlags(flags: MemberFlags, o: Obj, full: boolean): boolean {
  let changed = false;
  for (const f of STATUS_FLAGS) {
    if (!full && !has(o, f)) continue;
    const v = o[f] === true;
    if (flags[f] !== v) {
      flags[f] = v;
      changed = true;
    }
  }
  return changed;
}

/** The flags as a short key, to compare. */
const flagsKey = (flags: MemberFlags): string => STATUS_FLAGS.map((f) => (flags[f] ? 1 : 0)).join('');

/** A full member's payload (Set/Add) says it has no mana: `mana-string` not a word, no mana number. */
function noManaOf(o: Obj): boolean {
  return has(o, 'mana-string') && typeof o['mana-string'] !== 'string' && num(o.mana) === null && num(o.maxmana) === null;
}

/** An update brings mana: a number or a word. */
function bringsMana(o: Obj): boolean {
  return num(o.mana) !== null || num(o.maxmana) !== null || typeof o['mana-string'] === 'string';
}

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
  /** The last `opponent-hits` band word (shown only while there is an opponent). */
  private opponentWord: string | null = null;
  /** Your room (`Room.Info` `id`), or null. */
  private room: number | null = null;
  /** Your own entry's id (`type: "you"`), and its status flags. */
  private selfId: number | null = null;
  private self: MemberFlags = noFlags();
  /** The wound lines of the latest list of yours that had them, while `wound` is on. */
  private wounds: readonly string[] = [];
  /** Your wound lines while GMCP has no wound on (a light wound has no flag; addendum 38). */
  private lights: readonly string[] = [];

  /** You are bashed (a bash or a trip: no prompt until "Your head stops stinging."). */
  get selfBashed(): boolean {
    return this.self.bashed;
  }

  /** Your own entry's status flags (all false without one). Read-only. */
  get selfFlags(): Readonly<MemberFlags> {
    return this.self;
  }
  /** The `… wound at …` lines of your latest list that had them (none: not listed, or no wound). */
  get selfWounds(): readonly string[] {
    return this.wounds;
  }

  /**
   * Your wound lines from the latest list while GMCP has no `wound` on:
   * light wounds, which MUME sends no flag for (ADR 0166 addendum 38). The
   * flag means a bleeding wound; MUME clears it when the wound heals to
   * light, and its last listed lines then stand here until the next list.
   */
  get selfLightWounds(): readonly string[] {
    return this.lights;
  }

  /**
   * A whole affects list of yours (ADR 0166 addendum 36): `wounds` its
   * `… wound at …` lines, `poison` whether it has a `poison …` line.
   * Clears your `wound` / `poison` flag the list does not show; keeps the
   * wound lines while the flag is on. Never sets a flag. True on a change
   * (the version is bumped). `clear` says which flags this list may clear
   * (none given: both); a list that may not clear a flag still updates the
   * wound lines it shows.
   */
  noteSelfList(
    l: { wounds: readonly string[]; poison: boolean },
    clear: { wound: boolean; poison: boolean } = { wound: true, poison: true },
  ): boolean {
    let changed = false;
    if (!this.self.wound && (l.wounds.length > 0 || clear.wound) && l.wounds.join('\n') !== this.lights.join('\n')) {
      this.lights = [...l.wounds];
      changed = true;
    }
    if (this.self.wound) {
      if (l.wounds.length === 0) {
        if (clear.wound) {
          this.self.wound = false;
          this.wounds = [];
          changed = true;
        }
      } else if (l.wounds.join('\n') !== this.wounds.join('\n')) {
        this.wounds = [...l.wounds];
        changed = true;
      }
    }
    if (this.self.poison && !l.poison && clear.poison) {
      this.self.poison = false;
      changed = true;
    }
    if (changed) this.version++;
    return changed;
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
    const out = this.list().filter((m) => (m.type === 'npc' ? d.npcMode !== 'off' : d.showPlayers));
    if (d.npcMode === 'all') {
      out.push(...this.side.values());
      out.sort((a, b) => a.id - b.id);
    }
    return out;
  }

  /** Your room id (`Room.Info` `id`), or null. */
  get selfRoom(): number | null {
    return this.room;
  }

  /**
   * True when `m` is a player whose room is known and is not yours (ADR
   * 0122). NPCs are only reported in your room (ADR 0120): never away.
   */
  isAway(m: Member): boolean {
    return m.type !== 'npc' && m.mapid !== null && this.room !== null && m.mapid !== this.room;
  }

  /** The fight as `Char.Vitals` last told it (ADR 0122). */
  fight(): GroupFight {
    const opponentMember = this.opponent === null ? null : this.match(this.opponent);
    // MUME says `Nobody` when nobody buffers you: you take the hits yourself.
    const buffer = this.buffer !== null && foldName(this.buffer) === 'nobody' ? null : this.buffer;
    const tankMember = buffer === null ? null : this.match(buffer);
    return {
      opponent: this.opponent,
      opponentWord: this.opponent === null ? null : this.opponentWord,
      opponentMember,
      tank: this.opponent === null ? null : buffer,
      tankId: this.opponent === null ? null : (tankMember?.id ?? null),
    };
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
    this.opponentWord = null;
    this.room = null;
    this.selfId = null;
    this.self = noFlags();
    this.wounds = [];
    this.lights = [];
    this.version++;
  }

  /**
   * Applies `Group.*` and `Char.Vitals` (fight fields). Returns true when
   * the group changed.
   */
  apply(pkg: string, data: unknown): boolean {
    let changed: boolean;
    const woundBefore = this.self.wound;
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
        changed = this.applyFight(data);
        break;
      case 'room.info':
        changed = this.applyRoom(data);
        break;
      default:
        return false;
    }
    // GMCP ends a wound when it heals down to light: its lines become the
    // light wounds until the next list says what is left, so the stone dims
    // and never blinks out between (the owner, 2026-11-25). A wound GMCP
    // starts takes the light ones over.
    if (woundBefore && !this.self.wound) this.lights = this.wounds;
    else if (!woundBefore && this.self.wound) this.lights = [];
    if (!this.self.wound) this.wounds = [];
    if (changed) this.version++;
    return changed;
  }

  private set(data: unknown): boolean {
    const had = this.members.size + this.side.size;
    const wasFlags = flagsKey(this.self);
    this.members.clear();
    this.side.clear();
    this.selfId = null;
    this.self = noFlags();
    if (Array.isArray(data)) for (const m of data) this.add(m);
    return had > 0 || this.members.size + this.side.size > 0 || flagsKey(this.self) !== wasFlags;
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
      this.self = noFlags();
      mergeFlags(this.self, data, true);
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
      noMana: noManaOf(data),
      position: null,
      ride: false,
      room: null,
      mapid: null,
      flags: noFlags(),
    };
    for (const k of VITAL_KINDS) mergeVital(k, m[k], data, true);
    mergeFields(m, data, true);
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
    if (id === this.selfId) return mergeFlags(this.self, data, false);
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
        this.self = noFlags();
        mergeFlags(this.self, data, true);
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
    let placed = changed;
    if (m.noMana && bringsMana(data)) {
      m.noMana = false;
      changed = true;
    }
    for (const k of VITAL_KINDS) if (mergeVital(k, m[k], data, false)) changed = true;
    if (mergeFields(m, data, false)) changed = true;
    placed ||= changed;
    if (placed) {
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
      const was = flagsKey(this.self) !== flagsKey(noFlags());
      this.selfId = null;
      this.self = noFlags();
      return was;
    }
    const a = this.members.delete(id);
    const b = this.side.delete(id);
    return a || b;
  }

  /** `Room.Info` → your room id. */
  private applyRoom(data: unknown): boolean {
    if (!isObj(data)) return false;
    const id = num(data.id);
    if (id === this.room) return false;
    this.room = id;
    return true;
  }

  /**
   * `Char.Vitals` fight fields → the fight state and the matched member's
   * HP word. A change of the identities or the opponent's word counts.
   */
  private applyFight(data: unknown): boolean {
    if (!isObj(data)) return false;
    const before = `${this.buffer}|${this.opponent}|${this.opponentWord}`;
    if (has(data, 'buffer')) this.buffer = typeof data.buffer === 'string' && data.buffer ? data.buffer : null;
    if (has(data, 'opponent')) this.opponent = typeof data.opponent === 'string' && data.opponent ? data.opponent : null;
    // The last band word, as Char.Vitals keeps it (MUME sends the identity
    // and the first word together at fight start).
    const ow = data['opponent-hits'];
    if (typeof ow === 'string' && ow) this.opponentWord = ow;
    let changed = before !== `${this.buffer}|${this.opponent}|${this.opponentWord}`;
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
