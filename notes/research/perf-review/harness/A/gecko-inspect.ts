// Inspects the structure of a Gecko profile JSON (marker table format).
//   node perf/gecko-inspect.ts <profile.json>
import { readFileSync } from 'node:fs';
const prof = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
console.log('top keys', Object.keys(prof), 'meta.version', prof.meta?.version, 'preprocessed', prof.meta?.preprocessedProfileVersion);
const child = prof.processes?.[0];
console.log('child keys', child && Object.keys(child));
const t = child?.threads?.find((x: any) => x.name === 'GeckoMain');
console.log('thread keys', t && Object.keys(t));
console.log('markers keys', t && Object.keys(t.markers));
console.log('markers sample', JSON.stringify(t?.markers).slice(0, 1500));
console.log('stringTable', t && (t.stringTable ? (Array.isArray(t.stringTable) ? t.stringTable.slice(0, 20) : Object.keys(t.stringTable)) : null));
