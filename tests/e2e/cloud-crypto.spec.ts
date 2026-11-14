// Stage 60 (spec §7.3, §7.0 rule 1): the password KDF in the real Web
// Worker at 600 000 rounds, against the vectors (cloud-crypto.ts). The
// phone: phone-cloud-crypto.spec.ts.
import { test } from '@playwright/test';
import { kdfThroughWorker, timingLine } from './cloud-crypto';

test('the KDF runs in a worker: the vector\'s authKey, a kek that crosses to the page, a page that stays responsive', async ({ page }, info) => {
  const run = await kdfThroughWorker(page);
  const line = timingLine(info.project.name, run);
  info.annotations.push({ type: 'kdf-timing', description: line });
  console.log(line);
});
