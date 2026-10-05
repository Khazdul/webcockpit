// Bundled scripts (ADR 0051 "Storage and files"): every `.lua` file in
// `src/scripts/bundled/` ships in the build, read-only, updated with each
// release. The name is the header's `@name`, else the file name.

import { parseHeader } from './header';

export interface BundledScript {
  name: string;
  source: string;
}

const FILES = import.meta.glob<string>('./bundled/*.lua', { query: '?raw', import: 'default', eager: true });

/** The bundled scripts, in file order. */
export const BUNDLED_SCRIPTS: readonly BundledScript[] = Object.entries(FILES).map(([path, source]) => ({
  name: parseHeader(source).header.name ?? path.replace(/^.*\//, '').replace(/\.lua$/, ''),
  source,
}));

/**
 * Bundled scripts a new user starts with enabled (ADR 0078): the pane bar
 * and Map search (whose pane starts off). Applied once per install by
 * `ScriptLibrary.enableForNewUser`.
 */
export const NEW_USER_SCRIPTS: readonly string[] = ['panebar', 'mapsearch'];
