// Can we see Firefox GC/CC pause logs from a Playwright-launched Firefox?
//   node perf/probe-ffgc.ts
const { firefox } = await import('@playwright/test');
const server = await firefox.launchServer({
  firefoxUserPrefs: {
    'javascript.options.mem.log': true,
    'javascript.options.mem.notify': true,
    'devtools.console.stdout.chrome': true,
    'devtools.console.stdout.content': true,
    'browser.dom.window.dump.enabled': true,
  },
  env: { ...process.env, JS_GC_PROFILE: '0', JS_GC_PROFILE_NURSERY: '5' },
});
const proc = server.process();
console.log('pid', proc.pid);
let out = '';
proc.stdout?.on('data', (d) => (out += d.toString()));
proc.stderr?.on('data', (d) => (out += d.toString()));
const b = await firefox.connect(server.wsEndpoint());
const p = await b.newPage();
await p.setContent('<div id=x></div>');
await p.evaluate(async () => {
  const keep: unknown[] = [];
  for (let k = 0; k < 40; k++) {
    for (let i = 0; i < 200000; i++) keep.push({ i, s: 'x' + i });
    keep.length = 0;
    const d = document.getElementById('x')!;
    for (let i = 0; i < 20000; i++) d.appendChild(document.createElement('span'));
    d.textContent = '';
    await new Promise((r) => setTimeout(r, 50));
  }
});
await new Promise((r) => setTimeout(r, 3000));
await b.close();
await server.close();
const lines = out.split('\n').filter((l) => /GC|CC/.test(l));
console.log('total out', out.length, JSON.stringify(out.slice(0, 1500)));
console.log('lines', lines.length);
console.log(lines.slice(0, 15).join('\n'));
