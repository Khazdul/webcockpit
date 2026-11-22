// Copies the stage's drawings into the app (src/panes/portraits/), with
// their imports rewritten: parts*.ts and draw/<group>.ts. A build tool of
// the portrait pass (ADR 0166 addendum 12).
//
//   node notes/research/portraits/stage/port.mjs [group …]   (default: every draw file)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', '..', 'src', 'panes', 'portraits');
const groups = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(here, 'draw')).filter((f) => f.endsWith('.ts')).map((f) => f.slice(0, -3));
const fix = (s) => s
  .replaceAll("'../../../../../src/panes/portraits/", "'./")
  .replaceAll("'../../../../../src/art/", "'../../art/")
  .replaceAll("'../../../../src/panes/portraits/", "'./")
  .replaceAll("'../../../../src/art/", "'../../art/")
  .replaceAll("from '../parts", "from './parts");
for (const f of readdirSync(here).filter((f) => /^parts(-[a-z]+)?\.ts$/.test(f))) writeFileSync(join(out, f), fix(readFileSync(join(here, f), 'utf8')));
for (const g of groups) writeFileSync(join(out, `${g}.ts`), fix(readFileSync(join(here, 'draw', `${g}.ts`), 'utf8')));
console.log('ported', groups.join(' '));
