// Vitest writes each run's transformed modules to a directory of its own
// under the system's temp directory (about 40 MB here) and leaves it
// there. On this machine /tmp is a tmpfs: a few hundred runs filled it,
// and Playwright's Chromium, which keeps its shared memory there, began
// to crash (stage 55, 2026-11-13). This removes the run's directory when
// the run ends.
//
// `tmpDir` (the project's) and `_tmpDir` (the Vitest instance's) are not
// part of Vitest's documented API. If a later version names them
// otherwise this does nothing, and the leak is back: check /tmp after an
// upgrade.
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

export default function setup(project: unknown): () => void {
  return () => {
    const p = project as { tmpDir?: unknown; vitest?: { _tmpDir?: unknown } };
    for (const dir of [p.tmpDir, p.vitest?._tmpDir]) {
      // Only ever a direct child of the temp directory.
      if (typeof dir !== 'string' || dirname(resolve(dir)) !== resolve(tmpdir())) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  };
}
