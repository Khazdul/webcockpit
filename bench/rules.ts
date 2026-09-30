// A synthetic 500-rule profile for the spec §1.3 "500 user rules" budget,
// built from the words of a real session so that some rules match and most
// do not, as in a real profile. Deterministic (seeded).
//
// Mix: 250 actions (anchored and unanchored, with %N captures, bodies that
// set a variable), 125 substitutes (colour codes around %0) and 125
// highlights (colour names). Also an alias and a macro for the key → send
// measurement.

export const RULE_COUNT = 500;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const safe = (w: string) => /^[A-Za-z][A-Za-z'-]{2,}$/.test(w);

export function makeRuleProfile(lines: readonly string[], n = RULE_COUNT): string {
  const rand = rng(42);
  const pool: string[][] = [];
  for (const l of lines) {
    const words = l.split(/\s+/).filter(safe);
    if (words.length >= 3) pool.push(words);
  }
  if (pool.length === 0) pool.push(['nothing', 'will', 'match', 'here']);
  const pick = (): string[] => pool[Math.floor(rand() * pool.length)]!;
  const pair = (): string => {
    const w = pick();
    const i = Math.floor(rand() * (w.length - 1));
    return `${w[i]} ${w[i + 1]}`;
  };
  const out: string[] = ['#nop Benchmark profile (bench/rules.ts).'];
  const nA = Math.round(n / 2);
  const nS = Math.round(n / 4);
  const nH = n - nA - nS;
  for (let i = 0; i < nA; i++) {
    const w = pick();
    const k = Math.floor(rand() * (w.length - 1));
    const lit = `${w[k]} ${w[k + 1]}`;
    const shape = i % 4;
    const pat = shape === 0 ? `^%1 ${lit}%2$` : shape === 1 ? `^${w[0]} %1` : shape === 2 ? `${lit}` : `%1 ${lit} %2`;
    out.push(`#action {${pat}} {#variable {hit${i % 10}} {%1}}`);
  }
  for (let i = 0; i < nS; i++) out.push(`#substitute {${pair()}} {<Fff8800>%0<099>} {5}`);
  const colours = ['Cyan', 'green', 'red', 'Magenta', 'yellow', 'b blue'];
  for (let i = 0; i < nH; i++) out.push(`#highlight {${pair()}} {${colours[i % colours.length]}} {5}`);
  out.push('#variable {target} {*orc*}');
  out.push('#alias {bb} {bash $target}');
  out.push('#macro {F5} {bb}');
  return out.join('\n') + '\n';
}
