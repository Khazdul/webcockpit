// The caller's address as a key (spec §7.10): of the rate limits and,
// hashed, of the registration counters. Never stored or logged.
//
// One IPv6 customer usually holds a whole /64 (2^64 addresses), so an IPv6
// address counts as its /64 prefix; an IPv4 address as itself, also when
// it arrives IPv4-mapped (`::ffff:192.0.2.1`). Anything that is not an
// address is the one key `unknown`.

export const UNKNOWN_ADDRESS = 'unknown';

function ipv4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255) return null;
    out.push(Number(p));
  }
  return out;
}

/** The eight 16-bit groups of an IPv6 address, or null. */
function ipv6(s: string): number[] | null {
  let text = s;
  // A dotted IPv4 tail is the last two groups.
  const tail = text.lastIndexOf(':');
  if (text.includes('.')) {
    const v4 = ipv4(text.slice(tail + 1));
    if (!v4) return null;
    text = `${text.slice(0, tail + 1)}${((v4[0]! << 8) | v4[1]!).toString(16)}:${((v4[2]! << 8) | v4[3]!).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(Number.parseInt(g, 16));
    }
    return out;
  };
  const head = groups(halves[0]!);
  const rest = halves.length === 2 ? groups(halves[1]!) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const gap = 8 - head.length - rest.length;
  return gap >= 1 ? [...head, ...new Array<number>(gap).fill(0), ...rest] : null;
}

/**
 * The key an address counts under: the IPv4 address in its plain form,
 * the /64 of an IPv6 address (`2001:db8:0:1::/64`), or `unknown`.
 */
export function addressKey(address: string | null | undefined): string {
  let s = (address ?? '').trim();
  if (s.length === 0 || s.length > 64) return UNKNOWN_ADDRESS;
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  const v4 = ipv4(s);
  if (v4) return v4.join('.');
  if (!s.includes(':')) return UNKNOWN_ADDRESS;
  const g = ipv6(s);
  if (!g) return UNKNOWN_ADDRESS;
  // IPv4-mapped (::ffff:a.b.c.d): the IPv4 address it stands for.
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  return `${g
    .slice(0, 4)
    .map((x) => x.toString(16))
    .join(':')}::/64`;
}
