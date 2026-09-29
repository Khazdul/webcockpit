// Builds WebCockpit for GitHub Pages (ADR 0028), locally or in CI
// (.github/workflows/pages.yml, which uploads the result).
//
//   npm run build:pages                 check, build, smoke test, carry, manifest
//   npm run build:pages -- --skip-live  no request to the live site (offline):
//                                       no version check against it, nothing carried
//
// The package.json version must differ from the live release's (ADR 0025).
// In a tag build (GITHUB_REF_TYPE=tag) the tag must be `v<version>`.
//
// Steps, stopping at the first failure:
//   1. version checks (live release.json, tag)
//   2. typecheck and unit tests
//   3. `vite build` with the base taken from the live URL (`/`)
//   4. the smoke test (playwright.prod.config.ts)
//   5. carry the live release's own hashed assets (fetched from the live
//      site), so a tab opened before the deploy still finds its lazy chunks
//   6. the full release.json
//
// $WEBCOCKPIT_PAGES_URL overrides the live site
// (default https://mumecockpit.com/, ADR 0029); its path is the base.
// $WEBCOCKPIT_PAGES_DIR overrides the output directory (default dist-pages).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MANIFEST, type Release, isAssetName, parseRelease, releaseJson, versionGuard } from './release.ts';

const ROOT = resolve(import.meta.dirname, '..');
const LIVE = `${(process.env.WEBCOCKPIT_PAGES_URL ?? 'https://mumecockpit.com/').replace(/\/+$/, '')}/`;
const BASE = new URL(LIVE).pathname;
const OUT = resolve(ROOT, process.env.WEBCOCKPIT_PAGES_DIR ?? 'dist-pages');
const FETCH_TIMEOUT_MS = 20_000;

const args = new Set(process.argv.slice(2));
const skipLive = args.has('--skip-live');

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function run(cmd: string, argv: string[], env: Record<string, string> = {}): void {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`${cmd} ${argv.join(' ')} failed (exit ${r.status ?? r.signal})`);
}

function fail(msg: string): never {
  console.error(`\nbuild:pages: ${msg}`);
  process.exit(1);
}

function git(...argv: string[]): string {
  return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' }).trim();
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
console.log(`build:pages: ${version} ${commit}${dirty ? ' (dirty)' : ''} for ${LIVE} → ${OUT}`);

step('version checks');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  fail(`tag ${process.env.GITHUB_REF_NAME} does not match package.json version ${version} (expected v${version})`);
}
const live = skipLive ? null : await liveRelease();
console.log(skipLive ? 'live site skipped (--skip-live)' : live ? `live: ${live.version} ${live.commit}` : 'no live release');
const refused = versionGuard(live?.version ?? null, version);
if (refused) fail(refused);

step('typecheck');
run('npx', ['tsc', '--noEmit']);

step('unit tests');
run('npx', ['vitest', 'run']);

step(`build (base ${BASE})`);
run('npx', ['vite', 'build', '--outDir', OUT, '--emptyOutDir'], { WEBCOCKPIT_BASE: BASE });
const own = readdirSync(join(OUT, 'assets')).sort();

step('smoke test');
run('npx', ['playwright', 'test', '-c', 'playwright.prod.config.ts'], { WC_PROD_DIR: OUT, WC_PROD_BASE: BASE });

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

console.log(`\nbuild:pages: ${version} ${commit} ready in ${OUT}`);
