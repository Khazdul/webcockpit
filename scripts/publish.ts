// Publishes WebCockpit to the owner's static site directory (ADR 0022).
//
//   npm run publish                 gate, build, check, swap in
//   npm run publish -- --dry-run    everything except the swap
//   npm run publish -- --allow-dirty  publish from uncommitted changes
//   npm run publish -- --rollback   swap the live and the previous release
//
// The package.json version must differ from the live release's (ADR 0025):
// bump it (`npm version patch --no-git-tag-version`) and commit before
// publishing. A dry run only warns.
//
// Steps, stopping at the first failure (the live site is then untouched):
//   1. typecheck and unit tests
//   2. `vite build` into a staging directory next to the site directory
//   3. the site-root smoke test (playwright.prod.config.ts) against staging
//   4. carry the live release's own hashed assets into staging, so a tab
//      opened before the swap still finds its lazy chunks
//   5. swap staging and the live directory with one rename(2)
//      (RENAME_EXCHANGE, `mv --exchange`), then keep the old one as `.prev`
//
// $WEBCOCKPIT_PUBLISH_DIR overrides the site directory
// (default ~/.local/share/tailweb/sajter/webcockpit).
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { versionGuard } from './publish-guard.ts';
import { MANIFEST, type Release, parseRelease, releaseJson } from './release.ts';

const ROOT = resolve(import.meta.dirname, '..');
const SITE = resolve(process.env.WEBCOCKPIT_PUBLISH_DIR ?? join(homedir(), '.local/share/tailweb/sajter/webcockpit'));
const STAGING = join(dirname(SITE), `.${basename(SITE)}.staging`);
const PREV = join(dirname(SITE), `.${basename(SITE)}.prev`);

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const allowDirty = args.has('--allow-dirty');

if (args.has('--rollback')) {
  if (!existsSync(SITE) || !existsSync(PREV)) fail(`nothing to roll back to (${PREV} missing)`);
  run('mv', ['--exchange', '--no-target-directory', PREV, SITE]);
  const r = readRelease(SITE);
  console.log(`publish: live at ${SITE} is now ${r ? `${r.version} ${r.commit}` : 'the previous release'}; run --rollback again to undo`);
  process.exit(0);
}

function step(title: string): void {
  console.log(`\n== ${title}`);
}

function run(cmd: string, argv: string[], env: Record<string, string> = {}): void {
  const r = spawnSync(cmd, argv, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) fail(`${cmd} ${argv.join(' ')} failed (exit ${r.status ?? r.signal})`);
}

function fail(msg: string): never {
  console.error(`\npublish: ${msg}\nThe live site is unchanged.`);
  rmSync(STAGING, { recursive: true, force: true });
  process.exit(1);
}

function git(...argv: string[]): string {
  return execFileSync('git', argv, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function readRelease(dir: string): Release | null {
  try {
    return parseRelease(readFileSync(join(dir, MANIFEST), 'utf8'));
  } catch {
    return null;
  }
}

const dirty = git('status', '--porcelain') !== '';
if (dirty && !allowDirty) fail('the working tree has uncommitted changes (commit first, or pass --allow-dirty)');
const commit = git('rev-parse', '--short', 'HEAD');
const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
console.log(`publish: ${version} ${commit}${dirty ? ' (dirty)' : ''} → ${SITE}${dryRun ? ' (dry run)' : ''}`);
const refused = versionGuard(readRelease(SITE)?.version ?? null, version);
if (refused && !dryRun) fail(refused);
if (refused) console.warn(`publish (dry run): ${refused}`);

step('typecheck');
run('npx', ['tsc', '--noEmit']);

step('unit tests');
run('npx', ['vitest', 'run']);

step('build');
mkdirSync(dirname(SITE), { recursive: true });
rmSync(STAGING, { recursive: true, force: true });
run('npx', ['vite', 'build', '--outDir', STAGING, '--emptyOutDir']);
const own = readdirSync(join(STAGING, 'assets')).sort();

step('site-root smoke test');
run('npx', ['playwright', 'test', '-c', 'playwright.prod.config.ts'], { WC_PROD_DIR: STAGING });

step('carry over live assets');
const live = existsSync(SITE) ? readRelease(SITE) : null;
let carried = 0;
for (const name of live?.assets ?? []) {
  const from = join(SITE, 'assets', name);
  const to = join(STAGING, 'assets', name);
  if (existsSync(from) && !existsSync(to)) {
    cpSync(from, to, { preserveTimestamps: true });
    carried++;
  }
}
console.log(live ? `${carried} file(s) from ${live.commit}` : 'no live release');
writeFileSync(join(STAGING, MANIFEST), releaseJson({ version, commit, dirty, assets: own }));

if (dryRun) {
  console.log(`\npublish: dry run done; staged build left in ${STAGING}`);
  process.exit(0);
}

step('swap');
if (existsSync(SITE)) {
  // One rename(2) with RENAME_EXCHANGE: the site path is never missing or half-written.
  run('mv', ['--exchange', '--no-target-directory', STAGING, SITE]);
  rmSync(PREV, { recursive: true, force: true });
  renameSync(STAGING, PREV);
} else {
  renameSync(STAGING, SITE);
}
console.log(`publish: live at ${SITE} (${version} ${commit}); previous release in ${PREV}`);
