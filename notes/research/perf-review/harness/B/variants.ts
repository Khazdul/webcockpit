// Area B perf harness: the implementations the Node harnesses compare, as
// explicit copies, so results do not depend on what src/ holds:
//   base   the committed assembler, telnet parser (session) and engine (perf/base)
//   p1     + assembler: raw as one slice per stretch, SGR params without realloc
//   p12    + telnet: native indexOf scan for IAC / NUL in the data state
//   p123   + engine: one combined literal RegExp per rule list gates the per-rule checks
//   p1234  + text.partial once per inbound frame (a prompt with its GA never becomes one)
// perf/p1..p4 are written by perf/make-variants.py from a tree with all prototypes.

import type { Variant } from './pipeline';
import { LineAssembler as BaseAssembler } from './base/assembler';
import { Session as BaseSession } from './base/session';
import { ScriptEngine as BaseEngine } from './base/engine';
import { LineAssembler as P1Assembler } from './p1/assembler';
import { Session as P2Session } from './p2/session';
import { ScriptEngine as P3Engine } from './p3/engine';
import { LineAssembler as P4Assembler } from './p4/assembler';
import { Session as P4Session } from './p4/session';

export const VARIANTS: Variant[] = [
  { name: 'base', Assembler: BaseAssembler, Session: BaseSession as never, Engine: BaseEngine as never },
  { name: 'p1', Assembler: P1Assembler, Session: BaseSession as never, Engine: BaseEngine as never },
  { name: 'p12', Assembler: P1Assembler, Session: P2Session as never, Engine: BaseEngine as never },
  { name: 'p123', Assembler: P1Assembler, Session: P2Session as never, Engine: P3Engine as never },
  { name: 'p1234', Assembler: P4Assembler, Session: P4Session as never, Engine: P3Engine as never },
];

export function variant(name: string | undefined): Variant {
  const v = VARIANTS.find((x) => x.name === (name ?? 'base'));
  if (!v) throw new Error(`unknown variant ${name}; one of ${VARIANTS.map((x) => x.name).join(', ')}`);
  return v;
}
