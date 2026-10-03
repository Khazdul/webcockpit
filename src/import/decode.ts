// Bytes → text for foreign profile import (ADR 0073 "Input and decoding").
//
// - A UTF-8 BOM is stripped; a UTF-16 BOM (JMC 3.7 can write one) decodes
//   as UTF-16.
// - Otherwise strict UTF-8; when that fails, windows-1251 if the text
//   looks Cyrillic (more than a third of the high bytes in 0xC0–0xFF and
//   at least one all-Cyrillic word), else windows-1252.
// - CRLF and lone CR become LF; the text is normalised to NFC.

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1251' | 'windows-1252';

export interface Decoded {
  text: string;
  encoding: TextEncodingName;
}

function decodeWith(enc: TextEncodingName, bytes: Uint8Array, fatal = false): string {
  return new TextDecoder(enc, { fatal }).decode(bytes);
}

/** All-Cyrillic word of three or more letters. */
const CYRILLIC_WORD = /(?<![\p{L}])[Ѐ-ӿ]{3,}(?![\p{L}])/u;

/** True when single-byte `bytes` look like windows-1251 Russian text. */
export function looksCyrillic(bytes: Uint8Array): boolean {
  let high = 0;
  let letters = 0;
  for (const b of bytes) {
    if (b < 0x80) continue;
    high++;
    if (b >= 0xc0) letters++;
  }
  if (high === 0 || letters * 3 <= high) return false;
  return CYRILLIC_WORD.test(decodeWith('windows-1251', bytes));
}

/** Decodes a settings file (see the file header). Never throws. */
export function decodeBytes(bytes: Uint8Array): Decoded {
  let enc: TextEncodingName;
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    enc = 'utf-8';
    text = decodeWith('utf-8', bytes.subarray(3));
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    enc = 'utf-16le';
    text = decodeWith('utf-16le', bytes.subarray(2));
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    enc = 'utf-16be';
    text = decodeWith('utf-16be', bytes.subarray(2));
  } else {
    try {
      text = decodeWith('utf-8', bytes, true);
      enc = 'utf-8';
    } catch {
      enc = looksCyrillic(bytes) ? 'windows-1251' : 'windows-1252';
      text = decodeWith(enc, bytes);
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  text = text.replace(/\r\n?/g, '\n').normalize('NFC');
  return { text, encoding: enc };
}
