// A check, not part of the film (ADR 0133 addendum): one recording shown
// full size, so a still of it can be compared with the frame that went in
// (does OffthreadVideo decode an intermediate format with the right colours?).
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';

export function DecodeTest({ file }: { file: string }) {
  return (
    <AbsoluteFill>
      <OffthreadVideo src={staticFile(`recordings/${file}`)} muted style={{ width: '100%', height: '100%' }} />
    </AbsoluteFill>
  );
}
