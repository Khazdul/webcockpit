// The music's beat grid (video/manuscript.md, confirmed by the owner's ear):
// "Sunset Plains" at 81 bpm, beat n at 0.4248 + n × 60/81 s, bars starting
// on n ≡ 3 (mod 4). Plain TypeScript, no imports: the compositions and the
// scene scripts (record/scenes/) both time things by it.

export const BPM = 81;
/** One beat, s. */
export const BEAT_S = 60 / BPM;
/** Beat 0, s into the music. */
export const BEAT0_S = 0.4248;

/** Beat `n`, s into the music. */
export const beatS = (n: number): number => BEAT0_S + n * BEAT_S;

/** True on a bar's first beat. */
export const isDownbeat = (n: number): boolean => (((n - 3) % 4) + 4) % 4 === 0;

/** Beat `n` as a frame at `fps` (default 60). */
export const beat = (n: number, fps = 60): number => Math.round(beatS(n) * fps);
