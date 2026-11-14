// Stage 60 part B (spec §7.2) on a phone: the same run as
// cloud-account.spec.ts (cloud-account.ts) in the phone project's browser.
import { test } from '@playwright/test';
import { accountLife } from './cloud-account';

test('phone: an account\'s life through the module', async ({ page }, info) => {
  const run = await accountLife(page);
  const line = `account flows [${info.project.name}]: the register flow's KDF in the worker took ${run.kdfMs} ms`;
  info.annotations.push({ type: 'kdf-timing', description: line });
  console.log(line);
});
