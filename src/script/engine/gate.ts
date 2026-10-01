// Literal gates for rule lists (stage 8 part C #11).
//
// Most rules fail on most lines, and each one that has a required literal
// (`CompiledPattern.literal`, a substring every match contains) would be
// rejected by its own `indexOf`. A gate tests one combined RegExp of all
// the list's literals instead: when none occurs in the text, only the
// rules without a literal can match, and the loop jumps straight between
// them. When one occurs, every rule runs its own checks as before, so a
// gated loop matches exactly what an ungated one does.
//
// Rules without a literal are never skipped: catch-alls, `%i` patterns,
// patterns with `$var` (compiled at match time, so their text can change
// with every variable) and patterns made only of wildcards.
//
// Rule lists are copy-on-write (RuleStore), so a list is its own version:
// gates are cached per list in a WeakMap, and any rule change, class kill
// or profile load gives a new list and so a new gate. A gate is built only
// once its list has been used `GATE_MIN_USES` times, so lists that change
// on every line (a rule defined by an action) never pay for a RegExp
// compile.

import type { Rule } from './store';

/** Shorter lists are not gated: a few `indexOf` calls cost less than a RegExp test. */
export const GATE_MIN_RULES = 4;
/** Uses of a list before its gate is built. */
export const GATE_MIN_USES = 8;

export interface LiteralGate {
  /** Matches when at least one rule's literal occurs in the text. */
  readonly re: RegExp;
  /**
   * `next[i]` is the index of the first rule at or after `i` without a
   * literal (the list length when there is none); `next[length]` is the
   * length.
   */
  readonly next: Int32Array;
}

const RE_SPECIAL = /[.*+?^${}()|[\]\\/]/g;

interface Entry {
  uses: number;
  gate: LiteralGate | null;
}

export class GateCache {
  private readonly entries = new WeakMap<readonly Rule[], Entry>();
  private readonly enabled: boolean;

  /** `enabled` false: no list is ever gated. */
  constructor(enabled = true) {
    this.enabled = enabled;
  }

  /**
   * The rules of `list` to try on `text`, as a jump table: null means every
   * rule (no gate, or a literal occurs in the text), otherwise `next` as in
   * `LiteralGate` (only rules without a literal can match).
   */
  skipTable(list: readonly Rule[], text: string): Int32Array | null {
    const gate = this.gate(list);
    return gate === null || gate.re.test(text) ? null : gate.next;
  }

  /** The list's gate, or null when it is not gated (yet). */
  gate(list: readonly Rule[]): LiteralGate | null {
    if (list.length < GATE_MIN_RULES || !this.enabled) return null;
    let e = this.entries.get(list);
    if (e === undefined) {
      e = { uses: 0, gate: null };
      this.entries.set(list, e);
    }
    if (e.uses < GATE_MIN_USES && ++e.uses === GATE_MIN_USES) e.gate = buildGate(list);
    return e.gate;
  }
}

/** Builds a list's gate, or null when no rule has a literal. */
export function buildGate(list: readonly Rule[]): LiteralGate | null {
  const n = list.length;
  const next = new Int32Array(n + 1);
  const literals = new Set<string>();
  let open = n;
  next[n] = n;
  for (let i = n - 1; i >= 0; i--) {
    const lit = list[i]!.compiled?.literal ?? '';
    if (lit) literals.add(lit.replace(RE_SPECIAL, '\\$&'));
    else open = i;
    next[i] = open;
  }
  if (literals.size === 0) return null;
  return { re: new RegExp([...literals].join('|')), next };
}
