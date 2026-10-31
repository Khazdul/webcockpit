// Rebasing profile edits onto a newer stored text (ADR 0105).
//
// The profile editor applies while it stays open, and the stored text can
// change under it meanwhile (typed settings, script variables written back,
// ADR 0038). Its edits are kept as a document whose node ids it shares with
// `base`, the text it last stored or read: a node with a base id is that
// node (edited when its text differs), a node with another id is new, and a
// base id that is missing was deleted.
//
//   alignDoc(base, parseProfile(stored))   ids of a fresh parse matched to base
//   rebaseDoc(base, local, onto)           local's changes applied onto `onto`
//
// `alignDoc` matches nodes by equal text (longest common subsequence after
// the common prefix and suffix are cut), then pairs what is left between two
// matches when both are entries of one kind with one pattern (`#alias {x}`
// rewritten). Unmatched nodes get ids of their own: negative, from one
// counter for the page, so they never meet the positive ids a document
// hands out (`nextId`) nor the editor's sentinel (-1).
//
// `rebaseDoc` starts from `onto` (aligned to `base`) and lays the local
// changes over it: a node local changed or added replaces the node with
// its id, or is inserted after the local node before it; a node local
// deleted is removed. A node local did not change keeps the `onto` version,
// so an outside change wins there, and a local change wins over an outside
// change to the same node.

import type { DocNode, ProfileDoc } from './model';

let foreign = -1000;
/** An id no document hands out (see the header). */
export const foreignId = (): number => foreign--;

/** Above this many cells the middle of an alignment is matched greedily. */
const LCS_CELLS = 1_000_000;

/** Index pairs `[i, j]` with `a[i] === b[j]`, increasing in both. */
function matchTexts(a: readonly string[], b: readonly string[]): [number, number][] {
  const out: [number, number][] = [];
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) {
    out.push([lo, lo]);
    lo++;
  }
  let ea = a.length;
  let eb = b.length;
  const tail: [number, number][] = [];
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
    tail.push([ea, eb]);
  }
  const n = ea - lo;
  const m = eb - lo;
  if (n > 0 && m > 0) {
    if (n * m <= LCS_CELLS) {
      // dp[i][j]: LCS length of a[lo+i..ea) and b[lo+j..eb).
      const w = m + 1;
      const dp = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          dp[i * w + j] = a[lo + i] === b[lo + j] ? dp[(i + 1) * w + j + 1]! + 1 : Math.max(dp[(i + 1) * w + j]!, dp[i * w + j + 1]!);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (a[lo + i] === b[lo + j]) {
          out.push([lo + i, lo + j]);
          i++;
          j++;
        } else if (dp[(i + 1) * w + j]! >= dp[i * w + j + 1]!) i++;
        else j++;
      }
    } else {
      // Greedy: each line of `a` takes the next equal line of `b`.
      const at = new Map<string, number[]>();
      for (let j = lo; j < eb; j++) {
        const l = at.get(b[j]!);
        if (l) l.push(j);
        else at.set(b[j]!, [j]);
      }
      let next = lo;
      for (let i = lo; i < ea; i++) {
        const l = at.get(a[i]!);
        if (!l) continue;
        while (l.length && l[0]! < next) l.shift();
        const j = l.shift();
        if (j === undefined) continue;
        out.push([i, j]);
        next = j + 1;
      }
    }
  }
  for (let k = tail.length - 1; k >= 0; k--) out.push(tail[k]!);
  return out;
}

const entryKey = (n: DocNode): string | null => (n.type === 'entry' ? `${n.kind}\u0000${n.pattern}` : null);

const withId = (n: DocNode, id: number): DocNode => (n.id === id ? n : { ...n, id });

/**
 * `next` with its node ids matched to `base` (see the header): a node that
 * is a base node, or an entry rewritten in place, takes the base id; the
 * others get foreign ids. Texts are untouched.
 */
export function alignDoc(base: ProfileDoc, next: ProfileDoc): ProfileDoc {
  const a = base.nodes;
  const b = next.nodes;
  const ids: (number | null)[] = b.map(() => null);
  const pairs = matchTexts(
    a.map((n) => n.text),
    b.map((n) => n.text),
  );
  // The gaps between matches: entries of one kind and pattern pair up.
  let pi = 0;
  let pj = 0;
  const gap = (ei: number, ej: number): void => {
    const free = new Map<string, number[]>();
    for (let i = pi; i < ei; i++) {
      const k = entryKey(a[i]!);
      if (k === null) continue;
      const l = free.get(k);
      if (l) l.push(i);
      else free.set(k, [i]);
    }
    for (let j = pj; j < ej; j++) {
      const k = entryKey(b[j]!);
      const i = k === null ? undefined : free.get(k)?.shift();
      if (i !== undefined) ids[j] = a[i]!.id;
    }
  };
  for (const [i, j] of pairs) {
    gap(i, j);
    ids[j] = a[i]!.id;
    pi = i + 1;
    pj = j + 1;
  }
  gap(a.length, b.length);
  const nodes = b.map((n, j) => withId(n, ids[j] ?? foreignId()));
  return { ...next, nodes, nextId: Math.max(next.nextId, base.nextId) };
}

/** `node` with a final line break (only a document's last node can lack one). */
function withEol(node: DocNode, eol: string): DocNode {
  if (node.text.endsWith('\n')) return node;
  const { source: _source, ...rest } = node;
  if (rest.type === 'entry') return { ...rest, text: rest.text + eol, eol };
  return { ...rest, text: rest.text + eol };
}

/**
 * `local`'s changes against `base` laid over `onto` (see the header). All
 * three share ids: `local` by its edits, `onto` through `alignDoc`.
 */
export function rebaseDoc(base: ProfileDoc, local: ProfileDoc, onto: ProfileDoc): ProfileDoc {
  const baseText = new Map(base.nodes.map((n) => [n.id, n.text]));
  const localIds = new Set(local.nodes.map((n) => n.id));
  // A node local deleted goes.
  const out: DocNode[] = onto.nodes.filter((n) => !(baseText.has(n.id) && !localIds.has(n.id)));
  const index = (id: number): number => out.findIndex((n) => n.id === id);
  let anchor: number | null = null; // the id of the last local node seen in `out`
  for (const n of local.nodes) {
    const was = baseText.get(n.id);
    const at = index(n.id);
    if (was !== undefined && was === n.text) {
      // Unchanged here: the `onto` version stays (it may be gone there).
      if (at >= 0) anchor = n.id;
      continue;
    }
    if (at >= 0) out[at] = n;
    else {
      const after = anchor === null ? -1 : index(anchor);
      out.splice(after + 1, 0, n);
    }
    anchor = n.id;
  }
  const eol = onto.eol;
  for (let i = 0; i < out.length - 1; i++) out[i] = withEol(out[i]!, eol);
  return { nodes: out, nextId: Math.max(local.nextId, onto.nextId, base.nextId), eol };
}
