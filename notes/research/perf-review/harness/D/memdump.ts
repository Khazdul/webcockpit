// Chromium memory-infra dump over CDP (perf review D): what the renderer's
// resident memory is made of (blink_gc = Oilpan/DOM, partition_alloc, v8,
// malloc, cc, font_caches …). Used by perf/soak.ts (--memdump).

import type { CDPSession } from '@playwright/test';

export interface MemDump {
  /** Per process (by name): resident bytes and top-level allocator sizes (bytes). */
  processes: Record<string, { pid: number; resident: number | null; allocators: Record<string, number> }>;
}

export async function memoryDump(cdp: CDPSession): Promise<MemDump | { error: string }> {
  try {
    const done = new Promise<string>((resolve) => {
      cdp.once('Tracing.tracingComplete', (e: { stream?: string }) => resolve(e.stream ?? ''));
    });
    await cdp.send('Tracing.start', {
      transferMode: 'ReturnAsStream',
      traceConfig: {
        recordMode: 'recordAsMuchAsPossible',
        includedCategories: ['disabled-by-default-memory-infra'],
        excludedCategories: ['*'],
        memoryDumpConfig: { triggers: [] },
      },
    } as never);
    await cdp.send('Tracing.requestMemoryDump', { deterministic: true, levelOfDetail: 'detailed' } as never);
    await cdp.send('Tracing.end');
    const stream = await done;
    let data = '';
    for (;;) {
      const r = (await cdp.send('IO.read', { handle: stream, size: 1 << 20 } as never)) as { data: string; eof: boolean; base64Encoded?: boolean };
      data += r.base64Encoded ? Buffer.from(r.data, 'base64').toString('utf8') : r.data;
      if (r.eof) break;
    }
    await cdp.send('IO.close', { handle: stream } as never);
    const json = JSON.parse(data) as { traceEvents?: any[] } | any[];
    const events: any[] = Array.isArray(json) ? json : (json.traceEvents ?? []);
    const names = new Map<number, string>();
    for (const e of events) if (e.ph === 'M' && e.name === 'process_name') names.set(e.pid, e.args?.name ?? String(e.pid));
    const out: MemDump = { processes: {} };
    for (const e of events) {
      if (e.ph !== 'v' || !e.args?.dumps) continue;
      const d = e.args.dumps;
      const name = `${names.get(e.pid) ?? 'pid'}#${e.pid}`;
      const allocators: Record<string, number> = {};
      for (const [k, v] of Object.entries<any>(d.allocators ?? {})) {
        const size = v?.attrs?.size?.value;
        if (size === undefined) continue;
        // Top level and one level below for the big ones.
        const depth = k.split('/').length;
        if (depth === 1 || (depth === 2 && /^(blink_gc|partition_alloc|v8|malloc|cc|gpu)\//.test(k))) allocators[k] = parseInt(size, 16);
      }
      const rss = d.process_totals?.resident_set_bytes;
      out.processes[name] = { pid: e.pid, resident: rss ? parseInt(rss, 16) : null, allocators };
    }
    return out;
  } catch (err) {
    return { error: String(err) };
  }
}
