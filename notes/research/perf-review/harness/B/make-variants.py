# Area B perf harness: writes the per-stage prototype copies the Node A/B
# uses (perf/p1..p4), from the committed copies (perf/base) and the working
# tree that holds all four prototypes (exp-all-cumulative.patch applied):
#   p1: assembler (raw as one slice per stretch, SGR params without realloc)
#   p2: telnet (native IAC/NUL scan), with its own session copy
#   p3: engine (literal gate)
#   p4: assembler + telnet with the per-frame partial (endFrame)
# Run from the repo root: python3 perf/make-variants.py
import os

def fix_asm(t):
    return t.replace("from '../core/bus'", "from '../../src/core/bus'").replace("from '../core/types'", "from '../../src/core/types'")

def fix_tel(t):
    return t.replace("from './textsink'", "from '../../src/net/textsink'")

ENG = {
    "'../../core/bus'": "'../../src/core/bus'",
    "'../../core/types'": "'../../src/core/types'",
    "'../commands'": "'../../src/script/commands'",
    "'../doc'": "'../../src/script/doc'",
    "'./color'": "'../../src/script/engine/color'",
    "'./expr'": "'../../src/script/engine/expr'",
    "'./format'": "'../../src/script/engine/format'",
    "'./pattern'": "'../../src/script/engine/pattern'",
    "'./report'": "'../../src/script/engine/report'",
    "'./runs'": "'../../src/script/engine/runs'",
    "'./store'": "'../../src/script/engine/store'",
    "'./timers'": "'../../src/script/engine/timers'",
    "'./text'": "'../../src/script/engine/text'",
}

def fix_eng(t):
    for k, v in ENG.items():
        t = t.replace('from ' + k, 'from ' + v)
    return t

for d in ('p1', 'p2', 'p3', 'p4'):
    os.makedirs('perf/' + d, exist_ok=True)

asm = open('src/text/assembler.ts').read()
assert 'endFrame(ts: number)' in asm, 'expected the working tree with all prototypes'
# P1 alone: text() emits the partial itself (no endFrame).
p1 = asm.replace(
    """    this.process(s, ts, false);
  }

  /**
   * End of an inbound frame: the pending tail, if it changed, becomes the
   * partial. A prompt whose GA is in the same frame never becomes one.
   */
  endFrame(ts: number): void {
    if (this.textLen > 0""",
    """    this.process(s, ts, false);
    if (this.textLen > 0""",
)
assert p1 != asm
open('perf/p1/assembler.ts', 'w').write(fix_asm(p1))
open('perf/p4/assembler.ts', 'w').write(fix_asm(asm))

tel = open('src/net/telnet.ts').read()
assert 'this.o.sink.endFrame?.(ts);' in tel
open('perf/p4/telnet.ts', 'w').write(fix_tel(tel))
open('perf/p2/telnet.ts', 'w').write(fix_tel(tel.replace('    this.o.sink.endFrame?.(ts);\n', '')))

open('perf/p3/engine.ts', 'w').write(fix_eng(open('src/script/engine/engine.ts').read()))

sess = open('perf/base/session.ts').read()  # imports ./telnet (the copy next to it)
open('perf/p2/session.ts', 'w').write(sess)
open('perf/p4/session.ts', 'w').write(sess)
print('wrote perf/p1..p4')
