// The film's type, the start page's (THIRD_PARTY_NOTICES.md; SIL OFL 1.1,
// the licences beside the files in public/fonts/): Cinzel for titles,
// Cormorant Garamond for the lines under them. Rendering waits until loaded.
import { continueRender, delayRender, staticFile } from 'remotion';

export const TITLE_FONT = "'Cinzel', serif";
export const TEXT_FONT = "'Cormorant Garamond', serif";

const FACES: [string, string, FontFaceDescriptors][] = [
  ['Cinzel', 'fonts/Cinzel-Bold-latin.woff2', { weight: '700' }],
  ['Cormorant Garamond', 'fonts/CormorantGaramond-Medium-latin.woff2', { weight: '500' }],
  ['Cormorant Garamond', 'fonts/CormorantGaramond-MediumItalic-latin.woff2', { weight: '500', style: 'italic' }],
];

if (typeof document !== 'undefined') {
  const handle = delayRender('fonts');
  Promise.all(
    FACES.map(async ([family, file, desc]) => {
      const face = new FontFace(family, `url(${staticFile(file)}) format('woff2')`, desc);
      document.fonts.add(await face.load());
    }),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => {
      console.error(err);
      continueRender(handle);
    });
}
