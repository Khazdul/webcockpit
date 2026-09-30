// Compares two Chromium heap snapshots by constructor (perf review D).
//
//   node --max-old-space-size=8192 perf/heap-diff.ts <a.heapsnapshot> <b.heapsnapshot> [top=30]
//
// Aggregates nodes by `type:name` (count, self size) in each snapshot and
// prints the biggest growth (by self size and by count), the totals, and
// DOM nodes by detachedness (Chromium marks detached DOM wrappers).

import { readFileSync } from 'node:fs';

interface Snap {
  snapshot: { meta: { node_fields: string[]; node_types: [string[], ...unknown[]] } };
  nodes: number[];
  strings: string[];
}

interface Agg {
  count: number;
  size: number;
}

function load(file: string): { by: Map<string, Agg>; total: Agg; detached: Map<string, Agg>; nodeCount: number } {
  const s = JSON.parse(readFileSync(file, 'utf8')) as Snap;
  const f = s.snapshot.meta.node_fields;
  const types = s.snapshot.meta.node_types[0];
  const nf = f.length;
  const iType = f.indexOf('type');
  const iName = f.indexOf('name');
  const iSize = f.indexOf('self_size');
  const iDet = f.indexOf('detachedness');
  const by = new Map<string, Agg>();
  const detached = new Map<string, Agg>();
  const total: Agg = { count: 0, size: 0 };
  const nodes = s.nodes;
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + iType]!]!;
    let name = s.strings[nodes[i + iName]!]!;
    if (type === 'string' || type === 'concatenated string' || type === 'sliced string') name = '(string)';
    else if (type === 'code') name = '(code)';
    else if (type === 'array') name = `(array) ${name}`;
    else if (type === 'closure') name = '(closure)';
    else if (type === 'hidden' || type === 'object shape') name = `(${type}) ${name.slice(0, 40)}`;
    else if (name.length > 60) name = name.slice(0, 60) + '…';
    const key = `${type}:${name}`;
    const size = nodes[i + iSize]!;
    const a = by.get(key) ?? by.set(key, { count: 0, size: 0 }).get(key)!;
    a.count++;
    a.size += size;
    total.count++;
    total.size += size;
    if (iDet >= 0 && nodes[i + iDet] === 2) {
      const d = detached.get(key) ?? detached.set(key, { count: 0, size: 0 }).get(key)!;
      d.count++;
      d.size += size;
    }
  }
  return { by, total, detached, nodeCount: nodes.length / nf };
}

const [fa, fb, topS] = process.argv.slice(2);
if (!fa || !fb) {
  console.error('usage: heap-diff.ts a.heapsnapshot b.heapsnapshot [top]');
  process.exit(1);
}
const top = Number(topS ?? 30);
const A = load(fa);
const B = load(fb);
const mb = (n: number): string => (n / 1e6).toFixed(2);
console.log(`A ${fa}: ${A.total.count} nodes, ${mb(A.total.size)} MB self`);
console.log(`B ${fb}: ${B.total.count} nodes, ${mb(B.total.size)} MB self`);
const keys = new Set([...A.by.keys(), ...B.by.keys()]);
const rows = [...keys].map((k) => {
  const a = A.by.get(k) ?? { count: 0, size: 0 };
  const b = B.by.get(k) ?? { count: 0, size: 0 };
  return { k, ac: a.count, bc: b.count, as: a.size, bs: b.size, dc: b.count - a.count, ds: b.size - a.size };
});
const show = (title: string, list: typeof rows): void => {
  console.log(`\n${title}`);
  console.log('Δsize(KB)  Δcount   A count   B count   B size(KB)  type:name');
  for (const r of list)
    console.log(
      `${(r.ds / 1e3).toFixed(1).padStart(9)} ${String(r.dc).padStart(8)} ${String(r.ac).padStart(9)} ${String(r.bc).padStart(9)} ${(r.bs / 1e3).toFixed(1).padStart(11)}  ${r.k}`,
    );
};
show('Top growth by self size', [...rows].sort((x, y) => y.ds - x.ds).slice(0, top));
show('Top growth by count', [...rows].sort((x, y) => y.dc - x.dc).slice(0, top));
show('Top shrink by self size', [...rows].sort((x, y) => x.ds - y.ds).slice(0, 10));
show('Largest in B by self size', [...rows].sort((x, y) => y.bs - x.bs).slice(0, top));
const det = (m: Map<string, Agg>): string =>
  [...m.entries()]
    .sort((x, y) => y[1].count - x[1].count)
    .slice(0, 12)
    .map(([k, v]) => `${k} ×${v.count}`)
    .join(', ') || 'none';
console.log(`\nDetached (A): ${det(A.detached)}`);
console.log(`Detached (B): ${det(B.detached)}`);
