// Stage 60 (spec §7.3) on a phone: the same run as cloud-crypto.spec.ts
// (cloud-crypto.ts) in the phone project's browser.
import { test } from '@playwright/test';
import { kdfThroughWorker, timingLine } from './cloud-crypto';

test('phone: the KDF runs in a worker and gives the vector\'s keys', async ({ page }, info) => {
  const run = await kdfThroughWorker(page);
  const line = timingLine(info.project.name, run);
  info.annotations.push({ type: 'kdf-timing', description: line });
  console.log(line);
});
