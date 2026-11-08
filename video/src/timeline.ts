// A recording's timeline (public/recordings/<scene>.json, written by
// record/lib/timeline.ts) as the compositions use it.
import { staticFile } from 'remotion';
import type { Box, Marker, TimelineFile } from '../record/lib/timeline.ts';

export type { Box, Marker, TimelineFile };

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export async function loadTimeline(scene: string): Promise<TimelineFile> {
  const res = await fetch(staticFile(`recordings/${scene}.json`));
  if (!res.ok) throw new Error(`no timeline for ${scene}: run \`npm run record -- ${scene}\` first`);
  return (await res.json()) as TimelineFile;
}

/** The first marker of `kind` (and `label`, if given). */
export function marker(tl: TimelineFile, kind: string, label?: string): Marker {
  const m = tl.markers.find((x) => x.kind === kind && (label === undefined || x.label === label));
  if (!m) throw new Error(`${tl.scene}: no marker ${kind}${label ? ` "${label}"` : ''}`);
  return m;
}

/** Seconds → composition frames. */
export const f = (s: number): number => Math.round(s * FPS);
