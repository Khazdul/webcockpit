// Runs the dev server together with the local Worker (spec §7.1, ADR 0144):
//
//   npm run dev:cloud [-- <vite arguments>]
//
// Starts `wrangler dev` (the Worker of wrangler.jsonc in workerd, with
// local bindings) on 127.0.0.1:$WC_API_PORT (default 8787; a worktree picks
// its own) and `vite` with $WEBCOCKPIT_API_PROXY set, so the dev server
// proxies `/api` to it (vite.config.ts). Plain `npm run dev` is unchanged:
// no Worker, no proxy.
//
// The Worker's static assets are not the site here (Vite serves the app):
// they are a directory of this script's own with only a `release.json`
// that says what the dev client says of itself (the package.json version,
// commit `dev`), so no `dist-site/` is needed and an old build in it
// cannot answer for the running code.
//
// Either process ending ends the other; Ctrl-C ends both.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const port = Number(process.env.WC_API_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`dev:cloud: WC_API_PORT is not a port: ${process.env.WC_API_PORT}`);
  process.exit(1);
}

const assets = join(ROOT, 'node_modules', '.cache', 'webcockpit-dev-cloud');
const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
mkdirSync(assets, { recursive: true });
writeFileSync(join(assets, 'release.json'), `${JSON.stringify({ version, commit: 'dev' }, null, 2)}\n`);

const origin = `http://127.0.0.1:${port}`;
console.log(`dev:cloud: Worker at ${origin}, /api proxied to it`);

const children: ChildProcess[] = [];
let ending = false;
function end(code: number): void {
  if (ending) return;
  ending = true;
  for (const c of children) if (c.exitCode === null && c.signalCode === null) c.kill('SIGTERM');
  process.exitCode = code;
}
function start(cmd: string, args: string[], env: Record<string, string> = {}): void {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  children.push(child);
  child.on('error', (err) => {
    console.error(`dev:cloud: ${cmd}: ${err.message}`);
    end(1);
  });
  child.on('exit', (code, signal) => end(signal ? 1 : (code ?? 0)));
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.on(signal, () => end(0));

start('wrangler', ['dev', '--ip', '127.0.0.1', '--port', String(port), '--assets', assets, '--show-interactive-dev-session=false']);
start('vite', process.argv.slice(2), { WEBCOCKPIT_API_PROXY: origin });
