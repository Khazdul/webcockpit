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
// The local D1 (in .wrangler/) gets the migrations of worker/migrations
// first (`wrangler d1 migrations apply DB --local`; what is applied is
// skipped). The Worker runs as production is configured: the flag `stats`
// is off unless a `flag` row says otherwise
// (`wrangler d1 execute DB --local --command "INSERT INTO flag VALUES ('stats', 1)"`;
// the same with 'accounts' opens the account endpoints).
//
// What the accounts need of secrets (stage 60, ADR 0145) is passed as
// `--var`, so no `.dev.vars` file is needed: Cloudflare's published
// Turnstile test keys (the widget always passes and siteverify accepts
// only its dummy token) and a fixed pepper that is no secret. They exist
// in this local Worker only.
//
// Either process ending ends the other; Ctrl-C ends both.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
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

/** Local stand-ins for the account secrets and the site key (see the top). */
const DEV_VARS = [
  'AUTH_PEPPER:dev-cloud-pepper-not-a-secret-0123456789',
  'TURNSTILE_SECRET:1x0000000000000000000000000000000AA',
  'TURNSTILE_SITE_KEY:1x00000000000000000000AA',
];

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

const migrated = spawnSync('wrangler', ['d1', 'migrations', 'apply', 'DB', '--local'], {
  cwd: ROOT,
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});
if (migrated.status !== 0) {
  console.error('dev:cloud: the local D1 migrations failed');
  process.exit(1);
}

start('wrangler', [
  'dev',
  '--ip',
  '127.0.0.1',
  '--port',
  String(port),
  '--assets',
  assets,
  '--show-interactive-dev-session=false',
  ...DEV_VARS.flatMap((v) => ['--var', v]),
]);
start('vite', process.argv.slice(2), { WEBCOCKPIT_API_PROXY: origin });
