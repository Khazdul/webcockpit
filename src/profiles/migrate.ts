// One-time clean-up of stored and imported profile text (ADR 0040).
//
// `_send <command>` was a helper from the terminal client: it echoed the
// command and sent it. WebCockpit echoes everything it sends and no longer
// knows `_send`, so an old profile would send the word itself to the game.
// The word is dropped wherever it starts a command.

/** `_send` at the start of a command: after a line start, `{` or `;`. */
const SEND = /(^|[{;\n])([ \t]*)_send[ \t]+/g;

/** `text` without the `_send` helper word; the same string when there is none. */
export function stripSend(text: string): string {
  return text.includes('_send') ? text.replace(SEND, '$1$2') : text;
}
