// Builds the WebCockpit site for its host, locally or in CI: Cloudflare
// (ADR 0144; .github/workflows/deploy.yml runs `wrangler deploy` on the
// result) and, until it is retired, GitHub Pages (ADR 0028;
// .github/workflows/pages.yml uploads the result).
//
//   npm run build:site                       for the production Worker → dist-site/
//   npm run build:site -- --target staging   for the staging Worker: no version
//                                            rule (staging is not the live site)
//   npm run build:site -- --skip-live        no request to the live site (offline):
//                                            no version check against it, nothing carried
//   npm run build:pages                      the same build for GitHub Pages
//                                            (`--pages`) → dist-pages/, smoke-tested
//                                            with Pages' headers
//
// A production build's package.json version must differ from the live
// release's, unless it is the live commit being built again (ADR 0025,
// scripts/release.ts). In a tag build (GITHUB_REF_TYPE=tag) the tag must
// be `v<version>`.
//
// Steps, stopping at the first failure:
//   1. version checks (live release.json, tag)
//   2. typecheck and unit tests
//   3. `vite build` with the base taken from the live URL (`/`)
//   4. the smoke test (playwright.prod.config.ts) in the host's profile
//   5. carry the live release's own hashed assets (fetched from the live
//      site), so a tab opened before the deploy still finds its lazy chunks
//   6. the full release.json
//
// $WEBCOCKPIT_SITE_URL overrides the live site
// (default https://mumecockpit.com/, ADR 0029); its path is the base.
// $WEBCOCKPIT_SITE_DIR overrides the output directory.
// The earlier names $WEBCOCKPIT_PAGES_URL and $WEBCOCKPIT_PAGES_DIR still work.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANIFEST, type Release, isAssetName, parseRelease, releaseJson, versionGuard } from './release.ts';

const ROOT = resolve(import.meta.dirname, '..');
const FETCH_TIMEOUT_MS = 20_000;

const argv = process.argv.slice(2);
const skipLive = argv.includes('--skip-live');
/** `--pages`: the build for GitHub Pages (`npm run build:pages`). */
const pages = argv.includes('--pages');
const NAME = pages ? 'build:pages' : 'build:site';
const targetAt = argv.indexOf('--target');
const target = targetAt >= 0 ? argv[targetAt + 1] : 'production';
if (target !== 'production' && target !== 'staging') fail(`--target is production or staging, not ${target}`);
if (pages && target !== 'production') fail('--pages is always the production site');
for (const [i, a] of argv.entries()) {
  if (!['--skip-live', '--pages', '--target'].includes(a) && argv[i - 1] !== '--target') fail(`unknown argument ${a}`);
}

const LIVE = `${(process.env.WEBCOCKPIT_SITE_URL ?? process.env.WEBCOCKPIT_PAGES_URL ?? 'https://mumecockpit.com/').replace(/\/+$/, '')}/`;
const BASE = new URL(LIVE).pathname;
const OUT = resolve(ROOT, process.env.WEBCOCKPIT_SITE_DIR ?? process.env.WEBCOCKPIT_PAGES_DIR ?? (pages ? 'dist-pages' : 'dist-site'));

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): void {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed (exit ${r.status ?? r.signal})`);
}

function fail(msg: string): never {
  console.error(`\n${pages ? 'build:pages' : 'build:site'}: ${msg}`);
  process.exit(1);
}

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

/** A file from the live site, or null (404, unreachable, timeout). */
async function fetchLive(path: string): Promise<Response | null> {
  try {
    const res = await fetch(new URL(path, LIVE), { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

/** The live release, or null when there is none (or the site cannot be reached). */
async function liveRelease(): Promise<Release | null> {
  const res = await fetchLive(MANIFEST);
  return res ? parseRelease(await res.text()) : null;
}

const dirty = git('status', '--porcelain') !== '';
const commit = git('rev-parse', '--short', 'HEAD');
const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
console.log(`${NAME}: ${version} ${commit}${dirty ? ' (dirty)' : ''} for ${LIVE} (${target}) → ${OUT}`);

step('version checks');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  fail(`tag ${process.env.GITHUB_REF_NAME} does not match package.json version ${version} (expected v${version})`);
}
const live = skipLive ? null : await liveRelease();
console.log(skipLive ? 'live site skipped (--skip-live)' : live ? `live: ${live.version} ${live.commit}` : 'no live release');
if (target === 'staging') {
  console.log('staging: no version rule');
} else {
  const refused = versionGuard(live, { version, commit });
  if (refused) fail(refused);
}

step('typecheck');
run('npm', ['run', '--silent', 'typecheck']);

step('unit tests');
run('npx', ['vitest', 'run']);

step(`build (base ${BASE})`);
run('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { WEBCOCKPIT_BASE: BASE });
const own = readdirSync(join(OUT, 'assets')).sort();
// Cloudflare's own files stay out of the Pages build: GitHub Pages would
// serve `_headers` as a file and use a root `404.html` as its 404 page,
// and the Pages site is to stay as it is until it is retired (ADR 0144).
if (pages) for (const name of ['_headers', '404.html']) rmSync(join(OUT, name), { force: true });

step(`smoke test (${pages ? 'pages' : 'cloudflare'} profile)`);
run('npx', ['playwright', 'test', '-c', 'playwright.prod.config.ts'], {
  WC_PROD_DIR: OUT,
  WC_PROD_BASE: BASE,
  WC_PROD_PROFILE: pages ? 'pages' : 'cloudflare',
  // The smoke test is of this build, whatever the caller's shell points at.
  WC_PROD_URL: '',
});

step('carry over live assets');
let carried = 0;
let missed = 0;
for (const name of live?.assets ?? []) {
  const to = join(OUT, 'assets', name);
  if (!isAssetName(name) || existsSync(to)) continue;
  const res = await fetchLive(`assets/${encodeURIComponent(name)}`);
  if (!res) {
    missed++;
    continue;
  }
  writeFileSync(to, new Uint8Array(await res.arrayBuffer()));
  carried++;
}
console.log(live ? `${carried} file(s) from ${live.commit}${missed ? `, ${missed} could not be fetched` : ''}` : 'no live release');
writeFileSync(join(OUT, MANIFEST), releaseJson({ version, commit, dirty, assets: own }));

console.log(`\n${NAME}: ${version} ${commit} ready in ${OUT}`);
