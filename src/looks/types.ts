// A look: which picture a character has (stage 80, ADR 0169). One look gives
// both sizes: the portrait in the Character pane's frame and the round token
// on the map and in the Group pane. Pure TS.

/** A look as it is chosen and stored. */
export type LookRef =
  /** The engraved drawing for the race, subrace and sex (src/panes/portraits). */
  | { src: 'auto' }
  /** A library token (public/tokens, ADR 0170), e.g. `elf-f-noldor`. */
  | { src: 'lib'; id: string }
  /** One of the player's own images (stage 80 part D; account only). */
  | { src: 'own'; id: string };

export const AUTO: LookRef = Object.freeze({ src: 'auto' }) as LookRef;

/** Longest id kept in a look (library ids are far shorter; own image ids are random). */
export const LOOK_ID_MAX = 64;

export function isLookRef(v: unknown): v is LookRef {
  if (!v || typeof v !== 'object') return false;
  const o = v as { src?: unknown; id?: unknown };
  if (o.src === 'auto') return true;
  return (o.src === 'lib' || o.src === 'own') && typeof o.id === 'string' && o.id.length > 0 && o.id.length <= LOOK_ID_MAX;
}

/** A clean copy (no extra fields), or null for anything that is no look. */
export function lookRef(v: unknown): LookRef | null {
  if (!isLookRef(v)) return null;
  return v.src === 'auto' ? { src: 'auto' } : { src: v.src, id: v.id };
}

export const sameLook = (a: LookRef | null | undefined, b: LookRef | null | undefined): boolean =>
  !!a && !!b && a.src === b.src && (a.src === 'auto' || a.id === (b as { id: string }).id);

/** The key a character's look is kept under: the name in lower case, as MUME writes it. */
export const lookName = (name: string): string => name.trim().toLowerCase();
