# Frame-size statistics of a Cockpit log, grouped like logToFrames at speed 1
# (a new frame when the gap to the previous inbound line is >= 1 ms).
#   python3 perf/frames-stats.py [log]
import re, sys, collections
path = sys.argv[1] if len(sys.argv) > 1 else '/home/ole/MUME/data/runs/Rasta/2026-09-18T18-11-42.log'
sgr = re.compile(r'\x1b\[[0-9;:]*m')
frames = []  # (first line no, n lines, n sgr, bytes)
last = -1; cur = None
for i, l in enumerate(open(path, 'rb').read().decode('utf-8', 'replace').split('\n')):
    if len(l) < 17 or l[16] != ' ' or not l[:16].isdigit(): continue
    body = l[17:]
    if body.startswith('> '): continue
    ts = int(l[:16])
    if cur is None or ts - last >= 1000:
        if cur: frames.append(cur)
        cur = [i + 1, 0, 0, 0]
    cur[1] += 1; cur[2] += len(sgr.findall(body)); cur[3] += len(body) + 2
    last = ts
if cur: frames.append(cur)
ns = sorted(f[1] for f in frames)
def pct(p): return ns[min(len(ns) - 1, int(p / 100 * len(ns)))]
print(f'{path}: {len(frames)} frames; lines per frame median {pct(50)}, p90 {pct(90)}, p99 {pct(99)}, max {ns[-1]}')
hist = collections.Counter(min(n, 60) // 5 * 5 for n in ns)
print('histogram (lines, bucket of 5; 60 = 60+):', sorted(hist.items()))
big = sorted(frames, key=lambda f: -f[1])[:15]
print('biggest frames (line, lines, sgr, bytes):', big)
