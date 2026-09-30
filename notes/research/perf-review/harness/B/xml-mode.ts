// Area B perf harness: a Cockpit log (ANSI only; Cockpit never used MUME's
// XML mode) turned into what WebCockpit receives live, where the GMCP
// handshake turns XML mode on (src/net/gmcp.ts `MUME.Client.XML`), per
// notes/research/mume-xml.md: `<xml>` first; `& < > ' "` escaped as
// entities; prompts in `<prompt>` (then IAC GA); comm lines in
// `<narrate>` / `<tell>` / `<say>` / `<yell>`; a green room-name line opens
// `<room><name>…</name>` and the `Exits:` line closes
// `<exits>…</exits></room>` (an approximation of MUME's room block).
//
// Frames are grouped as the replay does at speed 1 (lines < 1 ms apart in
// one frame, at most 16 KB).

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const COMM: Array<[RegExp, string]> = [
  [/ narrates '/, 'narrate'],
  [/ tells you '|^You tell /, 'tell'],
  [/ says '|^You say '/, 'say'],
  [/ yells '| shouts '/, 'yell'],
];

function isPromptLike(visible: string): boolean {
  const t = visible.trim();
  return t.length > 0 && t.length < 80 && t.charCodeAt(t.length - 1) === 62 && !t.startsWith('> ');
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');

export function xmlFrames(logText: string): Uint8Array[] {
  const enc = new TextEncoder();
  const frames: Uint8Array[] = [];
  let parts: Uint8Array[] = [];
  let size = 0;
  let lastTs = -1;
  let first = true;
  let inRoom = false;
  const flush = (): void => {
    if (size === 0) return;
    const f = new Uint8Array(size);
    let o = 0;
    for (const p of parts) {
      f.set(p, o);
      o += p.length;
    }
    frames.push(f);
    parts = [];
    size = 0;
  };
  for (const raw of logText.split('\n')) {
    const sp = raw.indexOf(' ');
    if (sp !== 16) continue;
    const ts = Number(raw.slice(0, 16));
    let body = raw.slice(17);
    if (body.endsWith('\r')) body = body.slice(0, -1);
    if (body.startsWith('> ') || (body.charCodeAt(0) === 27 && /^\x1b[A-Z]/.test(body))) continue;
    if (size > 0 && (size >= 16384 || (lastTs >= 0 && ts - lastTs >= 1000))) flush();
    lastTs = ts;
    const visible = body.replace(ANSI, '');
    const prompt = isPromptLike(visible);
    let x = esc(body);
    if (prompt) x = `<prompt>${x}</prompt>`;
    else if (/^\x1b\[32m[^\x1b]+\x1b\[0m$/.test(body) && visible.length < 60) {
      x = `${inRoom ? '</room>' : ''}<room><name>${x}</name>`;
      inRoom = true;
    } else if (inRoom && visible.startsWith('Exits:')) {
      x = `<exits>${x}</exits></room>`;
      inRoom = false;
    } else {
      for (const [re, tag] of COMM) {
        if (re.test(visible)) {
          x = `<${tag}>${x}</${tag}>`;
          break;
        }
      }
    }
    if (first) {
      x = '<xml>' + x;
      first = false;
    }
    const b = enc.encode(x);
    parts.push(b, prompt ? Uint8Array.of(255, 249) : Uint8Array.of(13, 10));
    size += b.length + 2;
  }
  flush();
  return frames;
}

/** Frames as one base64 string plus lengths (to hand them to a page). */
export function packFrames(frames: Uint8Array[]): { b64: string; lens: number[] } {
  let n = 0;
  for (const f of frames) n += f.length;
  const all = new Uint8Array(n);
  let o = 0;
  for (const f of frames) {
    all.set(f, o);
    o += f.length;
  }
  return { b64: Buffer.from(all).toString('base64'), lens: frames.map((f) => f.length) };
}
