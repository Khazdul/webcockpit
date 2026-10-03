// Loads the foreign import core (src/import, ADR 0073) on demand: a lazy
// chunk that nothing on the start-up path imports. Its own module so the
// unit tests can replace it.

import type { ImportFiles } from '../../import/types';

export async function loadImportFiles(): Promise<ImportFiles> {
  return (await import('../../import')).importFiles;
}
