// Stage 60 part B (spec §7.2, ADR 0145): the account's client core
// (src/cloud/account) in the real browsers against the fake of the account
// API (cloud-account-fake.ts; the run is cloud-account.ts). The phone:
// phone-cloud-account.spec.ts. The pages come after; their specs use the
// same fake.
import { test } from '@playwright/test';
import { accountLife, accountsOff } from './cloud-account';

test('an account\'s life through the module: register, log out, log in, change password, recover, delete', async ({ page }, info) => {
  const run = await accountLife(page);
  const line = `account flows [${info.project.name}]: the register flow's KDF in the worker took ${run.kdfMs} ms`;
  info.annotations.push({ type: 'kdf-timing', description: line });
  console.log(line);
});

test('with the flag off, and in an automated browser without the hook, nothing is sent and nothing is stored', async ({ page }) => {
  await accountsOff(page);
});
