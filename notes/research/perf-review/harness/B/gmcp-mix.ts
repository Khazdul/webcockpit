// Interleaves the GMCP records of `gmcpLog` after every `every` lines of
// `logText` (looping), at the timestamp of the line before.
export function withGmcp(logText: string, gmcpLog: string, every: number): { text: string; gmcp: number } {
  const recs = gmcpLog.split('\n').filter((l) => /^\d+ \x1bGMCP /.test(l));
  const out: string[] = [];
  let k = 0;
  let n = 0;
  for (const l of logText.split('\n')) {
    out.push(l);
    if (++n % every !== 0) continue;
    const sp = l.indexOf(' ');
    if (sp <= 0) continue;
    const g = recs[k++ % recs.length]!;
    out.push(l.slice(0, sp) + g.slice(g.indexOf(' ')));
  }
  return { text: out.join('\n'), gmcp: k };
}
