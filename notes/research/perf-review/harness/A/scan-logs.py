# Scan the owner's Cockpit logs for colour-heavy output (SGR per line, runs per line).
#   python3 perf/scan-logs.py
import re, glob, os, collections
sgr = re.compile(r'\x1b\[([0-9;:]*)m')
for path in sorted(glob.glob('/home/ole/MUME/data/runs/*/*.log')):
    data = open(path, 'rb').read().decode('utf-8', 'replace').split('\n')
    n = 0; tot = 0; lines_with = 0; truecolor = 0; c256 = 0; maxsgr = 0; maxline = 0
    heavy = 0  # lines with >= 10 SGR
    heavy_blocks = []  # (start line, count) of consecutive heavy lines
    run_start = None; run_len = 0
    hist = collections.Counter()
    for i, l in enumerate(data):
        sp = l.find(' ')
        if sp < 0: continue
        rest = l[sp + 1:]
        if rest.startswith('> '): continue
        n += 1
        m = sgr.findall(rest)
        if len(m) >= 10:
            heavy += 1
            if run_start is None: run_start = i + 1; run_len = 0
            run_len += 1
        else:
            if run_start is not None and run_len >= 5: heavy_blocks.append((run_start, run_len))
            run_start = None
        if not m: continue
        lines_with += 1
        tot += len(m)
        if len(m) > maxsgr: maxsgr = len(m); maxline = i + 1
        for p in m:
            if '38;2' in p or '48;2' in p: truecolor += 1
            elif '38;5' in p or '48;5' in p: c256 += 1
            hist[p] += 1
    print(f"{os.path.relpath(path, '/home/ole/MUME/data/runs')}: lines {n}, with SGR {lines_with} ({100*lines_with/max(1,n):.1f}%), SGR {tot} ({tot/max(1,n):.2f}/line), >=10-SGR lines {heavy}, max {maxsgr} @L{maxline}, truecolor {truecolor}, 256c {c256}")
    print('   top SGR:', hist.most_common(8))
    if heavy_blocks: print('   blocks of >=5 consecutive >=10-SGR lines:', heavy_blocks[:10])
