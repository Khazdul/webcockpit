// The e2e fakes of the cloud backend (tests/e2e/cloud-account-fake.ts,
// cloud-pub-fake.ts, community.ts, turnstile-stub.ts) for scripted browser
// runs: the screenshots of the community pages (scripts/screenshots.ts,
// the `discord3-*` shots). Nothing reaches a real backend: the fakes are
// Playwright routes on the page.
//
// The e2e files import without file extensions (Playwright's loader takes
// that, Node's does not), so they are bundled once with esbuild into
// node_modules/.cache/ (beside node_modules, so `@playwright/test`
// resolves from the bundle) and imported from there.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const ENTRY = `
export { FakeAccountServer, fakeAccountApi, seedAccount } from './tests/e2e/cloud-account-fake';
export { fakePubApi } from './tests/e2e/cloud-pub-fake';
export { setUp as communitySetUp, logIn as communityLogIn, SENDERS, ME } from './tests/e2e/community';
export { stubTurnstile } from './tests/e2e/turnstile-stub';
export { SKY } from './tests/e2e/account-pages';
`;

type Fakes = typeof import('../../tests/e2e/cloud-account-fake.ts') &
  typeof import('../../tests/e2e/cloud-pub-fake.ts') &
  typeof import('../../tests/e2e/turnstile-stub.ts') & {
    communitySetUp: (typeof import('../../tests/e2e/community.ts'))['setUp'];
    communityLogIn: (typeof import('../../tests/e2e/community.ts'))['logIn'];
    SENDERS: (typeof import('../../tests/e2e/community.ts'))['SENDERS'];
    ME: (typeof import('../../tests/e2e/community.ts'))['ME'];
    SKY: (typeof import('../../tests/e2e/account-pages.ts'))['SKY'];
  };

let loaded: Promise<Fakes> | null = null;

/** The fakes' modules, bundled on first use. */
export function cloudFakes(): Promise<Fakes> {
  return (loaded ??= (async () => {
    const dir = join(ROOT, 'node_modules', '.cache', 'webcockpit-shots');
    mkdirSync(dir, { recursive: true });
    const out = join(dir, 'cloud-fakes.mjs');
    await build({
      stdin: { contents: ENTRY, resolveDir: ROOT, loader: 'ts', sourcefile: 'cloud-fakes-entry.ts' },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      outfile: out,
      external: ['@playwright/test', 'playwright', 'playwright-core'],
      logLevel: 'error',
    });
    return (await import(`${pathToFileURL(out).href}?t=${Date.now()}`)) as Fakes;
  })());
}
