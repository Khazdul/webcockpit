// Prints the style runs the real LineAssembler makes for a payload's lines.
//   node perf/runs-dump.ts <payload> [firstRow=0] [nRows=3]
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(specifier + '.ts', context);
      throw err;
    }
  },
});
const { Bus } = await import('../src/core/bus.ts');
const { LineAssembler } = await import('../src/text/assembler.ts');
const { payloads } = await import('./payloads.ts');
const [name = 'p24b', first = '0', n = '3'] = process.argv.slice(2);
const p = payloads().find((x) => x.name === name)!;
const bus = new Bus();
const lines: any[] = [];
bus.on('text.line', (l: any) => lines.push(l));
const asm = new LineAssembler(bus);
for (const l of p.lines) asm.text(l.slice(17) + '\r\n', 0);
for (const l of lines.slice(Number(first), Number(first) + Number(n))) {
  const runs = l.runs as any[];
  const keys = new Set(runs.flatMap((r) => Object.keys(r)));
  console.log(JSON.stringify(l.text.slice(0, 40)), 'len', l.text.length, 'runs', runs.length, 'keys', [...keys].join(','), 'first', JSON.stringify(runs[0]), 'last', JSON.stringify(runs.at(-1)));
  const fgs = new Set(runs.map((r) => r.fg));
  console.log('   distinct fg', [...fgs].map((x) => (x === undefined ? 'undef' : x.toString(16))).join(','), 'contiguous', runs.every((r, i) => i === 0 || runs[i - 1].end === r.start));
}
