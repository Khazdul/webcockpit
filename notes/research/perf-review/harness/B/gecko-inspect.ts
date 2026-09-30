// Prints the structure of a Gecko profile (threads, schemas, sample frame strings).
import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const visit = (q: any, depth: number): void => {
  console.log(' '.repeat(depth), 'meta.startTime', q.meta?.startTime, 'categories', q.meta?.categories?.map((c: any) => c.name).join('|'));
  for (const t of q.threads) {
    console.log(' '.repeat(depth), 'thread', t.name, t.processType, t.processName, 'samples', t.samples?.data?.length, 'strings', t.stringTable?.length);
    if (t.name === 'GeckoMain' && t.samples?.data?.length > 1000) {
      console.log(' '.repeat(depth), 'samples.schema', JSON.stringify(t.samples.schema), 'stack', JSON.stringify(t.stackTable.schema), 'frame', JSON.stringify(t.frameTable.schema));
      console.log(' '.repeat(depth), 'first sample', JSON.stringify(t.samples.data[0]), 'last', JSON.stringify(t.samples.data.at(-1)));
      const js = t.stringTable.filter((s: string) => /http:\/\/localhost/.test(s)).slice(0, 8);
      console.log(' '.repeat(depth), 'js strings', js);
      console.log(' '.repeat(depth), 'frame rows', JSON.stringify(t.frameTable.data.slice(0, 3)));
      const fr = t.frameTable.data.find((r: any[]) => /localhost/.test(t.stringTable[r[t.frameTable.schema.location]] ?? ''));
      console.log(' '.repeat(depth), 'a js frame row', JSON.stringify(fr), t.stringTable[fr?.[t.frameTable.schema.location]]);
    }
  }
  for (const c of q.processes ?? []) visit(c, depth + 2);
};
visit(p, 0);
